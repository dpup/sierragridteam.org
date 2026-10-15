/**
 * mesh-basemap.ts — the /mesh map's basemap: OpenFreeMap Positron, restyled to match the
 * homepage hero's map (src/assets/hero-map.svg) so the two maps read as one place.
 *
 * PURE: takes the fetched Positron style document and returns a new one. No MapLibre import,
 * no DOM — `mesh-basemap.test.ts` validates the output against the real style spec, because
 * MapLibre drops an invalid layer or expression SILENTLY (see mesh-link-paint.ts).
 *
 * Rather than patch Positron's ~60 layers, this composes a short layer list of its own over
 * Positron's sources, glyphs and label expressions. Everything not listed is simply absent:
 * landuse, parks, buildings, POIs, rail, aeroways, hillshade, state and country lines.
 *
 *   • Land is the hero's map ground, water a pale green-grey, no water labels below z10.
 *   • State highways and motorways are knocked-out lines (no casing), 3.4px at z9–11 rising to
 *     5px at z13; secondary roads appear at z11, tertiary and minor at z12.
 *   • Route shields are pills (`ROUTE_PILL`, an image the map module draws at load).
 *   • County lines are warm hairlines; nothing above or below county level.
 *   • Place names are muted italics. The design asks for a serif italic; OpenFreeMap serves
 *     only Noto Sans glyphs, so Noto Sans Italic is the closest available face.
 *
 * Colours come in from the caller (read from tokens.css at runtime) — tokens stay the source
 * of truth, and MapLibre needs literal colours.
 */

/** The bits of a MapLibre style document this module reads or writes. */
export interface StyleDoc {
  version: 8;
  sources: Record<string, unknown>;
  layers: { id: string; type: string; layout?: Record<string, unknown> }[];
  glyphs?: string;
  sprite?: unknown;
  [k: string]: unknown;
}

export interface BasemapColors {
  land: string;
  water: string;
  road: string;
  countyLine: string;
  place: string;
  shieldText: string;
}

/** Image id for the route-shield pill. The map module draws it (it needs a canvas). */
export const ROUTE_PILL = 'mesh-route-pill';

/** Positron's place-name expression, so non-Latin names keep their fallback. */
const NAME = [
  'case',
  ['has', 'name:nonlatin'],
  ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']],
  ['coalesce', ['get', 'name_en'], ['get', 'name']],
];

const SOURCE = 'openmaptiles';
const isLine = ['match', ['geometry-type'], ['LineString', 'MultiLineString'], true, false];
const roadClass = (classes: string[]) => [
  'all',
  isLine,
  ['match', ['get', 'class'], classes, true, false],
];

/**
 * Build the /mesh basemap from Positron. Returns null when the input has no vector source to
 * draw from (the screenshot harness serves a background-only stub) — the caller then uses the
 * input as-is, so an offline map still loads.
 */
export function meshBasemapStyle(positron: StyleDoc, c: BasemapColors): StyleDoc | null {
  if (!positron?.sources?.[SOURCE]) return null;

  const layers: Record<string, unknown>[] = [
    { id: 'background', type: 'background', paint: { 'background-color': c.land } },
    {
      id: 'water',
      type: 'fill',
      source: SOURCE,
      'source-layer': 'water',
      filter: ['!=', ['get', 'brunnel'], 'tunnel'],
      paint: { 'fill-color': c.water },
    },
    {
      id: 'waterway',
      type: 'line',
      source: SOURCE,
      'source-layer': 'waterway',
      minzoom: 9,
      paint: { 'line-color': c.water, 'line-width': 1 },
    },
    {
      id: 'boundary-county',
      type: 'line',
      source: SOURCE,
      'source-layer': 'boundary',
      filter: ['all', ['==', ['get', 'admin_level'], 6], ['!=', ['get', 'maritime'], 1]],
      paint: { 'line-color': c.countyLine, 'line-width': 1 },
    },
    {
      id: 'road-minor',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 12,
      filter: roadClass(['tertiary', 'minor']),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.road, 'line-width': 1 },
    },
    {
      id: 'road-secondary',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 11,
      filter: roadClass(['secondary']),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': c.road, 'line-width': 1 },
    },
    {
      id: 'road-major',
      type: 'line',
      source: SOURCE,
      'source-layer': 'transportation',
      minzoom: 5,
      filter: roadClass(['motorway', 'trunk', 'primary']),
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': c.road,
        'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 9, 3.4, 11, 3.4, 13, 5],
      },
    },
    {
      id: 'water-label',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'water_name',
      minzoom: 10,
      layout: {
        'text-field': NAME,
        'text-font': ['Noto Sans Italic'],
        'text-size': 10,
        'text-max-width': 6,
      },
      paint: { 'text-color': c.place, 'text-halo-color': c.land, 'text-halo-width': 1.2 },
    },
    {
      id: 'route-shield',
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'transportation_name',
      minzoom: 8,
      filter: [
        'all',
        isLine,
        ['<=', ['get', 'ref_length'], 3],
        ['match', ['get', 'network'], ['us-interstate', 'us-highway', 'us-state'], true, false],
      ],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 420,
        'text-field': ['to-string', ['get', 'ref']],
        'text-font': ['Noto Sans Bold'],
        'text-size': 8,
        'text-rotation-alignment': 'viewport',
        'icon-image': ROUTE_PILL,
        'icon-text-fit': 'both',
        'icon-text-fit-padding': [2, 5, 2, 5],
        'icon-rotation-alignment': 'viewport',
      },
      paint: { 'text-color': c.shieldText },
    },
    // Place names: one muted italic, sized by the place's weight, never bolder than the mesh.
    ...(
      [
        ['place-city', 'city', 4, 11],
        ['place-town', 'town', 7, 11],
        ['place-village', 'village', 10, 10],
      ] as const
    ).map(([id, cls, minzoom, size]) => ({
      id,
      type: 'symbol',
      source: SOURCE,
      'source-layer': 'place',
      minzoom,
      filter: ['==', ['get', 'class'], cls],
      layout: {
        'text-field': NAME,
        'text-font': ['Noto Sans Italic'],
        'text-size': size,
        'text-max-width': 8,
      },
      paint: { 'text-color': c.place, 'text-halo-color': c.land, 'text-halo-width': 1.4 },
    })),
  ];

  return {
    version: 8,
    name: 'S.I.E.R.R.A mesh',
    sources: { [SOURCE]: positron.sources[SOURCE] },
    glyphs: positron.glyphs,
    // No sprite: every icon Positron's sprite provided belonged to a layer dropped above, and
    // the one image we use (the route pill) is drawn at runtime.
    layers: layers as StyleDoc['layers'],
  };
}
