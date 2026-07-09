/**
 * /live view-model tests (`bun test`). Pure — buildView turns the two fetched snapshots
 * into the tile view-model + region HTML with no DOM/network. Focused on the two things
 * that are easy to regress: the per-event "More information" link (from provenance) and
 * the count tiles that jump down to the alert stream.
 */
import { test, expect } from 'bun:test';
import { buildView } from './live-view';
import type { HazardsSnapshot, HazardFeature } from './hazards';
import type { GridSnapshot } from './grid';

const emptyGrid: GridSnapshot = { fetchedAt: '', conditions: null };

function snap(layers: Record<string, unknown>): HazardsSnapshot {
  return {
    fetchedAt: '2026-07-07T00:00:00Z',
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
    metadata: { layer: 'x', area: 'ebbetts-pass', generated_at: '', source_status: status as 'OK' },
  };
}
function fire(extra: Record<string, unknown> = {}): HazardFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-120.4, 38.2] },
    properties: {
      id: 'fire:priest',
      layer: 'wildfire',
      kind: 'Wildfire',
      severity: 'SEVERE',
      severity_rank: 3,
      headline: 'Priest Fire',
      source: { id: 'calfire', name: 'CAL FIRE' },
      wildfire: { acres: 200, containment: 10 },
      ...extra,
    },
  };
}

const INCIDENT_URL = 'https://www.fire.ca.gov/incidents/2026/7/6/priest-fire';

test('a wildfire card links its CAL FIRE incident page from provenance.sourceUrl', () => {
  const view = buildView(
    snap({ wildfire: fc([fire({ provenance: { sourceUrl: INCIDENT_URL } })]) }),
    emptyGrid
  );
  expect(view.html.stream).toContain(INCIDENT_URL);
  expect(view.html.stream).toContain('More information');
});

test('no provenance url → no "More information" link (never invent one)', () => {
  const view = buildView(snap({ wildfire: fc([fire()]) }), emptyGrid);
  expect(view.html.stream).not.toContain('More information');
});

test('count tiles link to the alert stream only when there is something to jump to', () => {
  const active = buildView(snap({ wildfire: fc([fire()]) }), emptyGrid);
  expect(active.tiles.wildfires.href).toBe('#stream-title');

  // Confirmed-empty (OK) → "None", no jump target.
  const none = buildView(snap({ wildfire: fc([], 'OK') }), emptyGrid);
  expect(none.tiles.wildfires.href).toBeUndefined();

  // Source unavailable → "Unknown", also no link (no detail exists to show).
  const unknown = buildView(snap({ wildfire: fc([], 'UNAVAILABLE') }), emptyGrid);
  expect(unknown.tiles.wildfires.href).toBeUndefined();

  // Fire Weather is a status, not a countable list — never a jump target.
  expect(active.tiles.fireWeather.href).toBeUndefined();
});

test('a restricted road segment shows its reason; an open one adds no incident line', () => {
  const seg = (
    id: string,
    status: string,
    road: Record<string, unknown>,
    extra: Record<string, unknown> = {}
  ): HazardFeature => ({
    type: 'Feature',
    geometry: null,
    properties: {
      id,
      layer: 'road_segment',
      kind: 'Road segment',
      severity: status === 'open' ? 'INFO' : 'MODERATE',
      severity_rank: status === 'open' ? 0 : 2,
      headline: `Hwy 4 — ${id}`,
      status,
      source: { id: 'google', name: 'Google Routes + Caltrans' },
      road,
      ...extra,
    },
  });
  const view = buildView(
    snap({
      road_segment: fc([
        seg(
          'murphys-arnold',
          'restricted',
          {
            road_id: 'r1',
            congestion: 'LIGHT',
            delay_minutes: 4,
            duration_minutes: 21,
            distance_km: 20,
          },
          { description: 'left lane closed for pavement work' }
        ),
        seg('angels-murphys', 'open', {
          road_id: 'r2',
          congestion: 'CLEAR',
          delay_minutes: 0,
          duration_minutes: 12,
          distance_km: 13,
        }),
      ]),
    }),
    emptyGrid
  );
  expect(view.html.roads).toContain('left lane closed for pavement work');
  // Exactly one segment (the restricted one) renders the reason line.
  expect((view.html.roads.match(/class="road__incident"/g) ?? []).length).toBe(1);
});
