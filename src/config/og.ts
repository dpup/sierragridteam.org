/**
 * Per-page Open Graph card content. Each becomes /og/<slug>.png at build time
 * (src/pages/og/[slug].png.ts) and is referenced by <Seo> per route.
 * Keep titles short — they render at 64px on the card.
 */
import type { OgCard } from '@lib/og';
import { home, mesh, live, contact, about, donate, blog } from './content';
import { people } from './people';
import { site } from './site';

/** One card per profile page — /about/<slug> maps to the "about-<slug>" card. */
const personCards = Object.fromEntries(
  people.map((p) => [`about-${p.slug}`, { kicker: p.role, title: p.name, subtitle: p.summary }])
);

export const ogCards: Record<string, OgCard> = {
  home: {
    kicker: 'Calaveras & Tuolumne Counties',
    title: `${home.hero.headlineMuted} ${home.hero.headlineStrong}`,
    subtitle: site.tagline,
  },
  mesh: {
    kicker: mesh.kicker,
    title: mesh.title,
    subtitle: 'Live LoRa / MeshCore coverage across the Highway 4 & 49 corridors.',
  },
  live: {
    kicker: live.kicker,
    title: live.heading,
    subtitle: 'Live wildfire, evacuation, weather & road feeds for the foothills.',
  },
  contact: {
    kicker: contact.kicker,
    title: contact.title,
    subtitle: 'Volunteer as a ham operator, LoRa tech, or emergency-management liaison.',
  },
  about: {
    kicker: about.kicker,
    title: about.title,
    subtitle: 'An all-volunteer non-profit for the Calaveras & Tuolumne foothills.',
  },
  donate: {
    kicker: donate.kicker,
    title: donate.title,
    subtitle: 'Fund the relays, radios, and training that keep the foothills connected.',
  },
  blog: {
    kicker: blog.kicker,
    title: blog.title,
    subtitle: 'Technology, preparedness, and lessons in emergency communications.',
  },
  'blog-archive': {
    kicker: blog.archive.kicker,
    title: blog.archive.title,
    subtitle: 'Every post, by year and month.',
  },
  default: {
    kicker: site.name,
    title: site.legalName,
    subtitle: site.tagline,
  },
  ...personCards,
};

/** Map a route path to its OG card slug (unknown paths → the default card). */
export function ogSlugForPath(path: string): string {
  // Nested routes flatten to hyphenated slugs ("/about/jay" → "about-jay") since
  // the /og/[slug].png route takes a single path segment.
  const slug =
    path === '/' ? 'home' : path.replace(/^\//, '').replace(/\/$/, '').replaceAll('/', '-');
  return slug in ogCards ? slug : 'default';
}
