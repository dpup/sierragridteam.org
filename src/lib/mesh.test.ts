/**
 * Mesh topology derivation tests (`bun test`). Pure functions, no network. Weighted toward
 * the data-honesty rules — an unavailable feed must read "unknown", never a confident zero
 * — and toward the recency encoding, which is what the whole map is built on.
 */
import { test, expect } from 'bun:test';
import {
  agoLabel,
  buildGlobalGraph,
  buildRegionGraph,
  deriveMeshSummary,
  deriveAttention,
  deriveHealth,
  deriveHeardCount,
  deriveNodeRows,
  deriveRecencyCounts,
  deriveRelayNodesTile,
  displayName,
  MESH_WINDOW,
  MESH_WINDOW_DAYS,
  MESH_WINDOW_QUERY,
  isOurNode,
  linkRecency,
  linkWeight,
  linksToGeoJSON,
  sortNodeRows,
  ATTENTION_BATTERY_PCT,
  HEARD_WITHIN_HOURS,
  LOW_BATTERY_PCT,
  nodesToGeoJSON,
  nodeTypeLabel,
  type MeshFeature,
  type MeshFeatureCollection,
  type MeshWindow,
} from './mesh';
import meshFixture from '../data/mesh-snapshot.json';

const NOW = Date.parse('2026-08-06T15:35:00Z');
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

function nodeFeature(
  key: string,
  name: string,
  lng: number,
  lat: number,
  inRegion?: boolean,
  mesh: Record<string, unknown> = {}
): MeshFeature {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: {
      id: `meshcore:${key}`,
      layer: 'MESH_NODE',
      status: 'ACTIVE',
      mesh: {
        publicKey: key,
        nodeType: 'repeater',
        name,
        ...(inRegion === undefined ? {} : { inRegion }),
        ...mesh,
      },
    },
  };
}

function linkFeature(
  a: string,
  b: string,
  lastSeen: string,
  extra: Record<string, unknown> = {}
): MeshFeature {
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-120.4, 38.2],
        [-120.3, 38.3],
      ],
    },
    properties: {
      id: `mesh_link:${a}:${b}`,
      layer: 'MESH_LINK',
      headline: `${a} ↔ ${b}`,
      meshLink: {
        a,
        b,
        observations: 100,
        daysActive: 3,
        firstSeen: ago(72),
        lastSeen,
        bestSnr: 10,
        ...extra,
      },
    },
  };
}

const fc = (features: MeshFeature[], sourceStatus = 'OK'): MeshFeatureCollection => ({
  type: 'FeatureCollection',
  features,
  metadata: { layer: 'mesh_link', area: 'ebbetts-pass', generatedAt: ago(0), sourceStatus },
});

// ---- recency: the encoding the map is built on ----

test('linkRecency buckets by age of the last reception', () => {
  expect(linkRecency(ago(0.2), NOW)).toBe('live');
  expect(linkRecency(ago(3), NOW)).toBe('recent');
  expect(linkRecency(ago(12), NOW)).toBe('fading');
  expect(linkRecency(ago(60), NOW)).toBe('cold');
});

test('linkRecency degrades an unparseable stamp to cold, never to live', () => {
  expect(linkRecency('not-a-date', NOW)).toBe('cold');
  expect(linkRecency('', NOW)).toBe('cold');
});

test('linkWeight is log-scaled so a one-shot link stays visible', () => {
  const one = linkWeight(1);
  const busy = linkWeight(482);
  expect(one).toBeGreaterThan(0);
  expect(busy).toBeGreaterThan(one);
  // A 482× reception count must not produce a 482× line width.
  expect(busy / one).toBeLessThan(10);
  expect(linkWeight(100_000)).toBeLessThanOrEqual(1);
});

// ---- graph assembly ----

test('buildRegionGraph unions the roster with the subgraph and keeps in-region truth', () => {
  const nodes = fc([nodeFeature('aaa', 'SIERRA Arnold Summit', -120.32, 38.3)]);
  const links = fc([
    // The subgraph's copy of the same node claims inRegion:false — the roster must win.
    nodeFeature('aaa', 'SIERRA Arnold Summit', -120.32, 38.3, false),
    nodeFeature('bbb', 'Sunol Ridge Repeater', -121.92, 37.62, false),
    linkFeature('aaa', 'bbb', ago(1)),
  ]);
  const g = buildRegionGraph(nodes, links);

  expect(g.nodes).toHaveLength(2);
  expect(g.nodes.find((n) => n.publicKey === 'aaa')?.inRegion).toBe(true);
  expect(g.nodes.find((n) => n.publicKey === 'bbb')?.inRegion).toBe(false);
  expect(g.links).toHaveLength(1);
  expect(g.links[0].inRegion).toBe(true);
});

test('the roster decides who is in the corridor, so every surface counts the same set', () => {
  // The subgraph claims `ghost` is in-region; the roster (mesh_node) does not list it. The
  // roster wins — otherwise /mesh counts one more corridor repeater than the homepage tile,
  // which is exactly the 10-vs-11 mismatch this rule exists to prevent.
  const roster = fc([nodeFeature('aaa', 'SIERRA Arnold', -120.32, 38.3)]);
  const links = fc([
    nodeFeature('ghost', 'SIERRA Not In Roster', -120.33, 38.28, true),
    linkFeature('aaa', 'ghost', ago(1)),
  ]);
  const g = buildRegionGraph(roster, links);
  expect(g.nodes.find((n) => n.publicKey === 'ghost')?.inRegion).toBe(false);
  expect(deriveMeshSummary(g, NOW).regionNodes).toBe(1);
  expect(deriveRelayNodesTile(g).value).toBe('1 Active');
  // With no roster to consult, the subgraph's own flag is all we have — fall back to it.
  expect(buildRegionGraph(null, links).nodes.find((n) => n.publicKey === 'ghost')?.inRegion).toBe(
    true
  );
});

test('buildRegionGraph keeps an in-region node that has no observed links', () => {
  const g = buildRegionGraph(fc([nodeFeature('solo', 'SIERRA Lone Peak', -120.4, 38.1)]), fc([]));
  expect(g.nodes.map((n) => n.publicKey)).toEqual(['solo']);
  expect(g.links).toHaveLength(0);
  // A node with no links is "no links observed", NOT missing from the roster.
  expect(deriveNodeRows(g, NOW)[0]).toMatchObject({ degree: 0, lastHeard: null, recency: null });
});

test('buildRegionGraph drops malformed features rather than inventing coordinates', () => {
  const broken: MeshFeature[] = [
    {
      type: 'Feature',
      geometry: null,
      properties: { id: 'x', layer: 'MESH_NODE', mesh: { publicKey: 'x' } },
    },
    {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [-120, 38] },
      properties: { id: 'y', layer: 'MESH_NODE' }, // no mesh block → no identity
    },
  ];
  expect(buildRegionGraph(fc(broken), fc([])).nodes).toHaveLength(0);
});

test('buildGlobalGraph joins coordinate-free links and skips unresolvable endpoints', () => {
  const events = [
    {
      id: 'meshcore:g1',
      geometry: { centroid: { lat: 37.7, lng: -121.9 } },
      detail: { mesh: { publicKey: 'g1', name: 'Far Ridge' } },
    },
    {
      id: 'meshcore:g2',
      geometry: { centroid: { lat: 37.6, lng: -121.8 } },
      detail: { mesh: { publicKey: 'g2', name: 'Other Ridge' } },
    },
  ];
  const links = {
    links: [
      {
        a: 'g1',
        b: 'g2',
        observations: 5,
        daysActive: 1,
        firstSeen: ago(20),
        lastSeen: ago(2),
        bestSnr: 3,
      },
      // 'ghost' has no event → no coordinates. We omit it rather than place it somewhere.
      { a: 'g1', b: 'ghost', observations: 9, daysActive: 1, firstSeen: ago(20), lastSeen: ago(2) },
    ],
  };
  const g = buildGlobalGraph(links, events, new Set());
  expect(g.links).toHaveLength(1);
  expect(g.nodes.map((n) => n.publicKey).sort()).toEqual(['g1', 'g2']);
});

test('buildGlobalGraph does not redraw a link already shown at full strength', () => {
  const events = [
    {
      id: 'meshcore:a',
      geometry: { centroid: { lat: 38.2, lng: -120.4 } },
      detail: { mesh: { publicKey: 'a' } },
    },
    {
      id: 'meshcore:b',
      geometry: { centroid: { lat: 38.3, lng: -120.3 } },
      detail: { mesh: { publicKey: 'b' } },
    },
  ];
  const links = {
    links: [
      { a: 'a', b: 'b', observations: 5, daysActive: 1, firstSeen: ago(20), lastSeen: ago(2) },
    ],
  };
  expect(buildGlobalGraph(links, events, new Set(['a', 'b'])).links).toHaveLength(0);
});

// ---- honesty: unavailable is never zero ----

test('deriveMeshSummary returns null counts when a source is UNAVAILABLE', () => {
  const g = buildRegionGraph(fc([], 'UNAVAILABLE'), fc([]));
  const s = deriveMeshSummary(g, NOW);
  expect(s.sourceStatus).toBe('UNAVAILABLE');
  for (const v of [
    s.regionNodes,
    s.ourNodes,
    s.neighbourNodes,
    s.regionLinks,
    s.liveLinks,
    s.bestSnr,
  ]) {
    expect(v).toBeNull();
  }
});

test('a confirmed-empty OK feed is a real zero, not unknown', () => {
  const s = deriveMeshSummary(buildRegionGraph(fc([]), fc([])), NOW);
  expect(s.sourceStatus).toBe('OK');
  expect(s.regionNodes).toBe(0);
  expect(s.regionLinks).toBe(0);
});

test('one UNAVAILABLE layer poisons the whole graph status', () => {
  const g = buildRegionGraph(
    fc([nodeFeature('aaa', 'SIERRA Arnold', -120.3, 38.3)]),
    fc([], 'UNAVAILABLE')
  );
  expect(g.sourceStatus).toBe('UNAVAILABLE');
  expect(deriveMeshSummary(g, NOW).regionNodes).toBeNull();
});

test('STALE is reported as stale, and still carries its counts', () => {
  const g = buildRegionGraph(
    fc([nodeFeature('aaa', 'SIERRA Arnold', -120.3, 38.3)], 'STALE'),
    fc([])
  );
  const s = deriveMeshSummary(g, NOW);
  expect(s.sourceStatus).toBe('STALE');
  expect(s.regionNodes).toBe(1);
});

// ---- summary + roster ----

test('deriveMeshSummary counts ours, neighbours, live links and peak SNR', () => {
  const nodes = fc([
    nodeFeature('aaa', 'SIERRA Arnold Summit', -120.32, 38.3),
    nodeFeature('ccc', 'Someone Else Repeater', -120.35, 38.25),
  ]);
  const links = fc([
    nodeFeature('bbb', 'Sunol Ridge Repeater', -121.92, 37.62, false),
    linkFeature('aaa', 'bbb', ago(0.5), { bestSnr: 13.5 }),
    linkFeature('aaa', 'ccc', ago(30), { bestSnr: 4 }),
  ]);
  const s = deriveMeshSummary(buildRegionGraph(nodes, links), NOW);
  expect(s.regionNodes).toBe(2);
  expect(s.ourNodes).toBe(1); // only the SIERRA-prefixed one
  expect(s.neighbourNodes).toBe(1);
  expect(s.regionLinks).toBe(2);
  expect(s.liveLinks).toBe(1);
  expect(s.bestSnr).toBe(13.5);
  expect(s.lastHeard).toBe(ago(0.5));
});

test('deriveNodeRows ranks by degree and reports each node freshest reception', () => {
  const nodes = fc([
    nodeFeature('aaa', 'SIERRA Hub', -120.32, 38.3),
    nodeFeature('ccc', 'SIERRA Quiet', -120.35, 38.25),
  ]);
  const links = fc([
    nodeFeature('bbb', 'Neighbour', -121.9, 37.6, false),
    linkFeature('aaa', 'bbb', ago(0.5)),
    linkFeature('aaa', 'ccc', ago(40)),
  ]);
  const rows = deriveNodeRows(buildRegionGraph(nodes, links), NOW);
  expect(rows.map((r) => r.node.publicKey)).toEqual(['aaa', 'ccc']);
  expect(rows[0]).toMatchObject({ degree: 2, recency: 'live' });
  expect(rows[1]).toMatchObject({ degree: 1, recency: 'cold' });
  // Neighbours are context on the map, never rows in the corridor roster.
  expect(rows.some((r) => r.node.publicKey === 'bbb')).toBe(false);
});

test('deriveRecencyCounts tallies every tier', () => {
  const links = fc([
    linkFeature('a', 'b', ago(0.1)),
    linkFeature('c', 'd', ago(4)),
    linkFeature('e', 'f', ago(50)),
  ]);
  expect(deriveRecencyCounts(buildRegionGraph(null, links), NOW)).toEqual({
    live: 1,
    recent: 1,
    fading: 0,
    cold: 1,
  });
});

// ---- the homepage Relay Nodes tile ----

test('deriveRelayNodesTile counts only our ACTIVE in-region repeaters', () => {
  const nodes = fc([
    nodeFeature('a', 'SIERRA Arnold Summit', -120.32, 38.3),
    nodeFeature('b', 'SIERRA Camp Connell', -120.28, 38.31),
    nodeFeature('c', 'Someone Else Repeater', -120.35, 38.25), // not ours
  ]);
  const links = fc([nodeFeature('d', 'SIERRA Far Away', -121.9, 37.6, false)]); // not in region
  expect(deriveRelayNodesTile(buildRegionGraph(nodes, links))).toEqual({
    value: '2 Active',
    state: 'ok',
  });
});

test('deriveRelayNodesTile skips a node the feed no longer reports as ACTIVE', () => {
  const stale = nodeFeature('a', 'SIERRA Arnold Summit', -120.32, 38.3);
  stale.properties.status = 'EXPIRED';
  const g = buildRegionGraph(
    fc([stale, nodeFeature('b', 'SIERRA Lilac Park', -120.34, 38.25)]),
    null
  );
  expect(deriveRelayNodesTile(g).value).toBe('1 Active');
});

test('deriveRelayNodesTile reads Unknown (never 0) when the mesh source is unavailable', () => {
  const t = deriveRelayNodesTile(buildRegionGraph(fc([], 'UNAVAILABLE'), null));
  expect(t).toEqual({ value: 'Unknown', state: 'muted' });
});

test('deriveRelayNodesTile reports a confirmed-empty feed as a real 0, but muted', () => {
  // A healthy feed hearing nothing is a genuine 0 — it must not read like a healthy count.
  expect(deriveRelayNodesTile(buildRegionGraph(fc([]), null))).toEqual({
    value: '0 Active',
    state: 'muted',
  });
});

// ---- display formatting ----

test('agoLabel is compact and never guesses at a missing stamp', () => {
  expect(agoLabel(ago(0), NOW)).toBe('just now');
  expect(agoLabel(ago(0.25), NOW)).toBe('15 min ago');
  expect(agoLabel(ago(3), NOW)).toBe('3 h ago');
  expect(agoLabel(ago(72), NOW)).toBe('3 d ago');
  expect(agoLabel(null, NOW)).toBe('—');
  expect(agoLabel('nonsense', NOW)).toBe('—');
});

test('MESH_WINDOW_DAYS gives the popover its denominator', () => {
  expect(MESH_WINDOW_DAYS['30d']).toBe(30);
  expect(MESH_WINDOW_DAYS[MESH_WINDOW]).toBe(30);
});

/**
 * The regression this guards is silent and total: The Grid parses `?window=` with Go's
 * time.ParseDuration, which has no day unit and no error path — `30d` fell back to the 72h
 * default with a 200, so the site asked for a month and drew three days while every label
 * said "30 days". A day/week suffix here is not a test failure you would otherwise see.
 */
test('every window queries the feed in hours — the only unit Go parses', () => {
  for (const [key, query] of Object.entries(MESH_WINDOW_QUERY)) {
    expect(query).toMatch(/^\d+h$/);
    // The duration we send has to mean the span we label it with.
    expect(Number(query.slice(0, -1))).toBe(MESH_WINDOW_DAYS[key as MeshWindow] * 24);
  }
});

test('isOurNode matches the advertised S.I.E.R.R.A prefix only', () => {
  expect(isOurNode('SIERRA Camp Connell')).toBe(true);
  expect(isOurNode('S.I.E.R.R.A Arnold')).toBe(true);
  expect(isOurNode('Sunol Ridge Repeater')).toBe(false);
  expect(isOurNode('Sierras Peak')).toBe(false);
});

test('nodeTypeLabel humanises the feed enum', () => {
  expect(nodeTypeLabel('repeater')).toBe('Repeater');
  expect(nodeTypeLabel('room_server')).toBe('Room server');
  expect(nodeTypeLabel('')).toBe('Node');
});

test('a link leaving the corridor is flagged outward so the map can demote it', () => {
  const nodes = fc([
    nodeFeature('aaa', 'SIERRA Arnold', -120.32, 38.3),
    nodeFeature('ccc', 'SIERRA Columbia', -120.36, 38.02),
  ]);
  const links = fc([
    nodeFeature('ccc', 'SIERRA Columbia', -120.36, 38.02, true),
    nodeFeature('bbb', 'Sunol Ridge Repeater', -121.92, 37.62, false),
    linkFeature('aaa', 'ccc', ago(1)), // corridor ↔ corridor
    linkFeature('aaa', 'bbb', ago(1)), // corridor ↔ the wider mesh
  ]);
  const g = buildRegionGraph(nodes, links);
  const inward = g.links.find((l) => l.b === 'ccc');
  const out = g.links.find((l) => l.b === 'bbb');
  expect(inward?.outward).toBe(false);
  expect(out?.outward).toBe(true);
  // Both still count as touching the corridor — demotion is visual, not exclusion.
  expect(inward?.inRegion && out?.inRegion).toBe(true);
});

test('a link headline names its endpoints the way the pins and roster do', () => {
  const nodes = fc([
    nodeFeature('aaa', 'SIERRA Camp Connell', -120.28, 38.31),
    nodeFeature('bbb', 'SIERRA Eagle One 🦅', -120.41, 38.17),
  ]);
  const links = fc([linkFeature('aaa', 'bbb', ago(1))]);
  // The feed's own headline is "aaa ↔ bbb"; we rebuild it from the resolved endpoints.
  expect(buildRegionGraph(nodes, links).links[0].headline).toBe('Camp Connell ↔ Eagle One');
});

test('displayName drops the operator prefix and emoji the map cannot render', () => {
  expect(displayName('SIERRA Camp Connell')).toBe('Camp Connell');
  expect(displayName('SIERRA Eagle One 🦅')).toBe('Eagle One');
  expect(displayName('Albiani Park ⛳')).toBe('Albiani Park');
  expect(displayName('Sunol Ridge Repeater')).toBe('Sunol Ridge Repeater');
  // Never blank a node out — a name that is ONLY an emoji keeps its raw form.
  expect(displayName('🦅')).toBe('🦅');
});

test('linksToGeoJSON bakes the recency + weight the map paints from', () => {
  const g = buildRegionGraph(null, fc([linkFeature('a', 'b', ago(0.2))]));
  const props = (
    linksToGeoJSON(g.links, NOW).features[0] as { properties: Record<string, unknown> }
  ).properties;
  expect(props.recency).toBe('live');
  expect(props.weight).toBeGreaterThan(0);
  expect(props.observations).toBe(100);
});

// ---- against the real captured feed ----

test('the checked-in fixture parses into a corridor graph', () => {
  const g = buildRegionGraph(
    meshFixture.node as unknown as MeshFeatureCollection,
    meshFixture.link as unknown as MeshFeatureCollection
  );
  const s = deriveMeshSummary(g, Date.parse(meshFixture.fetchedAt));
  expect(g.sourceStatus).toBe('OK');
  expect(s.regionNodes ?? 0).toBeGreaterThan(0);
  expect(s.neighbourNodes ?? 0).toBeGreaterThan(0);
  expect(s.regionLinks ?? 0).toBeGreaterThan(0);
  // Most of the corridor is ours, but not all of it — another operator runs a repeater
  // inside it, which is exactly why the tile's sublabel reports the difference rather than
  // folding it into the headline count.
  expect(s.ourNodes ?? 0).toBeGreaterThan(0);
  expect(s.ourNodes ?? 0).toBeLessThanOrEqual(s.regionNodes ?? 0);
  expect(g.links.every((l) => l.inRegion)).toBe(true);
});

test('the checked-in fixture carries monitor telemetry for some, but not all, repeaters', () => {
  const g = buildRegionGraph(
    meshFixture.node as unknown as MeshFeatureCollection,
    meshFixture.link as unknown as MeshFeatureCollection
  );
  const s = deriveMeshSummary(g, Date.parse(meshFixture.fetchedAt));
  // The point of the health column is the GAP: only some sites carry a monitor. A capture
  // where every repeater reported would stop exercising the "Limited Telemetry" path.
  expect(s.monitored ?? 0).toBeGreaterThan(0);
  expect(s.monitored ?? 0).toBeLessThan(s.monitorable ?? 0);
  expect(s.lowestBattery).not.toBeNull();
  expect(s.lowestBattery!.percent).toBeGreaterThan(0);
});

// ---- Site health: a different class of fact from the link graph ----

/** A monitored repeater, as `mesh_node.geojson` carries it — reading flat, int64s numeric. */
const monitored = (key: string, name: string, admin: Record<string, unknown>) =>
  nodeFeature(key, name, -120.3, 38.2, true, { admin });

test('a repeater with no monitor has no health — never a zero, never a blank reading', () => {
  const g = buildRegionGraph(fc([nodeFeature('aaa', 'SIERRA Arnold Summit', -120.3, 38.2)]), null);
  expect(deriveHealth(g.nodes[0])).toBeNull();
  expect(deriveNodeRows(g, NOW)[0].health).toBeNull();
});

test('health converts enclosure °C to °F and flags a voltage-derived percentage', () => {
  const g = buildRegionGraph(
    fc([
      monitored('aaa', 'SIERRA Arnold Summit', {
        batteryPercent: 58,
        batteryPercentSource: 'estimated',
        batteryVolts: 3.86,
        temperatureC: 36.5,
        reporterId: 'alanpi',
        reportedAt: ago(0.1),
      }),
    ]),
    null
  );
  expect(deriveHealth(g.nodes[0])).toMatchObject({
    percent: 58,
    estimated: true,
    volts: 3.86,
    tempF: 98, // 36.5 °C
    low: false,
    reporterId: 'alanpi',
  });
});

test('a gauge the monitor could not read is unknown, and is never "low"', () => {
  const g = buildRegionGraph(
    fc([monitored('aaa', 'SIERRA Arnold Summit', { batteryPercent: null, temperatureC: null })]),
    null
  );
  const h = deriveHealth(g.nodes[0]);
  // Not null — there IS a monitor here; it just couldn't read the gauge. The two states are
  // different sentences on the page ("Gauge unread" vs "Limited Telemetry").
  expect(h).not.toBeNull();
  expect(h!.percent).toBeNull();
  expect(h!.tempF).toBeNull();
  expect(h!.low).toBe(false);
});

test('an absent batteryPercentSource is treated as estimated, not as a measured reading', () => {
  const g = buildRegionGraph(fc([monitored('aaa', 'SIERRA A', { batteryPercent: 90 })]), null);
  expect(deriveHealth(g.nodes[0])!.estimated).toBe(true);
  const m = buildRegionGraph(
    fc([monitored('bbb', 'SIERRA B', { batteryPercent: 90, batteryPercentSource: 'measured' })]),
    null
  );
  expect(deriveHealth(m.nodes[0])!.estimated).toBe(false);
});

test('the low-battery flag fires below the threshold and not at it', () => {
  const at = buildRegionGraph(
    fc([monitored('aaa', 'SIERRA A', { batteryPercent: LOW_BATTERY_PCT })]),
    null
  );
  const under = buildRegionGraph(
    fc([monitored('bbb', 'SIERRA B', { batteryPercent: LOW_BATTERY_PCT - 0.1 })]),
    null
  );
  expect(deriveHealth(at.nodes[0])!.low).toBe(false);
  expect(deriveHealth(under.nodes[0])!.low).toBe(true);
});

test('int64s arriving as JSON strings are coerced, and a nested telemetry.admin is read', () => {
  // The /events surface nests the reading and renders int64s as strings; mesh_node.geojson
  // keeps it flat with numbers. Both must produce the same health.
  const g = buildRegionGraph(
    fc([
      nodeFeature('aaa', 'SIERRA A', -120.3, 38.2, true, {
        telemetry: { admin: { batteryPercent: '47', temperatureC: '20', batteryVolts: '3.9' } },
      }),
    ]),
    null
  );
  expect(deriveHealth(g.nodes[0])).toMatchObject({ percent: 47, tempF: 68, volts: 3.9 });
});

test('lowestBattery names the weakest readable charge and skips unreadable gauges', () => {
  const g = buildRegionGraph(
    fc([
      monitored('aaa', 'SIERRA Arnold Summit', { batteryPercent: 92 }),
      monitored('bbb', 'SIERRA Hathaway Pines', { batteryPercent: 58 }),
      // An unread gauge must not floor to 0 and manufacture the alarm.
      monitored('ccc', 'SIERRA Lake Alpine', { batteryPercent: null }),
      nodeFeature('ddd', 'SIERRA Camp Connell', -120.3, 38.2, true),
    ]),
    null
  );
  const s = deriveMeshSummary(g, NOW);
  expect(s.lowestBattery).toEqual({ percent: 58, name: 'Hathaway Pines', low: false });
  expect(s.monitored).toBe(3); // three have a monitor…
  expect(s.monitorable).toBe(4); // …of four repeaters of ours
});

test('health figures read Unknown (never 0) when the mesh source is unavailable', () => {
  const s = deriveMeshSummary(buildRegionGraph(fc([], 'UNAVAILABLE'), null), NOW);
  expect(s.monitored).toBeNull();
  expect(s.monitorable).toBeNull();
  expect(s.lowestBattery).toBeNull();
});

test('a S.I.E.R.R.A companion is not relay infrastructure and is not counted as a repeater', () => {
  const nodes = fc([
    nodeFeature('aaa', 'SIERRA Arnold Summit', -120.3, 38.2, true),
    nodeFeature('bbb', 'SIERRA Handheld', -120.3, 38.2, true, { nodeType: 'companion' }),
  ]);
  const g = buildRegionGraph(nodes, null);
  expect(deriveRelayNodesTile(g).value).toBe('1 Active');
  expect(deriveMeshSummary(g, NOW).ourNodes).toBe(1);
  // …but it is still a real node in the corridor, so the roster and the map keep it.
  expect(deriveNodeRows(g, NOW)).toHaveLength(2);
});

// ---- The status board's derivations ----

test('the watch floor and the risk threshold are different states, not one', () => {
  const at = (pct: number) =>
    deriveHealth(
      buildRegionGraph(
        fc([
          nodeFeature('aaa', 'SIERRA A', -120.3, 38.2, true, { admin: { batteryPercent: pct } }),
        ]),
        null
      ).nodes[0]
    )!;
  // Comfortable: neither.
  expect(at(ATTENTION_BATTERY_PCT + 1)).toMatchObject({ watch: false, low: false });
  // Worth a look, brass: under the floor but not at risk.
  expect(at(ATTENTION_BATTERY_PCT - 1)).toMatchObject({ watch: true, low: false });
  // Genuinely at risk, orange — and NOT also "watch", so the two never both style a row.
  expect(at(LOW_BATTERY_PCT - 1)).toMatchObject({ watch: false, low: true });
});

test('needs-attention surfaces a low battery and a repeater we have not heard', () => {
  const nodes = fc([
    nodeFeature('aaa', 'SIERRA Arnold Summit', -120.3, 38.2, true, {
      admin: { batteryPercent: 16 },
    }),
    nodeFeature('bbb', 'SIERRA Columbia jwt1', -120.3, 38.2, true),
    nodeFeature('ccc', 'SIERRA Camp Connell', -120.3, 38.2, true, {
      admin: { batteryPercent: 92 },
    }),
  ]);
  // Arnold + Camp heard minutes ago; Columbia's only link is a day old.
  const links = fc([
    linkFeature('aaa', 'ccc', ago(0.05)),
    linkFeature('bbb', 'ccc', ago(HEARD_WITHIN_HOURS + 7)),
  ]);
  const items = deriveAttention(buildRegionGraph(nodes, links), NOW);

  const stale = items.find((i) => i.kind === 'stale');
  expect(stale?.node.publicKey).toBe('bbb');
  expect(stale?.detail).toContain('not heard in');
  // "not heard" is an alert, and it never says the repeater is down.
  expect(stale?.tone).toBe('alert');
  expect(stale?.detail).not.toContain('down');

  const battery = items.find((i) => i.kind === 'battery');
  expect(battery?.node.publicKey).toBe('aaa');
  // 16% is under the watch floor but above the risk line — brass, not orange.
  expect(battery?.tone).toBe('watch');

  // A healthy, recently-heard repeater raises nothing at all.
  expect(items.some((i) => i.node.publicKey === 'ccc')).toBe(false);
});

test('an unmonitored repeater can never raise a battery item', () => {
  const nodes = fc([nodeFeature('aaa', 'SIERRA Lilac Park', -120.3, 38.2, true)]);
  const links = fc([linkFeature('aaa', 'bbb', ago(0.1))]);
  const items = deriveAttention(buildRegionGraph(nodes, links), NOW);
  // Absence of telemetry is a gap in our monitoring, never a fault to report.
  expect(items.some((i) => i.kind === 'battery')).toBe(false);
});

test('needs-attention is empty (not unknown) when everything is inside its limits', () => {
  const nodes = fc([
    nodeFeature('aaa', 'SIERRA A', -120.3, 38.2, true, { admin: { batteryPercent: 95 } }),
  ]);
  const links = fc([linkFeature('aaa', 'bbb', ago(0.2))]);
  expect(deriveAttention(buildRegionGraph(nodes, links), NOW)).toEqual([]);
  // …but a broken feed raises nothing either, because then we do not know.
  expect(deriveAttention(buildRegionGraph(fc([], 'UNAVAILABLE'), null), NOW)).toEqual([]);
});

test('heard-count counts receptions inside the window, and is Unknown when the feed is down', () => {
  const nodes = fc([
    nodeFeature('aaa', 'SIERRA A', -120.3, 38.2, true),
    nodeFeature('bbb', 'SIERRA B', -120.3, 38.2, true),
    nodeFeature('ccc', 'SIERRA C', -120.3, 38.2, true),
  ]);
  const links = fc([
    linkFeature('aaa', 'bbb', ago(1)),
    linkFeature('ccc', 'ddd', ago(HEARD_WITHIN_HOURS + 1)),
  ]);
  expect(deriveHeardCount(buildRegionGraph(nodes, links), NOW)).toEqual({ heard: 2, total: 3 });
  expect(deriveHeardCount(buildRegionGraph(fc([], 'UNAVAILABLE'), null), NOW)).toBeNull();
});

test('sorting by battery puts the weakest first and unmonitored repeaters last', () => {
  const nodes = fc([
    nodeFeature('aaa', 'SIERRA A', -120.3, 38.2, true, { admin: { batteryPercent: 90 } }),
    nodeFeature('bbb', 'SIERRA B', -120.3, 38.2, true),
    nodeFeature('ccc', 'SIERRA C', -120.3, 38.2, true, { admin: { batteryPercent: 40 } }),
  ]);
  const rows = deriveNodeRows(buildRegionGraph(nodes, null), NOW);
  // Unmonitored sorts LAST, never as 0% — "no reading" is not "empty", and floating it to
  // the top would invent an alarm out of a monitoring gap.
  expect(sortNodeRows(rows, 'battery').map((r) => r.node.publicKey)).toEqual(['ccc', 'aaa', 'bbb']);
});

test('sorting by stalest puts never-heard first, then the longest silence', () => {
  const nodes = fc([
    nodeFeature('aaa', 'SIERRA A', -120.3, 38.2, true),
    nodeFeature('bbb', 'SIERRA B', -120.3, 38.2, true),
    nodeFeature('ccc', 'SIERRA C', -120.3, 38.2, true),
  ]);
  const links = fc([linkFeature('aaa', 'zzz', ago(1)), linkFeature('bbb', 'zzz', ago(20))]);
  const rows = deriveNodeRows(buildRegionGraph(nodes, links), NOW);
  expect(sortNodeRows(rows, 'stalest').map((r) => r.node.publicKey)).toEqual(['ccc', 'bbb', 'aaa']);
  // The default is unchanged: busiest first.
  expect(sortNodeRows(rows, 'links')[0].degree).toBeGreaterThanOrEqual(
    sortNodeRows(rows, 'links')[1].degree
  );
});
