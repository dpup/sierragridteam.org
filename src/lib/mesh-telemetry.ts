/**
 * mesh-telemetry.ts — The Grid's per-repeater monitor ARCHIVE: types + pure derivations for
 * the /mesh history chart and the roster sparklines. No DOM, no fetch (that is
 * `mesh-client.ts`), no MapLibre.
 *
 *   GET /mesh/telemetry?node=<pubkey>&from=<rfc3339>&to=<rfc3339>
 *
 * One node per call — a cross-node dump is a different product — so the page fans out over
 * the monitored repeaters and joins the results here.
 *
 * ⚠️ FIVE THINGS THE CHART MUST NOT CLAIM. Each is a specific false statement a naive
 * rendering makes, and each has a guard below:
 *
 *   1. `null` is not zero. A gauge the monitor could not read comes back `null`; a battery
 *      at 0% and a battery nobody could read must never look alike. → the point is SKIPPED,
 *      never coerced (`num()` refuses null, '' and non-numeric strings).
 *   2. A gap is not a flat line. Drawing straight through a silence asserts readings nobody
 *      took. → `splitRuns` breaks the path when the step exceeds twice the observed cadence.
 *   3. Outside `coverage` is not a quiet node. An empty window can mean the node said
 *      nothing, or that the window predates anything The Grid holds. → `coverage` is carried
 *      through and the view renders "no data retained before …" rather than empty axes.
 *   4. A reboot is not a collapse. Every counter is lifetime-since-boot, so a restart sends
 *      packet totals to zero and a line drawn across one plunges and climbs. → `reboots` is
 *      carried through and marked. (Battery is a gauge and survives a reboot, but the mark
 *      still belongs on it: a reader comparing it with a counter needs the same landmark.)
 *   5. `truncated` is us, not the node. It means the window held more samples than one
 *      response carries; a chart that just ends looks like a node that stopped reporting.
 *      → carried through and stated.
 *
 * ⚠️ Every int64 arrives as a JSON STRING (protobuf's JSON mapping), and the reading is
 * NESTED at `samples[i].reading`. Both are absorbed here so no caller has to remember.
 */
import { cToF } from './units';

/** One archived reading, as the wire carries it. Only the fields the site plots are typed. */
export interface TelemetrySampleWire {
  reading?: {
    reportedAt?: string;
    batteryPercent?: number | string | null;
    batteryPercentSource?: string;
    batteryVolts?: number | string | null;
    temperatureC?: number | string | null;
  };
  /** When The Grid first held it. Useful for debugging a lagging monitor, WRONG for an axis. */
  receivedAt?: string;
}

export interface TelemetryResponse {
  node?: string;
  from?: string;
  to?: string;
  coverage?: { from?: string | null; to?: string | null; samples?: number | string | null };
  /** Observed median gap between samples, seconds. A STRING, and null under 2 samples. */
  cadenceSeconds?: number | string | null;
  reboots?: string[];
  truncated?: boolean;
  samples?: TelemetrySampleWire[];
}

/** A finite number from the wire, accepting the string form. Never coerces null to 0. */
const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

/** One plotted reading. `t` is epoch ms from the MONITOR's stamp, never our receive time. */
export interface TelemetryPoint {
  t: number;
  /** Charge, 0–100. Null where the gauge was unreadable — the point is dropped per metric. */
  battery: number | null;
  volts: number | null;
  /** Enclosure temperature in °F. The box in the sun, not the weather. */
  tempF: number | null;
}

export interface TelemetrySeries {
  publicKey: string;
  points: TelemetryPoint[];
  /** Observed median gap, seconds — what "abnormal" is measured against. */
  cadenceSeconds: number | null;
  /** What the ARCHIVE holds, ignoring the requested window. */
  coverage: { from: number | null; to: number | null; samples: number };
  /** Counter restarts, epoch ms. */
  reboots: number[];
  truncated: boolean;
}

/** The two things the chart can plot. Battery is the one an operator checks before driving. */
export const HISTORY_METRICS = ['battery', 'enclosure'] as const;
export type HistoryMetric = (typeof HISTORY_METRICS)[number];
export const HISTORY_METRIC_LABELS: Record<HistoryMetric, string> = {
  battery: 'Battery charge',
  enclosure: 'Enclosure temperature',
};
export const HISTORY_METRIC_UNITS: Record<HistoryMetric, string> = {
  battery: '%',
  enclosure: ' °F',
};

/** Pull the plotted value for a metric, or null if this sample cannot answer. */
export const metricValue = (p: TelemetryPoint, metric: HistoryMetric): number | null =>
  metric === 'battery' ? p.battery : p.tempF;

/** Parse one node's archive response. Unparseable samples are dropped, never guessed at. */
export function buildSeries(publicKey: string, res: TelemetryResponse | null): TelemetrySeries {
  const points: TelemetryPoint[] = [];
  for (const s of res?.samples ?? []) {
    const r = s.reading;
    const t = Date.parse(r?.reportedAt ?? '');
    if (!Number.isFinite(t)) continue;
    const tempC = num(r?.temperatureC);
    points.push({
      t,
      battery: num(r?.batteryPercent),
      volts: num(r?.batteryVolts),
      tempF: tempC == null ? null : cToF(tempC),
    });
  }
  points.sort((a, b) => a.t - b.t);
  const cov = res?.coverage;
  const covFrom = Date.parse(cov?.from ?? '');
  const covTo = Date.parse(cov?.to ?? '');
  return {
    publicKey,
    points,
    cadenceSeconds: num(res?.cadenceSeconds),
    coverage: {
      from: Number.isFinite(covFrom) ? covFrom : null,
      to: Number.isFinite(covTo) ? covTo : null,
      samples: num(cov?.samples) ?? points.length,
    },
    reboots: (res?.reboots ?? [])
      .map((r) => Date.parse(r))
      .filter((t) => Number.isFinite(t))
      .sort((a, b) => a - b),
    truncated: res?.truncated === true,
  };
}

/** Fallback cadence when the archive holds too few samples to observe one (15 min). */
const DEFAULT_CADENCE_S = 900;

/**
 * Split a series into continuously-drawable runs for one metric.
 *
 * Two things break a run, and both are claims we would otherwise make silently:
 *   • a step longer than 2x the observed cadence — the monitor was quiet, and a straight
 *     line across it asserts readings nobody took;
 *   • a reboot — counters restart there, and even on a gauge the landmark belongs on every
 *     chart on the page so two of them can be read against each other.
 * Samples whose value for THIS metric is null are skipped, which itself opens a gap.
 */
export function splitRuns(
  series: TelemetrySeries,
  metric: HistoryMetric,
  from: number,
  to: number
): { t: number; v: number }[][] {
  const cadence = (series.cadenceSeconds ?? DEFAULT_CADENCE_S) * 1000;
  const maxStep = Math.max(cadence * 2, 60_000);
  const runs: { t: number; v: number }[][] = [];
  let run: { t: number; v: number }[] = [];
  let prev: number | null = null;
  for (const p of series.points) {
    if (p.t < from || p.t > to) continue;
    const v = metricValue(p, metric);
    if (v == null) {
      prev = null;
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    const rebooted = prev != null && series.reboots.some((r) => r > prev! && r <= p.t);
    if (prev != null && (p.t - prev > maxStep || rebooted)) {
      if (run.length) runs.push(run);
      run = [];
    }
    run.push({ t: p.t, v });
    prev = p.t;
  }
  if (run.length) runs.push(run);
  return runs;
}

/**
 * The reading nearest a moment, for the chart's hover hint. Returns null when the closest
 * sample is further away than `toleranceMs` — hovering a stretch the monitor was silent for
 * must say nothing, not reach across the gap for a value it never took (rule 2).
 */
export function valueAt(
  series: TelemetrySeries,
  metric: HistoryMetric,
  t: number,
  toleranceMs: number
): { t: number; v: number } | null {
  let best: { t: number; v: number } | null = null;
  let bestGap = Infinity;
  for (const p of series.points) {
    const v = metricValue(p, metric);
    if (v == null) continue;
    const gap = Math.abs(p.t - t);
    if (gap < bestGap) {
      bestGap = gap;
      best = { t: p.t, v };
    }
  }
  return best && bestGap <= toleranceMs ? best : null;
}

/** The most recent readable value for a metric — what the legend shows beside a name. */
export function latestValue(series: TelemetrySeries, metric: HistoryMetric): number | null {
  for (let i = series.points.length - 1; i >= 0; i--) {
    const v = metricValue(series.points[i], metric);
    if (v != null) return v;
  }
  return null;
}

/** The plotted extent across every series, or null when nothing is plottable. */
export function valueExtent(
  list: TelemetrySeries[],
  metric: HistoryMetric,
  from: number,
  to: number
): { min: number; max: number } | null {
  let min = Infinity;
  let max = -Infinity;
  for (const s of list) {
    for (const p of s.points) {
      if (p.t < from || p.t > to) continue;
      const v = metricValue(p, metric);
      if (v == null) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  return Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
}

/** The earliest moment ANY monitor has data for — where "no data retained before" begins. */
export function earliestCoverage(list: TelemetrySeries[]): number | null {
  let min = Infinity;
  for (const s of list) if (s.coverage.from != null && s.coverage.from < min) min = s.coverage.from;
  return Number.isFinite(min) ? min : null;
}

// ---- History ranges ----

export const HISTORY_RANGES = ['day', 'week', 'month'] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];
export const HISTORY_RANGE_LABELS: Record<HistoryRange, string> = {
  day: 'Day',
  week: 'Week',
  month: 'Month',
};
const RANGE_DAYS: Record<HistoryRange, number> = { day: 1, week: 7, month: 30 };

/**
 * A rolling window ending NOW, not a calendar frame. Calendar framing was the single worst
 * thing about the mockup this replaced: with two days in the archive, its "Week" drew a day
 * and a half of data inside a frame running five days into the FUTURE, and its "Day"
 * defaulted to a UTC day that had not started yet, so the page opened on "no data".
 */
export function rangeWindow(range: HistoryRange, nowMs: number): { from: number; to: number } {
  return { from: nowMs - RANGE_DAYS[range] * 86_400_000, to: nowMs };
}

/**
 * Thin a run to at most `max` points for drawing. A month at 15-minute cadence is ~2,880
 * points per node across seven nodes; past a few hundred the extra points are sub-pixel.
 * Keeps the first and last point so the line still starts and ends where the data does, and
 * keeps the run's extremes so a dip is never smoothed away.
 */
export function decimate(run: { t: number; v: number }[], max: number): { t: number; v: number }[] {
  if (run.length <= max) return run;
  const step = run.length / max;
  const keep = new Set<number>([0, run.length - 1]);
  let lo = 0;
  let hi = 0;
  run.forEach((p, i) => {
    if (p.v < run[lo].v) lo = i;
    if (p.v > run[hi].v) hi = i;
  });
  keep.add(lo);
  keep.add(hi);
  for (let i = 0; i < max; i++) keep.add(Math.floor(i * step));
  return [...keep].sort((a, b) => a - b).map((i) => run[i]);
}
