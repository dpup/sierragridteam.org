/**
 * mesh.ts — The Grid's MeshCore topology feed: typed shapes + PURE derivations for the
 * /mesh network map. No DOM, no fetch, no MapLibre here (so it unit-tests and bundles
 * into the client island alike); the browser assembles a snapshot and passes it in.
 *
 * The Grid models the mesh as three surfaces (docs/architecture/mesh-feed.md):
 *
 *   /places/{area}/map/mesh_node.geojson   — the nodes located INSIDE the place. The
 *                                            authoritative in-region roster, including a
 *                                            node with no observed links.
 *   /places/{area}/map/mesh_link.geojson   — a self-contained subgraph: Point features for
 *     ?window=                               the in-region nodes ∪ their one-hop neighbours
 *                                            (`mesh.inRegion` tells them apart), plus
 *                                            LineString edges with ≥1 endpoint in region.
 *   /mesh/links?window=  +  /events?layer=MESH
 *                                          — the WHOLE mesh: a coordinate-free link list
 *                                            joined against the global node roster. Heavy
 *                                            (~260 KB gzipped), so /mesh loads it lazily,
 *                                            only once the reader pans past the corridor.
 *
 * Honesty model (docs/content-style-guide.md §10): an edge is an OBSERVATION — "we heard
 * these two repeaters relay for each other", weighted by how often and how recently. It is
 * not a routing table and a faded edge is NOT a claim that the link is down. When a layer's
 * `sourceStatus` is `UNAVAILABLE` the derivations return `null` counts (→ "Unknown"), never
 * a `0` — an empty graph and a broken feed must never render the same way.
 */

export type MeshWindow = '24h' | '72h' | '7d' | '30d' | 'all';

/**
 * The single window /mesh reads. There is deliberately NO window picker: the recency fade
 * already IS the time control, and continuously — a link heard 10 minutes ago and one heard
 * three weeks ago are both on the map, distinguishable at a glance, with no mode to choose.
 * A picker only let a reader hide data from themselves, and made the map's meaning depend on
 * a control most would never touch.
 *
 * 30d is wide enough to show the intermittent long-haul shots that make the network's reach
 * legible (a link seen once in a month is often the most interesting thing on the map) while
 * still being a span a reader can reason about — unlike `all`, whose denominator drifts with
 * however long The Grid has been collecting.
 */
export const MESH_WINDOW: MeshWindow = '30d';

/** Human labels for the window control. */
export const MESH_WINDOW_LABELS: Record<MeshWindow, string> = {
  '24h': '24 hours',
  '72h': '72 hours',
  '7d': '7 days',
  '30d': '30 days',
  all: 'All time',
};

/** Nominal span of a window, in days — for the "up N of the last M days" reliability read. */
export const MESH_WINDOW_DAYS: Record<MeshWindow, number | null> = {
  '24h': 1,
  '72h': 3,
  '7d': 7,
  '30d': 30,
  all: null,
};

// ---- Feed types (mirror the real API, captured 2026-08-06) ----

export type MeshSourceStatus = 'OK' | 'STALE' | 'UNAVAILABLE';

/** `properties.mesh` on a mesh_node / mesh_link Point feature. */
export interface MeshNodeDetail {
  publicKey: string;
  /** companion | repeater | room_server | sensor */
  nodeType?: string;
  name?: string;
  /** Last-heard signal, frozen at the node's last presence revision — indicative, not live. */
  snr?: number;
  rssi?: number;
  hopCount?: number;
  gateways?: string[];
  /**
   * Only present on the mesh_link subgraph: `true` = inside the place, `false` = a one-hop
   * neighbour pulled in so the region's outward links aren't amputated at the boundary.
   * Absent on mesh_node.geojson (every feature there is in-region by construction).
   */
  inRegion?: boolean;
}

/** `properties.meshLink` on a mesh_link LineString feature. */
export interface MeshLinkDetail {
  a: string;
  b: string;
  /** Total receptions on the link within the window. */
  observations: number;
  /** Distinct days the link was seen in the window — "up 6 of the last 30 days". */
  daysActive: number;
  firstSeen: string;
  lastSeen: string;
  /** Peak SNR ever observed on the link (dB). */
  bestSnr?: number;
}

export interface MeshFeatureProps {
  id: string;
  layer: string;
  kind?: string;
  category?: string;
  severity?: string;
  severityRank?: number;
  headline?: string;
  status?: string;
  updatedAt?: string;
  source?: { id?: string; name?: string; url?: string; attribution?: string };
  mesh?: MeshNodeDetail;
  meshLink?: MeshLinkDetail;
}

export interface MeshFeature {
  type: 'Feature';
  geometry:
    | { type: 'Point'; coordinates: [number, number] }
    | { type: 'LineString'; coordinates: [number, number][] }
    | null;
  properties: MeshFeatureProps;
}

export interface MeshFeatureCollection {
  type: 'FeatureCollection';
  features: MeshFeature[];
  metadata?: {
    layer?: string;
    area?: string;
    generatedAt?: string;
    sourceStatus?: MeshSourceStatus | string;
    schemaVersion?: number;
  };
}

/** `GET /mesh/links` — the global, coordinate-free link list. */
export interface GlobalLinksResponse {
  window?: string;
  generatedAt?: string;
  links: MeshLinkDetail[];
}

/** One page of `GET /events?layer=MESH` — the global node roster. */
export interface MeshEventsPage {
  events: {
    id: string;
    headline?: string;
    category?: string;
    status?: string;
    geometry?: { centroid?: { lat: number; lng: number } } | null;
    detail?: { mesh?: MeshNodeDetail };
  }[];
  nextPageToken?: string;
}

// ---- The derived graph the map + panel render from ----

export interface MeshNode {
  /** Full Ed25519 public key, hex — the node's stable identity across every surface. */
  publicKey: string;
  name: string;
  nodeType: string;
  lng: number;
  lat: number;
  /** True for a node inside the Ebbetts Pass corridor — the ones we render at full strength. */
  inRegion: boolean;
  /** True for a S.I.E.R.R.A-operated node (advertised name prefix). */
  ours: boolean;
  status: string;
  updatedAt?: string;
  snr?: number;
  rssi?: number;
  gatewayCount: number;
}

export interface MeshLink {
  id: string;
  a: string;
  b: string;
  coordinates: [number, number][];
  observations: number;
  daysActive: number;
  firstSeen: string;
  lastSeen: string;
  bestSnr?: number;
  /** Endpoint names, for the popup headline. */
  headline: string;
  /** True when at least one endpoint sits inside the corridor. */
  inRegion: boolean;
  /**
   * True for a link that LEAVES the corridor (exactly one endpoint inside). These are the
   * long-haul shots out to the wider mesh — genuinely impressive, and also visually
   * overwhelming: they are far longer than any corridor link and there are twice as many.
   * Drawn demoted so the corridor stays the subject, same principle as the neighbour dots.
   */
  outward: boolean;
}

export interface MeshGraph {
  nodes: MeshNode[];
  links: MeshLink[];
  /** Worst status across the fetched layers — drives the honest "Unknown" states. */
  sourceStatus: MeshSourceStatus;
  generatedAt: string | null;
}

/**
 * S.I.E.R.R.A's own nodes advertise with a `SIERRA ` name prefix. This is the ONLY signal
 * the feed carries for ownership — MeshCore has no operator field — so treat it as a naming
 * convention, not an assertion of control, and never build a claim about network
 * performance on it (content-style-guide §10).
 */
const OURS_PREFIX = /^S\.?I\.?E\.?R\.?R\.?A\b/i;

export const isOurNode = (name: string): boolean => OURS_PREFIX.test(name.trim());

/**
 * The name to SHOW for a node, on the map and in the roster alike.
 *
 * Two things get stripped. The `SIERRA ` prefix is redundant on a page about the
 * S.I.E.R.R.A mesh and makes every label collide with its neighbour. Emoji and other
 * pictographs are stripped because the basemap's glyph set (Noto Sans Regular) has no
 * coverage for them and MapLibre renders a tofu box — operators do put emoji in advert
 * names ("SIERRA Eagle One 🦅"). Falls back to the raw name if stripping empties it.
 */
export function displayName(name: string): string {
  const stripped = name
    .replace(OURS_PREFIX, '')
    .replace(/[\u{1F000}-\u{1FAFF}\u{2190}-\u{2BFF}\u{FE0F}\u{20E3}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped || name.trim();
}

// ---- Recency: the visual language of "alive" ----

/**
 * Recency tiers, by age of a link's `lastSeen`. These drive BOTH the static styling
 * (brighter/heavier = fresher) and the pulse rate, so the map encodes freshness twice —
 * a reader who can't perceive the motion still gets the whole signal from the static
 * treatment. `cold` is deliberately still drawn: on a mesh where a backbone repeater
 * adverts every 12 hours, "quiet" is not "gone".
 */
export const RECENCY_TIERS = ['live', 'recent', 'fading', 'cold'] as const;
export type MeshRecency = (typeof RECENCY_TIERS)[number];

/** Upper age bound (hours) for each tier. */
const RECENCY_MAX_HOURS: Record<MeshRecency, number> = {
  live: 1,
  recent: 6,
  fading: 24,
  cold: Infinity,
};

/** Panel/legend copy — states what the tier MEANS (heard), never that a link is down. */
export const RECENCY_LABELS: Record<MeshRecency, string> = {
  live: 'Heard in the last hour',
  recent: 'Heard in the last 6 hours',
  fading: 'Heard in the last day',
  cold: 'Heard in the last 30 days',
};

export function linkRecency(lastSeen: string, nowMs: number): MeshRecency {
  const t = Date.parse(lastSeen);
  if (!Number.isFinite(t)) return 'cold';
  const ageH = (nowMs - t) / 3_600_000;
  for (const tier of RECENCY_TIERS) if (ageH < RECENCY_MAX_HOURS[tier]) return tier;
  return 'cold';
}

/**
 * Link weight in 0..1 from the reception count, on a log scale — a backbone link at 482
 * observations should read heavier than a one-shot, but not 482× heavier. Drives line
 * width, so a rare long-haul shot stays a visible hairline rather than vanishing.
 */
export function linkWeight(observations: number): number {
  const obs = Math.max(0, observations);
  return Math.min(1, Math.log10(obs + 1) / 3);
}

// ---- Building the graph ----

const num = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

const worstStatus = (statuses: (string | undefined)[]): MeshSourceStatus => {
  if (statuses.some((s) => s === 'UNAVAILABLE')) return 'UNAVAILABLE';
  if (statuses.some((s) => s === 'STALE')) return 'STALE';
  return 'OK';
};

const nodeFromFeature = (f: MeshFeature, fallbackInRegion: boolean): MeshNode | null => {
  const g = f.geometry;
  if (!g || g.type !== 'Point') return null;
  const m = f.properties.mesh;
  if (!m?.publicKey) return null;
  const [lng, lat] = g.coordinates;
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  // `mesh.name` is the node's only identity. (We used to fall back to `areaLabel`, but The
  // Grid emptied that for mesh events on 2026-08-11 — a node name is not a location, and
  // the service doesn't reverse geocode, so the field was a duplicate and a false claim.)
  const name = (m.name || '').trim() || 'Unnamed node';
  return {
    publicKey: m.publicKey,
    name,
    nodeType: m.nodeType || 'unknown',
    lng,
    lat,
    inRegion: m.inRegion ?? fallbackInRegion,
    ours: isOurNode(name),
    status: f.properties.status || 'ACTIVE',
    updatedAt: f.properties.updatedAt,
    snr: num(m.snr),
    rssi: num(m.rssi),
    gatewayCount: m.gateways?.length ?? 0,
  };
};

const linkFromFeature = (f: MeshFeature, inRegionKeys: Set<string>): MeshLink | null => {
  const g = f.geometry;
  if (!g || g.type !== 'LineString' || g.coordinates.length < 2) return null;
  const l = f.properties.meshLink;
  if (!l?.a || !l?.b) return null;
  const aIn = inRegionKeys.has(l.a);
  const bIn = inRegionKeys.has(l.b);
  return {
    id: f.properties.id || `mesh_link:${l.a}:${l.b}`,
    a: l.a,
    b: l.b,
    coordinates: g.coordinates,
    observations: l.observations ?? 0,
    daysActive: l.daysActive ?? 0,
    firstSeen: l.firstSeen,
    lastSeen: l.lastSeen,
    bestSnr: num(l.bestSnr),
    headline: f.properties.headline || '',
    inRegion: aIn || bIn,
    outward: aIn !== bIn,
  };
};

/**
 * Merge the two place layers into one graph. `mesh_node` is the authoritative in-region
 * roster (it includes a node with no observed links, which the subgraph cannot); the
 * `mesh_link` subgraph supplies the neighbours and every edge. A node present in both wins
 * from mesh_node — that layer knows it is in-region for certain.
 */
export function buildRegionGraph(
  nodeFc: MeshFeatureCollection | null,
  linkFc: MeshFeatureCollection | null
): MeshGraph {
  const byKey = new Map<string, MeshNode>();

  // The roster (mesh_node) is the ONE authority on who is in the corridor. The link
  // subgraph carries its own `inRegion` flag, but the two layers are generated at slightly
  // different moments and can disagree — which is exactly how /mesh came to show 11
  // corridor repeaters while the homepage tile (roster only) showed 10. Whenever we have a
  // roster, membership is defined by it alone; a subgraph node the roster doesn't list is
  // rendered as a neighbour, so every surface counts the same set.
  const rosterKeys = new Set<string>();
  for (const f of nodeFc?.features ?? []) {
    const key = f.properties.mesh?.publicKey;
    if (key) rosterKeys.add(key);
  }
  const rosterIsAuthority = rosterKeys.size > 0;

  for (const f of linkFc?.features ?? []) {
    const n = nodeFromFeature(f, false);
    if (!n) continue;
    byKey.set(n.publicKey, {
      ...n,
      inRegion: rosterIsAuthority ? rosterKeys.has(n.publicKey) : n.inRegion,
    });
  }
  // Second, so the authoritative roster overwrites the subgraph's copy.
  for (const f of nodeFc?.features ?? []) {
    const n = nodeFromFeature(f, true);
    if (n) byKey.set(n.publicKey, { ...n, inRegion: true });
  }

  const inRegionKeys = new Set(
    [...byKey.values()].filter((n) => n.inRegion).map((n) => n.publicKey)
  );
  const links: MeshLink[] = [];
  const seen = new Set<string>();
  for (const f of linkFc?.features ?? []) {
    const l = linkFromFeature(f, inRegionKeys);
    if (!l || seen.has(l.id)) continue;
    seen.add(l.id);
    // Rebuild the headline from the endpoints we resolved rather than trusting the feed's,
    // so a link popup names its repeaters exactly the way the pins and the roster do —
    // operator prefix dropped, emoji stripped (the map's glyph set renders them as tofu).
    const a = byKey.get(l.a);
    const b = byKey.get(l.b);
    if (a && b) l.headline = `${displayName(a.name)} ↔ ${displayName(b.name)}`;
    links.push(l);
  }

  return {
    nodes: [...byKey.values()],
    links,
    sourceStatus: worstStatus([nodeFc?.metadata?.sourceStatus, linkFc?.metadata?.sourceStatus]),
    generatedAt: linkFc?.metadata?.generatedAt ?? nodeFc?.metadata?.generatedAt ?? null,
  };
}

/**
 * Join the coordinate-free global link list against the global node roster into a
 * whole-mesh backdrop graph. Links whose endpoints we have no coordinates for are dropped
 * — an unresolved hop is a real thing on this mesh (a repeater we only ever hear relayed)
 * and we'd rather omit it than invent a position for it.
 *
 * `known` is the region graph's keys: those nodes are already drawn at full strength, so
 * the backdrop skips them and keeps only genuinely-new context.
 */
export function buildGlobalGraph(
  linksRes: GlobalLinksResponse | null,
  events: MeshEventsPage['events'],
  known: Set<string>
): { nodes: MeshNode[]; links: MeshLink[] } {
  const coords = new Map<string, MeshNode>();
  for (const e of events) {
    const m = e.detail?.mesh;
    const c = e.geometry?.centroid;
    const key = m?.publicKey || e.id.replace(/^meshcore:/, '');
    if (!key || !c || !Number.isFinite(c.lng) || !Number.isFinite(c.lat)) continue;
    const name = (m?.name || '').trim() || 'Unnamed node';
    coords.set(key, {
      publicKey: key,
      name,
      nodeType: m?.nodeType || e.category || 'unknown',
      lng: c.lng,
      lat: c.lat,
      inRegion: false,
      ours: isOurNode(name),
      status: e.status || 'ACTIVE',
      snr: num(m?.snr),
      rssi: num(m?.rssi),
      gatewayCount: m?.gateways?.length ?? 0,
    });
  }

  const links: MeshLink[] = [];
  const used = new Set<string>();
  for (const l of linksRes?.links ?? []) {
    const a = coords.get(l.a);
    const b = coords.get(l.b);
    if (!a || !b) continue;
    // Already drawn at full strength by the region graph — don't double-draw it faintly.
    if (known.has(l.a) && known.has(l.b)) continue;
    links.push({
      id: `global:${l.a}:${l.b}`,
      a: l.a,
      b: l.b,
      coordinates: [
        [a.lng, a.lat],
        [b.lng, b.lat],
      ],
      observations: l.observations ?? 0,
      daysActive: l.daysActive ?? 0,
      firstSeen: l.firstSeen,
      lastSeen: l.lastSeen,
      bestSnr: num(l.bestSnr),
      headline: `${a.name} ↔ ${b.name}`,
      inRegion: false,
      outward: false,
    });
    used.add(l.a);
    used.add(l.b);
  }

  return {
    nodes: [...coords.values()].filter((n) => used.has(n.publicKey) && !known.has(n.publicKey)),
    links,
  };
}

// ---- GeoJSON for MapLibre (with the derived styling properties baked in) ----

type FC = { type: 'FeatureCollection'; features: unknown[] };

export function nodesToGeoJSON(nodes: MeshNode[]): FC {
  return {
    type: 'FeatureCollection',
    features: nodes.map((n) => ({
      type: 'Feature',
      id: n.publicKey,
      geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
      properties: {
        publicKey: n.publicKey,
        name: n.name,
        shortName: displayName(n.name),
        nodeType: n.nodeType,
        inRegion: n.inRegion,
        ours: n.ours,
        status: n.status,
        snr: n.snr ?? null,
        rssi: n.rssi ?? null,
        gatewayCount: n.gatewayCount,
      },
    })),
  };
}

export function linksToGeoJSON(links: MeshLink[], nowMs: number): FC {
  return {
    type: 'FeatureCollection',
    features: links.map((l) => ({
      type: 'Feature',
      id: l.id,
      geometry: { type: 'LineString', coordinates: l.coordinates },
      properties: {
        id: l.id,
        a: l.a,
        b: l.b,
        headline: l.headline,
        observations: l.observations,
        daysActive: l.daysActive,
        firstSeen: l.firstSeen,
        lastSeen: l.lastSeen,
        bestSnr: l.bestSnr ?? null,
        inRegion: l.inRegion,
        outward: l.outward,
        recency: linkRecency(l.lastSeen, nowMs),
        weight: linkWeight(l.observations),
      },
    })),
  };
}

// ---- Panel derivations ----

export interface MeshSummary {
  /** Null whenever the feed is UNAVAILABLE — "Unknown", never a false zero. */
  regionNodes: number | null;
  ourNodes: number | null;
  neighbourNodes: number | null;
  regionLinks: number | null;
  /** Links heard within the `live` tier — the "right now" pulse count. */
  liveLinks: number | null;
  /** Most recent `lastSeen` across every region link, ISO — the freshness stamp. */
  lastHeard: string | null;
  /** Best SNR observed on any region link, dB. */
  bestSnr: number | null;
  sourceStatus: MeshSourceStatus;
}

/**
 * The nodes every count is derived from: in the corridor AND currently reported ACTIVE.
 * Shared so the /mesh tiles, the roster and the homepage tile can never drift apart.
 */
const corridorNodes = (graph: MeshGraph): MeshNode[] =>
  graph.nodes.filter((n) => n.inRegion && n.status === 'ACTIVE');

export function deriveMeshSummary(graph: MeshGraph, nowMs: number): MeshSummary {
  if (graph.sourceStatus === 'UNAVAILABLE') {
    return {
      regionNodes: null,
      ourNodes: null,
      neighbourNodes: null,
      regionLinks: null,
      liveLinks: null,
      lastHeard: null,
      bestSnr: null,
      sourceStatus: 'UNAVAILABLE',
    };
  }
  const region = corridorNodes(graph);
  const links = graph.links;
  let lastHeard = 0;
  let bestSnr = -Infinity;
  let live = 0;
  for (const l of links) {
    const t = Date.parse(l.lastSeen);
    if (Number.isFinite(t) && t > lastHeard) lastHeard = t;
    if (l.bestSnr != null && l.bestSnr > bestSnr) bestSnr = l.bestSnr;
    if (linkRecency(l.lastSeen, nowMs) === 'live') live++;
  }
  return {
    regionNodes: region.length,
    ourNodes: region.filter((n) => n.ours).length,
    neighbourNodes: graph.nodes.length - region.length,
    regionLinks: links.length,
    liveLinks: live,
    lastHeard: lastHeard ? new Date(lastHeard).toISOString() : null,
    bestSnr: Number.isFinite(bestSnr) ? bestSnr : null,
    sourceStatus: graph.sourceStatus,
  };
}

/** One row in the panel's node roster, sorted busiest-first. */
export interface MeshNodeRow {
  node: MeshNode;
  /** Number of observed links touching this node, within the window. */
  degree: number;
  /** Most recent reception on any of its links, ISO — or null if it has no observed links. */
  lastHeard: string | null;
  recency: MeshRecency | null;
}

export function deriveNodeRows(graph: MeshGraph, nowMs: number): MeshNodeRow[] {
  const degree = new Map<string, number>();
  const last = new Map<string, number>();
  for (const l of graph.links) {
    const t = Date.parse(l.lastSeen);
    for (const k of [l.a, l.b]) {
      degree.set(k, (degree.get(k) ?? 0) + 1);
      if (Number.isFinite(t) && t > (last.get(k) ?? 0)) last.set(k, t);
    }
  }
  return corridorNodes(graph)
    .map((n) => {
      const t = last.get(n.publicKey) ?? 0;
      const lastHeard = t ? new Date(t).toISOString() : null;
      return {
        node: n,
        degree: degree.get(n.publicKey) ?? 0,
        lastHeard,
        recency: lastHeard ? linkRecency(lastHeard, nowMs) : null,
      };
    })
    .sort((x, y) => y.degree - x.degree || x.node.name.localeCompare(y.node.name));
}

/**
 * The homepage "Relay Nodes" tile: how many S.I.E.R.R.A repeaters inside the corridor the
 * mesh is currently hearing. Mirrors `deriveActiveAlertsTile` in hazards.ts so the two live
 * tiles behave identically — `Unknown`/muted when the source is down, a real count otherwise.
 *
 * NOTE the tile counts NODES HEARD, not sites confirmed up: a site can hold more than one
 * node, and an advert proves a node was heard, not that the site is healthy. That's why the
 * tile says "repeaters heard" and why FR-5 (per-relay-site health) stays open —
 * docs/architecture/data-feed.md.
 */
export function deriveRelayNodesTile(graph: MeshGraph): {
  value: string;
  state: 'ok' | 'muted';
} {
  if (graph.sourceStatus === 'UNAVAILABLE') return { value: 'Unknown', state: 'muted' };
  const n = corridorNodes(graph).filter((x) => x.ours).length;
  return { value: `${n} Active`, state: n > 0 ? 'ok' : 'muted' };
}

/** Counts per recency tier across the region links — the legend's live tally. */
export function deriveRecencyCounts(graph: MeshGraph, nowMs: number): Record<MeshRecency, number> {
  const out: Record<MeshRecency, number> = { live: 0, recent: 0, fading: 0, cold: 0 };
  for (const l of graph.links) out[linkRecency(l.lastSeen, nowMs)]++;
  return out;
}

// ---- Display formatting ----

/**
 * Compact "how long ago" for a reception stamp: `just now`, `14 min ago`, `3 h ago`,
 * `2 d ago`. Returns an em dash for a missing/unparseable stamp — never a guess.
 */
export function agoLabel(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '—';
  const mins = Math.floor((nowMs - t) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** `repeater` → `Repeater`, `room_server` → `Room server`. */
export function nodeTypeLabel(t: string): string {
  const s = t.replace(/_/g, ' ').trim();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Node';
}

/** A pubkey shortened for display — first 8 hex chars, the prefix MeshCore itself shows. */
export const shortKey = (k: string): string => k.slice(0, 8);
