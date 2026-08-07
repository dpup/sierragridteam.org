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
  deriveNodeRows,
  deriveRecencyCounts,
  deriveRelayNodesTile,
  displayName,
  MESH_WINDOW,
  MESH_WINDOW_DAYS,
  isOurNode,
  linkRecency,
  linkWeight,
  linksToGeoJSON,
  nodeTypeLabel,
  type MeshFeature,
  type MeshFeatureCollection,
} from './mesh';
import meshFixture from '../data/mesh-snapshot.json';

const NOW = Date.parse('2026-08-06T15:35:00Z');
const ago = (hours: number) => new Date(NOW - hours * 3_600_000).toISOString();

function nodeFeature(
  key: string,
  name: string,
  lng: number,
  lat: number,
  inRegion?: boolean
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

test('MESH_WINDOW_DAYS gives the popover its denominator, and none for all-time', () => {
  expect(MESH_WINDOW_DAYS['30d']).toBe(30);
  expect(MESH_WINDOW_DAYS[MESH_WINDOW]).toBe(30);
  // No span exists for all-time — the popover must render no denominator, not invent one.
  expect(MESH_WINDOW_DAYS.all).toBeNull();
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
  // Every corridor node in the capture is one of ours, and every link touches the corridor.
  expect(s.ourNodes).toBe(s.regionNodes);
  expect(g.links.every((l) => l.inRegion)).toBe(true);
});
