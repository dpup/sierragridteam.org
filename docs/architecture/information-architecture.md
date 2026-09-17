# Information Architecture — sierragridteam.org

> Canonical page specs come from `docs/design/design-system.html` §8 (Page Inventory),
> which **supersedes** the rougher `docs/design/content-brief.md` wherever they conflict.
> The content brief is used only for functional facts (zones, external URLs, volunteer
> roles) that the design system doesn't contradict.

## Site map

```
/                 Home        — hero coverage map → operational status → mission → doctrine → service banner
/live             Live Feed   — situation map (MapLibre) + prioritized hazard stream + conditions/roads/scanners
/mesh             Mesh / LoRa — embedded live mesh map (authoritative) + collapsible info sidebar
/about            About       — story, doctrine, by-the-numbers, leadership, get-involved CTA
/contact          Contact     — P.O. Box, volunteer roles, mailto form, 911 disclaimer
/donate           Donate      — ways to give (placeholder until a provider is wired)
/alerts → /live   redirect    — the old alerts page folded into the Live Feed
/404              Not found   — on-brand fallback
robots.txt, sitemap-index.xml, site.webmanifest, og images   (generated)
```

**Primary nav order (left→right):** Home · Live Feed · Mesh · About · Contact, plus a
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
     topology. It must never claim real-time node positions. Six town markers in true relative
     geography: Dorrington, Arnold, Murphys (HQ), Angels Camp, Columbia, Sonora; links follow
     Hwy 4 (NE chain) & Hwy 49 (south leg) + one dashed cross-link. Only major towns labeled
     (Murphys/HQ, Angels Camp, Sonora, Arnold). Marker roles: green = Network HQ, brass =
     coverage town, orange = regional hub. A thin legend strip is pinned to the hero bottom.
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

### Mesh / LoRa (`/mesh`) — the status board

Reorganised around monitoring (2026-09-17). The "what is the mesh" explainer moved to
**/about#mesh**, which freed the top of the page for the figures an operator actually opens
it for. Top to bottom:

1. **Deep metrics band** (`--surface-deep`) — the freshness stamp and four headline figures:
   **Repeaters heard** `N / M` within 12 h, **Lowest battery**, **Active this hour**,
   **Observed links**. Brass marks only the two that can go wrong.
2. **"Needs attention" strip** — anything outside limits, each item a button that selects
   that repeater. Two kinds, because they are different failures: a battery under the watch
   floor of 20% (brass) and a repeater not heard inside the window (orange). The region
   renders **nothing at all** when there is nothing to say — a standing bar that is almost
   always reassuring trains a reader to skip the place where the warnings appear.
3. **Two equal columns, each scrolling independently**, so per-repeater telemetry is never
   pushed below the fold by whatever sits above it.
   - **Map** (`src/lib/mesh-map.ts`, MapLibre + OpenFreeMap Positron) with a **"heard in"**
     display cut (1h · 6h · 24h · 30d, defaulting to 30d) and its legend collapsed into one
     horizontal strip along the panel's foot.
   - **Roster** with **sort** by links · battery · stalest. Each row carries the recency
     pulse (_can we hear it_), a battery bar and a **sparkline** (_which way is it going_),
     and a monitored row expands **inline** to Battery · Volts · Enclosure. The sparkline's
     span is a fixed 6 h, deliberately not tied to the chart's range control, and drawn on an
     absolute 0–100 scale so a steady 90–100% node cannot look like one that is collapsing.
4. **History band** — every monitored repeater on one scale, with **Battery / Temp** and
   **Day / Week / Month**. The legend doubles as the selector, and **hovering a trace or a
   legend entry** lifts it, drops the rest back and names it with its value at that moment —
   which is what makes seven muted colours individually readable. The plot sits on a warm
   band with no frame; the axis labels sit outside it on the page ground.

- **Two selections, decoupled.** Roster row · map pin · attention item share one — it opens
  the row and frames + emphasises the repeater on the map. The chart's legend has its own — it
  isolates a trace and touches nothing else. Reading a curve and inspecting a site are
  different tasks, and tying them made each one disturb the other. Non-selected traces and
  links dim to context, never to nothing.
- **Honesty:** "Limited Telemetry" where there is no monitor (a gap in _our_ coverage, not a
  verdict on the repeater), "Gauge unread" where a monitor could not read one, "Unknown"
  rather than a zero when the feed is down. Orange only below `LOW_BATTERY_PCT` (10%). The
  chart breaks its line across a monitor outage, marks reboots, and names where the archive
  starts rather than drawing empty axes over a range that predates it.

### Live Feed (`/live`) — the situation flagship (replaced `/alerts`)

- **Status header** — situation status pill (Operational / Advisory / Active Incident) +
  "Synced … · Auto-refreshes every 90s".
- **Summary tiles** — Wildfires / Evacuations / Weather Alerts / Fire Weather (honest
  "Unknown" when a source is unavailable, never an implied all-clear).
- **Evacuation callout** — the official Cal OES / Genasys evacuation map link.
- **Live hazard map** (`src/lib/live-map.ts`) — MapLibre GL + OpenFreeMap Positron, with the
  `/hazards/*.geojson` layers severity-colored; subtle town reference dots; SSR fallback.
- **Active alerts stream** (`renderStream` in `src/lib/live-view.ts`) — every relevant hazard,
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
