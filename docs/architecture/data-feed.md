# Data Feed — info.ersn.net integration

> **Directive:** `info.ersn.net` is THE live data feed for this site. Any data it does not
> provide is filed as a **feature request** against `github.com/dpup/info.ersn.net` and shown
> as a clearly-labeled **placeholder** in the UI (never faked).

- Repo: https://github.com/dpup/info.ersn.net · Site: https://ersn.net
- Base URL: `https://info.ersn.net/api/v1`

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
by `isInServiceArea` / `serviceAreaBounds` in `src/lib/ersn.ts`.

## Architecture: hybrid SSG snapshot + client refresh

**Why hybrid:** Build-time SSR is the SEO-visible, always-present "last-known value"; the client
refresh keeps it current. As of 2026-06-26 CORS is **resolved** (FR-1) — the API returns
`Access-Control-Allow-Origin` for `https://sierragridteam.org` and `http://localhost:4321`, so the
client refresh now works live in both production and dev. (A non-allowlisted origin still gets no
header, and the island degrades silently — the SSR snapshot stays.)

The same hybrid strategy still holds:

1. **Build-time fetch (server-side, no CORS limit).** `src/lib/ersn.ts` fetches roads + weather +
   alerts during `astro build` and writes a typed snapshot. This is the SSR/SSG content — always
   present, SEO-visible, fast. It is also the design's required "last-known value."
2. **Checked-in fallback snapshot** (`src/data/ersn-snapshot.json`) so the build still succeeds if
   the API is unreachable at build time (CI resilience). Refreshed by `make snapshot`.
3. **Client refresh islands** fetch live and update in place. On the **home** page the
   `OperationalStatus` island refreshes the tiles + "Synced [time]" every 5 min (`/weather` +
   zone-filtered `/weather/alerts`). The **`/live`** page goes further — it is _client-rendered
   live_: it re-fetches the full situation (`/situation`, the `/hazards/*.geojson` layers,
   `/roads`, `/weather`, `/scanners`) every 90 s and re-renders every region (map, stream, tiles,
   weather band, roads, scanners) from the shared `src/lib/live-view.ts` functions. **On any
   failure it silently keeps the build-time snapshot** (revealed as "last known") — per the
   design's "never show a spinner/error" rule.

```
build ──fetch──> ersn.ts ──> snapshot (typed) ──> SSR HTML  ──hydrate──> client refresh (5 min)
                    │                                                          │ fail → keep snapshot
                    └─ on build fetch fail → ersn-snapshot.json (checked in) ──┘
```

All units converted for display in `src/lib/units.ts` (°C→°F, km→mi, km/h→mph) since the audience
is US public-safety/residents.

## Data gaps → feature requests (FR)

**FR-1, FR-2, FR-3, FR-4, FR-7 shipped 2026-06-26 and are wired up.** The remaining
placeholders are the org's own mesh/relay status (FR-5/FR-6), which info.ersn.net does
not own:

| FR       | Gap                                                     | Where it shows                 | UI behavior today                                                                |
| -------- | ------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------- |
| **FR-5** | No **per-relay-site status** (the org's own mesh nodes) | Home "Relay Sites" tile, /mesh | "Relay Sites" uses owned static config; no live up/down until a feed exists      |
| **FR-6** | No structured **mesh node** feed (count/health)         | /mesh sidebar                  | Static deployment-zone list (`live` flags in `coverage.ts`); live counts pending |

FR-5/FR-6 concern the org’s own mesh/relay infrastructure (out of info.ersn.net’s roads/weather
domain) and are tracked in the launch checklist. Placeholders must be visually honest: a
muted note, never an invented number.
