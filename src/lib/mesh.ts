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
 *                                            (~355 KB gzipped over MESH_WINDOW), so /mesh
 *                                            loads it lazily, only once the reader pans
 *                                            past the corridor.
 *
 * Honesty model (docs/content-style-guide.md §10): an edge is an OBSERVATION — "we heard
 * these two repeaters relay for each other", weighted by how often and how recently. It is
 * not a routing table and a faded edge is NOT a claim that the link is down. When a layer's
 * `sourceStatus` is `UNAVAILABLE` the derivations return `null` counts (→ "Unknown"), never
 * a `0` — an empty graph and a broken feed must never render the same way.
 */

import { cToF } from './units';

export type MeshWindow = '24h' | '72h' | '7d' | '30d';

/**
 * The single window /mesh reads. There is deliberately NO window picker: the recency fade
 * already IS the time control, and continuously — a link heard 10 minutes ago and one heard
 * three weeks ago are both on the map, distinguishable at a glance, with no mode to choose.
 * A picker only let a reader hide data from themselves, and made the map's meaning depend on
 * a control most would never touch.
 *
 * 30d is wide enough to show the intermittent long-haul shots that make the network's reach
 * legible (a link seen once in a month is often the most interesting thing on the map) while
 * still being a span a reader can reason about.
 */
export const MESH_WINDOW: MeshWindow = '30d';

/**
 * ⚠️ The `?window=` value The Grid actually understands — NOT the key above.
 *
 * The feed parses the parameter with Go's `time.ParseDuration`, which has **no day unit**
 * and **no error path**: `7d`, `30d` and `all` all fail to parse and fall back to the 72h
 * default, silently and with a 200. So the site spent its whole life asking for `30d` and
 * being served 72 hours of links while every label on the page said "30 days" — a page
 * claiming more than its data (content-style-guide §10), and the reason the map showed
 * about a fifth of the corridor's observed links (114 → 145 edges, 40 → 53 nodes).
 *
 * Hours are the widest unit Go parses, so every window is expressed in hours here. Anything
 * added to `MeshWindow` MUST get an hours value — a day/week suffix is not a parse error you
 * will see, it is a quietly narrower map.
 */
export const MESH_WINDOW_QUERY: Record<MeshWindow, string> = {
  '24h': '24h',
  '72h': '72h',
  '7d': '168h',
  '30d': '720h',
};

/** Human labels for the window control. */
export const MESH_WINDOW_LABELS: Record<MeshWindow, string> = {
  '24h': '24 hours',
  '72h': '72 hours',
  '7d': '7 days',
  '30d': '30 days',
};

/** Nominal span of a window, in days — for the "up N of the last M days" reliability read. */
export const MESH_WINDOW_DAYS: Record<MeshWindow, number> = {
  '24h': 1,
  '72h': 3,
  '7d': 7,
  '30d': 30,
};

// ---- Feed types (mirror the real API, captured 2026-08-06) ----

export type MeshSourceStatus = 'OK' | 'STALE' | 'UNAVAILABLE';

/**
 * The operator monitor's own reading of a repeater — battery, enclosure temperature and
 * the counters — as reported by a Raspberry Pi on the site and archived by The Grid.
 *
 * This is a DIFFERENT class of fact from everything else in this file. The rest of the mesh
 * feed is *observation*: we heard this node, we heard these two relay. `admin` is a node
 * telling us about itself through a monitor someone installed. That is why it can answer
 * "will this site last the night" when a link graph cannot, and why its absence means "no
 * monitor here", never "unhealthy".
 *
 * ⚠️ TWO SHAPES, ONE MESSAGE. `mesh_node.geojson` carries it flat at `mesh.admin` with
 * int64s as JSON numbers; `/events?layer=MESH` nests it at `mesh.telemetry.admin` with
 * int64s as JSON STRINGS (protobuf's JSON mapping). `adminFrom()` below reads either, and
 * every numeric read goes through `num()`, which coerces. Don't reach into `.admin`
 * directly.
 *
 * Only the fields the site renders are typed. The wire carries the full packet counter set
 * (`packetsSent`, `floodDups`, `recvErrors`, …); those are diagnostics with no consumer
 * here, and typing them would be dead code.
 */
export interface MeshAdminTelemetry {
  /** Who runs the monitor — named in the panel, because provenance is the point. */
  reporterId?: string;
  /** The MONITOR's stamp for this reading. The clock to trust; not our receive time. */
  reportedAt?: string;
  batteryVolts?: number | string | null;
  batteryPercent?: number | string | null;
  /**
   * `measured` (a real gauge) or `estimated` (inferred from voltage). Every S.I.E.R.R.A
   * repeater reports `estimated` today, so the panel must say so — an inferred number
   * printed in the same weight as a measured one is a quiet false claim.
   */
  batteryPercentSource?: string;
  temperatureC?: number | string | null;
}

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
  /** Monitor telemetry as `mesh_node.geojson` carries it — flat. */
  admin?: MeshAdminTelemetry;
  /** …and as `/events?layer=MESH` carries it — nested. Read both via `adminFrom()`. */
  telemetry?: { admin?: MeshAdminTelemetry };
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

/**
 * One page of `GET /events?layer=MESH` — the global node roster. Shape re-captured
 * 2026-09-16: `mesh` sits at the TOP level of an event. It was previously read from
 * `detail.mesh`, which no longer exists on the wire — every backdrop node was silently
 * falling back to "Unnamed node" with no SNR and `ours: false`.
 */
export interface MeshEventsPage {
  events: {
    id: string;
    headline?: string;
    category?: string;
    status?: string;
    geometry?: { centroid?: { lat: number; lng: number } } | null;
    mesh?: MeshNodeDetail;
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
  /**
   * The operator monitor's latest reading, or `null` where nobody monitors this repeater.
   * `null` is a statement about OUR coverage, never about the node's health.
   */
  admin: MeshAdminTelemetry | null;
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

/**
 * A finite number from the wire, or `undefined`. Accepts a numeric STRING: protobuf's JSON
 * mapping renders every int64 that way (`uptimeSeconds: "1653982"`), so a field's type
 * depends on its width rather than its meaning. Never coerces `null`, `''` or a
 * non-numeric string to 0 — an unread gauge and a zero reading must not collapse together.
 */
const num = (v: unknown): number | undefined => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

/**
 * The monitor reading off either surface — flat on `mesh_node.geojson`, nested under
 * `telemetry` on `/events`. Returns `null` when the node carries neither, which is the
 * common case: 7 of the corridor's 14 repeaters have no monitor.
 */
const adminFrom = (m: MeshNodeDetail | undefined): MeshAdminTelemetry | null =>
  m?.admin ?? m?.telemetry?.admin ?? null;

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
    admin: adminFrom(m),
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
    const m = e.mesh;
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
      admin: adminFrom(m),
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
    // Cheap insurance: a feature with NaN coordinates poisons a whole map source.
    features: nodes
      .filter((n) => Number.isFinite(n.lng) && Number.isFinite(n.lat))
      .map((n) => ({
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

/**
 * Below this, a battery reads as a genuine risk state and takes the alert orange — the one
 * non-Donate orange the design system sanctions outside a hazard (CLAUDE.md rule 2). Set
 * from operator experience: these repeaters routinely run a summer night down into the
 * teens and recover after sunrise, so a higher threshold would cry wolf nightly.
 */
export const LOW_BATTERY_PCT = 10;

/**
 * A repeater is "heard" for the headline count if one of its links carried traffic inside
 * this window. Twelve hours is chosen against the network's own rhythm: a backbone repeater
 * can advert as little as twice a day, so anything tighter reports healthy sites as missing
 * — the failure mode FR-8 was raised for. It is a reception window, never an uptime claim.
 */
export const HEARD_WITHIN_HOURS = 12;

/**
 * The battery level at which a repeater joins the "needs attention" strip — a watch floor,
 * NOT the alert threshold. The two are deliberately different numbers:
 *
 *   • `ATTENTION_BATTERY_PCT` (20) is "worth a look", styled in brass.
 *   • `LOW_BATTERY_PCT` (10) is "genuinely at risk" and takes the alert orange. A calm
 *     corridor shows no orange at all.
 *
 * Collapsing them into one number forces a choice between crying wolf and never surfacing a
 * decline until it is too late.
 *
 * Lowered from 60 to 20 (2026-09-17). At 60 the strip fired on a normal summer night: these
 * sites routinely discharge into the teens and recover after sunrise, so "needs attention"
 * would have been permanently populated with repeaters doing exactly what they are supposed
 * to — which is how a warning strip stops being read at all.
 */
export const ATTENTION_BATTERY_PCT = 20;

/** A monitored repeater's latest reading, normalised for display. */
export interface MeshNodeHealth {
  /** Charge, 0–100, or null where the monitor could not read it. Never a substituted 0. */
  percent: number | null;
  /** True when `percent` is inferred from voltage rather than read from a gauge. */
  estimated: boolean;
  volts: number | null;
  /** Enclosure temperature in °F — the box in the sun, not the weather. */
  tempF: number | null;
  /** `percent` is known AND below the risk threshold. Unknown is never "low". */
  low: boolean;
  /** Known and under the watch floor but not yet at risk — brass, not orange. */
  watch: boolean;
  /** The monitor's own stamp for the reading. */
  reportedAt: string | null;
  reporterId: string | null;
}

/**
 * The reading for one node, or `null` where nobody monitors it. The distinction is the
 * whole point: `null` means "we have no monitor on this site", which is a statement about
 * S.I.E.R.R.A's coverage. It must never render as a zero, a dash dressed up as calm, or
 * anything a reader could mistake for "this repeater is fine".
 */
export function deriveHealth(node: MeshNode): MeshNodeHealth | null {
  const a = node.admin;
  if (!a) return null;
  const percent = num(a.batteryPercent) ?? null;
  const tempC = num(a.temperatureC);
  return {
    percent,
    // Absent source is treated as estimated: claiming a reading is measured when the feed
    // didn't say so is the direction that overclaims.
    estimated: a.batteryPercentSource !== 'measured',
    volts: num(a.batteryVolts) ?? null,
    tempF: tempC == null ? null : cToF(tempC),
    low: percent != null && percent < LOW_BATTERY_PCT,
    watch: percent != null && percent < ATTENTION_BATTERY_PCT && percent >= LOW_BATTERY_PCT,
    reportedAt: a.reportedAt ?? null,
    reporterId: a.reporterId ?? null,
  };
}

/**
 * A repeater, as distinct from a companion (a handheld) or a room server. The count tiles
 * are about fixed relay infrastructure S.I.E.R.R.A manages — someone's handset passing
 * through the corridor with a S.I.E.R.R.A name is not a relay site and must not inflate it.
 */
export const isRepeater = (node: MeshNode): boolean => node.nodeType === 'repeater';

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
  /** Repeaters of ours a monitor reports on, and how many of ours there are in total. */
  monitored: number | null;
  monitorable: number | null;
  /**
   * The weakest battery we hold a reading for, or `null` when no monitored repeater
   * reported a readable charge. `null` is "we don't know", not "everything is full".
   */
  lowestBattery: { percent: number; name: string; low: boolean } | null;
  sourceStatus: MeshSourceStatus;
}

/**
 * The nodes every count is derived from: in the corridor AND currently reported ACTIVE.
 * Shared so the /mesh tiles, the roster and the homepage tile can never drift apart.
 */
const corridorNodes = (graph: MeshGraph): MeshNode[] =>
  graph.nodes.filter((n) => n.inRegion && n.status === 'ACTIVE');

/**
 * The set both count tiles are built on: S.I.E.R.R.A-named REPEATERS in the corridor.
 * Shared so the homepage "Relay Nodes" tile and /mesh's "S.I.E.R.R.A repeaters" tile can
 * never drift — they are the same sentence on two pages.
 */
const ourRepeaters = (graph: MeshGraph): MeshNode[] =>
  corridorNodes(graph).filter((n) => n.ours && isRepeater(n));

/** Every repeater of ours we could hold a reading for. */
const healthCandidates = (graph: MeshGraph): MeshNode[] => ourRepeaters(graph);

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
      monitored: null,
      monitorable: null,
      lowestBattery: null,
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
  // The weakest battery across our monitored repeaters. Unreadable gauges are skipped
  // rather than floored to 0 — one broken sensor must not manufacture an alarm.
  const ours = ourRepeaters(graph);
  const readings = healthCandidates(graph)
    .map((n) => ({ node: n, health: deriveHealth(n) }))
    .filter((r): r is { node: MeshNode; health: MeshNodeHealth } => r.health != null);
  const charged = readings.filter((r) => r.health.percent != null);
  const weakest = charged.length
    ? charged.reduce((a, b) => (b.health.percent! < a.health.percent! ? b : a))
    : null;

  return {
    regionNodes: region.length,
    ourNodes: ours.length,
    neighbourNodes: graph.nodes.length - region.length,
    regionLinks: links.length,
    liveLinks: live,
    lastHeard: lastHeard ? new Date(lastHeard).toISOString() : null,
    bestSnr: Number.isFinite(bestSnr) ? bestSnr : null,
    monitored: readings.length,
    monitorable: healthCandidates(graph).length,
    lowestBattery: weakest
      ? {
          percent: weakest.health.percent!,
          name: displayName(weakest.node.name),
          low: weakest.health.low,
        }
      : null,
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
  /** The monitor reading, or null where this repeater has no monitor. */
  health: MeshNodeHealth | null;
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
  return (
    corridorNodes(graph)
      .map((n) => {
        const t = last.get(n.publicKey) ?? 0;
        const lastHeard = t ? new Date(t).toISOString() : null;
        return {
          node: n,
          degree: degree.get(n.publicKey) ?? 0,
          lastHeard,
          recency: lastHeard ? linkRecency(lastHeard, nowMs) : null,
          health: deriveHealth(n),
        };
      })
      // Busiest first, as before. A repeater with no position sorts by the same rule — it is
      // a roster row like any other, it simply cannot be drawn.
      .sort((x, y) => y.degree - x.degree || x.node.name.localeCompare(y.node.name))
  );
}

/**
 * The homepage "Relay Nodes" tile: how many S.I.E.R.R.A repeaters inside the corridor the
 * mesh is currently hearing. Mirrors `deriveActiveAlertsTile` in hazards.ts so the two live
 * tiles behave identically — `Unknown`/muted when the source is down, a real count otherwise.
 *
 * NOTE the tile counts REPEATERS HEARD, not sites confirmed up: a site can hold more than
 * one node, and an advert proves a node was heard, not that the site is healthy. That's why
 * the tile says "repeaters heard". Companions (handhelds) and room servers are excluded via
 * `isRepeater` even when they advertise a S.I.E.R.R.A name — this tile is about fixed relay
 * infrastructure, and a member's handset passing through must not inflate it.
 *
 * Per-site HEALTH now has a real answer for the repeaters an operator monitors — see
 * `deriveHealth` and the /mesh roster — but it is deliberately not folded into this number:
 * "heard" and "healthy" are independent, and collapsing them would make the tile mean less,
 * not more.
 */
export function deriveRelayNodesTile(graph: MeshGraph): {
  value: string;
  state: 'ok' | 'muted';
} {
  if (graph.sourceStatus === 'UNAVAILABLE') return { value: 'Unknown', state: 'muted' };
  const n = ourRepeaters(graph).length;
  return { value: `${n} Active`, state: n > 0 ? 'ok' : 'muted' };
}

/** Counts per recency tier across the region links — the legend's live tally. */
export function deriveRecencyCounts(graph: MeshGraph, nowMs: number): Record<MeshRecency, number> {
  const out: Record<MeshRecency, number> = { live: 0, recent: 0, fading: 0, cold: 0 };
  for (const l of graph.links) out[linkRecency(l.lastSeen, nowMs)]++;
  return out;
}

/**
 * The "needs attention" strip: repeaters currently outside limits, worst first.
 *
 * Two kinds, because they are genuinely different failures — a repeater can be heard every
 * two minutes while its battery drains, and one can sit at 100% while nothing hears it:
 *   • `battery` — a monitored site under the watch floor.
 *   • `stale`   — nothing heard from it inside HEARD_WITHIN_HOURS.
 *
 * Honesty: `stale` says we have not HEARD it, never that it is down. An unmonitored
 * repeater can never raise a `battery` item — absence of telemetry is not a fault.
 */
export type MeshAttentionKind = 'battery' | 'stale';

export interface MeshAttentionItem {
  node: MeshNode;
  kind: MeshAttentionKind;
  /** `alert` takes the orange; `watch` takes brass. Only a real risk earns the orange. */
  tone: 'alert' | 'watch';
  /** The reading itself — "battery 48%", "not heard in 19 h". */
  detail: string;
}

export function deriveAttention(graph: MeshGraph, nowMs: number): MeshAttentionItem[] {
  if (graph.sourceStatus === 'UNAVAILABLE') return [];
  const items: MeshAttentionItem[] = [];
  for (const row of deriveNodeRows(graph, nowMs)) {
    const { node, health, lastHeard } = row;
    const ageH = lastHeard ? (nowMs - Date.parse(lastHeard)) / 3_600_000 : Infinity;
    if (!lastHeard || ageH >= HEARD_WITHIN_HOURS) {
      items.push({
        node,
        kind: 'stale',
        tone: 'alert',
        detail: lastHeard
          ? `not heard in ${Math.floor(ageH)} h`
          : 'no links observed in this window',
      });
    }
    if (health?.percent != null && health.percent < ATTENTION_BATTERY_PCT) {
      items.push({
        node,
        kind: 'battery',
        tone: health.low ? 'alert' : 'watch',
        detail: `battery ${Math.round(health.percent)}% · below ${ATTENTION_BATTERY_PCT}% floor`,
      });
    }
  }
  // Alerts first, then the lowest battery, then the longest silence.
  const rank = (i: MeshAttentionItem) => (i.tone === 'alert' ? 0 : 1);
  return items.sort((a, b) => rank(a) - rank(b) || a.node.name.localeCompare(b.node.name));
}

/** "10 / 12" for the headline tile — heard recently, out of the corridor's repeaters. */
export function deriveHeardCount(
  graph: MeshGraph,
  nowMs: number
): { heard: number; total: number } | null {
  if (graph.sourceStatus === 'UNAVAILABLE') return null;
  const rows = deriveNodeRows(graph, nowMs);
  const cutoff = nowMs - HEARD_WITHIN_HOURS * 3_600_000;
  return {
    heard: rows.filter((r) => r.lastHeard != null && Date.parse(r.lastHeard) >= cutoff).length,
    total: rows.length,
  };
}

/**
 * Roster ordering. `links` is the default — the busiest repeater is the one carrying the
 * corridor — and the other two are the questions an operator actually arrives with:
 * "which one is lowest?" and "which one have we not heard from?"
 */
export const ROSTER_SORTS = ['links', 'battery', 'stalest'] as const;
export type MeshRosterSort = (typeof ROSTER_SORTS)[number];
export const ROSTER_SORT_LABELS: Record<MeshRosterSort, string> = {
  links: 'Links',
  battery: 'Battery',
  stalest: 'Stalest',
};

export function sortNodeRows(rows: MeshNodeRow[], sort: MeshRosterSort): MeshNodeRow[] {
  const byName = (a: MeshNodeRow, b: MeshNodeRow) => a.node.name.localeCompare(b.node.name);
  const copy = [...rows];
  if (sort === 'battery') {
    // Unmonitored repeaters sort last rather than as 0% — "we have no reading" is not
    // "empty", and floating them to the top would invent an alarm.
    return copy.sort((a, b) => {
      const av = a.health?.percent ?? null;
      const bv = b.health?.percent ?? null;
      if (av == null && bv == null) return byName(a, b);
      if (av == null) return 1;
      if (bv == null) return -1;
      return av - bv || byName(a, b);
    });
  }
  if (sort === 'stalest') {
    // Never heard sorts first: the longest silence there is.
    return copy.sort((a, b) => {
      const at = a.lastHeard ? Date.parse(a.lastHeard) : -Infinity;
      const bt = b.lastHeard ? Date.parse(b.lastHeard) : -Infinity;
      return at - bt || byName(a, b);
    });
  }
  return copy.sort((a, b) => b.degree - a.degree || byName(a, b));
}

/**
 * The map's "heard in" filter. Unlike the rejected window PICKER, this changes nothing about
 * what is fetched — the page always holds MESH_WINDOW of links and this narrows what is
 * DRAWN. The fade still carries recency continuously; this is a way to cut the 30-day
 * accumulation down to "what is carrying traffic right now" without a second request.
 * `30d` is the default, so the page still opens on everything it knows.
 */
export const HEARD_IN_OPTIONS = ['1h', '6h', '24h', '30d'] as const;
export type MeshHeardIn = (typeof HEARD_IN_OPTIONS)[number];
export const HEARD_IN_HOURS: Record<MeshHeardIn, number> = {
  '1h': 1,
  '6h': 6,
  '24h': 24,
  '30d': 24 * 30,
};
export const HEARD_IN_LABELS: Record<MeshHeardIn, string> = {
  '1h': '1h',
  '6h': '6h',
  '24h': '24h',
  '30d': '30d',
};

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
