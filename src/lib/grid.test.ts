/**
 * Data-layer unit tests (`bun test`). Pure helpers + fixture validation; no network.
 */
import { test, expect } from 'bun:test';
import { isInServiceArea } from './grid';
import { cToF, kmToMi, kmhToMph, degreesToCompass } from './units';
import gridFixture from '../data/grid-snapshot.json';

test('units convert metric → imperial correctly', () => {
  expect(cToF(0)).toBe(32);
  expect(cToF(30)).toBe(86);
  expect(kmToMi(13)).toBe(8.1);
  expect(kmhToMph(14)).toBe(9);
  expect(degreesToCompass(0)).toBe('N');
  expect(degreesToCompass(231)).toBe('SW');
  expect(degreesToCompass(-45)).toBe('NW'); // negative bearing normalizes
});

test('the checked-in grid snapshot fixture is well-formed (harness mocks use it)', () => {
  expect(gridFixture.roads.roads.length).toBeGreaterThan(0);
  expect(gridFixture.weather.weatherData.length).toBeGreaterThan(0);
  expect(Array.isArray(gridFixture.alerts.alerts)).toBe(true);
});

test('isInServiceArea bounds the Calaveras/Tuolumne foothills', () => {
  expect(isInServiceArea({ latitude: 38.14, longitude: -120.45 })).toBe(true); // near Murphys
  expect(isInServiceArea({ latitude: 37.34, longitude: -120.59 })).toBe(false); // Atwater (Merced)
  expect(isInServiceArea({ latitude: 38.93, longitude: -120.05 })).toBe(false); // Lake Tahoe
  expect(isInServiceArea({ latitude: 37.68, longitude: -121.05 })).toBe(false); // Modesto
  expect(isInServiceArea(null)).toBe(false);
});
