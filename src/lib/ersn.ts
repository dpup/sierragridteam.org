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

export const ERSN_API_BASE =
  import.meta.env?.PUBLIC_ERSN_API_BASE ?? 'https://info.ersn.net/api/v1';

// ---- Types (mirror the real API responses captured 2026-06-25) ----

export interface RoadAlert {
  type: string;
  severity: string;
  classification: string;
  title: string;
  description: string;
  condensedSummary: string;
  startTime: string | null;
  endTime: string | null;
  lastUpdated: string;
  location?: { latitude: number; longitude: number };
  locationDescription?: string;
  impact?: string;
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

export interface WeatherResponse {
  weatherData: WeatherLocation[];
  lastUpdated: string;
}

/** Weather alert shape is loose (feed currently returns none); model defensively. */
export interface WeatherAlert {
  event?: string;
  severity?: string;
  headline?: string;
  description?: string;
  start?: string;
  end?: string;
  sender?: string;
  [key: string]: unknown;
}

export interface AlertsResponse {
  alerts: WeatherAlert[];
  lastUpdated: string;
}

export interface ErsnSnapshot {
  /** ISO timestamp when this snapshot was produced. */
  fetchedAt: string;
  /** true if produced from a live fetch; false if the checked-in fallback. */
  live: boolean;
  roads: RoadsResponse | null;
  weather: WeatherResponse | null;
  alerts: AlertsResponse | null;
}

export type FireWeatherState = 'normal' | 'elevated' | 'red-flag';

export interface OperationalStatus {
  relaySites: number;
  coverageCounties: number;
  activeAlertCount: number;
  fireWeather: FireWeatherState;
  /** info.ersn.net does not classify Red Flag yet (FR-3) — value is a placeholder. */
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
export const getAlerts = () => fetchJson<AlertsResponse>('/weather/alerts');

/** The checked-in fallback, typed. */
export const fallbackSnapshot = fallback as unknown as ErsnSnapshot;

/**
 * Produce the snapshot used to render the site. Tries live fetches; falls back
 * per-section to the checked-in snapshot. Never throws — a failed build-time
 * fetch must not break the build (CI resilience).
 */
export async function buildSnapshot(): Promise<ErsnSnapshot> {
  if (import.meta.env?.ERSN_FETCH_AT_BUILD === '0') {
    return { ...fallbackSnapshot, live: false };
  }

  const [roadsR, weatherR, alertsR] = await Promise.allSettled([
    getRoads(),
    getWeather(),
    getAlerts(),
  ]);

  const roads = roadsR.status === 'fulfilled' ? roadsR.value : fallbackSnapshot.roads;
  const weather = weatherR.status === 'fulfilled' ? weatherR.value : fallbackSnapshot.weather;
  const alerts = alertsR.status === 'fulfilled' ? alertsR.value : fallbackSnapshot.alerts;
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

/** Count active alerts: weather alerts + road alerts that are on-route/active. */
export function countActiveAlerts(snapshot: ErsnSnapshot): number {
  const weatherAlerts = snapshot.alerts?.alerts.length ?? 0;
  const roadAlerts =
    snapshot.roads?.roads.reduce(
      (n, r) =>
        n +
        r.alerts.filter(
          (a) => a.classification === 'ON_ROUTE' || a.type === 'CLOSURE'
        ).length,
      0
    ) ?? 0;
  return weatherAlerts + roadAlerts;
}

/**
 * Fire-weather state. info.ersn.net does not yet expose an NWS Red Flag
 * classification (FR-3), so this is a conservative placeholder: 'elevated' if any
 * weather alert mentions fire/red flag, otherwise 'normal'. Never fabricates a
 * Red Flag. `fireWeatherPlaceholder` stays true until the feed provides this.
 */
export function deriveFireWeather(snapshot: ErsnSnapshot): {
  state: FireWeatherState;
  placeholder: boolean;
} {
  const alerts = snapshot.alerts?.alerts ?? [];
  const text = alerts
    .map((a) => `${a.event ?? ''} ${a.headline ?? ''}`.toLowerCase())
    .join(' ');
  if (text.includes('red flag')) return { state: 'red-flag', placeholder: false };
  if (text.includes('fire')) return { state: 'elevated', placeholder: false };
  return { state: 'normal', placeholder: true };
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
