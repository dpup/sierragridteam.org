/**
 * Service-area geography and owned/static operational config.
 *
 * The homepage hero draws the network's towns over a real county + highway map
 * (src/assets/hero-map.svg). Both layers share ONE projection, `HERO_PROJECTION`, into hero
 * "column space" (the centered 1320px content column, (0,0) at its top-left), so a town's
 * marker always lands on its place on the map. Town positions are real lat/lon.
 *
 * SAFE TO EDIT: names, deployment-zone list.
 * Coordinates are geographic truth — only change them to fix the map's geography. A town
 * outside the hero's frame (roughly Angels Camp to Bear Valley) needs a new projection, and
 * then the map must be regenerated to match (`npm run hero-map`).
 * See docs/architecture/information-architecture.md (Home hero · map honesty rule).
 */

export type TownRole = 'hq' | 'town' | 'hub';

/**
 * Equirectangular, x scaled by cos(latRef), pinned at Murphys. `scripts/hero-map.ts` reads
 * this too — change it there and here together by changing it HERE and regenerating.
 */
export const HERO_PROJECTION = {
  lon: -120.4655,
  lat: 38.1377,
  x: 810,
  y: 480,
  k: 1350,
  latRef: 38.1,
} as const;

/** A lon/lat in hero column space. */
export function heroProject(lon: number, lat: number): { x: number; y: number } {
  const p = HERO_PROJECTION;
  return {
    x: p.x + (lon - p.lon) * p.k * Math.cos((p.latRef * Math.PI) / 180),
    y: p.y - (lat - p.lat) * p.k,
  };
}

export interface CoverageTown {
  id: string;
  name: string;
  /** Marker role → legend color. hq=green, town=brass, hub=orange (regional hub). */
  role: TownRole;
  lon: number;
  lat: number;
  /** Which side of the marker its label sits on. */
  labelSide: 'left' | 'right';
}

/** Seven towns along the Highway 4 and 49 corridors. Murphys is HQ. */
export const towns: readonly CoverageTown[] = [
  {
    id: 'bear-valley',
    name: 'Bear Valley',
    role: 'town',
    lon: -120.0405,
    lat: 38.4588,
    labelSide: 'left',
  },
  {
    id: 'dorrington',
    name: 'Dorrington',
    role: 'town',
    lon: -120.2702,
    lat: 38.3119,
    labelSide: 'left',
  },
  { id: 'arnold', name: 'Arnold', role: 'town', lon: -120.351, lat: 38.2555, labelSide: 'left' },
  { id: 'murphys', name: 'Murphys', role: 'hq', lon: -120.4655, lat: 38.1377, labelSide: 'right' },
  {
    id: 'angels-camp',
    name: 'Angels Camp',
    role: 'town',
    lon: -120.5397,
    lat: 38.0683,
    labelSide: 'right',
  },
  {
    id: 'columbia',
    name: 'Columbia',
    role: 'town',
    lon: -120.4016,
    lat: 38.0363,
    labelSide: 'right',
  },
  { id: 'sonora', name: 'Sonora', role: 'hub', lon: -120.3822, lat: 37.9841, labelSide: 'right' },
] as const;

export interface Corridor {
  id: string;
  name: string;
  kind: 'solid' | 'dashed';
  /** Ordered town ids the corridor connects. */
  path: readonly string[];
}

/** Coverage links follow real road corridors (Hwy 4 NE chain, Hwy 49 south leg, one cross-link). */
export const corridors: readonly Corridor[] = [
  {
    id: 'hwy4',
    name: 'Highway 4',
    kind: 'solid',
    path: ['bear-valley', 'dorrington', 'arnold', 'murphys', 'angels-camp'],
  },
  { id: 'hwy49', name: 'Highway 49', kind: 'solid', path: ['angels-camp', 'columbia', 'sonora'] },
  { id: 'crosslink', name: 'Cross-corridor relay', kind: 'dashed', path: ['murphys', 'columbia'] },
] as const;

/** Hero map legend roles → label text (colors come from tokens, not here). */
export const legend: ReadonlyArray<{ role: TownRole; label: string }> = [
  { role: 'hq', label: 'Network HQ' },
  { role: 'town', label: 'Coverage town' },
  { role: 'hub', label: 'Regional hub' },
];

/**
 * Owned/static operational values — the org's own stated facts, NOT feed data. Editable
 * WITHOUT a code change. (The mesh roster and the home Relay Nodes count used to live here;
 * both are live from The Grid as of 2026-08 — see FR-5/FR-6 in
 * docs/architecture/data-feed.md.)
 */
export const operations = {
  /* NOTE: the home "Relay Nodes" tile is LIVE as of 2026-08 — it counts the S.I.E.R.R.A
     repeaters The Grid's mesh feed is currently hearing (src/lib/mesh.ts
     `deriveRelayNodesTile`), so there is no static relay count to edit here any more. */
  /** "Coverage" stat tile scope. */
  coverageCounties: 2,
  /**
   * Deployment zones shown in the site-wide `ServiceBanner`. `live` flags whether the zone
   * is in service. NOT the /mesh roster — that comes from The Grid's mesh feed now
   * (src/lib/mesh.ts); these are the org's own stated coverage intent, not observed nodes.
   */
  deploymentZones: [
    { name: 'Murphys (HQ)', live: true },
    { name: 'Angels Camp', live: true },
    { name: 'Arnold', live: true },
    { name: 'Dorrington', live: true },
    { name: 'Columbia', live: true },
    { name: 'Sonora', live: false },
    { name: 'Twain Harte', live: false },
  ],
} as const;

export const townById = (id: string): CoverageTown | undefined => towns.find((t) => t.id === id);

/**
 * Geographic bounding box of S.I.E.R.R.A's service area (Calaveras & Tuolumne
 * foothills). Used to frame the /live hazard map (initial map bounds) — NOT for hazard
 * filtering: The Grid's place feed is polygon-scoped server-side, so the client renders
 * exactly what it returns. Tuned to include the Hwy 4 / 49 / 108 / 120 corridors and
 * exclude the Central Valley, Tahoe basin, and El Dorado/Placer foothills.
 */
export const serviceAreaBounds = {
  minLat: 37.55,
  maxLat: 38.55,
  minLng: -120.75,
  maxLng: -119.55,
} as const;

/**
 * Network sites in REAL geographic coordinates (WGS84 lat/long), for the live
 * hazard map on /live (MapLibre overlays the org's own sites on a real basemap).
 * Separate from the hero CoverageMap (which draws a fixed set of towns in its own frame). `role`: hq=green,
 * relay=brass, hub=orange. Keep coordinates accurate to the actual towns.
 */
export const mapSites: ReadonlyArray<{
  name: string;
  lat: number;
  lng: number;
  role: TownRole;
}> = [
  { name: 'Murphys (HQ)', lat: 38.1374, lng: -120.4583, role: 'hq' },
  { name: 'Angels Camp', lat: 38.0683, lng: -120.5391, role: 'town' },
  { name: 'Arnold', lat: 38.2555, lng: -120.3513, role: 'town' },
  { name: 'Dorrington', lat: 38.3119, lng: -120.2702, role: 'town' },
  { name: 'Bear Valley', lat: 38.4577, lng: -120.043, role: 'town' },
  { name: 'Columbia', lat: 38.0357, lng: -120.4002, role: 'town' },
  { name: 'Sonora', lat: 37.9829, lng: -120.3822, role: 'town' },
  { name: 'Twain Harte', lat: 38.0421, lng: -120.2299, role: 'town' },
];
