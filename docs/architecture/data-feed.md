# Data Feed — info.ersn.net integration

> **Directive:** `info.ersn.net` is THE live data feed for this site. Any data it does not
> provide is filed as a **feature request** against `github.com/dpup/info.ersn.net` and shown
> as a clearly-labeled **placeholder** in the UI (never faked).

- Repo: https://github.com/dpup/info.ersn.net · Site: https://ersn.net
- Base URL: `https://info.ersn.net/api/v1`

## Endpoints & real response shapes (captured 2026-06-25)

### `GET /roads` → `{ roads: Road[], lastUpdated: string }`

3 roads on the Hwy 4 corridor — **directly inside S.I.E.R.R.A's service area**:
`hwy4-angels-murphys`, `hwy4-murphys-arnold`, `hwy4-arnold-bearvalley`.

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

### `GET /weather` → `{ weatherData: Weather[], lastUpdated: string }`

3 locations: **Murphys, Arnold, Bear Valley** (units: °C, km, km/h).

```jsonc
Weather = {
  locationId, locationName, weatherMain, weatherDescription, weatherIcon,
  temperatureCelsius, feelsLikeCelsius, humidityPercent,
  windSpeedKmh, windDirectionDegrees, visibilityKm, alerts: []
}
```

### `GET /weather/alerts` → `{ alerts: Alert[], lastUpdated: string }`

Currently `alerts: []`. Shape used for the Active-Alerts tile and `/alerts` cards.

## Architecture: hybrid SSG snapshot + client refresh

**Why hybrid:** A direct browser fetch from `sierragridteam.org` to `info.ersn.net` is currently
**CORS-blocked** — the API returns `Access-Control-Allow-Credentials: true` but **no
`Access-Control-Allow-Origin`** header, even when an `Origin` is sent. So client-side fetch will
fail cross-origin until the API adds the header (filed as FR-1).

Strategy that is correct **today** and upgrades automatically once CORS lands:

1. **Build-time fetch (server-side, no CORS limit).** `src/lib/ersn.ts` fetches roads + weather +
   alerts during `astro build` and writes a typed snapshot. This is the SSR/SSG content — always
   present, SEO-visible, fast. It is also the design's required "last-known value."
2. **Checked-in fallback snapshot** (`src/data/ersn-snapshot.json`) so the build still succeeds if
   the API is unreachable at build time (CI resilience). Refreshed by `make snapshot`.
3. **Client refresh island** attempts a live fetch every 5 min. On success it updates values +
   the "Synced [time]" indicator. **On any failure (incl. CORS) it silently keeps the build-time
   snapshot** and shows a muted "—" sync state — per the design's "never show a spinner/error in
   the hero" rule. When FR-1 ships, live refresh starts working with zero code change.

```
build ──fetch──> ersn.ts ──> snapshot (typed) ──> SSR HTML  ──hydrate──> client refresh (5 min)
                    │                                                          │ fail → keep snapshot
                    └─ on build fetch fail → ersn-snapshot.json (checked in) ──┘
```

All units converted for display in `src/lib/units.ts` (°C→°F, km→mi, km/h→mph) since the audience
is US public-safety/residents.

## Data gaps → feature requests (FR) + UI placeholders

| FR       | Gap                                                                                                                                             | Where it shows                   | UI placeholder behavior                                                                                                          |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **FR-1** | No CORS `Access-Control-Allow-Origin` → client refresh blocked                                                                                  | Home stats, /alerts auto-refresh | SSR snapshot shown; "—" sync state; refresh upgrades silently when fixed                                                         |
| **FR-2** | No NWS zone alerts for **CAZ064/065/258/259** (design's specified source)                                                                       | /alerts, Active-Alerts tile      | Use `/weather/alerts` + road incidents; label scope "Calaveras & Tuolumne"; placeholder card noting NWS-zone integration pending |
| **FR-3** | No **fire-weather Red Flag** classification (Normal/Elevated/Red Flag)                                                                          | Home "Fire Weather" tile         | Tile shows "Normal\*" with a footnote; cannot escalate to orange until provided                                                  |
| **FR-4** | **Hwy 49 / Tuolumne** towns absent (Sonora, Columbia, Twain Harte, Dorrington) — feed is Hwy 4 only (Angels Camp, Murphys, Arnold, Bear Valley) | Home map, /mesh zones, weather   | Those towns rendered as coverage markers w/o live data; "data coming soon" where a value would be                                |
| **FR-5** | No **per-relay-site status** (the org's own mesh nodes)                                                                                         | Home "Relay Sites" tile, /mesh   | "Relay Sites" uses owned static config; no live up/down until a status feed exists                                               |
| **FR-6** | No structured **mesh node** feed (count/health)                                                                                                 | /mesh sidebar                    | Static deployment-zone list; live counts pending                                                                                 |

Each FR is filed as an issue on `dpup/info.ersn.net` (see Phase 9 / `FEATURE_REQUESTS.md`).
Placeholders must be visually honest: a muted note, never an invented number.
