/**
 * The site-wide EmergencyBanner's decision, as pure functions so it can be tested: what (if
 * anything) the band says, and the signature that decides when the `role="alert"` region is
 * rewritten. The banner's client island does the fetching and the DOM; everything it decides
 * is here.
 *
 * Life-safety ONLY, in priority order: an evacuation, a wildfire, a PG&E Public Safety Power
 * Shutoff at Warning stage or under way (`pspsBannerEvent`). All three are read from
 * area-scoped sources; the summary's region-wide severity rollup is never trusted.
 */
import { SEVERITY_RANK, pspsBannerEvent, type HazardFeature, type SummaryDomain } from './hazards';
import { formatPtDayTime } from './format';

export interface BannerInput {
  activeEvacuations: number | null | undefined;
  topEvents: { layer: string; headline: string }[];
  wildfire: { properties?: { headline?: string } }[];
  /** The banner-worthy PSPS (`pspsBannerEvent`), or null when there is none. */
  psps: HazardFeature | null;
}

export interface BannerState {
  active: boolean;
  label: string;
  headline: string;
  /**
   * Changes only when the hazard does. Rewriting a `role="alert"` region re-announces it, so a
   * PSPS signs on its id, stage, status and start — never on its headline, whose customer counts
   * PG&E revises through the day.
   */
  sig: string;
}

/**
 * Is it worth fetching the power layer? The banner polls on every page, and the layer is
 * ~28 KB gzipped of mostly two-customer outage polygons. The summary's `power` domain already
 * carries the highest power severity, and a PSPS is never rated below MODERATE (a Watch is
 * MODERATE), so a confirmed domain topping out at INFO/MINOR is a known "no PSPS".
 *
 * `fetch` — read the layer; `none` — known no PSPS; `unknown` — The Grid can't say.
 */
export function powerCheck(domains: SummaryDomain[] | undefined): 'fetch' | 'none' | 'unknown' {
  const d = domains?.find((x) => x.domain === 'power');
  if (!d) return 'fetch';
  if (d.status === 'UNAVAILABLE') return 'unknown';
  return (SEVERITY_RANK[String(d.highestSeverity).toUpperCase()] ?? 0) >= 2 ? 'fetch' : 'none';
}

/** The banner-worthy PSPS from a fetched power layer, or `undefined` when it can't be read. */
export function pspsFromLayer(
  layer: { features?: HazardFeature[]; metadata?: { sourceStatus?: string } } | null
): HazardFeature | null | undefined {
  if (!layer || layer.metadata?.sourceStatus === 'UNAVAILABLE') return undefined;
  return pspsBannerEvent(layer.features ?? []);
}

/**
 * A PSPS headline with no counts in it (see `sig`) — the counts and the full timeline are one
 * click away on /live. The start is PG&E's plan, so it's worded as one.
 */
function pspsHeadline(f: HazardFeature): string {
  if (String(f.properties.status ?? '').toUpperCase() === 'ACTIVE')
    return 'PG&E has shut off power in parts of the service area';
  const at = formatPtDayTime(f.properties.power?.deEnergizationStart);
  return at
    ? `PG&E plans to shut off power in parts of the service area from ${at}`
    : 'PG&E plans to shut off power in parts of the service area';
}

export function deriveBanner(input: BannerInput): BannerState {
  if ((input.activeEvacuations ?? 0) > 0) {
    const headline =
      input.topEvents.find((h) => h.layer === 'EVACUATION')?.headline ??
      'Active evacuation in the service area';
    return { active: true, label: 'Evacuation', headline, sig: `evac|${headline}` };
  }
  if (input.wildfire.length > 0) {
    const headline =
      input.wildfire[0]?.properties?.headline ?? 'Active wildfire near the foothills';
    return { active: true, label: 'Active Wildfire', headline, sig: `fire|${headline}` };
  }
  if (input.psps) {
    const p = input.psps.properties;
    return {
      active: true,
      label: 'Power Shutoff',
      headline: pspsHeadline(input.psps),
      sig: `psps|${p.id}|${p.power?.stage ?? ''}|${p.status ?? ''}|${p.power?.deEnergizationStart ?? ''}`,
    };
  }
  return { active: false, label: '', headline: '', sig: 'none' };
}
