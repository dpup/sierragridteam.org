/**
 * Refreshes the checked-in data snapshot (src/data/ersn-snapshot.json) from the
 * live info.ersn.net feed. This snapshot is the build-time fallback when the API
 * is unreachable, and the SSR "last-known value" the design requires.
 *
 * Run: `npm run snapshot`  (or `bun run scripts/snapshot.ts`)
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const API_BASE = process.env.PUBLIC_ERSN_API_BASE ?? 'https://info.ersn.net/api/v1';
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/data/ersn-snapshot.json');

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

async function main() {
  console.error(`Fetching snapshot from ${API_BASE} ...`);
  const [roads, weather, alerts, incidents] = await Promise.all([
    get('/roads'),
    get('/weather'),
    get(`/weather/alerts?zones=${NWS_ZONES.join(',')}`),
    get(`/incidents/${INCIDENT_AREA}`),
  ]);
  const snapshot = {
    fetchedAt: new Date().toISOString(),
    live: true,
    roads,
    weather,
    alerts,
    incidents,
  };
  writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + '\n');
  console.error(`Wrote ${OUT}`);
}

main().catch((err) => {
  console.error('snapshot failed:', err.message);
  process.exit(1);
});
