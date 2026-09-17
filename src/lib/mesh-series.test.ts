/**
 * Pins the `--series-*` chart palette in tokens.css.
 *
 * The scale was chosen by search, not by eye, and a hand-edit that "just darkens one a bit"
 * is exactly how a categorical palette quietly stops working for a colour-blind reader —
 * there is no visible symptom for the author. These tests recompute the same checks the
 * search ran, straight from the stylesheet, so the constraints live with the values.
 *
 * The maths is OKLab dE (x100) with Viénot-style CVD simulation, plus WCAG relative
 * luminance for contrast.
 */
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../styles/tokens.css', import.meta.url), 'utf8');
const series = [...css.matchAll(/--series-(\d+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[2]);
const token = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1] ?? '';

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (hex: string) => [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
function oklab([r, g, b]: number[]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}
const dE = (a: number[], b: number[]) => {
  const [x, y] = [oklab(a), oklab(b)];
  return 100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const MAT: Record<string, number[][]> = {
  deuteranopia: [
    [0.625, 0.375, 0],
    [0.7, 0.3, 0],
    [0, 0.3, 0.7],
  ],
  protanopia: [
    [0.567, 0.433, 0],
    [0.558, 0.442, 0],
    [0, 0.242, 0.758],
  ],
  tritanopia: [
    [0.95, 0.05, 0],
    [0, 0.433, 0.567],
    [0, 0.475, 0.525],
  ],
};
const sim = (c: number[], k: string) => MAT[k].map((r) => r[0] * c[0] + r[1] * c[1] + r[2] * c[2]);
const lum = (c: number[]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
const contrast = (a: number[], b: number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('the scale has exactly the slots mesh-history.ts hands out', () => {
  // SERIES_SLOTS in mesh-history.ts. An 8th series is never a generated hue — past this the
  // extra repeaters fall back to muted ink and the legend carries them instead.
  expect(series).toHaveLength(7);
});

test('every series line is legible on the page surface', () => {
  const surface = rgb(token('surface-page'));
  for (const hex of series) {
    // 3:1 is the floor for a 2px line; below it a trace disappears into the parchment.
    expect({ hex, ratio: +contrast(rgb(hex), surface).toFixed(2) }).toMatchObject({
      ratio: expect.any(Number),
    });
    expect(contrast(rgb(hex), surface)).toBeGreaterThanOrEqual(3);
  }
});

test('no two series are confusable in normal vision', () => {
  for (let i = 0; i < series.length; i++) {
    for (let j = i + 1; j < series.length; j++) {
      const d = dE(rgb(series[i]), rgb(series[j]));
      if (d < 15) throw new Error(`${series[i]} vs ${series[j]} too close: dE ${d.toFixed(1)}`);
    }
  }
});

test('no two series collapse under colour-vision deficiency', () => {
  for (const kind of Object.keys(MAT)) {
    for (let i = 0; i < series.length; i++) {
      for (let j = i + 1; j < series.length; j++) {
        const d = dE(sim(rgb(series[i]), kind), sim(rgb(series[j]), kind));
        // 6 is the floor, and it is legal ONLY because this chart carries secondary
        // encoding: the legend names every series with its value, hovering highlights, and
        // selecting isolates one trace. Remove any of those and this has to rise to 8.
        if (d < 6) {
          throw new Error(
            `${series[i]} vs ${series[j]} collapse under ${kind}: dE ${d.toFixed(1)}`
          );
        }
      }
    }
  }
});

test('no series sits near the reserved alert orange', () => {
  const alert = oklab(rgb(token('signal-orange')));
  const hue = (c: number[]) => (Math.atan2(c[2], c[1]) * 180) / Math.PI;
  const chroma = (c: number[]) => Math.hypot(c[1], c[2]);
  for (const hex of series) {
    const c = oklab(rgb(hex));
    // A saturated trace at the alert's hue would read as "this one is alarming" when it is
    // merely series 5 — the palette's one hard promise (CLAUDE.md rule 2).
    const near = Math.abs(hue(c) - hue(alert)) < 18 && chroma(c) > 0.07;
    if (near) throw new Error(`${hex} sits in the reserved alert-orange band`);
  }
});
