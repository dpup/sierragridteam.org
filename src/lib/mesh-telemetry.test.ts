/**
 * The monitor archive's five honesty rules, one test each. Every one of these is a specific
 * FALSE STATEMENT a naive chart makes, and none of them is visible to the author — a flat
 * line through a monitor outage looks exactly like a healthy battery.
 */
import { test, expect } from 'bun:test';
import {
  buildSeries,
  decimate,
  earliestCoverage,
  latestValue,
  rangeWindow,
  splitRuns,
  valueExtent,
  type TelemetryResponse,
} from './mesh-telemetry';

const T0 = Date.parse('2026-09-16T00:00:00Z');
const at = (min: number) => new Date(T0 + min * 60_000).toISOString();

/** A wire response, with int64s as STRINGS and the reading NESTED, exactly as it arrives. */
const res = (over: Partial<TelemetryResponse> = {}): TelemetryResponse => ({
  coverage: { from: at(0), to: at(60), samples: '5' },
  cadenceSeconds: '900',
  reboots: [],
  truncated: false,
  samples: [
    { reading: { reportedAt: at(0), batteryPercent: 80, temperatureC: 20, batteryVolts: '4.0' } },
    { reading: { reportedAt: at(15), batteryPercent: 78, temperatureC: 21 } },
    { reading: { reportedAt: at(30), batteryPercent: 76, temperatureC: 22 } },
  ],
  ...over,
});

test('the reading is nested and its int64s are strings — both are absorbed', () => {
  const s = buildSeries('aaa', res());
  expect(s.points).toHaveLength(3);
  expect(s.points[0]).toMatchObject({ battery: 80, volts: 4, tempF: 68 });
  expect(s.cadenceSeconds).toBe(900);
  expect(s.coverage.samples).toBe(5);
});

test('rule 1 — a null gauge is skipped, never read as zero', () => {
  const s = buildSeries(
    'aaa',
    res({
      samples: [
        { reading: { reportedAt: at(0), batteryPercent: 80 } },
        { reading: { reportedAt: at(15), batteryPercent: null } },
        { reading: { reportedAt: at(30), batteryPercent: 76 } },
      ],
    })
  );
  expect(s.points[1].battery).toBeNull();
  // A battery at 0% and a battery nobody could read must never look alike, so the extent
  // never reaches down to zero because of an unread gauge.
  expect(valueExtent([s], 'battery', T0, T0 + 3_600_000)).toEqual({ min: 76, max: 80 });
  // …and the path breaks there rather than drawing through a reading nobody took.
  expect(splitRuns(s, 'battery', T0, T0 + 3_600_000)).toHaveLength(2);
});

test('rule 2 — a monitor outage breaks the line instead of flattening it', () => {
  const s = buildSeries(
    'aaa',
    res({
      cadenceSeconds: '900',
      samples: [
        { reading: { reportedAt: at(0), batteryPercent: 80 } },
        { reading: { reportedAt: at(15), batteryPercent: 78 } },
        // 90 minutes of silence — six times the cadence.
        { reading: { reportedAt: at(105), batteryPercent: 60 } },
        { reading: { reportedAt: at(120), batteryPercent: 58 } },
      ],
    })
  );
  const runs = splitRuns(s, 'battery', T0, T0 + 8 * 3_600_000);
  expect(runs).toHaveLength(2);
  expect(runs[0].map((p) => p.v)).toEqual([80, 78]);
  expect(runs[1].map((p) => p.v)).toEqual([60, 58]);
});

test('rule 2 — a normal step does NOT break the line', () => {
  const runs = splitRuns(buildSeries('aaa', res()), 'battery', T0, T0 + 3_600_000);
  expect(runs).toHaveLength(1);
  expect(runs[0]).toHaveLength(3);
});

test('rule 3 — coverage is carried through so the view can say where the record starts', () => {
  const s = buildSeries('aaa', res());
  expect(s.coverage.from).toBe(T0);
  expect(earliestCoverage([s])).toBe(T0);
  // An empty window is not a quiet node: with nothing retained we report null rather than
  // letting the chart draw empty axes over it.
  expect(earliestCoverage([buildSeries('bbb', { samples: [] })])).toBeNull();
});

test('rule 4 — a reboot splits the series, because counters restart there', () => {
  const s = buildSeries(
    'aaa',
    res({
      reboots: [at(20)],
      samples: [
        { reading: { reportedAt: at(0), batteryPercent: 80 } },
        { reading: { reportedAt: at(15), batteryPercent: 78 } },
        { reading: { reportedAt: at(30), batteryPercent: 77 } },
      ],
    })
  );
  expect(s.reboots).toEqual([T0 + 20 * 60_000]);
  // The samples are 15 minutes apart — well inside cadence — so only the reboot splits them.
  expect(splitRuns(s, 'battery', T0, T0 + 3_600_000)).toHaveLength(2);
});

test('rule 5 — truncation is our limit, and is carried so the view can say so', () => {
  expect(buildSeries('aaa', res({ truncated: true })).truncated).toBe(true);
  expect(buildSeries('aaa', res()).truncated).toBe(false);
});

test('a malformed or missing response degrades to an empty series, never to zeros', () => {
  for (const bad of [null, {}, { samples: [{ reading: { reportedAt: 'not-a-date' } }] }]) {
    const s = buildSeries('aaa', bad as TelemetryResponse | null);
    expect(s.points).toEqual([]);
    expect(latestValue(s, 'battery')).toBeNull();
    expect(valueExtent([s], 'battery', T0, T0 + 3_600_000)).toBeNull();
  }
});

test('ranges are rolling windows ending now, never calendar frames', () => {
  const now = Date.parse('2026-09-16T04:00:00Z');
  const day = rangeWindow('day', now);
  // The mockup this replaced framed by calendar: its "Day" defaulted to a UTC day that had
  // not started yet, so the page opened on "no data" at one minute past midnight.
  expect(day.to).toBe(now);
  expect(day.from).toBe(now - 86_400_000);
  expect(rangeWindow('week', now).from).toBe(now - 7 * 86_400_000);
  expect(rangeWindow('month', now).from).toBe(now - 30 * 86_400_000);
});

test('decimation keeps the ends and the extremes, so a dip is never smoothed away', () => {
  const run = Array.from({ length: 500 }, (_, i) => ({ t: T0 + i * 60_000, v: 50 }));
  run[321].v = 3; // the one moment worth seeing
  run[77].v = 99;
  const thinned = decimate(run, 40);
  expect(thinned.length).toBeLessThanOrEqual(44);
  expect(thinned[0]).toEqual(run[0]);
  expect(thinned[thinned.length - 1]).toEqual(run[499]);
  expect(thinned.map((p) => p.v)).toContain(3);
  expect(thinned.map((p) => p.v)).toContain(99);
});

test('enclosure temperature is converted to °F, because the audience is imperial', () => {
  const s = buildSeries('aaa', res());
  expect(latestValue(s, 'enclosure')).toBe(72); // 22 °C
});
