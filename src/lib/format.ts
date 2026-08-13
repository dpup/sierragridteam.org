/**
 * format.ts — small display-formatting helpers shared across SSR + client islands.
 * Pure (no DOM/fetch), safe to import server-side and into browser bundles.
 */
import { TIMEZONE } from '../config/site';

/**
 * HTML-escape a value for safe interpolation into a markup string (text OR attribute
 * context) — used by the /live render functions and the map popup, which build HTML by
 * hand (no JSX auto-escaping). Escapes the five… well, four that matter for our contexts.
 */
export const escapeHtml = (s: unknown): string =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string
  );

/**
 * Format an ISO timestamp as `HH:MM PT` in the site timezone (24h). Returns an em dash
 * for null/unparseable input. The "Synced "/"Last known" framing is the caller's.
 */
export function formatPtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    const t = new Intl.DateTimeFormat('en-GB', {
      timeZone: TIMEZONE,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(iso));
    return `${t} PT`;
  } catch {
    return '—';
  }
}

/**
 * Format an ISO timestamp as `Thu 05:00 PT` — `formatPtTime` plus the weekday, for a time
 * that may not be today. A scheduled weather alert's onset is routinely a day or two out,
 * and a bare clock time would read as "this morning". Returns null (not an em dash) for
 * unusable input, so callers can drop the phrase rather than print a placeholder time.
 */
export function formatPtDayTime(iso: string | null | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const t = new Intl.DateTimeFormat('en-GB', {
      timeZone: TIMEZONE,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(d);
    return `${t} PT`;
  } catch {
    return null;
  }
}
