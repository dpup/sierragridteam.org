/**
 * The /mesh basemap restyle, validated against the REAL MapLibre style spec. MapLibre skips
 * an invalid layer silently — the basemap would simply be missing its roads or its county
 * lines, which reads as "the map is sparse here" rather than as a bug.
 */
import { test, expect } from 'bun:test';
import { validateStyleMin } from '@maplibre/maplibre-gl-style-spec';
import { meshBasemapStyle, ROUTE_PILL, type StyleDoc } from './mesh-basemap';

/** Positron's shape, minus the 60 layers the restyle throws away anyway. */
const POSITRON: StyleDoc = {
  version: 8,
  sources: {
    openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
    ne2_shaded: { type: 'raster', url: 'https://tiles.openfreemap.org/natural_earth/ne2sr' },
  },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sprite: 'https://tiles.openfreemap.org/sprites/ofm_f384/ofm',
  layers: [
    { id: 'background', type: 'background' },
    { id: 'building', type: 'fill' },
  ],
};

const COLORS = {
  land: '#edefe7',
  water: '#dde3da',
  road: '#f8f6ef',
  countyLine: '#c9c1a9',
  place: '#9a906f',
  shieldText: '#7d7459',
};

test('the restyled basemap is a valid MapLibre style', () => {
  const style = meshBasemapStyle(POSITRON, COLORS)!;
  const errors = validateStyleMin(style as never);
  expect(errors.map((e) => e.message)).toEqual([]);
});

test('it keeps only the ground, water, roads, county lines and place names', () => {
  const ids = meshBasemapStyle(POSITRON, COLORS)!.layers.map((l) => l.id);
  expect(ids).toContain('road-major');
  expect(ids).toContain('boundary-county');
  expect(ids).toContain('place-town');
  // Landuse, buildings, hillshade and the rest are simply never carried over.
  expect(ids).not.toContain('building');
  expect(Object.keys(meshBasemapStyle(POSITRON, COLORS)!.sources)).toEqual(['openmaptiles']);
});

test('only glyph faces OpenFreeMap actually serves are requested', () => {
  // A font stack the server does not have 404s, and MapLibre then draws no text at all.
  const served = new Set(['Noto Sans Regular', 'Noto Sans Italic', 'Noto Sans Bold']);
  for (const l of meshBasemapStyle(POSITRON, COLORS)!.layers) {
    for (const f of (l.layout?.['text-font'] as string[] | undefined) ?? []) {
      expect(served.has(f)).toBe(true);
    }
  }
});

test('route shields use the runtime-drawn pill, since the sprite is dropped', () => {
  const style = meshBasemapStyle(POSITRON, COLORS)!;
  expect(style.sprite).toBeUndefined();
  const shield = style.layers.find((l) => l.id === 'route-shield');
  expect(shield?.layout?.['icon-image']).toBe(ROUTE_PILL);
});

test('a stub style with no vector source (the offline harness) is left alone', () => {
  const stub = { version: 8, sources: {}, layers: [{ id: 'bg', type: 'background' }] } as StyleDoc;
  expect(meshBasemapStyle(stub, COLORS)).toBeNull();
});
