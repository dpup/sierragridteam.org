/**
 * partners.ts — organizations S.I.E.R.R.A works with. One list drives two places: the
 * /partners page (each entry in full) and the homepage Supporters band (logos only).
 *
 * Edit this file to add or remove a partner; neither the page nor the band needs touching.
 * Layout lives in `src/components/PartnerCard.astro` and `src/components/home/Supporters.astro`.
 *
 * ⚠️ **Only list an organization once the relationship is real and they have agreed to be
 * named.** Both places are a public claim about someone else's business, and a logo on a
 * nonprofit's site reads as an endorsement in both directions. Describe the partnership
 * only in terms we can stand behind — if we do not know whether it was hardware, money or
 * time, say nothing about which rather than guessing (docs/content-style-guide.md §3).
 *
 * Logos are the organization's OWN mark, used as supplied, and are deliberately not
 * recolored to the palette: a partner's brand is theirs, not ours to restyle. They are the
 * one sanctioned place on the site where non-palette color appears in an image.
 */
import type { ImageMetadata } from 'astro';
import heltecLogo from '../assets/partners/heltec-automation.png';
import ersnLogo from '../assets/partners/ersn.webp';

export interface Partner {
  /** Legal/product name, exactly as the organization writes it. */
  name: string;
  /**
   * What kind of partner they are, in Title Case — rendered as the small uppercase label
   * above the name (e.g. "Technology Partner", "Tower Partner", "Cooperating Agency").
   */
  category: string;
  /**
   * The /partners write-up. Agreed with the partner: keep it to what they do and what they
   * provide, and fix only canonical spellings (S.I.E.R.R.A, place and agency names).
   */
  description: string;
  logo: ImageMetadata;
  /** Alt text. The logo IS the content here, so the alt names the organization. */
  logoAlt: string;
  /** Their own site. Opens in a new tab, `rel="noopener external"`. */
  url: string;
}

export const partners: readonly Partner[] = [
  {
    name: 'Heltec Automation',
    category: 'Technology Partner',
    // Copy provided by Jay Goldberg (2026-10); only the S.I.E.R.R.A spelling and the dash
    // spacing are changed to house style.
    description:
      'Heltec Automation is a technology company specializing in smart, low-power IoT ' +
      'hardware, long-range LoRa wireless communication devices, and developer tools. In ' +
      'partnership with S.I.E.R.R.A (Signal Integrity & Emergency Radio Response Alliance), ' +
      'Heltec provides robust, off-grid radio hardware — such as solar-compatible LoRa nodes, ' +
      'compact tracking devices, and developer boards — that serves as the technical backbone ' +
      'for the Calaveras County Mesh efforts.',
    logo: heltecLogo,
    logoAlt: 'Heltec Automation',
    url: 'https://heltec.org/',
  },
  {
    // ERSN's site writes the name both with and without the apostrophe; its title, sidebar
    // and footer agree on none.
    name: 'Ebbetts Radio Safety Net',
    category: 'Community Partner',
    // Drafted from ersn.net's own description (2026-10). Every fact is theirs: the founding
    // year, the two repeaters, the weekly nets, and that S.I.E.R.R.A grew out of ERSN.
    description:
      'The Ebbetts Radio Safety Net (ERSN) is a volunteer organization that has provided ' +
      'emergency communications to Arnold and Murphys since 2024. It runs two General Mobile ' +
      'Radio Service (GMRS) repeaters — one on Arnold Summit, one in Murphys — covering parts ' +
      'of the Highway 4 corridor, and holds weekly practice nets open to licensed operators. ' +
      'S.I.E.R.R.A grew out of ERSN, where founder Jay Goldberg runs the Murphys net.',
    logo: ersnLogo,
    logoAlt: 'Ebbetts Radio Safety Net (ERSN)',
    url: 'https://ersn.net/',
  },
];
