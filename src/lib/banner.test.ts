/**
 * Site-wide banner decision tests (`bun test`). Pure: what the band says, when it may rewrite
 * its role="alert" region, and when the power layer is worth fetching at all.
 */
import { test, expect } from 'bun:test';
import { deriveBanner, powerCheck, pspsFromLayer } from './banner';
import type { HazardFeature, SummaryDomain } from './hazards';

function psps(stage: string, status: string, headline = 'PSPS — 23,491 customers'): HazardFeature {
  return {
    type: 'Feature',
    geometry: null,
    properties: {
      id: 'psps:1',
      layer: 'POWER',
      kind: 'Public Safety Power Shutoff',
      category: 'psps',
      severity: 'MODERATE',
      severityRank: 2,
      status,
      headline,
      source: { id: 'psps', name: 'PG&E PSPS' },
      power: { stage, deEnergizationStart: '2026-10-15T03:00:00Z' },
    },
  };
}
const calm = { activeEvacuations: 0, topEvents: [], wildfire: [], psps: null };

test('calm is hidden; evacuation outranks wildfire outranks a PSPS', () => {
  expect(deriveBanner(calm).active).toBe(false);
  const shutoff = psps('Warning', 'SCHEDULED');
  expect(deriveBanner({ ...calm, psps: shutoff }).label).toBe('Power Shutoff');
  const fire = [{ properties: { headline: 'Owl Fire' } }];
  expect(deriveBanner({ ...calm, wildfire: fire, psps: shutoff }).label).toBe('Active Wildfire');
  expect(deriveBanner({ ...calm, activeEvacuations: 1, wildfire: fire, psps: shutoff }).label).toBe(
    'Evacuation'
  );
});

test('a PSPS headline carries no counts, and says planned vs under way', () => {
  const planned = deriveBanner({ ...calm, psps: psps('Warning', 'SCHEDULED') });
  expect(planned.headline).toBe(
    'PG&E plans to shut off power in parts of the service area from Wed 20:00 PT'
  );
  const off = deriveBanner({ ...calm, psps: psps('Warning', 'ACTIVE') });
  expect(off.headline).toBe('PG&E has shut off power in parts of the service area');
});

test('revised PG&E counts do not re-announce the alert; a change of stage does', () => {
  const a = deriveBanner({ ...calm, psps: psps('Warning', 'SCHEDULED', 'PSPS — 23,491') });
  const b = deriveBanner({ ...calm, psps: psps('Warning', 'SCHEDULED', 'PSPS — 24,010') });
  const c = deriveBanner({ ...calm, psps: psps('Warning', 'ACTIVE', 'PSPS — 24,010') });
  expect(b.sig).toBe(a.sig);
  expect(c.sig).not.toBe(a.sig);
});

const domain = (status: string, highestSeverity: string) =>
  [{ domain: 'power', status, highestSeverity, activeCount: 1, headlines: [] }] as SummaryDomain[];

test('the power layer is fetched only when the summary allows a PSPS', () => {
  expect(powerCheck(domain('OK', 'MINOR'))).toBe('none');
  expect(powerCheck(domain('OK', 'INFO'))).toBe('none');
  expect(powerCheck(domain('OK', 'MODERATE'))).toBe('fetch');
  expect(powerCheck(domain('UNAVAILABLE', 'INFO'))).toBe('unknown');
  // No power domain at all (an older Grid) → fetch rather than assume.
  expect(powerCheck([])).toBe('fetch');
  expect(powerCheck(undefined)).toBe('fetch');
});

test('an unreadable power layer is unknown, never "no PSPS"', () => {
  expect(pspsFromLayer(null)).toBeUndefined();
  expect(
    pspsFromLayer({ features: [], metadata: { sourceStatus: 'UNAVAILABLE' } })
  ).toBeUndefined();
  expect(pspsFromLayer({ features: [], metadata: { sourceStatus: 'OK' } })).toBeNull();
  expect(
    pspsFromLayer({ features: [psps('Warning', 'SCHEDULED')], metadata: { sourceStatus: 'OK' } })
  ).not.toBeNull();
});
