# CLAUDE.md — working on sierragridteam.org

This is the public website for **S.I.E.R.R.A** (Signal Integrity & Emergency Radio
Response Alliance). Read this before making any change. It exists so that edits —
including ones requested by non-technical, non-designer users — stay consistent
with the design system and never break the layout.

## The golden rule

**Most requests are content edits, and content lives in data files, not markup.**
Before touching a `.astro` file, ask: can this be done by editing
`src/config/content.ts` (copy), `src/config/site.ts` (contact/nav/org facts), or
`src/config/coverage.ts` (towns/zones)? Usually yes. Prefer that path.

## Design source of truth

`docs/design/design-system.html` (v1.0 "Civic Direction") is **canonical**. The
older `docs/design/content-brief.md` is superseded wherever they conflict — in
particular, ignore its glass-morphism / neon / "animated" ideas. The intended feel
is a **calm, institutional, warm-parchment identity** (think a county fire district,
not a tech startup). Three words: **Elite · Pioneering · Trustworthy.**

`docs/architecture/` holds the detailed plans (IA, design tokens, data feed, SEO,
accessibility, testing). `docs/architecture/design-tokens.md` is the human-readable
version of the rules below.

## Hard rules (do not break these)

1. **Tokens only.** Never write a raw color, font family, or font-size px value in a
   component or page. Use a CSS variable: `var(--brand-green)`, `var(--fs-hero)`,
   `var(--space-5)`. The only file allowed raw hex/fonts is
   `src/styles/tokens.css`. **stylelint enforces the no-raw-color rule and fails CI**;
   raw px font-sizes are a review convention.
2. **The palette is deliberate.** Don't introduce new colors. Forest green carries the
   brand and all primary actions; brass/gold is for small accents/labels only (never
   large fills); **burnt orange = risk/alert ONLY** (Red Flag, active alerts). If a
   page is calm, orange must be absent.
3. **Geometry:** square corners (radius 0), 1px warm-tan borders, **no drop shadows
   on cards** (border + lighter fill defines them).
4. **Type:** serif (`--font-display`) for headings/body, never heavier than 600;
   `--font-ui` (sans) for small UPPERCASE labels with wide tracking; `--font-mono`
   for data/codes. Body never below 16px.
5. **Motion is restrained** and must honor `prefers-reduced-motion`. No transforms,
   scale-ups, or bounces. Slow blinks/pings only.
6. **Accessibility is non-negotiable** (WCAG 2.2 AA). Every interactive element is
   keyboard-operable with a visible focus ring; text contrast ≥4.5:1; never rely on
   color alone; images have alt text. `make ci` runs axe — keep it green.
7. **Data honesty.** Live data comes from info.ersn.net. If the feed can't provide
   something, show an honest placeholder/note — **never invent a number.** See
   `docs/architecture/data-feed.md` and `FEATURE_REQUESTS.md`.
8. **Naming:** always `S.I.E.R.R.A` with periods in visible copy ("SIERRA" only in
   code). The full legal name must appear at least once per page (the footer does
   this automatically).

## How to build pages

Pages are **assembled from existing components only** (`src/components/`). Don't
write bespoke layout/markup in a page when a component exists. If you genuinely need
a new pattern, build a small component that uses tokens, matches the others, and add
it — don't inline one-off styles. Each folder has its own `CLAUDE.md` with specifics.

## Before you commit

```sh
make verify   # astro check + stylelint + prettier + unit tests (fast)
```

Before shipping / opening a PR:

```sh
make ci        # adds build + Playwright a11y + smoke tests
make screenshots   # regenerate tests/screenshots, then LOOK at them
```

If you changed anything visual, **regenerate and actually view the screenshots** to
confirm nothing overflowed, misaligned, or lost contrast. The deterministic harness
(`scripts/screenshots.ts`) freezes the clock and mocks the feed so the images are
stable.

## What NOT to do

- ❌ Add a raw hex color or a new font anywhere outside `tokens.css`.
- ❌ Use orange for anything that isn't a genuine risk/alert state.
- ❌ Add drop shadows, rounded corners, gradients (except the one hero glow), or
  trendy effects.
- ❌ Reintroduce the content brief's neon/glass-morphism direction.
- ❌ Hard-code copy into a page when it belongs in `src/config/content.ts`.
- ❌ Fabricate live data or remove a placeholder without the feed actually providing
  the data.
- ❌ Disable a stylelint guardrail, an a11y test, or the type-checker to "make it
  pass." Fix the cause.

## Project facts

- **Stack:** Astro 7 (static `output: 'static'`), self-hosted fonts, no UI framework.
- **Package manager:** npm (`bun install` hangs behind some proxies; `bun` is used
  only as a test/script runner). Use `make install`.
- **Deploy:** AWS S3 + CloudFront, DNS at Hostinger — see `docs/deployment.md`.
- **Open pre-launch items** are listed at the bottom of `README.md`.
