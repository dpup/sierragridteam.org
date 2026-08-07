# src/lib — data layer & helpers

`grid.ts` + `hazards.ts` are the typed data.sierragridteam.org shapes + **pure derivations**
(`deriveStream`, `deriveSituationSummary`, `layerFeatures`, …) plus shared constants
(`GRID_API_BASE`, `HAZARD_AREA`, `STREAM_LAYERS`).
`live-view.ts` turns a fetched snapshot into the `/live` view-model + region HTML;
`live-map.ts` is the MapLibre map; `units.ts` converts metric→imperial; `format.ts` is
`escapeHtml` + `formatPtTime`. See `docs/architecture/data-feed.md` for the design.

`mesh.ts` is the same split for `/mesh`: typed MeshCore topology shapes + pure derivations
(`buildRegionGraph`, `buildGlobalGraph`, `linkRecency`, `deriveMeshSummary`, …), with
`mesh-client.ts` doing the fetches, `mesh-view.ts` the panel HTML, and `mesh-map.ts` the
MapLibre topology map. `basemap.ts` holds the one basemap both maps draw on (OpenFreeMap
Positron) and its required attribution string.

> ⚠️ **MapLibre paint expressions: `zoom` is only legal at the TOP level.** It may not be
> nested inside a `case`/`match`. Wrap the zoom `interpolate` around the data-driven test,
> never the reverse — an invalid expression is dropped silently and the layer vanishes with
> no error. `linkOpacity` in `mesh-map.ts` shows the correct shape.

**There is NO build-time fetch.** Every page renders live data in the browser; the lib is
pure types + derivations the client feeds a fetched snapshot into. The checked-in
`src/data/*.json` are **test fixtures only** (the screenshot harness mocks the feed with
them) — never imported into a page.

## Contracts to preserve

- **Derivations are pure** (no fetch/IO) so they unit-test and run identically server- and
  client-side. The browser assembles a snapshot from live fetches and passes it in.
- **Never fabricate data, never imply an all-clear.** If a layer's source is `UNAVAILABLE`,
  `deriveSituationSummary` returns `null` (→ "unknown"), never a `0`. A confirmed-empty
  `OK`/`STALE` feed is a real `0`.
- **Types mirror the real API** (captured 2026-06-26/29). If the API shape changes, update
  the interfaces + the fixtures and re-run `bun test src/`.

## Changing data behavior

1. Edit the typed derivation, keep it pure.
2. Update/extend `src/lib/{grid,hazards}.test.ts` (they run against the fixtures).
3. `make snapshot` if the live shape changed (refreshes the fixtures); `bun test src/`.
