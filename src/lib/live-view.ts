/**
 * live-view.ts — the SINGLE source of truth for /live's data regions, used by BOTH
 * the server (SSR fallback / no-JS / SEO) and the browser (the genuinely-live refresh).
 *
 * /live is client-live: the browser re-fetches data.sierragridteam.org and re-renders these
 * regions in place, so the markup must be identical on both paths. That rules out Astro
 * scoped styles here (Astro doesn't add the scope-id to client-injected HTML), so the
 * CSS for everything rendered below lives globally in `src/styles/live.css`, namespaced
 * under `.live-view`. Keep this module PURE — no DOM, no fetch, no MapLibre — so it can
 * be imported server-side and bundled into the client island alike.
 */
import {
  deriveStream,
  deriveSituationSummary,
  isNotablePower,
  isScheduled,
  layerFeatures,
  STREAM_LAYERS,
  toneFor,
  severityLabel,
  type HazardFeature,
  type HazardsSnapshot,
  type Scanner,
  type SituationSummary,
} from './hazards';
import {
  groupBurnStatus,
  type BurnGroup,
  type BurnStatusEvent,
  type ConditionsResponse,
  type GridSnapshot,
} from './grid';
import { cToF, kmToMi, kmhToMph, degreesToCompass } from './units';
import { escapeHtml as esc, formatPtTime, formatPtDayTime, formatPtDate } from './format';
import { mapSites, serviceAreaBounds } from '../config/coverage';
import { live as copy } from '../config/content';

type StatusTone = 'ok' | 'elevated' | 'alarm';
type TileState = 'ok' | 'elevated' | 'alarm' | 'muted';

export interface LiveMapData {
  towns: { type: 'FeatureCollection'; features: unknown[] };
  layers: Record<string, { type: 'FeatureCollection'; features: HazardFeature[] }>;
  bounds: typeof serviceAreaBounds;
}

export interface LiveView {
  status: { tone: StatusTone; label: string; blink: boolean };
  /** The h1's two lines, generated from the stream (see `renderHeadline`). */
  headline: string;
  syncedLabel: string;
  tiles: Record<
    'wildfires' | 'evacuations' | 'weatherAlerts' | 'fireWeather',
    {
      value: string;
      state: TileState;
      /** When set, the tile links (same-page) to the matching detail — the alert stream.
       *  Present only when there's actually something there to jump to (count > 0). */
      href?: string;
    }
  >;
  mapData: LiveMapData;
  /** Pre-rendered HTML for each data-driven region (SSR set:html + client innerHTML).
   *  `figures` is the header's row of four, rendered from `tiles`. */
  html: {
    figures: string;
    weather: string;
    burn: string;
    stream: string;
    roads: string;
    scanners: string;
  };
}

// ---- small helpers ----

const shortName = (n: string) => n.replace(/,\s*CA$/i, '');
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const titleCaseRoad = (s: string) =>
  s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/_/g, ' ');

// ---- weather band (was WeatherBand + WeatherIcon) ----

/** OpenWeatherMap icon code / condition → a Lucide-style glyph name. */
function weatherIconName(code: string, main: string): string {
  const p = (code || '').slice(0, 2);
  if (p === '01') return 'sun';
  if (p === '02') return 'cloud-sun';
  if (p === '03' || p === '04') return 'cloud';
  if (p === '09' || p === '10') return 'cloud-rain';
  if (p === '11') return 'cloud-lightning';
  if (p === '13') return 'cloud-snow';
  if (p === '50') return 'cloud-fog';
  const m = (main || '').toLowerCase();
  if (m.includes('clear')) return 'sun';
  if (m.includes('rain') || m.includes('drizzle')) return 'cloud-rain';
  if (m.includes('snow')) return 'cloud-snow';
  if (m.includes('thunder')) return 'cloud-lightning';
  if (m.includes('fog') || m.includes('mist') || m.includes('haze')) return 'cloud-fog';
  return 'cloud';
}

const ICON_PATHS: Record<string, string> = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
  cloud: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  'cloud-sun':
    '<path d="M12 2v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="M20 12h2"/><path d="m19.07 4.93-1.41 1.41"/><path d="M15.947 12.65a4 4 0 0 0-5.925-4.128"/><path d="M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
  'cloud-rain':
    '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>',
  'cloud-snow':
    '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M8 15h.01"/><path d="M8 19h.01"/><path d="M12 17h.01"/><path d="M12 21h.01"/><path d="M16 15h.01"/><path d="M16 19h.01"/>',
  'cloud-lightning':
    '<path d="M6 16.326A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 .5 8.973"/><path d="m13 12-3 5h4l-3 5"/>',
  'cloud-fog':
    '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 17H7"/><path d="M17 21H9"/>',
};

function weatherIconSvg(code: string, main: string): string {
  const paths = ICON_PATHS[weatherIconName(code, main)] ?? ICON_PATHS.cloud;
  return (
    `<svg class="wicon wband__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
    `stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
  );
}

function wind(kmh: number, deg: number): string {
  return kmhToMph(kmh) <= 1 ? 'Calm' : `${kmhToMph(kmh)} mph ${degreesToCompass(deg)}`;
}

function renderWeather(conditions: ConditionsResponse | null): string {
  const towns = conditions?.weather ?? [];
  if (towns.length === 0) return '';
  const items = towns
    .map((w) => {
      const name = shortName(w.locationName);
      return (
        `<li class="wband__item"><details class="wband__details" name="weather-pop">` +
        `<summary class="wband__chip">${weatherIconSvg(w.weatherIcon, w.weatherMain)}` +
        `<span class="wband__town">${esc(name)}</span>` +
        `<span class="wband__temp">${cToF(w.temperatureCelsius)}&deg;</span></summary>` +
        `<div class="wband__pop"><p class="wband__poptitle">${esc(name)}</p>` +
        `<p class="wband__popsky">${esc(titleCase(w.weatherDescription))}</p>` +
        `<dl class="wband__stats">` +
        `<div><dt>Temp</dt><dd>${cToF(w.temperatureCelsius)}&deg;F</dd></div>` +
        `<div><dt>Feels</dt><dd>${cToF(w.feelsLikeCelsius)}&deg;F</dd></div>` +
        `<div><dt>Wind</dt><dd>${esc(wind(w.windSpeedKmh, w.windDirectionDegrees))}</dd></div>` +
        `<div><dt>Humidity</dt><dd>${w.humidityPercent}%</dd></div>` +
        `</dl></div></details></li>`
      );
    })
    .join('');
  return `<ul class="wband" aria-label="${esc(copy.conditionsHeading)}">${items}</ul>`;
}

// ---- burn status (under the weather band) ----

/** `+12097546600` → `(209) 754-6600`; anything else is shown as given. */
function usPhone(e164: string): string {
  const m = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

/** The burn lines to call, each as a `tel:` link — the line itself is the authority. */
function burnLineLinks(counties: BurnStatusEvent[]): string[] {
  return counties.flatMap((c) => {
    const lines = c.burnStatus.burnLines ?? [];
    return lines
      .filter((l) => l.phone)
      .map((l) => {
        const name = lines.length === 1 ? `${c.areaLabel} burn line` : l.name;
        return `<a href="tel:${esc(l.phone)}">${esc(name)} ${esc(usPhone(l.phone))}</a>`;
      });
  });
}

function burnMeta(g: BurnGroup): string[] {
  if (g.verdict === 'calfire') {
    const since = g.counties
      .map((c) => c.burnStatus.calfireEffective)
      .filter((t): t is string => !!t)
      .sort()[0];
    const date = formatPtDate(since);
    const url = g.counties.find((c) => c.canonicalUrl?.startsWith('https://'))?.canonicalUrl;
    return [
      ...(date ? [`Since ${esc(date)}`] : []),
      ...(url
        ? [
            `<a href="${esc(url)}" target="_blank" rel="noopener external">${esc(copy.burn.calfireLink)}<span aria-hidden="true"> &#8599;</span></a>`,
          ]
        : []),
    ];
  }
  const permit =
    g.verdict === 'allowed' &&
    g.counties.some((c) => c.burnStatus.calfireStatus === 'CALFIRE_PERMIT_REQUIRED');
  // The oldest call in the group: the line can only be as current as its stalest reading.
  const called = g.counties
    .flatMap((c) => c.burnStatus.burnLines ?? [])
    .map((l) => l.observation?.observedAt)
    .filter((t): t is string => !!t)
    .sort()[0];
  const calledAt = formatPtDayTime(called);
  return [
    ...(permit ? [esc(copy.burn.permitRequired)] : []),
    ...(calledAt ? [`Called ${esc(calledAt)}`] : []),
    ...burnLineLinks(g.counties),
  ];
}

/**
 * One burn status for the service area: a single line when the counties agree, one per
 * county group when they don't. Rendered beside the weather because that's what it is —
 * a daily condition, not a hazard (CAL FIRE's suspension is a season; a winter no-burn day
 * is about air quality). No orange in any state.
 */
function renderBurn(events: BurnStatusEvent[] | null): string {
  const groups = groupBurnStatus(events);
  if (groups && groups.length === 0) return '';
  const rows = groups
    ? groups.map((g) => {
        const who =
          groups.length > 1
            ? `<span class="burn__county">${esc(g.counties.map((c) => c.areaLabel).join(' & '))}</span>`
            : '';
        const meta = burnMeta(g);
        return (
          `<li class="burn__row">${who}` +
          `<span class="burn__status">${esc(copy.burn[g.verdict])}</span>` +
          (meta.length ? `<span class="burn__meta">${meta.join(' · ')}</span>` : '') +
          `</li>`
        );
      })
    : [
        `<li class="burn__row"><span class="burn__status">${esc(copy.burn.unavailable)}</span></li>`,
      ];
  return (
    `<div class="burn"><p class="burn__label" id="burn-label">${esc(copy.burn.label)}</p>` +
    `<ul class="burn__list" aria-labelledby="burn-label">${rows.join('')}</ul></div>`
  );
}

// ---- alert stream (was AlertStream) ----

/**
 * Wildfire stats as a clean detail string ("120 acres · 30% contained"), or null. Shared by
 * the stream card detail line and the map popup so both surfaces present a point fire alike.
 */
export function wildfireStats(w?: { acres?: number; containment?: number }): string | null {
  if (!w) return null;
  const bits = [
    w.acres != null ? `${w.acres.toLocaleString()} acres` : null,
    w.containment != null ? `${w.containment}% contained` : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : null;
}

/**
 * The display title. CAL FIRE bakes stats into wildfire headlines ("Owl Fire — 120 ac, 30%
 * contained"), which we also render as a clean detail line (wildfireStats). When structured
 * acres/containment exist to show separately, strip that trailing "— …" clause so the title
 * is just the fire name and the numbers aren't shown twice. No clause (e.g. "Salt Springs
 * Fire") → headline unchanged. Shared by the stream card and the map popup.
 */
export function wildfireTitle(
  headline: string,
  w?: { acres?: number; containment?: number }
): string {
  if (w && (w.acres != null || w.containment != null)) {
    const name = headline.split(/\s+[—–]\s+/)[0].trim();
    if (name && name !== headline) return name;
  }
  return headline;
}

/** PG&E's crew codes in plain words; anything unrecognised is dropped rather than shown raw. */
function crewLabel(raw?: string): string | null {
  const c = (raw ?? '').toLowerCase();
  if (/on ?site/.test(c)) return 'Crew on site';
  if (/dispatch|en ?route|assigned/.test(c)) return 'Crew assigned';
  if (/awaiting|t-?man/.test(c)) return 'Awaiting a crew';
  return null;
}

const isUnderWay = (status?: string) => String(status ?? '').toUpperCase() === 'ACTIVE';

/**
 * The kicker for a PSPS that hasn't started. The generic "Begins …" would state a Watch — PG&E
 * is only *considering* a shutoff — as fact; this says how sure PG&E is. Null for anything else.
 */
export function pspsWhen(f: HazardFeature): string | null {
  if (f.properties.category !== 'psps' || isUnderWay(f.properties.status)) return null;
  const at = formatPtDayTime(f.properties.power?.deEnergizationStart ?? f.properties.effective);
  const warning = String(f.properties.power?.stage ?? '').toUpperCase() === 'WARNING';
  if (!at) return warning ? 'Shutoff planned' : 'Shutoff possible';
  return warning ? `Shutoff planned ${at}` : `Shutoff possible ${at}`;
}

/**
 * Power detail ("Power off since Wed 20:00 PT · PG&E estimates restoration Fri 12:00 PT"), or
 * null. Customer and medical-baseline counts are already in the headline, and a PSPS that
 * hasn't started carries its start in the kicker (`pspsWhen`). Every restoration time is
 * PG&E's own estimate, which it routinely overruns, so it is always worded as one — and once
 * it has passed we say so rather than show a stale time as current. Shared by the stream card
 * and the map popup.
 */
export function powerDetail(
  pw: HazardFeature['properties']['power'] | undefined,
  status: string | undefined,
  now: number = Date.now()
): string | null {
  if (!pw) return null;
  const off = isUnderWay(status) ? formatPtDayTime(pw.deEnergizationStart) : null;
  const est = formatPtDayTime(pw.estimatedRestoration);
  const passed = Date.parse(String(pw.estimatedRestoration ?? '')) < now;
  const bits = [
    off ? `Power off since ${off}` : null,
    crewLabel(pw.crewStatus),
    est
      ? passed
        ? `PG&E's restoration estimate (${est}) has passed`
        : `PG&E estimates restoration ${est}`
      : null,
  ].filter(Boolean);
  return bits.length ? bits.join(' · ') : null;
}

function streamExtra(f: HazardFeature, now: number): string | null {
  const p = f.properties;
  if (p.wildfire) return wildfireStats(p.wildfire);
  if (p.power) return powerDetail(p.power, p.status, now);
  if (p.earthquake) {
    const bits = [
      p.earthquake.magnitude != null ? `M${p.earthquake.magnitude}` : null,
      p.earthquake.depthKm != null ? `depth ${p.earthquake.depthKm} km` : null,
    ].filter(Boolean);
    return bits.length ? bits.join(' · ') : null;
  }
  if (p.evacuation) {
    // The headline is "Evacuation {Level} — {what}". Since Grid CHANGELOG 2026-08-11 `{what}`
    // is the zone id (it used to fall back to the county, which made a dozen county-wide
    // activations read identically), so the zone is usually in the title already — add it
    // here only when it isn't. The event type is never in the headline. Tested against the
    // string rather than assumed, so a future format change degrades to showing it twice
    // rather than to dropping the zone entirely.
    const e = p.evacuation;
    const zone = e.zoneId && !p.headline.includes(e.zoneId) ? `Zone ${e.zoneId}` : null;
    return [zone, e.eventType].filter(Boolean).join(' · ') || null;
  }
  return null;
}

function renderStream(items: HazardFeature[], now: number): string {
  if (items.length === 0) return `<p class="stream__empty">${esc(copy.streamEmpty)}</p>`;
  const lis = items
    .map((f) => {
      const tone = toneFor(f);
      const p = f.properties;
      const ex = streamExtra(f, now);
      // Authoritative "more info" page for THIS event (CAL FIRE incident, Genasys evac
      // viewer, …) — from the feed's per-event provenance when present; opens the body so
      // the link is reachable.
      const moreUrl = p.provenance?.sourceUrl;
      const hasBody = !!(ex || p.description || moreUrl);
      // An issued-but-not-yet-in-force alert is marked in the kicker, where it is visible
      // with the card collapsed. `effective` carries the hazard's onset (Grid 2026-08-11);
      // when the product publishes none we say so plainly rather than invent a start time.
      const when =
        pspsWhen(f) ??
        (isScheduled(f, now)
          ? (() => {
              const at = formatPtDayTime(p.effective);
              return at ? `Begins ${at}` : 'Not yet in effect';
            })()
          : null);
      const head =
        `<span class="stream__head"><span class="stream__kicker">` +
        `<span class="stream__sev">${esc(severityLabel(String(p.severity)))}</span>` +
        `<span class="stream__kind">${esc(p.kind)}</span>` +
        (when ? `<span class="stream__when">${esc(when)}</span>` : '') +
        `</span>` +
        `<span class="stream__title">${esc(wildfireTitle(p.headline, p.wildfire))}</span>` +
        (p.areaLabel ? `<span class="stream__where">${esc(p.areaLabel)}</span>` : '') +
        `</span>`;
      const source = p.source?.name
        ? `<span class="stream__source">${esc(p.source.name)}</span>`
        : '';
      // data-hazard-id links the card to its map feature — hovering/focusing it highlights
      // the feature on the /live map (wired in the page controller). Harmless for stream
      // items with no map geometry (weather/fire-weather banners): the highlight no-ops.
      const hid = `data-hazard-id="${esc(p.id)}"`;
      if (hasBody) {
        return (
          `<li><details class="stream__card stream__card--${tone}" ${hid}>` +
          `<summary class="stream__summary">${head}` +
          `<span class="stream__meta">${source}<span class="stream__chevron" aria-hidden="true"></span></span></summary>` +
          `<div class="stream__body">` +
          (ex ? `<p class="stream__extra">${esc(ex)}</p>` : '') +
          (p.description ? `<p class="stream__desc">${esc(p.description)}</p>` : '') +
          (moreUrl
            ? `<p class="stream__more"><a href="${esc(moreUrl)}" target="_blank" rel="noopener external">More information<span aria-hidden="true"> &#8599;</span></a></p>`
            : '') +
          `</div></details></li>`
        );
      }
      return (
        `<li><div class="stream__card stream__card--static stream__card--${tone}" ${hid}>` +
        `<div class="stream__summary">${head}<span class="stream__meta">${source}</span></div></div></li>`
      );
    })
    .join('');
  return `<ul class="stream">${lis}</ul>`;
}

// ---- road conditions (was RoadConditions) ----

function roadTone(status: string, chain: string): 'ok' | 'alarm' | 'elevated' {
  const s = status.toUpperCase();
  if (s.includes('CLOSED')) return 'alarm';
  if (s !== 'OPEN' || (chain && chain.toUpperCase() !== 'NONE')) return 'elevated';
  return 'ok';
}

/**
 * Chain-control status for a segment. The Grid splits chain controls into their own
 * `chain_control` layer; we match one to a road by `road.roadId` and show its severity, or
 * "None" when nothing references the road (honest — no active chain control). Best-effort:
 * if chain_control features don't carry `roadId`, this degrades to "None" until verified.
 */
function chainFor(roadId: string | undefined, chains: HazardFeature[]): string {
  if (!roadId) return 'None';
  const m = chains.find((c) => c.properties.road?.roadId === roadId);
  return m ? severityLabel(String(m.properties.severity)) : 'None';
}

/**
 * Road-conditions table, built from the `road_segment` hazard layer (each corridor is one
 * LineString feature; travel/congestion/delay live in `properties.road`). Road *incidents*
 * are a separate layer surfaced in the alert stream, so the table no longer repeats them.
 */
function renderRoads(segments: HazardFeature[], chains: HazardFeature[]): string {
  if (segments.length === 0) return '';
  const cards = segments
    .map((f) => {
      const p = f.properties;
      const road = p.road ?? {};
      const status = p.status ?? 'open';
      const chain = chainFor(road.roadId, chains);
      const t = roadTone(status, chain === 'None' ? '' : chain);
      const delay = road.delayMinutes ?? 0;
      return (
        // data-hazard-id links the card to its map corridor — hovering it highlights the
        // road_segment line on the /live map (wired in the page controller), mirroring the
        // alert-stream ↔ map hover.
        `<article class="road road--${t}" data-hazard-id="${esc(p.id)}">` +
        `<header class="road__head"><div>` +
        `<span class="road__name">${esc(p.headline)}</span>` +
        (p.areaLabel ? `<span class="road__section">${esc(p.areaLabel)}</span>` : '') +
        `</div>` +
        `<span class="road__status road__status--${t}"><span class="road__dot" aria-hidden="true"></span>` +
        `${esc(titleCaseRoad(status))}</span></header>` +
        `<dl class="road__metrics">` +
        `<div><dt>Travel</dt><dd>${road.durationMinutes != null ? `${road.durationMinutes} min` : '—'}</dd></div>` +
        `<div><dt>Distance</dt><dd>${road.distanceKm != null ? `${kmToMi(road.distanceKm)} mi` : '—'}</dd></div>` +
        `<div><dt>Delay</dt><dd>${delay > 0 ? `+${delay} min` : 'None'}</dd></div>` +
        `<div><dt>Chains</dt><dd>${esc(chain)}</dd></div>` +
        `</dl>` +
        // The reason a segment is restricted/closed lives in its `description` (the new
        // road_segment layer carries it here — the old /roads bundled it as per-road
        // `alerts`). Open segments have none. Reuses the incident styling.
        (p.description
          ? `<ul class="road__incidents"><li class="road__incident">${esc(p.description)}</li></ul>`
          : '') +
        `</article>`
      );
    })
    .join('');
  return `<div class="roads">${cards}</div>`;
}

// ---- scanners (was ScannerLinks) ----

function renderScanners(scanners: Scanner[]): string {
  if (scanners.length === 0) return '';
  const lis = scanners
    .map(
      (s) =>
        `<li><a class="scanner" href="${esc(s.broadcastifyUrl)}" target="_blank" rel="noopener external">` +
        `<span class="scanner__label">${esc(s.channelLabel)}` +
        `<span class="scanner__arrow" aria-hidden="true">&#8599;</span></span>` +
        `<span class="scanner__agency">${esc(s.agency)}</span></a></li>`
    )
    .join('');
  return `<ul class="scanners">${lis}</ul>`;
}

// ---- map data ----

function buildMapData(haz: HazardsSnapshot): LiveMapData {
  const towns = {
    type: 'FeatureCollection' as const,
    features: mapSites.map((s) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [s.lng, s.lat] },
      properties: { name: s.name },
    })),
  };
  const chains = layerFeatures(haz, 'chain_control');
  const layers: Record<string, { type: 'FeatureCollection'; features: HazardFeature[] }> = {};
  for (const l of [
    'road_segment',
    'road_incident',
    'wildfire',
    'evacuation',
    'earthquake',
    'power',
  ]) {
    let feats = layerFeatures(haz, l);
    // Same cut as the stream, so every mapped outage has a card and vice versa.
    if (l === 'power') feats = feats.filter(isNotablePower);
    // MapLibre paint can't index nested props / call our helpers — promote what it needs.
    if (l === 'earthquake') {
      feats = feats.map((f) => ({
        ...f,
        properties: { ...f.properties, magnitude: f.properties.earthquake?.magnitude ?? 1 },
      }));
    }
    // Promote each corridor's display tone (the SAME roadTone as the table) so the map's
    // line paint can color it — open/clear stays neutral, restricted/congested/chained
    // escalates to brass. Orange is never used for a road (life-safety only).
    if (l === 'road_segment') {
      feats = feats.map((f) => {
        const chain = chainFor(f.properties.road?.roadId, chains);
        const tone = roadTone(f.properties.status ?? 'open', chain === 'None' ? '' : chain);
        return { ...f, properties: { ...f.properties, tone } };
      });
    }
    layers[l] = { type: 'FeatureCollection', features: feats };
  }
  return { towns, layers, bounds: serviceAreaBounds };
}

// ---- the view model ----

const FIRE: Record<string, { label: string; state: TileState }> = {
  RED_FLAG: { label: 'Red Flag', state: 'alarm' },
  ELEVATED: { label: 'Elevated', state: 'elevated' },
  NORMAL: { label: 'Normal', state: 'ok' },
  UNKNOWN: { label: 'Unknown', state: 'muted' },
};

/** The alert stream's heading — the count tiles jump here when they have detail to show. */
const STREAM_ANCHOR = '#stream-title';

/**
 * The Weather Alerts tile. An alert issued today for Thursday's storms is real and belongs
 * on the page, but it is not in effect — labelling it "Active" would say the weather is on
 * us now. In-effect alerts lead; upcoming ones are the headline only when nothing is in
 * force yet, and are never folded into the same number.
 */
function weatherAlertTile(s: SituationSummary): LiveView['tiles']['weatherAlerts'] {
  // Both counts come off the same layer's sourceStatus, so they go unknown together.
  if (s.weatherAlerts == null || s.weatherAlertsUpcoming == null)
    return { value: 'Unknown', state: 'muted' };
  if (s.weatherAlerts > 0)
    return { value: `${s.weatherAlerts} Active`, state: 'elevated', href: STREAM_ANCHOR };
  if (s.weatherAlertsUpcoming > 0)
    return { value: `${s.weatherAlertsUpcoming} Upcoming`, state: 'elevated', href: STREAM_ANCHOR };
  return { value: 'None', state: 'ok' };
}

// ---- Header: the generated headline and the four figures ----

/**
 * The h1, generated from the alert stream, on /mesh's two-line pattern: the count in muted
 * ink (the alert orange when a SEVERE+ hazard is in the stream), the claim in full.
 *
 * Honesty (content-style-guide §10): a quiet stream is "no active alerts from the feeds we
 * watch" — never "all clear", which is a claim about the foothills, not the feeds. And if any
 * stream feed could not be read, the headline says so instead of counting what it did read:
 * "No active alerts" over a dead wildfire feed would be exactly the false all-clear the page
 * must never show.
 */
export function renderHeadline(
  haz: HazardsSnapshot,
  stream: HazardFeature[],
  tone: StatusTone
): string {
  const lead = (t: string) =>
    `<span class="page-head__lead${tone === 'alarm' ? ' page-head__lead--alarm' : ''}">${esc(t)}</span>`;
  const rest = (t: string) => `<span class="page-head__rest">${esc(t)}</span>`;
  const unreadable = STREAM_LAYERS.some(
    (l) => (haz.layers?.[l]?.metadata?.sourceStatus ?? 'UNAVAILABLE') === 'UNAVAILABLE'
  );
  const n = stream.length;
  const alerts = `${n} ${n === 1 ? 'alert' : 'alerts'}`;
  if (unreadable) {
    return n
      ? `${lead(alerts)} ${rest(copy.headline.someUnreadable)}`
      : `${lead(copy.headline.unreadableLead)} ${rest(copy.headline.unreadableRest)}`;
  }
  return n
    ? `${lead(alerts)} ${rest(copy.headline.alerts)}`
    : `${lead(copy.headline.quietLead)} ${rest(copy.headline.quietRest)}`;
}

const FIGURES: { key: keyof LiveView['tiles']; label: string; sub: string }[] = [
  { key: 'wildfires', label: 'Wildfires', sub: 'CAL FIRE' },
  { key: 'evacuations', label: 'Evacuations', sub: 'Cal OES' },
  { key: 'weatherAlerts', label: 'Weather alerts', sub: 'NWS foothill zones' },
  { key: 'fireWeather', label: 'Fire weather', sub: 'Calaveras & Tuolumne' },
];

/**
 * The header's four figures, on /mesh's pattern: a label, a serif value, its source — no
 * boxes. The value takes the state's colour (orange for an alarm, brass when elevated) and,
 * when there is detail to jump to, links down to the alert stream.
 */
function renderFigures(tiles: LiveView['tiles']): string {
  return FIGURES.map(({ key, label, sub }) => {
    const t = tiles[key];
    const value = t.href
      ? `<a class="live-figure__link" href="${esc(t.href)}">${esc(t.value)}</a>`
      : esc(t.value);
    return (
      `<div class="live-figure" data-state="${t.state}">` +
      `<p class="live-figure__label">${esc(label)}</p>` +
      `<p class="live-figure__value">${value}</p>` +
      `<p class="live-figure__sub">${esc(sub)}</p>` +
      `</div>`
    );
  }).join('');
}

/**
 * Build the entire /live view-model from the two snapshots (identical SSR + client).
 *
 * `now` decides whether an issued alert has started yet; it's a parameter so the function
 * stays pure and the screenshot harness's frozen clock reaches it. Live callers take the
 * default.
 */
export function buildView(
  haz: HazardsSnapshot,
  grid: GridSnapshot,
  now: number = Date.now()
): LiveView {
  const summary = deriveSituationSummary(haz, now);
  const stream = deriveStream(haz);
  const fire = FIRE[summary.fireWeather] ?? FIRE.UNKNOWN;

  const status: LiveView['status'] =
    summary.highestRank >= 3
      ? { tone: 'alarm', label: 'Active Incident', blink: true }
      : summary.highestRank === 2
        ? { tone: 'elevated', label: 'Advisory', blink: false }
        : { tone: 'ok', label: 'Operational', blink: false };

  // A count tile jumps down to its detail in the alert stream — but only when there's
  // actually something to see (count > 0). "None"/"Unknown" stay inert (no false promise
  // of detail). `n` is number|null: null (unknown) and 0 (none) are both falsy → no link.
  const streamLink = (n: number | null) => (n ? STREAM_ANCHOR : undefined);

  const tiles: LiveView['tiles'] = {
    wildfires: {
      value:
        summary.wildfires == null
          ? 'Unknown'
          : summary.wildfires > 0
            ? `${summary.wildfires} Active`
            : 'None',
      state: summary.wildfires == null ? 'muted' : summary.wildfires > 0 ? 'alarm' : 'ok',
      href: streamLink(summary.wildfires),
    },
    evacuations: {
      value:
        summary.evacuations == null
          ? 'Unknown'
          : summary.evacuations > 0
            ? `${summary.evacuations} Zones`
            : 'None',
      state: summary.evacuations == null ? 'muted' : summary.evacuations > 0 ? 'alarm' : 'ok',
      href: streamLink(summary.evacuations),
    },
    weatherAlerts: weatherAlertTile(summary),
    fireWeather: { value: fire.label, state: fire.state },
  };

  return {
    status,
    headline: renderHeadline(haz, stream, status.tone),
    syncedLabel: `Synced ${formatPtTime(summary.syncedAt)}`,
    tiles,
    mapData: buildMapData(haz),
    html: {
      figures: renderFigures(tiles),
      weather: renderWeather(grid.conditions),
      burn: renderBurn(grid.burn),
      stream: renderStream(stream, now),
      roads: renderRoads(layerFeatures(haz, 'road_segment'), layerFeatures(haz, 'chain_control')),
      scanners: renderScanners(haz.scanners ?? []),
    },
  };
}
