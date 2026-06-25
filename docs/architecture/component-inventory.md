# Component Inventory — S.I.E.R.R.A

> Build these **before** pages. Every page is assembled from these components only.
> Each component reads design tokens (`src/styles/tokens.css`) — no inline hex/size/font.
> Components live in `src/components/`. Props are typed (TypeScript). See each component's
> header comment for its contract.

## Layout & chrome
| Component | File | Contract |
|---|---|---|
| `BaseLayout` | `layouts/BaseLayout.astro` | HTML shell: `<head>` via `<Seo>`, skip-link, `<TopBar>`, `<slot/>`, `<SiteFooter>`. Props: `title`, `description`, `path`, `ogImage?`, `hideBrandInNav?`, `wide?`. |
| `Seo` | `components/Seo.astro` | All `<head>` meta: title, description, canonical, OG, Twitter, JSON-LD, favicons, theme-color. Props from page frontmatter. |
| `TopBar` | `components/TopBar.astro` | Brand lockup (hidden when `hideBrand`), nav (Mesh·Alerts·Contact), `<StatusPill>`, `<LocalClock>`. |
| `SiteFooter` | `components/SiteFooter.astro` | Mark + full legal name + P.O. Box + established 2026 + quick links + 911 disclaimer line. |
| `Container` | `components/Container.astro` | Centered max-width wrapper (`--container-max`/`--container-wide` via `wide` prop) + gutters. |
| `Section` | `components/Section.astro` | Vertical-rhythm section wrapper (`--space-8`/`--space-9` padding), optional `surface` prop. |

## Brand
| Component | File | Contract |
|---|---|---|
| `Logo` | `components/Logo.astro` | Renders a lockup. Props: `variant: 'mark' \| 'compact' \| 'full'`, `height?`. SVG mark + optional wordmark/tagline. Never recolored/stretched. |

## Core building blocks (design system §5)
| Component | File | Contract |
|---|---|---|
| `Button` | `components/Button.astro` | `variant: 'primary' \| 'secondary'`, `href`, optional trailing arrow (`arrow`). Primary = green fill/parchment text; secondary = brass outline/brass text/faint tint. Square corners, IBM Plex Sans ~12.5px wide tracking. Hover = one step. |
| `Kicker` | `components/Kicker.astro` | Uppercase brass mono/sans label (optionally numbered "01 —"). The eyebrow above headings. |
| `SectionHeader` | `components/SectionHeader.astro` | `<Kicker>` + serif title (+ optional right-aligned slot, e.g. "Synced [time]"). |
| `StatTile` | `components/StatTile.astro` | Bordered tile: status dot (`state`) + uppercase label, large Newsreader value, uppercase sublabel. Props: `label`, `value`, `sublabel`, `state: 'ok'\|'elevated'\|'alarm'\|'muted'`. |
| `DoctrineCard` | `components/DoctrineCard.astro` | Numbered ("01 /") + kicker (EDUCATE/BUILD/OPERATE) on a thin rule, serif title, body. Three across. |
| `StatusPill` | `components/StatusPill.astro` | Blinking green dot + label ("Operational"). Also used as the stats "Synced" indicator (`tone` prop). |
| `ServiceBanner` | `components/ServiceBanner.astro` | Full-width band, top+bottom tan rules, centered uppercase town list with green/brass accent words. |
| `Card` | `components/Card.astro` | Generic bordered card (1px tan border, `--surface-card` fill, square, no shadow). Slot-based. |
| `Callout` | `components/Callout.astro` | Banner-surface call-out with a left accent rule (`accent: 'green'\|'brass'\|'orange'`). For notes/disclaimers. |

## Homepage hero
| Component | File | Contract |
|---|---|---|
| `Hero` | `components/home/Hero.astro` | The coverage-map band. Composes `CoverageMap` + message column + legend strip. |
| `CoverageMap` | `components/home/CoverageMap.astro` | **SVG**, single coordinate system so dots & link endpoints stay aligned at any width. Layers: surface+radial glow, faint grid, topo contours, coverage links, town markers+labels. Reads town coords from `src/config/coverage.ts`. Identity visual only — never claims live topology. |
| `MapMarker` | (inline in CoverageMap) | Role-colored dot + expanding ring ping; optional label chip on translucent parchment. Major towns labeled only. |

## Live-data islands (client JS; framework: vanilla `<script>` or Astro island)
| Component | File | Contract |
|---|---|---|
| `LocalClock` | `components/LocalClock.astro` | America/Los_Angeles, 24h, "PT". Hydrates client-side; SSR renders build-time value. |
| `OperationalStatus` | `components/home/OperationalStatus.astro` | The 4 stat tiles + "Synced" indicator. SSR from build-time snapshot; client refresh every 5 min from info.ersn.net with graceful fallback. |
| `AlertsFeed` | `components/alerts/AlertsFeed.astro` | Live alert cards; SSR snapshot + 5-min client refresh; expandable detail; severity color-coding. |
| `MeshMap` | `components/mesh/MeshMap.astro` | `<iframe>` embed of livemap.wcmesh.com with loading state + "Open Full Map". |
| `EmbeddedDashboard` | `components/alerts/EmbeddedDashboard.astro` | Browser-chrome-framed `<iframe>` (CHP CAD). |

## Hard rules for every component
1. **Tokens only.** No literal colors, fonts, or px font-sizes — reference CSS variables.
2. **Square corners**, 1px tan borders, **no drop shadows** on cards.
3. **Orange only for risk.** Never use `--signal-orange` decoratively.
4. **Serif ≤ 600 weight.** Uppercase tracking on small UI labels.
5. **Respect `prefers-reduced-motion`** for every animation.
6. **Accessible:** semantic elements, `aria-label`s on icon-only controls, visible focus,
   ≥4.5:1 text contrast. See `docs/architecture/accessibility.md`.
