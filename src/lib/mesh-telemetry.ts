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
 *   2. A gap WAS broken out of the line; as of 2026-09-17 the chart connects straight
 *      through one instead — a deliberate product call, with the trade written out on
 *      `pointsIn`. Rules 1, 3, 4 and 5 all still hold.
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

/**
 * The plottable points for one metric in a window, as ONE connected series.
 *
 * The chart draws straight through a gap rather than breaking the path — an explicit product
 * decision (2026-09-17), reversing the earlier behaviour. The trade is worth stating: a
 * connected line across a monitor outage implies readings that were never taken, and at this
 * page's cadence an outage of a few hours is a visually plausible slope. The reasons for
 * connecting anyway: with seven traces a synchronised outage produced a full-width vertical
 * break that read as a rendering fault rather than as missing data, and the gaps that occur
 * in practice are monitor hiccups of tens of minutes on a battery that moves slowly.
 *
 * What is NOT given up: a null reading is still skipped rather than plotted as zero (rule 1),
 * `coverage` still drives "no data retained before …" so a range predating the archive is
 * never drawn as a quiet network (rule 3), reboots are still MARKED on the plot (rule 4), and
 * `truncated` is still reported (rule 5).
 *
 * If a counter (`packetsSent`, `airtimeMs`, …) is ever plotted here, this has to grow a split
 * at `reboots` again: those reset to zero, so a line drawn across one plunges and climbs and
 * is a graph of arithmetic rather than of the mesh.
 */
export function pointsIn(
  series: TelemetrySeries,
  metric: HistoryMetric,
  from: number,
  to: number
): { t: number; v: number }[] {
  const out: { t: number; v: number }[] = [];
  for (const p of series.points) {
    if (p.t < from || p.t > to) continue;
    const v = metricValue(p, metric);
    if (v == null) continue;
    out.push({ t: p.t, v });
  }
  return out;
}

/**
 * The reading nearest a moment, for the chart's hover hint. Returns null when the closest
 * sample is further away than `toleranceMs` — hovering a stretch the monitor was silent for
 * must say nothing, not reach across the gap for a value it never took.
 *
 * This is now the ONE place the chart still refuses to speak for a gap. The line is drawn
 * through one, but the hint will not put a number on a moment nobody measured.
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

/** The earliest moment ANY monitor has data for — where "no data retained before" begins. */
export function earliestCoverage(list: TelemetrySeries[]): number | null {
  let min = Infinity;
  for (const s of list) if (s.coverage.from != null && s.coverage.from < min) min = s.coverage.from;
  return Number.isFinite(min) ? min : null;
}

// ---- The window ----

/**
 * The chart and the roster sparklines both cover the last day, and nothing else. There was a
 * Day / Week / Month control; the 2026-10 redesign dropped it — a month of seven traces was a
 * texture rather than a reading, and the question the page answers is "how did last night go".
 */
export const HISTORY_HOURS = 24;

/** A rolling window ending NOW, never a calendar day (which may not have started yet in UTC). */
export function historyWindow(nowMs: number): { from: number; to: number } {
  return { from: nowMs - HISTORY_HOURS * 3_600_000, to: nowMs };
}

/**
 * The deepest fall in a run: the largest drop from any reading to a LATER, lower one. Returns
 * the drop and where it bottomed out, or null with fewer than two points. A recovery after
 * the low does not reduce it — a battery that fell 40 points overnight and came back by noon
 * still fell 40 points, and that night is what the highlight is for.
 */
export function largestDrop(run: { t: number; v: number }[]): {
  drop: number;
  low: { t: number; v: number };
} | null {
  if (run.length < 2) return null;
  let peak = run[0].v;
  let best: { drop: number; low: { t: number; v: number } } | null = null;
  for (const p of run) {
    if (p.v > peak) peak = p.v;
    const d = peak - p.v;
    if (d > 0 && (!best || d > best.drop)) best = { drop: d, low: p };
  }
  return best;
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
