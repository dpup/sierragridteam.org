/**
 * Data-layer unit tests (`bun test`). Pure helpers + fixture validation; no network.
 */
import { test, expect } from 'bun:test';
import { cToF, kmToMi, kmhToMph, degreesToCompass } from './units';
import { burnVerdict, groupBurnStatus, type BurnStatusEvent } from './grid';
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

// ---- burn status ----

function burn(county: string, s: Partial<BurnStatusEvent['burnStatus']> = {}): BurnStatusEvent {
  return {
    id: `burn:${county.toLowerCase()}-county`,
    areaLabel: `${county} County`,
    burnStatus: {
      burnDay: 'BURN_DAY_UNKNOWN',
      calfireStatus: 'CALFIRE_BURN_STATUS_UNKNOWN',
      permission: 'BURN_PERMISSION_UNKNOWN',
      burnLines: [],
      ...s,
    },
  };
}
const suspended = {
  calfireStatus: 'CALFIRE_BURNING_SUSPENDED',
  permission: 'BURN_PERMISSION_PROHIBITED',
};

test('a CAL FIRE suspension decides it, whatever the burn line says', () => {
  expect(burnVerdict(burn('Calaveras', { ...suspended, burnDay: 'BURN_DAY_NO' }).burnStatus)).toBe(
    'calfire'
  );
  expect(burnVerdict(burn('Tuolumne', suspended).burnStatus)).toBe('calfire');
  expect(burnVerdict(burn('Tuolumne', { ...suspended, burnDay: 'BURN_DAY_YES' }).burnStatus)).toBe(
    'calfire'
  );
});

test('with no suspension, a no-burn day is the air district', () => {
  const s = burn('Calaveras', {
    calfireStatus: 'CALFIRE_NO_PERMIT_REQUIRED',
    burnDay: 'BURN_DAY_NO',
    permission: 'BURN_PERMISSION_PROHIBITED',
  }).burnStatus;
  expect(burnVerdict(s)).toBe('district');
});

test('only The Grid saying ALLOWED is a green light — never re-derived from the facets', () => {
  const ok = { calfireStatus: 'CALFIRE_PERMIT_REQUIRED', burnDay: 'BURN_DAY_YES' };
  expect(burnVerdict(burn('C', { ...ok, permission: 'BURN_PERMISSION_ALLOWED' }).burnStatus)).toBe(
    'allowed'
  );
  // Both facets look permissive, but The Grid withheld ALLOWED: that stays unknown.
  expect(burnVerdict(burn('C', ok).burnStatus)).toBe('unknown');
});

test('a marginal burn day is elevation-restricted, not allowed', () => {
  const s = burn('C', { calfireStatus: 'CALFIRE_PERMIT_REQUIRED', burnDay: 'BURN_DAY_MARGINAL' });
  expect(burnVerdict(s.burnStatus)).toBe('elevation');
});

test('counties that agree collapse to one line; disagreement splits them', () => {
  expect(groupBurnStatus([burn('Calaveras', suspended), burn('Tuolumne', suspended)])).toEqual([
    { verdict: 'calfire', counties: [burn('Calaveras', suspended), burn('Tuolumne', suspended)] },
  ]);
  const split = groupBurnStatus([
    burn('Calaveras', { permission: 'BURN_PERMISSION_ALLOWED' }),
    burn('Tuolumne', suspended),
  ]);
  expect(split?.map((g) => g.verdict)).toEqual(['allowed', 'calfire']);
});

test('a failed fetch is null (unknown), no counties is empty (not covered)', () => {
  expect(groupBurnStatus(null)).toBeNull();
  expect(groupBurnStatus([])).toEqual([]);
});

test('the checked-in burn fixture parses into a verdict for every county', () => {
  const groups = groupBurnStatus(gridFixture.burn as BurnStatusEvent[]);
  expect(groups?.flatMap((g) => g.counties).length).toBe(gridFixture.burn.length);
});
