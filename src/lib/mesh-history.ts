/**
 * mesh-history.ts — section 03 of /mesh: every monitored repeater's battery (or enclosure
 * temperature) over the last 24 hours, on one chart.
 *
 * Pure render-to-string, like `mesh-view.ts`, for the same reason: the browser re-renders
 * this region on every refresh and every interaction, and Astro's scoped styles never reach
 * client-injected markup. CSS is global in `src/styles/mesh.css`.
 *
 * WHY A MULTI-SERIES CHART AT ALL. Seven correlated lines braided together is a bad way to
 * read one repeater's charge — the table's bar and sparkline answer that. This chart answers
 * the OTHER question: whether a repeater is diverging from its neighbours. Overnight discharge
 * is weather, not a fault; the fault is the line that does not come back up with the others.
 *
 * ONE HUE. Every trace is the brand green at low opacity (the 2026-10 redesign retired the
 * seven-colour categorical scale). Identity comes from interaction, never from telling two
 * colours apart: hovering a trace or its legend entry lifts it and names it, clicking pins it,
 * and the legend lists every repeater with its current value. One trace is singled out
 * without being asked: the largest fall in the window, in brass, with a one-line note — the
 * night worth looking at.
 *
 * LAYOUT. The SVG is stretched to its box (`preserveAspectRatio="none"`, strokes kept crisp by
 * `vector-effect: non-scaling-stroke`), and every piece of TEXT — axis labels, the note — is
 * HTML positioned over it, so type never stretches with the plot.
 */
import { escapeHtml as esc } from './format';
import { displayName, type MeshNode } from './mesh';
import {
  decimate,
  earliestCoverage,
  historyWindow,
  largestDrop,
  latestValue,
  pointsIn,
  HISTORY_HOURS,
  HISTORY_METRIC_LABELS,
  HISTORY_METRIC_UNITS,
  HISTORY_METRICS,
  type HistoryMetric,
  type TelemetrySeries,
} from './mesh-telemetry';
import { batteryFloor, textTabs } from './mesh-view';
import { mesh as copy } from '../config/content';
import { personByMonitorId } from '../config/people';
import { TIMEZONE } from '../config/site';

export interface HistoryOptions {
  metric: HistoryMetric;
  /** The trace pinned by a click on it or its legend entry. Chart-only state. */
  pinned: string | null;
}

/**
 * Plot geometry in SVG units, exported so the page can turn a pointer position into a moment
 * without re-deriving it. The plot fills its viewBox edge to edge; the axis labels live in
 * HTML outside it.
 */
export const PLOT = { W: 1200, H: 340 } as const;
const { W, H } = PLOT;
/** Past this the extra points are sub-pixel at any width this chart is drawn. */
const MAX_POINTS = 400;
/** A fall smaller than this is an ordinary night and earns no highlight. */
export const DROP_HIGHLIGHT_POINTS = 15;

const fmt = (v: number, metric: HistoryMetric) => `${Math.round(v)}${HISTORY_METRIC_UNITS[metric]}`;

const ptTime = (ms: number, opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour12: false, ...opts }).format(ms);

/** True when a moment falls in the evening-to-morning stretch a battery spends discharging. */
const isOvernight = (ms: number) => {
  const h = Number(ptTime(ms, { hour: '2-digit' }));
  return h >= 18 || h < 9;
};

/** The value axis. Battery: 50–100%, extended down a 25-point step if a reading needs it. */
function axis(metric: HistoryMetric, extent: { min: number; max: number }) {
  if (metric === 'battery') {
    const lo = batteryFloor(extent.min);
    const ticks: number[] = [];
    for (let v = 100; v >= lo; v -= 25) ticks.push(v);
    return { lo, hi: 100, ticks };
  }
  // Temperature has no natural bounds: fit the data, rounded out to 10 °F.
  const lo = Math.floor(extent.min / 10) * 10;
  const hi = Math.max(lo + 10, Math.ceil(extent.max / 10) * 10);
  const step = (hi - lo) / 10 > 4 ? 20 : 10;
  const ticks: number[] = [];
  for (let v = hi; v >= lo; v -= step) ticks.push(v);
  return { lo, hi, ticks };
}

interface Trace {
  node: MeshNode;
  name: string;
  run: { t: number; v: number }[];
  latest: number | null;
  /** Counter restarts in the window, epoch ms (mesh-telemetry.ts rule 4). */
  reboots: number[];
}

/** The deepest fall worth highlighting across the traces, or null on an ordinary night. */
type Drop = { key: string; name: string; low: { t: number; v: number }; drop: number };

function findDrop(traces: Trace[], metric: HistoryMetric): Drop | null {
  // Battery only — a temperature swing is the weather, not the site.
  if (metric !== 'battery') return null;
  let best: Drop | null = null;
  for (const t of traces) {
    const f = largestDrop(t.run);
    if (f && f.drop > DROP_HIGHLIGHT_POINTS && (!best || f.drop > best.drop)) {
      best = { key: t.node.publicKey, name: t.name, ...f };
    }
  }
  return best;
}

function renderPlot(
  traces: Trace[],
  drop: Drop | null,
  o: HistoryOptions,
  from: number,
  to: number
): string {
  const values = traces.flatMap((t) => t.run.map((p) => p.v));
  if (!values.length) return '';
  const extent = { min: Math.min(...values), max: Math.max(...values) };
  const { lo, hi, ticks } = axis(o.metric, extent);
  const span = Math.max(1, hi - lo);
  const x = (t: number) => ((t - from) / Math.max(1, to - from)) * W;
  const y = (v: number) => (1 - (v - lo) / span) * H;
  const pct = (v: number) => `${((1 - (v - lo) / span) * 100).toFixed(2)}%`;
  const d = (run: { t: number; v: number }[]) =>
    run.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');

  const grid = ticks
    .map(
      (v, i) =>
        `<span class="mesh-chart__rule${i === ticks.length - 1 ? ' mesh-chart__rule--base' : ''}" style="top:${pct(v)}"></span>`
    )
    .join('');
  const yLabels = ticks
    .map(
      (v) => `<span class="mesh-chart__ytick" style="top:${pct(v)}">${esc(fmt(v, o.metric))}</span>`
    )
    .join('');

  // The highlighted trace draws last, so it sits on top of the bundle.
  const ordered = [...traces].sort(
    (a, b) => Number(a.node.publicKey === drop?.key) - Number(b.node.publicKey === drop?.key)
  );
  const lineClass = (key: string) =>
    'mesh-chart__line' +
    (key === drop?.key ? ' mesh-chart__line--drop' : '') +
    (o.pinned ? (key === o.pinned ? ' mesh-chart__line--lift' : ' mesh-chart__line--mute') : '');
  const paths = ordered
    .map((t) =>
      t.run.length < 2
        ? ''
        : `<path class="${lineClass(t.node.publicKey)}" d="${d(t.run)}" data-mesh-series="${esc(t.node.publicKey)}"/>`
    )
    .join('');
  // Invisible fat copies of each trace — the visible one is ~1px and nearly impossible to hover.
  const hits = traces
    .map((t) =>
      t.run.length < 2
        ? ''
        : `<path class="mesh-chart__hit" d="${d(t.run)}" data-mesh-hit="${esc(t.node.publicKey)}" data-name="${esc(t.name)}"/>`
    )
    .join('');

  // Reboot marks (mesh-telemetry.ts rule 4): a landmark, not a fault.
  const reboots = [...new Set(traces.flatMap((t) => t.reboots))]
    .filter((t) => t >= from && t <= to)
    .map(
      (t) =>
        `<line class="mesh-chart__reboot" x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="0" y2="${H}"/>`
    )
    .join('');

  let note = '';
  if (drop) {
    // `--at` (0–1 across the plot) also sets how far the note hangs left of the low — see mesh.css.
    const at = x(drop.low.t) / W;
    note =
      `<span class="mesh-chart__note" style="left:${(at * 100).toFixed(2)}%;top:${pct(drop.low.v)};--at:${at.toFixed(3)}">` +
      esc(
        `${drop.name} fell to ${fmt(drop.low.v, o.metric)}` +
          (isOvernight(drop.low.t)
            ? ' overnight'
            : ` by ${ptTime(drop.low.t, { hour: '2-digit', minute: '2-digit' })} PT`)
      ) +
      `</span>`;
  }

  const xLabels = [0, 6, 12, 18]
    .map((h) => from + h * 3_600_000)
    .map((t) => ptTime(t, { hour: '2-digit', minute: '2-digit' }))
    .concat('Now')
    .map((l) => `<span>${esc(l)}</span>`)
    .join('');

  return (
    `<div class="mesh-chart__frame">` +
    `<div class="mesh-chart__yaxis" aria-hidden="true">${yLabels}</div>` +
    `<div class="mesh-chart__plot">${grid}` +
    `<svg class="mesh-chart__svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" ` +
    `role="img" aria-label="${esc(chartSummary(traces, o, drop))}" data-from="${from}" data-to="${to}">` +
    `${reboots}${paths}${hits}` +
    `<line class="mesh-chart__cursor" x1="0" x2="0" y1="0" y2="${H}" hidden/>` +
    `</svg>${note}` +
    `<p class="mesh-chart__hint" data-mesh-hint hidden></p>` +
    `</div>` +
    `<div class="mesh-chart__xaxis" aria-hidden="true">${xLabels}</div>` +
    `</div>`
  );
}

/** The chart's own description, for anyone who cannot see it. Real numbers, not "a chart". */
function chartSummary(traces: Trace[], o: HistoryOptions, drop: Drop | null): string {
  const latest = traces
    .filter((t) => t.latest != null)
    .map((t) => `${t.name} ${fmt(t.latest!, o.metric)}`)
    .join(', ');
  return (
    `${HISTORY_METRIC_LABELS[o.metric]} over the last ${HISTORY_HOURS} hours. ` +
    `Latest: ${latest || 'no readings'}.` +
    (drop ? ` ${drop.name} fell to ${fmt(drop.low.v, o.metric)}.` : '')
  );
}

/**
 * The legend: every traced repeater with its current value, highest first, the highlighted
 * trace leading. Each entry is a button — hovering lifts the trace, clicking pins it.
 */
function renderLegend(traces: Trace[], o: HistoryOptions, dropKey: string | null): string {
  const sorted = [...traces].sort(
    (a, b) =>
      Number(b.node.publicKey === dropKey) - Number(a.node.publicKey === dropKey) ||
      (b.latest ?? -Infinity) - (a.latest ?? -Infinity)
  );
  return (
    `<ul class="mesh-chart__legend">` +
    sorted
      .map((t) => {
        const key = t.node.publicKey;
        return (
          `<li><button type="button" class="mesh-chart__key${key === dropKey ? ' mesh-chart__key--drop' : ''}"` +
          ` data-mesh-key="${esc(key)}" aria-pressed="${o.pinned === key ? 'true' : 'false'}">` +
          `<span class="mesh-chart__swatch" aria-hidden="true"></span>` +
          `<span class="mesh-chart__key-name">${esc(t.name)}</span>` +
          `<span class="mesh-chart__key-value">${t.latest == null ? '—' : esc(fmt(t.latest, o.metric))}</span>` +
          `</button></li>`
        );
      })
      .join('') +
    `</ul>`
  );
}

/** Who runs the monitors, by name where we know them — `alanpi` is a hostname, not a person. */
function monitorCredit(series: TelemetrySeries[], nodes: MeshNode[]): string {
  const ids = new Set<string>();
  for (const n of nodes) {
    if (n.admin?.reporterId && series.some((s) => s.publicKey === n.publicKey)) {
      ids.add(n.admin.reporterId);
    }
  }
  const names = [...ids].map((id) => personByMonitorId(id)?.firstName).filter(Boolean);
  return names.length ? `Site monitors run by ${[...new Set(names)].join(' and ')}.` : '';
}

export interface MeshHistoryView {
  /** The section's one-line intro, under its h2. */
  intro: string;
  tabs: string;
  body: string;
}

/**
 * Render section 03. `nodes` is the corridor roster and `series` the archive keyed by public
 * key; a repeater with no monitor is simply absent, and the intro says how many it draws
 * rather than implying it covers the corridor.
 */
export function renderMeshHistory(
  nodes: MeshNode[],
  series: Map<string, TelemetrySeries>,
  o: HistoryOptions,
  nowMs: number
): MeshHistoryView {
  const { from, to } = historyWindow(nowMs);
  const traced = nodes.filter((n) => series.has(n.publicKey));
  const traces: Trace[] = traced.map((n) => {
    const s = series.get(n.publicKey)!;
    return {
      node: n,
      name: displayName(n.name),
      run: decimate(pointsIn(s, o.metric, from, to), MAX_POINTS),
      latest: latestValue(s, o.metric),
      reboots: s.reboots,
    };
  });

  const tabs = textTabs(
    'metric',
    'Metric',
    HISTORY_METRICS,
    { battery: 'Battery', enclosure: 'Temperature' },
    o.metric
  );
  const n = traced.length;
  const intro = `${copy.historyIntroPrefix} ${n} ${n === 1 ? 'repeater that reports' : 'repeaters that report'} telemetry.`;

  if (!n) return { intro, tabs, body: `<p class="mesh-empty">${esc(copy.historyEmpty)}</p>` };

  const drop = findDrop(traces, o.metric);
  const plot = renderPlot(traces, drop, o, from, to);

  // Honesty, mesh-telemetry.ts rule 3: an empty stretch before the archive begins is not a
  // quiet network. Say where the record starts rather than drawing empty axes over it.
  const list = [...series.values()].filter((s) => traced.some((t) => t.publicKey === s.publicKey));
  const notes: string[] = [];
  const earliest = earliestCoverage(list);
  if (earliest != null && earliest > from) {
    notes.push(
      `${copy.historyNoDataBefore} ${ptTime(earliest, { hour: '2-digit', minute: '2-digit' })} PT.`
    );
  }
  if (list.some((s) => s.truncated)) notes.push(copy.historyTruncated);
  const credit = monitorCredit(list, traced);
  if (credit) notes.push(credit);

  const body =
    `<div class="mesh-chart">` +
    (plot || `<p class="mesh-empty">${esc(copy.historyNoRange)}</p>`) +
    (plot ? renderLegend(traces, o, drop?.key ?? null) : '') +
    (notes.length ? `<p class="mesh-chart__foot">${esc(notes.join(' '))}</p>` : '') +
    `</div>`;
  return { intro, tabs, body };
}
