/**
 * Section 03, the battery history. Asserted on what a reader would take away: which night is
 * singled out (and that an ordinary one is not), that a low reading is drawn rather than
 * clipped, and that the chart says how many repeaters it covers.
 */
import { test, expect } from 'bun:test';
import { renderMeshHistory, DROP_HIGHLIGHT_POINTS } from './mesh-history';
import { buildSeries, type TelemetrySeries } from './mesh-telemetry';
import type { MeshNode } from './mesh';

// 08:00 PT: the window covers the previous evening and night.
const NOW = Date.parse('2026-09-17T15:00:00Z');

const repeater = (key: string, name: string): MeshNode => ({
  publicKey: key,
  name,
  nodeType: 'repeater',
  lng: -120.3,
  lat: 38.2,
  inRegion: true,
  ours: true,
  status: 'ACTIVE',
  gatewayCount: 1,
  admin: { batteryPercent: 90 },
});

/** Hourly battery readings across the last 24 hours, from a function of the hour index. */
const series = (key: string, at: (h: number) => number): TelemetrySeries =>
  buildSeries(key, {
    coverage: { from: new Date(NOW - 30 * 3_600_000).toISOString(), samples: '25' },
    samples: Array.from({ length: 25 }, (_, h) => ({
      reading: {
        reportedAt: new Date(NOW - (24 - h) * 3_600_000).toISOString(),
        batteryPercent: at(h),
        // Enclosure temperature follows the same shape, so the temperature view has a fall too.
        temperatureC: at(h) - 60,
      },
    })),
  });

const render = (list: [MeshNode, TelemetrySeries][], metric: 'battery' | 'enclosure' = 'battery') =>
  renderMeshHistory(
    list.map(([n]) => n),
    new Map(list.map(([n, s]) => [n.publicKey, s])),
    { metric, pinned: null },
    NOW
  );

const calm = (h: number) => 90 + (h % 3);
// Falls from ~92 to 58 in the small hours, recovers after sunrise.
const deep = (h: number) => (h < 8 ? 92 : h < 18 ? 58 : 88);

test('the intro states how many repeaters the chart covers', () => {
  const v = render([
    [repeater('a', 'SIERRA Eagle One'), series('a', calm)],
    [repeater('b', 'SIERRA Snowshoe Lake'), series('b', calm)],
  ]);
  expect(v.intro).toBe('Last 24 hours, for the 2 repeaters that report telemetry.');
});

test('the deepest fall is highlighted and named at its low point', () => {
  const v = render([
    [repeater('a', 'SIERRA Eagle One'), series('a', calm)],
    [repeater('b', 'SIERRA Arnold Summit'), series('b', deep)],
  ]);
  expect(v.body).toContain('mesh-chart__line--drop');
  expect(v.body).toMatch(/Arnold Summit fell to 58%( overnight| by)/);
  // …and it leads the legend.
  expect(v.body.indexOf('Arnold Summit')).toBeLessThan(v.body.indexOf('Eagle One</span>'));
});

test('an ordinary night earns no highlight', () => {
  const v = render([[repeater('a', 'SIERRA Eagle One'), series('a', (h) => 95 - (h % 10))]]);
  expect(10).toBeLessThan(DROP_HIGHLIGHT_POINTS);
  expect(v.body).not.toContain('mesh-chart__line--drop');
  expect(v.body).not.toContain('fell to');
});

test('a reading below 50% extends the axis instead of being clipped', () => {
  const v = render([
    [repeater('a', 'SIERRA Hathaway Pines'), series('a', (h) => (h < 12 ? 90 : 18))],
  ]);
  // The floor drops to the next 25-point step below the lowest reading.
  expect(v.body).toContain('>0%<');
  expect(render([[repeater('a', 'SIERRA A'), series('a', calm)]]).body).not.toContain('>25%<');
});

test('every trace is one hue — no categorical palette survives', () => {
  const v = render([
    [repeater('a', 'SIERRA A'), series('a', calm)],
    [repeater('b', 'SIERRA B'), series('b', deep)],
  ]);
  expect(v.body).not.toContain('--series-');
});

test('temperature never singles out a "drop" — a cold night is the weather, not the site', () => {
  const v = render([[repeater('b', 'SIERRA Arnold Summit'), series('b', deep)]], 'enclosure');
  // The trace IS drawn — the same 34-degree fall — it just is not called out.
  expect(v.body).toContain('mesh-chart__line');
  expect(v.body).not.toContain('mesh-chart__line--drop');
});

test('no monitored repeater says so plainly, rather than drawing empty axes', () => {
  const v = renderMeshHistory(
    [repeater('a', 'SIERRA A')],
    new Map(),
    { metric: 'battery', pinned: null },
    NOW
  );
  expect(v.intro).toContain('0 repeaters');
  expect(v.body).toContain('No repeater in the corridor is reporting monitor telemetry');
});
