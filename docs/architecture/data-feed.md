# Data Feed — The Grid (data.sierragridteam.org) integration

> **Directive:** **The Grid** (`data.sierragridteam.org`, the S.I.E.R.R.A data service) is
> THE live data feed for this site. Any data it does not provide is filed as a **feature
> request** against `github.com/dpup/sierra-data` and shown as a clearly-labeled
> **placeholder** in the UI (never faked).

- Repo: https://github.com/dpup/sierra-data
- Base URL: `https://data.sierragridteam.org/api/v1`
- **2026-07-06 migration:** the service rebranded `info.ersn.net` → The Grid and moved to
  `data.sierragridteam.org` (info.ersn.net stays a supported CNAME alias), and its one
  coverage area was renamed `calaveras` → **`ebbetts-pass`** (breaking for hazard URLs — the
  old slug now 404s). Endpoint paths, field names, and response shapes are otherwise
  unchanged. The area slug lives in `HAZARD_AREA` (`src/lib/hazards.ts`); the base URL in
  `GRID_API_BASE` (`src/lib/grid.ts`, overridable via `PUBLIC_GRID_API_BASE`).

## Endpoints & real response shapes (captured 2026-06-26)

> All five feature requests that gate live data (FR-1/2/3/4/7) shipped on
> 2026-06-26 and are now wired up. The shapes below are
> the current ones.

### `GET /roads` → `{ roads: Road[], lastUpdated: string }`

4 road segments — the Hwy 4 corridor (`hwy4-angels-murphys`, `hwy4-murphys-arnold`,
`hwy4-arnold-bearvalley`) plus `hwy49-angels-sonora` (FR-4) — **inside the service
area**.

```jsonc
Road = {
  id, name, section, status: "OPEN"|"CLOSED"|...,
  statusExplanation, durationMinutes, distanceKm,
  congestionLevel: "CLEAR"|...,  delayMinutes, chainControl: "NONE"|...,
  alerts: RoadAlert[],           // Caltrans/CHP incidents — usable on /alerts
  chainControlInfo
}
RoadAlert = {
  type:"CLOSURE", severity:"WARNING", classification:"NEARBY"|"ON_ROUTE",
  title, description, condensedSummary, startTime, endTime, lastUpdated,
  location:{latitude,longitude}, locationDescription, impact, metadata:{…}
}
```

### `GET /weather` → `{ weatherData: Weather[], lastUpdated, fireWeather }`

7 locations (FR-4): Murphys, Arnold, Bear Valley, Sonora, Columbia, Twain Harte,
Dorrington (units: °C, km, km/h). Powers the **Current conditions** strip on /alerts.

```jsonc
Weather = {
  locationId, locationName, weatherMain, weatherDescription, weatherIcon,
  temperatureCelsius, feelsLikeCelsius, humidityPercent,
  windSpeedKmh, windDirectionDegrees, visibilityKm, alerts: []
}
// Top-level fireWeather (FR-3) — the authoritative Red Flag classification:
fireWeather = {
  state: "FIRE_WEATHER_STATE_UNSPECIFIED"|"NORMAL"|"ELEVATED"|"RED_FLAG",
  sourceEvent, headline, senderName, effective, expires, zones: []
}
```

### `GET /weather/alerts?zones=CAZ019,CAZ067,CAZ069,CAZ072` (FR-2)

`{ alerts: Alert[], lastUpdated }`. NWS / OpenWeatherMap zone alerts for the service-area
forecast zones (Tuolumne + Mother Lode foothills 067/069, lower Calaveras 019, Alpine/
high-Sierra 072 — see `NWS_ZONES`). Powers the /live alert stream + the home "Active Alerts" tile.

```jsonc
Alert = {
  id, senderName, event, description, headline, summary, details,
  source: "NWS"|"OPENWEATHERMAP", severity: "INFO"|"WARNING"|"CRITICAL",
  zones: string[], startTime, endTime, tags: []
}
```

### `GET /incidents/{area}` (region-wide CHP/Caltrans incidents)

The typed `/incidents/{area}` endpoint still exists, but the site **no longer consumes
it** — road incidents now arrive via the hazard `road_incident` GeoJSON layer (see the
hazard-aggregation section / `src/lib/hazards.ts`), filtered to the foothill service area
by `isInServiceArea` / `serviceAreaBounds` in `src/lib/grid.ts`.

## Architecture: client-only live data (no build-time fetch)

**Nothing feed-related is fetched at build time** — so no stale data can ever be baked into
the HTML. Every page renders live from the browser (CORS is resolved, FR-1: the API returns
`Access-Control-Allow-Origin` for `https://sierragridteam.org` and `http://localhost:4321`).
The checked-in `src/data/*.json` are **test fixtures only** — the screenshot harness mocks the
feed with them; no page imports them.

1. **Pure derivations.** `src/lib/{grid,hazards}.ts` are typed API shapes + pure functions
   (`deriveStream`, `deriveSituationSummary`, `layerFeatures`, `isInServiceArea`, …). They take
   a snapshot the _browser_ assembled from live fetches — no I/O of their own.
2. **Client islands fetch + render live.**
   - **`/live`** is fully client-rendered: a loader, then a fetch of the full situation
     (`/situation`, the `/hazards/*.geojson` layers, `/roads`, `/weather`, `/scanners`), rendered
     via `src/lib/live-view.ts`, refreshed every 90 s. On failure it shows an honest "feed
     unavailable" panel with the official sources — never stale data.
   - **Home `OperationalStatus`**: Active Alerts + Fire Weather start on a "—" placeholder and a
     client island fills them from `/weather` + zone-filtered `/weather/alerts` (every 5 min);
     on failure they stay "—". Relay Sites + Coverage are static owned config.
   - **`EmergencyBanner`** (every page): SSR-hidden; a client island polls `/situation` and
     shows it only on an active evacuation/wildfire.
3. **No fallback to baked data** anywhere — the honest degraded state is a placeholder /
   "unavailable", never a possibly-stale value.

```
build ──> SSR HTML (placeholders, no feed data)
                    │
browser ──fetch──> grid.ts/hazards.ts derivations ──> live render ──refresh──┐
                    │                                                          │
                    └─ on fetch fail → honest "—" / "feed unavailable" panel ──┘
```

All units converted for display in `src/lib/units.ts` (°C→°F, km→mi, km/h→mph) since the audience
is US public-safety/residents.

## Data gaps → feature requests (FR)

**FR-1, FR-2, FR-3, FR-4, FR-7 shipped 2026-06-26 and are wired up.** The remaining
placeholders are the org's own mesh/relay status (FR-5/FR-6), which The Grid does
not own:

| FR       | Gap                                                     | Where it shows                 | UI behavior today                                                                |
| -------- | ------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| **FR-5** | No **per-relay-site status** (the org's own mesh nodes) | Home "Relay Sites" tile, /mesh | "Relay Sites" uses owned static config; no live up/down until a feed exists      |
| **FR-6** | No structured **mesh node** feed (count/health)         | /mesh sidebar                  | Static deployment-zone list (`live` flags in `coverage.ts`); live counts pending |

FR-5/FR-6 concern the org’s own mesh/relay infrastructure (out of The Grid’s roads/weather
domain); they stay open until the org exposes its own feed. Placeholders must be visually
honest: a muted note, never an invented number.
