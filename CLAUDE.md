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

`docs/solutions/` holds documented solutions to past problems — bugs, conventions, and
pipeline/workflow patterns — organized by category with YAML frontmatter (`module`,
`tags`, `problem_type`). `CONCEPTS.md` (repo root) is the shared domain vocabulary: the
desks, the post kinds, and the status concepts. Both are relevant when working in an area
they cover.

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
  `live-view.ts`). The checked-in `src/data/*.json` are test fixtures only. The Grid's place
  feed is now authoritative and **polygon-scoped server-side** — every
  `/places/ebbetts-pass/map/*` layer (road_incident and weather_alert included) is clipped to
  the corridor at ingest, so the client no longer re-filters by service area / NWS zones; it
  renders what the place feed returns. (Every endpoint is camelCase; enum constants —
  `layer`/`status`/`severity` — are UPPER_CASE, layer URL slugs stay snake_case.) A layer
  whose `sourceStatus` is `UNAVAILABLE` (a sync
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
  The one runtime library is **MapLibre GL JS** (open, non-Google), used by the two maps —
  the `/live` hazard map and the `/mesh` topology map — both on **OpenFreeMap Positron**
  (`src/lib/basemap.ts`, no API key, no rate limit; replaced CARTO Positron 2026-08). Each
  map reads its colors from the CSS tokens at runtime and degrades to a static fallback if
  WebGL/tiles are unavailable (the hazards stay in the alert stream, the repeaters stay in
  the /mesh roster). The basemap credit is required and renders as visible caption text
  under each map (`BASEMAP_ATTRIBUTION`), not in a floating MapLibre control.
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
- **`/mesh` is a STATUS BOARD**, reorganised around monitoring (2026-09-17). Top to bottom:
  a **deep band** (`--surface-deep`, the one dark ground in the system) with the freshness
  stamp and four headline figures — repeaters heard N/M within `HEARD_WITHIN_HOURS`, lowest
  battery, active this hour, observed links; a **"Needs attention" strip** of anything
  outside limits, which renders NOTHING at all when there is nothing to say; **two equal
  columns that scroll independently** — map left, roster right — so per-repeater telemetry is
  never pushed below the fold; and a **full-width history chart**. The explanation of what
  the mesh IS lives on **/about#mesh**, not here: a reader needs it once, not every visit.
  Client-rendered live like `/live`: `mesh.ts` holds types + pure derivations,
  `mesh-telemetry.ts` the monitor archive, `mesh-client.ts` the fetches, `mesh-view.ts` the
  band/attention/roster/legend HTML, `mesh-history.ts` the chart, `mesh-map.ts` the MapLibre
  map, `mesh-link-paint.ts` the link expressions, `src/styles/mesh.css` the global
  `.mesh-view`-namespaced CSS.
- **TWO selections, deliberately decoupled.** The roster row, map pin and attention item
  share one (`selected`): it expands the row and frames + emphasises on the map. The history
  chart's legend has its own (`chartSelected`): it isolates a trace and nothing else. They
  answer different questions at different moments — isolating a trace to read a curve must not
  scroll the roster and fly the map somewhere, and opening a row must not blank six traces out
  of the comparison the chart exists to make.
- **Mesh data reads.** The **corridor** (`mesh_node.geojson` ∪ `mesh_link.geojson?window=`)
  loads on arrival and carries **site telemetry inline** at `properties.mesh.admin` — battery
  and enclosure temperature cost no extra request. The **monitor archive**
  (`/mesh/telemetry?node=`) is one call per monitored repeater, deferred, and feeds both the
  roster sparklines and the history chart. The **whole observed mesh** (`/mesh/links` +
  `/events?layer=MESH`, ~400 KB gz) stays lazy until the reader pans past the corridor.
  ⚠️ Send `MESH_WINDOW_QUERY[...]`, never the window key: The Grid parses `?window=` with
  Go's `time.ParseDuration`, so `30d` is not an error, it is a silent 200 carrying 72h.
  ⚠️ Every int64 is a JSON **string** and the reading is **nested** at `samples[i].reading`;
  `num()`/`adminFrom()` absorb both. Plot `reportedAt` (the monitor's clock), never
  `receivedAt`.
- **Mesh honesty.** An edge is an observation ("we heard these two repeaters relay"), never a
  routing table or a coverage claim, and a faint edge is NOT "down" — a backbone repeater
  adverts twice a day. `UNAVAILABLE` → "Unknown" counts, never a zero. No monitor →
  **"Limited Telemetry"**; a monitor that could not read the gauge → **"Gauge unread"**.
  Two battery thresholds, deliberately: `ATTENTION_BATTERY_PCT` (20) is a brass watch floor,
  `LOW_BATTERY_PCT` (10) is the orange risk line. It was 60 and fired every night — these
  sites discharge into the teens and recover after sunrise, so the strip was permanently full
  of repeaters doing exactly what they should, which is how a warning stops being read. The chart
  breaks its line on a monitor gap, marks reboots, and says "no data retained before …"
  rather than drawing empty axes — there is **no backfill** in the archive.
- **Mesh map details.** One fixed link window (`MESH_WINDOW`, 30d) and no window picker; the
  panel's **"heard in" control is a DISPLAY cut** over the same 30 days (it maps onto the
  recency tiers, changes nothing that is fetched, and defaults to 30d). Links leaving the
  corridor are hidden until a repeater is selected; selecting **emphasises its links and dims
  the rest** (never hides them). Framing on select is clamped to the corridor + 60%
  (`FOCUS_MARGIN`) — links reach the Bay Area and fitting to the furthest hop zoomed the
  foothills into a smudge. Corridor repeaters are **DOM pins** (`.mesh-pin`, real
  `<button>`s); neighbours and the backdrop stay cheap circle layers. **Every link is 1px
  wide** — weight, tier, selection and hover all ride on OPACITY alone. Width and opacity were
  both carrying the same variables, so a busy link came out 4x heavier AND 4x brighter and the
  map read as a few fat trunks; the legend's key follows the same rule. The popover is the
  **"anchored strip"** and is now for **neighbours and links only** — a corridor pin has a
  roster row, and that row is its detail surface. Link filter/paint expressions live in
  `mesh-link-paint.ts` as pure JSON so `mesh-link-paint.test.ts` can compile them against the
  real style spec: **MapLibre drops an invalid expression SILENTLY**, so eyeballing the map
  is not a test.
- **Roster sparkline span is FIXED at `SPARK_WINDOW_HOURS` (6 h)**. It must NOT follow the history chart's Day/Week/Month: it used to, so switching a
  control 700px down the page silently changed every row's span with nothing in the row to
  say so, and at a month 2,880 points collapsed into a solid band in 72×18 units.
- **The history chart's hover hint** is what makes seven muted traces individually readable:
  hovering a line (or a legend entry) lifts it, drops the rest to 12%, and names the repeater
  with its value AT that moment — `valueAt` returns null outside a tolerance, so hovering a
  monitor outage says nothing rather than reaching across the gap. Emphasis is a class toggle
  on the paths, never a re-render, or it fights the mouse. The plot's ground is a `<rect>`
  INSIDE the SVG (`--surface-hero`), not a background on the container, so the axis labels sit
  outside it and the band needs no border.
- **The chart series palette** (`--series-1..7`) is the ONE categorical scale in the system
  and appears nowhere else. It was chosen by search under four constraints (contrast, normal
  separation, colour-vision separation, and no hue near the alert orange) and is pinned by
  `src/lib/mesh-series.test.ts`. A hand-edit has no visible symptom for the author — that
  test already rejected one candidate that looked fine by eye. An 8th series means re-running
  the search, not appending a guess.
- **The blog** (`/blog`) is an Astro content collection: markdown posts in
  `src/content/blog/`, one file per post named `yyyy-mm-dd-topic.md` (the filename is
  the URL slug; `pubDate` must match the date prefix). Frontmatter: `title`,
  `description` (one sentence), `pubDate`, optional `updatedDate` + `summary`
  (live bulletins only — see below), `tag` (one pillar), optional `author`.
  `/blog` shows recent posts in full, `/blog/archive` lists titles by year/month.
  The blog also has an RSS feed at **`/rss.xml`** (`src/pages/rss.xml.ts`, `@astrojs/rss`
  — a prerendered static endpoint, not baked live data). It mirrors the `/blog` ordering
  (`updatedDate ?? pubDate`) and honesty model: a live bulletin uses its `summary` fold
  head with a stable permalink `guid`, so an update re-surfaces the same entry in readers
  rather than duplicating it. `<link rel="alternate">` autodiscovery is in `Seo.astro`
  (every page); the visible "Subscribe via RSS" link is on `/blog`.
  Post copy follows `docs/content-style-guide.md` AND `docs/news-feed-content-brief.md`
  (scope, sourcing, and hard rules for what may be published). Keep post headlines
  under ~46 chars so the page title stays ≤60 with the site suffix.
- **Two automated desks** publish to `/blog` via member-reviewed PRs (never direct):
  the **News Desk** (slow channel; `docs/news-feed-content-brief.md`) and the **Fire
  Desk** (live wildfire bulletins; `docs/fire-desk-content-brief.md`). Runbook:
  `docs/architecture/news-desk.md`. Merge auto-deploys, so `main` must stay
  branch-protected. A trusted member can also **comment on a desk PR** to have the
  **Desk Editor** (`.github/workflows/desk-editor.yml`) apply light edits/corrections on
  the branch — same edit-then-critic honesty pipeline; it won't fabricate data to satisfy
  a request. To **propose a topic**, file an issue and label it `desk:news` (draft now,
  cadence guard bypassed) or `desk:topic` (backlog for the daily run); a member's draft is
  treated as source material, not final copy. A proposal is also the **only** route by which
  S.I.E.R.R.A itself may be a post's subject (a "commissioned" post, tagged `Announcement`,
  brief §4.6) — the desk never originates organizational news, and no proposal licenses a
  claim about the network's coverage or performance. A proposal that is already **a finished
  signed piece** is a member submission (tagged `Member Submission`, the member's byline,
  brief §4.7): the desk **copy-edits it, never rewrites it** — voice rules don't bind the
  author's copy, but canonical spellings, typos, hard specs, and the §10 honesty rules are
  always fixed. See the runbook's "Proposing topics".
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
- **Supporters:** the homepage band renders `src/config/supporters.ts` — add or remove an
  organization there, never in markup. A supporter's logo is used **unmodified** (their brand
  is not ours to recolor), which makes this the one sanctioned place non-palette color
  appears. Only list an organization once the relationship is real and they have agreed to be
  named, and don't characterize what they gave unless we actually know.
- **Pre-launch tracking** lives outside this repo (the project-hub repo); don't add
  a checklist here. Repo-local TODOs are inline comments at the relevant code.
