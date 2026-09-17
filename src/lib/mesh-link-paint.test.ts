/**
 * Validates /mesh's link expressions against the REAL MapLibre style spec.
 *
 * Why this file exists: MapLibre drops an invalid paint expression **silently** — no throw,
 * no console warning. The property just never applies, so the layer renders wrong or
 * disappears, and it looks like a data problem. The classic version of the trap is putting
 * `zoom` inside a `case` (it is only legal at the top level), which is exactly the shape
 * `linkOpacity` has to thread. These tests fail the build instead.
 */
import { test, expect } from 'bun:test';
import { expression, type StylePropertySpecification } from '@maplibre/maplibre-gl-style-spec';
import { linkFilter, linkPaint, TIER_STYLE } from './mesh-link-paint';
import { RECENCY_TIERS, type MeshRecency } from './mesh';

const KEY = 'a2d649457de4481afba636761b186898107959fe6f906fc9f838447b965ace71';

/** Both link properties are data-driven, zoom-dependent numbers. */
const NUMBER_PROP = {
  type: 'number',
  'property-type': 'data-driven',
  expression: { interpolated: true, parameters: ['zoom', 'feature', 'feature-state'] },
} as unknown as StylePropertySpecification;

const compile = (value: unknown) => expression.createExpression(value, NUMBER_PROP);

/** Evaluate a compiled paint expression for one link at one zoom. */
function evaluate(value: unknown, feature: Record<string, unknown>, zoom = 8): number {
  const parsed = compile(value);
  if (parsed.result === 'error') throw new Error(JSON.stringify(parsed.value));
  return parsed.value.evaluate({ zoom }, { type: 'Feature', properties: feature, geometry: null });
}

const link = (over: Record<string, unknown> = {}) => ({
  recency: 'live',
  outward: false,
  weight: 0.5,
  a: KEY,
  b: 'ffff',
  ...over,
});

test('every link paint expression compiles, selected and not', () => {
  for (const tier of RECENCY_TIERS) {
    for (const selected of [null, KEY]) {
      const paint = linkPaint(tier, selected);
      for (const [layer, props] of Object.entries(paint)) {
        for (const [prop, value] of Object.entries(props)) {
          const parsed = compile(value);
          // An error here is the silent-drop bug, caught at build time instead of by eye.
          expect(
            parsed.result === 'error'
              ? `${tier}/${layer}/${prop}: ${JSON.stringify(parsed.value)}`
              : 'success'
          ).toBe('success');
        }
      }
    }
  }
});

test('zoom stays at the top level — the expression MapLibre would drop without a word', () => {
  // `interpolate` outermost, every data-driven test inside its stops. If someone wraps this
  // in a `case` the compile above fails; this asserts the shape directly so the reason is
  // legible in the diff.
  const opacity = linkPaint('live', KEY).pulse['line-opacity'] as unknown[];
  expect(opacity[0]).toBe('interpolate');
  expect(JSON.stringify(opacity).indexOf('"zoom"')).toBeLessThan(40);
});

test('selecting a repeater dims the links that do not touch it, and keeps them drawn', () => {
  const tier: MeshRecency = 'live';
  const mine = link({ a: KEY });
  const theirs = link({ a: '1111', b: '2222' });
  const unselected = linkPaint(tier, null).pulse['line-opacity'];
  const selected = linkPaint(tier, KEY).pulse['line-opacity'];

  // Nothing selected: both links read the same, and a full-weight link reaches its tier's
  // full strength. (A two-argument version of the selection helper returned the demoted
  // value here, dimming the whole map.)
  expect(evaluate(unselected, mine)).toBeCloseTo(evaluate(unselected, theirs), 5);
  expect(evaluate(unselected, link({ a: KEY, weight: 1 }))).toBeCloseTo(TIER_STYLE.live.opacity, 5);

  // Selected: mine holds its strength, theirs drops back to context…
  expect(evaluate(selected, mine)).toBeCloseTo(evaluate(unselected, mine), 5);
  expect(evaluate(selected, theirs)).toBeLessThan(evaluate(unselected, theirs) * 0.5);
  // …but is never switched off. A link that vanished on selection would read as a claim
  // that it stopped existing (content-style-guide §3).
  expect(evaluate(selected, theirs)).toBeGreaterThan(0);
});

test('every link is exactly one pixel wide, whatever its weight, tier or selection', () => {
  // Width and opacity were both carrying weight and tier, so a busy recent link came out
  // four times heavier AND four times brighter than a faint one. Width is now a constant and
  // opacity is the only channel; this asserts nothing has crept back into it.
  const widths = new Set<unknown>();
  for (const tier of RECENCY_TIERS) {
    for (const sel of [null, KEY]) {
      const paint = linkPaint(tier, sel);
      widths.add(JSON.stringify(paint.base['line-width']));
      widths.add(JSON.stringify(paint.pulse['line-width']));
    }
  }
  expect([...widths]).toEqual(['1']);
});

test('reception weight rides on opacity, and a one-shot is demoted but never invisible', () => {
  const o = linkPaint('live', null).pulse['line-opacity'];
  const backbone = evaluate(o, link({ weight: 1 }));
  const oneShot = evaluate(o, link({ weight: 0 }));
  // A backbone link reads stronger than a one-shot…
  expect(backbone).toBeGreaterThan(oneShot);
  // …but log-scaled weight must not make the rare long-haul shot vanish: a link seen once in
  // a month is often the most interesting thing on the map.
  expect(oneShot).toBeGreaterThan(backbone * 0.4);
  // A missing weight is treated as the floor, never as zero opacity.
  expect(evaluate(o, { recency: 'live', outward: false, a: KEY, b: 'ffff' })).toBeCloseTo(
    oneShot,
    5
  );
});

test('the filter hides outward links until their own repeater is selected', () => {
  const run = (value: unknown, f: Record<string, unknown>) => {
    const parsed = expression.createExpression(value, {
      type: 'boolean',
      'property-type': 'data-driven',
      expression: { interpolated: false, parameters: ['zoom', 'feature'] },
    } as unknown as StylePropertySpecification);
    if (parsed.result === 'error') throw new Error(JSON.stringify(parsed.value));
    return parsed.value.evaluate({ zoom: 8 }, { type: 'Feature', properties: f, geometry: null });
  };
  const outwardMine = link({ outward: true, a: KEY });
  const outwardTheirs = link({ outward: true, a: '1111', b: '2222' });
  const corridor = link({ outward: false, a: '1111', b: '2222' });

  expect(run(linkFilter('live', null), outwardMine)).toBe(false);
  expect(run(linkFilter('live', null), corridor)).toBe(true);
  // Selection only ever ADDS: my outward links appear, everyone else's stay hidden, and the
  // corridor keeps its own.
  expect(run(linkFilter('live', KEY), outwardMine)).toBe(true);
  expect(run(linkFilter('live', KEY), outwardTheirs)).toBe(false);
  expect(run(linkFilter('live', KEY), corridor)).toBe(true);
});

test('a fresher tier is drawn stronger than a colder one', () => {
  const opacity = (t: MeshRecency) =>
    evaluate(linkPaint(t, null).pulse['line-opacity'], link({ recency: t }));
  expect(opacity('live')).toBeGreaterThan(opacity('recent'));
  expect(opacity('recent')).toBeGreaterThan(opacity('fading'));
  expect(opacity('fading')).toBeGreaterThan(opacity('cold'));
  // The dash rate carries the same ordering, so freshness survives reduced motion.
  expect(TIER_STYLE.live.stepMs).toBeLessThan(TIER_STYLE.cold.stepMs);
});
