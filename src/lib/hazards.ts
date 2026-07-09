/**
 * The Grid (data.sierragridteam.org) hazard-aggregation client + types + derivations.
 *
 * The hazard API (CHANGELOG 2026-06-26/27) normalizes wildfire, evacuation, weather,
 * seismic, road, and scanner data into one RFC 7946 GeoJSON model with a common
 * `properties` envelope + a comparable INFO..EXTREME severity scale. These are PURE types
 * + derivations — no build-time fetch (the browser fetches live and feeds the snapshot in).
 *
 * The Grid is now authoritative and place-scoped server-side: every `/places/{area}/map/*`
 * layer is clipped to the ebbetts-pass polygon at ingest (road_incident and weather_alert
 * included, using the same point-in-polygon test as `/places:resolve`), so the client no
 * longer re-filters by service-area bounds or NWS zones — it renders what the place feed
 * returns. We still recompute the honest per-layer counts locally (sourceStatus → null).
 */

/**
 * Hazard-aggregation area slug (configured server-side in prefab.yaml). Renamed
 * `calaveras` → `ebbetts-pass` on 2026-07-06 (the corridor spans Calaveras + Tuolumne,
 * so the old county-name slug was a misnomer); the old slug now 404s.
 */
export const HAZARD_AREA = 'ebbetts-pass';

// ---- GeoJSON types (RFC 7946 + the common properties envelope) ----

export type Severity = 'INFO' | 'MINOR' | 'MODERATE' | 'SEVERE' | 'EXTREME';

export interface HazardSource {
  id: string;
  name: string;
  attribution?: string;
}

/**
 * Per-event provenance. `sourceUrl` is the authoritative page for THIS specific event —
 * the CAL FIRE incident page for a wildfire, the Genasys zone viewer for an evacuation.
 * It is **optional per source** (CAL FIRE / Genasys emit it; CHP road incidents don't), so
 * only render the "More information" link when it's present. (Distinct from a layer's
 * `metadata.sourceUrl`, which is the whole feed's home page, not one incident.)
 */
export interface HazardProvenance {
  sourceUrl?: string;
}

/** Common envelope on every hazard feature + the typed per-kind blocks. */
export interface HazardProps {
  id: string;
  layer: string;
  kind: string;
  category?: string;
  severity: Severity | string;
  severityRank: number;
  headline: string;
  status?: string;
  description?: string;
  effective?: string | null;
  expires?: string | null;
  updatedAt?: string | null;
  areaLabel?: string;
  source: HazardSource;
  provenance?: HazardProvenance;
  incident?: { logNumber?: string };
  weather?: { event?: string; source?: string; zones?: string[] };
  fireWeather?: { state?: string };
  road?: {
    roadId?: string;
    congestion?: string;
    delayMinutes?: number;
    durationMinutes?: number;
    distanceKm?: number;
  };
  earthquake?: { magnitude?: number; depthKm?: number; felt?: number | null };
  wildfire?: { acres?: number; containment?: number; county?: string; hasPerimeter?: boolean };
  evacuation?: { zoneId?: string; level?: string; eventType?: string; county?: string };
  [key: string]: unknown;
}

export interface HazardGeometry {
  type: 'Point' | 'LineString' | 'Polygon' | 'MultiPolygon' | 'MultiLineString';
  coordinates: number[] | number[][] | number[][][] | number[][][][];
}

export interface HazardFeature {
  type: 'Feature';
  geometry: HazardGeometry | null;
  properties: HazardProps;
}

export interface HazardLayer {
  type: 'FeatureCollection';
  features: HazardFeature[];
  metadata: {
    layer: string;
    area: string;
    generatedAt: string;
    sourceStatus: 'OK' | 'STALE' | 'UNAVAILABLE';
    schemaVersion?: number;
    attribution?: string;
    sourceUrl?: string;
    lastSourceUpdate?: string;
  };
}

/** One event line in a place summary's `topEvents`. */
export interface SummaryEvent {
  id: string;
  layer: string;
  severity: string;
  severityRank: number;
  headline: string;
  source: string;
}

/** One hazard-domain rollup in a place summary (fire, evacuation, weather, roads, seismic). */
export interface SummaryDomain {
  domain: string;
  status: 'OK' | 'STALE' | 'UNAVAILABLE' | string;
  highestSeverity: Severity | string;
  activeCount: number;
  headlines: Array<{ id: string; severity: string; headline: string }>;
}

/**
 * `/places/{area}/summary` — the authoritative place rollup. We use it for the "Synced …"
 * timestamp and the fail-loud `activeEvacuations` (int | null); the per-layer counts we
 * still recompute locally from the map layers (deriveSituationSummary) so the tiles and the
 * stream stay in lockstep. For the life-safety wildfire signal, EmergencyBanner reads the
 * `wildfire` map layer directly (authoritative + place-scoped) rather than the `domains`
 * rollup.
 */
export interface PlaceSummary {
  place: string;
  placeId: string;
  placeName: string;
  generatedAt: string;
  mode: string;
  summary: {
    highestSeverity: Severity | string;
    highestSeverityRank: number;
    severityCounts: Record<string, number>;
    totalActive: number;
    activeEvacuations: number | null;
    evacuationStatus: 'OK' | 'STALE' | 'UNAVAILABLE' | string;
    topEvents: SummaryEvent[];
  };
  domains: SummaryDomain[];
}

export interface Scanner {
  feedId: string;
  channelLabel: string;
  agency: string;
  broadcastifyUrl: string;
}

export interface HazardsSnapshot {
  fetchedAt: string;
  area: string;
  summary: PlaceSummary | null;
  layers: Record<string, HazardLayer | null>;
  scanners: Scanner[] | null;
}

/** Layers that feed the prioritized alert stream (road_segment is the road table). */
export const STREAM_LAYERS = [
  'evacuation',
  'wildfire',
  'weather_alert',
  'fire_weather',
  'road_incident',
  'chain_control',
  'earthquake',
] as const;

// ---- Severity ----

export const SEVERITY_RANK: Record<string, number> = {
  INFO: 0,
  MINOR: 1,
  MODERATE: 2,
  SEVERE: 3,
  EXTREME: 4,
};

export function rankOf(f: HazardFeature): number {
  if (typeof f.properties.severityRank === 'number') return f.properties.severityRank;
  return SEVERITY_RANK[String(f.properties.severity).toUpperCase()] ?? 0;
}

export type Tone = 'alarm' | 'elevated' | 'ok' | 'muted';

/** Severity → design tone. Orange (alarm) reserved for SEVERE/EXTREME risk only. */
export function toneForRank(rank: number): Tone {
  if (rank >= 3) return 'alarm';
  if (rank === 2) return 'elevated';
  return 'ok';
}
export const toneFor = (f: HazardFeature): Tone => toneForRank(rankOf(f));

/** "SEVERE" → "Severe" for display. */
export const severityLabel = (s: string): string =>
  s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : '';

// ---- Layer access ----

/**
 * Features for a single layer. The Grid place feed is already clipped to the ebbetts-pass
 * polygon server-side (road_incident and weather_alert included), so there is no client
 * re-filtering — we render exactly what the place feed returns.
 */
export function layerFeatures(snapshot: HazardsSnapshot, layer: string): HazardFeature[] {
  return snapshot.layers?.[layer]?.features ?? [];
}

// ---- Derivations ----

/**
 * The prioritized alert stream: every relevant active hazard, most-urgent first.
 * Excludes road segments (that's the road-conditions table) and a "normal"
 * fire-weather banner (INFO — not an alert).
 */
export function deriveStream(snapshot: HazardsSnapshot): HazardFeature[] {
  const out: HazardFeature[] = [];
  for (const layer of STREAM_LAYERS) {
    for (const f of layerFeatures(snapshot, layer)) {
      if (layer === 'fire_weather' && rankOf(f) === 0) continue; // hide "normal"
      out.push(f);
    }
  }
  return out.sort((a, b) => {
    const dr = rankOf(b) - rankOf(a);
    if (dr !== 0) return dr;
    return String(b.properties.updatedAt ?? b.properties.effective ?? '').localeCompare(
      String(a.properties.updatedAt ?? a.properties.effective ?? '')
    );
  });
}

export interface SituationSummary {
  /** Highest tone present in the locally-relevant stream. */
  highestRank: number;
  /**
   * Counts, or `null` when that layer's source is UNAVAILABLE — so an outage reads as an
   * honest "unknown", never a false `0`/all-clear. A clean empty success (OK, or STALE
   * served from the last good fetch) is a real `0`. Mirrors The Grid's per-layer
   * `sourceStatus` and the evacuation no-data-vs-error split (CHANGELOG 2026-06-29).
   */
  wildfires: number | null;
  evacuations: number | null;
  evacuationStatus: string;
  weatherAlerts: number | null;
  fireWeather: string; // NORMAL | ELEVATED | RED_FLAG | UNKNOWN
  syncedAt: string | null;
}

/** Locally-recomputed summary (honest counts from filtered features). */
export function deriveSituationSummary(snapshot: HazardsSnapshot): SituationSummary {
  const stream = deriveStream(snapshot);

  // A layer's relevant-feature count, or null when its source is UNAVAILABLE (a sync
  // error → "unknown", never a false 0). OK/STALE both yield a real count: a clean empty
  // success is 0; STALE serves the last good fetch. The Grid guarantees an error
  // never replays a cached 0 (CHANGELOG 2026-06-29).
  const statusOf = (layer: string): string =>
    snapshot.layers?.[layer]?.metadata?.sourceStatus ?? 'UNAVAILABLE';
  const countOrUnknown = (layer: string): number | null =>
    statusOf(layer) === 'UNAVAILABLE' ? null : layerFeatures(snapshot, layer).length;

  const fwFeature = (snapshot.layers?.fire_weather?.features ?? [])[0];
  // The hazard fire_weather layer reports state as e.g. "normal"/"red-flag" (lowercase,
  // hyphenated) — normalize to the canonical NORMAL/ELEVATED/RED_FLAG enum.
  const fireState = (fwFeature?.properties.fireWeather?.state ?? 'unknown')
    .toUpperCase()
    .replace(/-/g, '_');

  return {
    highestRank: stream.reduce((m, f) => Math.max(m, rankOf(f)), 0),
    wildfires: countOrUnknown('wildfire'),
    evacuations: countOrUnknown('evacuation'),
    evacuationStatus: statusOf('evacuation'),
    weatherAlerts: countOrUnknown('weather_alert'),
    fireWeather: fireState,
    syncedAt: snapshot.summary?.generatedAt ?? snapshot.fetchedAt ?? null,
  };
}

/**
 * The homepage "Active Alerts" tile: the three alert-grade /live tiles (wildfires +
 * evacuations + weather alerts) collapsed into one honest at-a-glance count. Built from
 * the same `deriveSituationSummary` so the homepage can never say "None" while /live shows
 * active hazards (the whole point — an all-clear that contradicts the live feed is exactly
 * the data-honesty failure the style guide forbids).
 *
 * Honesty rules: a `null` count is a source outage → the tile is "Unknown" (never a false
 * 0/all-clear) UNLESS a known count already proves an alert is live, in which case we show
 * that (an undercount is fine when we're already flagging). Orange (alarm) is reserved for
 * a genuine life-safety hazard — an active wildfire or evacuation; weather-only is elevated.
 */
export function deriveActiveAlertsTile(summary: SituationSummary): {
  value: string;
  state: Tone;
} {
  const parts = [summary.wildfires, summary.evacuations, summary.weatherAlerts];
  let total = 0;
  for (const c of parts) total += c ?? 0;
  const anyUnknown = parts.some((c) => c == null);
  const lifeSafety = (summary.wildfires ?? 0) > 0 || (summary.evacuations ?? 0) > 0;
  if (total > 0) return { value: `${total} Active`, state: lifeSafety ? 'alarm' : 'elevated' };
  if (anyUnknown) return { value: 'Unknown', state: 'muted' };
  return { value: 'None', state: 'ok' };
}
