/**
 * The Grid data service (data.sierragridteam.org) — typed API shapes + shared
 * constants/helpers. (Formerly info.ersn.net, still a supported CNAME alias; the
 * ERSN_* symbol names predate the rename and are kept as-is.)
 *
 * The site fetches NO feed data at build time — every page renders live data in the
 * browser (see docs/architecture/data-feed.md). This module is just the typed API shapes,
 * the API base + NWS zones, and the service-area test; the checked-in JSON snapshots are
 * test fixtures only (the screenshot harness mocks the feed with them).
 */
import { serviceAreaBounds } from '../config/coverage';

export const ERSN_API_BASE =
  import.meta.env?.PUBLIC_ERSN_API_BASE ?? 'https://data.sierragridteam.org/api/v1';

/**
 * NWS Sacramento forecast zones covering the service area (the feed filters
 * `/weather/alerts?zones=…` to these, FR-2):
 *   CAZ067 / CAZ069 — Tuolumne + the Mother Lode foothills up to the Sierra crest
 *   CAZ019          — lower Calaveras / Stanislaus (the western/low edge, Angels Camp)
 *   CAZ072          — Alpine / high Sierra (the Hwy 4 high country: Bear Valley, Ebbetts)
 * Edit here to change alert coverage — single source of truth for the whole site.
 */
export const NWS_ZONES = ['CAZ019', 'CAZ067', 'CAZ069', 'CAZ072'] as const;

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

export interface ErsnSnapshot {
  /** ISO timestamp when the browser assembled this snapshot from live fetches. */
  fetchedAt: string;
  roads: RoadsResponse | null;
  weather: WeatherResponse | null;
  alerts: AlertsResponse | null;
}

// ---- Helpers ----

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
