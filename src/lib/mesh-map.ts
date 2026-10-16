/**
 * mesh-map.ts — the /mesh topology map (MapLibre GL JS over a restyled OpenFreeMap Positron).
 * CLIENT-ONLY: it imports maplibre, so it must never be imported from Astro frontmatter —
 * only from a browser `<script>`.
 *
 * What the map says (layout "2a", 2026-10):
 *
 *   • **The corridor is the subject.** Its repeaters are DOM pins — a 9px dot coloured by how
 *     recently we heard it (green within the hour, brass within 12 hours, orange beyond, with
 *     a ring) and an uppercase label. Neighbours out in the wider mesh are small hollow dots.
 *   • **Links carry recency in darkness and weight** (`mesh-link-paint.ts`). A link touching a
 *     repeater we have stopped hearing is dashed orange. A faint link is never "down".
 *   • **Selecting a repeater shows its reach.** The map zooms to fit every link it has been
 *     heard on — out to Sacramento and the Bay Area — labels those neighbours, marks the
 *     farthest hop's distance, and opens the repeater's card. Esc, the card's ×, or a click on
 *     empty map returns to the corridor.
 *   • **Cards are map labels, not panels laid over it** ("blended label", `map-card.ts`, shared
 *     with /live): placed where they cover none of the links being read.
 *   • The ground is the site basemap (`map-ground.ts`), the same one /live draws on.
 *
 * Colours are read from the CSS tokens at runtime (tokens.css stays the source of truth);
 * MapLibre paint needs literal colours, so we can't hand it var(--…) directly.
 */
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { escapeHtml as esc } from './format';
import { cardHtml, cardMetric as metric, createMapCard, DOCK_BELOW } from './map-card';
import { decorateBasemap, loadBasemapStyle, mapColors } from './map-ground';
import {
  agoLabel,
  deriveNodeRows,
  deriveStaleRows,
  displayName,
  distanceKm,
  linksToGeoJSON,
  nodesToGeoJSON,
  nodeTypeLabel,
  MESH_WINDOW_DAYS,
  type MeshGraph,
  type MeshLink,
  type MeshNode,
  type MeshNodeRow,
  type MeshWindow,
} from './mesh';
import {
  linkFilter,
  linkPaint,
  selectedLinkFilter,
  SELECTED_LINK,
  STALE_STYLE,
  type LinkState,
} from './mesh-link-paint';
import { mesh as copy } from '../config/content';

type GeoFC = GeoJSON.FeatureCollection;

export interface MeshMapHandle {
  /** Push a fresh region graph onto the existing sources (the live refresh). */
  setGraph(graph: MeshGraph, window: MeshWindow, nowMs: number): void;
  /** Push the lazily-loaded whole-mesh backdrop. */
  setBackdrop(nodes: MeshNode[], links: ReturnType<typeof linksToGeoJSON>): void;
  /** Hover feedback from the table (null clears). Returns true if the node is on the map. */
  highlight(key: string | null): boolean;
  /** Select a repeater (null clears): zoom to its reach and open its card. */
  select(key: string | null): void;
  /** Called when the viewport moves past the corridor — the cue to lazy-load the backdrop. */
  onPanOut(cb: () => void): void;
  destroy(): void;
}

export interface MeshMapOptions {
  /** Initial framing before the first graph lands. */
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  /** Calaveras + Tuolumne outlines (src/assets/service-counties.json) for the tint. */
  counties: GeoFC;
  /** Fired whenever the selected repeater changes, from the map or from `select`. */
  onSelectNode?: (key: string | null) => void;
}

const EMPTY: GeoFC = { type: 'FeatureCollection', features: [] };

/** The corridor-view padding. */
const FIT_PADDING = 60;

export function initMeshMap(figureEl: HTMLElement, opts: MeshMapOptions): MeshMapHandle | null {
  const canvas = figureEl.querySelector<HTMLElement>('[data-mesh-canvas]');
  if (!canvas) return null;

  const C = mapColors();
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const ease = () => (reduceMotion?.matches ? 0 : 600);

  // ---- state ----

  let map: maplibregl.Map | null = null;
  let ready = false;
  let destroyed = false;
  let graph: MeshGraph | null = null;
  let now = Date.now();
  let window_: MeshWindow = '30d';
  let rows = new Map<string, MeshNodeRow>();
  let nodes = new Map<string, MeshNode>();
  let regionBounds: maplibregl.LngLatBounds | null = null;
  let pendingBackdrop: { nodes: MeshNode[]; links: GeoFC } | null = null;
  let pendingSelect: string | null | undefined;
  const state: LinkState = { node: null, link: null };
  let hovered: string | null = null;
  let panOutCb: (() => void) | null = null;
  let panOutFired = false;

  // ---- the map, built once the restyled basemap is in hand ----

  (async () => {
    const style = await loadBasemapStyle(C);
    if (destroyed) return;
    try {
      map = new maplibregl.Map({
        container: canvas,
        style: style as maplibregl.StyleSpecification,
        bounds: [
          [opts.bounds.minLng, opts.bounds.minLat],
          [opts.bounds.maxLng, opts.bounds.maxLat],
        ],
        fitBoundsOptions: { padding: FIT_PADDING },
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        cooperativeGestures: true,
      });
    } catch {
      return; // no WebGL → keep the fallback note; the table carries every repeater
    }
    wire(map);
  })();

  // ---- popover: the shared "blended label" card (map-card.ts) ----

  const card = createMapCard(figureEl, {
    project: (at) => map?.project(at) ?? null,
    onDismiss: () => {
      clearAll();
      map?.getCanvas().focus();
    },
  });
  const hint = card.hint;

  /** Receptions above four digits abbreviate rather than wrap. */
  const compact = (n: number) => (n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : String(n));

  const meshCard = (title: string, kicker: string, metrics: string) =>
    cardHtml({ title, kicker, metrics, foot: esc(copy.popFootnote) });

  const closeCard = () => {
    setLinkEnds(null);
    card.close();
  };

  const openCard = (
    html: string,
    label: string,
    at: [number, number],
    ring: boolean,
    avoid: [number, number][][]
  ) => card.open({ html, label, at, ring, avoid });

  // ---- pins: corridor repeaters as real <button>s ----

  const pins = new Map<string, maplibregl.Marker>();

  /**
   * Labels that collide first try the other side of their dot; if that collides too, the
   * repeater with fewer links gives way — but a stale repeater's label is never hidden,
   * because it is the one the headline is pointing the reader at. Runs after every move;
   * hovering a pin always shows its own label (CSS).
   */
  let layoutQueued = false;
  const layoutLabels = () => {
    if (layoutQueued) return;
    layoutQueued = true;
    requestAnimationFrame(() => {
      layoutQueued = false;
      const order = [...pins.entries()]
        .map(([key, m]) => ({ key, el: m.getElement(), row: rows.get(key) }))
        .sort(
          (a, b) =>
            Number(b.key === state.node) - Number(a.key === state.node) ||
            Number(b.row?.status === 'stale') - Number(a.row?.status === 'stale') ||
            (b.row?.degree ?? 0) - (a.row?.degree ?? 0)
        );
      const kept: DOMRect[] = [];
      const box = figureEl.getBoundingClientRect();
      // A label running off the map's edge counts as a collision too, so it flips or gives way.
      const clear = (r: DOMRect) =>
        r.left >= box.left &&
        r.right <= box.right &&
        !kept.some(
          (k) => r.left < k.right && r.right > k.left && r.top < k.bottom && r.bottom > k.top
        );
      for (const { el } of order) {
        el.classList.remove('mesh-pin--nolabel', 'mesh-pin--left');
        const label = el.querySelector('.mesh-pin__label');
        const right = label?.getBoundingClientRect();
        if (!label || !right?.width) continue;
        if (clear(right)) {
          kept.push(right);
          continue;
        }
        el.classList.add('mesh-pin--left');
        const left = label.getBoundingClientRect();
        if (clear(left)) {
          kept.push(left);
          continue;
        }
        el.classList.remove('mesh-pin--left');
        if (el.classList.contains('mesh-pin--stale')) kept.push(right);
        else el.classList.add('mesh-pin--nolabel');
      }
    });
  };

  const syncPins = () => {
    if (!map || !graph) return;
    const wanted = new Set<string>();
    for (const row of rows.values()) {
      const n = row.node;
      wanted.add(n.publicKey);
      const name = displayName(n.name);
      let marker = pins.get(n.publicKey);
      if (!marker) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mesh-pin';
        btn.dataset.pinKey = n.publicKey;
        btn.innerHTML =
          `<span class="mesh-pin__dot" aria-hidden="true"></span>` +
          `<span class="mesh-pin__label" aria-hidden="true"></span>`;
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          // Toggles, like its table row: a second click lets go.
          setSelected(state.node === n.publicKey ? null : n.publicKey);
        });
        btn.addEventListener('mouseenter', () => setHovered(n.publicKey));
        btn.addEventListener('mouseleave', () => setHovered(null));
        btn.addEventListener('focus', () => setHovered(n.publicKey));
        btn.addEventListener('blur', () => setHovered(null));
        marker = new maplibregl.Marker({ element: btn, anchor: 'center' })
          .setLngLat([n.lng, n.lat])
          .addTo(map);
        pins.set(n.publicKey, marker);
      } else {
        marker.setLngLat([n.lng, n.lat]);
      }
      const el = marker.getElement();
      el.querySelector('.mesh-pin__label')!.textContent = name;
      const heard = row.lastHeard ? `heard ${agoLabel(row.lastHeard, now)}` : 'never heard';
      el.setAttribute(
        'aria-label',
        `${name}. ${nodeTypeLabel(n.nodeType)}. ${row.degree} ${row.degree === 1 ? 'link' : 'links'}, ${heard}.`
      );
      for (const s of ['fresh', 'quiet', 'stale']) {
        el.classList.toggle(`mesh-pin--${s}`, row.status === s);
      }
    }
    for (const [key, marker] of pins) {
      if (wanted.has(key)) continue;
      marker.remove();
      pins.delete(key);
    }
    syncPinState();
  };

  const syncPinState = () => {
    for (const [key, marker] of pins) {
      const el = marker.getElement();
      el.classList.toggle('mesh-pin--selected', key === state.node);
      el.classList.toggle('mesh-pin--hover', key === hovered);
      el.setAttribute('aria-pressed', key === state.node ? 'true' : 'false');
    }
    figureEl.classList.toggle('meshmap--selecting', state.node != null);
    layoutLabels();
  };

  const setHovered = (key: string | null) => {
    const next = key && rows.has(key) ? key : null;
    if (next === hovered) return;
    hovered = next;
    syncPinState();
  };

  // ---- selection ----

  const linksOf = (key: string): MeshLink[] =>
    graph ? graph.links.filter((l) => l.a === key || l.b === key) : [];
  const linkKm = (l: MeshLink) =>
    distanceKm(l.coordinates[0], l.coordinates[l.coordinates.length - 1]);

  const applyLinkState = () => {
    if (!map || !ready) return;
    for (const [id, stale] of [
      ['mesh-links', false],
      ['mesh-links-stale', true],
    ] as const) {
      map.setFilter(id, linkFilter(stale, state) as maplibregl.FilterSpecification);
      for (const [prop, value] of Object.entries(linkPaint(stale, state))) {
        map.setPaintProperty(id, prop, value);
      }
    }
    const f = selectedLinkFilter(state.link) as maplibregl.FilterSpecification;
    map.setFilter('mesh-link-halo', f);
    map.setFilter('mesh-link-focus', f);

    // Neighbours this repeater was heard with get a label and a green ring.
    const linked = state.node
      ? linksOf(state.node).map((l) => (l.a === state.node ? l.b : l.a))
      : [];
    map.setFilter('mesh-neighbour-labels', [
      'all',
      ['!', ['get', 'inRegion']],
      ['in', ['get', 'publicKey'], ['literal', linked]],
    ] as maplibregl.FilterSpecification);
    map.setPaintProperty('mesh-neighbours', 'circle-stroke-color', [
      'case',
      ['in', ['get', 'publicKey'], ['literal', linked]],
      C.green,
      C.muted,
    ]);
    // The wider-mesh backdrop is context for a reader exploring on their own; while a
    // repeater's reach is on screen it would only bury it.
    const v = state.node ? 'none' : 'visible';
    map.setLayoutProperty('mesh-backdrop-links', 'visibility', v);
    map.setLayoutProperty('mesh-backdrop-nodes', 'visibility', v);
  };

  /**
   * Padding for a fit, leaving room for what is drawn OUTSIDE the points being fitted: the
   * corridor's labels run right of their dots, a selection's neighbour labels left of theirs,
   * and on a narrow map the docked card covers the bottom edge.
   */
  const padding = (selecting: boolean) => {
    const w = figureEl.clientWidth;
    const side = Math.min(140, Math.round(w * 0.22));
    const docked = selecting && w < DOCK_BELOW;
    return {
      top: FIT_PADDING,
      bottom: FIT_PADDING + (docked ? 170 : 0),
      left: selecting ? side : FIT_PADDING,
      right: side,
    };
  };

  /** Fit the selected repeater and everything it links to, or the corridor again. */
  const frame = (key: string | null) => {
    if (!map) return;
    let b: maplibregl.LngLatBounds | null = regionBounds;
    if (key) {
      const n = nodes.get(key);
      if (!n) return;
      b = new maplibregl.LngLatBounds([n.lng, n.lat], [n.lng, n.lat]);
      for (const l of linksOf(key)) for (const c of l.coordinates) b.extend(c as [number, number]);
    }
    if (b) map.fitBounds(b, { padding: padding(key != null), maxZoom: 11, duration: ease() });
  };

  const repeaterCard = (key: string) => {
    const row = rows.get(key);
    if (!row) return;
    const name = displayName(row.node.name);
    const pct = row.health?.percent;
    const links = linksOf(key);
    openCard(
      meshCard(
        esc(name),
        `Repeater · ${row.lastHeard ? `heard ${agoLabel(row.lastHeard, now)}` : 'never heard'}`,
        metric(String(row.degree), null, 'Links') +
          metric(
            row.farthestKm == null ? null : String(Math.round(row.farthestKm)),
            'km',
            'Farthest'
          ) +
          metric(pct == null ? null : String(Math.round(pct)), '%', 'Battery')
      ),
      'Repeater details',
      [row.node.lng, row.node.lat],
      false,
      links.map((l) => l.coordinates as [number, number][])
    );
  };

  const setSelected = (key: string | null, fromOutside = false) => {
    const next = key && rows.has(key) ? key : null;
    if (next === state.node && !state.link) return;
    const wasSelected = state.node != null;
    state.node = next;
    state.link = null;
    applyLinkState();
    syncPinState();
    setDistance(next);
    closeCard();
    if (next) {
      const n = rows.get(next)!;
      hint.innerHTML =
        `Map zoomed to fit ${esc(displayName(n.node.name))}'s ${n.degree} ${n.degree === 1 ? 'link' : 'links'}` +
        ` <span class="map-hint__soft">· Esc or click the map to return</span>`;
      hint.hidden = false;
      frame(next);
      // Open the card once the camera settles — where it can go depends on the new view. A
      // timer, not `moveend`: a fit that changes nothing may not move the camera at all.
      const at = ease();
      window.setTimeout(
        () => {
          if (state.node === next && !state.link) repeaterCard(next);
        },
        at ? at + 40 : 0
      );
    } else {
      hint.hidden = true;
      if (wasSelected) frame(null);
    }
    if (!fromOutside) opts.onSelectNode?.(next);
  };

  /** Label the selected repeater's farthest hop at its midpoint. */
  const setDistance = (key: string | null) => {
    const src = map?.getSource('mesh-distance') as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    const far = key ? linksOf(key).sort((a, b) => linkKm(b) - linkKm(a))[0] : null;
    if (!far) return src.setData(EMPTY);
    const a = far.coordinates[0];
    const z = far.coordinates[far.coordinates.length - 1];
    src.setData({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [(a[0] + z[0]) / 2, (a[1] + z[1]) / 2] },
          properties: { label: `${Math.round(linkKm(far))} km` },
        },
      ],
    });
  };

  /** Rings on the open link's two endpoints, so both ends of the hop are findable. */
  const setLinkEnds = (l: MeshLink | null) =>
    setData(
      'mesh-link-ends',
      l
        ? {
            type: 'FeatureCollection',
            features: [l.coordinates[0], l.coordinates[l.coordinates.length - 1]].map((c) => ({
              type: 'Feature' as const,
              geometry: { type: 'Point' as const, coordinates: c },
              properties: {},
            })),
          }
        : EMPTY
    );

  const linkCard = (l: MeshLink, at: [number, number]) => {
    state.link = l.id;
    applyLinkState();
    setLinkEnds(l);
    const span = MESH_WINDOW_DAYS[window_];
    const [a, b] = l.headline.split('↔').map((s) => s.trim());
    const title =
      a && b
        ? `${esc(a)} <span class="map-card__sep">&#8596;</span><br>${esc(b)}`
        : esc(l.headline || 'Observed link');
    openCard(
      meshCard(
        title,
        `Relay link · heard ${agoLabel(l.lastSeen, now)}`,
        metric(String(l.daysActive), `/${span}`, 'Days seen') +
          metric(compact(l.observations), null, 'Receptions') +
          metric(
            l.bestSnr == null ? null : l.bestSnr.toFixed(1),
            l.bestSnr == null ? null : 'dB',
            'Best SNR'
          )
      ),
      'Relay link details',
      at,
      true,
      [l.coordinates as [number, number][]]
    );
  };

  const neighbourCard = (key: string) => {
    const n = nodes.get(key);
    if (!n) return;
    const links = graph?.links.filter((l) => l.a === key || l.b === key) ?? [];
    const last = links.reduce((m, l) => Math.max(m, Date.parse(l.lastSeen) || 0), 0);
    openCard(
      meshCard(
        esc(displayName(n.name)),
        `Neighbour · ${last ? `heard ${agoLabel(new Date(last).toISOString(), now)}` : 'no links observed'}`,
        metric(String(links.length), null, 'Links') +
          metric(n.snr == null ? null : n.snr.toFixed(1), n.snr == null ? null : 'dB', 'Last SNR') +
          metric(String(n.gatewayCount), null, 'Gateways')
      ),
      'Neighbour details',
      [n.lng, n.lat],
      false,
      links.map((l) => l.coordinates as [number, number][])
    );
  };

  /** Esc, ×, or a click on empty map: close everything and return to the corridor. */
  const clearAll = () => {
    if (state.node) setSelected(null);
    else {
      state.link = null;
      applyLinkState();
      closeCard();
    }
  };

  // ---- data ----

  const setData = (id: string, data: GeoFC) =>
    (map?.getSource(id) as maplibregl.GeoJSONSource | undefined)?.setData(data);

  const applyGraph = () => {
    if (!map || !ready || !graph) return;
    rows = new Map(deriveNodeRows(graph, now).map((r) => [r.node.publicKey, r]));
    nodes = new Map(graph.nodes.map((n) => [n.publicKey, n]));
    const stale = new Set(deriveStaleRows(graph, now).map((r) => r.node.publicKey));
    setData('mesh-nodes', nodesToGeoJSON(graph.nodes) as unknown as GeoFC);
    setData('mesh-links', linksToGeoJSON(graph.links, now, stale) as unknown as GeoFC);
    syncPins();
    if (!regionBounds && rows.size) {
      const b = new maplibregl.LngLatBounds();
      for (const r of rows.values()) b.extend([r.node.lng, r.node.lat]);
      regionBounds = b;
      map.fitBounds(b, { padding: padding(false), maxZoom: 11, animate: false });
    }
    // A selection that came in before the map could take it (a shared ?node= link).
    if (pendingSelect !== undefined) {
      const key = pendingSelect;
      pendingSelect = undefined;
      setSelected(key, true);
    } else if (state.node) {
      // Refresh: keep the selection, re-derive its labels and distance from the new graph.
      applyLinkState();
      setDistance(state.node);
    }
  };

  // ---- layers + events ----

  function wire(m: maplibregl.Map) {
    m.on('error', () => {}); // swallow tile/style errors — never surface them
    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    m.touchZoomRotate?.disableRotation();

    // Settled signal for the deterministic screenshot harness.
    const root = document.documentElement;
    m.on('render', () => delete root.dataset.mapSettled);
    m.on('idle', () => (root.dataset.mapSettled = '1'));

    m.on('load', () => {
      decorateBasemap(m, C, opts.counties);

      // The wider mesh, lazily loaded on pan-out: context, never the subject.
      m.addSource('mesh-backdrop-links', { type: 'geojson', data: EMPTY });
      m.addLayer({
        id: 'mesh-backdrop-links',
        type: 'line',
        source: 'mesh-backdrop-links',
        paint: { 'line-color': C.muted, 'line-width': 0.6, 'line-opacity': 0.18 },
      });
      m.addSource('mesh-backdrop-nodes', { type: 'geojson', data: EMPTY });
      m.addLayer({
        id: 'mesh-backdrop-nodes',
        type: 'circle',
        source: 'mesh-backdrop-nodes',
        paint: { 'circle-radius': 1.6, 'circle-color': C.muted, 'circle-opacity': 0.35 },
      });

      m.addSource('mesh-links', { type: 'geojson', data: EMPTY, promoteId: 'id' });
      m.addLayer({
        id: 'mesh-links',
        type: 'line',
        source: 'mesh-links',
        filter: linkFilter(false, state) as maplibregl.FilterSpecification,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': C.green,
          ...(linkPaint(false, state) as Record<string, maplibregl.ExpressionSpecification>),
        },
      });
      m.addLayer({
        id: 'mesh-links-stale',
        type: 'line',
        source: 'mesh-links',
        filter: linkFilter(true, state) as maplibregl.FilterSpecification,
        paint: {
          'line-color': C.orange,
          'line-dasharray': [...STALE_STYLE.dash],
          ...(linkPaint(true, state) as Record<string, maplibregl.ExpressionSpecification>),
        },
      });
      // The open link, redrawn on top of everything: halo, then a solid line.
      m.addLayer({
        id: 'mesh-link-halo',
        type: 'line',
        source: 'mesh-links',
        filter: selectedLinkFilter(null) as maplibregl.FilterSpecification,
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': C.land, 'line-width': SELECTED_LINK.halo },
      });
      m.addLayer({
        id: 'mesh-link-focus',
        type: 'line',
        source: 'mesh-links',
        filter: selectedLinkFilter(null) as maplibregl.FilterSpecification,
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': C.green, 'line-width': SELECTED_LINK.line },
      });

      m.addSource('mesh-nodes', { type: 'geojson', data: EMPTY, promoteId: 'publicKey' });
      m.addLayer({
        id: 'mesh-neighbours',
        type: 'circle',
        source: 'mesh-nodes',
        filter: ['!', ['get', 'inRegion']] as maplibregl.FilterSpecification,
        paint: {
          'circle-radius': 2.5,
          'circle-color': C.land,
          'circle-stroke-color': C.muted,
          'circle-stroke-width': 1,
        },
      });
      m.addLayer({
        id: 'mesh-neighbour-labels',
        type: 'symbol',
        source: 'mesh-nodes',
        filter: ['in', ['get', 'publicKey'], ['literal', []]] as maplibregl.FilterSpecification,
        layout: {
          'text-field': ['upcase', ['get', 'shortName']],
          'text-font': ['Noto Sans Bold'],
          'text-size': 10,
          'text-letter-spacing': 0.11,
          'text-anchor': 'right',
          'text-offset': [-0.8, 0],
          'text-padding': 2,
        },
        paint: { 'text-color': C.ink, 'text-halo-color': C.land, 'text-halo-width': 1.6 },
      });
      m.addSource('mesh-link-ends', { type: 'geojson', data: EMPTY });
      m.addLayer({
        id: 'mesh-link-ends',
        type: 'circle',
        source: 'mesh-link-ends',
        paint: {
          'circle-radius': 8,
          'circle-opacity': 0,
          'circle-stroke-color': C.green,
          'circle-stroke-width': 2,
          'circle-stroke-opacity': 0.3,
        },
      });
      m.addSource('mesh-distance', { type: 'geojson', data: EMPTY });
      m.addLayer({
        id: 'mesh-distance',
        type: 'symbol',
        source: 'mesh-distance',
        layout: {
          'text-field': ['get', 'label'],
          'text-font': ['Noto Sans Regular'],
          'text-size': 12,
          'text-allow-overlap': true,
        },
        paint: { 'text-color': C.brassText, 'text-halo-color': C.land, 'text-halo-width': 2 },
      });

      ready = true;
      figureEl
        .querySelector<HTMLElement>('[data-mesh-fallback]')
        ?.style.setProperty('display', 'none');
      applyGraph();
      if (pendingBackdrop) applyBackdrop(pendingBackdrop.nodes, pendingBackdrop.links);
    });

    // A link click opens its card; a neighbour click opens the neighbour's.
    let featureClicked = false;
    m.on('click', 'mesh-neighbours', (e) => {
      const key = String(e.features?.[0]?.properties?.publicKey ?? '');
      if (!key) return;
      featureClicked = true;
      neighbourCard(key);
    });
    const onLink = (e: maplibregl.MapLayerMouseEvent) => {
      if (featureClicked) return;
      const id = String(e.features?.[0]?.properties?.id ?? '');
      const l = graph?.links.find((x) => x.id === id);
      if (!l) return;
      featureClicked = true;
      // Anchor on the link's midpoint, marked by a small hollow ring.
      const a = l.coordinates[0];
      const z = l.coordinates[l.coordinates.length - 1];
      linkCard(l, [(a[0] + z[0]) / 2, (a[1] + z[1]) / 2]);
    };
    for (const id of ['mesh-links', 'mesh-links-stale']) {
      m.on('click', id, onLink);
      let hoverId: string | number | undefined;
      m.on('mousemove', id, (e) => {
        m.getCanvas().style.cursor = 'pointer';
        const f = e.features?.[0];
        if (f?.id === hoverId) return;
        if (hoverId != null)
          m.setFeatureState({ source: 'mesh-links', id: hoverId }, { hover: false });
        hoverId = f?.id;
        if (hoverId != null)
          m.setFeatureState({ source: 'mesh-links', id: hoverId }, { hover: true });
      });
      m.on('mouseleave', id, () => {
        m.getCanvas().style.cursor = '';
        if (hoverId != null)
          m.setFeatureState({ source: 'mesh-links', id: hoverId }, { hover: false });
        hoverId = undefined;
      });
    }
    m.on('mouseenter', 'mesh-neighbours', () => (m.getCanvas().style.cursor = 'pointer'));
    m.on('mouseleave', 'mesh-neighbours', () => (m.getCanvas().style.cursor = ''));
    // Bare map: return to the corridor. Layer handlers fire before this one.
    m.on('click', () => {
      if (featureClicked) {
        featureClicked = false;
        return;
      }
      clearAll();
    });

    m.on('move', () => {
      card.place();
      layoutLabels();
    });
    m.on('moveend', () => {
      if (panOutFired || !panOutCb || !regionBounds || state.node) return;
      const view = m.getBounds();
      const outside =
        !view.contains(regionBounds.getNorthEast()) ||
        !view.contains(regionBounds.getSouthWest()) ||
        m.getZoom() < 8.5;
      if (!outside) return;
      panOutFired = true;
      panOutCb();
    });
  }

  const applyBackdrop = (n: MeshNode[], links: GeoFC) => {
    setData('mesh-backdrop-nodes', nodesToGeoJSON(n) as unknown as GeoFC);
    setData('mesh-backdrop-links', links);
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && (state.node || state.link)) clearAll();
  };
  window.addEventListener('keydown', onKeydown);
  const onResize = () => card.place();
  window.addEventListener('resize', onResize);

  return {
    setGraph(g, w, nowMs) {
      graph = g;
      window_ = w;
      now = nowMs;
      applyGraph();
    },
    setBackdrop(n, links) {
      const fc = links as unknown as GeoFC;
      if (ready) applyBackdrop(n, fc);
      else pendingBackdrop = { nodes: n, links: fc };
    },
    highlight(key) {
      setHovered(key);
      return hovered != null;
    },
    select(key) {
      if (!ready || !rows.size) {
        pendingSelect = key;
        return;
      }
      setSelected(key, true);
    },
    onPanOut(cb) {
      panOutCb = cb;
    },
    destroy() {
      destroyed = true;
      for (const marker of pins.values()) marker.remove();
      pins.clear();
      window.removeEventListener('keydown', onKeydown);
      window.removeEventListener('resize', onResize);
      card.destroy();
      map?.remove();
    },
  };
}
