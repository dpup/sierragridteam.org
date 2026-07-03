# S.I.E.R.R.A — sierragridteam.org

Public website for the **Signal Integrity & Emergency Radio Response Alliance**
(S.I.E.R.R.A) — a volunteer non-profit building off-grid emergency communications
for the Calaveras & Tuolumne foothills. Live site: [sierragridteam.org](https://sierragridteam.org).

> S.I.E.R.R.A is a volunteer organization, not an emergency dispatch service.
> **In a life-threatening emergency, call 911.**

This repository is public for transparency. It is **not an open-source project** —
see [License & usage](#license--usage).

Built with **Astro** (fully static output), self-hosted fonts, a strict
design-token system, and live hazard data rendered client-side from
[info.ersn.net](https://info.ersn.net).

```
make install     # install deps (npm — bun install hangs behind some proxies)
make dev         # local dev server
make build       # static build → dist/
make verify      # type-check + lint + format-check + unit tests (fast, no browser)
make ci          # full pipeline incl. Playwright a11y + smoke tests
make help        # list all targets
```

## What's where

| Path                           | What                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/pages/`                   | One file per route: home, `live`, `mesh`, `about` (+ `about/[slug]` profiles), `contact`, `donate`, `404`. `/alerts` redirects to `/live`. |
| `src/components/`              | The component library — pages are assembled from these only.                                                                               |
| `src/layouts/BaseLayout.astro` | HTML shell: head/SEO, nav, footer, fonts.                                                                                                  |
| `src/styles/tokens.css`        | **The design tokens** — the only file with raw colors/sizes.                                                                               |
| `src/config/`                  | Editable data: `site.ts`, `content.ts` (copy), `coverage.ts` (map/geo), `people.ts` (leadership bios).                                     |
| `src/assets/`                  | Build-processed images (leadership profile photos).                                                                                        |
| `src/lib/`                     | Typed info.ersn.net shapes + pure derivations; the `/live` view renderers and MapLibre map.                                                |
| `src/data/`                    | **Test fixtures only** (unit tests + the mocked screenshot harness) — never rendered on pages.                                             |
| `scripts/`                     | `snapshot` (refresh fixtures), `gen-assets` (favicons/OG), `screenshots` (deterministic visual QA).                                        |
| `tests/`                       | Playwright a11y + smoke specs; committed deterministic screenshots.                                                                        |
| `docs/architecture/`           | IA, design tokens, data feed, SEO, accessibility, testing plans.                                                                           |
| `docs/design/`                 | The source style guide + content brief.                                                                                                    |
| `docs/deployment.md`           | AWS S3 + CloudFront + Hostinger deploy guide.                                                                                              |

## Editing the site safely

**Most edits are data, not code.** Change wording in `src/config/content.ts`,
contact details in `src/config/site.ts`, leadership bios in `src/config/people.ts`,
and map/zone data in `src/config/coverage.ts`. You should rarely need to touch a
`.astro` file.

Before changing anything visual, read **`CLAUDE.md`** (and the `CLAUDE.md` in the
folder you're editing) — they describe the design rules and the guardrails that
keep changes consistent. The short version:

- **Never** write a raw color or font in a component — use a token
  (`var(--brand-green)`). stylelint will reject raw hex.
- Square corners, 1px tan borders, no drop shadows. Orange means _risk only_.
- Run `make verify` before committing; `make ci` before shipping.

## Design source of truth

`docs/design/design-system.html` (v1.0 "Civic Direction") is canonical. Where the
older `docs/design/content-brief.md` conflicts (it describes a flashier neon
treatment), the design system wins — the look is a calm, institutional,
warm-parchment identity, not a tech-startup aesthetic.

## Live data & the Live Feed

The flagship **`/live`** situation page aggregates official wildfire, evacuation,
weather, fire-weather, seismic, and road feeds from info.ersn.net's hazard API
(`/hazards/*.geojson`, `/situation`, `/scanners`) onto one **MapLibre GL + CARTO
Positron** map and a prioritized alert stream, with a site-wide emergency banner on
a life-safety event. Roads, weather conditions, and NWS zone alerts also feed the
home status tiles.

**No feed data is baked in at build time.** Pages render live in the browser; on
any fetch failure they fall back to an honest labeled state ("last known" /
"Unknown"), never a fabricated value or an implied all-clear. Region-wide hazard
layers are re-filtered to the actual service area; an unavailable evacuation source
reads as "unknown", never all-clear.

The only data gap shown as an honest placeholder is S.I.E.R.R.A's own per-relay /
mesh-node status, which info.ersn.net does not own — see
`docs/architecture/data-feed.md`.

## Project status

Pre-launch. Remaining go-live work (infrastructure, donation provider, content
confirmations) is tracked outside this repository.

## License & usage

Copyright © 2026 Signal Integrity & Emergency Radio Response Alliance.
**All rights reserved.**

This repository is made public so residents, partner agencies, and volunteers can
see how the site works. It is not licensed for reuse: no permission is granted to
copy, modify, distribute, or republish the code, design system, or content.

In particular:

- **Site content** — copy, the S.I.E.R.R.A name and logo, and the leadership
  photos and bios — belongs to the organization and the individuals pictured.
  Do not reuse it.
- **Hazard data** shown on the site belongs to its originating agencies
  (CAL FIRE, NWS, CHP, Caltrans, USGS, Cal OES) and is served via
  [info.ersn.net](https://info.ersn.net).
- **Third-party dependencies** (Astro, MapLibre GL, fonts, etc.) remain under
  their own licenses.

Questions or permission requests: **info@sierragridteam.org**.
