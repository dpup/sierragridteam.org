# Design Tokens — S.I.E.R.R.A

> **Source of truth:** `docs/design/design-system.html` (v1.0 "Civic Direction").
> This file transcribes that spec into named tokens. The implementation lives in
> `src/styles/tokens.css` as CSS custom properties. **Never hard-code a hex value,
> font, or size in a component — always reference a token.**

The personality to design against, in three words: **Elite · Pioneering · Trustworthy.**
Calm authority and permanence. Read as an established civic institution (a fire
district or county agency), **not** a tech startup. Heritage over flash. No hype,
neon, decorative gradients, or anything trendy/temporary.

---

## 1. Color

Color is **functional, never decorative.** Forest green carries the brand and all
primary actions; brass/gold is the accent for kickers and dividers; a single burnt
orange signals heightened risk **only** — if everything is calm, orange must be
absent from the page.

### Surfaces (warm neutrals — "parchment")
| Token | Hex | Use |
|---|---|---|
| `--surface-page` | `#F3EFE4` | Page base / parchment |
| `--surface-hero` | `#EDEFE7` | Hero band surface |
| `--surface-card` | `#F6F2E7` | Cards / tiles |
| `--surface-banner` | `#EFE9DA` | Banners / call-outs |

### Ink (text)
| Token | Hex | Use |
|---|---|---|
| `--ink-strong` | `#16271E` | Headings (near-black) |
| `--ink-body` | `#3C453C` | Body text |
| `--ink-secondary` | `#5A5E4F` | Secondary text |
| `--ink-muted` | `#9A906F` | Muted / hero headline line 1 |

### Brand & signal
| Token | Hex | Use |
|---|---|---|
| `--brand-green` | `#1D5B3F` | Primary green / brand / links / primary buttons |
| `--brand-green-hover` | `#16472F` | Green hover (one step darker) |
| `--brand-brass` | `#B08A3E` | Brass accent — kickers, thin dividers, secondary-button outline |
| `--brand-brass-text` | `#8A6A26` | Brass text (kicker labels) |
| `--signal-orange` | `#C2410C` | **Risk/alert ONLY** — Red Flag fire weather, regional alert hub |

### Lines / borders
| Token | Hex | Use |
|---|---|---|
| `--line` | `#D8D0BD` | Default 1px border (warm tan) — **borders are never gray** |
| `--line-soft` | `#E5DDCA` | Lighter internal rule (table rows, list separators) |

### Status-dot colors (functional)
| Token | Hex | Meaning |
|---|---|---|
| `--state-ok` | `#1D5B3F` | Operational / normal (also `#2F8A5B` for the lighter "static-owned" feasibility dot) |
| `--state-elevated` | `#B08A3E` | Elevated (brass) |
| `--state-alarm` | `#C2410C` | Red Flag / active alert (orange) |

**Usage rules.** Forest green for all primary buttons, links, and the brand.
Brass/gold only for kicker labels, thin dividers, and secondary-button outlines —
**never large fills.** Burnt orange is reserved exclusively for risk/alert states.
No gradients as decoration; the **only** permitted gradient is the barely-visible
radial green glow behind the hero map. Borders are always warm tan, never gray.

---

## 2. Typography

Three families, each with a strict job:

| Token | Stack | Role |
|---|---|---|
| `--font-display` | `'Newsreader', Georgia, serif` | Display & body — headlines, mission statement, long-form, stat values. Weights 400–500, **never bolder than 600.** Literary serif w/ optical sizing. |
| `--font-ui` | `'IBM Plex Sans', system-ui, sans-serif` | Interface & labels — nav, buttons, stat labels/sublabels, kickers, legends, footer. Weights 400/500/600. |
| `--font-mono` | `'IBM Plex Mono', ui-monospace, monospace` | Data values, codes, section numbers, coordinates. |

**Small UI text** (labels, kickers, nav, legend) is UPPERCASE with wide tracking
(`0.1em`–`0.24em`) to read precise and technical.

### Type scale (desktop)
| Token | Size | Role | Font |
|---|---|---|---|
| `--fs-hero` | 52–54px | Hero headline | Newsreader 500 |
| `--fs-h2` | 36px | Section title | Newsreader 500 |
| `--fs-h3` | 30–32px | Sub-section heading | Newsreader 500 |
| `--fs-mission` | 21px | Mission-statement body | Newsreader 400 |
| `--fs-lead` | 18px | Lead paragraph / subhead | Newsreader 400 |
| `--fs-stat` | 28px | Stat value | Newsreader 500 |
| `--fs-label` | 10–12px | Labels · kickers · nav · legend | IBM Plex Sans 600, UPPERCASE |
| `--fs-body` | 16px | Default body (never below 16px) | Newsreader 400 |

**Responsive:** scale down ~one step on tablet, ~two on mobile; **body never below 16px.**
Headlines use tight tracking (`-0.015em`); uppercase labels use loose tracking
(`0.1`–`0.24em`). Body line-height ~1.6; headline ~1.05.

---

## 3. Geometry & spacing

- **Corners are square** (`--radius: 0`; max 2px anywhere). Sharp edges read as serious.
- **Borders:** 1px, warm tan (`--line`). **Cards never use drop shadows** — they are
  defined by border + a slightly lighter fill.
- **Section rhythm:** ~64–72px vertical padding between major sections.
- **Container:** content max-width ~1280px (nav/hero anchored to ~1320px); gutters ~56px.
- **Spacing scale** (multiples of 4): `4 / 8 / 12 / 14 / 18 / 26 / 48 / 64 / 72`.

| Token | Value |
|---|---|
| `--container-max` | `1280px` |
| `--container-wide` | `1320px` |
| `--gutter` | `56px` |
| `--radius` | `0` |
| `--border` | `1px solid var(--line)` |
| `--space-1`..`--space-9` | `4 8 12 14 18 26 48 64 72` (px) |

---

## 4. Motion

**Restrained.** Honor `prefers-reduced-motion` — disable blinks and pings entirely.

- Status dots: slow opacity blink (~2s).
- Map node markers: soft expanding ring "ping" (~2.4s, staggered).
- Hover: buttons darken/lighten **one step**; links may underline.
- **No transforms, scale-ups, or bounces.**

| Token | Value |
|---|---|
| `--blink-duration` | `2s` |
| `--ping-duration` | `2.4s` |
| `--transition` | `120ms ease` (color/background only) |

---

## 5. Logo & lockups

Art is dark-on-transparent (`/src/assets/sierra-logo.png`, also an SVG mark).
Place directly on parchment — **no badge/container on light backgrounds.** On a rare
dark surface, set it in a near-white rounded chip. Clear space around the mark = the
mountain's height. **Don't recolor, stretch, or add effects.** Minimum mark height 28px.

- **Mark only** — mountain + signal arcs. Hero emblem above the headline.
- **Compact lockup** — mark + "S.I.E.R.R.A" wordmark. Nav brand on all pages **except** the homepage.
- **Full logo** — mark + wordmark + tagline. Footer / external / print.

---

## 6. Naming & legal (must appear correctly)

- Render the name with periods: **S.I.E.R.R.A** in display/nav. "SIERRA" only in code
  identifiers, **never** in visible copy.
- Full name (use at least once per page, footer is fine):
  **Signal Integrity & Emergency Radio Response Alliance.**
- Mailing: **P.O. Box 2071, Murphys, CA 95427.** No street address (volunteer org, no office).
- **Established 2026.** Service area: Calaveras & Tuolumne Counties — Murphys, Angels Camp,
  Sonora, Arnold, Twain Harte, Columbia, Dorrington.
</content>
</invoke>
