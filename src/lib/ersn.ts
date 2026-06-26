/**
 * info.ersn.net data client + types.
 *
 * Strategy (see docs/architecture/data-feed.md): fetch at BUILD time (server-side,
 * no CORS limit) and bake a typed snapshot into the HTML. A checked-in fallback
 * snapshot keeps builds working offline / when the API is down. The browser then
 * refreshes live where CORS allows; on failure it keeps the build-time snapshot.
 *
 * This module is the SERVER/BUILD side. Browser refresh lives in island scripts.
 */
import fallback from '../data/ersn-snapshot.json';
import { serviceAreaBounds, incidentArea } from '../config/coverage';

export const ERSN_API_BASE =
  import.meta.env?.PUBLIC_ERSN_API_BASE ?? 'https://info.ersn.net/api/v1';

/**
 * NWS forecast zones for the foothills (design's specified scope). The feed filters
 * `/weather/alerts?zones=…` to these (FR-2). Edit here to change alert coverage.
 */
export const NWS_ZONES = ['CAZ064', 'CAZ065', 'CAZ258', 'CAZ259'] as const;

// ---- Types (mirror the real API responses captured 2026-06-26) ----

export interface RoadAlert {
  type: string;
  severity: string;
  classification: string;
  title: string;
  description: string;
  condensedSummary: string;
  startTime: string | null;
  endTime: string | null;
  /** Null on some Caltrans-sourced alerts. */
  lastUpdated: string | null;
  location?: { latitude: number; longitude: number };
  locationDescription?: string;
  impact?: string;
  duration?: string;
  timeReported?: string;
  distanceToRouteMeters?: number;
  metadata?: Record<string, string>;
}

export interface Road {
  id: string;
  name: string;
  section: string;
  status: string;
  statusExplanation: string;
  durationMinutes: number;
  distanceKm: number;
  congestionLevel: string;
  delayMinutes: number;
  chainControl: string;
  alerts: RoadAlert[];
}

export interface RoadsResponse {
  roads: Road[];
  lastUpdated: string;
}

export interface WeatherLocation {
  locationId: string;
  locationName: string;
  weatherMain: string;
  weatherDescription: string;
  weatherIcon: string;
  temperatureCelsius: number;
  feelsLikeCelsius: number;
  humidityPercent: number;
  windSpeedKmh: number;
  windDirectionDegrees: number;
  visibilityKm: number;
  alerts: unknown[];
}

/**
 * Authoritative NWS fire-weather classification (FR-3). `state` is the canonical
 * enum: FIRE_WEATHER_STATE_UNSPECIFIED | NORMAL | ELEVATED | RED_FLAG.
 */
export interface FireWeather {
  state: string;
  sourceEvent: string;
  headline: string;
  senderName: string;
  effective: string | null;
  expires: string | null;
  zones: string[];
}

export interface WeatherResponse {
  weatherData: WeatherLocation[];
  lastUpdated: string;
  /** Present since FR-3 shipped; older snapshots may omit it. */
  fireWeather?: FireWeather;
}

/** NWS / OpenWeatherMap alert — real shape from `/weather/alerts` (FR-2). */
export interface WeatherAlert {
  id?: string;
  senderName?: string;
  event?: string;
  description?: string;
  tags?: string[];
  headline?: string;
  summary?: string;
  details?: string;
  /** NWS | OPENWEATHERMAP */
  source?: string;
  /** INFO | WARNING | CRITICAL */
  severity?: string;
  zones?: string[];
  startTime?: string;
  endTime?: string;
  [key: string]: unknown;
}

export interface AlertsResponse {
  alerts: WeatherAlert[];
  lastUpdated: string;
}

/** A region-wide CHP/Caltrans dispatch incident — `/incidents/{area}` (FR-7). */
export interface Incident {
  id: string;
  /** INCIDENT | CLOSURE */
  type: string;
  /** INFO | WARNING | CRITICAL */
  severity: string;
  location?: { latitude: number; longitude: number };
  locationDescription: string;
  description: string;
  /** ACTIVE | … */
  status: string;
  logNumber: string;
  started: string | null;
  lastUpdated: string;
  area: string;
}

export interface IncidentsResponse {
  incidents: Incident[];
  lastUpdated: string;
  area: string;
}

export interface ErsnSnapshot {
  /** ISO timestamp when this snapshot was produced. */
  fetchedAt: string;
  /** true if produced from a live fetch; false if the checked-in fallback. */
  live: boolean;
  roads: RoadsResponse | null;
  weather: WeatherResponse | null;
  alerts: AlertsResponse | null;
  /** Region-wide CHP/Caltrans incidents (FR-7); may be null on older snapshots. */
  incidents: IncidentsResponse | null;
}

export type FireWeatherState = 'normal' | 'elevated' | 'red-flag';

export interface OperationalStatus {
  relaySites: number;
  coverageCounties: number;
  activeAlertCount: number;
  fireWeather: FireWeatherState;
  /** True only if the feed didn't classify fire-weather (missing/unspecified); the
   *  feed now provides this (FR-3), so this is normally false. Never fabricated. */
  fireWeatherPlaceholder: boolean;
  /** lastUpdated from the feed, or null if unknown. */
  syncedAt: string | null;
  live: boolean;
}

// ---- Fetching (build-time, server-side) ----

const TIMEOUT_MS = 8000;

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${ERSN_API_BASE}${path}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`info.ersn.net ${path} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const getRoads = () => fetchJson<RoadsResponse>('/roads');
export const getWeather = () => fetchJson<WeatherResponse>('/weather');
export const getAlerts = () =>
  fetchJson<AlertsResponse>(`/weather/alerts?zones=${NWS_ZONES.join(',')}`);
export const getIncidents = (area: string = incidentArea) =>
  fetchJson<IncidentsResponse>(`/incidents/${area}`);

/** The checked-in fallback, typed. */
export const fallbackSnapshot = fallback as unknown as ErsnSnapshot;

/**
 * Produce the snapshot used to render the site. Tries live fetches; falls back
 * per-section to the checked-in snapshot. Never throws — a failed build-time
 * fetch must not break the build (CI resilience).
 */
export async function buildSnapshot(): Promise<ErsnSnapshot> {
  // Deterministic / offline-dev mode: use the checked-in snapshot as-is (it carries
  // its own `live` flag from when it was captured) and skip the network. Used by the
  // screenshot harness so SSR is byte-stable. A genuine build-time fetch FAILURE below
  // is what sets live=false (and surfaces the "last known" honesty), not this switch.
  if (import.meta.env?.ERSN_FETCH_AT_BUILD === '0') {
    return { ...fallbackSnapshot };
  }

  const [roadsR, weatherR, alertsR, incidentsR] = await Promise.allSettled([
    getRoads(),
    getWeather(),
    getAlerts(),
    getIncidents(),
  ]);

  const roads = roadsR.status === 'fulfilled' ? roadsR.value : fallbackSnapshot.roads;
  const weather = weatherR.status === 'fulfilled' ? weatherR.value : fallbackSnapshot.weather;
  const alerts = alertsR.status === 'fulfilled' ? alertsR.value : fallbackSnapshot.alerts;
  const incidents =
    incidentsR.status === 'fulfilled' ? incidentsR.value : fallbackSnapshot.incidents;
  // `live` gates the home tiles' "Synced" label and tracks the core feeds (roads,
  // weather, alerts). Incidents is supplementary — its hiccup falls back quietly.
  const live =
    roadsR.status === 'fulfilled' &&
    weatherR.status === 'fulfilled' &&
    alertsR.status === 'fulfilled';

  return {
    fetchedAt: nowIso(),
    live,
    roads,
    weather,
    alerts,
    incidents,
  };
}

// new Date() is unavailable in some sandboxes at module-eval; guard it.
function nowIso(): string {
  try {
    return new Date().toISOString();
  } catch {
    return fallbackSnapshot.fetchedAt;
  }
}

// ---- Derivations ----

/**
 * Active weather/emergency alert count for the home "Active Alerts" tile.
 * Weather alerts ONLY — matches the design's NWS-alert tile and the client refresh
 * (which fetches /weather/alerts). Road incidents are surfaced separately on /alerts
 * (RoadConditions), not counted here, so SSR and client stay in lockstep.
 */
export function countActiveAlerts(snapshot: ErsnSnapshot): number {
  // Double optional-chain: proto3/JSON omits empty repeated fields, so a 0-alert
  // response can be `{ lastUpdated }` with no `alerts` key (object present, array absent).
  return snapshot.alerts?.alerts?.length ?? 0;
}

/** Canonical fire-weather enum (FR-3) → the site's display state. */
const FIRE_STATE_MAP: Record<string, FireWeatherState> = {
  NORMAL: 'normal',
  ELEVATED: 'elevated',
  RED_FLAG: 'red-flag',
};

/**
 * Fire-weather state, from the feed's authoritative `weather.fireWeather.state`
 * (FR-3). If the feed omits it or returns UNSPECIFIED we fall back to a conservative
 * 'normal' flagged as a placeholder — never fabricating an unconfirmed Red Flag.
 */
export function deriveFireWeather(snapshot: ErsnSnapshot): {
  state: FireWeatherState;
  placeholder: boolean;
} {
  const raw = snapshot.weather?.fireWeather?.state;
  const mapped = raw ? FIRE_STATE_MAP[raw] : undefined;
  if (mapped) return { state: mapped, placeholder: false };
  return { state: 'normal', placeholder: true };
}

/** True if a lat/long sits inside the foothill service area (see coverage.ts). */
export function isInServiceArea(loc?: { latitude: number; longitude: number } | null): boolean {
  if (!loc) return false;
  const { minLat, maxLat, minLng, maxLng } = serviceAreaBounds;
  return (
    loc.latitude >= minLat &&
    loc.latitude <= maxLat &&
    loc.longitude >= minLng &&
    loc.longitude <= maxLng
  );
}

const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, INFO: 2 };
const rank = (sev: string) => SEVERITY_RANK[(sev ?? '').toUpperCase()] ?? 3;
const bySeverity = (a: Incident, b: Incident) => rank(a.severity) - rank(b.severity);

/**
 * Split the region-wide incident feed into incidents inside the service area vs the
 * wider Mother Lode region (each sorted most-severe first). An incident with no
 * coordinates can't be geolocated, so it's grouped under "wider region" (honest:
 * we don't claim it's local). Pure — unit-tested.
 */
export function splitIncidents(snapshot: ErsnSnapshot): {
  inArea: Incident[];
  wider: Incident[];
} {
  const all = snapshot.incidents?.incidents ?? [];
  const inArea: Incident[] = [];
  const wider: Incident[] = [];
  for (const i of all) (isInServiceArea(i.location) ? inArea : wider).push(i);
  return { inArea: inArea.sort(bySeverity), wider: wider.sort(bySeverity) };
}

export function deriveOperationalStatus(
  snapshot: ErsnSnapshot,
  owned: { relaySites: number; coverageCounties: number }
): OperationalStatus {
  const fire = deriveFireWeather(snapshot);
  const syncedAt =
    snapshot.alerts?.lastUpdated ??
    snapshot.weather?.lastUpdated ??
    snapshot.roads?.lastUpdated ??
    null;
  return {
    relaySites: owned.relaySites,
    coverageCounties: owned.coverageCounties,
    activeAlertCount: countActiveAlerts(snapshot),
    fireWeather: fire.state,
    fireWeatherPlaceholder: fire.placeholder,
    syncedAt,
    live: snapshot.live,
  };
}
