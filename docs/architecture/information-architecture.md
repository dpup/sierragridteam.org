# Information Architecture — sierragridteam.org

> Canonical page specs come from `docs/design/design-system.html` §8 (Page Inventory),
> which **supersedes** the rougher `docs/design/content-brief.md` wherever they conflict.
> The content brief is used only for functional facts (zones, external URLs, volunteer
> roles) that the design system doesn't contradict.

## Site map

```
/                 Home        — hero coverage map → operational status → mission → doctrine → service banner
/mesh             Mesh / LoRa — embedded live mesh map (authoritative) + collapsible info sidebar
/alerts           Alerts      — live NWS/region alert cards + CHP CAD dispatch + resource links
/contact          Contact     — P.O. Box, volunteer roles, mailto form, 911 disclaimer
/404              Not found   — on-brand fallback
robots.txt, sitemap-index.xml, site.webmanifest, og images   (generated)
```

**Primary nav order (left→right):** Mesh · Alerts · Contact.
Mesh is the **first** nav item (the live map is the organization's flagship capability).
Brand lockup sits left of the nav on every page **except** the homepage, where the hero
emblem stands in for it.

Nav also contains: an **"Operational" status pill** (blinking green dot) and a **live local
clock** (America/Los_Angeles, 24h, "PT" suffix).

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
   - Headline is two-tone/two-part: *"When the grid goes dark,"* in muted warm-gray
     (`--ink-muted`), then *"the signal stays up."* in near-black ink. Contrast carries the
     meaning — no color pop, no italics. Balance line 1 so no word is orphaned.
   - Subhead (one sentence): builds + operates + trains.
   - Buttons: primary **"Open Live Map"** (green fill → `/mesh`),
     secondary **"View Emergency Alerts"** (brass outline → `/alerts`).
   - **Map honesty rule:** the hero map is an *identity/coverage* visual, NOT live network
     topology. It must never claim real-time node positions. Six town markers in true relative
     geography: Dorrington, Arnold, Murphys (HQ), Angels Camp, Columbia, Sonora; links follow
     Hwy 4 (NE chain) & Hwy 49 (south leg) + one dashed cross-link. Only major towns labeled
     (Murphys/HQ, Angels Camp, Sonora, Arnold). Marker roles: green = Network HQ, brass =
     coverage town, orange = regional hub. A thin legend strip is pinned to the hero bottom.
2. **Operational Status (stats)** — section header "Real-time Operational Status" with a
   "Synced [time]" indicator on the right; a 4-column row of bordered tiles:
   - **Relay Sites** — `6 Active` — static owned config.
   - **Coverage** — `2 Counties` — static scope (Calaveras & Tuolumne).
   - **Active Alerts** — live count (info.ersn.net `/weather/alerts`; design's NWS-zone source
     is a feature request). `0 Active` normal; `>0` escalates count + dot to orange.
   - **Fire Weather** — `Normal` → `Elevated` (brass) → `Red Flag` (orange). Red-Flag
     classification is a **feature request** against info.ersn.net; placeholder until then.
   - On fetch failure: show last-known (build-time snapshot) value + muted "—" sync state.
     **Never** show a spinner or error in the hero region.
3. **Mission statement** — Newsreader 21px, editorial gravitas. Builds + operates + trains.
4. **Operational Doctrine** — three numbered doctrine cards: **EDUCATE / BUILD / OPERATE**.
5. **Service-area banner** — full-width band, centered uppercase town list.
6. **Footer.**

### Mesh / LoRa (`/mesh`)
- Full-page embedded **live map** (`https://livemap.wcmesh.com/bayarea/`) with a loading state
  while it initializes. **This is the authoritative live map** — the homepage hero is not.
- Collapsible info **sidebar**: tech specs (LoRa/Meshtastic), S.I.E.R.R.A deployment zones
  (Murphys, Angels Camp, Sonora, Arnold, …), security notes.
- External **"Open Full Map"** link.

### Alerts (`/alerts`)
- Live alert cards, color-coded by severity (Extreme=red `--signal-orange`, Severe=orange,
  Moderate=brass, Minor=green/neutral), expandable detail, auto-refresh every 5 min.
  - Data: info.ersn.net `/weather/alerts` (+ road incident alerts from `/roads`).
    Design's NWS zones CAZ064/065/258/259 are a **feature request**; show region scope + placeholder.
- Embedded **CHP CAD dispatch** view (cad.chp.ca.gov) framed with browser-chrome UI.
- County quick-links (Angels Camp + Sonora/Mother Lode).
- Resource links: NWS Sacramento, CAL FIRE, USGS Earthquakes.

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
