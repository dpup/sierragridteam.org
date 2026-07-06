/**
 * live-map.ts — the /live hazard map (MapLibre GL JS over CARTO Positron), extracted so
 * the client controller can (re)build and refresh it. CLIENT-ONLY: it imports maplibre,
 * so it must never be imported from Astro frontmatter — only from a browser `<script>`.
 *
 * `initHazardMap(figureEl, mapData)` builds the map and returns a handle whose
 * `update(mapData)` pushes fresh hazard GeoJSON onto the existing sources (the 90s live
 * refresh) without rebuilding the map. On any failure (no WebGL, blocked tiles) it
 * silently leaves the SSR fallback note in place — the hazards are always in the stream.
 *
 * Colors are read from the CSS tokens at runtime (tokens.css stays the source of truth);
 * MapLibre paint needs literal colors, so we can't hand it var(--…) directly.
 */
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { escapeHtml as esc } from './format';
import { wildfireTitle, wildfireStats, type LiveMapData } from './live-view';

type GeoFC = GeoJSON.FeatureCollection;

export interface MapHandle {
  update(data: LiveMapData): void;
  /** Highlight the on-map feature for a hazard id (null clears). Returns true if matched. */
  highlight(id: string | null): boolean;
}

const asFC = (data: LiveMapData, l: string): GeoFC =>
  (data.layers[l] as unknown as GeoFC) ?? { type: 'FeatureCollection', features: [] };

export function initHazardMap(figureEl: HTMLElement, mapData: LiveMapData): MapHandle | null {
  const canvas = figureEl.querySelector<HTMLElement>('[data-map-canvas]');
  if (!canvas) return null;

  // Pull design tokens so the map matches the site (tokens.css = source of truth).
  // The second arg to tok() is a last-resort literal used only if getComputedStyle can't
  // read the var (effectively never in a browser); each MIRRORS the value in tokens.css —
  // keep them in sync there, that file remains the canonical palette.
  const cs = getComputedStyle(document.documentElement);
  const tok = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
  const C = {
    green: tok('--brand-green', '#1d5b3f'),
    brass: tok('--brand-brass', '#b08a3e'),
    orange: tok('--signal-orange', '#c2410c'),
    surface: tok('--surface-page', '#f3efe4'),
    muted: tok('--ink-muted', '#6f6750'),
    orangeDeep: tok('--signal-orange-hover', '#9a330a'),
  };
  // severity_rank → color (orange reserved for SEVERE/EXTREME).
  const sevColor = [
    'case',
    ['>=', ['get', 'severity_rank'], 3],
    C.orange,
    ['==', ['get', 'severity_rank'], 2],
    C.brass,
    C.green,
  ] as unknown as maplibregl.ExpressionSpecification;

  // Hover highlight: the alert stream sets a feature's `hover` state (keyed by its `id`)
  // when the matching card is hovered/focused; these paint expressions react. Green is the
  // site's interactive accent (not a risk color). `promoteId: 'id'` on the sources below
  // makes properties.id the feature id so setFeatureState can address it.
  const onHover = (off: unknown, on: unknown) =>
    [
      'case',
      ['boolean', ['feature-state', 'hover'], false],
      on,
      off,
    ] as unknown as maplibregl.ExpressionSpecification;

  // source id → the hazard layer whose features it holds (for the id index + highlight).
  const HL_SOURCES: Record<string, string> = {
    wildfire: 'wildfire',
    evacuation: 'evacuation',
    earthquake: 'earthquake',
    incidents: 'road_incident',
  };
  let mappedIds = new Set<string>();
  const indexIds = (data: LiveMapData) => {
    const ids = new Set<string>();
    for (const layer of Object.values(HL_SOURCES)) {
      for (const f of asFC(data, layer).features) {
        const id = (f.properties as { id?: unknown } | null)?.id;
        if (id != null) ids.add(String(id));
      }
    }
    mappedIds = ids;
  };
  indexIds(mapData);

  let map: maplibregl.Map;
  try {
    map = new maplibregl.Map({
      container: canvas,
      style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
      bounds: [
        [mapData.bounds.minLng, mapData.bounds.minLat],
        [mapData.bounds.maxLng, mapData.bounds.maxLat],
      ],
      fitBoundsOptions: { padding: 36 },
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      cooperativeGestures: true,
    });
  } catch {
    return null; // no WebGL → keep the SSR fallback
  }
  map.on('error', () => {}); // swallow tile/style errors — never surface them
  // Settled signal for the deterministic screenshot harness: html[data-map-settled]
  // means the map has nothing left to render (set on idle, cleared by any render —
  // including resize repaints), so a capture never races a paint. Named to not collide
  // with the [data-live-map] figure hook in live.astro.
  const root = document.documentElement;
  map.on('render', () => {
    delete root.dataset.mapSettled;
  });
  map.on('idle', () => {
    root.dataset.mapSettled = '1';
  });
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.touchZoomRotate?.disableRotation();

  const popup = (e: maplibregl.MapLayerMouseEvent) => {
    const p = (e.features?.[0]?.properties ?? {}) as Record<string, unknown>;
    // MapLibre serializes object properties to JSON strings — parse defensively.
    const parseObj = <T>(v: unknown): T | undefined => {
      if (v && typeof v === 'object') return v as T;
      if (typeof v === 'string') {
        try {
          return JSON.parse(v) as T;
        } catch {
          return undefined;
        }
      }
      return undefined;
    };
    const src = parseObj<{ name?: string; url?: string }>(p.source);
    const wf = parseObj<{ acres?: number; containment?: number }>(p.wildfire);
    // Use the same title/stats derivation as the alert stream so a point fire reads
    // identically on both surfaces ("Owl Fire" + "120 acres · 30% contained").
    const title = wildfireTitle(String(p.headline || p.kind || p.name || ''), wf);
    const stats = wildfireStats(wf);
    const html =
      `<div class="map-pop">` +
      (p.severity ? `<span class="map-pop__sev">${esc(p.severity)}</span>` : '') +
      `<p class="map-pop__title">${esc(title)}</p>` +
      (p.area_label ? `<p class="map-pop__where">${esc(p.area_label)}</p>` : '') +
      (stats ? `<p class="map-pop__extra">${esc(stats)}</p>` : '') +
      (src?.name
        ? src.url
          ? `<p class="map-pop__src"><a href="${esc(src.url)}" target="_blank" rel="noopener external">${esc(src.name)}<span aria-hidden="true"> &#8599;</span></a></p>`
          : `<p class="map-pop__src">${esc(src.name)}</p>`
        : '') +
      `</div>`;
    new maplibregl.Popup({ closeButton: true, maxWidth: '260px' })
      .setLngLat(e.lngLat)
      .setHTML(html)
      .addTo(map);
  };
  const interactive = (id: string) => {
    map.on('click', id, popup);
    map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
    map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
  };

  map.on('load', () => {
    try {
      // Subtle town reference dots, under everything — small + muted so they orient
      // without competing with the hazards (the basemap labels the towns).
      map.addSource('towns', { type: 'geojson', data: mapData.towns as unknown as GeoFC });
      map.addLayer({
        id: 'towns',
        type: 'circle',
        source: 'towns',
        paint: {
          'circle-radius': 3,
          'circle-color': C.muted,
          'circle-opacity': 0.55,
          'circle-stroke-color': C.surface,
          'circle-stroke-width': 1,
          'circle-stroke-opacity': 0.6,
        },
      });

      // Wildfire (orange, solid) vs evacuation (deep red, dashed zone boundary) — distinct
      // so a fire perimeter and a "must-leave" zone never read as one thing.
      const polys: { l: string; color: string; width: number; dash: number[] | null }[] = [
        { l: 'wildfire', color: C.orange, width: 1.5, dash: null },
        { l: 'evacuation', color: C.orangeDeep, width: 2.5, dash: [2, 1.5] },
      ];
      for (const cfg of polys) {
        map.addSource(cfg.l, { type: 'geojson', data: asFC(mapData, cfg.l), promoteId: 'id' });
        map.addLayer({
          id: `${cfg.l}-fill`,
          type: 'fill',
          source: cfg.l,
          paint: { 'fill-color': cfg.color, 'fill-opacity': onHover(0.16, 0.34) },
        });
        map.addLayer({
          id: `${cfg.l}-line`,
          type: 'line',
          source: cfg.l,
          paint: {
            'line-color': cfg.color,
            'line-width': onHover(cfg.width, cfg.width * 2),
            ...(cfg.dash ? { 'line-dasharray': cfg.dash } : {}),
          },
        });
        interactive(`${cfg.l}-fill`);
      }

      // Earthquakes — hollow circles sized by magnitude.
      map.addSource('earthquake', {
        type: 'geojson',
        data: asFC(mapData, 'earthquake'),
        promoteId: 'id',
      });
      map.addLayer({
        id: 'earthquake',
        type: 'circle',
        source: 'earthquake',
        paint: {
          'circle-radius': [
            '+',
            4,
            ['*', 2, ['coalesce', ['get', 'magnitude'], 1]],
            ['case', ['boolean', ['feature-state', 'hover'], false], 3, 0],
          ] as unknown as maplibregl.ExpressionSpecification,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': onHover(sevColor, C.green),
          'circle-stroke-width': onHover(2, 3.5),
        },
      });
      interactive('earthquake');

      // Road incidents — filled severity circles, on top so accidents are most visible.
      map.addSource('incidents', {
        type: 'geojson',
        data: asFC(mapData, 'road_incident'),
        promoteId: 'id',
      });
      map.addLayer({
        id: 'incidents',
        type: 'circle',
        source: 'incidents',
        paint: {
          'circle-radius': onHover(6, 9),
          'circle-color': sevColor,
          'circle-stroke-color': onHover(C.surface, C.green),
          'circle-stroke-width': onHover(2, 3.5),
        },
      });
      interactive('incidents');

      // A wildfire with no mapped perimeter arrives as a Point — the fill/line layers above
      // draw nothing for it, so it would vanish from the map (it stays in the stream). Add a
      // solid orange marker for point-geometry fires, on top, so the headline hazard always
      // shows. Shares the 'wildfire' source, so the 90s refresh updates it too.
      map.addLayer({
        id: 'wildfire-point',
        type: 'circle',
        source: 'wildfire',
        filter: ['==', ['geometry-type'], 'Point'] as maplibregl.FilterSpecification,
        paint: {
          'circle-radius': onHover(8, 11),
          'circle-color': C.orange,
          'circle-opacity': 0.9,
          'circle-stroke-color': onHover(C.surface, C.green),
          'circle-stroke-width': onHover(2, 3.5),
        },
      });
      interactive('wildfire-point');

      // Only hide the fallback once every layer added cleanly.
      const fb = figureEl.querySelector<HTMLElement>('[data-map-fallback]');
      if (fb) fb.style.display = 'none';
    } catch {
      /* keep the SSR fallback note visible if layer setup fails */
    }
  });

  const setData = (id: string, data: GeoFC) => {
    const src = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
    if (src) src.setData(data);
  };

  const applyData = (data: LiveMapData) => {
    // Towns are static; refresh only the hazard sources (the 90s live poll).
    setData('wildfire', asFC(data, 'wildfire'));
    setData('evacuation', asFC(data, 'evacuation'));
    setData('earthquake', asFC(data, 'earthquake'));
    setData('incidents', asFC(data, 'road_incident'));
    indexIds(data);
  };

  // Drive the feature-state `hover` from the alert stream. Only ids actually present on the
  // map highlight; setFeatureState is applied across the hazard sources (only the one that
  // holds the id reacts) and guarded for a source that's mid-reload.
  let hoveredId: string | null = null;
  const setHover = (next: string | null): boolean => {
    const id = next && mappedIds.has(next) ? next : null;
    if (id !== hoveredId) {
      const flip = (fid: string | null, on: boolean) => {
        if (fid == null) return;
        for (const src of Object.keys(HL_SOURCES)) {
          if (!map.getSource(src)) continue;
          try {
            map.setFeatureState({ source: src, id: fid }, { hover: on });
          } catch {
            /* source mid-reload — ignore */
          }
        }
      };
      flip(hoveredId, false);
      hoveredId = id;
      flip(hoveredId, true);
    }
    return hoveredId != null;
  };

  return {
    update(data: LiveMapData) {
      // If a refresh lands while the style is (re)loading, don't drop it — apply the
      // latest data once the map next goes idle.
      if (map.isStyleLoaded()) applyData(data);
      else map.once('idle', () => applyData(data));
    },
    // Highlight the map feature for a hazard id (or clear with null). Returns whether an
    // on-map feature was matched, so the caller can mirror the active state on the card.
    highlight(id: string | null) {
      return setHover(id);
    },
  };
}
