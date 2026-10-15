/**
 * Regenerates src/assets/hero-map.svg — the county + highway linework behind the homepage
 * hero — and src/assets/service-counties.json, the same Calaveras + Tuolumne outlines as
 * lon/lat GeoJSON for the /mesh map's service-area tint. Run `npm run hero-map` (network
 * required); both outputs are checked in, so a build never fetches. Sources: US Census TIGERweb (county polygons) and the Caltrans State Highway
 * Network (routes), both public.
 *
 * The SVG carries CLASSES, not colors: Hero.astro styles them with tokens. Its viewBox is in
 * hero "column space" — the centered 1320px content column, (0,0) at its top-left — shared
 * with the mesh overlay (`heroProject` in src/config/coverage.ts). Change the projection in
 * both places together, then re-run this.
 */
import { writeFileSync } from 'node:fs';
import { HERO_PROJECTION as PR } from '../src/config/coverage';

type Pt = [number, number];

const ENV = '-122.3,37.7,-118.9,38.7';
const ROUTES = [4, 12, 26, 49, 88, 89, 108, 120, 395];
const COS = Math.cos((PR.latRef * Math.PI) / 180);
// The map runs 1100px past each side of the column and 200px above and below the hero.
const VX0 = -1100,
  VY0 = -200,
  VW = 3520,
  VH = 1211;
const P = ([lon, lat]: number[]): Pt => [
  PR.x + (lon - PR.lon) * PR.k * COS,
  PR.y - (lat - PR.lat) * PR.k,
];

const query = (base: string, where: string, fields: string, offset: number) =>
  `${base}/query?where=${encodeURIComponent(where)}&geometry=${ENV}` +
  '&geometryType=esriGeometryEnvelope&inSR=4326&spatialRel=esriSpatialRelIntersects' +
  `&outFields=${fields}&outSR=4326&maxAllowableOffset=${offset}&f=geojson`;

const getJson = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
};

const [counties, shn] = await Promise.all([
  getJson(
    query(
      'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/1',
      "STATE='06'",
      'NAME',
      0.0007
    )
  ),
  getJson(
    query(
      'https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/SHN_Lines/FeatureServer/0',
      `Route IN (${ROUTES})`,
      'Route',
      0.0005
    )
  ),
]);

/** Ramer–Douglas–Peucker simplification, in column pixels. */
function rdp(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const a = pts[0]!,
    b = pts[pts.length - 1]!;
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    len = Math.hypot(dx, dy);
  let dmax = 0,
    idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i]!;
    const d = len
      ? Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len
      : Math.hypot(p[0] - a[0], p[1] - a[1]);
    if (d > dmax) {
      dmax = d;
      idx = i;
    }
  }
  if (dmax <= eps) return [a, b];
  return rdp(pts.slice(0, idx + 1), eps)
    .slice(0, -1)
    .concat(rdp(pts.slice(idx), eps));
}

const R = Math.round;
const fmt = (p: Pt[]) => p.map((v, i) => `${i ? 'L' : 'M'}${R(v[0])} ${R(v[1])}`).join('');
const inView = (p: Pt) =>
  p[0] > VX0 - 40 && p[0] < VX0 + VW + 40 && p[1] > VY0 - 40 && p[1] < VY0 + VH + 40;

/** An open line, clipped to the view; coarser behind the copy's fade (column x < 450). */
function line(ll: number[][], eps: number): string {
  const pts = rdp(ll.map(P), ll.map(P).every((p) => p[0] < 450) ? 3 : eps);
  let out = '';
  let run: Pt[] = [];
  pts.forEach((p, i) => {
    const keep =
      inView(p) || (i > 0 && inView(pts[i - 1]!)) || (i < pts.length - 1 && inView(pts[i + 1]!));
    if (keep) run.push(p);
    else {
      if (run.length > 1) out += fmt(run);
      run = [];
    }
  });
  return run.length > 1 ? out + fmt(run) : out;
}

type Feature = {
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: any };
};
const rings = (f: Feature): number[][][] =>
  f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat();
const closed = (r: number[][]) => {
  const p = r.map(P),
    h = Math.floor(p.length / 2);
  return fmt(rdp(p.slice(0, h + 1), 1).concat(rdp(p.slice(h), 1).slice(1))) + 'Z';
};
const fill = (name: string) => {
  const f = (counties.features as Feature[]).find((x) => x.properties.NAME === name);
  if (!f) throw new Error(`county not found: ${name}`);
  return rings(f).map(closed).join('');
};
// One path for every county edge, so a shared border isn't drawn twice.
const borders = (counties.features as Feature[])
  .map((f) =>
    rings(f)
      .map((r) => line(r, 1.1))
      .join('')
  )
  .join('');

const routes: Record<string, number[][][]> = {};
for (const f of shn.features as Feature[]) {
  const g = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  (routes[String(f.properties.Route)] ??= []).push(...g);
}
const highways = Object.values(routes)
  .flat()
  .map((s) => line(s, 0.9))
  .join('');

/** The point on a route nearest a lon/lat — where its marker sits. */
const near = (route: number, ll: number[]): Pt => {
  const t = P(ll);
  let best: Pt = t,
    bd = Infinity;
  for (const s of routes[route] ?? [])
    for (const c of s) {
      const p = P(c),
        d = Math.hypot(p[0] - t[0], p[1] - t[1]);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
  return [R(best[0]), R(best[1])];
};
const SHIELDS: [number, number[]][] = [
  [4, [-120.62, 38.03]],
  [49, [-120.47, 37.99]],
  [108, [-120.22, 38.03]],
  [4, [-120.12, 38.43]],
  [108, [-119.75, 38.33]],
  [120, [-119.75, 37.9]],
  [395, [-119.45, 38.25]],
  [89, [-119.75, 38.62]],
];
const shields = SHIELDS.filter(([r]) => routes[r])
  .map(([r, ll]) => {
    const [x, y] = near(r, ll);
    const w = String(r).length > 2 ? 26 : String(r).length > 1 ? 22 : 18;
    return (
      `<g class="hero-map__shield"><rect x="${x - w / 2}" y="${y - 7}" width="${w}" height="14" rx="7"/>` +
      `<text x="${x}" y="${y + 3}">${r}</text></g>`
    );
  })
  .join('');
const label = (t: string, x: number, y: number) =>
  `<text class="hero-map__county-name" x="${x}" y="${y}">${t}</text>`;

const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" width="${VW}" height="${VH}" viewBox="${[VX0, VY0, VW, VH].join(' ')}" fill="none">` +
  `<path class="hero-map__calaveras" d="${fill('Calaveras County')}"/>` +
  `<path class="hero-map__tuolumne" d="${fill('Tuolumne County')}"/>` +
  `<path class="hero-map__borders" d="${borders}"/>` +
  `<path class="hero-map__roads" d="${highways}"/>` +
  shields +
  label('Calaveras', 750, 220) +
  label('Tuolumne', 1135, 760) +
  '</svg>\n';

const out = new URL('../src/assets/hero-map.svg', import.meta.url);
writeFileSync(out, svg);
console.log(`wrote ${out.pathname} (${(svg.length / 1024).toFixed(1)} KB)`);

// The two service-area counties for /mesh, in lon/lat. Simplified in degrees (~0.002° ≈
// 200 m — invisible under a 7% tint) and rounded to 4 places, so the file stays small enough
// to ship in the page bundle.
const lonlat = (r: number[][]) => {
  const pts = rdp(r as Pt[], 0.002);
  return pts.map(([x, y]) => [Math.round(x * 1e4) / 1e4, Math.round(y * 1e4) / 1e4]);
};
const service = {
  type: 'FeatureCollection',
  features: (['Calaveras', 'Tuolumne'] as const).map((name) => {
    const f = (counties.features as Feature[]).find((x) => x.properties.NAME === `${name} County`);
    if (!f) throw new Error(`county not found: ${name}`);
    return {
      type: 'Feature',
      properties: { county: name.toLowerCase() },
      geometry: { type: 'MultiPolygon', coordinates: rings(f).map((r) => [lonlat(r)]) },
    };
  }),
};
const geoOut = new URL('../src/assets/service-counties.json', import.meta.url);
const geo = JSON.stringify(service) + '\n';
writeFileSync(geoOut, geo);
console.log(`wrote ${geoOut.pathname} (${(geo.length / 1024).toFixed(1)} KB)`);
