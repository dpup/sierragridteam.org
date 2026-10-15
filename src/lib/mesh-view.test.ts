/**
 * The /mesh report's rendered regions. These assert the things a reader would be MISLED by,
 * not the markup: that the headline counts honestly, that a repeater we stopped hearing is
 * named, that "no monitor" never renders as a value, and that a broken feed never reads calm.
 */
import { test, expect } from 'bun:test';
import { batteryFloor, buildMeshView, listNames } from './mesh-view';
import {
  buildRegionGraph,
  HEARD_WITHIN_HOURS,
  type MeshFeature,
  type MeshFeatureCollection,
} from './mesh';
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

const view = (nodes: MeshFeature[], links: MeshFeature[] = [], status = 'OK') =>
  buildMeshView(buildRegionGraph(fc(nodes, status), fc(links, status)), '30d', NOW, {}).html;

// ---- header ----

test('the headline counts repeaters heard, in numerals, on two lines', () => {
  const h = view(
    [node('aaa', 'SIERRA A'), node('bbb', 'SIERRA B'), node('ccc', 'SIERRA C')],
    [link('aaa', 'zzz', ago(0.2)), link('bbb', 'zzz', ago(2))]
  ).headline;
  expect(h).toContain('2 of 3 repeaters');
  expect(h).toContain(`heard in the last ${HEARD_WITHIN_HOURS} hours.`);
  // Data is numerals (content-style-guide §5) — never "Two of three".
  expect(h).not.toMatch(/Two|three/);
});

test('every repeater heard reads "All N", and a broken feed reads unknown, never all-clear', () => {
  expect(view([node('aaa', 'SIERRA A')], [link('aaa', 'zzz', ago(0.2))]).headline).toContain(
    'The 1 repeater'
  );
  const two = view(
    [node('aaa', 'SIERRA A'), node('bbb', 'SIERRA B')],
    [link('aaa', 'bbb', ago(0.2))]
  ).headline;
  expect(two).toContain('All 2 repeaters');
  const down = view([], [], 'UNAVAILABLE');
  expect(down.headline).toContain('unknown');
  expect(down.headline).not.toContain('All');
});

test('the lede names the repeaters we have stopped hearing, in the alert colour', () => {
  const html = view(
    [
      node('aaa', 'SIERRA Arnold'),
      node('bbb', 'SIERRA Pinebrook Rptr'),
      node('ccc', 'SIERRA Pinebrook Tree'),
    ],
    [
      link('aaa', 'zzz', ago(0.1)),
      link('bbb', 'zzz', ago(HEARD_WITHIN_HOURS + 22)),
      link('ccc', 'zzz', ago(HEARD_WITHIN_HOURS + 1)),
    ]
  ).lede;
  expect(html).toContain('Last reception');
  expect(html).toContain(
    '<span class="mesh-lede__stale">Pinebrook Rptr and Pinebrook Tree</span> have not been heard'
  );
  // "not heard" is the claim — never "down" or "offline".
  expect(html).not.toMatch(/down|offline/);
});

test('a calm corridor says nothing beyond freshness', () => {
  const html = view([node('aaa', 'SIERRA A')], [link('aaa', 'zzz', ago(0.1))]).lede;
  expect(html).not.toContain('mesh-lede__stale');
});

test('names are listed with an Oxford comma', () => {
  expect(listNames(['A'])).toBe('A');
  expect(listNames(['A', 'B'])).toBe('A and B');
  expect(listNames(['A', 'B', 'C'])).toBe('A, B, and C');
});

test('an unavailable feed renders Unknown figures, never a confident zero', () => {
  const html = view([], [], 'UNAVAILABLE');
  expect(html.stats).toContain('Unknown');
  expect(html.stats).not.toMatch(/>0</);
  expect(html.legend).toContain('Unknown');
});

// ---- legend ----

test('the dashed orange entry appears only when the map actually draws a stale link', () => {
  const calm = view([node('aaa', 'SIERRA A')], [link('aaa', 'zzz', ago(0.1))]).legend;
  expect(calm).not.toContain('mesh-legend__line--stale');
  const stale = view([node('aaa', 'SIERRA A')], [link('aaa', 'zzz', ago(30))]).legend;
  expect(stale).toContain('mesh-legend__line--stale');
});

// ---- table ----

test('a repeater with no monitor reads "No telemetry", never a bar or a zero', () => {
  const html = view([node('bbb', 'SIERRA Lilac Park')]).roster;
  expect(html).toContain('No telemetry');
  expect(html).not.toContain('mesh-batt__bar');
  expect(html).not.toContain('0%');
});

test('the battery figure turns brass under the watch floor and orange under the risk line', () => {
  const at = (pct: number) =>
    view([node('aaa', 'SIERRA A', { batteryPercent: pct })], [link('aaa', 'zzz', ago(0.1))]).roster;
  expect(at(80)).not.toMatch(/mesh-batt--(watch|low)/);
  expect(at(15)).toContain('mesh-batt--watch');
  expect(at(6)).toContain('mesh-batt--low');
});

test('a stale row is marked, so its "last heard" can take the alert colour', () => {
  const html = view([node('aaa', 'SIERRA A')], [link('aaa', 'zzz', ago(30))]).roster;
  expect(html).toContain('mesh-row--stale');
  expect(html).toContain('30 h ago');
});

test('the battery axis starts at 50% and extends a 25-point step only when needed', () => {
  expect(batteryFloor(null)).toBe(50);
  expect(batteryFloor(79)).toBe(50);
  expect(batteryFloor(50)).toBe(50);
  // A night into the teens must be drawn, not clipped at the floor.
  expect(batteryFloor(48)).toBe(25);
  expect(batteryFloor(14)).toBe(0);
});

test('a series that stops before the window renders no sparkline at all', () => {
  // Every sample older than the day: there is no recent trend, so drawing one would invent a
  // shape out of stale readings. The battery figure is still there — the latest reading is a
  // separate fact.
  const stale = render(new Map([['aaa', seriesOver('aaa', 6, 26)]]));
  expect(stale).not.toContain('mesh-spark');
  expect(stale).toContain('82%');
  expect(render(new Map([['aaa', seriesOver('aaa', 6)]]))).toContain('mesh-spark');
});
