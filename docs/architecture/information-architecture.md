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
     secondary **"View Emergency Alerts"** (brass outline → `/alerts`).
   - **Map honesty rule:** the hero map is an _identity/coverage_ visual, NOT live network
     topology. It must never claim real-time node positions. Six town markers in true relative
     geography: Dorrington, Arnold, Murphys (HQ), Angels Camp, Columbia, Sonora; links follow
     Hwy 4 (NE chain) & Hwy 49 (south leg) + one dashed cross-link. Only major towns labeled
     (Murphys/HQ, Angels Camp, Sonora, Arnold). Marker roles: green = Network HQ, brass =
     coverage town, orange = regional hub. A thin legend strip is pinned to the hero bottom.
2. **Operational Status (stats)** — section header "Real-time Operational Status" with a
   "Synced [time]" indicator on the right; a 4-column row of bordered tiles:
   - **Relay Sites** — `6 Active` — static owned config.
   - **Coverage** — `2 Counties` — static scope (Calaveras & Tuolumne).
   - **Active Alerts** — live count from info.ersn.net `/weather/alerts?zones=…` (NWS foothill
     zones, FR-2). `0 Active` normal; `>0` escalates count + dot to orange.
   - **Fire Weather** — `Normal` → `Elevated` (brass) → `Red Flag` (orange), from the feed's
     authoritative `weather.fireWeather.state` (FR-3). Falls back to a conservative `Normal*`
     only if the feed omits the classification — never fabricates a Red Flag.
   - On fetch failure: show last-known (build-time snapshot) value + muted "—" sync state.
     **Never** show a spinner or error in the hero region.
3. **Mission statement** — Newsreader 21px, editorial gravitas. Builds + operates + trains.
4. **Operational Doctrine** — three numbered doctrine cards: **EDUCATE / BUILD / OPERATE**.
5. **Service-area banner** — full-width band, centered uppercase town list.
6. **Footer.**

### Mesh / LoRa (`/mesh`)

- Full-page embedded **live map** (`https://livemap.wcmesh.com/bayarea/`) with a loading state
  while it initializes. **This is the authoritative live map** — the homepage hero is not.
- Collapsible info **sidebar**: tech specs (LoRa/MeshCore), S.I.E.R.R.A deployment zones
  (Murphys, Angels Camp, Sonora, Arnold, …), security notes.
- External **"Open Full Map"** link.

### Alerts (`/alerts`)

- **Current conditions** strip — per-town temp / sky / wind for the 7 covered towns
  (info.ersn.net `/weather`, FR-4), °C→°F / km/h→mph converted.
- **Active weather alerts** — cards color-coded by severity (Critical=`--signal-orange`,
  Warning=brass, Info=green/neutral), expandable detail, auto-refresh every 5 min. Data:
  zone-filtered `/weather/alerts?zones=CAZ019,CAZ067,CAZ069,CAZ072` (FR-2, NWS/OpenWeatherMap).
- **Road conditions** — live status/travel/delay/chains for the Hwy 4 + Hwy 49 segments (`/roads`).
- **CHP & Caltrans incidents** — region-wide dispatch feed (`/incidents/mother-lode`, FR-7),
  split service-area-first with a collapsible "wider Mother Lode region" group (`splitIncidents`).
- Resource links: CHP Dispatch (cad.chp.ca.gov), NWS Sacramento, CAL FIRE, USGS Earthquakes.

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
