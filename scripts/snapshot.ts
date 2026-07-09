/**
 * Refreshes the checked-in data snapshots from the live data.sierragridteam.org feed:
 *   src/data/grid-snapshot.json     — /conditions (current weather + fire-weather state)
 *   src/data/hazards-snapshot.json  — place summary + hazard GeoJSON map layers + scanners
 * These checked-in JSON are TEST FIXTURES ONLY — the screenshot harness mocks the feed
 * with them. Nothing is fetched at build time; pages render live in the browser.
 *
 * Run: `npm run snapshot`  (or `bun run scripts/snapshot.ts`)
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const API_BASE = process.env.PUBLIC_GRID_API_BASE ?? 'https://data.sierragridteam.org/api/v1';
const dir = dirname(fileURLToPath(import.meta.url));
const GRID_OUT = resolve(dir, '../src/data/grid-snapshot.json');
const HAZARDS_OUT = resolve(dir, '../src/data/hazards-snapshot.json');

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    signal: AbortSignal.timeout(10000),
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

const HAZARD_AREA = 'ebbetts-pass';
// All hazard GeoJSON map layers (one FeatureCollection each).
const HAZARD_LAYERS = [
  'road_incident',
  'road_segment',
  'chain_control',
  'weather_alert',
  'fire_weather',
  'wildfire',
  'evacuation',
  'earthquake',
];

async function main() {
  console.error(`Fetching snapshots from ${API_BASE} ...`);

  const conditions = await get('/conditions');
  writeFileSync(
    GRID_OUT,
    JSON.stringify({ fetchedAt: new Date().toISOString(), conditions }, null, 2) + '\n'
  );
  console.error(`Wrote ${GRID_OUT}`);

  const [summary, scannersRes, ...layerList] = await Promise.all([
    get(`/places/${HAZARD_AREA}/summary`),
    get(`/scanners?place=${HAZARD_AREA}`),
    ...HAZARD_LAYERS.map((l) => get(`/places/${HAZARD_AREA}/map/${l}.geojson`)),
  ]);
  const layers: Record<string, unknown> = {};
  HAZARD_LAYERS.forEach((l, i) => (layers[l] = layerList[i]));
  const scanners = (scannersRes as { scanners?: unknown[] })?.scanners ?? [];
  writeFileSync(
    HAZARDS_OUT,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        area: HAZARD_AREA,
        summary,
        layers,
        scanners,
      },
      null,
      2
    ) + '\n'
  );
  console.error(`Wrote ${HAZARDS_OUT}`);
}

main().catch((err) => {
  console.error('snapshot failed:', err.message);
  process.exit(1);
});
