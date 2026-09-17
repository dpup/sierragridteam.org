/**
 * mesh-client.ts — the browser's fetches against The Grid's mesh surfaces, kept out of the
 * page script so the page stays wiring and this stays testable I/O. Nothing here runs at
 * build time (docs/architecture/data-feed.md): /mesh renders live in the browser.
 */
import { GRID_API_BASE } from './grid';
import { HAZARD_AREA } from './hazards';
import { buildSeries, type TelemetryResponse, type TelemetrySeries } from './mesh-telemetry';
import {
  buildGlobalGraph,
  buildRegionGraph,
  type GlobalLinksResponse,
  type MeshEventsPage,
  type MeshFeatureCollection,
  type MeshGraph,
  MESH_WINDOW,
  MESH_WINDOW_QUERY,
  type MeshNode,
  type MeshLink,
  type MeshWindow,
} from './mesh';

const json = async <T>(path: string, signal: AbortSignal): Promise<T> => {
  const res = await fetch(`${GRID_API_BASE}${path}`, {
    signal,
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
};

/**
 * The corridor view: the authoritative in-region roster plus the self-contained subgraph
 * (in-region nodes ∪ one-hop neighbours, and every edge with an endpoint inside). Two small
 * requests, ~100 KB together — this is what loads on arrival.
 */
export async function fetchRegionGraph(
  window: MeshWindow,
  signal: AbortSignal
): Promise<MeshGraph> {
  // MESH_WINDOW_QUERY, never the window key itself — the feed parses this with Go's
  // time.ParseDuration, which reads `30d` as a parse error and quietly serves 72h.
  const q = `?window=${encodeURIComponent(MESH_WINDOW_QUERY[window])}`;
  const [nodes, links] = await Promise.all([
    json<MeshFeatureCollection>(`/places/${HAZARD_AREA}/map/mesh_node.geojson`, signal),
    json<MeshFeatureCollection>(`/places/${HAZARD_AREA}/map/mesh_link.geojson${q}`, signal),
  ]);
  return buildRegionGraph(nodes, links);
}

/** Hard cap on the node-roster paging — a runaway `nextPageToken` must not loop forever. */
const MAX_EVENT_PAGES = 8;

/**
 * The global node roster: every mesh node The Grid knows, with its identity, position and
 * (for the handful that have one) its monitor reading. ~110 KB gzipped across three pages.
 *
 * Deliberately NOT part of arrival: the page paints the corridor from the two small place
 * layers first, then pulls this in the background. It serves two consumers — the
 * position-less repeaters of ours the place feed can't carry (`deriveMonitoredStrays`) and,
 * if the reader pans out, the whole-mesh backdrop — so it is fetched once and shared rather
 * than paged twice.
 *
 * ⚠️ `pageSize` caps at 200 server-side; larger values are accepted and ignored.
 */
export async function fetchMeshEvents(signal: AbortSignal): Promise<MeshEventsPage['events']> {
  const events: MeshEventsPage['events'] = [];
  let token = '';
  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const qs = `?layer=MESH&pageSize=200${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
    const res = await json<MeshEventsPage>(`/events${qs}`, signal);
    events.push(...(res.events ?? []));
    token = res.nextPageToken ?? '';
    if (!token) break;
  }
  return events;
}

/**
 * The whole observed mesh, for the faint backdrop behind the corridor. The link list alone
 * is ~400 KB gzipped over MESH_WINDOW — context rather than the subject — so the page calls
 * this only once the reader pans past the corridor, passing the events it already holds.
 */
export async function fetchGlobalGraph(
  events: MeshEventsPage['events'],
  known: Set<string>,
  signal: AbortSignal
): Promise<{ nodes: MeshNode[]; links: MeshLink[] }> {
  const links = await json<GlobalLinksResponse>(
    `/mesh/links?window=${encodeURIComponent(MESH_WINDOW_QUERY[MESH_WINDOW])}`,
    signal
  );
  return buildGlobalGraph(links, events, known);
}

/**
 * The monitor archive for a set of repeaters, fanned out one request per node — The Grid
 * takes a single `node` per call by design.
 *
 * Called ONLY for repeaters that actually carry a monitor (`node.admin != null`), which is
 * about half the corridor: asking for the rest would be N pointless round-trips to learn
 * something the corridor fetch already told us.
 *
 * `Promise.allSettled`, not `all`: one monitor's archive failing must not blank the chart
 * for the other six. A rejected node comes back as an empty series, which renders as "no
 * history retained" rather than as a flat line at zero.
 */
export async function fetchTelemetry(
  keys: string[],
  from: Date,
  to: Date,
  signal: AbortSignal
): Promise<TelemetrySeries[]> {
  const qs = `&from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
  const settled = await Promise.allSettled(
    keys.map((k) =>
      json<TelemetryResponse>(`/mesh/telemetry?node=${encodeURIComponent(k)}${qs}`, signal)
    )
  );
  return settled.map((r, i) => buildSeries(keys[i], r.status === 'fulfilled' ? r.value : null));
}
