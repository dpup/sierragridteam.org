/**
 * The /mesh panel's rendered regions. These assert the things a reader would be MISLED by,
 * not the markup: that the sparkline covers a fixed span, that "no monitor" never renders as
 * a value, and that a broken feed never renders as calm.
 */
import { test, expect } from 'bun:test';
import { buildMeshView, SPARK_WINDOW_HOURS } from './mesh-view';
import { buildRegionGraph, type MeshFeature, type MeshFeatureCollection } from './mesh';
import { buildSeries, type TelemetrySeries } from './mesh-telemetry';

const NOW = Date.parse('2026-09-17T12:00:00Z');
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString();

const node = (key: string, name: string, admin?: Record<string, unknown>): MeshFeature => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [-120.3, 38.2] },
  properties: {
    id: `meshcore:${key}`,
    layer: 'MESH_NODE',
    status: 'ACTIVE',
    mesh: { publicKey: key, nodeType: 'repeater', name, ...(admin ? { admin } : {}) },
  },
});
/** A link, so a node counts as HEARD — without one it is legitimately "never heard". */
const link = (a: string, b: string, lastSeen: string): MeshFeature => ({
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: [
      [-120.4, 38.2],
      [-120.3, 38.3],
    ],
  },
  properties: {
    id: `mesh_link:${a}:${b}`,
    layer: 'MESH_LINK',
    headline: `${a} ↔ ${b}`,
    meshLink: { a, b, observations: 100, daysActive: 3, firstSeen: ago(72), lastSeen },
  },
});

const fc = (features: MeshFeature[], sourceStatus = 'OK'): MeshFeatureCollection => ({
  type: 'FeatureCollection',
  features,
  metadata: { layer: 'mesh_node', area: 'ebbetts-pass', generatedAt: ago(0), sourceStatus },
});

/** A series whose samples run every 15 minutes across `hours`, ending `endedHoursAgo`. */
const seriesOver = (key: string, hours: number, endedHoursAgo = 0): TelemetrySeries =>
  buildSeries(key, {
    cadenceSeconds: '900',
    coverage: { from: ago(hours + endedHoursAgo), to: ago(endedHoursAgo), samples: '1' },
    samples: Array.from({ length: hours * 4 }, (_, i) => ({
      reading: {
        reportedAt: new Date(NOW - (endedHoursAgo + hours) * 3_600_000 + i * 900_000).toISOString(),
        batteryPercent: 80 + (i % 5),
      },
    })),
  });

const render = (series: Map<string, TelemetrySeries>) =>
  buildMeshView(
    buildRegionGraph(fc([node('aaa', 'SIERRA Arnold Summit', { batteryPercent: 82 })]), null),
    '30d',
    NOW,
    { series }
  ).html.roster;

test('the sparkline covers a FIXED window, not whatever the chart below is set to', () => {
  // It used to draw every point in the fetched series, so switching the history chart to
  // Month silently changed every row's span with nothing in the row to say so.
  const wide = render(new Map([['aaa', seriesOver('aaa', 24 * 30)]]));
  const narrow = render(new Map([['aaa', seriesOver('aaa', SPARK_WINDOW_HOURS)]]));
  const path = (html: string) => html.match(/class="mesh-spark"[\s\S]*?d="([^"]+)"/)?.[1] ?? '';
  expect(path(wide)).not.toBe('');
  // A month of samples and six hours of samples produce the same number of drawn points,
  // because both are cut to the same window.
  expect(path(wide).split('L')).toHaveLength(path(narrow).split('L').length);
});

test('a series that stops before the window renders no sparkline at all', () => {
  // Every sample older than the window: there is no recent trend, so drawing one would
  // invent a shape out of stale readings.
  const stale = render(new Map([['aaa', seriesOver('aaa', 24, SPARK_WINDOW_HOURS + 2)]]));
  expect(stale).not.toContain('mesh-spark');
  // …and the battery bar is still there, because the LATEST reading is a separate fact.
  expect(stale).toContain('82%');
});

test('the sparkline is on an absolute scale, so calm never looks like collapse', () => {
  // The failure this replaced: each row scaled to its OWN min/max, so a repeater oscillating
  // 90-100% drew a full-height zigzag while one sliding 90->60% drew a gentle slope. The
  // healthy node looked like the emergency.
  const flat = buildSeries('aaa', {
    cadenceSeconds: '900',
    samples: Array.from({ length: 20 }, (_, i) => ({
      reading: {
        reportedAt: new Date(NOW - (20 - i) * 900_000).toISOString(),
        batteryPercent: i % 2 ? 100 : 90,
      },
    })),
  });
  const falling = buildSeries('aaa', {
    cadenceSeconds: '900',
    samples: Array.from({ length: 20 }, (_, i) => ({
      reading: {
        reportedAt: new Date(NOW - (20 - i) * 900_000).toISOString(),
        batteryPercent: 90 - i * 1.5,
      },
    })),
  });
  const ys = (html: string) =>
    [
      ...(html.match(/class="mesh-spark"[\s\S]*?d="([^"]+)"/)?.[1] ?? '').matchAll(/,(-?[\d.]+)/g),
    ].map((m) => Number(m[1]));
  const extent = (html: string) => {
    const v = ys(html);
    return Math.max(...v) - Math.min(...v);
  };
  const flatExtent = extent(render(new Map([['aaa', flat]])));
  const fallExtent = extent(render(new Map([['aaa', falling]])));

  // A 10-point wobble must occupy a small slice of the height…
  expect(flatExtent).toBeLessThan(3);
  // …and a 30-point slide must be clearly bigger. Under auto-scaling both filled the box.
  expect(fallExtent).toBeGreaterThan(flatExtent * 2);
});

test('a repeater with no monitor renders the label, never a bar or a zero', () => {
  const html = buildMeshView(
    buildRegionGraph(fc([node('bbb', 'SIERRA Lilac Park')]), null),
    '30d',
    NOW,
    {}
  ).html.roster;
  expect(html).toContain('Limited Telemetry');
  expect(html).not.toContain('mesh-health__bar');
  expect(html).not.toContain('0%');
});

test('an unavailable feed renders neither figures nor an attention strip', () => {
  const view = buildMeshView(buildRegionGraph(fc([], 'UNAVAILABLE'), null), '30d', NOW, {});
  // "Unknown", never a confident zero…
  expect(view.html.band).toContain('Unknown');
  expect(view.html.band).not.toMatch(/>0</);
  // …and no "everything is fine" strip, because we do not know that.
  expect(view.html.attention).toBe('');
});

test('the attention strip renders nothing when nothing is outside limits', () => {
  // No empty strip and no "all clear" line: a standing bar that is almost always reassuring
  // trains a reader to skip the one place warnings appear.
  const calm = buildMeshView(
    buildRegionGraph(
      fc([node('aaa', 'SIERRA A', { batteryPercent: 95 })]),
      fc([link('aaa', 'zzz', ago(0.2))])
    ),
    '30d',
    NOW,
    {}
  );
  expect(calm.html.attention).toBe('');

  // …and it DOES appear the moment something is: a repeater under the watch floor.
  const low = buildMeshView(
    buildRegionGraph(
      fc([node('aaa', 'SIERRA A', { batteryPercent: 14 })]),
      fc([link('aaa', 'zzz', ago(0.2))])
    ),
    '30d',
    NOW,
    {}
  );
  expect(low.html.attention).toContain('Needs attention');
  expect(low.html.attention).toContain('battery 14%');
});
