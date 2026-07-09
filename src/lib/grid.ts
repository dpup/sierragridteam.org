/**
 * The Grid data service (data.sierragridteam.org) — typed shapes for the region-wide
 * `/conditions` feed (current weather + fire-weather state). The Grid consolidated onto one
 * place-scoped `/api/v1` surface in 2026-07; the hazard/place layers and the place summary
 * live in `hazards.ts`. This module holds only the non-hazard conditions band + the shared
 * API base.
 *
 * The site fetches NO feed data at build time — every page renders live data in the browser
 * (see docs/architecture/data-feed.md). The checked-in `src/data/*.json` are test fixtures
 * only (the screenshot harness mocks the feed with them).
 */

export const GRID_API_BASE =
  import.meta.env?.PUBLIC_GRID_API_BASE ?? 'https://data.sierragridteam.org/api/v1';

// ---- Types (mirror the real API responses captured 2026-07-09) ----

/** One monitored town in the `/conditions` band. */
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
}

/**
 * Authoritative NWS fire-weather classification. `state` is the canonical enum:
 * FIRE_WEATHER_STATE_UNSPECIFIED | NORMAL | ELEVATED | RED_FLAG.
 */
export interface FireWeather {
  state: string;
  sourceEvent?: string;
  headline?: string;
  senderName?: string;
  effective?: string | null;
  expires?: string | null;
  zones?: string[];
}

/**
 * `/conditions` — region-wide current weather for the monitored towns plus the
 * authoritative fire-weather state. Replaced the old `/weather` endpoint (the town array is
 * now `weather`, was `weatherData`); weather ALERTS moved to the `weather_alert` hazard
 * layer (see hazards.ts), so there is no `alerts` field here.
 */
export interface ConditionsResponse {
  weather: WeatherLocation[];
  fireWeather?: FireWeather;
  lastUpdated: string;
}

/** The browser-assembled non-hazard snapshot passed into the /live view model. */
export interface GridSnapshot {
  /** ISO timestamp when the browser assembled this snapshot from live fetches. */
  fetchedAt: string;
  conditions: ConditionsResponse | null;
}
