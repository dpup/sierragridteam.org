# src/lib — data layer & helpers

`ersn.ts` is the typed info.ersn.net client + build-time snapshot + derivations.
`units.ts` converts metric→imperial for display. See
`docs/architecture/data-feed.md` for the full design.

## Contracts to preserve

- **Never throw to a page.** `buildSnapshot()` must always resolve — on a failed
  live fetch it falls back to the checked-in snapshot (`src/data/ersn-snapshot.json`).
  A flaky API must not break the build.
- **Never fabricate data.** If the feed lacks something (see the FR list in the data
  feed doc), derive conservatively and mark it a placeholder — e.g.
  `deriveFireWeather` returns `placeholder: true` and never reports a Red Flag it
  can't confirm.
- **Types mirror the real API** (captured 2026-06-26). If the API shape changes,
  update the interfaces here and the snapshot, and re-run `bun test src/`.
- Keep derivation functions **pure** (no fetch/IO) so they stay unit-tested.

## Changing data behavior

1. Edit the typed function, keep it pure where possible.
2. Update/extend `src/lib/ersn.test.ts` (it runs against real fixtures).
3. `make snapshot` if the live shape changed; `bun test src/`.
