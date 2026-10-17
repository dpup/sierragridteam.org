/**
 * map-ground.ts — the runtime half of the basemap both maps share (/live hazards, /mesh
 * topology): read the palette from the CSS tokens, fetch Positron and restyle it
 * (`basemap-style.ts`, the pure, tested half), then add what only a live map can — the
 * route-shield pill image and the Calaveras/Tuolumne tint. CLIENT-ONLY: imports maplibre.
 *
 * Both maps call these so they stand on the same ground; neither builds its own.
 */
import type maplibregl from 'maplibre-gl';
import { BASEMAP_STYLE } from './basemap';
import { restyleBasemap, ROUTE_PILL, type StyleDoc } from './basemap-style';

type GeoFC = GeoJSON.FeatureCollection;

/**
 * The map palette, read from tokens.css at runtime (MapLibre paint needs literal colours).
 * Each fallback is a last resort used only if the var can't be read, and mirrors tokens.css,
 * which stays the canonical palette.
 */
export function mapColors() {
  const cs = getComputedStyle(document.documentElement);
  const tok = (n: string, fb: string) => cs.getPropertyValue(n).trim() || fb;
  return {
    green: tok('--brand-green', '#1d5b3f'),
    brass: tok('--brand-brass', '#b08a3e'),
    brassText: tok('--brand-brass-text', '#785d20'),
    orange: tok('--signal-orange', '#c2410c'),
    orangeDeep: tok('--signal-orange-hover', '#9a330a'),
    land: tok('--surface-hero', '#edefe7'),
    ink: tok('--ink-strong', '#16271e'),
    muted: tok('--ink-muted', '#6f6750'),
    water: tok('--map-water', '#dde3da'),
    road: tok('--map-road', '#f8f6ef'),
    roadCasing: tok('--map-road-casing', '#ddd4bd'),
    countyLine: tok('--map-county-line', '#c9c1a9'),
    place: tok('--map-place', '#9a906f'),
    shieldLine: tok('--map-shield-line', '#d3c9ad'),
    shieldText: tok('--map-shield-text', '#7d7459'),
  };
}
export type MapColors = ReturnType<typeof mapColors>;

/**
 * The restyled basemap, or plain ground in the land colour when Positron can't be fetched —
 * the overlays still draw, which is better than no map. Never throws.
 */
export async function loadBasemapStyle(
  C: MapColors
): Promise<maplibregl.StyleSpecification | StyleDoc> {
  try {
    const res = await fetch(BASEMAP_STYLE);
    const positron = (await res.json()) as StyleDoc;
    return restyleBasemap(positron, C) ?? positron;
  } catch {
    return {
      version: 8,
      sources: {},
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': C.land } }],
    };
  }
}

/** The route-shield pill: a stretchable rounded rect, drawn once into an image. */
function addRoutePill(m: maplibregl.Map, C: MapColors) {
  const r = 2; // device pixel ratio for crisp edges
  const w = 24 * r;
  const h = 14 * r;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return;
  g.fillStyle = C.road;
  g.strokeStyle = C.shieldLine;
  g.lineWidth = r;
  g.beginPath();
  g.roundRect(r / 2, r / 2, w - r, h - r, (h - r) / 2);
  g.fill();
  g.stroke();
  m.addImage(ROUTE_PILL, g.getImageData(0, 0, w, h), {
    pixelRatio: r,
    stretchX: [[h / 2, w - h / 2]],
    stretchY: [[h / 2 - 1, h / 2 + 1]],
    content: [h / 2, 2 * r, w - h / 2, h - 2 * r],
  });
}

/**
 * Call on the map's `load`: the shield pill, and the two service counties tinted under the
 * county lines (src/assets/service-counties.json, written by `npm run hero-map`) — Calaveras
 * green, Tuolumne brass, as on the hero map.
 */
export function decorateBasemap(m: maplibregl.Map, C: MapColors, counties: GeoFC) {
  try {
    addRoutePill(m, C);
  } catch {
    /* shields fall back to bare numbers */
  }
  m.addSource('service-area', { type: 'geojson', data: counties });
  m.addLayer(
    {
      id: 'service-tint',
      type: 'fill',
      source: 'service-area',
      paint: {
        'fill-color': ['match', ['get', 'county'], 'tuolumne', C.brass, C.green],
        'fill-opacity': ['match', ['get', 'county'], 'tuolumne', 0.12, 0.075],
      },
    },
    m.getLayer('boundary-county') ? 'boundary-county' : undefined
  );
}
