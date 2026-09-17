/**
 * mesh-map.ts — the /mesh topology map (MapLibre GL JS over OpenFreeMap Positron).
 * CLIENT-ONLY: it imports maplibre, so it must never be imported from Astro frontmatter —
 * only from a browser `<script>`.
 *
 * What the map says, visually:
 *
 *   • **The corridor is the subject.** S.I.E.R.R.A's Ebbetts Pass repeaters draw at full
 *     strength in brand green, ours ringed in brass. One-hop neighbours out in the wider
 *     mesh draw as small hollow muted circles — present, clearly secondary.
 *   • **Links out of the corridor are hidden until a repeater is selected.** There are twice
 *     as many of them as corridor links and they run an order of magnitude further, so
 *     drawing them all at once buried the subject — dimming them was not enough. Selecting a
 *     repeater (on the map or in the panel roster) reveals exactly its own outward links and
 *     frames its reach, which turns the clutter into an answer to "what does this one reach?"
 *   • **Links carry recency twice.** Each edge's tier (`live`/`recent`/`fading`/`cold`,
 *     derived in mesh.ts) sets a static opacity + width AND the rate of a travelling dash
 *     that runs along it. A reader who can't perceive the motion — or who has reduced
 *     motion on, which switches the dash off entirely — still reads freshness from the
 *     static treatment alone. Width also encodes reception count, so a backbone link is
 *     visibly heavier than a lucky one-shot.
 *   • **A dim edge is never "down".** Every edge keeps a solid base line under the dash, so
 *     a link is continuously drawn and the pulse reads as traffic on it, not as the link
 *     blinking in and out. On a mesh where a repeater adverts every 12 hours, quiet is not
 *     gone (docs/content-style-guide.md §10).
 *   • **The wider mesh is a backdrop.** Panning out past the corridor lazily loads the whole
 *     observed graph as static muted hairlines — context for scale, never the subject, and
 *     never animated.
 *
 * Colors are read from the CSS tokens at runtime (tokens.css stays the source of truth);
 * MapLibre paint needs literal colors, so we can't hand it var(--…) directly. Orange is
 * absent by construction — the mesh is not a risk state (CLAUDE.md rule 2).
 */
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { BASEMAP_STYLE } from './basemap';
import { escapeHtml as esc } from './format';
import {
  agoLabel,
  displayName,
  linkRecency,
  nodeTypeLabel,
  MESH_WINDOW_DAYS,
  RECENCY_TIERS,
  type MeshGraph,
  type MeshNode,
  type MeshRecency,
  type MeshWindow,
} from './mesh';
import { linksToGeoJSON, nodesToGeoJSON } from './mesh';
import { linkFilter, linkPaint, TIER_STYLE } from './mesh-link-paint';
import { HEARD_IN_OPTIONS, type MeshHeardIn } from './mesh';

type GeoFC = GeoJSON.FeatureCollection;

export interface MeshMapHandle {
  /** Push a fresh region graph onto the existing sources (the live refresh). */
  setGraph(graph: MeshGraph, window: MeshWindow, nowMs: number): void;
  /** Push the lazily-loaded whole-mesh backdrop. Safe to call once; later calls replace it. */
  setBackdrop(nodes: MeshNode[], links: ReturnType<typeof linksToGeoJSON>): void;
  /** Highlight a node by pubkey (null clears). Returns true if the node is on the map. */
  highlight(key: string | null): boolean;
  /**
   * Select a node (null clears). Selection is what reveals that node's links out of the
   * corridor — they are hidden otherwise. Distinct from `highlight`, which is transient
   * hover feedback.
   */
  select(key: string | null): void;
  /** Fly to a node and open its popup. */
  focus(key: string): void;
  /** Narrow which recency tiers are drawn. Display only — nothing is refetched. */
  setHeardIn(next: MeshHeardIn): void;
  /** Frame the in-region nodes again. */
  resetView(): void;
  /** Called when the viewport moves past the corridor — the cue to lazy-load the backdrop. */
  onPanOut(cb: () => void): void;
  destroy(): void;
}

/**
 * Per-tier link treatment. `opacity` is the static read; `stepMs` is how fast
 * the travelling dash advances (smaller = livelier). Ordered live → cold.
 */

/**
 * The classic MapLibre "marching ants" sequence: `line-dasharray` is a paint property and
 * is NOT data-driven, so a travelling dash is done by cycling a precomputed set of dash
 * patterns on one layer per tier. That is FOUR paint updates per step for the whole graph —
 * it does not scale with link count, which is what keeps this cheap on a phone.
 */
const DASH_SEQUENCE: [number, number, number?, number?][] = [
  [0, 4, 3],
  [0.5, 4, 2.5],
  [1, 4, 2],
  [1.5, 4, 1.5],
  [2, 4, 1],
  [2.5, 4, 0.5],
  [3, 4, 0],
  [0, 0.5, 3, 3.5],
  [0, 1, 3, 3],
  [0, 1.5, 3, 2.5],
  [0, 2, 3, 2],
  [0, 2.5, 3, 1.5],
  [0, 3, 3, 1],
  [0, 3.5, 3, 0.5],
];

const EMPTY: GeoFC = { type: 'FeatureCollection', features: [] };

export interface MeshMapOptions {
  /** Initial framing when there are no in-region nodes yet. */
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  /** Fired when a node or link popup wants the panel to follow along. */
  onSelectNode?: (key: string | null) => void;
}

export function initMeshMap(figureEl: HTMLElement, opts: MeshMapOptions): MeshMapHandle | null {
  const canvas = figureEl.querySelector<HTMLElement>('[data-mesh-canvas]');
  if (!canvas) return null;

  // Pull design tokens so the map matches the site (tokens.css = source of truth). The
  // second arg to tok() is a last-resort literal used only if getComputedStyle can't read
  // the var (effectively never in a browser); each MIRRORS the value in tokens.css — keep
  // them in sync there, that file remains the canonical palette.
  const cs = getComputedStyle(document.documentElement);
  const tok = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
  const C = {
    green: tok('--brand-green', '#1d5b3f'),
    greenDeep: tok('--brand-green-hover', '#16472f'),
    brass: tok('--brand-brass', '#b08a3e'),
    surface: tok('--surface-page', '#f3efe4'),
    ink: tok('--ink-strong', '#16271e'),
    muted: tok('--ink-muted', '#6f6750'),
  };

  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  let map: maplibregl.Map;
  try {
    map = new maplibregl.Map({
      container: canvas,
      style: BASEMAP_STYLE,
      bounds: [
        [opts.bounds.minLng, opts.bounds.minLat],
        [opts.bounds.maxLng, opts.bounds.maxLat],
      ],
      fitBoundsOptions: { padding: 48 },
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: true,
    });
  } catch {
    return null; // no WebGL → keep the fallback note + the roster in the panel
  }
  map.on('error', () => {}); // swallow tile/style errors — never surface them
  // Bottom-right, not top-right: the panel's collapse toggle floats over the map's top-right
  // corner and would sit on top of the zoom buttons.
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
  map.touchZoomRotate?.disableRotation();

  // Settled signal for the deterministic screenshot harness: html[data-map-settled] means
  // the map has nothing left to render, so a capture never races a paint. Shared with the
  // /live map — only one map exists per page.
  const root = document.documentElement;
  map.on('render', () => {
    delete root.dataset.mapSettled;
  });
  map.on('idle', () => {
    root.dataset.mapSettled = '1';
  });

  let nodeKeys = new Set<string>();
  let regionBounds: maplibregl.LngLatBounds | null = null;

  /**
   * The selected node, and the filter that gates the link layers on it.
   *
   * Links that leave the corridor are HIDDEN by default. There are roughly twice as many of
   * them as corridor links and they are an order of magnitude longer, so drawing them all at
   * once buried the thing the page is about under a starburst — dimming them was not enough.
   * Selecting a repeater reveals exactly its own outward links, which turns the clutter into
   * an answer to a question: "what does this one reach?"
   *
   * Corridor-internal links are always drawn; selection only ever ADDS.
   */
  /**
   * The selected node. It gates BOTH which links are drawn (`linkFilter`) and how strongly
   * (`linkPaint`) — see src/lib/mesh-link-paint.ts, where those expressions live so they can
   * be unit-tested against the real style spec.
   */
  let selectedKey: string | null = null;

  /**
   * The map's "heard in" cut. It maps exactly onto the recency tiers the layers are already
   * split by — 1h is `live`, 6h adds `recent`, 24h adds `fading`, 30d is everything — so
   * narrowing it is a visibility toggle, not a refetch and not a second filter expression.
   *
   * This is NOT the window picker `MESH_WINDOW` deliberately refuses. That one would change
   * what is FETCHED and let a reader silently narrow the data behind every count on the
   * page. This changes only what is DRAWN, leaves every figure alone, and defaults to 30d,
   * so the page still opens on everything it knows.
   */
  let heardIn: MeshHeardIn = '30d';
  const visibleTiers = () => RECENCY_TIERS.slice(0, HEARD_IN_OPTIONS.indexOf(heardIn) + 1);
  const applyHeardIn = () => {
    if (!ready) return;
    const shown = new Set<string>(visibleTiers());
    for (const tier of RECENCY_TIERS) {
      const v = shown.has(tier) ? 'visible' : 'none';
      for (const id of [`mesh-link-${tier}`, `mesh-pulse-${tier}`]) {
        try {
          map.setLayoutProperty(id, 'visibility', v);
        } catch {
          /* layer not up yet — applied again on the next setGraph */
        }
      }
    }
  };

  const expr = (e: unknown) => e as maplibregl.ExpressionSpecification;
  const onHover = (off: unknown, on: unknown) =>
    expr(['case', ['boolean', ['feature-state', 'hover'], false], on, off]);
  /** Emphasis that persists while a node is selected, not just while hovered. */
  const onActive = (off: unknown, on: unknown) =>
    expr([
      'case',
      [
        'any',
        ['boolean', ['feature-state', 'hover'], false],
        ['boolean', ['feature-state', 'selected'], false],
      ],
      on,
      off,
    ]);

  const filterFor = (tier: MeshRecency) =>
    linkFilter(tier, selectedKey) as maplibregl.FilterSpecification;
  // `line-width` is now a plain number (every link is one pixel), so the paint values are
  // no longer all expressions.
  type PaintValues = Record<string, maplibregl.ExpressionSpecification | number>;
  const paintFor = (tier: MeshRecency) =>
    linkPaint(tier, selectedKey) as unknown as { base: PaintValues; pulse: PaintValues };

  // ---- popups ----

  /**
   * The "anchored strip" popover. One at a time — MapLibre happily stacks a new Popup on
   * every click, which left several overlapping panels fighting for the same corner.
   *
   * Structure is fixed: header (title + kicker + close) / three-column metric row /
   * standing footnote, hairline-separated. The metric row is ALWAYS three cells — an
   * unavailable metric renders an em dash and keeps its label rather than collapsing the
   * grid, so the card's shape doesn't shift with the data.
   *
   * MapLibre's own close button is off; ours lives inside the header where the spec puts
   * it, and is deliberately not the highest-contrast thing in the card.
   */
  let openPopup: maplibregl.Popup | null = null;

  const closePopup = () => {
    openPopup?.remove();
    openPopup = null;
  };

  const showPopup = (lngLat: maplibregl.LngLatLike, html: string, label: string) => {
    closePopup();
    openPopup = new maplibregl.Popup({
      closeButton: false,
      closeOnMove: false, // stays anchored to its feature through a pan or zoom
      maxWidth: '296px',
      className: 'mesh-pop-wrap',
      // Sits up and to the right of the feature, and flips near a viewport edge — the
      // offset has to be given per anchor or a flipped card lands on the wrong side.
      offset: {
        bottom: [8, -12],
        'bottom-left': [8, -12],
        'bottom-right': [-8, -12],
        top: [8, 12],
        'top-left': [8, 12],
        'top-right': [-8, 12],
        left: [12, 0],
        right: [-12, 0],
        center: [0, 0],
      },
    })
      .setLngLat(lngLat)
      .setHTML(html)
      .addTo(map);
    openPopup.on('close', () => {
      openPopup = null;
    });

    const el = openPopup.getElement()?.querySelector<HTMLElement>('.mesh-pop');
    el?.setAttribute('role', 'dialog');
    el?.setAttribute('aria-label', label);
    // Focus lands on the card, with the close button as the first tab stop.
    el?.querySelector<HTMLButtonElement>('[data-pop-close]')?.addEventListener('click', () => {
      closePopup();
      map.getCanvas().focus();
    });
    el?.focus();
  };

  /** One metric cell. A null value renders an em dash — never a fabricated number. */
  const metric = (value: string | null, unit: string | null, label: string) =>
    `<div class="mesh-pop__metric">` +
    `<p class="mesh-pop__value">` +
    (value == null
      ? `<span class="mesh-pop__na">&#8212;</span>`
      : esc(value) + (unit ? `<span class="mesh-pop__unit">${esc(unit)}</span>` : '')) +
    `</p>` +
    `<p class="mesh-pop__metriclabel">${esc(label)}</p>` +
    `</div>`;

  /** Receptions above four digits abbreviate rather than wrap or shrink the type. */
  const compactCount = (n: number): string =>
    n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  const popShell = (title: string, kicker: string, metrics: string, footnote: string) =>
    `<div class="mesh-pop" tabindex="-1">` +
    `<div class="mesh-pop__head">` +
    `<div>` +
    `<p class="mesh-pop__title">${title}</p>` +
    `<p class="mesh-pop__kicker">${esc(kicker)}</p>` +
    `</div>` +
    `<button type="button" class="mesh-pop__close" data-pop-close aria-label="Close">` +
    `<span aria-hidden="true">&#215;</span></button>` +
    `</div>` +
    `<div class="mesh-pop__metrics">${metrics}</div>` +
    `<p class="mesh-pop__foot">${esc(footnote)}</p>` +
    `</div>`;

  let currentWindow: MeshWindow = '72h';
  let now = Date.now();

  /** `A ↔ B` with the arrow set apart so it recedes behind the two place names. */
  const pairTitle = (headline: string) => {
    const parts = headline.split('↔');
    return parts.length === 2
      ? `${esc(parts[0].trim())}<span class="mesh-pop__sep"> &#8596; </span>${esc(parts[1].trim())}`
      : esc(headline);
  };

  const linkPopup = (e: maplibregl.MapLayerMouseEvent) => {
    const p = (e.features?.[0]?.properties ?? {}) as Record<string, unknown>;
    const tier = String(p.recency || 'cold') as MeshRecency;
    const headline = String(p.headline || 'Observed link');
    const days = Number(p.daysActive);
    const span = MESH_WINDOW_DAYS[currentWindow];
    const snr = p.bestSnr == null ? null : Number(p.bestSnr);
    const html = popShell(
      pairTitle(headline),
      `Relay link \u00b7 heard ${agoLabel(String(p.lastSeen || ''), now)}`,
      metric(Number.isFinite(days) ? String(days) : null, `/${span}`, 'Days seen') +
        metric(compactCount(Number(p.observations) || 0), null, 'Receptions') +
        metric(snr == null ? null : snr.toFixed(1), snr == null ? null : 'dB', 'Best SNR'),
      tierNote(tier)
    );
    showPopup(e.lngLat, html, `Relay link details: ${headline}`);
    clickedFeature = true;
  };

  /**
   * The node card, for a NEIGHBOUR dot only.
   *
   * A corridor pin no longer opens one: it has a roster row, and clicking the pin now does
   * exactly what clicking that row does — select, frame, emphasise its links, and expand the
   * row's reading inline. Two detail surfaces for the same repeater meant the card and the
   * row showed different subsets of the same facts, and the card covered the map it had just
   * flown to. A neighbour has no roster row, so the card remains the only way to see it.
   *
   * Reads the CURRENT graph rather than the feature properties, so a card opened after a
   * refresh shows refreshed numbers and doesn't close over stale data.
   */
  const showNodeCard = (key: string, at: [number, number]) => {
    const n = currentNodes.get(key);
    if (!n) return;
    let degree = 0;
    let heard = 0;
    for (const l of currentLinks) {
      if (l.a !== key && l.b !== key) continue;
      degree++;
      const t = Date.parse(l.lastSeen);
      if (Number.isFinite(t) && t > heard) heard = t;
    }
    const name = displayName(n.name);
    const heardIso = heard ? new Date(heard).toISOString() : null;
    const html = popShell(
      esc(name),
      `${n.inRegion ? 'Corridor node' : 'Neighbouring node'} \u00b7 ` +
        (heardIso ? `heard ${agoLabel(heardIso, now)}` : 'no links observed'),
      metric(String(degree), null, 'Links') +
        metric(n.snr == null ? null : n.snr.toFixed(1), n.snr == null ? null : 'dB', 'Last SNR') +
        metric(String(n.gatewayCount), null, 'Gateways'),
      n.ours
        ? 'Signal is last-heard, not a live reading.'
        : 'Run by another operator, not by S.I.E.R.R.A.'
    );
    showPopup(at, html, `Node details: ${name}`);
    clickedFeature = true;
    setSelected(key);
  };

  /** A neighbour dot. Same toggle as a corridor pin, and its card closes with it. */
  const toggleNodeCard = (key: string, at: [number, number]) => {
    clickedFeature = true;
    if (selectedKey === key) {
      closePopup();
      setSelected(null);
      return;
    }
    showNodeCard(key, at);
  };

  const nodePopup = (e: maplibregl.MapLayerMouseEvent) => {
    const p = (e.features?.[0]?.properties ?? {}) as Record<string, unknown>;
    const key = String(p.publicKey || '');
    const at = (e.features?.[0]?.geometry as GeoJSON.Point)?.coordinates as [number, number];
    if (key && at) toggleNodeCard(key, at);
  };

  const interactive = (id: string, handler: (e: maplibregl.MapLayerMouseEvent) => void) => {
    map.on('click', id, handler);
    map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
  };

  // ---- layer construction ----

  let ready = false;

  map.on('load', () => {
    try {
      // 1. The whole-mesh backdrop, lazily filled. Bottom of the stack, static, muted —
      //    context for scale. Never animated: the corridor is the subject.
      map.addSource('mesh-backdrop-links', { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'mesh-backdrop-links',
        type: 'line',
        source: 'mesh-backdrop-links',
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': C.muted, 'line-width': 0.6, 'line-opacity': 0.2 },
      });
      map.addSource('mesh-backdrop-nodes', { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'mesh-backdrop-nodes',
        type: 'circle',
        source: 'mesh-backdrop-nodes',
        paint: { 'circle-radius': 1.8, 'circle-color': C.muted, 'circle-opacity': 0.4 },
      });

      // 2. Region links — a solid base per tier so an edge is ALWAYS continuously drawn…
      map.addSource('mesh-links', { type: 'geojson', data: EMPTY, promoteId: 'id' });
      for (const tier of RECENCY_TIERS) {
        map.addLayer({
          id: `mesh-link-${tier}`,
          type: 'line',
          source: 'mesh-links',
          filter: filterFor(tier),
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': onHover(C.green, C.greenDeep),
            ...paintFor(tier).base,
            // Half the tier's opacity: enough that the gaps between the pulse's dashes still
            // read as a continuous link (a link that appeared to break into dashes would
            // read as intermittent, which is a claim we're not making), light enough that
            // the deep-green dash on top clearly stands off it.
          },
        });
        // …and a brighter travelling dash ON TOP of it. This is the "alive" layer: the
        // dash advances, the base never does, so the link reads as carrying traffic
        // rather than flickering. Switched off wholesale under reduced motion.
        map.addLayer({
          id: `mesh-pulse-${tier}`,
          type: 'line',
          source: 'mesh-links',
          filter: filterFor(tier),
          layout: { 'line-cap': 'butt', 'line-join': 'round' },
          paint: {
            // The dash was drawn in the same green as the base at HALF its opacity, so the
            // thing that moves was paler than the thing it moved along — barely perceptible.
            // Inverted: the base is a light wire, the travelling dash is the deep green at
            // full tier opacity. Contrast now carries the motion.
            'line-color': C.greenDeep,
            ...paintFor(tier).pulse,
            'line-dasharray': [0, 4, 3],
          },
        });
        interactive(`mesh-link-${tier}`, linkPopup);
      }

      map.addSource('mesh-nodes', { type: 'geojson', data: EMPTY, promoteId: 'publicKey' });

      // 3. Neighbours — small hollow muted circles. Visibly present, visibly secondary.
      map.addLayer({
        id: 'mesh-node-neighbour',
        type: 'circle',
        source: 'mesh-nodes',
        filter: ['!', ['get', 'inRegion']] as maplibregl.FilterSpecification,
        paint: {
          'circle-radius': onActive(3.5, 5.5),
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': onActive(C.muted, C.green),
          'circle-stroke-width': onActive(1.25, 2.5),
          'circle-opacity': 1,
        },
      });

      // 4. Corridor nodes are NOT drawn here — they are DOM pins (see `syncPins`), so each
      //    carries a persistent name + status label and is a real, keyboard-reachable
      //    <button>. That removes the node popup entirely, which is what stopped several
      //    popups stacking up on top of each other.

      // 5. Neighbour labels only once you zoom in, so the wide view stays legible.
      map.addLayer({
        id: 'mesh-node-label-neighbour',
        type: 'symbol',
        source: 'mesh-nodes',
        minzoom: 10,
        filter: ['!', ['get', 'inRegion']] as maplibregl.FilterSpecification,
        layout: {
          'text-field': [
            'get',
            'shortName',
          ] as maplibregl.DataDrivenPropertyValueSpecification<string>,
          'text-font': ['Noto Sans Regular'],
          'text-size': 10,
          'text-offset': [0, 1],
          'text-anchor': 'top',
          'text-allow-overlap': false,
          'text-padding': 4,
        },
        paint: {
          'text-color': C.muted,
          'text-halo-color': C.surface,
          'text-halo-width': 1.2,
        },
      });

      interactive('mesh-node-neighbour', nodePopup);

      ready = true;
      // A setHeardIn() that arrived before the layers existed is replayed here.
      applyHeardIn();
      if (pending) applyGraph(pending.graph, pending.window, pending.now);
      if (pendingBackdrop) applyBackdrop(pendingBackdrop.nodes, pendingBackdrop.links);

      const fb = figureEl.querySelector<HTMLElement>('[data-mesh-fallback]');
      if (fb) fb.style.display = 'none';
    } catch {
      /* keep the fallback note visible if layer setup fails — the roster still renders */
    }
  });

  // ---- the pulse loop ----

  // One rAF loop drives all four tiers. Each tier keeps its own accumulator so the live
  // tier marches ~8× faster than the cold one — that speed difference IS the recency
  // encoding, on top of the static opacity/width. Paused when the tab is hidden or the
  // map scrolls out of view; never started at all under prefers-reduced-motion.
  let raf = 0;
  let lastFrame = 0;
  const acc: Record<MeshRecency, number> = { live: 0, recent: 0, fading: 0, cold: 0 };
  const step: Record<MeshRecency, number> = { live: 0, recent: 0, fading: 0, cold: 0 };
  let visible = true;

  const frame = (t: number) => {
    raf = requestAnimationFrame(frame);
    const dt = lastFrame ? t - lastFrame : 0;
    lastFrame = t;
    if (!ready || dt <= 0) return;
    for (const tier of RECENCY_TIERS) {
      acc[tier] += dt;
      const ms = TIER_STYLE[tier].stepMs;
      if (acc[tier] < ms) continue;
      acc[tier] %= ms;
      step[tier] = (step[tier] + 1) % DASH_SEQUENCE.length;
      try {
        map.setPaintProperty(`mesh-pulse-${tier}`, 'line-dasharray', DASH_SEQUENCE[step[tier]]);
      } catch {
        /* layer not up yet, or style reloading — next frame will catch it */
      }
    }
  };

  const stopPulse = () => {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    lastFrame = 0;
  };

  const startPulse = () => {
    if (raf || reduceMotion?.matches || !visible || document.hidden) return;
    raf = requestAnimationFrame(frame);
  };

  /**
   * Under reduced motion the dash must not just freeze mid-pattern — a half-drawn dash
   * would read as a broken link. Collapse the pulse layers to a continuous line so the
   * static opacity/width encoding carries the whole message.
   */
  const settleForReducedMotion = () => {
    stopPulse();
    for (const tier of RECENCY_TIERS) {
      try {
        map.setPaintProperty(`mesh-pulse-${tier}`, 'line-dasharray', [1, 0]);
      } catch {
        /* not up yet */
      }
    }
  };

  const onMotionChange = () => (reduceMotion?.matches ? settleForReducedMotion() : startPulse());
  reduceMotion?.addEventListener?.('change', onMotionChange);

  const onVisibility = () => (document.hidden ? stopPulse() : startPulse());
  document.addEventListener('visibilitychange', onVisibility);

  // Don't burn frames on a map scrolled off screen (the panel below it is long on mobile).
  const io = new IntersectionObserver(
    ([entry]) => {
      visible = entry.isIntersecting;
      visible ? startPulse() : stopPulse();
    },
    { threshold: 0 }
  );
  io.observe(figureEl);

  map.on('load', () => (reduceMotion?.matches ? settleForReducedMotion() : startPulse()));

  // ---- data application ----

  let pending: { graph: MeshGraph; window: MeshWindow; now: number } | null = null;
  let pendingBackdrop: { nodes: MeshNode[]; links: GeoFC } | null = null;

  const setData = (id: string, data: GeoFC) => {
    const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
  };

  let currentLinks: MeshGraph['links'] = [];
  let currentNodes = new Map<string, MeshNode>();

  /**
   * Corridor repeaters are rendered as DOM pins rather than a circle layer: a coordinate
   * anchor plus a PERSISTENT label carrying the node's name and its current status. The map
   * then answers "which repeater is that, and is it live?" without a click — which is what
   * let the node popup go away, and with it the stack of popups fighting for space.
   *
   * Only the ~10 corridor nodes get pins. Neighbours and the whole-mesh backdrop stay cheap
   * circle layers: they are context, they have no labels to show, and there can be hundreds.
   *
   * Each pin is a real <button>, so the map's own markers are keyboard-reachable and
   * screen-reader labelled — the circle layer never was.
   */
  const pins = new Map<string, maplibregl.Marker>();

  const syncPins = (graph: MeshGraph, nowMs: number) => {
    const degree = new Map<string, number>();
    const lastHeard = new Map<string, number>();
    for (const l of graph.links) {
      const t = Date.parse(l.lastSeen);
      for (const k of [l.a, l.b]) {
        degree.set(k, (degree.get(k) ?? 0) + 1);
        if (Number.isFinite(t) && t > (lastHeard.get(k) ?? 0)) lastHeard.set(k, t);
      }
    }

    const wanted = new Set<string>();
    for (const n of graph.nodes) {
      if (!n.inRegion) continue;
      wanted.add(n.publicKey);
      const name = displayName(n.name);
      const deg = degree.get(n.publicKey) ?? 0;
      const heard = lastHeard.get(n.publicKey) ?? 0;
      const heardIso = heard ? new Date(heard).toISOString() : null;
      const tier = heardIso ? linkRecency(heardIso, nowMs) : null;
      const stat = heardIso
        ? `${deg} ${deg === 1 ? 'link' : 'links'} · ${agoLabel(heardIso, nowMs)}`
        : 'No links observed';

      let marker = pins.get(n.publicKey);
      let el: HTMLElement | undefined = marker?.getElement();
      if (!marker) {
        const btn = document.createElement('button');
        btn.type = 'button';
        el = btn;
        el.className = 'mesh-pin';
        // Addressable by node, like the roster's rows — the pin and the row are two views
        // of one repeater, and the tests assert they behave identically.
        el.dataset.pinKey = n.publicKey;
        el.innerHTML =
          `<span class="mesh-pin__dot" aria-hidden="true"></span>` +
          `<span class="mesh-pin__label">` +
          `<strong data-pin-name></strong><small data-pin-stat></small>` +
          `</span>`;
        // Identical to a roster-row click — `onSelectNode` carries it back to the panel,
        // which expands the row and scrolls it into view.
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          clickedFeature = true;
          closePopup();
          // Toggles, exactly like its roster row: a second click on the open repeater clears
          // the selection. Without this the only way to let go of a repeater was to find a
          // bare patch of map or press Escape, neither of which the pin suggests.
          if (selectedKey === n.publicKey) {
            setSelected(null);
            return;
          }
          setSelected(n.publicKey);
          // Framing only on the way IN — re-fitting the map as the selection clears would
          // move the ground under a reader who just let go of it.
          focusNode(n.publicKey);
        });
        el.addEventListener('mouseenter', () => setHovered(n.publicKey));
        el.addEventListener('mouseleave', () => setHovered(null));
        el.addEventListener('focus', () => setHovered(n.publicKey));
        el.addEventListener('blur', () => setHovered(null));
        marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([n.lng, n.lat])
          .addTo(map);
        pins.set(n.publicKey, marker);
      } else {
        marker.setLngLat([n.lng, n.lat]);
      }

      if (!el) continue;
      el.querySelector('[data-pin-name]')!.textContent = name;
      el.querySelector('[data-pin-stat]')!.textContent = stat;
      el.setAttribute('aria-label', `${name}. ${nodeTypeLabel(n.nodeType)}. ${stat}.`);
      el.classList.toggle('mesh-pin--ours', n.ours);
      el.classList.toggle('mesh-pin--other', !n.ours);
      for (const t of RECENCY_TIERS) el.classList.toggle(`mesh-pin--${t}`, tier === t);
      el.classList.toggle('mesh-pin--quiet', tier === null);
      el.classList.toggle('mesh-pin--selected', selectedKey === n.publicKey);
    }

    for (const [key, marker] of pins) {
      if (wanted.has(key)) continue;
      marker.remove();
      pins.delete(key);
    }
  };

  /** Reflect the current hover/selection onto the pins (they are DOM, not feature-state). */
  const syncPinState = () => {
    for (const [key, marker] of pins) {
      const el = marker.getElement();
      el.classList.toggle('mesh-pin--selected', key === selectedKey);
      el.classList.toggle('mesh-pin--hover', key === hovered);
    }
  };

  function applyGraph(graph: MeshGraph, window: MeshWindow, nowMs: number) {
    currentLinks = graph.links;
    currentNodes = new Map(graph.nodes.map((n) => [n.publicKey, n]));
    currentWindow = window;
    now = nowMs;
    // `shortName` (the label text) is baked in by nodesToGeoJSON via displayName().
    setData('mesh-nodes', nodesToGeoJSON(graph.nodes) as unknown as GeoFC);
    syncPins(graph, nowMs);
    setData('mesh-links', linksToGeoJSON(graph.links, nowMs) as unknown as GeoFC);
    nodeKeys = new Set(graph.nodes.map((n) => n.publicKey));

    // Frame on the corridor, not the whole subgraph — the neighbours are meant to be found
    // by panning out, which is also what triggers the whole-mesh backdrop load.
    const region = graph.nodes.filter((n) => n.inRegion);
    if (region.length && !regionBounds) {
      const b = new maplibregl.LngLatBounds();
      for (const n of region) b.extend([n.lng, n.lat]);
      regionBounds = b;
      map.fitBounds(b, { padding: 64, maxZoom: 11, animate: false });
    }
  }

  function applyBackdrop(nodes: MeshNode[], links: GeoFC) {
    setData('mesh-backdrop-nodes', nodesToGeoJSON(nodes) as unknown as GeoFC);
    setData('mesh-backdrop-links', links);
  }

  // ---- pan-out detection (the lazy-load cue) ----

  let panOutCb: (() => void) | null = null;
  let panOutFired = false;
  const checkPanOut = () => {
    if (panOutFired || !panOutCb || !regionBounds) return;
    // Fire once the viewport has grown to hold appreciably more than the corridor — either
    // the reader zoomed out past it, or panned somewhere else entirely.
    const view = map.getBounds();
    const outside =
      !view.contains(regionBounds.getNorthEast()) ||
      !view.contains(regionBounds.getSouthWest()) ||
      map.getZoom() < 8.5;
    if (!outside) return;
    panOutFired = true;
    panOutCb();
  };
  map.on('moveend', checkPanOut);

  // ---- hover highlight + selection, driven from the map and the panel roster ----

  let hovered: string | null = null;
  const setHovered = (next: string | null) => {
    const key = next && nodeKeys.has(next) ? next : null;
    if (key === hovered) return;
    flip(hovered, false);
    hovered = key;
    flip(hovered, true);
    syncPinState();
  };
  const flip = (key: string | null, on: boolean, prop: 'hover' | 'selected' = 'hover') => {
    if (!key || !map.getSource('mesh-nodes')) return;
    try {
      map.setFeatureState({ source: 'mesh-nodes', id: key }, { [prop]: on });
    } catch {
      /* source mid-reload — ignore */
    }
  };

  const applySelection = () => {
    if (!ready) return;
    for (const tier of RECENCY_TIERS) {
      try {
        map.setFilter(`mesh-link-${tier}`, filterFor(tier));
        map.setFilter(`mesh-pulse-${tier}`, filterFor(tier));
        // Re-bake the paint: the emphasis lives in the expressions, not in feature state,
        // because it depends on BOTH endpoints rather than on one hovered feature.
        const paint = paintFor(tier);
        for (const [prop, value] of Object.entries(paint.base)) {
          map.setPaintProperty(`mesh-link-${tier}`, prop, value);
        }
        for (const [prop, value] of Object.entries(paint.pulse)) {
          map.setPaintProperty(`mesh-pulse-${tier}`, prop, value);
        }
      } catch {
        /* layer not up yet — the initial filter + paint already match selectedKey */
      }
    }
  };

  /**
   * How far past the corridor a selection is allowed to pull the view, as a fraction of the
   * corridor's own span on each axis. A repeater's links routinely reach the Central Valley
   * and occasionally the Bay Area; fitting to all of them zoomed out until the corridor —
   * the subject of the page — was a smudge, and the foothills were unreadable.
   *
   * So the frame is clamped: endpoints beyond this box don't pull the view. Those links are
   * still DRAWN and still emphasised, they simply run off the edge, which is the honest
   * picture of a long-haul shot. Pan or zoom out to follow one.
   */
  const FOCUS_MARGIN = 0.6;

  /** The box a selection may frame within — the corridor, grown by FOCUS_MARGIN. */
  const focusLimit = (): maplibregl.LngLatBounds => {
    // regionBounds is the repeaters we actually drew; opts.bounds is the configured service
    // area, which is the only thing we have before the first graph lands.
    const b =
      regionBounds ??
      new maplibregl.LngLatBounds(
        [opts.bounds.minLng, opts.bounds.minLat],
        [opts.bounds.maxLng, opts.bounds.maxLat]
      );
    const sw = b.getSouthWest();
    const ne = b.getNorthEast();
    const padLng = Math.max((ne.lng - sw.lng) * FOCUS_MARGIN, 0.05);
    const padLat = Math.max((ne.lat - sw.lat) * FOCUS_MARGIN, 0.05);
    return new maplibregl.LngLatBounds(
      [sw.lng - padLng, sw.lat - padLat],
      [ne.lng + padLng, ne.lat + padLat]
    );
  };

  /**
   * Frame the node AND everything it links to WITHIN the corridor's neighbourhood. Selecting
   * a repeater is asking "what does this reach?" — zooming in on the marker answers the
   * opposite question — but fitting to its furthest hop answers a question about the Bay
   * Area. maxZoom keeps a corridor-only repeater from filling the screen with one street.
   */
  const focusNode = (key: string) => {
    const src = map.getSource('mesh-nodes') as maplibregl.GeoJSONSource | undefined;
    if (!src || !nodeKeys.has(key)) return;
    const f = (src.serialize?.().data as GeoFC | undefined)?.features?.find(
      (x) => (x.properties as { publicKey?: string } | null)?.publicKey === key
    );
    const c = (f?.geometry as GeoJSON.Point | undefined)?.coordinates as
      | [number, number]
      | undefined;
    if (!c) return;
    const limit = focusLimit();
    const b = new maplibregl.LngLatBounds(c, c);
    for (const l of currentLinks) {
      if (l.a !== key && l.b !== key) continue;
      for (const coord of l.coordinates) {
        const [lng, lat] = coord as [number, number];
        if (limit.contains([lng, lat])) b.extend([lng, lat]);
      }
    }
    map.fitBounds(b, { padding: 72, maxZoom: 11, duration: 700 });
  };

  const setSelected = (next: string | null) => {
    const key = next && nodeKeys.has(next) ? next : null;
    if (key === selectedKey) return;
    flip(selectedKey, false, 'selected');
    selectedKey = key;
    flip(selectedKey, true, 'selected');
    applySelection();
    syncPinState();
    opts.onSelectNode?.(selectedKey);
  };

  // Clicking bare map (or pressing Escape) clears the selection, which puts the outward
  // links away again. The node/link layers stop propagation implicitly by being handled
  // first — MapLibre fires layer handlers before the generic map click.
  let clickedFeature = false;
  map.on('click', () => {
    if (clickedFeature) {
      clickedFeature = false;
      return;
    }
    setSelected(null);
    closePopup();
  });
  const onKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    setSelected(null);
    closePopup();
  };
  window.addEventListener('keydown', onKeydown);

  return {
    setGraph(graph, window, nowMs) {
      if (ready && map.isStyleLoaded()) applyGraph(graph, window, nowMs);
      else pending = { graph, window, now: nowMs };
    },
    setBackdrop(nodes, links) {
      const fc = links as unknown as GeoFC;
      if (ready && map.isStyleLoaded()) applyBackdrop(nodes, fc);
      else pendingBackdrop = { nodes, links: fc };
    },
    highlight(key) {
      setHovered(key);
      return hovered != null;
    },
    select(key) {
      setSelected(key);
    },
    setHeardIn(next) {
      heardIn = next;
      applyHeardIn();
    },
    focus(key) {
      focusNode(key);
    },
    resetView() {
      if (regionBounds) map.fitBounds(regionBounds, { padding: 64, maxZoom: 11 });
    },
    onPanOut(cb) {
      panOutCb = cb;
    },
    destroy() {
      for (const marker of pins.values()) marker.remove();
      pins.clear();
      stopPulse();
      io.disconnect();
      window.removeEventListener('keydown', onKeydown);
      document.removeEventListener('visibilitychange', onVisibility);
      reduceMotion?.removeEventListener?.('change', onMotionChange);
      map.remove();
    },
  };
}

/** The one-line honesty note in a link popup — what the tier does and does NOT claim. */
function tierNote(tier: MeshRecency): string {
  return tier === 'live' || tier === 'recent'
    ? 'Observed relay traffic, not a routing table.'
    : 'Quiet, not confirmed down — repeaters advert on their own schedule.';
}
