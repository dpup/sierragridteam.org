/**
 * mesh-view.ts — the SINGLE source of truth for /mesh's data regions, rendered as HTML
 * strings so the browser can re-render them in place on each refresh. Same pattern (and
 * same reason) as `live-view.ts`: Astro scoped styles don't reach client-injected markup,
 * so the CSS for everything below lives globally in `src/styles/mesh.css`, namespaced under
 * `.mesh-view`. Keep this module PURE — no DOM, no fetch, no MapLibre.
 *
 * Honesty rules this module enforces (docs/content-style-guide.md §10):
 *   • A `null` count renders "Unknown", never "0" or "—" dressed up as calm.
 *   • Recency copy always says what we HEARD, never what is up or down.
 *   • Any span named in copy comes from the window constant, never a literal — "in the last
 *     30 days" must stay true if MESH_WINDOW changes.
 */
import { escapeHtml as esc } from './format';
import {
  agoLabel,
  deriveMeshSummary,
  deriveNodeRows,
  deriveRecencyCounts,
  displayName,
  nodeTypeLabel,
  shortKey,
  MESH_WINDOW_LABELS,
  RECENCY_LABELS,
  RECENCY_TIERS,
  type MeshGraph,
  type MeshRecency,
  type MeshSummary,
  type MeshWindow,
} from './mesh';
import { mesh as copy } from '../config/content';

export interface MeshView {
  summary: MeshSummary;
  /** Status line: the freshness stamp + an honest tone when the feed is degraded. */
  status: { tone: 'ok' | 'stale' | 'unknown'; label: string; detail: string };
  html: { tiles: string; legend: string; roster: string };
}

/** A count that may be honestly unknown. Never renders a fabricated zero. */
const count = (n: number | null): string => (n == null ? 'Unknown' : String(n));

const tile = (label: string, value: string, sub: string, muted = false) =>
  `<div class="mesh-tile${muted ? ' mesh-tile--muted' : ''}">` +
  `<p class="mesh-tile__label">${esc(label)}</p>` +
  `<p class="mesh-tile__value">${esc(value)}</p>` +
  `<p class="mesh-tile__sub">${esc(sub)}</p>` +
  `</div>`;

function renderTiles(s: MeshSummary, window: MeshWindow): string {
  const unknown = s.sourceStatus === 'UNAVAILABLE';
  // Name the window in the sublabel — "12 links" means nothing without the span it covers.
  const span = `in the last ${MESH_WINDOW_LABELS[window].toLowerCase()}`;
  return (
    `<div class="mesh-tiles">` +
    // Leads with OUR repeaters, which is the same figure the homepage "Relay Nodes" tile
    // shows — the two surfaces must not appear to disagree. Any other operator's repeater
    // that also sits inside the corridor is real and still drawn on the map, so it's
    // reported in the sublabel rather than folded into the headline number.
    tile(
      'S.I.E.R.R.A repeaters',
      count(s.ourNodes),
      s.ourNodes == null || s.regionNodes == null
        ? 'Feed unavailable'
        : s.regionNodes > s.ourNodes
          ? `Plus ${s.regionNodes - s.ourNodes} in the corridor run by others`
          : 'Heard in the Ebbetts Pass corridor',
      unknown
    ) +
    tile('Observed links', count(s.regionLinks), `Relay pairs heard ${span}`, unknown) +
    tile('Heard this hour', count(s.liveLinks), 'Links with traffic in the last hour', unknown) +
    tile(
      'Best signal',
      s.bestSnr == null ? 'Unknown' : `${s.bestSnr.toFixed(1)} dB`,
      'Peak SNR on any corridor link',
      unknown
    ) +
    `</div>`
  );
}

function renderLegend(counts: Record<MeshRecency, number>, s: MeshSummary): string {
  const unknown = s.sourceStatus === 'UNAVAILABLE';
  const items = RECENCY_TIERS.map(
    (tier) =>
      `<li class="mesh-legend__item">` +
      `<span class="mesh-legend__line mesh-legend__line--${tier}" aria-hidden="true"></span>` +
      `<span class="mesh-legend__label">${esc(RECENCY_LABELS[tier])}</span>` +
      `<span class="mesh-legend__count">${unknown ? 'Unknown' : counts[tier]}</span>` +
      `</li>`
  ).join('');
  return (
    `<p class="mesh-legend__note">${esc(copy.legendNote)}</p>` +
    `<ul class="mesh-legend">` +
    items +
    `<li class="mesh-legend__item mesh-legend__item--node">` +
    `<span class="mesh-legend__dot mesh-legend__dot--ours" aria-hidden="true"></span>` +
    `<span class="mesh-legend__label">S.I.E.R.R.A repeater</span>` +
    `<span class="mesh-legend__count">${count(s.ourNodes)}</span>` +
    `</li>` +
    `<li class="mesh-legend__item mesh-legend__item--node">` +
    `<span class="mesh-legend__dot mesh-legend__dot--neighbour" aria-hidden="true"></span>` +
    `<span class="mesh-legend__label">Neighbouring repeater</span>` +
    `<span class="mesh-legend__count">${count(s.neighbourNodes)}</span>` +
    `</li>` +
    `</ul>`
  );
}

function renderRoster(graph: MeshGraph, nowMs: number): string {
  if (graph.sourceStatus === 'UNAVAILABLE') {
    return `<p class="mesh-empty">${esc(copy.statusUnavailableNote)}</p>`;
  }
  const rows = deriveNodeRows(graph, nowMs);
  if (!rows.length) return `<p class="mesh-empty">${esc(copy.rosterEmpty)}</p>`;

  return (
    `<ul class="mesh-roster">` +
    rows
      .map(({ node, degree, lastHeard, recency }) => {
        const name = displayName(node.name);
        const tierClass = recency ? ` mesh-roster__pulse--${recency}` : '';
        return (
          `<li class="mesh-roster__item">` +
          `<button type="button" class="mesh-roster__btn" data-mesh-node="${esc(node.publicKey)}">` +
          `<span class="mesh-roster__pulse${tierClass}" aria-hidden="true"></span>` +
          `<span class="mesh-roster__body">` +
          `<span class="mesh-roster__name">${esc(name)}</span>` +
          `<span class="mesh-roster__meta">` +
          `${esc(nodeTypeLabel(node.nodeType))} · ${degree} ${degree === 1 ? 'link' : 'links'} · ` +
          `${esc(lastHeard ? `heard ${agoLabel(lastHeard, nowMs)}` : 'no links observed in this window')}` +
          `</span>` +
          `</span>` +
          `<span class="mesh-roster__key">${esc(shortKey(node.publicKey))}</span>` +
          `</button>` +
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
export function buildMeshView(graph: MeshGraph, window: MeshWindow, nowMs: number): MeshView {
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
      tiles: renderTiles(summary, window),
      legend: renderLegend(counts, summary),
      roster: renderRoster(graph, nowMs),
    },
  };
}
