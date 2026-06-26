/**
 * Per-page Open Graph card content. Each becomes /og/<slug>.png at build time
 * (src/pages/og/[slug].png.ts) and is referenced by <Seo> per route.
 * Keep titles short — they render at 64px on the card.
 */
import type { OgCard } from '@lib/og';
import { home, mesh, alerts, contact } from './content';
import { site } from './site';

export const ogCards: Record<string, OgCard> = {
  home: {
    kicker: 'Calaveras & Tuolumne Counties',
    title: `${home.hero.headlineMuted} ${home.hero.headlineStrong}`,
    subtitle: site.tagline,
  },
  mesh: {
    kicker: mesh.kicker,
    title: mesh.title,
    subtitle: 'Live LoRa / Meshtastic coverage across the Highway 4 & 49 corridors.',
  },
  alerts: {
    kicker: alerts.kicker,
    title: alerts.title,
    subtitle: 'Weather, fire-weather & road conditions for the foothills.',
  },
  contact: {
    kicker: contact.kicker,
    title: contact.title,
    subtitle: 'Volunteer as a ham operator, LoRa tech, or emergency-management liaison.',
  },
  default: {
    kicker: site.name,
    title: site.legalName,
    subtitle: site.tagline,
  },
};

/** Map a route path to its OG card slug (unknown paths → the default card). */
export function ogSlugForPath(path: string): string {
  const slug = path === '/' ? 'home' : path.replace(/^\//, '').replace(/\/$/, '');
  return slug in ogCards ? slug : 'default';
}
