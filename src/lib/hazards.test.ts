/**
 * Hazard-layer derivation tests (`bun test`). Pure functions, no network. Focused on
 * the data-honesty rules: out-of-area filtering, the life-safety-only banner, and
 * honest "unknown" when a source is unavailable.
 */
import { test, expect } from 'bun:test';
import {
  deriveStream,
  deriveSituationSummary,
  deriveActiveAlertsTile,
  type HazardsSnapshot,
  type HazardFeature,
} from './hazards';
import hazardsFixture from '../data/hazards-snapshot.json';

const SEV = ['INFO', 'LOW', 'MODERATE', 'SEVERE', 'EXTREME'];

function snap(layers: Record<string, unknown>): HazardsSnapshot {
  return {
    fetchedAt: '',
    area: 'ebbetts-pass',
    situation: null,
    layers: layers as HazardsSnapshot['layers'],
    scanners: [],
  };
}
function fc(features: HazardFeature[], status = 'OK') {
  return {
    type: 'FeatureCollection' as const,
    features,
    metadata: { layer: 'x', area: 'ebbetts-pass', generated_at: '', source_status: status as 'OK' },
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

test('active-alerts tile aggregates wildfire + evac + weather (homepage ⇄ /live agree)', () => {
  // The reported bug: 2 wildfires + 2 evac zones active, yet the homepage read "no alerts"
  // because it only counted weather alerts. The aggregate must reflect all three.
  const s = snap({
    wildfire: fc([point('wildfire', 3, -120.4, 38.2), point('wildfire', 3, -120.5, 38.1)]),
    evacuation: fc([point('evacuation', 3, -120.4, 38.2), point('evacuation', 3, -120.45, 38.15)]),
    weather_alert: fc([], 'OK'),
  });
  const tile = deriveActiveAlertsTile(deriveSituationSummary(s));
  expect(tile.value).toBe('4 Active');
  expect(tile.state).toBe('alarm'); // a life-safety hazard is present → sanctioned orange
});

test('weather-only alerts read as elevated, not the life-safety orange', () => {
  const wa = point('weather_alert', 2, 0, 0, {
    headline: 'Wind Advisory',
    weather: { zones: ['CAZ069'] },
  });
  wa.geometry = null;
  const s = snap({ wildfire: fc([], 'OK'), evacuation: fc([], 'OK'), weather_alert: fc([wa]) });
  const tile = deriveActiveAlertsTile(deriveSituationSummary(s));
  expect(tile.value).toBe('1 Active');
  expect(tile.state).toBe('elevated');
});

test('a confirmed-empty situation is a real "None", an outage is "Unknown" (never all-clear)', () => {
  const empty = snap({
    wildfire: fc([], 'OK'),
    evacuation: fc([], 'OK'),
    weather_alert: fc([], 'OK'),
  });
  expect(deriveActiveAlertsTile(deriveSituationSummary(empty))).toEqual({
    value: 'None',
    state: 'ok',
  });

  // Cal OES down while the rest are quiet: we can't assert no orders → "Unknown", not "None".
  const outage = snap({
    wildfire: fc([], 'OK'),
    evacuation: fc([], 'UNAVAILABLE'),
    weather_alert: fc([], 'OK'),
  });
  expect(deriveActiveAlertsTile(deriveSituationSummary(outage))).toEqual({
    value: 'Unknown',
    state: 'muted',
  });
});

test('a known active hazard still shows even when another layer is down', () => {
  const s = snap({
    wildfire: fc([point('wildfire', 3, -120.4, 38.2)]),
    evacuation: fc([], 'OK'),
    weather_alert: fc([], 'UNAVAILABLE'), // unknown, but we already know a fire is active
  });
  const tile = deriveActiveAlertsTile(deriveSituationSummary(s));
  expect(tile.value).toBe('1 Active');
  expect(tile.state).toBe('alarm');
});

test('derivations never throw on an empty snapshot', () => {
  const empty = snap({});
  expect(() => deriveStream(empty)).not.toThrow();
  expect(() => deriveSituationSummary(empty)).not.toThrow();
  expect(deriveStream(empty)).toEqual([]);
});

test('the checked-in hazards snapshot fixture is well-formed (harness mocks use it)', () => {
  expect(hazardsFixture.area).toBe('ebbetts-pass');
  expect(typeof hazardsFixture.layers).toBe('object');
});
