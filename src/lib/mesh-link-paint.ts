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
 * What the links say (layout "2a", 2026-10):
 *   • ONE line per repeater pair — the feed's `mesh_link` is already one feature per pair,
 *     carrying the most recent observation. Never one line per observation.
 *   • Solid green, darker and slightly heavier the more recently the pair was heard.
 *   • A link touching a repeater we have not heard in 12 hours is dashed in the alert orange
 *     — the same fact the headline and the table state.
 *   • At rest only corridor-to-corridor links are drawn. Selecting a repeater draws every
 *     link it has been heard on, out to the Bay Area, and drops everything else to a trace.
 *   • Opening a link's card redraws that link on top (`selectedLinkPaint`) and dims the rest.
 */
import type { MeshRecency } from './mesh';

/** Per-recency-tier line treatment. Fresher = darker AND a touch heavier. */
export const TIER_STYLE: Record<MeshRecency, { opacity: number; width: number }> = {
  live: { opacity: 0.75, width: 1.3 },
  recent: { opacity: 0.45, width: 1.1 },
  fading: { opacity: 0.28, width: 1 },
  cold: { opacity: 0.14, width: 0.9 },
};

/** A stale repeater's links: the alert orange, dashed, one weight. */
export const STALE_STYLE = { opacity: 0.65, width: 1, dash: [2, 3] } as const;

/** What every link NOT on the selected repeater drops to — present, but only as a trace. */
export const SELECTION_REST = 0.08;
/** What every other link drops to while one link's card is open. A multiplier. */
export const LINK_FOCUS_DIM = 0.45;

type Expr = unknown;

const touches = (key: string): Expr => [
  'any',
  ['==', ['get', 'a'], key],
  ['==', ['get', 'b'], key],
];

/** `match` on the baked recency tier, for one TIER_STYLE field. */
const byTier = (field: 'opacity' | 'width'): Expr => [
  'match',
  ['get', 'recency'],
  'live',
  TIER_STYLE.live[field],
  'recent',
  TIER_STYLE.recent[field],
  'fading',
  TIER_STYLE.fading[field],
  TIER_STYLE.cold[field],
];

export interface LinkState {
  /** The selected repeater's key, or null. */
  node: string | null;
  /** The link whose card is open, or null. */
  link: string | null;
}

/**
 * Which links a layer draws. `stale` picks the dashed-orange layer or the solid one. Links
 * that leave the corridor are hidden until their own repeater is selected — there are twice
 * as many of them as corridor links and they run ten times as far, so drawn at rest they
 * bury the corridor under a starburst.
 */
export const linkFilter = (stale: boolean, s: LinkState): Expr => [
  'all',
  ['==', ['get', 'stale'], stale],
  s.node ? ['any', ['!', ['get', 'outward']], touches(s.node)] : ['!', ['get', 'outward']],
];

/**
 * Opacity, from the CURRENT selection. Three states, deliberately separate: nothing selected
 * (the tier ramp), a repeater selected (its links on the ramp, the rest at SELECTION_REST),
 * and a link's card open (every other link dimmed to LINK_FOCUS_DIM of itself).
 *
 * The neutral case is asserted on its own in the test: an earlier version returned the
 * "not touching" value when nothing was selected and dimmed the whole map by default.
 */
const opacity = (base: Expr, s: LinkState): Expr => {
  let v: Expr = s.node ? ['case', touches(s.node), base, SELECTION_REST] : base;
  if (s.link) v = ['*', v, LINK_FOCUS_DIM];
  // A hovered link lifts, so the thin line a reader is about to click reads as a target.
  return ['case', ['boolean', ['feature-state', 'hover'], false], 0.95, v];
};

/** Paint for the solid (heard-recently) and dashed (stale) link layers. */
export const linkPaint = (stale: boolean, s: LinkState) =>
  stale
    ? { 'line-width': STALE_STYLE.width, 'line-opacity': opacity(STALE_STYLE.opacity, s) }
    : { 'line-width': byTier('width'), 'line-opacity': opacity(byTier('opacity'), s) };

/** The open link, redrawn on top: a pale halo, then a solid 2px line. */
export const SELECTED_LINK = { halo: 4.5, line: 2 } as const;

/** Filter for the open link's two top layers. Matches nothing when no card is open. */
export const selectedLinkFilter = (linkId: string | null): Expr => [
  '==',
  ['get', 'id'],
  linkId ?? '',
];
