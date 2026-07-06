/**
 * Service-area geography and owned/static operational config.
 *
 * Town coordinates are a simple equirectangular projection of real lat/long into
 * aspect-correct "map units" (≈ miles × 10 from a local reference), so the hero
 * CoverageMap can place markers AND draw the connecting corridors in ONE shared
 * coordinate system (dots and line endpoints always stay aligned at any width).
 *
 * SAFE TO EDIT: names, labels, the relay count, deployment-zone list.
 * Coordinates are geographic truth — only change them to fix the map's geography.
 * See docs/architecture/information-architecture.md (Home hero · map honesty rule).
 */

export type TownRole = 'hq' | 'town' | 'hub';

export interface CoverageTown {
  id: string;
  name: string;
  /** Show a text label on the hero map (only major towns are labeled). */
  label: boolean;
  /** Marker role → legend color. hq=green, town=brass, hub=orange (regional hub). */
  role: TownRole;
  /** Map-unit coordinates (east, south). Shared by markers AND corridor links. */
  x: number;
  y: number;
  county: 'Calaveras' | 'Tuolumne';
  /** Whether the data.sierragridteam.org feed currently covers this town (Hwy 4 corridor). */
  hasLiveData: boolean;
}

/** Six towns in true relative geography. Murphys is HQ. */
export const towns: readonly CoverageTown[] = [
  {
    id: 'angels-camp',
    name: 'Angels Camp',
    label: true,
    role: 'town',
    x: 6,
    y: 174,
    county: 'Calaveras',
    hasLiveData: true,
  },
  {
    id: 'murphys',
    name: 'Murphys',
    label: true,
    role: 'hq',
    x: 50,
    y: 133,
    county: 'Calaveras',
    hasLiveData: true,
  },
  {
    id: 'arnold',
    name: 'Arnold',
    label: true,
    role: 'town',
    x: 109,
    y: 51,
    county: 'Calaveras',
    hasLiveData: true,
  },
  {
    id: 'dorrington',
    name: 'Dorrington',
    label: false,
    role: 'town',
    x: 153,
    y: 15,
    county: 'Calaveras',
    hasLiveData: false,
  },
  {
    id: 'columbia',
    name: 'Columbia',
    label: false,
    role: 'town',
    x: 82,
    y: 203,
    county: 'Tuolumne',
    hasLiveData: false,
  },
  {
    id: 'sonora',
    name: 'Sonora',
    label: true,
    role: 'hub',
    x: 91,
    y: 239,
    county: 'Tuolumne',
    hasLiveData: false,
  },
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
    path: ['angels-camp', 'murphys', 'arnold', 'dorrington'],
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
 * Owned/static operational values (no live feed exists for these yet — see
 * FR-5/FR-6 in docs/architecture/data-feed.md). Editable WITHOUT a code change.
 */
export const operations = {
  /** "Relay Sites" stat tile — count of deployed relay locations. */
  relaySitesActive: 6,
  /** "Coverage" stat tile scope. */
  coverageCounties: 2,
  /** Deployment zones listed on /mesh. `live` flags whether the feed covers it. */
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
 * foothills). Used by `isInServiceArea` (src/lib/ersn.ts) to filter the region-wide
 * hazard feeds — e.g. the `road_incident` layer spans the whole Mother Lode (Modesto,
 * Lake Tahoe, Merced) — down to what's actually local. Tuned to include the Hwy 4 / 49 /
 * 108 / 120 corridors and exclude the Central Valley, Tahoe basin, and El Dorado/Placer
 * foothills. Widen only to match real geography.
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
 * Separate from the hero CoverageMap's stylized x/y projection. `role`: hq=green,
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
