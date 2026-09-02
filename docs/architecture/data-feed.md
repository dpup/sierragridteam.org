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
- **`weather_alert`: issued ≠ in force — read `status`.** Since 2026-08-11 `effective`/
  `expires` carry CAP's `onset`/`ends` (the _hazard's_ window) rather than the product's
  issuance time and re-issue deadline, and **`status` is `SCHEDULED` until onset**. A warning
  written Wednesday for Thursday's storms is therefore not yet in effect. `status` is the
  authority — The Grid computes it, and `isScheduled` trusts it even when it disagrees with
  the timestamps. `deriveSituationSummary` splits the two (`weatherAlerts` = in force,
  `weatherAlertsUpcoming` = issued), the /live tile reads "N Active" or "N Upcoming", and the
  stream card is marked "Begins Thu 05:00 PT". We never filter on `expires` — the place feed
  decides what it serves. The homepage "Active Alerts" tile counts in-force alerts only.
  - **Degradation, if `status` is ever absent:** compare `effective` (the onset) to now.
    The map layers briefly omitted `status` on this layer while `/events` carried it, which
    made /live read "1 Active" for a Red Flag Warning six hours out (found live 2026-08-13,
    fixed upstream). The fallback is kept so a missing field can never silently mean "in
    force"; a record with neither counts as in force, since we can't assert otherwise.
  - Both `deriveSituationSummary` and `buildView` take `now` (defaulted to `Date.now()`) so
    the comparison stays pure and the screenshot harness's frozen clock reaches it.
  - **Open question:** the `fireWeather.state` tile reads `RED_FLAG` (orange) as soon as the
    warning is issued, while the same product's stream card says "Begins Thu 05:00 PT". Not
    obviously wrong — the Red Flag Warning _is_ in force as a warning, and the style guide
    sanctions orange for it — but the two readings sit side by side on /live.
- **`evacuation`: `headline` names the zone** (since 2026-08-11 `{what}` in
  `Evacuation {Level} — {what}` is the zone id, not the county), so the stream card adds
  `Zone …` to its detail line only when the headline doesn't already carry it.
  `evacuation.zoneId` remains the stable identifier — never match on the headline.
- `metadata.attribution` is populated on every layer as of 2026-08-11 (it was empty for all
  but `evacuation`). We currently print our own credit line under each map instead; reading
  the envelope's per-source string is available if we want the finer attribution.

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
the HTML. Every page renders live from the browser (CORS is resolved, FR-1 — and since
2026-08-06 The Grid serves `Access-Control-Allow-Origin: *` rather than an origin allowlist,
so the dev proxy in `astro.config.mjs` is now a convenience rather than a requirement).
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
| `GET /mesh/links` + `GET /events?layer=MESH`       | The WHOLE observed mesh: a coordinate-free link list joined against the global node roster (~355 KB gzipped at a 30-day window, paged 200/page)                                | The lazy-loaded backdrop, once the reader pans out |

Edge properties (camelCase): `a`, `b`, `observations`, `daysActive`, `firstSeen`, `lastSeen`,
`bestSnr`. **`window` is a Go duration and hours are the widest unit it parses** — send
`24h`, `72h` (the feed's default), `168h`, `720h`. The feed parses it with
`time.ParseDuration` and has **no error path**: `7d`, `30d` and `all` do not parse, so they
fall back to 72h silently, with a 200 and no hint in the response. The site therefore keeps
the human window key and the wire value apart (`MESH_WINDOW` vs `MESH_WINDOW_QUERY` in
`src/lib/mesh.ts`); a unit test pins every wire value to `^\d+h$`. It shipped asking for
`30d` and drawing 72 hours under "30 days" labels until 2026-09-02.

**The site reads one fixed window — `MESH_WINDOW` (`30d`) in `src/lib/mesh.ts` — and offers
no picker.** The recency fade already is the time control, continuously and without a mode to
choose; a picker only let a reader hide data from themselves. Change the constant if the
span should change.

**The presence horizon governs every node count on the site.** A node stays in The Grid's
presence snapshot for `cadenceK × its own measured advert interval`, clamped to
`[graceFloor 14h, graceCeil 72h]`; once it drops out, the disappearance sweep expires it
`expireAfter` (2h) later. So **a repeater not heard for ~3 days leaves every mesh surface** —
`mesh_node.geojson`, the `mesh_link` subgraph and `/events?layer=MESH` alike, since the map
layers query `ACTIVE`+`SCHEDULED` only. It does not become a degraded row; it is simply gone,
and no field on the wire says so. That is FR-8 below.

**Honesty rules specific to this feed** — an edge is an _observation_ ("we heard these two
repeaters relay for each other", weighted by how often and how recently), never a routing
table and never a coverage guarantee. A faint edge is **not** a link that is down: on a mesh
where a backbone repeater adverts twice a day, quiet is not gone, so the copy always says
what we _heard_. `sourceStatus: UNAVAILABLE` → `null` counts → "Unknown", never a `0`; a
confirmed-empty `OK` feed is a real `0`. Derivations + tests: `src/lib/mesh.ts`,
`src/lib/mesh.test.ts`.

## Data gaps → feature requests (FR)

**FR-1, FR-2, FR-3, FR-4, FR-7 shipped 2026-06-26; FR-6 shipped 2026-08** (see the mesh
section above). Three gaps remain:

| FR       | Gap                                                                                 | Where it shows                                    | UI behavior today                                                                                         |
| -------- | ----------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **FR-5** | No **per-relay-site health** (is the site itself up?)                               | Home "Relay Nodes" tile                           | Tile reports mesh PRESENCE instead — "N repeaters heard", live from `mesh_node.geojson`; "—" on failure   |
| **FR-8** | No node **last-heard** stamp, and a ~3-day presence horizon                         | /mesh roster + repeaters tile, home "Relay Nodes" | A repeater we stop hearing vanishes silently — the roster lists the survivors and says nothing of the gap |
| **FR-9** | No count of nodes **seen in the region**: position-less nodes are dropped at ingest | /mesh (a "nodes heard" tile), home                | Not shown at all — the site can only count nodes that carry GPS                                           |

FR-5 concerns the org's own site-level infrastructure health, which is **not** the same thing
as mesh presence: an advert proves a node was _heard_, not that the site is healthy, and one
site can hold more than one node. So the homepage tile is deliberately labelled "Relay Nodes"
/ "S.I.E.R.R.A repeaters heard" rather than "Relay Sites" — it says exactly what the feed can
prove. FR-5 stays open until the org exposes real site health. Placeholders must be visually
honest: a muted note, never an invented number.

### FR-8 — a repeater we stop hearing should degrade, not disappear

Raised 2026-09-02, from a member report: the site showed 9–10 S.I.E.R.R.A repeaters against
13 he knew of. Nothing was wrong on this side — the missing ones are not in the feed. They
had aged past the presence horizon above, and the two most affected are precisely the
low-connectivity sites it is too tight for (46 and 55 receptions in 30 days, against ~37,000
for a healthy one). They are still in the store as `EXPIRED` events, with real link
observations behind them.

**Two changes, and they have to ship together.**

1. **Raise `grid.meshcore.graceCeil`** (72h today) — 7d, or a role-aware ceiling that gives a
   repeater longer than a companion. `cadenceK × interval` already adapts to a node's own
   rhythm; the ceiling is what overrides that adaptation for the slowest sites.
2. **Expose the node's real last-heard: `mesh.lastHeardAt`** (RFC 3339, _our_ receive time —
   `NodeState.LastHeardAt`, the same clock behind the store's `events.last_seen_at`) on
   `/events?layer=MESH` and in `properties.mesh` on `mesh_node.geojson` / `mesh_link.geojson`.
   **Nothing on the wire carries this today.** `updatedAt` is the content-revision stamp: it
   moves only when a node's name, location or role changes, so live corridor repeaters ship
   stamps a week old while being heard right now. `telemetry.lastAdvertAt` is node-reported
   and the clocks are skewed — one corridor node adverts `2024-05-15`.

Why together: (1) alone makes the site **less** honest, since quiet repeaters would pad a
count labelled "heard" with nothing to tell them apart; (2) alone leaves the ~3-day cliff.
With both, the roster can list every repeater and grade each row by its own last-heard.

Optional third, if the ceiling can't move far: let the place layers include recently-expired
mesh nodes on request (`?includeExpired=true`) so the roster keeps an honest tail — the data
is already queryable via `/events?layer=MESH&status=EXPIRED&place=`, which is how the three
missing repeaters were identified.

Until this lands the site renders only what the feed asserts. **Do not** fill the gap with
`updatedAt` or `lastAdvertAt` — both would put a fabricated "last heard" on the page.

### FR-9 — a node census for the region, including nodes with no GPS

`ingest/network.go` drops locationless nodes ("Locationless nodes can't be geofenced and are
dropped"), which is right for a map layer and means most companions never reach the API at
all. But the receptions firehose (`mesh_observations`) is **not** geofenced and is keyed by
pubkey, so The Grid already holds what a census needs.

**Ask:** `GET /places/{place}/mesh/census?window=720h`

```json
{
  "window": "720h",
  "generatedAt": "2026-09-02T01:00:00Z",
  "sourceStatus": "OK",
  "nodesSeen": 68,
  "byType": { "repeater": 50, "companion": 14, "roomServer": 4 },
  "byAttribution": { "located": 53, "heardDirect": 15 }
}
```

Membership rule: distinct pubkeys where **either** the node's last known position is inside
the place polygon, **or** it was heard at zero hops (the first resolved hop of a reception's
path chain, or the receiving gateway itself) by a node whose position is inside the polygon,
within the window. Dedupe by pubkey. `sourceStatus` must be present so the tile can read
"Unknown" instead of a false `0` when the source is down.

The equivalent derived client-side from today's surfaces is 9 corridor + 59 one-hop = **68**
nodes, 15 of which have no presence record at all (position-less or aged out). The site does
**not** ship that derivation: it needs the global `/mesh/links?window=720h` edge list, ~356 KB
gzipped on page load for one number, and it could never serve the homepage tile.
