# src/components — the design system in code

Pages are assembled from these components. Keep them consistent: a change here ripples
everywhere, which is the point. See `docs/architecture/component-inventory.md` for the
full list and each component's contract.

## Rules for every component

1. **Tokens only** in `<style>` — `var(--brand-green)`, `var(--fs-h3)`,
   `var(--space-5)`, `var(--border)`. No raw hex, no raw px font-sizes, no new fonts.
   stylelint fails CI otherwise.
2. **Match the existing patterns.** Square corners, 1px tan borders, no shadows on
   cards, uppercase tracked labels via `--font-ui`, serif via `--font-display`.
3. **Typed props.** Give every component a `Props` interface. Prefer string-union
   props (e.g. `variant: 'primary' | 'secondary'`) so misuse is a type error.
4. **Accessible by construction:** semantic elements, real `<label>`s, `aria-label`
   on icon-only controls, `aria-hidden` on decorative SVG/spans, visible focus, and
   `prefers-reduced-motion` guards on any animation.
5. **Orange is risk-only.** Use `--signal-orange` (dots/fills/large text) or
   `--signal-orange-text` (small text) **only** for genuine alert/risk states.
6. **Scoped styles stay small.** Layout-level structure belongs in `Section` /
   `Container`; don't reinvent the grid in every component.

## Adding a new component

- First check whether `Card`, `Callout`, `Button`, `StatTile`, `SectionHeader`, etc.
  already cover it. Reuse beats inventing.
- If you must add one: copy the header-comment + token discipline of an existing
  component, wire its props as a typed `Props`, and add it to
  `docs/architecture/component-inventory.md`.
- Then `make verify`, `make build`, and `make screenshots` — and look at the result.

## Live-data islands

`OperationalStatus`, `EmergencyBanner`, `LocalClock`, and `MeshMap` use small client
`<script>`s. **No feed data is rendered at build time** — they SSR a placeholder/hidden
shell and a client island fills it live. On any failure (CORS, blocked tiles, no WebGL)
they **stay on the honest placeholder** ("—" / hidden) — never stale data, never a spinner
or error in view. (`OperationalStatus`: Active Alerts + Fire Weather start "—"; the static
Relay Sites + Coverage come from owned config. `EmergencyBanner`: hidden until the client
confirms an evacuation/wildfire.)

> `/live` is the fullest version: **client-rendered live** from `src/lib/live-view.ts` (the
> shared render functions) + `live-map.ts`; CSS is global+namespaced in `src/styles/live.css`
> (Astro scoped styles don't reach client-injected HTML). It shows a loader, reveals the
> whole body once the first fetch resolves, and on failure shows an honest "feed unavailable"
> panel with the official sources — never stale data.
