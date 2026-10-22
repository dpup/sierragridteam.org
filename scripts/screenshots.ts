/**
 * Deterministic screenshots for visual QA + regression. Captures every page at
 * three viewports with:
 *   - a FROZEN clock (stable LocalClock + "Synced" stamps),
 *   - MOCKED data.sierragridteam.org responses (stable data states),
 *   - the REAL OpenFreeMap basemap, fetched once and cached in .cache/basemap/,
 *   - DISABLED animations + reduced motion,
 * so the PNGs are byte-stable and safe to diff or analyze.
 *
 * Requires the built site served at BASE_URL (default http://localhost:4321). The build
 * bakes NO feed data — every page renders client-side from the mocked responses here:
 *   npm run build && npm run preview & npm run screenshots
 * Optional: SCENARIO=redflag to render the alarm state.
 */
import { chromium, type Route } from 'playwright';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { inMoat, startMoatRelay } from './moat-relay.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const SCENARIO = process.env.SCENARIO ?? 'calm';
const FIXED = new Date('2026-06-25T13:30:00-07:00'); // 13:30 PT, stable

// LIVE=1 renders against the REAL data.sierragridteam.org feed + OpenFreeMap basemap instead of the
// frozen/mocked defaults — for eyeballing the live page, not regression (it's not
// deterministic). Inside Moat it tunnels through the auth-injecting relay (the headless
// browser can't use the Moat proxy directly); elsewhere it goes direct. Output lands in a
// separate, git-ignored dir so it never clobbers the committed deterministic set.
//
// Best-effort, IN-SANDBOX ONLY: the Moat proxy MITMs TLS and reframes upstream responses
// (keep-alive, no Content-Length), which makes /live's burst of ~12 parallel fetches flaky
// — it may stall past the page's 9s timeout and fall to the honest "Last known" fallback,
// and the keyless OpenFreeMap basemap may not finish. The home page (2 fetches) is reliably live.
// None of this affects production, where browsers hit data.sierragridteam.org directly.
const LIVE = process.env.LIVE === '1';
const OUT = resolve(root, LIVE ? 'tests/screenshots/_live' : 'tests/screenshots');

const allViewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'w1000', width: 1000, height: 900 },
  { name: 'w880', width: 880, height: 1000 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
];
// LIVE mode loads the real OpenFreeMap basemap per /live capture; keep it to two viewports
// so the run stays quick.
const viewports = LIVE
  ? allViewports.filter((v) => v.name === 'desktop' || v.name === 'mobile')
  : allViewports;

/** Pages with a MapLibre canvas — they need the extra settle waits below. */
const MAP_PAGES = new Set(['/live', '/mesh']);

const allPages = [
  { name: 'home', path: '/' },
  { name: 'mesh', path: '/mesh' },
  { name: 'blog', path: '/blog' },
  { name: 'blog-archive', path: '/blog/archive' },
  { name: 'blog-post', path: '/blog/2026-07-03-what-this-blog-is-for' },
  { name: 'live', path: '/live' },
  { name: 'contact', path: '/contact' },
  { name: 'contact-thanks', path: '/contact/thanks' },
  { name: 'about', path: '/about' },
  { name: 'partners', path: '/partners' },
  { name: 'about-jay', path: '/about/jay' },
  { name: 'about-corrinne', path: '/about/corrinne' },
  { name: 'about-allan', path: '/about/allan' },
  { name: 'about-dan', path: '/about/dan' },
  { name: 'donate', path: '/donate' },
  { name: 'colophon', path: '/colophon' },
  { name: 'notfound', path: '/this-route-does-not-exist' },
];
// LIVE mode only cares about the data-driven pages (home tiles/banner, the live feed, and
// the mesh map — /mesh renders every count and every edge from the feed, so a change to what
// we ask The Grid for is invisible in the mocked set and only shows up here).
const LIVE_PATHS = new Set(['/', '/live', '/mesh']);
const pages = LIVE ? allPages.filter((p) => LIVE_PATHS.has(p.path)) : allPages;

const snapshot = JSON.parse(readFileSync(resolve(root, 'src/data/grid-snapshot.json'), 'utf8'));
const hazards = JSON.parse(readFileSync(resolve(root, 'src/data/hazards-snapshot.json'), 'utf8'));
const meshSnap = JSON.parse(readFileSync(resolve(root, 'src/data/mesh-snapshot.json'), 'utf8'));

/*
 * The mesh fixture is a real capture, so its reception timestamps are whenever `make
 * snapshot` last ran — against the frozen clock every link would age into the "cold" tier
 * and the recency encoding would never be exercised. Shift every stamp by the constant
 * offset between the capture and FIXED, which preserves the real relative ages (and so the
 * real spread across live/recent/fading/cold) while staying byte-stable run to run.
 */
const MESH_SHIFT_MS =
  FIXED.getTime() - Date.parse(meshSnap.link?.metadata?.generatedAt ?? meshSnap.fetchedAt);
const shiftStamp = (v: unknown) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)
    ? new Date(Date.parse(v) + MESH_SHIFT_MS).toISOString().replace(/\.\d{3}Z$/, 'Z')
    : v;
const rebaseMesh = (fc: unknown): unknown =>
  JSON.parse(JSON.stringify(fc), (k, v) =>
    ['generatedAt', 'updatedAt', 'firstSeen', 'lastSeen'].includes(k) ? shiftStamp(v) : v
  );
const meshLayers: Record<string, unknown> = {
  mesh_node: rebaseMesh(meshSnap.node),
  mesh_link: rebaseMesh(meshSnap.link),
};

/*
 * The basemap. The headless browser can't reach tile hosts through the auth proxy, so this
 * process fetches OpenFreeMap on its behalf and keeps every response in a git-ignored cache
 * (.cache/basemap/) — a review of the map is worthless without its roads and towns, and the
 * cache keeps reruns byte-stable (OpenFreeMap rebuilds weekly; delete the cache to pick that
 * up). With no network and no cache, it falls back to OFFLINE_STYLE: the maps still load and
 * their overlays still render, on plain parchment.
 */
const BASEMAP_CACHE = resolve(root, '.cache/basemap');
let basemapOnline = true;
async function basemap(route: Route) {
  const url = route.request().url();
  const file = resolve(BASEMAP_CACHE, createHash('sha1').update(url).digest('hex'));
  let hit: { status: number; type: string; body: Buffer } | null = null;
  if (existsSync(file)) {
    const meta = JSON.parse(readFileSync(`${file}.json`, 'utf8'));
    hit = { ...meta, body: readFileSync(file) };
  } else if (basemapOnline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      hit = {
        status: res.status,
        type: res.headers.get('content-type') ?? 'application/octet-stream',
        body: Buffer.from(await res.arrayBuffer()),
      };
      if (res.ok) {
        mkdirSync(BASEMAP_CACHE, { recursive: true });
        writeFileSync(file, hit.body);
        writeFileSync(`${file}.json`, JSON.stringify({ status: hit.status, type: hit.type }));
      }
    } catch {
      basemapOnline = false; // stop waiting on every tile; the stub takes over below
    }
  }
  if (hit) {
    return route.fulfill({
      status: hit.status,
      contentType: hit.type,
      headers: { 'access-control-allow-origin': '*' },
      body: hit.body,
    });
  }
  if (/\/styles\//.test(url)) {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(OFFLINE_STYLE),
    });
  }
  return route.abort();
}

// The stub basemap for when OpenFreeMap is unreachable and nothing is cached: the MapLibre
// map's `load` still fires, and the hazard and mesh overlays render on plain parchment.
const OFFLINE_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#efe7d6' } }],
};

// The "redflag" alarm scenario: a realistic fire-season foothill event. Weather alerts now
// flow through the `weather_alert` hazard map layer (GeoJSON), so we inject a Red Flag
// Warning + a co-occurring High Wind Warning as features; that drives the home/live "Active
// Alerts" tile, plus fireWeather.state = RED_FLAG (FR-3) escalates the Fire Weather tile to
// orange.
const redflagWeatherAlerts = [
  {
    type: 'Feature',
    geometry: null,
    properties: {
      id: 'urn:test:redflag',
      layer: 'weather_alert',
      kind: 'Weather alert',
      severity: 'SEVERE',
      severityRank: 3,
      headline: 'Red Flag Warning in effect from 11 AM to 8 PM PDT',
      description:
        'Gusty north winds and single-digit humidity will create critical fire weather ' +
        'conditions across the Mother Lode and Sierra foothills. Any fire that develops will ' +
        'likely spread rapidly.',
      status: 'active',
      source: { id: 'nws', name: 'National Weather Service' },
      weather: { event: 'Red Flag Warning', source: 'NWS', zones: ['CAZ069'] },
    },
  },
  {
    type: 'Feature',
    geometry: null,
    properties: {
      id: 'urn:test:wind',
      layer: 'weather_alert',
      kind: 'Weather alert',
      severity: 'MODERATE',
      severityRank: 2,
      headline: 'High Wind Warning in effect until 8 PM PDT',
      description:
        'North winds 25 to 35 mph with gusts up to 60 mph expected across the Motherlode and ' +
        'Northeast Foothills. Strong winds could blow down trees and power lines.',
      status: 'active',
      source: { id: 'nws', name: 'National Weather Service' },
      weather: { event: 'High Wind Warning', source: 'NWS', zones: ['CAZ067'] },
    },
  },
];

/**
 * A red-flag day is when PG&E escalates a PSPS Watch to a Warning, which is what puts the
 * power shutoff in the site-wide banner. Upgrade the fixture's real Watch in place (its own
 * geometry and counts) rather than inventing a second event.
 */
const redflagPower = (layer: { features?: { properties: Record<string, unknown> }[] }) => ({
  ...layer,
  features: (layer.features ?? []).map((f) =>
    f.properties.category === 'psps'
      ? {
          ...f,
          properties: {
            ...f.properties,
            headline: String(f.properties.headline).replace('PSPS Watch', 'PSPS Warning'),
            power: { ...(f.properties.power as object), stage: 'Warning' },
          },
        }
      : f
  ),
});

/**
 * Shift an archived series onto the frozen clock, the same way `rebaseMesh` shifts the
 * topology layers. Without it every capture would draw a chart whose data ended days before
 * the page's "now" — an honest empty plot, and a useless screenshot.
 */
function rebaseTelemetry(res: unknown) {
  if (!res || typeof res !== 'object') return { samples: [] };
  const shift = (iso?: string | null) =>
    iso ? new Date(Date.parse(iso) + MESH_SHIFT_MS).toISOString() : iso;
  const r = res as {
    coverage?: { from?: string; to?: string };
    reboots?: string[];
    samples?: { reading?: { reportedAt?: string }; receivedAt?: string }[];
  };
  return {
    ...r,
    coverage: r.coverage && {
      ...r.coverage,
      from: shift(r.coverage.from),
      to: shift(r.coverage.to),
    },
    reboots: (r.reboots ?? []).map((t) => shift(t)),
    samples: (r.samples ?? []).map((s) => ({
      ...s,
      receivedAt: shift(s.receivedAt),
      reading: s.reading && { ...s.reading, reportedAt: shift(s.reading.reportedAt) },
    })),
  };
}

function mockGrid(route: Route) {
  const url = route.request().url();
  const json = (body: unknown) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(body),
    });
  // Map-layer GeoJSON, e.g. /places/{area}/map/wildfire.geojson — match first.
  const geo = url.match(/\/map\/([^/?]+)\.geojson/);
  if (geo) {
    if (geo[1] in meshLayers) return json(meshLayers[geo[1]]);
    const layer = hazards.layers[geo[1]] ?? {
      type: 'FeatureCollection',
      features: [],
      metadata: { sourceStatus: 'OK' },
    };
    if (SCENARIO === 'redflag' && geo[1] === 'weather_alert') {
      return json({ ...layer, features: redflagWeatherAlerts });
    }
    if (SCENARIO === 'redflag' && geo[1] === 'power') return json(redflagPower(layer));
    return json(layer);
  }
  // The whole-mesh backdrop only loads once a reader pans past the corridor, which a
  // capture never does — serve empty so a stray request can't reach the network.
  if (url.includes('/mesh/links')) return json({ window: '72h', links: [] });
  // The monitor archive, per node, rebased onto the frozen clock like the mesh layers so
  // the history band draws the same picture on every run.
  const tel = url.match(/\/mesh\/telemetry\?node=([0-9a-f]+)/);
  if (tel) return json(rebaseTelemetry(meshSnap.telemetry?.[tel[1]]));
  if (url.includes('layer=BURN_STATUS')) return json({ events: snapshot.burn ?? [] });
  if (url.includes('/events')) return json({ events: [] });
  if (url.includes('/summary')) return json(hazards.summary);
  if (url.includes('/scanners')) return json({ scanners: hazards.scanners });
  if (url.includes('/conditions')) {
    const c = snapshot.conditions;
    return json(
      SCENARIO === 'redflag' ? { ...c, fireWeather: { ...c.fireWeather, state: 'RED_FLAG' } } : c
    );
  }
  return json({});
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  // LIVE: tunnel the browser through the Moat proxy (the headless browser can't use it
  // directly — see scripts/moat-relay.mjs); outside Moat, go direct.
  const relay = LIVE && inMoat() ? await startMoatRelay() : null;
  if (LIVE) {
    console.error(
      `⚡ LIVE — real data.sierragridteam.org + OpenFreeMap (${relay ? 'via Moat relay' : 'direct'}); ` +
        `non-deterministic, → ${OUT}`
    );
  }

  const browser = await chromium.launch();
  let count = 0;

  for (const vp of viewports) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      reducedMotion: 'reduce',
      ...(relay ? { proxy: relay.proxy, ignoreHTTPSErrors: true } : {}),
    });
    if (!LIVE) {
      await ctx.route(/data\.sierragridteam\.org/, mockGrid);
      await ctx.route(/tiles\.openfreemap\.org\//, basemap);
    }

    for (const pg of pages) {
      const page = await ctx.newPage();
      if (!LIVE) await page.clock.setFixedTime(FIXED);
      await page.goto(`${BASE}${pg.path}`, {
        waitUntil: LIVE ? 'domcontentloaded' : 'networkidle',
      });
      // /live is client-rendered: wait for the body to be revealed, then for the map
      // (WebGL) to settle (on the mocked basemap, or real OpenFreeMap tiles in LIVE mode).
      if (pg.path === '/live') {
        await page
          .waitForSelector('html[data-live-boot="ready"]', { timeout: LIVE ? 20000 : 10000 })
          .catch(() => {});
        await page.waitForSelector('canvas.maplibregl-canvas', { timeout: 8000 }).catch(() => {});
        // In LIVE mode the real OpenFreeMap basemap streams in — wait for it to actually paint
        // (the fallback note is hidden once the map's layers add). Best-effort through the
        // Moat proxy (see the header note) — it may keep the SSR fallback note.
        if (LIVE) {
          await page
            .waitForSelector('[data-map-fallback]', { state: 'hidden', timeout: 12000 })
            .catch(() => {});
        }
        // Wait for the map's own settled signal (live-map.ts sets data-map-settled once
        // rendering finishes) instead of a fixed sleep — fixed sleeps raced the first
        // paint and made the live captures churn. Falls through on the static no-WebGL
        // fallback, where there is no map to wait for. (Re-checked again post-scroll
        // below — a late ResizeObserver resize repaints the canvas.)
        await page
          .waitForSelector('html[data-map-settled]', { timeout: LIVE ? 15000 : 8000 })
          .catch(() => {});
      } else if (pg.path === '/mesh') {
        // /mesh is client-rendered too: wait for the panel roster to fill from the feed and
        // for the map to settle, rather than racing networkidle. LIVE gets /live's longer
        // budget — the real feed and the real basemap both have to arrive.
        await page
          .waitForFunction(() => !!document.querySelector('[data-mesh-roster] .mesh-roster'), {
            timeout: LIVE ? 20000 : 8000,
          })
          .catch(() => {});
        await page.waitForSelector('canvas.maplibregl-canvas', { timeout: 8000 }).catch(() => {});
        await page
          .waitForSelector('html[data-map-settled]', { timeout: LIVE ? 15000 : 8000 })
          .catch(() => {});
      } else if (pg.path === '/' && !LIVE) {
        // Home tiles are client-filled: Active Alerts + Fire Weather SSR a "—" placeholder
        // and the OperationalStatus island replaces it from the mocked feed. Wait for that
        // swap (rather than racing networkidle) so the capture is deterministic.
        await page
          .waitForFunction(
            () => {
              const v = document.querySelector('[data-stat-key="alerts"] [data-stat-value]');
              return !!v && v.textContent !== '—';
            },
            { timeout: 5000 }
          )
          .catch(() => {});
      } else if (LIVE) {
        // Other live pages (home tiles + banner) fetch client-side — let that settle so the
        // capture shows the fetched live values (the page SSRs only placeholders).
        await page.waitForTimeout(3500);
      }
      // Walk the page so lazy-loaded images (e.g. the About portraits) fetch, and
      // wait until every image has decoded — a fullPage capture won't do this itself.
      await page.evaluate(async () => {
        const step = window.innerHeight;
        for (let y = 0; y <= document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 40));
        }
        window.scrollTo(0, 0);
        await Promise.all(
          Array.from(document.images).map((img) =>
            img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r)))
          )
        );
      });
      // The MapLibre canvas can get resized after the initial settled wait (its
      // ResizeObserver fires on late layout shifts, e.g. the scroll walk above), which
      // repaints it. Capture only once the canvas backing store matches its CSS box AND
      // the map reports settled again — this is what actually killed the live-page churn.
      if (MAP_PAGES.has(pg.path)) {
        await page
          .waitForFunction(
            () => {
              const c = document.querySelector<HTMLCanvasElement>('canvas.maplibregl-canvas');
              if (!c) return true; // static no-WebGL fallback — nothing to settle
              const dpr = window.devicePixelRatio || 1;
              const sized =
                Math.abs(c.width - c.clientWidth * dpr) <= dpr &&
                Math.abs(c.height - c.clientHeight * dpr) <= dpr;
              return sized && document.documentElement.dataset.mapSettled === '1';
            },
            { timeout: 8000 }
          )
          .catch(() => {});
      }
      // Freeze each map into a picture of itself before the full-page capture. That capture
      // temporarily grows the viewport to the whole page; MapLibre's ResizeObserver reacts
      // mid-capture and the canvas (and its DOM pins) come out squeezed into one corner. An
      // ELEMENT screenshot at the real viewport is correct, so take that and lay it over the
      // live map, with the frame's height pinned so a vh-sized map can't change size either.
      if (MAP_PAGES.has(pg.path)) {
        for (const sel of ['[data-mesh-map]', '[data-live-map]']) {
          const fig = page.locator(sel).first();
          if (!(await fig.count())) continue;
          const png = (await fig.screenshot()).toString('base64');
          await fig.evaluate((el: HTMLElement, src: string) => {
            el.style.height = `${el.getBoundingClientRect().height}px`;
            if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
            const img = document.createElement('img');
            img.src = src;
            img.alt = '';
            img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;z-index:1000';
            el.appendChild(img);
            return img.decode();
          }, `data:image/png;base64,${png}`);
        }
      }
      // Kill any residual motion + the text caret for byte-stability.
      await page.addStyleTag({
        content:
          '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}',
      });
      await page.evaluate(() => (document as Document).fonts.ready);
      await page.waitForTimeout(150);
      // Full page (whole scroll) + above-the-fold (viewport only) — the fold shot
      // surfaces top-of-page issues like the nav/header overlap and the hero on tablet.
      await page.screenshot({ path: resolve(OUT, `${pg.name}-${vp.name}.png`), fullPage: true });
      await page.screenshot({
        path: resolve(OUT, `${pg.name}-${vp.name}-fold.png`),
        fullPage: false,
      });
      await page.close();
      count++;
      console.error(`✓ ${pg.name} @ ${vp.name}`);
    }
    await ctx.close();
  }

  await browser.close();
  if (relay) await relay.close();
  console.error(
    `\nCaptured ${count} screenshots → ${OUT} (${LIVE ? 'LIVE' : `scenario: ${SCENARIO}`})`
  );
}

main().catch((err) => {
  console.error('screenshots failed:', err);
  process.exit(1);
});
