/**
 * mesh-view.ts — the SINGLE source of truth for /mesh's data regions, rendered as HTML
 * strings so the browser can re-render them in place on each refresh and on each selection.
 * Same pattern (and same reason) as `live-view.ts`: Astro scoped styles don't reach
 * client-injected markup, so the CSS for everything below lives globally in
 * `src/styles/mesh.css`, namespaced under `.mesh-view`. Keep this module PURE — no DOM, no
 * fetch, no MapLibre.
 *
 * The page reads top to bottom as one report (layout "1a", 2026-10):
 *   • HEADER — a headline generated from the data ("9 of 11 repeaters / heard in the last
 *     12 hours."), a line naming any repeater we have stopped hearing, and four figures.
 *   • 01 MAP — its legend is rendered here; the map itself is `mesh-map.ts`.
 *   • 02 REPEATERS — one table row per corridor repeater.
 *   • 03 BATTERY — the history chart, `mesh-history.ts`, because it owns an SVG.
 *
 * Honesty rules this module enforces (docs/content-style-guide.md §3):
 *   • A `null` count renders "Unknown", never "0" or "—" dressed up as calm.
 *   • Recency copy always says what we HEARD, never what is up or down.
 *   • Any span named in copy comes from a constant, never a literal — "in the last 12 hours"
 *     must stay true if HEARD_WITHIN_HOURS changes.
 *   • A repeater with no monitor reads "No telemetry" — a fact about OUR coverage. It is never
 *     a blank cell, a zero, or anything a reader could read as "this one is fine".
 */
import { escapeHtml as esc } from './format';
import {
  agoLabel,
  deriveHeardCount,
  deriveMeshSummary,
  deriveNodeRows,
  deriveRecencyCounts,
  deriveStaleLinkCount,
  deriveStaleRows,
  displayName,
  sortNodeRows,
  HEARD_WITHIN_HOURS,
  MESH_WINDOW_LABELS,
  RECENCY_LABELS,
  RECENCY_TIERS,
  ROSTER_SORTS,
  ROSTER_SORT_LABELS,
  type MeshGraph,
  type MeshNodeHealth,
  type MeshNodeRow,
  type MeshRosterSort,
  type MeshSummary,
  type MeshWindow,
} from './mesh';
import { historyWindow, metricValue, type TelemetrySeries } from './mesh-telemetry';
import { mesh as copy } from '../config/content';

export interface MeshViewOptions {
  /** The selected repeater, shared with the map. */
  selected: string | null;
  sort: MeshRosterSort;
  /** Archived telemetry by public key — empty until the deferred fetch lands. */
  series: Map<string, TelemetrySeries>;
}

export interface MeshView {
  summary: MeshSummary;
  html: {
    /** The h1's two lines (the h1 element itself is in the SSR skeleton). */
    headline: string;
    lede: string;
    stats: string;
    legend: string;
    sortTabs: string;
    roster: string;
  };
}

/** A count that may be honestly unknown. Never renders a fabricated zero. */
const count = (n: number | null): string => (n == null ? 'Unknown' : String(n));

/** "A", "A and B", "A, B, and C" — the style guide's Oxford comma. */
export function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

// ---- Header ----

/**
 * The h1, generated from the data. Two lines on the hero's pattern — the first in muted ink,
 * the second in full — so the sentence reads as one statement with the count leading.
 * Numerals, not spelled-out counts: these are data (content-style-guide §5).
 */
function renderHeadline(graph: MeshGraph, nowMs: number): string {
  const line = (a: string, b: string) =>
    `<span class="page-head__lead">${esc(a)}</span> <span class="page-head__rest">${esc(b)}</span>`;
  const heard = deriveHeardCount(graph, nowMs);
  if (!heard) return line('Mesh status unknown —', 'the feed could not be reached.');
  if (heard.total === 0) return line('No corridor repeaters', 'in the feed right now.');
  const span = `heard in the last ${HEARD_WITHIN_HOURS} hours.`;
  const noun = heard.total === 1 ? 'repeater' : 'repeaters';
  return heard.heard === heard.total
    ? line(heard.total === 1 ? `The 1 ${noun}` : `All ${heard.total} ${noun}`, span)
    : line(`${heard.heard} of ${heard.total} ${noun}`, span);
}

/**
 * Freshness, then — only when there is something to say — the repeaters we have stopped
 * hearing, named in the alert orange. This sentence replaced the "needs attention" strip: the
 * one fault worth acting on is stated where the page is already being read.
 */
function renderLede(graph: MeshGraph, s: MeshSummary, nowMs: number): string {
  if (s.sourceStatus === 'UNAVAILABLE') return esc(copy.statusUnavailableNote);
  const parts: string[] = [];
  if (s.sourceStatus === 'STALE') {
    parts.push('The mesh feed is running behind, so these figures may be out of date.');
  }
  parts.push(
    s.lastHeard
      ? `Last reception ${agoLabel(s.lastHeard, nowMs)}; ${copy.refreshNote}`
      : `No reception in the last ${MESH_WINDOW_LABELS['30d']}; ${copy.refreshNote}`
  );
  let html = parts.map(esc).join(' ');
  const stale = deriveStaleRows(graph, nowMs);
  if (stale.length) {
    const names = listNames(stale.map((r) => displayName(r.node.name)));
    html +=
      ` <span class="mesh-lede__stale">${esc(names)}</span> ` +
      esc(
        `${stale.length === 1 ? 'has' : 'have'} not been heard in over ${HEARD_WITHIN_HOURS} hours.`
      );
  }
  return html;
}

const stat = (label: string, value: string, sub: string, tone?: 'watch' | 'low') =>
  `<div class="mesh-stat">` +
  `<p class="mesh-stat__label">${esc(label)}</p>` +
  `<p class="mesh-stat__value${tone ? ` mesh-stat__value--${tone}` : ''}">${value}</p>` +
  `<p class="mesh-stat__sub">${esc(sub)}</p>` +
  `</div>`;

/** "9 / 11", with the denominator set smaller and muted. */
const ratio = (n: number, of: number) => `${n}<span class="mesh-stat__of"> / ${of}</span>`;

/** The four figures, in the order an operator asks them. */
function renderStats(graph: MeshGraph, s: MeshSummary, window: MeshWindow, nowMs: number): string {
  const unknown = s.sourceStatus === 'UNAVAILABLE';
  const heard = deriveHeardCount(graph, nowMs);
  const battery = s.lowestBattery;
  const batterySub =
    unknown || s.monitored == null || s.monitorable == null
      ? copy.healthUnknownSub
      : battery
        ? battery.name
        : `${s.monitored} of ${s.monitorable} monitored`;
  const batteryTone = battery?.low ? 'low' : battery?.watch ? 'watch' : undefined;

  return (
    stat(
      'Repeaters heard',
      heard ? ratio(heard.heard, heard.total) : 'Unknown',
      `within ${HEARD_WITHIN_HOURS} hours`
    ) +
    stat(
      'Lowest battery',
      unknown || !battery
        ? 'Unknown'
        : `${Math.round(battery.percent)}<span class="mesh-stat__of">%</span>`,
      batterySub,
      batteryTone
    ) +
    stat(
      'Links active this hour',
      s.liveLinks == null || s.regionLinks == null ? 'Unknown' : ratio(s.liveLinks, s.regionLinks),
      `of links seen in ${MESH_WINDOW_LABELS[window]}`
    ) +
    stat('Neighbour nodes', count(s.neighbourNodes), 'heard via the corridor')
  );
}

// ---- Shared chrome ----

/**
 * Text tabs — the sort control and the chart's Battery / Temperature switch. Plain words with
 * an underline on the active one; no boxed segmented buttons. `aria-pressed` carries state.
 */
export function textTabs(
  name: string,
  label: string,
  options: readonly string[],
  labels: Record<string, string>,
  active: string,
  showLabel = false
): string {
  return (
    `<div class="mesh-tabs" role="group" aria-label="${esc(label)}">` +
    (showLabel ? `<span class="mesh-tabs__label" aria-hidden="true">${esc(label)}</span>` : '') +
    options
      .map(
        (o) =>
          `<button type="button" class="mesh-tabs__btn" data-mesh-${esc(name)}="${esc(o)}"` +
          ` aria-pressed="${o === active ? 'true' : 'false'}">${esc(labels[o])}</button>`
      )
      .join('') +
    `</div>`
  );
}

// ---- 01 Map legend ----

function renderLegend(graph: MeshGraph, s: MeshSummary, nowMs: number): string {
  const unknown = s.sourceStatus === 'UNAVAILABLE';
  const counts = deriveRecencyCounts(graph, nowMs);
  const n = (v: number | null) =>
    `<span class="mesh-legend__count">${unknown ? 'Unknown' : count(v)}</span>`;
  const item = (swatch: string, label: string, value: number | null, extra = '') =>
    `<li class="mesh-legend__item${extra}">${swatch}` +
    `<span class="mesh-legend__label">${esc(label)}</span>${n(value)}</li>`;
  const line = (mod: string) =>
    `<span class="mesh-legend__line mesh-legend__line--${mod}" aria-hidden="true"></span>`;
  const dot = (mod: string) =>
    `<span class="mesh-legend__dot mesh-legend__dot--${mod}" aria-hidden="true"></span>`;
  const stale = unknown ? null : deriveStaleLinkCount(graph, nowMs);

  return (
    `<ul class="mesh-legend">` +
    RECENCY_TIERS.map((tier) => item(line(tier), RECENCY_LABELS[tier], counts[tier])).join('') +
    // The dashed orange line only earns a legend entry when the map actually draws one.
    (stale ? item(line('stale'), copy.legendStale, stale) : '') +
    // Every corridor repeater the map pins — the same set the headline and the table count.
    item(dot('ours'), copy.legendCorridor, s.regionNodes, ' mesh-legend__item--rule') +
    item(dot('neighbour'), copy.legendNeighbour, s.neighbourNodes) +
    `</ul>`
  );
}

// ---- 02 Repeaters ----

/** Sparkline width/height in SVG units — sized for its table cell. */
const SPARK_W = 72;
const SPARK_H = 20;

/**
 * The battery axis floor for both the sparklines and the chart: 50%, or the next 25-point step
 * below the lowest reading. A fixed 0–100 scale flattened every trace into its top fifth; a
 * floor that CLIPPED would hide exactly the night a site ran down into the teens. So the axis
 * starts at 50 and only extends when a reading needs it.
 */
export function batteryFloor(minReading: number | null): number {
  if (minReading == null || minReading >= 50) return 50;
  return Math.max(0, Math.floor(minReading / 25) * 25);
}

/**
 * The row's own battery trace over the last day, on the SAME scale for every row (50–100%,
 * extended for a reading below 50), so rows can be read against each other. Scaling each row
 * to its own min/max made a healthy node oscillating 90–100% look like the emergency.
 */
function renderSparkline(
  series: TelemetrySeries | undefined,
  floor: number,
  nowMs: number
): string {
  if (!series) return '';
  const { from } = historyWindow(nowMs);
  const pts = series.points
    .filter((p) => p.t >= from)
    .map((p) => ({ t: p.t, v: metricValue(p, 'battery') }))
    .filter((p): p is { t: number; v: number } => p.v != null);
  if (pts.length < 3) return '';
  const t0 = pts[0].t;
  const span = Math.max(1, pts[pts.length - 1].t - t0);
  const range = 100 - floor;
  const d = pts
    .map((p, i) => {
      const x = ((p.t - t0) / span) * SPARK_W;
      const v = Math.max(floor, Math.min(100, p.v));
      const y = SPARK_H - 1 - ((v - floor) / range) * (SPARK_H - 2);
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join('');
  return (
    `<svg class="mesh-spark" viewBox="0 0 ${SPARK_W} ${SPARK_H}" aria-hidden="true" focusable="false">` +
    `<path d="${d}"/></svg>`
  );
}

/**
 * The battery cell: a thin level bar and the figure. The figure turns brass under the watch
 * floor and orange under the risk line — the one battery warning on the page, kept beside the
 * reading it qualifies rather than in a strip of its own. Unmonitored and unreadable are
 * stated in words, never as an empty bar.
 */
function renderBattery(health: MeshNodeHealth | null): string {
  if (!health) return `<span class="mesh-batt__none">${esc(copy.notMonitored)}</span>`;
  if (health.percent == null)
    return `<span class="mesh-batt__none">${esc(copy.healthUnreadable)}</span>`;
  const pct = Math.round(health.percent);
  const tone = health.low ? ' mesh-batt--low' : health.watch ? ' mesh-batt--watch' : '';
  return (
    `<span class="mesh-batt${tone}">` +
    `<span class="mesh-batt__bar" aria-hidden="true">` +
    `<span class="mesh-batt__fill" style="width:${Math.max(0, Math.min(100, pct))}%"></span>` +
    `</span><span class="mesh-batt__pct">${pct}%</span></span>`
  );
}

function renderRoster(graph: MeshGraph, nowMs: number, o: MeshViewOptions): string {
  if (graph.sourceStatus === 'UNAVAILABLE') {
    return `<p class="mesh-empty">${esc(copy.statusUnavailableNote)}</p>`;
  }
  const rows = sortNodeRows(deriveNodeRows(graph, nowMs), o.sort);
  if (!rows.length) return `<p class="mesh-empty">${esc(copy.rosterEmpty)}</p>`;

  // One scale for every sparkline: the floor comes from the lowest reading on ANY row.
  const { from } = historyWindow(nowMs);
  let min: number | null = null;
  for (const s of o.series.values()) {
    for (const p of s.points) {
      if (p.t < from || p.battery == null) continue;
      if (min == null || p.battery < min) min = p.battery;
    }
  }
  const floor = batteryFloor(min);

  const row = (r: MeshNodeRow) => {
    const { node, degree, lastHeard, status, health } = r;
    const name = displayName(node.name);
    const selected = node.publicKey === o.selected;
    const heard = lastHeard ? agoLabel(lastHeard, nowMs) : 'Never';
    return (
      `<tr class="mesh-row mesh-row--${status}${selected ? ' mesh-row--selected' : ''}"` +
      ` data-mesh-row="${esc(node.publicKey)}">` +
      `<td class="mesh-row__dot"><span class="mesh-dot mesh-dot--${status}" aria-hidden="true"></span></td>` +
      // The name is the row's one control: a real button, so the row is keyboard-reachable
      // and announced. The rest of the row is a click target too (delegated in the page).
      `<th scope="row" class="mesh-row__name"><button type="button" class="mesh-row__btn"` +
      ` data-mesh-node="${esc(node.publicKey)}" aria-pressed="${selected ? 'true' : 'false'}">` +
      `${esc(name)}</button></th>` +
      `<td class="mesh-row__links">${degree}</td>` +
      `<td class="mesh-row__heard">${esc(heard)}</td>` +
      `<td class="mesh-row__batt">${renderBattery(health)}</td>` +
      `<td class="mesh-row__spark">${health ? renderSparkline(o.series.get(node.publicKey), floor, nowMs) : ''}</td>` +
      // Collapses the links + last-heard columns into the name cell on a phone.
      `<td class="mesh-row__compact">${esc(
        `${degree} ${degree === 1 ? 'link' : 'links'} · heard ${heard}`
      )}</td>` +
      `</tr>`
    );
  };

  return (
    `<table class="mesh-table">` +
    `<thead><tr>` +
    `<th scope="col" class="mesh-row__dot"><span class="sr-only">Status</span></th>` +
    `<th scope="col" class="mesh-row__name">Repeater</th>` +
    `<th scope="col" class="mesh-row__links">Links</th>` +
    `<th scope="col" class="mesh-row__heard">Last heard</th>` +
    `<th scope="col" class="mesh-row__batt">Battery</th>` +
    `<th scope="col" class="mesh-row__spark">24 h</th>` +
    `<th scope="col" class="mesh-row__compact"><span class="sr-only">Summary</span></th>` +
    `</tr></thead>` +
    `<tbody>${rows.map(row).join('')}</tbody></table>`
  );
}

/**
 * Build the whole view-model from a fetched graph. `nowMs` is passed in (never read from the
 * clock here) so the derivations stay pure and the screenshot harness's frozen clock produces
 * byte-stable output.
 */
export function buildMeshView(
  graph: MeshGraph,
  window: MeshWindow,
  nowMs: number,
  options: Partial<MeshViewOptions> = {}
): MeshView {
  const o: MeshViewOptions = {
    selected: options.selected ?? null,
    sort: options.sort ?? 'links',
    series: options.series ?? new Map(),
  };
  const summary = deriveMeshSummary(graph, nowMs);
  return {
    summary,
    html: {
      headline: renderHeadline(graph, nowMs),
      lede: renderLede(graph, summary, nowMs),
      stats: renderStats(graph, summary, window, nowMs),
      legend: renderLegend(graph, summary, nowMs),
      sortTabs: textTabs('sort', 'Sort', ROSTER_SORTS, ROSTER_SORT_LABELS, o.sort, true),
      roster: renderRoster(graph, nowMs, o),
    },
  };
}
