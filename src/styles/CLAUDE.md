# src/styles — tokens & base

These files define the visual language. Changing them is high-leverage and
high-risk: a token change restyles the entire site. Edit deliberately.

## Files

- **`tokens.css`** — the design tokens (colors, type scale, spacing, geometry,
  motion). **This is the ONLY file allowed to contain raw hex colors and raw px
  font-sizes.** Everything else references these variables.
- **`base.css`** — element defaults + global a11y primitives (reset, headings,
  links, focus ring, skip link, reduced-motion guard). Element-level only.
- **`global.css`** — imports the two above (loaded once by `BaseLayout`).

## Changing a token

- Keep the palette intent: green = brand/actions, brass = small accents only,
  orange = risk only, parchment surfaces, warm-tan borders. Don't add unrelated
  colors.
- **Color + accessibility:** any color used as text must keep ≥4.5:1 contrast on its
  surface (≥3:1 for large text). The muted/brass/orange _text_ tokens are already
  tuned to pass AA — if you lighten them, re-check with `make ci` (axe) and the
  contrast math in `docs/architecture/accessibility.md`. (This is why a few values
  here are slightly darker than the source style guide's hexes — comments note it.)
- Don't rename a token without updating every `var(--…)` reference (grep first).
- After any change: `make ci` and `make screenshots`, then look at the images.

## Don't

- ❌ Move raw colors/sizes out of here into components (defeats the system).
- ❌ Add a second source of truth (Tailwind config, inline themes, etc.).
- ❌ Weaken the reduced-motion or focus-visible rules in `base.css`.
