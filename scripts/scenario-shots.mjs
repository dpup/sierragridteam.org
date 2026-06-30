/**
 * scenario-shots — build + screenshot /live and the home banner under several SYNTHETIC
 * hazard configurations, so the situation page can be reviewed in states that rarely
 * occur live (active wildfire + evacuation, a busy incident day, a quake + winter storm).
 *
 * The fake data is defined here (not committed as feed data) and served to the browser via
 * a route mock per scenario; /live + home are captured to tests/screenshots/scenarios/.
 * (The build bakes no feed data, so the per-scenario rebuild is redundant — see the note
 * in the loop; the route mock is what drives the page.)
 *
 * Requires a running `astro preview` at BASE_URL (serves the built dist):
 *   npm run build && npm run preview &
 *   node scripts/scenario-shots.mjs
 */
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';

const SNAP = 'src/data/hazards-snapshot.json';
const BACKUP = '/tmp/hazards-snapshot.backup.json';
const OUT = 'tests/screenshots/scenarios';
const BASE = process.env.BASE_URL ?? 'http://localhost:4321';
const FIXED = new Date('2026-06-25T17:33:00-07:00');
const SEV = ['INFO', 'LOW', 'MODERATE', 'SEVERE', 'EXTREME'];

const calm = JSON.parse(readFileSync(SNAP, 'utf8'));
const layer = (name, features, source_status = 'OK') => ({
  type: 'FeatureCollection',
  features,
  metadata: { layer: name, area: 'calaveras', generated_at: FIXED.toISOString(), source_status },
});
const incident = (lng, lat, rank, headline, where, category = 'incident') => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lng, lat] },
  properties: {
    id: `chp:${headline}-${lng}`,
    layer: 'road_incident',
    kind: 'Road incident',
    category,
    severity: SEV[rank],
    severity_rank: rank,
    headline,
    status: 'active',
    updated_at: FIXED.toISOString(),
    area_label: where,
    source: { id: 'chp', name: 'CHP / Caltrans', attribution: 'quickmap.dot.ca.gov' },
  },
});
const poly = (lng, lat) => ({
  type: 'Polygon',
  coordinates: [
    [
      [lng - 0.03, lat + 0.02],
      [lng + 0.03, lat + 0.02],
      [lng + 0.03, lat - 0.02],
      [lng - 0.03, lat - 0.02],
      [lng - 0.03, lat + 0.02],
    ],
  ],
});
const banner = (lyr, kind, rank, headline, props) => ({
  type: 'Feature',
  geometry: null,
  properties: {
    id: `${lyr}:1`,
    layer: lyr,
    kind,
    severity: SEV[rank],
    severity_rank: rank,
    headline,
    source: { id: 'nws', name: 'NWS Sacramento CA' },
    ...props,
  },
});

/** Build a plausible /situation rollup from the injected layers (consistent counts). */
function situationFrom(layers) {
  const all = [];
  for (const [k, v] of Object.entries(layers))
    for (const f of v.features ?? []) all.push({ layer: k, ...f.properties });
  const ranks = all.map((f) => f.severity_rank ?? 0);
  const highest = Math.max(0, ...ranks);
  const counts = {};
  for (const r of ranks) counts[SEV[r]] = (counts[SEV[r]] ?? 0) + 1;
  const evacLayer = layers.evacuation;
  const evacStatus = evacLayer?.metadata?.source_status ?? 'UNAVAILABLE';
  const top = all
    .slice()
    .sort((a, b) => (b.severity_rank ?? 0) - (a.severity_rank ?? 0))
    .slice(0, 5)
    .map((f) => ({
      layer: f.layer,
      severity: SEV[f.severity_rank ?? 0],
      severity_rank: f.severity_rank ?? 0,
      headline: f.headline,
      source: f.source?.name ?? '',
    }));
  return {
    area: 'calaveras',
    area_name: 'Calaveras County',
    generated_at: FIXED.toISOString(),
    summary: {
      highest_severity: SEV[highest],
      highest_severity_rank: highest,
      severity_counts: counts,
      total_features: all.length,
      active_evacuations: evacStatus === 'UNAVAILABLE' ? null : (evacLayer?.features?.length ?? 0),
      evacuation_status: evacStatus,
      top_headlines: top,
    },
    layers: Object.entries(layers).map(([k, v]) => ({
      layer: k,
      source_status: v.metadata?.source_status ?? 'OK',
      feature_count: (v.features ?? []).length,
      highest_severity:
        SEV[Math.max(0, ...(v.features ?? []).map((f) => f.properties.severity_rank ?? 0))],
    })),
  };
}

/** Assemble a full hazards snapshot from layer overrides (keeps calm layers otherwise). */
function snapshot(overrides) {
  const layers = { ...calm.layers, ...overrides };
  return { ...calm, layers, situation: situationFrom(layers) };
}

const scenarios = {
  calm,
  'wildfire-evac': snapshot({
    wildfire: layer('wildfire', [
      {
        type: 'Feature',
        geometry: poly(-120.35, 38.25),
        properties: {
          id: 'fire:ss',
          layer: 'wildfire',
          kind: 'Wildfire',
          category: 'active',
          severity: 'SEVERE',
          severity_rank: 3,
          headline: 'Salt Springs Fire',
          status: 'active',
          area_label: 'East of Arnold, Hwy 4 corridor',
          source: { id: 'calfire', name: 'CAL FIRE' },
          wildfire: { acres: 1240, containment: 15, county: 'Calaveras', has_perimeter: true },
        },
      },
    ]),
    evacuation: layer('evacuation', [
      {
        type: 'Feature',
        geometry: poly(-120.4, 38.18),
        properties: {
          id: 'evac:E043',
          layer: 'evacuation',
          kind: 'Evacuation',
          category: 'warning',
          severity: 'SEVERE',
          severity_rank: 3,
          headline: 'Evacuation WARNING — Hathaway Pines & Avery — prepare to leave',
          status: 'active',
          area_label: 'Zones CAL-E043 & E044',
          source: { id: 'caloes', name: 'Cal OES / Genasys' },
          evacuation: {
            zone_id: 'E043',
            level: 'WARNING',
            event_type: 'Fire',
            county: 'Calaveras',
          },
        },
      },
    ]),
    fire_weather: layer('fire_weather', [
      banner('fire_weather', 'Fire weather', 3, 'Red Flag Warning in effect until 8 PM PT', {
        fire_weather: { state: 'red-flag' },
      }),
    ]),
  }),
  // A point-geometry fire (no mapped perimeter) with stats baked into the headline — mirrors
  // a real CAL FIRE feed. Exercises the map point marker and the title-vs-detail de-dup.
  'wildfire-point': snapshot({
    wildfire: layer('wildfire', [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-120.55, 38.05] },
        properties: {
          id: 'fire:owl',
          layer: 'wildfire',
          kind: 'Wildfire',
          category: 'active',
          severity: 'SEVERE',
          severity_rank: 3,
          headline: 'Owl Fire — 120 ac, 30% contained',
          status: 'active',
          area_label: 'Highway 108, Green Springs',
          source: { id: 'calfire', name: 'CAL FIRE' },
          wildfire: { acres: 120, containment: 30, county: 'Tuolumne', has_perimeter: false },
        },
      },
    ]),
  }),
  'multi-incident': snapshot({
    road_incident: layer('road_incident', [
      incident(-120.45, 38.13, 2, 'Traffic Collision - Minor Injuries', 'Hwy 4 / Six Mile Rd'),
      incident(-120.54, 38.07, 3, 'Vehicle Fire', 'Hwy 49 / Murphys Grade Rd'),
      incident(-120.35, 38.25, 2, 'Traffic Hazard - Debris in Road', 'Hwy 4 near Arnold'),
      incident(
        -120.38,
        37.98,
        2,
        'Traffic Collision - No Injury',
        'Hwy 108 / Mono Way, Sonora',
        'incident'
      ),
      incident(-120.43, 38.2, 2, 'Tree Down Across Roadway', 'Sheep Ranch Rd', 'closure'),
    ]),
    weather_alert: layer('weather_alert', [
      banner('weather_alert', 'Weather alert', 2, 'Wind Advisory until 9 PM PT — gusts to 45 mph', {
        description:
          'Southwest winds 20 to 30 mph with gusts up to 45 mph across the Mother Lode and foothills.',
        weather: { event: 'Wind Advisory', source: 'NWS', zones: ['CAZ069'] },
      }),
    ]),
  }),
  'quake-winter': snapshot({
    earthquake: layer('earthquake', [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [-120.55, 38.05] },
        properties: {
          id: 'usgs:nc1',
          layer: 'earthquake',
          kind: 'Earthquake',
          severity: 'MODERATE',
          severity_rank: 2,
          headline: 'M3.4 — 8 mi SW of Murphys',
          area_label: '8 km SW of Murphys',
          updated_at: FIXED.toISOString(),
          source: { id: 'usgs', name: 'USGS' },
          earthquake: { magnitude: 3.4, depth_km: 7.2, felt: 14 },
        },
      },
    ]),
    weather_alert: layer('weather_alert', [
      banner(
        'weather_alert',
        'Weather alert',
        3,
        'Winter Storm Warning — heavy snow above 4500 ft',
        {
          description:
            'Heavy snow expected. Accumulations of 1 to 2 feet above 5000 feet, with gusts to 50 mph. Travel will be very difficult to impossible.',
          weather: { event: 'Winter Storm Warning', source: 'NWS', zones: ['CAZ072'] },
        }
      ),
    ]),
    fire_weather: layer('fire_weather', [
      banner('fire_weather', 'Fire weather', 0, 'Fire weather: normal', {
        fire_weather: { state: 'normal' },
      }),
    ]),
  }),
};

function mockErsn(route, snap) {
  const url = route.request().url();
  const json = (b) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(b),
    });
  if (url.includes('/situation/')) return json(snap.situation);
  if (url.includes('/scanners/')) return json(snap.scanners);
  const g = url.match(/\/hazards\/[^/]+\/([^/?]+)\.geojson/);
  if (g)
    return json(
      snap.layers[g[1]] ?? {
        type: 'FeatureCollection',
        features: [],
        metadata: { source_status: 'OK' },
      }
    );
  if (url.includes('/weather/alerts'))
    return json({ alerts: [], lastUpdated: FIXED.toISOString() });
  if (url.includes('/weather')) return json(calmErsn.weather);
  if (url.includes('/roads')) return json(calmErsn.roads);
  return json({});
}
const calmErsn = JSON.parse(readFileSync('src/data/ersn-snapshot.json', 'utf8'));
const OFFLINE_STYLE = {
  version: 8,
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#efe7d6' } }],
};

mkdirSync(OUT, { recursive: true });
copyFileSync(SNAP, BACKUP);
const browser = await chromium.launch();
try {
  for (const [name, snap] of Object.entries(scenarios)) {
    writeFileSync(SNAP, JSON.stringify(snap, null, 2) + '\n');
    // NB: the build no longer bakes feed data — the per-scenario data reaches the page via
    // the route mock below, so this rebuild is redundant (kept for now; could build once).
    execSync('node_modules/.bin/astro build', { stdio: 'ignore' });
    const ctx = await browser.newContext({
      viewport: { width: 1200, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: 'reduce',
    });
    await ctx.route(/info\.ersn\.net/, (r) => mockErsn(r, snap));
    await ctx.route(/basemaps\.cartocdn\.com\//, (r) => r.abort());
    await ctx.route(/basemaps\.cartocdn\.com\/.*style\.json/, (r) =>
      r.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(OFFLINE_STYLE),
      })
    );
    for (const [path, view, full] of [
      ['/live', 'live', true],
      ['/', 'home', false],
    ]) {
      const p = await ctx.newPage();
      await p.clock.setFixedTime(FIXED);
      await p.goto(BASE + path, { waitUntil: 'networkidle' });
      if (path === '/live') {
        await p.waitForSelector('html[data-live-boot="ready"]', { timeout: 10000 }).catch(() => {});
        await p.waitForSelector('canvas.maplibregl-canvas', { timeout: 8000 }).catch(() => {});
        await p.waitForTimeout(2800);
      }
      await p.addStyleTag({
        content: '*,*::before,*::after{animation:none!important;transition:none!important}',
      });
      await p.waitForTimeout(200);
      await p.screenshot({ path: `${OUT}/${name}-${view}.png`, fullPage: full });
      await p.close();
    }
    await ctx.close();
    console.error(`✓ ${name}`);
  }
} finally {
  copyFileSync(BACKUP, SNAP);
  execSync('node_modules/.bin/astro build', { stdio: 'ignore' });
  await browser.close();
  console.error(`\nRestored ${SNAP}. Scenarios → ${OUT}/`);
}
