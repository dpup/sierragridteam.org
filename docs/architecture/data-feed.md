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
  old slug now 404s). The area slug lives in `HAZARD_AREA` (`src/lib/hazards.ts`); the base
  URL in `GRID_API_BASE` (`src/lib/grid.ts`, overridable via `PUBLIC_GRID_API_BASE`).
- **2026-07 API consolidation (breaking):** The Grid moved to one **place-scoped** surface
  and **removed** the old per-domain endpoints — `/situation/{area}`, `/hazards/{area}/…`,
  `/weather`, `/weather/alerts`, `/roads`, and `/scanners/{area}` all now 404. The site
  fetches the new `/places/{area}/…`, `/conditions`, and `/scanners?place=` endpoints (below).
  The place feed is polygon-scoped server-side, so the client-side service-area / NWS-zone
  filter (`isInServiceArea`, `NWS_ZONES`) was deleted.
- **2026-07 camelCase unification (breaking):** a follow-up push converted the last
  snake_case surfaces — the map GeoJSON layers and the place summary — to **camelCase** field
  names, so field casing is now uniform across every endpoint. Enum-like constants are
  UPPER_CASE (`layer`, `status`, `severity`); `LOW` became **`MINOR`** on the severity scale.
  Layer URL slugs stayed snake_case. Field names + enum casings are in the section below.

## Endpoints & real response shapes (captured 2026-07-09)

> The Grid consolidated onto one place-scoped surface in 2026-07, then unified **all**
> endpoints to **camelCase** field names (a later 2026-07 push — see the migration note above).
> All paths are under `GRID_API_BASE` (`https://data.sierragridteam.org/api/v1`). **Field
> names are camelCase everywhere; enum-like constants are UPPER_CASE** — `layer`
> (`WILDFIRE`, `ROAD_SEGMENT`, …), `status` (`ACTIVE`, `OPEN`, `RESTRICTED`), `severity`
> (`INFO`, `MINOR`, `MODERATE`, `SEVERE`, `EXTREME`), `sourceStatus` (`OK`/`STALE`/`UNAVAILABLE`).
> Two values stay lowercase: `category` and `fireWeather.state` (`normal`/`red-flag`, which we
> normalize). **The layer URL slugs stay snake_case** (`/map/road_segment.geojson`) even though
> the `layer` property value is UPPER (`ROAD_SEGMENT`).

### `GET /places/{area}/summary` (replaced `/situation/{area}`)

```jsonc
{
  place, placeId, placeName, generatedAt, mode,
  summary: {
    highestSeverity, highestSeverityRank, severityCounts,
    totalActive,
    activeEvacuations: int | null,      // fail-loud: null = unknown, never a false 0
    evacuationStatus: "OK"|"STALE"|"UNAVAILABLE",
    topEvents: [{ id, layer, severity, severityRank, headline, source }]
  },
  domains: [{ domain, status, highestSeverity, activeCount, headlines }],
  sources: [...]
}
```

> ⚠️ `domains[].domain === "fire"` counts the always-present "fire weather: normal" banner
> (`activeCount` is 1 with **zero** wildfires) — it is NOT a wildfire signal. Count the
> `wildfire` map layer for that (EmergencyBanner does).

### `GET /places/{area}/map/{layer}.geojson` (replaced `/hazards/{area}/…`)

RFC 7946 FeatureCollection; `properties` camelCase (`severityRank`, `areaLabel`, `updatedAt`)
+ `metadata.sourceStatus`. Now **polygon-scoped server-side** — `road_incident` and
`weather_alert` are clipped to the ebbetts-pass polygon at ingest (same point-in-polygon test
as `/places:resolve`), so the client no longer re-filters. Layer slugs (URL): `wildfire`,
`evacuation`, `weather_alert`, `earthquake`, `road_incident`, `road_segment`, `chain_control`,
`fire_weather`.

- Per-feature `provenance.sourceUrl` is the event's canonical page (CAL FIRE incident /
  Genasys zone) — **optional per source** (CHP road incidents have none). The `/live` stream
  renders a "More information" link only when it's present.
- `road_segment` features carry the road-conditions table in `properties.road`
  (`roadId`, `congestion`, `delayMinutes`, `durationMinutes`, `distanceKm`) plus
  `status`/`headline`/`areaLabel` on the envelope. Chain controls are the separate
  `chain_control` layer; road incidents the `road_incident` layer.

### `GET /conditions` (replaced `/weather`)

`{ weather: Weather[], fireWeather, lastUpdated }` (camelCase). The town array is `weather`
(was `weatherData`); weather ALERTS moved to the `weather_alert` map layer, so there is no
`alerts` field. Powers the /live weather band + the home Fire Weather tile
(`fireWeather.state`: `NORMAL`|`ELEVATED`|`RED_FLAG`).

```jsonc
Weather = {
  locationId, locationName, weatherMain, weatherDescription, weatherIcon,
  temperatureCelsius, feelsLikeCelsius, humidityPercent,
  windSpeedKmh, windDirectionDegrees, visibilityKm
}
```

### `GET /scanners?place={area}` (replaced `/scanners/{area}`)

`{ scanners: [{ feedId, channelLabel, agency, broadcastifyUrl }] }` (camelCase, link-out only).

### Available but unused: `/events`, `/events/{id}`, `/events/{id}/history`, `/history`

The unified events feed (camelCase, UPPERCASE enums, base64 geometry, cursor pagination) is
for future work (Fire Desk history, archive). `/live` uses the per-layer map geojson instead,
which preserves the `HazardFeature` shape our derivations expect.

## Architecture: client-only live data (no build-time fetch)

**Nothing feed-related is fetched at build time** — so no stale data can ever be baked into
the HTML. Every page renders live from the browser (CORS is resolved, FR-1: the API returns
`Access-Control-Allow-Origin` for `https://sierragridteam.org` and `http://localhost:4321`).
The checked-in `src/data/*.json` are **test fixtures only** — the screenshot harness mocks the
feed with them; no page imports them.

1. **Pure derivations.** `src/lib/{grid,hazards}.ts` are typed API shapes + pure functions
   (`deriveStream`, `deriveSituationSummary`, `layerFeatures`, …). They take
   a snapshot the _browser_ assembled from live fetches — no I/O of their own.
2. **Client islands fetch + render live.**
   - **`/live`** is fully client-rendered: a loader, then a fetch of the place summary, the
     `/places/{area}/map/*.geojson` layers (STREAM_LAYERS + `road_segment`), `/conditions`, and
     `/scanners?place=`, rendered via `src/lib/live-view.ts`, refreshed every 90 s. On failure
     it shows an honest "feed unavailable" panel with the official sources — never stale data.
   - **Home `OperationalStatus`**: Active Alerts + Fire Weather start on a "—" placeholder and a
     client island fills them from the `wildfire`/`evacuation`/`weather_alert` map layers +
     `/conditions` (every 5 min); on failure they stay "—". Relay Sites + Coverage are static
     owned config.
   - **`EmergencyBanner`** (every page): SSR-hidden; a client island polls
     `/places/{area}/summary` + the `wildfire` map layer and shows it only on an active
     evacuation/wildfire.
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
