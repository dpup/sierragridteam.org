# src/pages — routes

One file per route (`index`, `mesh`, `alerts`, `contact`, `404`). Astro generates a
static HTML file per page.

## Rules

- **Compose, don't author markup.** A page wires together components and passes them
  data. If you're writing raw `<div>` soup or one-off CSS in a page, stop — use or
  build a component instead.
- **Always wrap in `BaseLayout`** and pass `title`, `description`, `path`. That's what
  produces correct `<head>`, SEO/OG/JSON-LD, nav, footer, skip link, and fonts.
- **Copy comes from `src/config/content.ts`**, not inline strings. Data comes from
  `src/lib/ersn.ts` (`buildSnapshot()` at build time) or `src/config`.
- **One `<h1>` per page**, correct heading order, real landmarks.
- The homepage sets `hideBrandInNav` (the hero emblem stands in for the nav brand).
  Other pages show the compact brand lockup automatically.
- Page-level `<style>` is for page-specific composition only (grid gaps, max-widths)
  — still tokens only, no raw colors/sizes.

## Adding a page

1. Create `src/pages/<name>.astro`, wrap in `BaseLayout` with SEO props.
2. Add its copy to `src/config/content.ts` and a nav entry in `src/config/site.ts`
   if it should appear in the nav.
3. Add it to the sitemap is automatic; add it to `tests/` page lists (a11y + smoke +
   screenshots) so it's covered.
4. `make ci` and review screenshots.
