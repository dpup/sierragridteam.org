# src/lib — data layer & helpers

`ersn.ts` + `hazards.ts` are the typed data.sierragridteam.org shapes + **pure derivations**
(`deriveStream`, `deriveSituationSummary`, `layerFeatures`, `isInServiceArea`, …) plus
shared constants (`ERSN_API_BASE`, `NWS_ZONES`, `HAZARD_AREA`, `STREAM_LAYERS`).
`live-view.ts` turns a fetched snapshot into the `/live` view-model + region HTML;
`live-map.ts` is the MapLibre map; `units.ts` converts metric→imperial; `format.ts` is
`escapeHtml` + `formatPtTime`. See `docs/architecture/data-feed.md` for the design.

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
2. Update/extend `src/lib/{ersn,hazards}.test.ts` (they run against the fixtures).
3. `make snapshot` if the live shape changed (refreshes the fixtures); `bun test src/`.
