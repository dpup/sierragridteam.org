/**
 * Data-layer unit tests (`bun test`). Exercises pure derivations against the
 * real captured snapshot + fixture scenarios. No network.
 */
import { test, expect } from 'bun:test';
import {
  countActiveAlerts,
  deriveFireWeather,
  deriveOperationalStatus,
  fallbackSnapshot,
  type ErsnSnapshot,
} from './ersn';
import { cToF, kmToMi, kmhToMph, degreesToCompass } from './units';
import redflag from '../data/__fixtures__/alerts-redflag.json';
import active from '../data/__fixtures__/alerts-active.json';

const owned = { relaySites: 6, coverageCounties: 2 };

function snapshotWithAlerts(alerts: ErsnSnapshot['alerts']): ErsnSnapshot {
  return { ...fallbackSnapshot, alerts };
}

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
});

test('calm conditions → fire weather normal + placeholder', () => {
  const { state, placeholder } = deriveFireWeather(
    snapshotWithAlerts({ alerts: [], lastUpdated: '' })
  );
  expect(state).toBe('normal');
  expect(placeholder).toBe(true);
});

test('red flag alert → fire weather red-flag, not placeholder', () => {
  const { state, placeholder } = deriveFireWeather(snapshotWithAlerts(redflag));
  expect(state).toBe('red-flag');
  expect(placeholder).toBe(false);
});

test('active weather alert increments the alert count', () => {
  const snap = snapshotWithAlerts(active);
  expect(countActiveAlerts(snap)).toBeGreaterThanOrEqual(1);
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
  };
  expect(() => countActiveAlerts(empty)).not.toThrow();
  expect(() => deriveOperationalStatus(empty, owned)).not.toThrow();
  expect(countActiveAlerts(empty)).toBe(0);
});
