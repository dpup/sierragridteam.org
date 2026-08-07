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

> For the life-safety wildfire signal, EmergencyBanner reads the `wildfire` map layer
> directly (authoritative + place-scoped) rather than the `domains` rollup. (Earlier the
> `fire` domain's `activeCount` also counted the "fire weather: normal" banner; The Grid
> fixed that on 2026-07-09 so it now reflects active wildfires only.)

### `GET /places/{area}/map/{layer}.geojson` (replaced `/hazards/{area}/…`)

RFC 7946 FeatureCollection with camelCase `properties` (`severityRank`, `areaLabel`,
`updatedAt`) and `metadata.sourceStatus`. Now **polygon-scoped server-side** — `road_incident`
and `weather_alert` are clipped to the ebbetts-pass polygon at ingest (same point-in-polygon
test as `/places:resolve`), so the client no longer re-filters. Layer slugs (URL): `wildfire`,
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
     `/conditions` (every 5 min); on failure they stay "—". **Relay Nodes** is live too — it
     counts the S.I.E.R.R.A repeaters in `mesh_node.geojson` via the same
     `deriveRelayNodesTile` /mesh uses, so the two surfaces cannot disagree. Only Coverage is
     static owned config.
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

## Mesh topology (the `/mesh` map)

**Shipped 2026-08 — this closed FR-6.** The Grid ingests MeshCore node adverts and derives
the relay topology from them (`docs/mesh-topology-design.md` in `dpup/sierra-data`), which
is what `/mesh` now draws. It replaced an embedded third-party map. Three surfaces:

| Read                                               | Shape                                                                                                                                                                          | Used for                                           |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `GET /places/{area}/map/mesh_node.geojson`         | Point features for the nodes INSIDE the place — the authoritative roster, including a node with no observed links                                                              | The corridor roster (panel + full-strength dots)   |
| `GET /places/{area}/map/mesh_link.geojson?window=` | A self-contained subgraph: Points for in-region nodes ∪ their one-hop neighbours (`properties.mesh.inRegion` separates them), plus LineString edges with ≥1 endpoint in region | The map's links + the demoted neighbour markers    |
| `GET /mesh/links` + `GET /events?layer=MESH`       | The WHOLE observed mesh: a coordinate-free link list joined against the global node roster (~260 KB gzipped, paged 200/page)                                                   | The lazy-loaded backdrop, once the reader pans out |

Edge properties (camelCase): `a`, `b`, `observations`, `daysActive`, `firstSeen`, `lastSeen`,
`bestSnr`. `window` accepts `24h` / `72h` (the feed's default) / `7d` / `30d` / `all`.

**The site reads one fixed window — `MESH_WINDOW` (`30d`) in `src/lib/mesh.ts` — and offers
no picker.** The recency fade already is the time control, continuously and without a mode to
choose; a picker only let a reader hide data from themselves. Change the constant if the
span should change.

**Honesty rules specific to this feed** — an edge is an _observation_ ("we heard these two
repeaters relay for each other", weighted by how often and how recently), never a routing
table and never a coverage guarantee. A faint edge is **not** a link that is down: on a mesh
where a backbone repeater adverts twice a day, quiet is not gone, so the copy always says
what we _heard_. `sourceStatus: UNAVAILABLE` → `null` counts → "Unknown", never a `0`; a
confirmed-empty `OK` feed is a real `0`. Derivations + tests: `src/lib/mesh.ts`,
`src/lib/mesh.test.ts`.

## Data gaps → feature requests (FR)

**FR-1, FR-2, FR-3, FR-4, FR-7 shipped 2026-06-26; FR-6 shipped 2026-08** (see the mesh
section above). One gap remains:

| FR       | Gap                                                   | Where it shows          | UI behavior today                                                                                       |
| -------- | ----------------------------------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------- |
| **FR-5** | No **per-relay-site health** (is the site itself up?) | Home "Relay Nodes" tile | Tile reports mesh PRESENCE instead — "N repeaters heard", live from `mesh_node.geojson`; "—" on failure |

FR-5 concerns the org's own site-level infrastructure health, which is **not** the same thing
as mesh presence: an advert proves a node was _heard_, not that the site is healthy, and one
site can hold more than one node. So the homepage tile is deliberately labelled "Relay Nodes"
/ "S.I.E.R.R.A repeaters heard" rather than "Relay Sites" — it says exactly what the feed can
prove. FR-5 stays open until the org exposes real site health. Placeholders must be visually
honest: a muted note, never an invented number.
