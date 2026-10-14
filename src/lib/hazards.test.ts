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
  pspsBannerEvent,
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

test('`status` is the authority: SCHEDULED is upcoming, and it wins over the timestamps', () => {
  // The normal path. Grid CHANGELOG 2026-08-11: effective/expires carry the hazard's
  // onset/ends, and status is SCHEDULED until onset.
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
    power: fc([], 'OK'),
  });
  const sum = deriveSituationSummary(soon, NOW);
  expect(sum.weatherAlerts).toBe(0);
  expect(sum.weatherAlertsUpcoming).toBe(1);
  expect(deriveActiveAlertsTile(sum).value).toBe('None');

  // status beats the timestamps when they disagree — The Grid computes it, we don't
  // second-guess it. An onset in the future does NOT make an ACTIVE record upcoming.
  const disagreeing = point('weather_alert', 2, 0, 2, {
    headline: 'Wind Advisory',
    status: 'ACTIVE',
    effective: '2026-08-13T12:00:00Z', // still ahead of NOW
  });
  const trusted = deriveSituationSummary(snap({ weather_alert: fc([disagreeing]) }), NOW);
  expect(trusted.weatherAlerts).toBe(1);
  expect(trusted.weatherAlertsUpcoming).toBe(0);
});

test('degrades to the onset when a layer serves no status at all', () => {
  // Graceful degradation, not the expected path. The map layers omitted `status` on
  // weather_alert while /events carried it (found live 2026-08-13, fixed upstream), and
  // keying on status alone made the page read "1 Active" for a Red Flag Warning six hours
  // out. Kept so a field going missing can never silently mean "in force" again.
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
    power: fc([], 'OK'),
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
    power: fc([], 'OK'),
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

// ---- power (PG&E outages + PSPS) ----

const outage = (rank: number, extra = {}) =>
  point('power', rank, -120.3, 38.2, { category: 'planned', ...extra });
const psps = (stage: string, status: string) =>
  point('power', 2, -120.1, 38.3, {
    id: `psps-${stage}-${status}`,
    category: 'psps',
    status,
    headline: `PSPS ${stage} — 23,491 customers`,
    power: { stage },
  });

test('INFO power outages stay out of the stream; MINOR and up are shown', () => {
  const s = snap({
    power: fc([
      outage(0, { headline: 'Planned outage — 2 customers' }),
      outage(1, { headline: 'Planned outage — 135 customers' }),
    ]),
  });
  expect(deriveStream(s).map((f) => f.properties.headline)).toEqual([
    'Planned outage — 135 customers',
  ]);
});

test('the fixture power layer surfaces its PSPS Watch in the stream', () => {
  const stream = deriveStream(hazardsFixture as unknown as HazardsSnapshot);
  expect(stream.some((f) => f.properties.category === 'psps')).toBe(true);
  expect(
    stream.some((f) => f.properties.layer === 'POWER' && f.properties.severityRank === 0)
  ).toBe(false);
});

test('PSPS banner: a Warning or a shutoff under way, never a Watch or an ordinary outage', () => {
  expect(pspsBannerEvent([psps('Watch', 'SCHEDULED')])).toBeNull();
  expect(pspsBannerEvent([outage(3, { status: 'ACTIVE' })])).toBeNull();
  expect(pspsBannerEvent([psps('Warning', 'SCHEDULED')])?.properties.headline).toContain('Warning');
  // A Watch whose de-energization window has opened: the power is going off now.
  expect(pspsBannerEvent([psps('Watch', 'ACTIVE')])).not.toBeNull();
});

test('PSPS banner pick is stable across feed order: under way, then Warning, then id', () => {
  const a = psps('Warning', 'SCHEDULED');
  const b = psps('Watch', 'ACTIVE');
  const c = { ...a, properties: { ...a.properties, id: 'psps-0' } };
  expect(pspsBannerEvent([a, b])?.properties.id).toBe(b.properties.id);
  expect(pspsBannerEvent([b, a])?.properties.id).toBe(b.properties.id);
  expect(pspsBannerEvent([a, c])?.properties.id).toBe('psps-0');
  expect(pspsBannerEvent([c, a])?.properties.id).toBe('psps-0');
});

test('the homepage tile never reads "None" under a PSPS banner, and unknown power is "Unknown"', () => {
  const quiet = { wildfire: fc([], 'OK'), evacuation: fc([], 'OK'), weather_alert: fc([], 'OK') };
  const warned = snap({ ...quiet, power: fc([psps('Warning', 'SCHEDULED')]) });
  expect(deriveActiveAlertsTile(deriveSituationSummary(warned))).toEqual({
    value: '1 Active',
    state: 'alarm',
  });
  // A Watch and ordinary outages are on /live, not in the alert count.
  const watch = snap({ ...quiet, power: fc([psps('Watch', 'SCHEDULED'), outage(1)]) });
  expect(deriveActiveAlertsTile(deriveSituationSummary(watch)).value).toBe('None');
  const down = snap({ ...quiet, power: fc([], 'UNAVAILABLE') });
  expect(deriveActiveAlertsTile(deriveSituationSummary(down)).value).toBe('Unknown');
});
