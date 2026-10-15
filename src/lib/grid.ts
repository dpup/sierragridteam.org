/**
 * The Grid data service (data.sierragridteam.org) — typed shapes for the region-wide
 * `/conditions` feed (current weather + fire-weather state) and the county burn status.
 * The Grid consolidated onto one place-scoped `/api/v1` surface in 2026-07; the hazard/place
 * layers and the place summary live in `hazards.ts`. This module holds only the non-hazard
 * conditions band + the shared API base.
 *
 * The site fetches NO feed data at build time — every page renders live data in the browser
 * (see docs/architecture/data-feed.md). The checked-in `src/data/*.json` are test fixtures
 * only (the screenshot harness mocks the feed with them).
 */

/**
 * Base URL for every live fetch.
 *
 * In `astro dev` this defaults to the same-origin `/grid-api` path, which the dev server
 * proxies to The Grid (see `vite.server.proxy` in astro.config.mjs). This used to be load-
 * bearing: The Grid's CORS allowlist named only the production origin and
 * `http://localhost:4321`, so developing from any other hostname (a container port map, a
 * LAN IP, `--host`) failed every live region. The Grid opened CORS to `*` on 2026-08-06,
 * so the proxy is now a convenience — it still keeps dev traffic same-origin and gives one
 * place to point at a local Grid.
 *
 * Builds and `astro preview` use the absolute URL, exactly as production does. Set
 * `PUBLIC_GRID_API_BASE` to override either (e.g. to point dev at a local Grid).
 */
export const GRID_API_BASE =
  import.meta.env?.PUBLIC_GRID_API_BASE ??
  (import.meta.env?.DEV ? '/grid-api' : 'https://data.sierragridteam.org/api/v1');

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

/** One recorded county burn line, called daily and transcribed by The Grid. */
export interface BurnLine {
  id: string;
  name: string;
  /** E.164, e.g. `+12097546600`. Populated even for a line The Grid doesn't read. */
  phone: string;
  burnDay: string;
  observation: {
    message: string;
    transcript: string;
    confidence: number;
    /** When the line was last called. */
    observedAt: string;
  } | null;
}

/**
 * One `BURN_STATUS` event (`/events?layer=BURN_STATUS`) — a county's residential burning
 * status. Ambient and permanently ACTIVE, with no geometry, so it is not a map layer.
 * Enums (captured 2026-10-14): `burnDay` BURN_DAY_UNKNOWN|_YES|_NO|_MARGINAL;
 * `calfireStatus` CALFIRE_BURN_STATUS_UNKNOWN|CALFIRE_BURNING_SUSPENDED|
 * CALFIRE_PERMIT_REQUIRED|CALFIRE_NO_PERMIT_REQUIRED; `permission`
 * BURN_PERMISSION_UNKNOWN|_ALLOWED|_PROHIBITED.
 */
export interface BurnStatusEvent {
  id: string;
  /** "Calaveras County". */
  areaLabel: string;
  /** CAL FIRE's burn-permit status page. */
  canonicalUrl?: string;
  burnStatus: {
    burnDay: string;
    calfireStatus: string;
    /** The Grid's combined answer — deliberately pessimistic, see `burnVerdict`. */
    permission: string;
    calfireEffective?: string | null;
    burnLines: BurnLine[];
  };
}

/** The browser-assembled non-hazard snapshot passed into the /live view model. */
export interface GridSnapshot {
  /** ISO timestamp when the browser assembled this snapshot from live fetches. */
  fetchedAt: string;
  conditions: ConditionsResponse | null;
  /** One event per county; `null` when the fetch failed (→ "unknown", never omitted). */
  burn: BurnStatusEvent[] | null;
}

// ---- Burn status ----

/**
 * The one answer a resident needs: may I burn today, and if not, who says so.
 *
 * - `calfire`   — CAL FIRE has suspended burn permits. It overrides the county outright, so
 *                 the daily burn-day call is moot for as long as it lasts (all summer, and
 *                 much of spring and fall).
 * - `district`  — no CAL FIRE suspension, but the county air district has called a no-burn
 *                 day. In winter this is about air quality, not fire risk.
 * - `allowed`   — both authorities permit burning today.
 * - `elevation` — a "marginal" burn day: allowed only above an elevation the line states
 *                 (typically 3,500 ft). Only the line's message carries the threshold, so
 *                 we send people to the line rather than guess which side they're on.
 * - `unknown`   — anything else, including a burn-line reading older than The Grid's 36h
 *                 freshness gate. Never a green light: someone acts on this holding a match.
 */
export type BurnVerdict = 'calfire' | 'district' | 'allowed' | 'elevation' | 'unknown';

/**
 * Reads The Grid's `permission`, which is already the more restrictive of the two
 * authorities, rather than re-deriving it: `ALLOWED` requires both to be known and
 * permissive. The facets only say WHICH authority prohibits.
 */
export function burnVerdict(s: BurnStatusEvent['burnStatus']): BurnVerdict {
  if (s.permission === 'BURN_PERMISSION_PROHIBITED') {
    // PROHIBITED means at least one facet forbids it; if it isn't CAL FIRE, it's the district.
    return s.calfireStatus === 'CALFIRE_BURNING_SUSPENDED' ? 'calfire' : 'district';
  }
  if (s.permission === 'BURN_PERMISSION_ALLOWED') return 'allowed';
  if (s.burnDay === 'BURN_DAY_MARGINAL') return 'elevation';
  return 'unknown';
}

/** Counties that share a verdict, rendered as one line. */
export interface BurnGroup {
  verdict: BurnVerdict;
  counties: BurnStatusEvent[];
}

/**
 * Collapse the counties into as few lines as possible: one line when they agree (the
 * usual case — CAL FIRE suspends both at once), one per verdict when they don't.
 * `null` in (fetch failed) → `null` out; an empty list (no county covered) → `[]`, which
 * renders nothing — "not covered" is not "allowed".
 */
export function groupBurnStatus(events: BurnStatusEvent[] | null): BurnGroup[] | null {
  if (events == null) return null;
  const groups: BurnGroup[] = [];
  for (const e of events) {
    const verdict = burnVerdict(e.burnStatus);
    const g = groups.find((x) => x.verdict === verdict);
    if (g) g.counties.push(e);
    else groups.push({ verdict, counties: [e] });
  }
  return groups;
}
