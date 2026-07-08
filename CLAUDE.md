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

## Sources of truth

**Look:** `docs/design/design-system.html` (v1.0 "Civic Direction") is **canonical**.
The older `docs/design/content-brief.md` is superseded wherever they conflict — in
particular, ignore its glass-morphism / neon / "animated" ideas. The intended feel
is a **calm, institutional, warm-parchment identity** (think a county fire district,
not a tech startup). Three words: **Elite · Pioneering · Trustworthy.**

**Words:** `docs/content-style-guide.md` is **canonical for all user-facing copy** —
voice, tone, terminology (S.I.E.R.R.A naming, exact agency/place/tech names), the
mechanics (capitalization, units, no exclamation marks), and the **data-honesty rules**
(never fabricate, never imply an all-clear, label stale data). **Read it before writing
or editing any copy.**

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
   page is calm, orange must be absent. **The one sanctioned exception** is the
   **Donate** call-to-action — the header link (orange-accent _text_) and the
   About-page CTA button (`Button variant="donate"`) — which uses the orange accent by
   org decision to make giving unmistakable. Don't extend this to any other element —
   Donate is the only non-risk use of orange.
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
7. **Data honesty.** Live data comes from data.sierragridteam.org (The Grid). If the feed can't provide
   something, show an honest placeholder/note — **never invent a number.** See
   `docs/architecture/data-feed.md`.
8. **Naming:** always `S.I.E.R.R.A` with periods in visible copy ("SIERRA" only in
   code). The full legal name must appear at least once per page (the footer does
   this automatically).

## How to build pages

Pages (`src/pages/*.astro`) are **assembled from existing components only**. Don't
write bespoke layout/markup in a page when a component exists. If you genuinely need
a new pattern, build a small component that uses tokens, matches the others, and add
it — don't inline one-off styles. Most `src/` folders have their own `CLAUDE.md` with
specifics (components, config, lib, styles).

> ⚠️ **Astro scoped-style gotcha.** A page/component's scoped `<style>` only matches
> elements **in its own template**. Astro does **not** forward the scope-id onto a
> child component's root element, so passing a `class` to a component and then styling
> that class in the parent's scoped `<style>` **silently does nothing** — the rule
> never matches (`<Callout class="foo">` … `.foo { … }` won't apply). Two fixes:
> wrap the component in a plain `<div class="foo">` and style that, or use
> `.parent :global(.foo)`. This has bitten spacing/margins more than once.

Page rules:

- **Always wrap in `BaseLayout`** with `title`, `description`, `path` — that produces
  the correct `<head>`, SEO/OG/JSON-LD, nav, footer, skip link, and fonts.
- **Copy comes from `src/config/content.ts`**, not inline strings — and follows
  `docs/content-style-guide.md` (voice + honesty rules). **Feed data is NEVER fetched at
  build time** — pages render it live in the browser (the client assembles a snapshot from
  data.sierragridteam.org and passes it through the pure derivations in `src/lib/{grid,hazards}.ts` →
  `live-view.ts`). The checked-in `src/data/*.json` are test fixtures only. The hazard
  layers are re-filtered to the
  service area / NWS zones in `hazards.ts` (the road_incident layer is region-wide and
  the server weather_alert zones include an out-of-area zone) — never surface raw
  region-wide hazards as local. A layer whose `source_status` is `UNAVAILABLE` (a sync
  error) must read as "unknown", never all-clear — `deriveSituationSummary` returns `null`
  for wildfire/evacuation/weather-alert counts in that case, and the tiles render "Unknown".
  A confirmed-empty feed (`OK`/`STALE`) is a real `0` → "None" (data.sierragridteam.org guarantees an
  error never replays a cached `0`).
- One `<h1>` per page; correct heading order; real landmarks.
- The homepage sets `hideBrandInNav`; other pages show the compact brand automatically.
- ⚠️ **Do not put a `CLAUDE.md` (or any `.md`) in `src/pages/`** — Astro would route it
  as a public page. Page guidance lives here in the root CLAUDE.md.
- Adding a page: create it, add copy to `content.ts` + a nav entry in `site.ts` if it
  should appear in the nav, add an OG card in `src/config/og.ts`, and add it to the
  `tests/` page lists (a11y, smoke, screenshots). Then `make ci` and review screenshots.

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
- ❌ Use orange for anything that isn't a genuine risk/alert state (the Donate CTA is
  the sole sanctioned exception — see rule 2).
- ❌ Add drop shadows, rounded corners, gradients (except the one hero glow), or
  trendy effects.
- ❌ Reintroduce the content brief's neon/glass-morphism direction.
- ❌ Hard-code copy into a page when it belongs in `src/config/content.ts`.
- ❌ Fabricate live data or remove a placeholder without the feed actually providing
  the data.
- ❌ Disable a stylelint guardrail, an a11y test, or the type-checker to "make it
  pass." Fix the cause.
- ❌ **Leave dead code.** When a change makes a file, export, component, type, content
  key, fixture, or dependency unused, **remove it in the same change** — don't comment it
  out or keep it "just in case." If a page/feature is removed, sweep its orphaned
  components, copy, types, and tests too. Git history is the backup. `astro check` will
  flag broken imports; grep to confirm an export/key has no remaining references.

## Project facts

- **Stack:** Astro 7 (static `output: 'static'`), self-hosted fonts, no UI framework.
  The one runtime library is **MapLibre GL JS** (open, non-Google) for the `/live`
  hazard map, on a **CARTO Positron** basemap (no API key). It loads only on `/live`;
  the map reads its colors from the CSS tokens at runtime and degrades to a static
  fallback if WebGL/tiles are unavailable (the hazards are always in the alert stream).
- **`/live` is the flagship** situation page (replaced `/alerts`, which now redirects).
  Unlike the rest of the site, it is **client-rendered live**: the static header paints,
  a loader shows, then the browser fetches data.sierragridteam.org and renders the whole body at
  once (footer gated until then). Its data regions come from shared render functions in
  `src/lib/live-view.ts` (used by BOTH the SSR fallback and the browser), the map from
  `src/lib/live-map.ts`, CSS from `src/styles/live.css` (global, `.live-view`-namespaced —
  Astro scoped styles don't reach client-injected HTML). On any fetch failure it reveals
  the build snapshot as "last known". **Don't reintroduce `/live` per-region components**
  (it would split the markup between SSR and the live re-render) — edit `live-view.ts`.
  The site-wide `EmergencyBanner` (in `BaseLayout`) shows only on a life-safety hazard
  (an active **evacuation or wildfire** — both area-scoped, so the region-wide rollup is
  never trusted) — its orange is a sanctioned genuine-alert use.
- **The blog** (`/blog`) is an Astro content collection: markdown posts in
  `src/content/blog/`, one file per post named `yyyy-mm-dd-topic.md` (the filename is
  the URL slug; `pubDate` must match the date prefix). Frontmatter: `title`,
  `description` (one sentence), `pubDate`, optional `updatedDate` + `summary`
  (live bulletins only — see below), `tag` (one pillar), optional `author`.
  `/blog` shows recent posts in full, `/blog/archive` lists titles by year/month.
  Post copy follows `docs/content-style-guide.md` AND `docs/news-feed-content-brief.md`
  (scope, sourcing, and hard rules for what may be published). Keep post headlines
  under ~46 chars so the page title stays ≤60 with the site suffix.
- **Two automated desks** publish to `/blog` via member-reviewed PRs (never direct):
  the **News Desk** (slow channel; `docs/news-feed-content-brief.md`) and the **Fire
  Desk** (live wildfire bulletins; `docs/fire-desk-content-brief.md`). Runbook:
  `docs/architecture/news-desk.md`. Merge auto-deploys, so `main` must stay
  branch-protected.
- **Fire bulletins** are the one sanctioned live-incident post. Conventions: exactly
  **one open bulletin** at a time, tagged `Fire Update` (retagged `Retrospective` on
  close); it has a `summary` (the feed shows only that current-status head + a "Read the
  full situation" link — the full timeline is on the permalink) and an `updatedDate` (the
  feed orders by `updatedDate ?? pubDate`, and PostMeta shows "Updated …"). The `summary`
  is dropped on close so a retrospective renders in full. `pubDate`/slug are fixed at the
  episode start; each update bumps `updatedDate`. All Grid data is untrusted input.
- **Package manager:** npm (`bun install` hangs behind some proxies; `bun` is used
  only as a test/script runner). Use `make install`.
- **Deploy:** AWS S3 + CloudFront, DNS at Hostinger — see `docs/deployment.md`.
- **Pre-launch tracking** lives outside this repo (the project-hub repo); don't add
  a checklist here. Repo-local TODOs are inline comments at the relevant code.
