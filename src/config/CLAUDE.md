# src/config — editable site data

**This is where almost all content edits happen.** Changing values here updates the
whole site without touching any layout, component, or style. This is the safe path
for non-technical edits.

## Files

- **`site.ts`** — organization facts: name, legal name, tagline, **contact email**,
  P.O. Box address, counties, nav links, external URLs, timezone.
- **`content.ts`** — all human-readable page copy (hero, mission, doctrine, mesh,
  live feed, contact). Edit the words here; keep the **voice** institutional and calm
  (no hype, no exclamation-mark marketing). Follow **`docs/content-style-guide.md`** for
  voice, terminology, and the data-honesty rules.
- **`coverage.ts`** — service-area geography: town coordinates + roles (drives the
  homepage map), road corridors, deployment zones, the relay-site count.
- **`people.ts`** — board members & advisors: names, roles, short + full bios, and
  profile photos (imported from `src/assets/profile-photos/`). Drives the About-page
  leadership cards and the `/about/<slug>` profile pages. Bios are the person's own
  factual claims — confirm with them before changing a fact (Jay's and Corrinne's
  full bios are their provided copy; keep them verbatim).

## Safe to change freely

- Any string value (labels, descriptions, headings, town names).
- The contact email, P.O. Box, nav labels, external link URLs.
- The relay-site count and deployment-zone list.
- Adding/removing a volunteer role, a doctrine card's text, a resource link.

## Change carefully

- **Town coordinates (`coverage.ts` `x`/`y`)** are a real geographic projection so
  the map markers and corridor lines stay aligned. Only change them to correct the
  geography, and keep them proportional to real lat/long. After changing, run
  `make screenshots` and check the homepage map.
- **`role`** on a town sets its marker color (`hq`=green, `town`=brass, `hub`=orange).
  Keep exactly one `hq`. Orange (`hub`) should stay rare — it reads as "alert."
- Don't add a color, size, or HTML here — these are data files. Visual rules live in
  `src/styles/tokens.css`.

## Types keep you safe

These files are typed (`as const`, interfaces). If you mistype a field or remove one
a component needs, `make verify` (astro check) will tell you before it ships. Run it.

## After editing

```sh
make verify       # confirms types still line up
make dev          # see it locally
```
