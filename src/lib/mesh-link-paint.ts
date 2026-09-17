/**
 * mesh-link-paint.ts — the /mesh link layers' MapLibre filter + paint expressions, as PURE
 * data. No MapLibre import, no DOM: these are plain JSON arrays, so they unit-test.
 *
 * ⚠️ This module exists because of a specific failure mode. **An invalid MapLibre expression
 * is dropped silently** — no error, no warning; the paint property simply doesn't apply and
 * the layer renders wrong or vanishes. Keeping the expressions here, out of the map's
 * closure, means `mesh-link-paint.test.ts` can run every one of them through the real style
 * spec and fail the build instead of the map failing quietly in a browser.
 *
 * The other half of that trap, also load-bearing below: **`zoom` is only legal at the TOP
 * level of a paint expression.** It may not sit inside a `case`. So `linkOpacity`'s
 * `interpolate` is outermost and every data-driven test lives inside its stops.
 */
import type { MeshRecency } from './mesh';

/**
 * Per-recency-tier line styling. Opacity alone now — width is constant (see LINK_WIDTH) —
 * plus `stepMs`, the travelling dash's frame interval, which carries the same ordering in
 * motion so freshness survives `prefers-reduced-motion` switching the dash off.
 */
export const TIER_STYLE: Record<MeshRecency, { opacity: number; stepMs: number }> = {
  live: { opacity: 0.82, stepMs: 110 },
  recent: { opacity: 0.55, stepMs: 220 },
  fading: { opacity: 0.3, stepMs: 440 },
  cold: { opacity: 0.16, stepMs: 840 },
};

/**
 * Width cut for a link that leaves the corridor. Without it the map is a starburst: outward
 * links are an order of magnitude longer than any corridor link and outnumber them 2:1, so
 * at equal weight they swamp the thing the page is actually about.
 */
/**
 * EVERY link is drawn at exactly this width. Nothing varies it — not reception weight, not
 * the recency tier, not selection, not hover.
 *
 * Weight, tier and selection all ride on OPACITY instead. Width and opacity were both
 * carrying the same variables, so a busy recent link came out four times heavier AND four
 * times brighter than a faint one: the map read as a few fat trunks rather than a field of
 * observations, and the long-haul hairlines were lost beside them. One channel is enough,
 * and opacity is the one that recedes without redrawing the network's shape.
 */
const LINK_WIDTH = 1;

/** Outward links never fade below this, whatever their recency tier or the zoom. */
const OUTWARD_MIN_OPACITY = 0.3;
/** How far a one-shot link is demoted against a backbone one, on opacity alone. */
const WEIGHT_FLOOR = 0.45;
/** Cut applied to a link that leaves the corridor, before the floor above. */
const OUTWARD_FADE = 0.5;

/**
 * Selection emphasis. Selecting a repeater asks one question — "what does THIS one reach?"
 * — so while a selection is live, every link that doesn't touch it drops back to context.
 * Opacity only; the links that DO touch it hold their strength rather than thickening.
 *
 * Dimmed, never hidden: the corridor's shape is how a reader tells WHERE the selected
 * repeater sits in it, and a link that vanished on selection would read as a claim that it
 * stopped existing (docs/content-style-guide.md §3).
 */
const SELECTION_DIM = 0.18;

type Expr = unknown;

const touchesSelection = (key: string): Expr => [
  'any',
  ['==', ['get', 'a'], key],
  ['==', ['get', 'b'], key],
];

/**
 * Three-way, deliberately: "nothing is selected" is NOT the same state as "this link does
 * not touch the selection", and collapsing them is a real bug — an earlier two-argument
 * version returned the demoted value when nothing was selected, which dimmed every link on
 * the map to 18% by default. `mesh-link-paint.test.ts` asserts the neutral case explicitly.
 */
const onSelection = (key: string | null, neutral: Expr, touching: Expr, other: Expr): Expr =>
  key == null ? neutral : ['case', touchesSelection(key), touching, other];

const onHover = (off: Expr, on: Expr): Expr => [
  'case',
  ['boolean', ['feature-state', 'hover'], false],
  on,
  off,
];

/**
 * Which links a tier's layers draw.
 *
 * Links that leave the corridor are HIDDEN by default — there are roughly twice as many of
 * them as corridor links and they are far longer, so drawing them all at once buried the
 * subject under a starburst; dimming was not enough. Selecting a repeater reveals exactly
 * its own outward links. Corridor-internal links are always drawn: selection only ever ADDS.
 */
export const linkFilter = (tier: MeshRecency, selectedKey: string | null): Expr => [
  'all',
  ['==', ['get', 'recency'], tier],
  selectedKey
    ? ['any', ['!', ['get', 'outward']], ...(touchesSelection(selectedKey) as Expr[]).slice(1)]
    : ['!', ['get', 'outward']],
];

/**
 * Reception weight, as a multiplier on opacity: a one-shot link sits at WEIGHT_FLOOR of its
 * tier's strength and a backbone link at full. `weight` is already log-scaled in mesh.ts, so
 * a link seen 482 times reads heavier than a one-shot without reading 482x heavier.
 */
const byWeight = (v: Expr): Expr => [
  '*',
  v,
  ['+', WEIGHT_FLOOR, ['*', 1 - WEIGHT_FLOOR, ['coalesce', ['get', 'weight'], 0]]],
];

/**
 * Link opacity: the tier's base value, cut for an outward link, dimmed when a selection
 * excludes it, ramped by zoom, and overridden entirely on hover.
 *
 * Outward links additionally fade IN as the reader zooms out. Framed on the corridor their
 * far endpoints are off-screen, so they would be dozens of near-parallel rays hatching the
 * view for no information — there they stay a whisper. Zoom out to where those endpoints
 * actually are and they strengthen, which is exactly when the long-haul reach is the thing
 * worth looking at.
 */
const linkOpacity = (base: number, hover: number | null, selectedKey: string | null): Expr => {
  const stop = (mult: number): Expr => {
    // Scaling the tier's opacity alone made an outward link on the `cold` tier (base 0.16)
    // effectively invisible when framed on the corridor. These links are the proof the
    // corridor reaches the wider mesh, so they get a hard legibility floor — demoted, never
    // gone. Raise OUTWARD_MIN_OPACITY if they still read as too faint.
    // Weight folds in BEFORE the outward floor, so a faint long-haul shot still clears the
    // legibility floor instead of being multiplied under it.
    const inward = byWeight(base);
    const outward: Expr = ['max', byWeight(base * mult * OUTWARD_FADE), OUTWARD_MIN_OPACITY];
    const byKind: Expr = ['case', ['get', 'outward'], outward, inward];
    const bySelection = onSelection(selectedKey, byKind, byKind, ['*', byKind, SELECTION_DIM]);
    return hover == null
      ? bySelection
      : ['case', ['boolean', ['feature-state', 'hover'], false], hover, bySelection];
  };
  return ['interpolate', ['linear'], ['zoom'], 6, stop(1), 10.5, stop(0.55)];
};

/**
 * Both link layers' paint, built from the CURRENT selection. `initMeshMap` reads this when
 * it adds the layers AND again on every selection change — the emphasis is baked into the
 * expressions rather than carried in feature state, because it depends on BOTH of a link's
 * endpoints rather than on one hovered feature.
 */
export const linkPaint = (tier: MeshRecency, selectedKey: string | null) => {
  const s = TIER_STYLE[tier];
  return {
    base: {
      'line-width': LINK_WIDTH,
      // Half the tier's opacity: enough that the gaps between the pulse's dashes still read
      // as a continuous link (a link that appeared to break into dashes would read as
      // intermittent, which is a claim we're not making), light enough that the deep-green
      // dash on top clearly stands off it.
      'line-opacity': linkOpacity(s.opacity * 0.5, 0.95, selectedKey),
    },
    pulse: {
      'line-width': LINK_WIDTH,
      'line-opacity': linkOpacity(s.opacity, null, selectedKey),
    },
  };
};
