/**
 * Validates /mesh's link expressions against the REAL MapLibre style spec.
 *
 * Why this file exists: MapLibre drops an invalid paint expression or filter **silently** —
 * no throw, no console warning. The property just never applies, so the layer renders wrong
 * or disappears, and it looks like a data problem. These tests fail the build instead, and
 * pin the three selection states the map moves between.
 */
import { test, expect } from 'bun:test';
import { expression, type StylePropertySpecification } from '@maplibre/maplibre-gl-style-spec';
import {
  linkFilter,
  linkPaint,
  selectedLinkFilter,
  LINK_FOCUS_DIM,
  SELECTION_REST,
  STALE_STYLE,
  TIER_STYLE,
  type LinkState,
} from './mesh-link-paint';
import { RECENCY_TIERS } from './mesh';

const KEY = 'a2d649457de4481afba636761b186898107959fe6f906fc9f838447b965ace71';

const NUMBER_PROP = {
  type: 'number',
  'property-type': 'data-driven',
  expression: { interpolated: true, parameters: ['zoom', 'feature', 'feature-state'] },
} as unknown as StylePropertySpecification;
const FILTER_PROP = {
  type: 'boolean',
  'property-type': 'data-driven',
  expression: { interpolated: false, parameters: ['zoom', 'feature'] },
} as unknown as StylePropertySpecification;

function evaluate(
  value: unknown,
  feature: Record<string, unknown>,
  spec = NUMBER_PROP,
  hover = false
): unknown {
  const parsed = expression.createExpression(value, spec);
  if (parsed.result === 'error') throw new Error(JSON.stringify(parsed.value));
  return parsed.value.evaluate(
    { zoom: 9 },
    { type: 'Feature', properties: feature, geometry: null },
    { hover }
  );
}

const link = (over: Record<string, unknown> = {}) => ({
  id: 'mesh_link:x',
  recency: 'live',
  outward: false,
  stale: false,
  a: KEY,
  b: 'ffff',
  ...over,
});

const REST: LinkState = { node: null, link: null };
const SELECTED: LinkState = { node: KEY, link: null };
const FOCUSED: LinkState = { node: null, link: 'mesh_link:other' };
const STATES = [REST, SELECTED, FOCUSED, { node: KEY, link: 'mesh_link:x' }];

test('every link filter and paint expression compiles, in every selection state', () => {
  for (const s of STATES) {
    for (const stale of [false, true]) {
      // An error here is the silent-drop bug, caught at build time instead of by eye.
      expect(() => evaluate(linkFilter(stale, s), link(), FILTER_PROP)).not.toThrow();
      for (const value of Object.values(linkPaint(stale, s))) {
        expect(() => evaluate(value, link())).not.toThrow();
      }
    }
  }
  expect(() => evaluate(selectedLinkFilter('x'), link(), FILTER_PROP)).not.toThrow();
  expect(() => evaluate(selectedLinkFilter(null), link(), FILTER_PROP)).not.toThrow();
});

test('a fresher link is drawn darker and heavier than a colder one', () => {
  const at = (recency: string) => ({
    opacity: evaluate(linkPaint(false, REST)['line-opacity'], link({ recency })) as number,
    width: evaluate(linkPaint(false, REST)['line-width'], link({ recency })) as number,
  });
  for (let i = 1; i < RECENCY_TIERS.length; i++) {
    const fresher = at(RECENCY_TIERS[i - 1]);
    const colder = at(RECENCY_TIERS[i]);
    expect(fresher.opacity).toBeGreaterThan(colder.opacity);
    expect(fresher.width).toBeGreaterThanOrEqual(colder.width);
  }
  // …and exactly the design's ramp, so the legend's swatches match the map.
  expect(at('live')).toEqual({ opacity: TIER_STYLE.live.opacity, width: TIER_STYLE.live.width });
  expect(at('cold')).toEqual({ opacity: TIER_STYLE.cold.opacity, width: TIER_STYLE.cold.width });
});

test('nothing selected is the neutral state — no link is dimmed by default', () => {
  // The regression this guards: a two-way version returned the "not touching" value when
  // nothing was selected, and the whole map drew at the rest opacity.
  const other = link({ a: 'eeee', b: 'ffff' });
  expect(evaluate(linkPaint(false, REST)['line-opacity'], other)).toBe(TIER_STYLE.live.opacity);
});

test('selecting a repeater keeps its links on the ramp and drops the rest to a trace', () => {
  const paint = linkPaint(false, SELECTED)['line-opacity'];
  expect(evaluate(paint, link())).toBe(TIER_STYLE.live.opacity);
  expect(evaluate(paint, link({ a: 'eeee', b: 'ffff' }))).toBe(SELECTION_REST);
});

test('an open link card dims every link to a fraction of itself', () => {
  const paint = linkPaint(false, FOCUSED)['line-opacity'];
  expect(evaluate(paint, link())).toBeCloseTo(TIER_STYLE.live.opacity * LINK_FOCUS_DIM);
  // …and a hovered link always lifts, so the next one to click reads as a target.
  expect(evaluate(paint, link(), NUMBER_PROP, true)).toBe(0.95);
});

test('outward links stay hidden until their own repeater is selected', () => {
  const outward = link({ outward: true });
  expect(evaluate(linkFilter(false, REST), outward, FILTER_PROP)).toBe(false);
  expect(evaluate(linkFilter(false, SELECTED), outward, FILTER_PROP)).toBe(true);
  // Another repeater's outward link stays hidden while this one is selected.
  const theirs = link({ outward: true, a: 'eeee', b: 'ffff' });
  expect(evaluate(linkFilter(false, SELECTED), theirs, FILTER_PROP)).toBe(false);
  // Corridor links are always drawn: selection only ever adds.
  expect(evaluate(linkFilter(false, SELECTED), link({ a: 'eeee' }), FILTER_PROP)).toBe(true);
});

test("a stale repeater's links go to the dashed orange layer, and only there", () => {
  const stale = link({ stale: true });
  expect(evaluate(linkFilter(true, REST), stale, FILTER_PROP)).toBe(true);
  expect(evaluate(linkFilter(false, REST), stale, FILTER_PROP)).toBe(false);
  expect(evaluate(linkPaint(true, REST)['line-opacity'], stale)).toBe(STALE_STYLE.opacity);
});
