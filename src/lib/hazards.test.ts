/**
 * Hazard-layer derivation tests (`bun test`). Pure functions, no network. Focused on
 * the data-honesty rules: out-of-area filtering, the life-safety-only banner, and
 * honest "unknown" when a source is unavailable.
 */
import { test, expect } from 'bun:test';
import {
  deriveStream,
  deriveSituationSummary,
  deriveBanner,
  fallbackHazards,
  type HazardsSnapshot,
  type HazardFeature,
} from './hazards';

const SEV = ['INFO', 'LOW', 'MODERATE', 'SEVERE', 'EXTREME'];

function snap(layers: Record<string, unknown>): HazardsSnapshot {
  return {
    fetchedAt: '',
    live: true,
    area: 'calaveras',
    situation: null,
    layers: layers as HazardsSnapshot['layers'],
    scanners: [],
  };
}
function fc(features: HazardFeature[], status = 'OK') {
  return {
    type: 'FeatureCollection' as const,
    features,
    metadata: { layer: 'x', area: 'calaveras', generated_at: '', source_status: status as 'OK' },
  };
}
function point(layer: string, rank: number, lng: number, lat: number, extra = {}): HazardFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      id: `${layer}-${rank}-${lng}`,
      layer,
      kind: layer,
      severity: SEV[rank],
      severity_rank: rank,
      headline: 'h',
      source: { id: 'x', name: 'X' },
      ...extra,
    },
  };
}
function banner(layer: string, extra = {}): HazardFeature {
  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [-120.4, 38.2],
          [-120.3, 38.2],
          [-120.3, 38.1],
          [-120.4, 38.1],
          [-120.4, 38.2],
        ],
      ],
    },
    properties: {
      id: layer,
      layer,
      kind: layer === 'wildfire' ? 'Wildfire' : 'Evacuation',
      severity: 'SEVERE',
      severity_rank: 3,
      headline: 'h',
      source: { id: 'x', name: 'X' },
      ...extra,
    },
  };
}

test('region-wide road incidents are filtered to the service area', () => {
  const inArea = point('road_incident', 2, -120.45, 38.14, { headline: 'In area' });
  const outArea = point('road_incident', 3, -120.95, 37.5, { headline: 'Turlock fire' });
  const stream = deriveStream(snap({ road_incident: fc([inArea, outArea]) }));
  expect(stream.map((f) => f.properties.headline)).toEqual(['In area']);
});

test('weather alerts outside the configured NWS zones are filtered out', () => {
  const inZone = point('weather_alert', 2, 0, 0, {
    headline: 'foothill',
    weather: { zones: ['CAZ069'] },
  });
  inZone.geometry = null;
  const outZone = point('weather_alert', 2, 0, 0, {
    headline: 'san diego',
    weather: { zones: ['CAZ065'] },
  });
  outZone.geometry = null;
  const stream = deriveStream(snap({ weather_alert: fc([inZone, outZone]) }));
  expect(stream.map((f) => f.properties.headline)).toEqual(['foothill']);
});

test('stream sorts most-severe first', () => {
  const s = snap({
    road_incident: fc([
      point('road_incident', 2, -120.45, 38.14, { headline: 'moderate' }),
      point('road_incident', 3, -120.45, 38.15, { headline: 'severe' }),
    ]),
  });
  expect(deriveStream(s)[0].properties.headline).toBe('severe');
});

test('banner does NOT fire for a road incident even at EXTREME, in-area', () => {
  // Life-safety bar is evacuation/wildfire only — road/weather severity never banners.
  const inExtreme = point('road_incident', 4, -120.45, 38.14, { headline: 'Report of Fire' });
  expect(deriveBanner(snap({ road_incident: fc([inExtreme]) })).active).toBe(false);
  const inSevere = point('road_incident', 3, -120.45, 38.14, { headline: 'Report of Fire' });
  expect(deriveBanner(snap({ road_incident: fc([inSevere]) })).active).toBe(false);
});

test('banner fires for an active wildfire', () => {
  const b = deriveBanner(
    snap({ wildfire: fc([banner('wildfire', { headline: 'Salt Springs Fire' })]) })
  );
  expect(b.active).toBe(true);
  expect(b.headline).toBe('Salt Springs Fire');
});

test('banner fires for an active evacuation and flags it', () => {
  const b = deriveBanner(
    snap({ evacuation: fc([banner('evacuation', { headline: 'Evac WARNING' })]) })
  );
  expect(b.active).toBe(true);
  expect(b.hasEvacuation).toBe(true);
});

test('evacuations are null (unknown) when the Cal OES source is unavailable', () => {
  const sum = deriveSituationSummary(snap({ evacuation: fc([], 'UNAVAILABLE') }));
  expect(sum.evacuations).toBeNull();
  expect(sum.evacuationStatus).toBe('UNAVAILABLE');
});

test('evacuations are 0 (not null) when Cal OES is healthy but empty', () => {
  // The no-data-vs-error split (CHANGELOG 2026-06-29): a confirmed-empty OK feed is a real 0.
  const sum = deriveSituationSummary(snap({ evacuation: fc([], 'OK') }));
  expect(sum.evacuations).toBe(0);
  expect(sum.evacuationStatus).toBe('OK');
});

test('wildfire & weather counts are null (unknown) when their source is unavailable', () => {
  const sum = deriveSituationSummary(
    snap({ wildfire: fc([], 'UNAVAILABLE'), weather_alert: fc([], 'UNAVAILABLE') })
  );
  expect(sum.wildfires).toBeNull();
  expect(sum.weatherAlerts).toBeNull();
  // …but a healthy empty layer is a real 0, never an implied all-clear from an outage.
  expect(deriveSituationSummary(snap({ wildfire: fc([], 'OK') })).wildfires).toBe(0);
});

test('fire-weather state normalizes hyphen/case to the canonical enum', () => {
  const fw = point('fire_weather', 3, 0, 0, { fire_weather: { state: 'red-flag' } });
  fw.geometry = null;
  expect(deriveSituationSummary(snap({ fire_weather: fc([fw]) })).fireWeather).toBe('RED_FLAG');
});

test('derivations never throw on an empty snapshot', () => {
  const empty = snap({});
  expect(() => deriveStream(empty)).not.toThrow();
  expect(() => deriveBanner(empty)).not.toThrow();
  expect(() => deriveSituationSummary(empty)).not.toThrow();
  expect(deriveBanner(empty).active).toBe(false);
});

test('the checked-in fallback hazards snapshot is well-formed', () => {
  expect(fallbackHazards.area).toBe('calaveras');
  expect(typeof fallbackHazards.layers).toBe('object');
});
