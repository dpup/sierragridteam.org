/**
 * Hazard-layer derivation tests (`bun test`). Pure functions, no network. Focused on
 * the data-honesty rules: the life-safety-only banner and honest "unknown" when a source is
 * unavailable. (Service-area / zone filtering is now the Grid's job — the place feed is
 * polygon-scoped server-side — so there is no client-side filter left to test.)
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

const SEV = ['INFO', 'MINOR', 'MODERATE', 'SEVERE', 'EXTREME'];

function snap(layers: Record<string, unknown>): HazardsSnapshot {
  return {
    fetchedAt: '',
    area: 'ebbetts-pass',
    summary: null,
    layers: layers as HazardsSnapshot['layers'],
    scanners: [],
  };
}
function fc(features: HazardFeature[], status = 'OK') {
  return {
    type: 'FeatureCollection' as const,
    features,
    metadata: { layer: 'x', area: 'ebbetts-pass', generatedAt: '', sourceStatus: status as 'OK' },
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
      severityRank: rank,
      headline: 'h',
      source: { id: 'x', name: 'X' },
      ...extra,
    },
  };
}

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
  const fw = point('fire_weather', 3, 0, 0, { fireWeather: { state: 'red-flag' } });
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

// A fixed clock for the upcoming-alert tests: an alert is "not started" relative to one.
const NOW = Date.parse('2026-08-13T05:30:00Z'); // 22:30 PT the evening before

test('a SCHEDULED weather alert counts as upcoming, not as in effect', () => {
  // Grid CHANGELOG 2026-08-11: effective/expires now carry the hazard's onset/ends, so a
  // watch issued today for Thursday's storms arrives SCHEDULED instead of ACTIVE.
  const watch = point('weather_alert', 2, 0, 0, {
    headline: 'Fire Weather Watch — thunderstorms and strong outflow winds',
    status: 'SCHEDULED',
    effective: '2026-08-13T12:00:00Z',
  });
  const warning = point('weather_alert', 2, 0, 1, { headline: 'Wind Advisory', status: 'ACTIVE' });

  const both = deriveSituationSummary(snap({ weather_alert: fc([watch, warning]) }), NOW);
  expect(both.weatherAlerts).toBe(1);
  expect(both.weatherAlertsUpcoming).toBe(1);

  // A watch on its own is not an active alert — and the homepage tile must not call it one.
  const soon = snap({
    wildfire: fc([], 'OK'),
    evacuation: fc([], 'OK'),
    weather_alert: fc([watch]),
  });
  const sum = deriveSituationSummary(soon, NOW);
  expect(sum.weatherAlerts).toBe(0);
  expect(sum.weatherAlertsUpcoming).toBe(1);
  expect(deriveActiveAlertsTile(sum).value).toBe('None');
});

test('a map-layer alert with NO status falls back to the onset', () => {
  // The shape the map layers actually serve: `/events` carries status: SCHEDULED, but
  // `/places/{area}/map/weather_alert.geojson` omits `status` entirely (verified live
  // 2026-08-13). Keying on status alone made this read "1 Active" for a Red Flag Warning
  // that hadn't started — the exact mislabel the split exists to prevent.
  const noStatus = (effective: string) =>
    point('weather_alert', 3, 0, 0, {
      headline: 'Red Flag Warning — thunderstorms and strong outflow winds',
      effective,
      expires: '2026-08-14T04:00:00Z',
    });

  const ahead = deriveSituationSummary(
    snap({ weather_alert: fc([noStatus('2026-08-13T12:00:00Z')]) }), // 6.5h out
    NOW
  );
  expect(ahead.weatherAlerts).toBe(0);
  expect(ahead.weatherAlertsUpcoming).toBe(1);

  // Once onset passes, the same record is in force — no status field involved either way.
  const started = deriveSituationSummary(
    snap({ weather_alert: fc([noStatus('2026-08-13T00:00:00Z')]) }),
    NOW
  );
  expect(started.weatherAlerts).toBe(1);
  expect(started.weatherAlertsUpcoming).toBe(0);

  // No onset published at all → we can't claim it hasn't started. In force, not upcoming.
  const undated = deriveSituationSummary(
    snap({ weather_alert: fc([point('weather_alert', 2, 0, 0, { headline: 'Wind Advisory' })]) }),
    NOW
  );
  expect(undated.weatherAlerts).toBe(1);
  expect(undated.weatherAlertsUpcoming).toBe(0);
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
