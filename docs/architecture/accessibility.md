# Accessibility Plan — sierragridteam.org

Target: **WCAG 2.2 AA.** This is a public-safety site for a split audience including older
residents — accessibility is a requirement, not a nicety.

## Structure & semantics

- One `<h1>` per page; logical heading order (no skipped levels).
- Landmarks: `<header>` (banner), `<nav>` (with `aria-label`), `<main id="main">`,
  `<footer>` (contentinfo).
- **Skip link** ("Skip to content") as the first focusable element → `#main`.
- Lists are real `<ul>/<ol>`; the contact form uses real `<label>`s tied to inputs.

## Color & contrast (verify in Phase 8)

- Body `--ink-body` (#3C453C) on parchment `--surface-page` (#F3EFE4) ≥ 7:1.
- Brass text `--brand-brass-text` (#8A6A26) used only at ≥600 weight / large or label sizes;
  verify ≥4.5:1 on its surface. Never use light brass `--brand-brass` (#B08A3E) for body text.
- **Never rely on color alone.** Status dots pair with a text label; alert severity pairs with
  a text severity word + (optional) icon; fire-weather state always shows the word.

## Keyboard & focus

- All interactive elements reachable and operable by keyboard in DOM order.
- **Visible focus ring** on every focusable element (2px brand-green outline + offset);
  never `outline: none` without a replacement.
- The collapsible mesh sidebar toggle is a real `<button aria-expanded>`; expandable alert
  cards use `<button aria-expanded aria-controls>`.
- Both MapLibre maps degrade to text: /live keeps the alert stream, /mesh keeps the corridor
  roster, so no information is map-only. The /mesh roster rows are real `<button>`s, and so
  are the corridor map pins themselves (`.mesh-pin`, each with an `aria-label` naming the
  repeater and its status) — a canvas circle layer could never be reached by keyboard. The
  map popover is `role="dialog"` with an `aria-label`, takes focus on open, and puts its
  close button first in the tab order; Escape and a click on bare map both dismiss it.
- The /mesh loading panel is `role="status" aria-live="polite"` and is hidden with
  `visibility: hidden` (not opacity alone) once it's done, so it leaves the a11y tree.

## Motion

- Honor `prefers-reduced-motion: reduce` — disable status-dot blink and map pings entirely
  (tokens gate this in `tokens.css` / component `<style>`).

## Forms (contact)

- Every field has a visible `<label>`; required fields marked in text + `required`.
- Ham call-sign field clearly **optional**.
- `mailto:` submission; if JS builds the body, the form still works without JS (native submit).
- Inline, programmatic error/help text via `aria-describedby`.

## Images & icons

- Logo has a meaningful `alt` ("S.I.E.R.R.A — Signal Integrity & Emergency Radio Response Alliance")
  or `aria-label` on the decorative mark variants; purely decorative SVG layers are `aria-hidden`.
- The hero coverage map is decorative/identity → `role="img"` with a concise `aria-label`
  describing it as a service-area coverage map (not live data).

## Emergency clarity

- The **911 disclaimer** is prominent on `/contact` and in the footer: this site/org is not an
  emergency dispatch service; in an emergency call 911.

## Automated checks

- `astro check` (types) + `eslint-plugin-jsx-a11y`-equivalent review of components.
- Playwright + `@axe-core/playwright` runs axe on every page in CI (Phase 6); zero critical
  violations is a merge gate.
