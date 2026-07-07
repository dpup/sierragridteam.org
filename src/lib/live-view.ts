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
  layerFeatures,
  toneFor,
  severityLabel,
  type HazardFeature,
  type HazardsSnapshot,
  type Scanner,
} from './hazards';
import type { GridSnapshot, RoadsResponse, WeatherResponse } from './grid';
import { cToF, kmToMi, kmhToMph, degreesToCompass } from './units';
import { escapeHtml as esc, formatPtTime } from './format';
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
  /** Pre-rendered HTML for each data-driven region (SSR set:html + client innerHTML). */
  html: { weather: string; stream: string; roads: string; scanners: string };
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

function renderWeather(weather: WeatherResponse | null): string {
  const towns = weather?.weatherData ?? [];
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

function streamExtra(f: HazardFeature): string | null {
  const p = f.properties;
  if (p.wildfire) return wildfireStats(p.wildfire);
  if (p.earthquake) {
    const bits = [
      p.earthquake.magnitude != null ? `M${p.earthquake.magnitude}` : null,
      p.earthquake.depth_km != null ? `depth ${p.earthquake.depth_km} km` : null,
    ].filter(Boolean);
    return bits.length ? bits.join(' · ') : null;
  }
  if (p.evacuation) {
    // Level is already in the headline ("Evacuation Order/Warning — …"); surface the
    // specific Genasys zone + event type instead (the actionable, non-redundant bits).
    const e = p.evacuation;
    return (
      [e.zone_id ? `Zone ${e.zone_id}` : null, e.event_type].filter(Boolean).join(' · ') || null
    );
  }
  return null;
}

function renderStream(items: HazardFeature[]): string {
  if (items.length === 0) return `<p class="stream__empty">${esc(copy.streamEmpty)}</p>`;
  const lis = items
    .map((f) => {
      const tone = toneFor(f);
      const p = f.properties;
      const ex = streamExtra(f);
      // Authoritative "more info" page for THIS event (CAL FIRE incident, Genasys evac
      // viewer, …) — from the feed's per-event provenance when present; opens the body so
      // the link is reachable.
      const moreUrl = p.provenance?.source_url;
      const hasBody = !!(ex || p.description || moreUrl);
      const head =
        `<span class="stream__head"><span class="stream__kicker">` +
        `<span class="stream__sev">${esc(severityLabel(String(p.severity)))}</span>` +
        `<span class="stream__kind">${esc(p.kind)}</span></span>` +
        `<span class="stream__title">${esc(wildfireTitle(p.headline, p.wildfire))}</span>` +
        (p.area_label ? `<span class="stream__where">${esc(p.area_label)}</span>` : '') +
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

function renderRoads(roads: RoadsResponse | null): string {
  const list = roads?.roads ?? [];
  if (list.length === 0) return '';
  const cards = list
    .map((r) => {
      const t = roadTone(r.status, r.chainControl);
      const incidents = r.alerts ?? [];
      return (
        `<article class="road road--${t}">` +
        `<header class="road__head"><div>` +
        `<span class="road__name">${esc(r.name)}</span>` +
        `<span class="road__section">${esc(r.section)}</span></div>` +
        `<span class="road__status road__status--${t}"><span class="road__dot" aria-hidden="true"></span>` +
        `${esc(titleCaseRoad(r.status))}</span></header>` +
        `<dl class="road__metrics">` +
        `<div><dt>Travel</dt><dd>${r.durationMinutes} min</dd></div>` +
        `<div><dt>Distance</dt><dd>${kmToMi(r.distanceKm)} mi</dd></div>` +
        `<div><dt>Delay</dt><dd>${r.delayMinutes > 0 ? `+${r.delayMinutes} min` : 'None'}</dd></div>` +
        `<div><dt>Chains</dt><dd>${esc(titleCaseRoad(r.chainControl || 'None'))}</dd></div>` +
        `</dl>` +
        (incidents.length > 0
          ? `<ul class="road__incidents">${incidents
              .map(
                (a) =>
                  `<li class="road__incident">${esc(
                    a.condensedSummary || a.description || titleCaseRoad(a.type)
                  )}</li>`
              )
              .join('')}</ul>`
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
        `<li><a class="scanner" href="${esc(s.broadcastify_url)}" target="_blank" rel="noopener external">` +
        `<span class="scanner__label">${esc(s.channel_label)}` +
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
  const layers: Record<string, { type: 'FeatureCollection'; features: HazardFeature[] }> = {};
  for (const l of ['road_incident', 'wildfire', 'evacuation', 'earthquake']) {
    let feats = layerFeatures(haz, l);
    // MapLibre paint can't index nested props — promote earthquake magnitude to top level.
    if (l === 'earthquake') {
      feats = feats.map((f) => ({
        ...f,
        properties: { ...f.properties, magnitude: f.properties.earthquake?.magnitude ?? 1 },
      }));
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

/** Build the entire /live view-model from the two snapshots (identical SSR + client). */
export function buildView(haz: HazardsSnapshot, grid: GridSnapshot): LiveView {
  const summary = deriveSituationSummary(haz);
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
  const streamLink = (n: number | null) => (n ? '#stream-title' : undefined);

  return {
    status,
    syncedLabel: `Synced ${formatPtTime(summary.syncedAt)}`,
    tiles: {
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
      weatherAlerts: {
        value:
          summary.weatherAlerts == null
            ? 'Unknown'
            : summary.weatherAlerts > 0
              ? `${summary.weatherAlerts} Active`
              : 'None',
        state:
          summary.weatherAlerts == null ? 'muted' : summary.weatherAlerts > 0 ? 'elevated' : 'ok',
        href: streamLink(summary.weatherAlerts),
      },
      fireWeather: { value: fire.label, state: fire.state },
    },
    mapData: buildMapData(haz),
    html: {
      weather: renderWeather(grid.weather),
      stream: renderStream(stream),
      roads: renderRoads(grid.roads),
      scanners: renderScanners(haz.scanners ?? []),
    },
  };
}
