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

`OperationalStatus`, `EmergencyBanner`, `live/HazardMap`, `LocalClock`, and `MeshMap`
use small client `<script>`s. They must **degrade gracefully**: SSR renders the
build-time snapshot; the client refresh enhances it and, on any failure (including
CORS, blocked map tiles, or no WebGL), **silently keeps the SSR content/fallback** —
never a spinner or error in view. Keep that contract.
