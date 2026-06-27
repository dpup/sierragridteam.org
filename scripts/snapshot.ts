/**
 * Refreshes the checked-in data snapshots from the live info.ersn.net feed:
 *   src/data/ersn-snapshot.json     — roads / weather / alerts / incidents (typed API)
 *   src/data/hazards-snapshot.json  — situation + hazard GeoJSON layers + scanners
 * These are the build-time fallback when the API is unreachable, and the SSR
 * "last-known value" the design requires.
 *
 * Run: `npm run snapshot`  (or `bun run scripts/snapshot.ts`)
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const API_BASE = process.env.PUBLIC_ERSN_API_BASE ?? 'https://info.ersn.net/api/v1';
const dir = dirname(fileURLToPath(import.meta.url));
const ERSN_OUT = resolve(dir, '../src/data/ersn-snapshot.json');
const HAZARDS_OUT = resolve(dir, '../src/data/hazards-snapshot.json');

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`, {
    signal: AbortSignal.timeout(10000),
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

const NWS_ZONES = ['CAZ019', 'CAZ067', 'CAZ069', 'CAZ072'];
const INCIDENT_AREA = 'mother-lode';
const HAZARD_AREA = 'calaveras';
// All hazard GeoJSON layers (one FeatureCollection each).
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

  const [roads, weather, alerts, incidents] = await Promise.all([
    get('/roads'),
    get('/weather'),
    get(`/weather/alerts?zones=${NWS_ZONES.join(',')}`),
    get(`/incidents/${INCIDENT_AREA}`),
  ]);
  writeFileSync(
    ERSN_OUT,
    JSON.stringify(
      { fetchedAt: new Date().toISOString(), live: true, roads, weather, alerts, incidents },
      null,
      2
    ) + '\n'
  );
  console.error(`Wrote ${ERSN_OUT}`);

  const [situation, scanners, ...layerList] = await Promise.all([
    get(`/situation/${HAZARD_AREA}`),
    get(`/scanners/${HAZARD_AREA}`),
    ...HAZARD_LAYERS.map((l) => get(`/hazards/${HAZARD_AREA}/${l}.geojson`)),
  ]);
  const layers: Record<string, unknown> = {};
  HAZARD_LAYERS.forEach((l, i) => (layers[l] = layerList[i]));
  writeFileSync(
    HAZARDS_OUT,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        live: true,
        area: HAZARD_AREA,
        situation,
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
