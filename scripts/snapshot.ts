/**
 * Refreshes the checked-in data snapshots from the live data.sierragridteam.org feed:
 *   src/data/grid-snapshot.json     — /conditions (current weather + fire-weather state)
 *   src/data/hazards-snapshot.json  — place summary + hazard GeoJSON map layers + scanners
 *   src/data/mesh-snapshot.json     — the mesh_node + mesh_link place layers (/mesh topology)
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
const MESH_OUT = resolve(dir, '../src/data/mesh-snapshot.json');

/** Just enough of the node layer to find the repeaters that carry a monitor. */
type MeshFc = { features?: { properties?: { mesh?: { publicKey?: string; admin?: unknown } } }[] };

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

  // The /mesh topology layers. Captured at the feed's default 72h window — the screenshot
  // harness rebases the reception timestamps onto its frozen clock so the recency tiers
  // render identically on every run (see scripts/screenshots.ts).
  const [meshNode, meshLink] = await Promise.all([
    get(`/places/${HAZARD_AREA}/map/mesh_node.geojson`),
    get(`/places/${HAZARD_AREA}/map/mesh_link.geojson`),
  ]);

  // The monitor ARCHIVE for every corridor repeater that carries one, so the screenshot
  // harness can draw the history band deterministically. One request per node, as The Grid
  // takes a single `node` per call. Captured over the chart's widest range.
  const monitored = ((meshNode as MeshFc).features ?? [])
    .map((f) => f.properties?.mesh)
    .filter((m): m is { publicKey: string; admin?: unknown } => !!m?.publicKey && !!m.admin);
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 86_400_000);
  //
  // Thinned on the way in. A month at 15-minute cadence is ~2,880 samples per node, which
  // across seven nodes would commit a ~30 MB fixture to git for a chart that draws at most
  // a few hundred points per trace anyway. Keeping every Nth sample preserves the shape,
  // the coverage window and the cadence, which is all the harness needs.
  const MAX_FIXTURE_SAMPLES = 400;
  const telemetry: Record<string, unknown> = {};
  for (const m of monitored) {
    const res = (await get(
      `/mesh/telemetry?node=${encodeURIComponent(m.publicKey)}` +
        `&from=${from.toISOString()}&to=${to.toISOString()}`
    )) as { samples?: unknown[] };
    const all = res.samples ?? [];
    const step = Math.ceil(all.length / MAX_FIXTURE_SAMPLES);
    telemetry[m.publicKey] = {
      ...res,
      samples: step > 1 ? all.filter((_, i) => i % step === 0) : all,
    };
  }

  writeFileSync(
    MESH_OUT,
    JSON.stringify(
      {
        fetchedAt: new Date().toISOString(),
        area: HAZARD_AREA,
        node: meshNode,
        link: meshLink,
        telemetry,
      },
      null,
      2
    ) + '\n'
  );
  console.error(`Wrote ${MESH_OUT} (${monitored.length} monitored repeater archive(s))`);
}

main().catch((err) => {
  console.error('snapshot failed:', err.message);
  process.exit(1);
});
