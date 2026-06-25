# SEO & Metadata Plan — sierragridteam.org

Centralized in `<Seo>` (`src/components/Seo.astro`) + `src/config/site.ts`. Every page passes
`title`, `description`, `path`; everything else derives automatically.

## Per-page `<head>` checklist
- `<title>` — `"{Page} — S.I.E.R.R.A"`; home = `"S.I.E.R.R.A — Signal Integrity & Emergency Radio Response Alliance"`.
- `<meta name="description">` — unique, ≤155 chars, written per page (see table).
- `<link rel="canonical">` — absolute, from `site` + `path` (no trailing slash except root).
- `<meta name="robots">` — `index,follow` (404 = `noindex`).
- **Open Graph** — `og:type`(website), `og:site_name`, `og:title`, `og:description`, `og:url`,
  `og:image` (1200×630), `og:image:alt`, `og:locale`(en_US).
- **Twitter** — `summary_large_image`, title/description/image.
- `theme-color` — `#1D5B3F` (brand green).
- `<html lang="en">`.

## Structured data (JSON-LD)
- **Sitewide (`Organization` / `NGO`)** in footer or layout: `name` (full legal name),
  `alternateName` "S.I.E.R.R.A", `url`, `logo`, `email`, `foundingDate` "2026",
  `areaServed` (Calaveras County, Tuolumne County), `address` (PostOfficeBox 2071, Murphys CA 95427),
  `nonprofitStatus`, `knowsAbout` (emergency communications, LoRa mesh, amateur radio).
- **Home** adds `WebSite` with `url`.
- **Contact** adds `ContactPage`.

## Per-page meta descriptions
| Path | Description (draft) |
|---|---|
| `/` | Off-grid emergency communications for the Calaveras & Tuolumne foothills. S.I.E.R.R.A builds, operates, and trains the volunteers behind a resilient LoRa mesh network. |
| `/mesh` | Live coverage map of the S.I.E.R.R.A LoRa/Meshtastic mesh network across the Highway 4 and Highway 49 corridors. |
| `/alerts` | Current weather, fire-weather, and road alerts for the Calaveras & Tuolumne foothills, plus CHP dispatch and emergency resource links. |
| `/contact` | Volunteer with S.I.E.R.R.A — ham operators, LoRa techs, and emergency-management roles. Reach us by mail or email. |

## Generated/static SEO assets
- `astro.config` `site: 'https://sierragridteam.org'`.
- `@astrojs/sitemap` → `sitemap-index.xml` + `sitemap-0.xml`.
- `public/robots.txt` — allow all, point to sitemap.
- `public/site.webmanifest` — name, theme/background `#1D5B3F`/`#F3EFE4`, icons.
- Favicons (`favicon.svg`, `favicon.ico`, `apple-touch-icon.png`) + `og-default.png` (1200×630),
  generated from the logo via `scripts/gen-assets`.

## Performance (Core Web Vitals = ranking + UX)
- Self-hosted fonts (`@fontsource`), `font-display: swap`, preload the two most-used faces.
- No render-blocking third-party JS. The mesh/CHP `<iframe>`s are `loading="lazy"`.
- Astro ships zero JS by default; only the small refresh/clock islands hydrate.
- Images: explicit width/height to avoid CLS; logo as SVG where possible.
- Target Lighthouse ≥95 across the board (verified in Phase 8).
</content>
