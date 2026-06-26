/**
 * Central site configuration — the single place to edit organization facts,
 * navigation, contact details, and SEO defaults.
 *
 * SAFE TO EDIT: text values here (names, email, descriptions, nav labels).
 * Changing these updates the whole site without touching any layout or component.
 * Do NOT add colors, sizes, or markup here — those are governed by the design
 * system (src/styles/tokens.css). See src/config/CLAUDE.md.
 */

export const site = {
  /** Canonical production origin (no trailing slash). */
  url: 'https://sierragridteam.org',
  domain: 'sierragridteam.org',

  /** Display name — ALWAYS rendered with periods in visible copy. */
  name: 'S.I.E.R.R.A',
  /** Full legal name — must appear at least once per page (footer is fine). */
  legalName: 'Signal Integrity & Emergency Radio Response Alliance',
  /** Short tagline for meta + lockups. */
  tagline: 'Off-grid emergency communications for the Calaveras & Tuolumne foothills.',
  foundingYear: 2026,

  /**
   * Contact email — the single source of truth. Override at deploy time with the
   * PUBLIC_CONTACT_EMAIL env var, or just edit the default below. Set
   * emailIsPlaceholder back to true if the inbox is ever taken offline (it adds an
   * honest "inbox being established" caveat on /contact and drops it from JSON-LD).
   */
  email: import.meta.env?.PUBLIC_CONTACT_EMAIL ?? 'info@sierragridteam.org',
  emailIsPlaceholder: false,
  address: {
    poBox: 'P.O. Box 2071',
    city: 'Murphys',
    state: 'CA',
    zip: '95247',
    /** Single-line form for footer/meta. */
    line: 'P.O. Box 2071, Murphys, CA 95247',
  },

  counties: ['Calaveras County', 'Tuolumne County'] as const,

  /** Fallback OG image (per-page cards are generated at /og/<slug>.png). */
  ogImage: '/og/default.png',
} as const;

/** Primary navigation. Order is intentional — Mesh is first (flagship capability). */
export const nav: ReadonlyArray<{ label: string; href: string }> = [
  { label: 'Mesh', href: '/mesh' },
  { label: 'Alerts', href: '/alerts' },
  { label: 'Contact', href: '/contact' },
];

/** External destinations referenced across the site. */
export const externalLinks = {
  liveMeshMap: 'https://livemap.wcmesh.com/bayarea/',
  chpCad: 'https://cad.chp.ca.gov/',
  nwsSacramento: 'https://www.weather.gov/sto/',
  calFire: 'https://www.fire.ca.gov/',
  usgsEarthquakes: 'https://earthquake.usgs.gov/earthquakes/map/',
} as const;

/** Timezone for the live clock + "Synced" stamps. */
export const TIMEZONE = 'America/Los_Angeles';

export type SiteConfig = typeof site;
