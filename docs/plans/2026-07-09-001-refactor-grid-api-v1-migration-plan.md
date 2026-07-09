---
title: Migrate the site to The Grid's consolidated /api/v1 (places/events) API
type: refactor
date: 2026-07-09
origin: none
status: ready
---

# Migrate to The Grid's consolidated `/api/v1` API

## Problem frame

The Grid (data.sierragridteam.org) has reshaped its API into one consistent, place-scoped
surface and **removed every legacy endpoint the site currently calls.** Verified live on
2026-07-09 — all of these now return `404 / NOT_FOUND`:

- `/api/v1/situation/{area}`
- `/api/v1/hazards/{area}/{layer}.geojson`
- `/api/v1/weather`, `/api/v1/weather/alerts?zones=…`
- `/api/v1/scanners/{area}`
- `/api/v1/roads`

Our production code (`live.astro`, `OperationalStatus.astro`, `EmergencyBanner.astro`,
`snapshot.ts`) fetches **only** these dead paths. So this is not a nice-to-have cleanup —
**it is an outage fix**: `/live`'s first fetch throws and the page shows its "feed
unavailable" failure panel; the homepage tiles read "Live data unavailable"; the
emergency banner never arms. Ship this to restore live data.

Two things land together with the migration, both previously agreed:

1. **The polygon bug is fixed server-side.** `road_incident` events are now clipped to the
   `ebbetts-pass` polygon at ingest. Verified: `map/road_incident.geojson` returns only
   in-corridor points (lng ≥ −120.37); the old Jackson/Farmington leaks (lng −120.847 /
   −120.873) are gone. This lets us **delete the client-side service-area filter entirely**
   — the "wait, then migrate cleanly" decision.
2. **Roads come from `road_segment`** (resolved with the user). `/api/v1/roads` is documented
   but 404s; the road-conditions table is rebuilt from the `map/road_segment.geojson` layer
   instead (see "Roads" below). No gap. Per-event `provenance.sourceUrl` (camelCase, optional
   per source) is the confirmed field for the CAL FIRE / Genasys link.

## The new API (verified 2026-07-09)

Base is unchanged: `GRID_API_BASE = https://data.sierragridteam.org/api/v1`
(`PUBLIC_GRID_API_BASE` override still applies). Only the paths after it change.

| Purpose                     | OLD path (now 404)                | NEW path                                                      | Shape notes                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | --------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rollup / summary            | `/situation/{area}`               | `/places/{area}/summary`                                      | New shape. `summary.total_active` (was `total_features`), `summary.top_events[]` `{id,layer,severity,severity_rank,headline,source}` (was `top_headlines`), `active_evacuations` (int\|null, fail-loud), `evacuation_status`. Top-level `generated_at`, `mode`, `domains[]`, `sources[]`. **No** per-layer `layers[]` with `feature_count`.                                          |
| Map & stream layers         | `/hazards/{area}/{layer}.geojson` | `/places/{area}/map/{layer}.geojson`                          | **Envelope is identical** to before — snake_case `properties` (`severity`, `severity_rank`, typed `wildfire`/`evacuation`/`incident`/`earthquake` blocks, per-feature `provenance.source_url`), and `metadata.source_status`. Now **polygon-scoped server-side.** Layers: wildfire, evacuation, weather_alert, earthquake, road_incident, road_segment, chain_control, fire_weather. |
| Weather band + fire-weather | `/weather`                        | `/conditions`                                                 | `weatherData` → **`weather`**; keeps `fireWeather` + `lastUpdated`. Region-wide (no place param). Inner town objects unchanged (minus the unused `alerts` field).                                                                                                                                                                                                                    |
| Weather alerts              | `/weather/alerts?zones=…`         | _(removed)_ → `map/weather_alert.geojson`                     | Server already scopes to our NWS zones. Drop `NWS_ZONES` and the client zone filter.                                                                                                                                                                                                                                                                                                 |
| Scanners                    | `/scanners/{area}`                | `/scanners?place={area}`                                      | **camelCase now:** `feedId`, `channelLabel`, `agency`, `broadcastifyUrl` (was snake_case).                                                                                                                                                                                                                                                                                           |
| Road-conditions table       | `/roads`                          | `map/road_segment.geojson`                                    | Each LineString feature carries a `road` block (`congestion`, `delay_minutes`, `duration_minutes`, `distance_km`) + top-level `status`/`headline`/`area_label` — already typed on `HazardProps.road`. **Chains** → separate `chain_control` layer (empty when none active); **incidents** → `road_incident` layer (in the stream). Verified: 4 corridor segments returned.           |
| Source health               | —                                 | `/sources`                                                    | New; optional. Out of scope.                                                                                                                                                                                                                                                                                                                                                         |
| Unified events / archive    | —                                 | `/events`, `/events/{id}`, `/events/{id}/history`, `/history` | camelCase, UPPERCASE enums (`layer:"WILDFIRE"`, `status:"ACTIVE"`), base64 geometry, cursor pagination, and a **different severity enum** (`MINOR`…). **Not used by `/live`** — the map geojson keeps our exact `HazardFeature` shape with far less churn. Noted for the future (Fire Desk history, archive) — out of scope here.                                                    |

**Design decision — keep `/live` on the per-layer `map/*.geojson`, not `/events`.** The map
geojson preserves our existing `HazardProps` envelope verbatim (snake_case, `INFO..EXTREME`

- `severity_rank`, typed blocks, `provenance.source_url`), so `deriveStream`, `rankOf`,
  `toneFor`, `wildfireStats`, the map paint, and the CAL-FIRE "More information" link all keep
  working unchanged. `/events` would force a second severity scale, camelCase remap, and
  geometry base64-decode for no benefit on this page.

**Design decision — keep deriving counts locally** from the (now server-scoped) layers via
`deriveSituationSummary`, rather than trusting `summary.total_active`. It keeps the tiles
and the stream in lockstep and preserves the per-layer `source_status` → `null`/"Unknown"
honesty logic unchanged. The summary endpoint is still fetched for `generated_at` (the
"Synced …" stamp) and is the authoritative fail-loud source for `active_evacuations`.

## Roads — via `road_segment` (resolved, no gap)

The road-conditions table now comes from `/places/{area}/map/road_segment.geojson`, **not**
`/api/v1/roads` (which is documented but returns `NOT_FOUND` — ignore it). Each corridor is
one LineString `HazardFeature`; its `properties.road` block carries `congestion`,
`delay_minutes`, `duration_minutes`, `distance_km`, and `status`/`headline`/`area_label` sit
on the envelope — exactly what the table renders. This means **roads fold into the hazard
`layers` model** (drop the separate `RoadsResponse`/grid-snapshot `roads`); `renderRoads`
takes `HazardFeature[]` (the `road_segment` layer) instead of a `RoadsResponse`.

- **Chains:** the old per-road `chainControl` cell is now the separate `chain_control`
  layer (empty when none active). Match a `chain_control` feature to a segment by
  `road.road_id`; show "None" when unmatched (honest — no active chain control).
- **Per-road incidents:** the old table's bundled `alerts[]` are now the `road_incident`
  layer, already surfaced in the alert stream. The table no longer repeats them (a minor,
  honest simplification — nothing is lost).

## Scope boundaries

**In scope:** repoint every live fetch to the new paths; delete the client-side
service-area / NWS-zone filter; update types, fixtures, tests, the screenshot/scenario
feed mocks, and `snapshot.ts`; honest placeholder for the road table; docs.

**Out of scope:** adopting `/events`/`/history` (future Fire Desk / archive work);
`/sources` health UI; any new map layer (road_segment/chain_control rendering); changing
the visual design of `/live` or the homepage; implementing `/api/v1/roads` (server-side,
the user's).

## Implementation units

### U1 — API surface & types (`src/lib/grid.ts`)

- **Goal:** the module reflects the new API; dead filter/types removed.
- **Approach:**
  - Keep `GRID_API_BASE` as-is (base string unchanged).
  - **Delete** `NWS_ZONES`, `isInServiceArea`, and the `serviceAreaBounds` import (the
    filter is gone; `serviceAreaBounds` still lives in `coverage.ts` for map framing).
  - Rename `WeatherResponse.weatherData` → `weather` (or introduce `ConditionsResponse
{ weather: WeatherLocation[]; fireWeather?: FireWeather; lastUpdated: string }` and
    retire `WeatherResponse`). Drop the unused `alerts` field on `WeatherLocation`.
  - **Delete** `WeatherAlert` and `AlertsResponse` (weather alerts now flow through the
    `weather_alert` hazard layer, already typed in `hazards.ts`).
  - Add a `PlaceSummary` type for `/places/{area}/summary` (`generated_at`, `mode`,
    `summary.{total_active, active_evacuations, evacuation_status, top_events[]}`,
    `domains[]`). This replaces the `Situation` type currently in `hazards.ts`.
  - Redefine `GridSnapshot` to `{ fetchedAt; conditions: ConditionsResponse | null }`
    (roads/alerts drop out; roads returns via a nullable `roads` field kept for when
    `/api/v1/roads` returns — typed but always `null` for now).
  - Move `Scanner` to camelCase (`feedId`, `channelLabel`, `agency`, `broadcastifyUrl`).
- **Files:** modify `src/lib/grid.ts`.
- **Verification:** `astro check` passes after U2–U6 consume the new types.

### U2 — Hazard derivations (`src/lib/hazards.ts`)

- **Goal:** stop re-filtering (server is authoritative); adopt the new summary type.
- **Approach:**
  - **Delete** `pointInServiceArea`, `weatherAlertInZones`, `isRelevant`, and the
    `NWS_ZONES, isInServiceArea` import. Simplify `layerFeatures` to return
    `snapshot.layers?.[layer]?.features ?? []` (no filter).
  - Replace the `Situation`/`SituationLayer` interfaces with `PlaceSummary` (from U1) or
    re-export it; update `HazardsSnapshot.situation` to `summary: PlaceSummary | null`.
  - `deriveSituationSummary`: unchanged logic (per-layer `source_status` → `null` on
    UNAVAILABLE), but read `syncedAt` from `summary.generated_at` and keep counting from
    the now-scoped layers. Keep `deriveActiveAlertsTile` as-is.
  - Update the `Scanner` import/usages.
- **Files:** modify `src/lib/hazards.ts`.
- **Test scenarios (`src/lib/hazards.test.ts`):** stream/summary derivations still produce
  correct counts and `null`-on-UNAVAILABLE from the new fixtures; **remove** any test that
  asserted out-of-area features get filtered (that behavior is now the server's).
- **Verification:** `bun test src/lib/hazards.test.ts` green against refreshed fixtures.

### U3 — `/live` fetch (`src/pages/live.astro`)

- **Goal:** fetch the new endpoints; assemble the same snapshots.
- **Approach:** rewrite `fetchSnapshots`:
  - `get('/places/${HAZARD_AREA}/summary')` → snapshot `summary`.
  - Fetch every map layer in `MAP_LAYERS = [...STREAM_LAYERS, 'road_segment']`
    (`get('/places/${HAZARD_AREA}/map/${l}.geojson')`) → `haz.layers`. (`road_segment`
    feeds the roads table; `chain_control` is already in `STREAM_LAYERS`.)
  - `get('/conditions')` → `grid.conditions`.
  - `get('/scanners?place=${HAZARD_AREA}')` → `haz.scanners` (`.scanners`).
  - **Drop** the `/weather/alerts?zones=`, `/roads`, and `/weather` fetches and the
    `NWS_ZONES` import. Keep the `Promise.all` + per-region re-render structure.
- **Files:** modify `src/pages/live.astro` (script island + imports).
- **Verification:** `npm run build`; manual — `/live` renders live against the real API.

### U4 — `/live` view rendering (`src/lib/live-view.ts`)

- **Goal:** render weather from `/conditions`, scanners camelCase, honest road placeholder.
- **Approach:**
  - `renderWeather`: read `conditions.weather` (was `weather.weatherData`); update the
    `WeatherResponse`→`ConditionsResponse` type and `buildView`'s `grid` param.
  - `renderScanners`: read `s.channelLabel`, `s.agency`, `s.broadcastifyUrl` (camelCase);
    update `Scanner` type usage.
  - `renderRoads(segments: HazardFeature[], chains: HazardFeature[])`: render the table from
    the `road_segment` features — `f.properties.road.{congestion,delay_minutes,
duration_minutes,distance_km}` + `status`/`headline`/`area_label`. Chains cell: find a
    `chain_control` feature with matching `road?.road_id`, else "None". Empty segments →
    return '' (same as before). `buildView` passes `layerFeatures(haz,'road_segment')` and
    `layerFeatures(haz,'chain_control')`.
  - The `provenance` "More information" link now reads `p.provenance?.sourceUrl` (camelCase;
    optional per source — CAL FIRE/Genasys have it, CHP doesn't).
  - Map bounds: unchanged — still `serviceAreaBounds` from `coverage.ts`.
- **Files:** modify `src/lib/live-view.ts`.
- **Test scenarios (`src/lib/live-view.test.ts`):** `emptyGrid` updated to the new
  `GridSnapshot` shape; weather band renders from `conditions.weather`; road table renders
  from `road_segment` features.
- **Verification:** `bun test src/lib/live-view.test.ts`.

### U5 — Homepage status island (`src/components/home/OperationalStatus.astro`)

- **Goal:** Active Alerts + Fire Weather tiles fed from the new API.
- **Approach:** in the client `refresh()`, fetch
  `/places/${area}/map/{wildfire,evacuation,weather_alert}.geojson` (build the same
  `HazardsSnapshot` for `deriveActiveAlertsTile(deriveSituationSummary(...))`) and
  `/conditions` for `fireWeather.state` + `lastUpdated`. Replace `json('/weather')` →
  `json('/conditions')` and `/hazards/${area}/…` → `/places/${area}/map/…`.
- **Files:** modify `src/components/home/OperationalStatus.astro`.
- **Verification:** `npm run build`; manual — homepage tiles populate; agree with `/live`.

### U6 — Emergency banner (`src/components/EmergencyBanner.astro`)

- **Goal:** life-safety band armed from the new summary + wildfire layer.
- **Approach:** replace the `/situation/{area}` fetch with:
  - `/places/${area}/summary` → `active_evacuations` (fail-loud) + the evacuation headline
    from `summary.top_events` (`layer==='evacuation'`).
  - `/places/${area}/map/wildfire.geojson` → wildfire active = `features.length > 0`
    (honoring `metadata.source_status`), and the wildfire headline from feature `[0]`.
  - **Honesty trap to avoid:** do **not** use `domains.fire.active_count` for the wildfire
    signal — it counts the always-present "Fire weather: normal" banner (it reads `1` with
    zero wildfires). Count the `wildfire` map layer instead.
  - Keep the "only evacuation or wildfire arms the band; never trust region-wide rollup
    severity" contract and the change-signature guard.
- **Files:** modify `src/components/EmergencyBanner.astro`.
- **Verification:** `npm run build`; scenario screenshot with an active wildfire/evac fixture
  still shows the band; calm fixture keeps it hidden.

### U7 — Snapshot refresh script + fixtures (`scripts/snapshot.ts`, `src/data/*.json`)

- **Goal:** `make snapshot` pulls the new endpoints; fixtures match new shapes.
- **Approach:** update `snapshot.ts` to the new paths (mirror U3); drop `NWS_ZONES` and the
  `/weather/alerts`, `/roads` fetches; write `conditions` instead of `weather`/`alerts`;
  write `summary` instead of `situation`; scanners via `?place=`. Run it to regenerate
  `src/data/grid-snapshot.json` + `hazards-snapshot.json`. (Note: with no active fire, the
  wildfire/evac layers capture empty — that's the correct current fixture; keep a
  hand-authored active-incident fixture for scenario shots if one exists.)
- **Files:** modify `scripts/snapshot.ts`; regenerate `src/data/grid-snapshot.json`,
  `src/data/hazards-snapshot.json`.
- **Verification:** `bun test src/` green against regenerated fixtures.

### U8 — Feed mocks for the screenshot harness (`scripts/screenshots.ts`, `scripts/scenario-shots.mjs`)

- **Goal:** deterministic screenshots hit the new URL patterns.
- **Approach:** update the `mockGrid` URL routing:
  `/situation/` → `/summary`; `/hazards/{area}/{layer}.geojson` → `/map/{layer}.geojson`
  (the regex `/\/hazards\/[^/]+\/([^/?]+)\.geojson/` → `/\/map\/([^/?]+)\.geojson/`);
  `/weather` → `/conditions` (return `{weather, fireWeather, lastUpdated}`); `/scanners/` →
  `/scanners` (camelCase payload); **remove** the `/weather/alerts` and `/roads` branches.
  Same for `scenario-shots.mjs`. Ensure the `road_segment`/`fire_weather` layers 200 (empty
  is fine).
- **Files:** modify `scripts/screenshots.ts`, `scripts/scenario-shots.mjs`.
- **Verification:** `make screenshots` runs; **look at** `/live` + homepage shots — weather
  band, tiles, stream, and the road placeholder all render; nothing overflows.

### U9 — Tests (`src/lib/grid.test.ts` + the two above)

- **Goal:** tests reflect the new surface.
- **Approach:** in `grid.test.ts` **delete** the `isInServiceArea` block (function is gone)
  and change `gridFixture.weather.weatherData` → `gridFixture.conditions.weather`. Confirm
  `hazards.test.ts` / `live-view.test.ts` updated per U2/U4.
- **Files:** modify `src/lib/grid.test.ts`.
- **Verification:** `bun test src/` fully green.

### U10 — Copy + docs

- **Goal:** honest road placeholder copy; docs stop describing the deleted filter.
- **Approach:**
  - **Update the "we re-filter to the service area / NWS zones" claims** that are now false:
    the root `CLAUDE.md` `/live` bullet ("The hazard layers are re-filtered … road_incident
    layer is region-wide … weather_alert zones include an out-of-area zone"), the
    `src/lib/CLAUDE.md` reference to `isInServiceArea`/`NWS_ZONES`, and
    `docs/architecture/data-feed.md` (endpoint list + the filtering section). State that The
    Grid is now authoritative and place-scoped server-side; note the `/api/v1/roads` gap.
  - Update `src/config/coverage.ts` comment on `serviceAreaBounds` (no longer used by
    `isInServiceArea`; still used for map framing).
- **Files:** `src/config/content.ts`, `CLAUDE.md`, `src/lib/CLAUDE.md`,
  `docs/architecture/data-feed.md`, `src/config/coverage.ts`.
- **Verification:** `grep -rn "isInServiceArea\|NWS_ZONES\|weatherData\|top_headlines\|/situation\|/hazards/" src scripts docs` returns nothing stale; `make verify`.

## Sequencing

U1 → U2 (types before consumers). Then U3, U4, U5, U6 in parallel (independent files,
all depend on U1/U2). U7 before U8/U9 (fixtures before mocks/tests read them). U10 last.
`make ci` gates the whole thing; `make screenshots` + eyeball before shipping.

## Risks & verification

- **`provenance.sourceUrl` is optional per source** (user-confirmed: CAL FIRE / Genasys emit
  it, CHP doesn't). Read it defensively (`p.provenance?.sourceUrl`) and only render the
  "More information" link when present — never assume it exists. Couldn't observe it on a
  live map feature (wildfire/evac layers empty with no active incident), so confirm the link
  renders the first time a fire is active.
- **`chain_control` shape unverified** (layer empty now). The road-table chains match on
  `road.road_id`; if that field isn't on chain_control features, chains fall back to "None"
  (honest) until observed live.
- **No local browser for screenshots** in this sandbox — rely on `make ci` (Playwright
  a11y + smoke run in CI) and review the CI-produced screenshots; do not claim visual
  correctness without them.
- **Outage window:** until this merges and deploys, `/live` is on the failure panel. Treat
  as high priority; `main` is branch-protected and auto-deploys on merge.
