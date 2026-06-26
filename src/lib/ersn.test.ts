/**
 * Data-layer unit tests (`bun test`). Exercises pure derivations against the
 * real captured snapshot + fixture scenarios. No network.
 */
import { test, expect } from 'bun:test';
import {
  countActiveAlerts,
  deriveFireWeather,
  deriveOperationalStatus,
  isInServiceArea,
  splitIncidents,
  fallbackSnapshot,
  type ErsnSnapshot,
  type FireWeather,
  type Incident,
} from './ersn';
import { cToF, kmToMi, kmhToMph, degreesToCompass } from './units';
import active from '../data/__fixtures__/alerts-active.json';

const owned = { relaySites: 6, coverageCounties: 2 };

/** A snapshot whose weather carries the given fire-weather state (or none). */
function withFire(state?: string): ErsnSnapshot {
  const fireWeather: FireWeather | undefined =
    state === undefined
      ? undefined
      : {
          state,
          sourceEvent: '',
          headline: '',
          senderName: '',
          effective: null,
          expires: null,
          zones: [],
        };
  return { ...fallbackSnapshot, weather: { weatherData: [], lastUpdated: '', fireWeather } };
}

function withAlerts(alerts: ErsnSnapshot['alerts']): ErsnSnapshot {
  return { ...fallbackSnapshot, alerts };
}

function withIncidents(incidents: Incident[]): ErsnSnapshot {
  return { ...fallbackSnapshot, incidents: { incidents, lastUpdated: '', area: 'mother-lode' } };
}

const mkIncident = (latitude: number, longitude: number, severity = 'WARNING'): Incident => ({
  id: 'x',
  type: 'INCIDENT',
  severity,
  location: { latitude, longitude },
  locationDescription: 'somewhere',
  description: 'Test incident',
  status: 'ACTIVE',
  logNumber: '0',
  started: null,
  lastUpdated: '',
  area: 'mother-lode',
});

test('units convert metric → imperial correctly', () => {
  expect(cToF(0)).toBe(32);
  expect(cToF(30)).toBe(86);
  expect(kmToMi(13)).toBe(8.1);
  expect(kmhToMph(14)).toBe(9);
  expect(degreesToCompass(0)).toBe('N');
  expect(degreesToCompass(231)).toBe('SW');
  expect(degreesToCompass(-45)).toBe('NW'); // negative bearing normalizes
});

test('fallback snapshot is well-formed real data', () => {
  expect(fallbackSnapshot.roads?.roads.length).toBeGreaterThan(0);
  expect(fallbackSnapshot.weather?.weatherData.length).toBeGreaterThan(0);
  expect(Array.isArray(fallbackSnapshot.alerts?.alerts)).toBe(true);
  expect(Array.isArray(fallbackSnapshot.incidents?.incidents)).toBe(true);
});

test('fire weather reads the feed authoritative state (FR-3)', () => {
  expect(deriveFireWeather(withFire('NORMAL'))).toEqual({ state: 'normal', placeholder: false });
  expect(deriveFireWeather(withFire('ELEVATED'))).toEqual({
    state: 'elevated',
    placeholder: false,
  });
  expect(deriveFireWeather(withFire('RED_FLAG'))).toEqual({
    state: 'red-flag',
    placeholder: false,
  });
});

test('fire weather falls back to normal + placeholder when the feed omits it', () => {
  expect(deriveFireWeather(withFire(undefined))).toEqual({ state: 'normal', placeholder: true });
  expect(deriveFireWeather(withFire('FIRE_WEATHER_STATE_UNSPECIFIED'))).toEqual({
    state: 'normal',
    placeholder: true,
  });
});

test('fire weather never fabricates a Red Flag from alert text alone', () => {
  // A weather alert mentioning fire must NOT escalate the tile — only the feed's
  // authoritative fireWeather.state may do that.
  const snap = { ...withFire('NORMAL'), alerts: active as unknown as ErsnSnapshot['alerts'] };
  expect(deriveFireWeather(snap).state).toBe('normal');
});

test('active weather alert increments the alert count', () => {
  const snap = withAlerts(active as unknown as ErsnSnapshot['alerts']);
  expect(countActiveAlerts(snap)).toBeGreaterThanOrEqual(1);
});

test('countActiveAlerts handles an omitted empty alerts array (proto3 JSON)', () => {
  // A 0-alert 200 response can serialize as `{ lastUpdated }` with no `alerts` key.
  const snap = withAlerts({ lastUpdated: '' } as unknown as ErsnSnapshot['alerts']);
  expect(() => countActiveAlerts(snap)).not.toThrow();
  expect(countActiveAlerts(snap)).toBe(0);
});

test('isInServiceArea bounds the Calaveras/Tuolumne foothills', () => {
  expect(isInServiceArea({ latitude: 38.14, longitude: -120.45 })).toBe(true); // near Murphys
  expect(isInServiceArea({ latitude: 37.34, longitude: -120.59 })).toBe(false); // Atwater (Merced)
  expect(isInServiceArea({ latitude: 38.93, longitude: -120.05 })).toBe(false); // Lake Tahoe
  expect(isInServiceArea({ latitude: 37.68, longitude: -121.05 })).toBe(false); // Modesto
  expect(isInServiceArea(null)).toBe(false);
});

test('splitIncidents groups in-area vs wider, most-severe first', () => {
  const { inArea, wider } = splitIncidents(
    withIncidents([
      mkIncident(38.14, -120.45, 'WARNING'), // in area
      mkIncident(38.14, -120.45, 'CRITICAL'), // in area — should sort first
      mkIncident(37.34, -120.59, 'WARNING'), // wider (Merced)
    ])
  );
  expect(inArea.length).toBe(2);
  expect(inArea[0].severity).toBe('CRITICAL');
  expect(wider.length).toBe(1);
});

test('an incident without coordinates is grouped under wider region (honest)', () => {
  const noLoc: Incident = { ...mkIncident(0, 0), location: undefined };
  const { inArea, wider } = splitIncidents(withIncidents([noLoc]));
  expect(inArea.length).toBe(0);
  expect(wider.length).toBe(1);
});

test('deriveOperationalStatus surfaces owned config + live flag', () => {
  const status = deriveOperationalStatus(fallbackSnapshot, owned);
  expect(status.relaySites).toBe(6);
  expect(status.coverageCounties).toBe(2);
  expect(typeof status.activeAlertCount).toBe('number');
  expect(['normal', 'elevated', 'red-flag']).toContain(status.fireWeather);
});

test('derivations never throw on a null/empty snapshot', () => {
  const empty: ErsnSnapshot = {
    fetchedAt: '',
    live: false,
    roads: null,
    weather: null,
    alerts: null,
    incidents: null,
  };
  expect(() => countActiveAlerts(empty)).not.toThrow();
  expect(() => deriveOperationalStatus(empty, owned)).not.toThrow();
  expect(() => splitIncidents(empty)).not.toThrow();
  expect(countActiveAlerts(empty)).toBe(0);
  expect(splitIncidents(empty)).toEqual({ inArea: [], wider: [] });
});
