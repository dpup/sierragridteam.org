/**
 * mesh-history.ts — the full-width telemetry history band at the foot of /mesh: every
 * monitored repeater's battery (or enclosure temperature) on one chart, plus a legend that
 * doubles as the page's selector.
 *
 * Pure render-to-string, like `mesh-view.ts`, for the same reason: the browser re-renders
 * this region on every refresh, every range change and every selection, and Astro's scoped
 * styles never reach client-injected markup. CSS is global in `src/styles/mesh.css`.
 *
 * WHY A MULTI-SERIES CHART AT ALL. Seven correlated lines braided together is a genuinely
 * bad way to read one repeater's charge, and the roster's per-row bar and sparkline answer
 * that question better. This chart answers the OTHER one: whether a repeater is diverging
 * from its neighbours. Overnight discharge is weather, not a fault — the fault is the one
 * line that does not come back up with the others. That only exists in comparison, so:
 *   • the default view draws every monitored repeater on ONE scale,
 *   • selecting a repeater (here, in the roster, or on the map) isolates its trace and
 *     demotes the rest to context rather than hiding them, so the comparison survives.
 *
 * COLOUR. The series scale is `--series-1..7` in tokens.css, chosen by search against
 * contrast + colour-vision separation and pinned by `mesh-series.test.ts`. Identity is never
 * colour-alone: the legend names every repeater with its current value, and one click
 * isolates it. Slots are assigned by SORTED PUBLIC KEY, not by row order or by value, so a
 * repeater keeps its colour when the sort changes or another node drops out.
 */
import { escapeHtml as esc } from './format';
import { displayName, type MeshNode } from './mesh';
import {
  decimate,
  earliestCoverage,
  latestValue,
  rangeWindow,
  pointsIn,
  valueExtent,
  HISTORY_METRIC_LABELS,
  HISTORY_METRIC_UNITS,
  HISTORY_METRICS,
  HISTORY_RANGE_LABELS,
  HISTORY_RANGES,
  type HistoryMetric,
  type HistoryRange,
  type TelemetrySeries,
} from './mesh-telemetry';
import { mesh as copy } from '../config/content';

/** How many series the scale can carry. An eighth means re-running the palette search. */
export const SERIES_SLOTS = 7;

export interface HistoryOptions {
  metric: HistoryMetric;
  range: HistoryRange;
  /** The page-wide selection. Non-null isolates that trace. */
  selected: string | null;
}

/**
 * Plot geometry, exported so the page can turn a pointer position into a timestamp without
 * re-deriving the layout. Room is left in the viewBox for the outermost axis labels, which
 * sit OUTSIDE the plot band on the page ground.
 */
export const PLOT = { W: 1200, H: 300, PAD: { l: 52, r: 16, t: 14, b: 34 } } as const;
const { W, H, PAD } = PLOT;
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;
/** Past this the extra points are sub-pixel; a month of 15-minute samples is ~2,880. */
const MAX_POINTS = 400;

/**
 * Colour slot for a repeater: stable, derived from the key's position in the SORTED set of
 * monitored keys. Sorting by the opaque public key means the mapping does not follow the
 * roster's current sort or a node's current value ("colour follows the entity, never its
 * rank"). Beyond the scale's slots a series falls back to muted ink rather than being given
 * a generated hue — a fabricated eighth colour is indistinguishable from an existing one
 * under colour-vision deficiency, and the legend would then be lying.
 */
export function seriesSlot(publicKey: string, monitoredKeys: string[]): number | null {
  const i = [...monitoredKeys].sort().indexOf(publicKey);
  return i >= 0 && i < SERIES_SLOTS ? i + 1 : null;
}

const strokeFor = (slot: number | null) =>
  slot == null ? 'var(--ink-muted)' : `var(--series-${slot})`;

const fmt = (v: number, metric: HistoryMetric) =>
  metric === 'battery' ? `${Math.round(v)}%` : `${Math.round(v)} °F`;

const segmented = (
  name: string,
  label: string,
  options: readonly string[],
  labels: Record<string, string>,
  active: string
) =>
  `<div class="mesh-seg" role="group" aria-label="${esc(label)}">` +
  options
    .map(
      (o) =>
        `<button type="button" class="mesh-seg__btn" data-mesh-${esc(name)}="${esc(o)}"` +
        ` aria-pressed="${o === active ? 'true' : 'false'}">${esc(labels[o])}</button>`
    )
    .join('') +
  `</div>`;

/** PT, because every time on this site is Pacific. Axis ticks only, so no seconds. */
function axisLabel(ms: number, range: HistoryRange): string {
  const d = new Date(ms);
  const opts: Intl.DateTimeFormatOptions =
    range === 'day'
      ? { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Los_Angeles' }
      : { month: 'short', day: 'numeric', timeZone: 'America/Los_Angeles' };
  return new Intl.DateTimeFormat('en-US', opts).format(d);
}

function renderPlot(
  list: { node: MeshNode; series: TelemetrySeries; slot: number | null }[],
  o: HistoryOptions,
  from: number,
  to: number
): string {
  const extent = valueExtent(
    list.map((x) => x.series),
    o.metric,
    from,
    to
  );
  if (!extent) return '';
  // Battery is a 0–100 gauge and is always drawn on its full scale: rescaling to the data
  // would make a calm night of 88–94% look like a cliff. Temperature has no natural bounds,
  // so it takes a padded data range.
  const [lo, hi] =
    o.metric === 'battery'
      ? [0, 100]
      : [Math.floor((extent.min - 4) / 5) * 5, Math.ceil((extent.max + 4) / 5) * 5];
  const span = Math.max(1, hi - lo);
  const x = (t: number) => PAD.l + ((t - from) / Math.max(1, to - from)) * PW;
  const y = (v: number) => PAD.t + (1 - (v - lo) / span) * PH;

  const ticksY = [0, 0.25, 0.5, 0.75, 1].map((f) => lo + f * span);
  const grid =
    ticksY
      .map(
        (v) =>
          `<line class="mesh-chart__grid" x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>` +
          `<text class="mesh-chart__axis" x="${PAD.l - 8}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end">${esc(fmt(v, o.metric))}</text>`
      )
      .join('') +
    [0, 0.25, 0.5, 0.75, 1]
      .map((f) => {
        const t = from + f * (to - from);
        const anchor = f === 0 ? 'start' : f === 1 ? 'end' : 'middle';
        return `<text class="mesh-chart__axis" x="${x(t).toFixed(1)}" y="${H - 10}" text-anchor="${anchor}">${esc(f === 1 ? 'now' : axisLabel(t, o.range))}</text>`;
      })
      .join('');

  /**
   * One continuous path per repeater. The line is drawn straight through a gap rather than
   * broken at one — see `pointsIn` for the trade that makes.
   */
  const pathFor = (series: TelemetrySeries): string => {
    const run = decimate(pointsIn(series, o.metric, from, to), MAX_POINTS);
    if (run.length < 2) return '';
    return run.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  };

  const paths = list
    .map(({ node, series, slot }) => {
      const dimmed = o.selected != null && o.selected !== node.publicKey;
      const d = pathFor(series);
      if (!d) return '';
      return (
        `<path class="mesh-chart__line${dimmed ? ' mesh-chart__line--dim' : ''}" d="${d}" ` +
        `style="stroke:${strokeFor(slot)}" data-mesh-series="${esc(node.publicKey)}"/>`
      );
    })
    .join('');

  // Reboot marks. Counters restart here; the landmark belongs on the gauge too so a reader
  // comparing the two charts on this page has the same reference on both.
  const reboots = list
    .flatMap(({ series }) => series.reboots)
    .filter((t) => t >= from && t <= to)
    .map(
      (t) =>
        `<line class="mesh-chart__reboot" x1="${x(t).toFixed(1)}" x2="${x(t).toFixed(1)}" y1="${PAD.t}" y2="${PAD.t + PH}"/>`
    )
    .join('');

  // Invisible, fat, stroke-only copies of each line. The visible trace is 2px and almost
  // impossible to hover; these give it a real hit target without thickening what is drawn.
  const hits = list
    .map(({ node, series, slot }) => {
      const d = pathFor(series);
      if (!d) return '';
      return (
        `<path class="mesh-chart__hit" d="${d}" data-mesh-hit="${esc(node.publicKey)}" ` +
        `data-name="${esc(displayName(node.name))}" data-slot="${slot ?? ''}"/>`
      );
    })
    .join('');

  return (
    `<svg class="mesh-chart__svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" ` +
    `role="img" aria-label="${esc(chartSummary(list, o))}" ` +
    `data-from="${from}" data-to="${to}">` +
    // The plot band. It carries the fill rather than the container, so the axis labels stay
    // on the page ground outside it and the band needs no border of its own.
    `<rect class="mesh-chart__band" x="${PAD.l}" y="${PAD.t}" width="${PW}" height="${PH}"/>` +
    `${grid}${reboots}${paths}${hits}` +
    `<line class="mesh-chart__cursor" x1="0" x2="0" y1="${PAD.t}" y2="${PAD.t + PH}" hidden/>` +
    `</svg>`
  );
}

/** The chart's own description, for anyone who cannot see it. Real numbers, not "a chart". */
function chartSummary(
  list: { node: MeshNode; series: TelemetrySeries }[],
  o: HistoryOptions
): string {
  const unit = HISTORY_METRIC_UNITS[o.metric];
  const parts = list
    .map(({ node, series }) => {
      const v = latestValue(series, o.metric);
      return v == null ? null : `${displayName(node.name)} ${Math.round(v)}${unit}`;
    })
    .filter(Boolean);
  return `${HISTORY_METRIC_LABELS[o.metric]} over the last ${o.range}. Latest: ${parts.join(', ') || 'no readings'}.`;
}

/**
 * The legend IS the selector — for THIS CHART ONLY. Every entry names its repeater and shows
 * its current value, so identity never depends on telling two greens apart, and clicking
 * isolates the trace.
 *
 * Deliberately decoupled from the roster/map selection: isolating a trace to read a curve
 * should not scroll the roster and fly the map somewhere, and opening a roster row should not
 * blank six traces out of the comparison this chart exists to make.
 */
function renderLegend(
  list: { node: MeshNode; series: TelemetrySeries; slot: number | null }[],
  o: HistoryOptions
): string {
  return (
    `<ul class="mesh-chart__legend">` +
    list
      .map(({ node, series, slot }) => {
        const v = latestValue(series, o.metric);
        const on = o.selected === node.publicKey;
        return (
          `<li><button type="button" class="mesh-chart__key" data-mesh-node="${esc(node.publicKey)}"` +
          ` aria-pressed="${on ? 'true' : 'false'}">` +
          `<span class="mesh-chart__swatch" style="background:${strokeFor(slot)}" aria-hidden="true"></span>` +
          `<span class="mesh-chart__key-name">${esc(displayName(node.name))}</span>` +
          `<span class="mesh-chart__key-value">${v == null ? '—' : esc(fmt(v, o.metric))}</span>` +
          `</button></li>`
        );
      })
      .join('') +
    `</ul>`
  );
}

/**
 * Render the whole band. `nodes` is the corridor roster and `series` the archive keyed by
 * public key; a repeater with no monitor is simply absent from both, and the band says how
 * many it is drawing rather than implying it covers the corridor.
 */
export function renderMeshHistory(
  nodes: MeshNode[],
  series: Map<string, TelemetrySeries>,
  o: HistoryOptions,
  nowMs: number
): string {
  const monitoredKeys = nodes.filter((n) => series.has(n.publicKey)).map((n) => n.publicKey);
  const list = nodes
    .filter((n) => series.has(n.publicKey))
    .map((n) => ({
      node: n,
      series: series.get(n.publicKey)!,
      slot: seriesSlot(n.publicKey, monitoredKeys),
    }));

  const head =
    `<div class="mesh-chart__head">` +
    `<p class="mesh-chart__title">${esc(HISTORY_METRIC_LABELS[o.metric])} · ${esc(copy.historyLabel)}</p>` +
    segmented(
      'metric',
      'Metric',
      HISTORY_METRICS,
      { battery: 'Battery', enclosure: 'Temp' },
      o.metric
    ) +
    `<p class="mesh-chart__hint">${esc(o.selected ? copy.historyHintSelected : copy.historyHint)}</p>` +
    segmented('range', 'Range', HISTORY_RANGES, HISTORY_RANGE_LABELS, o.range) +
    `</div>`;

  if (!list.length) {
    return (
      `<div class="mesh-chart">` +
      head +
      `<p class="mesh-empty">${esc(copy.historyEmpty)}</p>` +
      `</div>`
    );
  }

  const { from, to } = rangeWindow(o.range, nowMs);
  const plot = renderPlot(list, o, from, to);

  // Honesty, rule 3 of mesh-telemetry.ts: an empty stretch before the archive begins is not
  // a quiet network. Say where the record starts rather than drawing empty axes over it.
  const earliest = earliestCoverage(list.map((x) => x.series));
  const notes: string[] = [];
  if (earliest != null && earliest > from) {
    notes.push(
      `${copy.historyNoDataBefore} ${new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'America/Los_Angeles',
      }).format(earliest)} PT.`
    );
  }
  if (list.some((x) => x.series.truncated)) notes.push(copy.historyTruncated);

  return (
    `<div class="mesh-chart">` +
    head +
    (plot
      ? `<div class="mesh-chart__plot">${plot}` +
        `<p class="mesh-chart__hint-box" data-mesh-hint hidden></p></div>`
      : `<p class="mesh-empty">${esc(copy.historyNoRange)}</p>`) +
    renderLegend(list, o) +
    (notes.length ? `<p class="mesh-chart__note">${esc(notes.join(' '))}</p>` : '') +
    `</div>`
  );
}
