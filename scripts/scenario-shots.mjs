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
const SEV = ['INFO', 'MINOR', 'MODERATE', 'SEVERE', 'EXTREME'];

const calm = JSON.parse(readFileSync(SNAP, 'utf8'));
const layer = (name, features, sourceStatus = 'OK') => ({
  type: 'FeatureCollection',
  features,
  metadata: { layer: name, area: 'ebbetts-pass', generatedAt: FIXED.toISOString(), sourceStatus },
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
    severityRank: rank,
    headline,
    status: 'active',
    updatedAt: FIXED.toISOString(),
    areaLabel: where,
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
    severityRank: rank,
    headline,
    source: { id: 'nws', name: 'NWS Sacramento CA' },
    ...props,
  },
});

/** Build a plausible place summary from the injected layers (consistent counts). */
function summaryFrom(layers) {
  const all = [];
  for (const [k, v] of Object.entries(layers))
    for (const f of v.features ?? []) all.push({ layer: k, ...f.properties });
  const ranks = all.map((f) => f.severityRank ?? 0);
  const highest = Math.max(0, ...ranks);
  const counts = {};
  for (const r of ranks) counts[SEV[r]] = (counts[SEV[r]] ?? 0) + 1;
  const evacLayer = layers.evacuation;
  const evacStatus = evacLayer?.metadata?.sourceStatus ?? 'UNAVAILABLE';
  const top = all
    .slice()
    .sort((a, b) => (b.severityRank ?? 0) - (a.severityRank ?? 0))
    .slice(0, 5)
    .map((f) => ({
      id: f.id,
      layer: (f.layer ?? '').toUpperCase(), // topEvents layer is the UPPER_CASE enum
      severity: SEV[f.severityRank ?? 0],
      severityRank: f.severityRank ?? 0,
      headline: f.headline,
      source: f.source?.id ?? '',
    }));
  return {
    place: 'ebbetts-pass',
    placeId: 'area:ebbetts-pass',
    placeName: 'Ebbetts Pass Corridor',
    generatedAt: FIXED.toISOString(),
    mode: highest >= 3 ? 'ALERT' : 'QUIET',
    summary: {
      highestSeverity: SEV[highest],
      highestSeverityRank: highest,
      severityCounts: counts,
      totalActive: all.length,
      activeEvacuations: evacStatus === 'UNAVAILABLE' ? null : (evacLayer?.features?.length ?? 0),
      evacuationStatus: evacStatus,
      topEvents: top,
    },
    domains: [],
  };
}

/** Assemble a full hazards snapshot from layer overrides (keeps calm layers otherwise). */
function snapshot(overrides) {
  const layers = { ...calm.layers, ...overrides };
  return { ...calm, layers, summary: summaryFrom(layers) };
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
          severityRank: 3,
          headline: 'Salt Springs Fire',
          status: 'active',
          areaLabel: 'East of Arnold, Hwy 4 corridor',
          source: { id: 'calfire', name: 'CAL FIRE' },
          provenance: {
            sourceUrl: 'https://www.fire.ca.gov/incidents/2026/9/2/salt-springs-fire/',
          },
          wildfire: { acres: 1240, containment: 15, county: 'Calaveras', hasPerimeter: true },
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
          severityRank: 3,
          headline: 'Evacuation WARNING — Hathaway Pines & Avery — prepare to leave',
          status: 'active',
          areaLabel: 'Zones CAL-E043 & E044',
          source: { id: 'caloes', name: 'Cal OES / Genasys' },
          provenance: { sourceUrl: 'https://protect.genasys.com/' },
          evacuation: {
            zoneId: 'E043',
            level: 'WARNING',
            eventType: 'Fire',
            county: 'Calaveras',
          },
        },
      },
    ]),
    fire_weather: layer('fire_weather', [
      banner('fire_weather', 'Fire weather', 3, 'Red Flag Warning in effect until 8 PM PT', {
        fireWeather: { state: 'red-flag' },
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
          severityRank: 3,
          headline: 'Owl Fire — 120 ac, 30% contained',
          status: 'active',
          areaLabel: 'Highway 108, Green Springs',
          source: { id: 'calfire', name: 'CAL FIRE' },
          provenance: { sourceUrl: 'https://www.fire.ca.gov/incidents/2026/7/6/owl-fire/' },
          wildfire: { acres: 120, containment: 30, county: 'Tuolumne', hasPerimeter: false },
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
          severityRank: 2,
          headline: 'M3.4 — 8 mi SW of Murphys',
          areaLabel: '8 km SW of Murphys',
          updatedAt: FIXED.toISOString(),
          source: { id: 'usgs', name: 'USGS' },
          earthquake: { magnitude: 3.4, depthKm: 7.2, felt: 14 },
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
        fireWeather: { state: 'normal' },
      }),
    ]),
  }),
};

function mockGrid(route, snap) {
  const url = route.request().url();
  const json = (b) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify(b),
    });
  const g = url.match(/\/map\/([^/?]+)\.geojson/);
  if (g)
    return json(
      snap.layers[g[1]] ?? {
        type: 'FeatureCollection',
        features: [],
        metadata: { sourceStatus: 'OK' },
      }
    );
  if (url.includes('/summary')) return json(snap.summary);
  if (url.includes('/scanners')) return json({ scanners: snap.scanners });
  if (url.includes('/conditions')) return json(calmGrid.conditions);
  return json({});
}
const calmGrid = JSON.parse(readFileSync('src/data/grid-snapshot.json', 'utf8'));
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
    await ctx.route(/data\.sierragridteam\.org/, (r) => mockGrid(r, snap));
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
