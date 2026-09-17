/**
 * mesh-view.ts — the SINGLE source of truth for /mesh's data regions, rendered as HTML
 * strings so the browser can re-render them in place on each refresh and on each selection.
 * Same pattern (and same reason) as `live-view.ts`: Astro scoped styles don't reach
 * client-injected markup, so the CSS for everything below lives globally in
 * `src/styles/mesh.css`, namespaced under `.mesh-view`. Keep this module PURE — no DOM, no
 * fetch, no MapLibre.
 *
 * The page is a status board, in four regions, top to bottom:
 *   • BAND      — the deep-ground headline figures. What an operator reads first.
 *   • ATTENTION — anything currently outside limits. Empty means empty, and says so.
 *   • ROSTER    — one row per corridor repeater; a monitored row expands inline.
 *   • LEGEND    — the map's recency scale, as one horizontal strip.
 * The history chart is its own module (`mesh-history.ts`) because it owns an SVG.
 *
 * Honesty rules this module enforces (docs/content-style-guide.md §3):
 *   • A `null` count renders "Unknown", never "0" or "—" dressed up as calm.
 *   • Recency copy always says what we HEARD, never what is up or down.
 *   • Any span named in copy comes from a constant, never a literal — "in the last 30 days"
 *     must stay true if MESH_WINDOW changes.
 *   • A repeater with no monitor renders "Limited Telemetry" — a fact about OUR coverage. It
 *     is never a blank cell, a zero, or anything a reader could read as "this one is fine".
 */
import { escapeHtml as esc } from './format';
import {
  agoLabel,
  deriveAttention,
  deriveHeardCount,
  deriveMeshSummary,
  deriveNodeRows,
  deriveRecencyCounts,
  displayName,
  nodeTypeLabel,
  shortKey,
  sortNodeRows,
  HEARD_IN_LABELS,
  HEARD_IN_OPTIONS,
  HEARD_WITHIN_HOURS,
  MESH_WINDOW_LABELS,
  RECENCY_LABELS,
  RECENCY_TIERS,
  ROSTER_SORTS,
  ROSTER_SORT_LABELS,
  type MeshGraph,
  type MeshHeardIn,
  type MeshNodeHealth,
  type MeshNodeRow,
  type MeshRecency,
  type MeshRosterSort,
  type MeshSummary,
  type MeshWindow,
} from './mesh';
import { metricValue, type TelemetrySeries } from './mesh-telemetry';
import { mesh as copy } from '../config/content';
import { personByMonitorId } from '../config/people';

export interface MeshViewOptions {
  /** The expanded repeater, shared with the map and the history chart's legend. */
  selected: string | null;
  sort: MeshRosterSort;
  heardIn: MeshHeardIn;
  /** Archived telemetry by public key — empty until the deferred fetch lands. */
  series: Map<string, TelemetrySeries>;
}

export interface MeshView {
  summary: MeshSummary;
  status: { tone: 'ok' | 'stale' | 'unknown'; label: string; detail: string };
  html: { band: string; attention: string; legend: string; roster: string; controls: string };
}

/** A count that may be honestly unknown. Never renders a fabricated zero. */
const count = (n: number | null): string => (n == null ? 'Unknown' : String(n));

// ---- The deep band ----

const metric = (label: string, value: string, sub: string, tone: 'plain' | 'watch' = 'plain') =>
  `<div class="mesh-metric-cell">` +
  `<p class="mesh-metric-cell__label">${esc(label)}</p>` +
  `<p class="mesh-metric-cell__value${tone === 'watch' ? ' mesh-metric-cell__value--watch' : ''}">${esc(value)}</p>` +
  `<p class="mesh-metric-cell__sub">${esc(sub)}</p>` +
  `</div>`;

/**
 * The headline figures. Four, in the order an operator asks them:
 * are they there · is anything running out · is it carrying traffic · how big is the picture.
 *
 * Brass marks the two that can go wrong. "Repeaters heard" and "lowest battery" turn brass
 * when they are short of the roster or under the watch floor — a value that can only ever be
 * neutral does not need a colour, and spending one on it would make the two that matter
 * invisible.
 */
function renderBand(graph: MeshGraph, s: MeshSummary, window: MeshWindow, nowMs: number): string {
  const unknown = s.sourceStatus === 'UNAVAILABLE';
  const heard = deriveHeardCount(graph, nowMs);
  const heardValue = heard ? `${heard.heard} / ${heard.total}` : 'Unknown';
  const heardShort = !!heard && heard.heard < heard.total;

  const battery = s.lowestBattery;
  const batteryValue = unknown || !battery ? 'Unknown' : `${Math.round(battery.percent)}%`;
  const batterySub =
    unknown || s.monitored == null || s.monitorable == null
      ? copy.healthUnknownSub
      : battery
        ? battery.name
        : `${s.monitored} of ${s.monitorable} monitored`;

  return (
    `<div class="mesh-band__metrics">` +
    metric(
      'Repeaters heard',
      heardValue,
      `within ${HEARD_WITHIN_HOURS} h`,
      heardShort ? 'watch' : 'plain'
    ) +
    metric('Lowest battery', batteryValue, batterySub, battery?.low ? 'watch' : 'plain') +
    metric(
      'Active this hour',
      count(s.liveLinks),
      s.regionLinks == null ? 'Feed unavailable' : `of ${s.regionLinks} links`
    ) +
    metric(
      'Observed links',
      count(s.regionLinks),
      s.neighbourNodes == null
        ? 'Feed unavailable'
        : `${MESH_WINDOW_LABELS[window].replace(/ /g, ' ')} · ${s.neighbourNodes} neighbours`
    ) +
    `</div>`
  );
}

// ---- Needs attention ----

/**
 * Anything currently outside limits, as a single scannable strip. Each item is a BUTTON that
 * selects its repeater, so the strip is a way into the roster and the map rather than a
 * notice board.
 *
 * The region renders NOTHING when there is nothing to say — no empty strip, no "all clear"
 * line. A standing bar that is almost always reassuring trains a reader to skip the place
 * where the warnings appear, and the band above already carries the figures that would show
 * trouble. Its absence is not a claim either way; the same is true when the feed is down.
 */
function renderAttention(graph: MeshGraph, nowMs: number): string {
  if (graph.sourceStatus === 'UNAVAILABLE') return '';
  const items = deriveAttention(graph, nowMs);
  if (!items.length) return '';
  return (
    `<div class="mesh-attention">` +
    `<p class="mesh-attention__label">${esc(copy.attentionLabel)}</p>` +
    `<ul class="mesh-attention__list">` +
    items
      .map(
        (i) =>
          `<li class="mesh-attention__item" data-tone="${i.tone}">` +
          `<button type="button" class="mesh-attention__btn" data-mesh-node="${esc(i.node.publicKey)}">` +
          `<span class="mesh-attention__name">${esc(displayName(i.node.name))}</span>` +
          `<span class="mesh-attention__detail">${esc(i.detail)}</span>` +
          `</button></li>`
      )
      .join('') +
    `</ul></div>`
  );
}

// ---- Map + roster chrome ----

const segmented = (
  name: string,
  label: string,
  options: readonly string[],
  labels: Record<string, string>,
  active: string
) =>
  `<div class="mesh-seg" role="group" aria-label="${esc(label)}">` +
  `<span class="mesh-seg__label" aria-hidden="true">${esc(label)}</span>` +
  options
    .map(
      (o) =>
        `<button type="button" class="mesh-seg__btn" data-mesh-${esc(name)}="${esc(o)}"` +
        ` aria-pressed="${o === active ? 'true' : 'false'}">${esc(labels[o])}</button>`
    )
    .join('') +
  `</div>`;

function renderControls(o: MeshViewOptions): string {
  return (
    `<div class="mesh-panel__head" data-panel="map">` +
    `<p class="mesh-panel__title">${esc(copy.mapPanelTitle)}</p>` +
    segmented('heardin', 'Heard in', HEARD_IN_OPTIONS, HEARD_IN_LABELS, o.heardIn) +
    `</div>` +
    // No title on the roster head: the column plainly IS the repeater list, and the count and
    // the sparkline span were restating what the rows already show. The section keeps its
    // accessible name from the visually-hidden h2 in MeshPanels.astro.
    `<div class="mesh-panel__head" data-panel="roster">` +
    segmented('sort', 'Sort', ROSTER_SORTS, ROSTER_SORT_LABELS, o.sort) +
    `</div>`
  );
}

function renderLegend(counts: Record<MeshRecency, number>, s: MeshSummary): string {
  const unknown = s.sourceStatus === 'UNAVAILABLE';
  return (
    `<ul class="mesh-legend">` +
    RECENCY_TIERS.map(
      (tier) =>
        `<li class="mesh-legend__item">` +
        `<span class="mesh-legend__line mesh-legend__line--${tier}" aria-hidden="true"></span>` +
        `<span class="mesh-legend__label">${esc(RECENCY_LABELS[tier])}</span>` +
        `<span class="mesh-legend__count">${unknown ? 'Unknown' : counts[tier]}</span>` +
        `</li>`
    ).join('') +
    // The map draws two kinds of marker; the key for them belongs in the same strip as the
    // link scale rather than in a second legend somewhere else.
    `<li class="mesh-legend__item mesh-legend__item--node">` +
    `<span class="mesh-legend__dot mesh-legend__dot--ours" aria-hidden="true"></span>` +
    `<span class="mesh-legend__label">${esc(copy.legendCorridor)}</span>` +
    `<span class="mesh-legend__count">${count(s.ourNodes)}</span></li>` +
    `<li class="mesh-legend__item mesh-legend__item--node">` +
    `<span class="mesh-legend__dot mesh-legend__dot--neighbour" aria-hidden="true"></span>` +
    `<span class="mesh-legend__label">${esc(copy.legendNeighbour)}</span>` +
    `<span class="mesh-legend__count">${count(s.neighbourNodes)}</span></li>` +
    `</ul>`
  );
}

// ---- Roster ----

/** A count that may be honestly unknown, for the health cell. */
function renderHealthCell(health: MeshNodeHealth | null, spark: string): string {
  if (!health || health.percent == null) {
    const label = health ? copy.healthUnreadable : copy.notMonitored;
    return (
      `<span class="mesh-health mesh-health--none">` +
      `<span class="mesh-health__none">${esc(label)}</span>` +
      `</span>`
    );
  }
  const pct = Math.round(health.percent);
  return (
    `<span class="mesh-health${health.low ? ' mesh-health--low' : ''}${health.watch ? ' mesh-health--watch' : ''}">` +
    spark +
    `<span class="mesh-health__pct">${pct}%</span>` +
    `<span class="mesh-health__bar" aria-hidden="true">` +
    `<span class="mesh-health__fill" style="width:${Math.max(0, Math.min(100, pct))}%"></span>` +
    `</span>` +
    `</span>`
  );
}

/** Sparkline width/height in SVG units — small enough to sit inside a roster row. */
const SPARK_W = 72;
const SPARK_H = 20;

/**
 * The span a roster sparkline covers. FIXED, and deliberately not the history chart's range:
 * it used to draw whatever the chart below was set to, so switching that control silently
 * changed every row's span with nothing in the row to say so — and at a month, 2,880 points
 * in 72 units collapsed into a solid band.
 *
 * Six hours is short enough that the last few readings still have shape at this size, and
 * long enough to show a direction. The roster header states it, because a sparkline with no
 * axis is otherwise asking the reader to guess.
 */
export const SPARK_WINDOW_HOURS = 6;

/**
 * The row's own battery trace, on an ABSOLUTE 0-100 scale — the same scale as the level bar
 * directly beneath it, so the two read as one object: the bar is where it is, the line is
 * where it has been.
 *
 * It used to scale to each row's own min/max, and that actively lied. A repeater oscillating
 * between 90% and 100% filled the full height with a violent zigzag while one sliding from
 * 90% to 60% drew a gentle slope — the healthy node looked like the emergency. Auto-scaling
 * is defensible for a sparkline whose job is "which way is this going", but not in a column
 * where rows are read against each other, and not next to a bar on a fixed scale.
 *
 * The cost is that small real movement is small on screen: a 10-point swing is under two
 * pixels. That is the correct picture. "Steady near full" SHOULD look like a flat line near
 * the top, and the chart at the foot of the page is where a few points of drift can be
 * examined properly.
 */
const SPARK_MIN = 0;
const SPARK_MAX = 100;
function renderSparkline(series: TelemetrySeries | undefined, nowMs: number): string {
  if (!series) return '';
  const since = nowMs - SPARK_WINDOW_HOURS * 3_600_000;
  const pts = series.points
    .filter((p) => p.t >= since)
    .map((p) => ({ t: p.t, v: metricValue(p, 'battery') }))
    .filter((p): p is { t: number; v: number } => p.v != null);
  if (pts.length < 3) return '';
  const t0 = pts[0].t;
  const t1 = pts[pts.length - 1].t;
  const span = Math.max(1, t1 - t0);
  const range = SPARK_MAX - SPARK_MIN;
  const d = pts
    .map((p, i) => {
      const x = ((p.t - t0) / span) * SPARK_W;
      const clamped = Math.max(SPARK_MIN, Math.min(SPARK_MAX, p.v));
      const y = SPARK_H - 1 - ((clamped - SPARK_MIN) / range) * (SPARK_H - 2);
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join('');
  return (
    `<svg class="mesh-spark" viewBox="0 0 ${SPARK_W} ${SPARK_H}" aria-hidden="true" focusable="false">` +
    `<path d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" ` +
    `stroke-linejoin="round" stroke-linecap="round"/></svg>`
  );
}

/** Stable id so a row's button can own its panel via `aria-controls`. */
const detailId = (key: string) => `mesh-detail-${key.slice(0, 8)}`;

/**
 * Who runs the monitor, by NAME where we know them — the page is read by members and
 * neighbours, and `alanpi` is a hostname, not a person. An unrecognised id is printed
 * verbatim rather than guessed at: a monitor we don't have on file is a real case.
 */
function monitorLabel(reporterId: string | null): string {
  if (!reporterId) return copy.detailKickerAnon;
  const person = personByMonitorId(reporterId);
  return `${copy.detailKicker} ${person ? person.firstName : reporterId}`;
}

/**
 * The expanded reading. It lives INSIDE the row's <li>, so it needs no frame of its own —
 * the row's green edge and fill already bind them into one object. Returns `''` for a
 * repeater with no monitor: there is nothing honest to put here, and an empty scaffold of
 * dashes would look like a reading that failed rather than a site nobody watches.
 */
function renderDetail(row: MeshNodeRow): string {
  const { node, health } = row;
  if (!health) return '';
  const pct = health.percent == null ? 'Unknown' : `${Math.round(health.percent)}%`;
  const temp = health.tempF == null ? 'Unknown' : `${health.tempF} °F`;
  // Volts, not "heard": the row directly above already states when we last heard it, and the
  // metric row has three cells to spend on things the row cannot say. Voltage is also the
  // honest one — it is measured, where the percentage beside it is inferred from it.
  const volts = health.volts == null ? 'Unknown' : `${health.volts.toFixed(2)} V`;
  const basis =
    health.percent == null
      ? copy.healthUnreadableNote
      : health.estimated
        ? copy.detailEstimated
        : copy.detailMeasured;
  const cell = (label: string, value: string, risk = false) =>
    `<div class="mesh-metric">` +
    `<p class="mesh-metric__label">${esc(label)}</p>` +
    `<p class="mesh-metric__value${risk ? ' mesh-metric__value--risk' : ''}">${esc(value)}</p>` +
    `</div>`;

  return (
    `<div class="mesh-detail" id="${detailId(node.publicKey)}">` +
    `<div class="mesh-metrics">` +
    cell('Battery', pct, health.low) +
    cell('Volts', volts) +
    cell('Enclosure', temp) +
    `</div>` +
    `<p class="mesh-detail__note">${esc(basis)} · ${esc(monitorLabel(health.reporterId))} · ` +
    `<span class="mesh-detail__key">${esc(shortKey(node.publicKey))}</span></p>` +
    `</div>`
  );
}

function renderRoster(graph: MeshGraph, nowMs: number, o: MeshViewOptions): string {
  if (graph.sourceStatus === 'UNAVAILABLE') {
    return `<p class="mesh-empty">${esc(copy.statusUnavailableNote)}</p>`;
  }
  const rows = sortNodeRows(deriveNodeRows(graph, nowMs), o.sort);
  if (!rows.length) return `<p class="mesh-empty">${esc(copy.rosterEmpty)}</p>`;

  return (
    `<ul class="mesh-roster">` +
    rows
      .map((row) => {
        const { node, degree, lastHeard, recency, health } = row;
        const tierClass = recency ? ` mesh-roster__pulse--${recency}` : '';
        // "Repeater ·" prefixed every row identically; the type only earns its space when it
        // is NOT the expected one. The width goes to the facts that differ.
        const type = node.nodeType === 'repeater' ? '' : `${nodeTypeLabel(node.nodeType)} · `;
        const heard = lastHeard
          ? `heard ${agoLabel(lastHeard, nowMs)}`
          : 'no links observed in this window';
        // Only a monitored repeater has anything to open, so only it gets the disclosure
        // affordance. A chevron on a row that expands to nothing is a promise the page
        // cannot keep — and the reason the reading was hard to find in the first place.
        const expandable = health != null;
        const open = expandable && node.publicKey === o.selected;
        return (
          `<li class="mesh-roster__item${open ? ' mesh-roster__item--open' : ''}">` +
          `<button type="button" class="mesh-roster__btn" data-mesh-node="${esc(node.publicKey)}"` +
          (expandable
            ? ` aria-expanded="${open ? 'true' : 'false'}"` +
              (open ? ` aria-controls="${detailId(node.publicKey)}"` : '')
            : '') +
          `>` +
          `<span class="mesh-roster__pulse${tierClass}" aria-hidden="true"></span>` +
          `<span class="mesh-roster__body">` +
          `<span class="mesh-roster__name">${esc(displayName(node.name))}</span>` +
          `<span class="mesh-roster__meta">${esc(`${type}${degree} ${degree === 1 ? 'link' : 'links'} · ${heard}`)}</span>` +
          `</span>` +
          renderHealthCell(health, renderSparkline(o.series.get(node.publicKey), nowMs)) +
          (expandable ? `<span class="mesh-roster__chev" aria-hidden="true"></span>` : '') +
          `</button>` +
          (open ? renderDetail(row) : '') +
          `</li>`
        );
      })
      .join('') +
    `</ul>`
  );
}

/**
 * Build the whole panel view-model from a fetched graph. `nowMs` is passed in (never read
 * from the clock here) so the derivations stay pure and the screenshot harness's frozen
 * clock produces byte-stable output.
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
    heardIn: options.heardIn ?? '30d',
    series: options.series ?? new Map(),
  };
  const summary = deriveMeshSummary(graph, nowMs);
  const counts = deriveRecencyCounts(graph, nowMs);

  const status: MeshView['status'] =
    summary.sourceStatus === 'UNAVAILABLE'
      ? { tone: 'unknown', label: copy.statusUnavailableLabel, detail: 'Network state unknown' }
      : summary.sourceStatus === 'STALE'
        ? {
            tone: 'stale',
            label: 'Feed stale',
            detail: `Last reception ${agoLabel(summary.lastHeard, nowMs)}`,
          }
        : {
            tone: 'ok',
            label: 'Mesh observed',
            detail: `Last reception ${agoLabel(summary.lastHeard, nowMs)}`,
          };

  return {
    summary,
    status,
    html: {
      band: renderBand(graph, summary, window, nowMs),
      attention: renderAttention(graph, nowMs),
      legend: renderLegend(counts, summary),
      roster: renderRoster(graph, nowMs, o),
      controls: renderControls(o),
    },
  };
}
