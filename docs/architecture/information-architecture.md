# Information Architecture — sierragridteam.org

> Canonical page specs come from `docs/design/design-system.html` §8 (Page Inventory),
> which **supersedes** the rougher `docs/design/content-brief.md` wherever they conflict.
> The content brief is used only for functional facts (zones, external URLs, volunteer
> roles) that the design system doesn't contradict.

## Site map

```
/                 Home        — hero coverage map → operational status → mission → doctrine → service banner
/live             Live Feed   — situation map (MapLibre) + prioritized hazard stream + conditions/roads/scanners
/mesh             Mesh / LoRa — live report: headline + figures, map, repeater table, battery chart
/partners         Partners    — partner organizations (src/config/partners.ts), partner-with-us CTA
/about            About       — story, doctrine, by-the-numbers, leadership, get-involved CTA
/contact          Contact     — P.O. Box, volunteer roles, mailto form, 911 disclaimer
/donate           Donate      — ways to give (placeholder until a provider is wired)
/alerts → /live   redirect    — the old alerts page folded into the Live Feed
/404              Not found   — on-brand fallback
robots.txt, sitemap-index.xml, site.webmanifest, og images   (generated)
```

**Primary nav order (left→right):** Home · Live Feed · Mesh · Blog · Partners · About · Contact, plus a
**Donate** CTA (orange-accent text) and a **live local clock** (America/Los_Angeles, 24h,
"PT" suffix). The header brand is the mark alone (no wordmark); the homepage hides it (the
hero emblem stands in). **Live Feed** is the public flagship during an emergency.

When a life-safety hazard is active, a site-wide **EmergencyBanner** sits above the nav.

## Global chrome

- **TopBar** (`<TopBar>`) — brand lockup (hidden on `/`), nav links, status pill, clock.
- **Footer** (`<SiteFooter>`) — full org name (legal requirement: full name ≥1× per page),
  mark, P.O. Box, copyright "Established 2026", quick links, the 911 disclaimer line.

## Page-by-page

### Home (`/`)

Order, top to bottom:

1. **Hero** — coverage-map band, min-height ~680px (NOT forced full-viewport), anchored to the
   ~1320px container. Left = message column (emblem, two-tone headline, subhead, two buttons).
   Right = stylized topographic coverage map of the service area.
   - Headline is two-tone/two-part: _"When the grid goes dark,"_ in muted warm-gray
     (`--ink-muted`), then _"the signal stays up."_ in near-black ink. Contrast carries the
     meaning — no color pop, no italics. Balance line 1 so no word is orphaned.
   - Subhead (one sentence): builds + operates + trains.
   - Buttons: primary **"Open Live Map"** (green fill → `/mesh`),
     secondary **"View the Live Feed"** (brass outline → `/live`).
   - **Map honesty rule:** the hero map is an _identity/coverage_ visual, NOT live network
     topology. It must never claim real-time node positions. Seven town markers at their real
     lat/lon: Bear Valley, Dorrington, Arnold, Murphys (HQ), Angels Camp, Columbia, Sonora, all labeled;
     links follow Hwy 4 (NE chain) & Hwy 49 (south leg) + one dashed cross-link. Marker roles:
     green = Network HQ, brass = coverage town, orange = regional hub. A thin legend strip is
     pinned to the hero bottom.
   - **Background (2026-10):** a faint, full-bleed real map behind the whole band —
     Calaveras and Tuolumne as tints, county lines as hairlines, state highways knocked out
     with route markers (`src/assets/hero-map.svg`, US Census TIGERweb + Caltrans, regenerate
     with `npm run hero-map`). Map and markers share one projection (`HERO_PROJECTION` in
     `src/config/coverage.ts`) into the centered 1320px column, so they stay aligned at any
     width; below 1320px the column pins left and the right side crops; at ≤900px map and
     markers are dropped. A parchment fade keeps the copy legible. Replaced the grid + contours.
2. **Operational Status (stats)** — section header "Real-time Operational Status" with a
   "Synced [time]" indicator on the right; a 4-column row of bordered tiles:
   - **Relay Nodes** — `N Active` — live: S.I.E.R.R.A repeaters currently heard on the mesh
     (`deriveRelayNodesTile`), NOT sites confirmed up. Links to /mesh. "—" until the fetch
     lands, "Unknown" if the feed is down.
   - **Coverage** — `2 Counties` — static scope (Calaveras & Tuolumne).
   - **Active Alerts** — live count from data.sierragridteam.org `/weather/alerts?zones=…` (NWS foothill
     zones, FR-2). `0 Active` normal; `>0` escalates count + dot to orange.
   - **Fire Weather** — `Normal` → `Elevated` (brass) → `Red Flag` (orange), from the feed's
     authoritative `weather.fireWeather.state` (FR-3). Falls back to a conservative `Normal*`
     only if the feed omits the classification — never fabricates a Red Flag.
   - On fetch failure: show last-known (build-time snapshot) value + muted "—" sync state.
     **Never** show a spinner or error in the hero region.
3. **Mission statement** — Newsreader 21px, editorial gravitas. Builds + operates + trains.
4. **Operational Doctrine** — three numbered doctrine cards: **EDUCATE / BUILD / OPERATE**.
5. **Supporters band** — organizations backing the network (`src/config/supporters.ts`),
   as logo tiles plus a green "Support this work" link to /donate. Placed here on purpose:
   after Mission and Doctrine the reader knows what we do and how, which is where social
   proof lands — and deliberately NOT in the hero, where a sponsor mark would sit beside
   "not an emergency dispatch service" and blur the one thing that page must say plainly.
   Hidden entirely when there are no supporters.
6. **Service-area banner** — full-width band, centered uppercase town list.
7. **Footer.**

### Mesh / LoRa (`/mesh`) — the report

Redesigned 2026-10 (handoff layout "1a") to match the homepage hero: parchment, Newsreader
headlines, Plex Sans labels, hairline rules, the hero map's palette. The deep green band, the
"Needs attention" strip, the map's "heard in" filter, the chart's Day / Week / Month and the
seven-colour chart palette are gone. The explainer still lives on **/about#mesh**. One column,
read top to bottom as one story:

1. **Is the mesh up?** A kicker, then an h1 generated from the data on the hero's two-line
   pattern — `9 of 11 repeaters` / `heard in the last 12 hours.` (numerals, not words; `All 11
repeaters` when every one is heard). A line of freshness follows, and — only when it is
   true — the repeaters we have stopped hearing, named in the alert orange. Then four figures
   on parchment: **Repeaters heard** `N / M`, **Lowest battery**, **Links active this hour**
   `N / M`, **Neighbour nodes**.
2. **01 Where the signal reaches** — the map (`src/lib/mesh-map.ts` over a restyled Positron,
   `src/lib/basemap-style.ts`) and a one-line legend with counts. Repeater dots are green
   (heard within the hour), brass (within 12 h) or orange with a ring (longer); links are one
   line per pair, darker and heavier the more recently heard, dashed orange when they touch a
   stale repeater. Selecting a repeater zooms to every link it has been heard on (out to the
   Bay Area), labels those neighbours and the farthest hop's distance, and opens its card.
   Cards are "blended labels": basemap-coloured, feathered into the map, joined by a leader.
3. **02 Repeaters** — one table row each: status dot · name · links · last heard · battery
   (bar + figure) · 24 h sparkline. Sort by links · battery · stalest. A row selects its
   repeater on the map and scrolls the map into view.
4. **03 Battery charge** — every monitored repeater over the last 24 hours, in one green at low
   opacity. The deepest fall (over 15 points) is drawn in brass with a one-line note; hovering
   a trace or legend entry lifts it and names its value at that moment; clicking pins it.
   Battery / Temperature tabs.

- **Two selections, decoupled.** The table, the map and the page's `?node=` URL share one;
  the chart's pinned trace is separate. Reading a curve and inspecting a site are different
  tasks, and tying them made each one disturb the other.
- **Honesty:** "No telemetry" where there is no monitor (a gap in _our_ coverage, not a
  verdict on the repeater), "Gauge unread" where a monitor could not read one, "Unknown"
  rather than a zero when the feed is down, and "not heard" — never "down" — for a stale
  repeater. A battery figure turns brass under 20% and orange under `LOW_BATTERY_PCT` (10%).
  The chart's axis starts at 50% and extends rather than clipping a night into the teens; it
  draws through a monitor outage, marks reboots, and names where the archive starts.

### Live Feed (`/live`) — the situation flagship (replaced `/alerts`)

- **Header** (on /mesh's report pattern) — kicker, an h1 generated from the alert stream
  (`3 alerts` / `for the foothills right now.`; `No active alerts` / `from the feeds we
watch.`; an unreadable feed says so instead of counting), the lede, the status pill +
  "Synced … · Auto-refreshes every 90s".
- **Four figures** — Wildfires / Evacuations / Weather alerts / Fire weather, unboxed (honest
  "Unknown" when a source is unavailable, never an implied all-clear).
- **Evacuation callout** — the official Cal OES / Genasys evacuation map link.
- **01 Live hazard map** (`src/lib/live-map.ts`) — MapLibre GL on the shared restyled basemap
  (`map-ground.ts`, as /mesh), the hazard layers severity-colored; subtle town reference dots;
  a click opens the shared "blended label" card (`map-card.ts`); SSR fallback.
- **02 Active alerts** beside it, then **03 Road conditions**, **04 Dispatch audio**, **05
  Official sources** — numbered section heads (`ReportSectionHead`).
- **The alert stream** (`renderStream` in `src/lib/live-view.ts`) — every relevant hazard,
  most-urgent first (`deriveStream` in `src/lib/hazards.ts`). The region-wide `road_incident`
  layer is filtered to the service area (`isInServiceArea`), so out-of-area incidents never show.

> `/live` is **client-rendered live**: the browser re-fetches the feeds and re-renders these
> regions from the shared `src/lib/live-view.ts` functions (same code as the SSR fallback),
> showing a loader until the first fetch resolves. See the component inventory for the contract.

- **Weather band** — a thin per-town conditions strip above the map (`/weather`, FR-4), each
  chip opening a popover; + **Road conditions** (`/roads`).
- **Dispatch audio** — Broadcastify scanner link-outs (`/scanners`).
- **Official sources** — link-outs to CHP, CAL FIRE, NWS, and USGS.

### Contact (`/contact`)

- Address: **P.O. Box 2071, Murphys, CA 95427** (no street address).
- Volunteer-role listing: Ham operators, LoRa techs, emergency management, etc.
- Contact form with optional **Ham call-sign** field; submits via **mailto:** (no backend) to
  `info@sierragridteam.org` (placeholder — see `src/config/site.ts`).
- Prominent **911 disclaimer**: this is not an emergency service; call 911 in an emergency.

## Content governance

All site copy, town lists, volunteer roles, relay-site config, external URLs, and the contact
email live in **typed config/content files** (`src/config/`, `src/content/`), **not** inline in
page markup — so non-technical edits change data, not layout. See `docs/architecture/data-feed.md`
and each directory's `CLAUDE.md`.
