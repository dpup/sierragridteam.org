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
    const src = parseObj<{ name?: string }>(p.source);
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
      (src?.name ? `<p class="map-pop__src">${esc(src.name)}</p>` : '') +
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
        map.addSource(cfg.l, { type: 'geojson', data: asFC(mapData, cfg.l) });
        map.addLayer({
          id: `${cfg.l}-fill`,
          type: 'fill',
          source: cfg.l,
          paint: { 'fill-color': cfg.color, 'fill-opacity': 0.16 },
        });
        map.addLayer({
          id: `${cfg.l}-line`,
          type: 'line',
          source: cfg.l,
          paint: {
            'line-color': cfg.color,
            'line-width': cfg.width,
            ...(cfg.dash ? { 'line-dasharray': cfg.dash } : {}),
          },
        });
        interactive(`${cfg.l}-fill`);
      }

      // Earthquakes — hollow circles sized by magnitude.
      map.addSource('earthquake', { type: 'geojson', data: asFC(mapData, 'earthquake') });
      map.addLayer({
        id: 'earthquake',
        type: 'circle',
        source: 'earthquake',
        paint: {
          'circle-radius': [
            '+',
            4,
            ['*', 2, ['coalesce', ['get', 'magnitude'], 1]],
          ] as unknown as maplibregl.ExpressionSpecification,
          'circle-color': 'rgba(0,0,0,0)',
          'circle-stroke-color': sevColor,
          'circle-stroke-width': 2,
        },
      });
      interactive('earthquake');

      // Road incidents — filled severity circles, on top so accidents are most visible.
      map.addSource('incidents', { type: 'geojson', data: asFC(mapData, 'road_incident') });
      map.addLayer({
        id: 'incidents',
        type: 'circle',
        source: 'incidents',
        paint: {
          'circle-radius': 6,
          'circle-color': sevColor,
          'circle-stroke-color': C.surface,
          'circle-stroke-width': 2,
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
          'circle-radius': 8,
          'circle-color': C.orange,
          'circle-opacity': 0.9,
          'circle-stroke-color': C.surface,
          'circle-stroke-width': 2,
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
  };

  return {
    update(data: LiveMapData) {
      // If a refresh lands while the style is (re)loading, don't drop it — apply the
      // latest data once the map next goes idle.
      if (map.isStyleLoaded()) applyData(data);
      else map.once('idle', () => applyData(data));
    },
  };
}
