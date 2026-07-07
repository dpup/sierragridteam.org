/**
 * The Grid (data.sierragridteam.org) hazard-aggregation client + types + derivations.
 *
 * The hazard API (CHANGELOG 2026-06-26/27) normalizes wildfire, evacuation, weather,
 * seismic, road, and scanner data into one RFC 7946 GeoJSON model with a common
 * `properties` envelope + a comparable INFO..EXTREME severity scale. These are PURE types
 * + derivations — no build-time fetch (the browser fetches live and feeds the snapshot in).
 *
 * IMPORTANT (data honesty): the `road_incident` layer is the region-wide Mother Lode
 * CHP feed, and `weather_alert` uses the server's area-zone config (which still
 * includes an out-of-area zone) — so we re-filter both to S.I.E.R.R.A's actual
 * service area / NWS zones and recompute severity locally. We never surface an
 * out-of-area "Report of Fire" as a foothill emergency.
 */
import { NWS_ZONES, isInServiceArea } from './grid';

/**
 * Hazard-aggregation area slug (configured server-side in prefab.yaml). Renamed
 * `calaveras` → `ebbetts-pass` on 2026-07-06 (the corridor spans Calaveras + Tuolumne,
 * so the old county-name slug was a misnomer); the old slug now 404s.
 */
export const HAZARD_AREA = 'ebbetts-pass';

// ---- GeoJSON types (RFC 7946 + the common properties envelope) ----

export type Severity = 'INFO' | 'LOW' | 'MODERATE' | 'SEVERE' | 'EXTREME';

export interface HazardSource {
  id: string;
  name: string;
  attribution?: string;
}

/**
 * Per-event provenance. `source_url` is the authoritative page for THIS specific event —
 * the CAL FIRE incident page for a wildfire, the Genasys zone viewer for an evacuation —
 * present on some feeds; surfaced as the card's "More information" link. (Distinct from a
 * layer's `metadata.source_url`, which is the whole feed's home page, not one incident.)
 */
export interface HazardProvenance {
  source_url?: string;
}

/** Common envelope on every hazard feature + the typed per-kind blocks. */
export interface HazardProps {
  id: string;
  layer: string;
  kind: string;
  category?: string;
  severity: Severity | string;
  severity_rank: number;
  headline: string;
  status?: string;
  description?: string;
  effective?: string | null;
  expires?: string | null;
  updated_at?: string | null;
  area_label?: string;
  source: HazardSource;
  provenance?: HazardProvenance;
  incident?: { log_number?: string };
  weather?: { event?: string; source?: string; zones?: string[] };
  fire_weather?: { state?: string };
  road?: {
    road_id?: string;
    congestion?: string;
    delay_minutes?: number;
    duration_minutes?: number;
    distance_km?: number;
  };
  earthquake?: { magnitude?: number; depth_km?: number; felt?: number | null };
  wildfire?: { acres?: number; containment?: number; county?: string; has_perimeter?: boolean };
  evacuation?: { zone_id?: string; level?: string; event_type?: string; county?: string };
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
    generated_at: string;
    source_status: 'OK' | 'STALE' | 'UNAVAILABLE';
    schema_version?: number;
    attribution?: string;
    source_url?: string;
    last_source_update?: string;
  };
}

export interface SituationLayer {
  layer: string;
  source_status: 'OK' | 'STALE' | 'UNAVAILABLE';
  feature_count: number;
  highest_severity?: Severity | string;
  attribution?: string;
  source_url?: string;
  last_source_update?: string;
}

export interface Situation {
  area: string;
  area_name: string;
  generated_at: string;
  summary: {
    highest_severity: Severity | string;
    highest_severity_rank: number;
    severity_counts: Record<string, number>;
    total_features: number;
    active_evacuations: number | null;
    evacuation_status: 'OK' | 'STALE' | 'UNAVAILABLE' | string;
    top_headlines: Array<{
      layer: string;
      severity: string;
      severity_rank: number;
      headline: string;
      source: string;
    }>;
  };
  layers: SituationLayer[];
}

export interface Scanner {
  feed_id: string;
  channel_label: string;
  agency: string;
  broadcastify_url: string;
}

export interface HazardsSnapshot {
  fetchedAt: string;
  area: string;
  situation: Situation | null;
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
  LOW: 1,
  MODERATE: 2,
  SEVERE: 3,
  EXTREME: 4,
};

export function rankOf(f: HazardFeature): number {
  if (typeof f.properties.severity_rank === 'number') return f.properties.severity_rank;
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

// ---- Service-area / zone filtering (data honesty) ----

function pointInServiceArea(f: HazardFeature): boolean {
  const g = f.geometry;
  if (!g || g.type !== 'Point') return true; // non-points are server-area-scoped already
  const c = g.coordinates as number[];
  return isInServiceArea({ longitude: c[0], latitude: c[1] });
}

function weatherAlertInZones(f: HazardFeature): boolean {
  const zones = f.properties.weather?.zones;
  if (!zones || zones.length === 0) return true; // no zone info → keep (don't over-filter)
  return zones.some((z) => (NWS_ZONES as readonly string[]).includes(z));
}

/** True if a feature is genuinely relevant to the foothill service area. */
export function isRelevant(f: HazardFeature): boolean {
  if (f.properties.layer === 'road_incident') return pointInServiceArea(f);
  if (f.properties.layer === 'weather_alert') return weatherAlertInZones(f);
  return true;
}

/** Filtered features for a single layer (relevance + region scoping applied). */
export function layerFeatures(snapshot: HazardsSnapshot, layer: string): HazardFeature[] {
  return (snapshot.layers?.[layer]?.features ?? []).filter(isRelevant);
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
    return String(b.properties.updated_at ?? b.properties.effective ?? '').localeCompare(
      String(a.properties.updated_at ?? a.properties.effective ?? '')
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
   * `source_status` and the evacuation no-data-vs-error split (CHANGELOG 2026-06-29).
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
    snapshot.layers?.[layer]?.metadata?.source_status ?? 'UNAVAILABLE';
  const countOrUnknown = (layer: string): number | null =>
    statusOf(layer) === 'UNAVAILABLE' ? null : layerFeatures(snapshot, layer).length;

  const fwFeature = (snapshot.layers?.fire_weather?.features ?? [])[0];
  // The hazard fire_weather layer reports state as e.g. "normal"/"red-flag" (lowercase,
  // hyphenated) — normalize to the canonical NORMAL/ELEVATED/RED_FLAG enum.
  const fireState = (fwFeature?.properties.fire_weather?.state ?? 'unknown')
    .toUpperCase()
    .replace(/-/g, '_');

  return {
    highestRank: stream.reduce((m, f) => Math.max(m, rankOf(f)), 0),
    wildfires: countOrUnknown('wildfire'),
    evacuations: countOrUnknown('evacuation'),
    evacuationStatus: statusOf('evacuation'),
    weatherAlerts: countOrUnknown('weather_alert'),
    fireWeather: fireState,
    syncedAt: snapshot.situation?.generated_at ?? snapshot.fetchedAt ?? null,
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
