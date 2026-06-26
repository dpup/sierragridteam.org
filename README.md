# S.I.E.R.R.A — sierragridteam.org

Public website for the **Signal Integrity & Emergency Radio Response Alliance** —
a volunteer non-profit operating off-grid emergency communications across the
Calaveras & Tuolumne foothills.

Built with **Astro 7** (static output), self-hosted fonts, a strict design-token
system, and a live data feed from [info.ersn.net](https://info.ersn.net).

```
make install     # install deps (npm — bun install hangs behind some proxies)
make dev         # local dev server
make build       # static build → dist/
make verify      # type-check + lint + format-check + unit tests (fast, no browser)
make ci          # full pipeline incl. Playwright a11y + smoke tests
make help        # list all targets
```

## What's where

| Path                           | What                                                                    |
| ------------------------------ | ----------------------------------------------------------------------- |
| `src/pages/`                   | One file per route: `index` (home), `mesh`, `alerts`, `contact`, `404`. |
| `src/components/`              | The component library — pages are assembled from these only.            |
| `src/layouts/BaseLayout.astro` | HTML shell: head/SEO, nav, footer, fonts.                               |
| `src/styles/tokens.css`        | **The design tokens** — the only file with raw colors/sizes.            |
| `src/config/`                  | Editable data: `site.ts`, `content.ts` (copy), `coverage.ts` (map/geo). |
| `src/lib/ersn.ts`              | Typed info.ersn.net client + build-time snapshot + derivations.         |
| `src/data/`                    | Checked-in data snapshot + test fixtures.                               |
| `scripts/`                     | `snapshot` (refresh data), `gen-assets` (favicons/OG), `screenshots`.   |
| `tests/`                       | Playwright a11y + smoke specs; deterministic screenshots.               |
| `docs/architecture/`           | IA, design tokens, data feed, SEO, accessibility, testing plans.        |
| `docs/design/`                 | The source style guide + content brief.                                 |
| `docs/deployment.md`           | AWS S3 + CloudFront + Hostinger deploy guide.                           |

## Editing the site safely

**Most edits are data, not code.** Change wording in `src/config/content.ts`,
contact details in `src/config/site.ts`, and map/zone data in
`src/config/coverage.ts`. You should rarely need to touch a `.astro` file.

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

## Live data & known gaps

The site reads roads/weather/alerts from info.ersn.net. Data the feed doesn't yet
provide (browser CORS, NWS zone alerts, Red-Flag classification, the Hwy 49 /
Tuolumne towns, per-relay status) is shown as an honest placeholder and tracked as
feature requests — see `FEATURE_REQUESTS.md` and `docs/architecture/data-feed.md`.

## Before launch (open items)

- Confirm the contact email (`info@sierragridteam.org` is a placeholder in
  `src/config/site.ts`).
- Wire AWS/Hostinger per `docs/deployment.md` and set the deploy secrets.
- Contact email — confirm `info@sierragridteam.org` is monitored (it's set live;
  override via `PUBLIC_CONTACT_EMAIL` if needed).
