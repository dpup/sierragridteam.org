/**
 * Deterministic screenshots for visual QA + regression. Captures every page at
 * three viewports with:
 *   - a FROZEN clock (stable LocalClock + "Synced" stamps),
 *   - MOCKED info.ersn.net responses (stable data states),
 *   - DISABLED animations + reduced motion,
 * so the PNGs are byte-stable and safe to diff or analyze.
 *
 * Requires the built site served at BASE_URL (default http://localhost:4321). The build
 * bakes NO feed data — every page renders client-side from the mocked responses here:
 *   npm run build && npm run preview & npm run screenshots
 * Optional: SCENARIO=redflag to render the alarm state.
 */
import { chromium, type Route } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { inMoat, startMoatRelay } from './moat-relay.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const SCENARIO = process.env.SCENARIO ?? 'calm';
const FIXED = new Date('2026-06-25T13:30:00-07:00'); // 13:30 PT, stable

// LIVE=1 renders against the REAL info.ersn.net feed + CARTO basemap instead of the
// frozen/mocked defaults — for eyeballing the live page, not regression (it's not
// deterministic). Inside Moat it tunnels through the auth-injecting relay (the headless
// browser can't use the Moat proxy directly); elsewhere it goes direct. Output lands in a
// separate, git-ignored dir so it never clobbers the committed deterministic set.
//
// Best-effort, IN-SANDBOX ONLY: the Moat proxy MITMs TLS and reframes upstream responses
// (keep-alive, no Content-Length), which makes /live's burst of ~12 parallel fetches flaky
// — it may stall past the page's 9s timeout and fall to the honest "Last known" fallback,
// and the keyless CARTO basemap may not finish. The home page (2 fetches) is reliably live.
// None of this affects production, where browsers hit info.ersn.net directly.
const LIVE = process.env.LIVE === '1';
const OUT = resolve(root, LIVE ? 'tests/screenshots/_live' : 'tests/screenshots');

const allViewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'w1000', width: 1000, height: 900 },
  { name: 'w880', width: 880, height: 1000 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'mobile', width: 390, height: 844 },
];
// LIVE mode loads the real CARTO basemap per /live capture; keep it to two viewports so
// the keyless free-tier basemap doesn't get throttled mid-run (and it stays quick).
const viewports = LIVE
  ? allViewports.filter((v) => v.name === 'desktop' || v.name === 'mobile')
  : allViewports;

const allPages = [
  { name: 'home', path: '/' },
  { name: 'mesh', path: '/mesh' },
  { name: 'live', path: '/live' },
  { name: 'contact', path: '/contact' },
  { name: 'about', path: '/about' },
  { name: 'about-jay', path: '/about/jay' },
  { name: 'about-corrinne', path: '/about/corrinne' },
  { name: 'about-allan', path: '/about/allan' },
  { name: 'about-dan', path: '/about/dan' },
  { name: 'donate', path: '/donate' },
  { name: 'notfound', path: '/this-route-does-not-exist' },
];
// LIVE mode only cares about the data-driven pages (home tiles/banner + the live feed).
const pages = LIVE ? allPages.filter((p) => p.path === '/' || p.path === '/live') : allPages;

const snapshot = JSON.parse(readFileSync(resolve(root, 'src/data/ersn-snapshot.json'), 'utf8'));
const hazards = JSON.parse(readFileSync(resolve(root, 'src/data/hazards-snapshot.json'), 'utf8'));

// Minimal offline basemap so the MapLibre map's `load` fires without external tiles
// (the headless browser can't reach tile hosts through the auth proxy). The hazard
// overlays still render on a plain parchment background.
const OFFLINE_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#efe7d6' } }],
};

// The "redflag" alarm scenario: a realistic fire-season foothill event modeled on the
// real NWS Sacramento alert shape (see info.ersn.net tests/testdata/weather). A Red Flag
// Warning + a co-occurring High Wind Warning (wind drives red-flag conditions) drive the
// home "Active Alerts" tile, plus fireWeather.state = RED_FLAG (FR-3) escalates the Fire
// Weather tile to orange.
const redflagAlerts = [
  {
    id: 'urn:test:redflag',
    senderName: 'NWS Sacramento CA',
    event: 'Red Flag Warning',
    description:
      'Gusty north winds and single-digit humidity will create critical fire weather ' +
      'conditions across the Mother Lode and Sierra foothills. Any fire that develops will ' +
      'likely spread rapidly.',
    headline: 'Red Flag Warning in effect from 11 AM to 8 PM PDT',
    source: 'NWS',
    severity: 'CRITICAL',
    zones: ['CAZ069'],
    startTime: '2026-06-25T18:00:00Z',
    endTime: '2026-06-26T03:00:00Z',
  },
  {
    id: 'urn:test:wind',
    senderName: 'NWS Sacramento CA',
    event: 'High Wind Warning',
    description:
      'North winds 25 to 35 mph with gusts up to 60 mph expected across the Motherlode and ' +
      'Northeast Foothills. Strong winds could blow down trees and power lines.',
    headline: 'High Wind Warning in effect until 8 PM PDT',
    source: 'NWS',
    severity: 'WARNING',
    zones: ['CAZ067'],
    startTime: '2026-06-25T17:00:00Z',
    endTime: '2026-06-26T03:00:00Z',
  },
];

function mockErsn(route: Route) {
  const url = route.request().url();
  const json = (body: unknown) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(body),
    });
  // Hazard routes first — a '…/weather_alert.geojson' URL contains '/weather'.
  if (url.includes('/situation/')) return json(hazards.situation);
  if (url.includes('/scanners/')) return json(hazards.scanners);
  const geo = url.match(/\/hazards\/[^/]+\/([^/?]+)\.geojson/);
  if (geo) {
    return json(
      hazards.layers[geo[1]] ?? {
        type: 'FeatureCollection',
        features: [],
        metadata: { source_status: 'OK' },
      }
    );
  }
  // Order matters: '/weather/alerts' and '/incidents' before the bare '/weather'.
  if (url.includes('/weather/alerts')) {
    // 'calm' = the common quiet state (no active alerts); 'redflag' = the alarm.
    return json(
      SCENARIO === 'redflag'
        ? { alerts: redflagAlerts, lastUpdated: FIXED.toISOString() }
        : { alerts: [], lastUpdated: FIXED.toISOString() }
    );
  }
  if (url.includes('/weather')) {
    const w = snapshot.weather;
    return json(
      SCENARIO === 'redflag' ? { ...w, fireWeather: { ...w.fireWeather, state: 'RED_FLAG' } } : w
    );
  }
  if (url.includes('/roads')) return json(snapshot.roads);
  return json({});
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  // LIVE: tunnel the browser through the Moat proxy (the headless browser can't use it
  // directly — see scripts/moat-relay.mjs); outside Moat, go direct.
  const relay = LIVE && inMoat() ? await startMoatRelay() : null;
  if (LIVE) {
    console.error(
      `⚡ LIVE — real info.ersn.net + CARTO (${relay ? 'via Moat relay' : 'direct'}); ` +
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
      await ctx.route(/info\.ersn\.net/, mockErsn);
      // Offline basemap (broad abort first, specific style mock last = higher priority).
      await ctx.route(/basemaps\.cartocdn\.com\//, (r) => r.abort());
      await ctx.route(/basemaps\.cartocdn\.com\/.*style\.json/, (r) =>
        r.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(OFFLINE_STYLE),
        })
      );
    }

    for (const pg of pages) {
      const page = await ctx.newPage();
      if (!LIVE) await page.clock.setFixedTime(FIXED);
      await page.goto(`${BASE}${pg.path}`, {
        waitUntil: LIVE ? 'domcontentloaded' : 'networkidle',
      });
      // /live is client-rendered: wait for the body to be revealed, then for the map
      // (WebGL) to settle (on the mocked basemap, or real CARTO tiles in LIVE mode).
      if (pg.path === '/live') {
        await page
          .waitForSelector('html[data-live-boot="ready"]', { timeout: LIVE ? 20000 : 10000 })
          .catch(() => {});
        await page.waitForSelector('canvas.maplibregl-canvas', { timeout: 8000 }).catch(() => {});
        // In LIVE mode the real CARTO basemap streams in — wait for it to actually paint
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
      if (pg.path === '/live') {
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
