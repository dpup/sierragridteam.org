/**
 * supporters.ts — organizations backing the network, for the homepage Supporters band.
 *
 * Edit this file to add or remove a supporter; the band renders whatever is here and hides
 * itself entirely when the list is empty. Layout lives in
 * `src/components/home/Supporters.astro`.
 *
 * ⚠️ **Only list an organization once the relationship is real and they have agreed to be
 * named.** This band is a public claim about someone else's business, and a logo on a
 * nonprofit's homepage reads as an endorsement in both directions. Describe the support
 * only in terms we can stand behind — if we do not know whether it was hardware, money or
 * time, say nothing about which rather than guessing (docs/content-style-guide.md §3).
 *
 * Logos are the organization's OWN mark, used as supplied, and are deliberately not
 * recolored to the palette: a supporter's brand is theirs, not ours to restyle. They are the
 * one sanctioned place on the site where non-palette color appears in an image.
 */
import type { ImageMetadata } from 'astro';
import heltecLogo from '../assets/supporters/heltec-automation.png';

export interface Supporter {
  /** Legal/product name, exactly as the organization writes it. */
  name: string;
  logo: ImageMetadata;
  /** Alt text. The logo IS the content here, so the alt names the organization. */
  logoAlt: string;
  /** Their own site. Opens in a new tab, `rel="noopener external"`. */
  url: string;
}

export const supporters: readonly Supporter[] = [
  {
    name: 'Heltec Automation',
    logo: heltecLogo,
    logoAlt: 'Heltec Automation',
    url: 'https://heltec.org/',
  },
];
