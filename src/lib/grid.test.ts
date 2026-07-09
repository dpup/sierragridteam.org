/**
 * Data-layer unit tests (`bun test`). Pure helpers + fixture validation; no network.
 */
import { test, expect } from 'bun:test';
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
  expect(gridFixture.conditions.weather.length).toBeGreaterThan(0);
});
