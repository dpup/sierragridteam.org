/**
 * info.ersn.net hazard-aggregation client + types + derivations.
 *
 * The hazard API (CHANGELOG 2026-06-26/27) normalizes wildfire, evacuation, weather,
 * seismic, road, and scanner data into one RFC 7946 GeoJSON model with a common
 * `properties` envelope + a comparable INFO..EXTREME severity scale. This module is
 * the SERVER/BUILD side: build-time fetch → typed snapshot → SSR; the client island
 * refreshes live. Mirrors src/lib/ersn.ts (never throws; checked-in fallback).
 *
 * IMPORTANT (data honesty): the `road_incident` layer is the region-wide Mother Lode
 * CHP feed, and `weather_alert` uses the server's area-zone config (which still
 * includes an out-of-area zone) — so we re-filter both to S.I.E.R.R.A's actual
 * service area / NWS zones and recompute severity locally. We never surface an
 * out-of-area "Report of Fire" as a foothill emergency.
 */
import fallback from '../data/hazards-snapshot.json';
import { ERSN_API_BASE, NWS_ZONES, isInServiceArea } from './ersn';

/** Hazard-aggregation area slug (configured server-side in prefab.yaml). */
export const HAZARD_AREA = 'calaveras';

// ---- GeoJSON types (RFC 7946 + the common properties envelope) ----

export type Severity = 'INFO' | 'LOW' | 'MODERATE' | 'SEVERE' | 'EXTREME';

export interface HazardSource {
  id: string;
  name: string;
  attribution?: string;
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
  /** true if produced from a live fetch; false if the checked-in fallback. */
  live: boolean;
  area: string;
  situation: Situation | null;
  layers: Record<string, HazardLayer | null>;
  scanners: Scanner[] | null;
}

export const fallbackHazards = fallback as unknown as HazardsSnapshot;

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

const ALL_LAYERS = [...STREAM_LAYERS, 'road_segment'] as const;

// ---- Fetching (build-time, server-side) ----

const TIMEOUT_MS = 9000;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${ERSN_API_BASE}${path}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`info.ersn.net ${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const getSituation = (area: string = HAZARD_AREA) =>
  fetchJson<Situation>(`/situation/${area}`);
export const getScanners = (area: string = HAZARD_AREA) =>
  fetchJson<Scanner[]>(`/scanners/${area}`);
export const getHazardLayer = (layer: string, area: string = HAZARD_AREA) =>
  fetchJson<HazardLayer>(`/hazards/${area}/${layer}.geojson`);

/**
 * Build-time snapshot of the hazard situation. Tries live fetches; falls back
 * per-section to the checked-in snapshot. Never throws (CI/build resilience).
 */
export async function buildSituationSnapshot(): Promise<HazardsSnapshot> {
  if (import.meta.env?.ERSN_FETCH_AT_BUILD === '0') {
    return { ...fallbackHazards };
  }

  const [situationR, scannersR, ...layerR] = await Promise.allSettled([
    getSituation(),
    getScanners(),
    ...ALL_LAYERS.map((l) => getHazardLayer(l)),
  ]);

  const layers: Record<string, HazardLayer | null> = {};
  ALL_LAYERS.forEach((l, i) => {
    const r = layerR[i];
    layers[l] = r.status === 'fulfilled' ? r.value : (fallbackHazards.layers?.[l] ?? null);
  });

  const situation =
    situationR.status === 'fulfilled' ? situationR.value : fallbackHazards.situation;
  const scanners = scannersR.status === 'fulfilled' ? scannersR.value : fallbackHazards.scanners;
  const live =
    situationR.status === 'fulfilled' &&
    ALL_LAYERS.every((_, i) => layerR[i].status === 'fulfilled');

  return { fetchedAt: nowIso(), live, area: HAZARD_AREA, situation, layers, scanners };
}

function nowIso(): string {
  try {
    return new Date().toISOString();
  } catch {
    return fallbackHazards.fetchedAt;
  }
}

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
  wildfires: number;
  /** null = evacuation source unavailable (honest "unknown", never implied 0). */
  evacuations: number | null;
  evacuationStatus: string;
  weatherAlerts: number;
  fireWeather: string; // NORMAL | ELEVATED | RED_FLAG | UNKNOWN
  earthquakes: number;
  roadIncidents: number;
  syncedAt: string | null;
  live: boolean;
}

/** Locally-recomputed summary (honest counts from filtered features). */
export function deriveSituationSummary(snapshot: HazardsSnapshot): SituationSummary {
  const stream = deriveStream(snapshot);
  const evacLayer = snapshot.layers?.evacuation ?? null;
  const evacStatus = evacLayer?.metadata?.source_status ?? 'UNAVAILABLE';
  const evacFeatures = layerFeatures(snapshot, 'evacuation');
  const fwFeature = (snapshot.layers?.fire_weather?.features ?? [])[0];
  // The hazard fire_weather layer reports state as e.g. "normal"/"red-flag" (lowercase,
  // hyphenated) — normalize to the canonical NORMAL/ELEVATED/RED_FLAG enum.
  const fireState = (fwFeature?.properties.fire_weather?.state ?? 'unknown')
    .toUpperCase()
    .replace(/-/g, '_');

  return {
    highestRank: stream.reduce((m, f) => Math.max(m, rankOf(f)), 0),
    wildfires: layerFeatures(snapshot, 'wildfire').length,
    evacuations: evacStatus === 'UNAVAILABLE' ? null : evacFeatures.length,
    evacuationStatus: evacStatus,
    weatherAlerts: layerFeatures(snapshot, 'weather_alert').length,
    fireWeather: fireState,
    earthquakes: layerFeatures(snapshot, 'earthquake').length,
    roadIncidents: layerFeatures(snapshot, 'road_incident').length,
    syncedAt: snapshot.situation?.generated_at ?? snapshot.fetchedAt ?? null,
    live: snapshot.live,
  };
}

export interface BannerState {
  active: boolean;
  tone: Tone;
  label: string; // e.g. "Active Wildfire", "Evacuation Warning"
  headline: string;
  detail?: string;
  hasEvacuation: boolean;
}

/**
 * Site-wide emergency banner state. The banner is intrusive (every page), so it has a
 * HIGH, life-safety-only bar: it fires ONLY on an active evacuation or an active
 * wildfire. Both are server-scoped to the area (and we re-filter), so the trigger is
 * trustworthy on BOTH the SSR and client paths. It deliberately does NOT fire on
 * region-wide road incidents, weather advisories, or the rollup's region-wide
 * `highest_severity` (those live on /live) — so an out-of-area "Report of Fire" can
 * never raise a county-wide alarm. Returns { active:false } when calm.
 */
export function deriveBanner(snapshot: HazardsSnapshot): BannerState {
  const evac = layerFeatures(snapshot, 'evacuation');
  const wildfire = layerFeatures(snapshot, 'wildfire');
  const top = evac[0] ?? wildfire[0];
  if (!top) {
    return { active: false, tone: 'ok', label: '', headline: '', hasEvacuation: false };
  }
  return {
    active: true,
    tone: 'alarm',
    label: top.properties.kind || 'Active hazard',
    headline: top.properties.headline,
    detail: top.properties.area_label,
    hasEvacuation: evac.length > 0,
  };
}
