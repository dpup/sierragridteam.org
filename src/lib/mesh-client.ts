/**
 * mesh-client.ts — the browser's fetches against The Grid's mesh surfaces, kept out of the
 * page script so the page stays wiring and this stays testable I/O. Nothing here runs at
 * build time (docs/architecture/data-feed.md): /mesh renders live in the browser.
 */
import { GRID_API_BASE } from './grid';
import { HAZARD_AREA } from './hazards';
import {
  buildGlobalGraph,
  buildRegionGraph,
  type GlobalLinksResponse,
  type MeshEventsPage,
  type MeshFeatureCollection,
  type MeshGraph,
  MESH_WINDOW,
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
  const q = `?window=${encodeURIComponent(window)}`;
  const [nodes, links] = await Promise.all([
    json<MeshFeatureCollection>(`/places/${HAZARD_AREA}/map/mesh_node.geojson`, signal),
    json<MeshFeatureCollection>(`/places/${HAZARD_AREA}/map/mesh_link.geojson${q}`, signal),
  ]);
  return buildRegionGraph(nodes, links);
}

/** Hard cap on the node-roster paging — a runaway `nextPageToken` must not loop forever. */
const MAX_EVENT_PAGES = 8;

/**
 * The whole observed mesh, for the faint backdrop behind the corridor. Deliberately NOT
 * fetched on arrival: it's ~260 KB gzipped across the link list plus several pages of node
 * identities, and it is context rather than the subject. The page calls this once the
 * reader pans past the corridor.
 */
export async function fetchGlobalGraph(
  known: Set<string>,
  signal: AbortSignal
): Promise<{ nodes: MeshNode[]; links: MeshLink[] }> {
  const events: MeshEventsPage['events'] = [];
  let token = '';
  for (let page = 0; page < MAX_EVENT_PAGES; page++) {
    const qs = `?layer=MESH&pageSize=200${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
    const res = await json<MeshEventsPage>(`/events${qs}`, signal);
    events.push(...(res.events ?? []));
    token = res.nextPageToken ?? '';
    if (!token) break;
  }
  const links = await json<GlobalLinksResponse>(
    `/mesh/links?window=${encodeURIComponent(MESH_WINDOW)}`,
    signal
  );
  return buildGlobalGraph(links, events, known);
}
