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
    metadata: { layer: 'x', area: 'ebbetts-pass', generatedAt: '', sourceStatus: status as 'OK' },
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
      severityRank: 3,
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

test('an issued-but-not-yet-in-force weather alert reads "Upcoming", never "Active"', () => {
  const watch = (extra: Record<string, unknown> = {}): HazardFeature => ({
    type: 'Feature',
    geometry: null,
    properties: {
      id: 'nws:watch',
      layer: 'weather_alert',
      kind: 'Weather alert',
      severity: 'MODERATE',
      severityRank: 2,
      headline: 'Fire Weather Watch — thunderstorms and strong outflow winds',
      status: 'SCHEDULED',
      effective: '2026-08-13T12:00:00Z', // the hazard's onset (Grid 2026-08-11), 05:00 PT
      source: { id: 'nws', name: 'NWS Sacramento' },
      ...extra,
    },
  });

  const view = buildView(snap({ weather_alert: fc([watch()]) }), emptyGrid);
  expect(view.tiles.weatherAlerts.value).toBe('1 Upcoming');
  expect(view.tiles.weatherAlerts.href).toBe('#stream-title'); // there IS detail to jump to
  // Visible with the card collapsed, and dated — a bare clock time would read as "today".
  expect(view.html.stream).toContain('Begins Thu 05:00 PT');

  // No onset published → say so, never invent a start time.
  const undated = buildView(snap({ weather_alert: fc([watch({ effective: null })]) }), emptyGrid);
  expect(undated.html.stream).toContain('Not yet in effect');
  expect(undated.html.stream).not.toContain('Begins');

  // An alert in force carries no "begins" marker at all.
  const active = buildView(snap({ weather_alert: fc([watch({ status: 'ACTIVE' })]) }), emptyGrid);
  expect(active.tiles.weatherAlerts.value).toBe('1 Active');
  expect(active.html.stream).not.toContain('Begins');
});

test('an evacuation card does not repeat the zone the headline already names', () => {
  const evac = (headline: string, zoneId: string): HazardFeature => ({
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [-120.4, 38.2] },
    properties: {
      id: 'caloes:7f1c2a90', // opaque, like the real ids — must not itself contain the zone
      layer: 'evacuation',
      kind: 'Evacuation',
      severity: 'EXTREME',
      severityRank: 4,
      headline,
      source: { id: 'caloes', name: 'Cal OES' },
      evacuation: { zoneId, level: 'ORDER', eventType: 'Wildfire' },
    },
  });

  // Grid CHANGELOG 2026-08-11: the headline names the zone (it used to fall back to the
  // county), so the detail line must not say it a second time.
  const named = buildView(
    snap({ evacuation: fc([evac('Evacuation Order — CAL-E-109-C', 'CAL-E-109-C')]) }),
    emptyGrid
  );
  expect((named.html.stream.match(/CAL-E-109-C/g) ?? []).length).toBe(1);
  expect(named.html.stream).toContain('Wildfire'); // the event type is still surfaced

  // A headline that doesn't carry the zone still gets it on the detail line.
  const bare = buildView(
    snap({ evacuation: fc([evac('Evacuation Order — CALAVERAS', 'CAL-E-139-D')]) }),
    emptyGrid
  );
  expect(bare.html.stream).toContain('Zone CAL-E-139-D');
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
      severityRank: status === 'open' ? 0 : 2,
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
            roadId: 'r1',
            congestion: 'LIGHT',
            delayMinutes: 4,
            durationMinutes: 21,
            distanceKm: 20,
          },
          { description: 'left lane closed for pavement work' }
        ),
        seg('angels-murphys', 'open', {
          roadId: 'r2',
          congestion: 'CLEAR',
          delayMinutes: 0,
          durationMinutes: 12,
          distanceKm: 13,
        }),
      ]),
    }),
    emptyGrid
  );
  expect(view.html.roads).toContain('left lane closed for pavement work');
  // Exactly one segment (the restricted one) renders the reason line.
  expect((view.html.roads.match(/class="road__incident"/g) ?? []).length).toBe(1);

  // The map layer carries a promoted `tone` matching the table (open → ok, restricted →
  // elevated) so the corridor line colors consistently. Orange is never used for a road.
  const segs = view.mapData.layers.road_segment.features;
  expect(segs.find((f) => f.properties.status === 'restricted')?.properties.tone).toBe('elevated');
  expect(segs.find((f) => f.properties.status === 'open')?.properties.tone).toBe('ok');
});
