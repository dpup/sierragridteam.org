# Content & Messaging Style Guide — sierragridteam.org

> **Status:** first draft (for review/editing). This is the canonical guide for the
> _words_ on the site — voice, tone, terminology, and the honesty rules. It complements
> `docs/design/design-system.html` (the canonical guide for the _look_). Where the older
> `docs/design/content-brief.md` conflicts, this guide wins.

**Read this before writing or editing any user-facing copy.** Most copy lives in data
files, not markup — edit `src/config/content.ts` (page copy), `src/config/site.ts`
(org facts, nav, contact), or `src/config/coverage.ts` (towns/zones). See
`src/config/CLAUDE.md`.

---

## 1. Who we write for, and the one job

S.I.E.R.R.A is an all-volunteer emergency-communications non-profit for the foothills.
Most readers fall into four groups; write so a single sentence can serve more than one:

- **Residents** — the primary audience. Their real question is _"is my area safe right
  now, and where do I get information when the grid is down?"_ Answer it plainly.
- **Volunteers** — people who might join (ham operators, LoRa techs, logistics).
- **Partners / agencies** — fire districts, county OES, CERT. We earn their trust by
  sounding competent and accurate, never promotional.
- **Donors** — people who want to fund the mission.

When in doubt, write for a worried resident reading on a phone during a power outage.

## 2. Voice: Elite · Pioneering · Trustworthy

The feel is a **county fire district, not a tech startup**: calm, institutional,
warm-parchment. Three words guide every sentence:

- **Elite** — quiet competence. State capability as fact; don't boast. We don't say
  "cutting-edge" or "best-in-class"; we say what we do and let it stand.
- **Pioneering** — forward, purposeful, plain. New capability described in concrete
  terms ("solar-powered LoRa relays"), never as hype ("revolutionary").
- **Trustworthy** — accurate, honest, and steady. Especially with live/safety data
  (see §4). We would rather say "unknown" than guess.

**Tone shifts by context, voice does not:**

- _Calm pages_ (Home, About, Mesh, Donate): measured, confident, unhurried.
- _Active emergency_ (Live Feed banner, alerts): direct and actionable, still calm —
  short sentences, plain verbs, no drama. "Prepare to leave," not "Flee now!"

## 3. The honesty rules (most important)

Trust is the product. These are non-negotiable in copy:

- **Never fabricate live data.** If the feed can't provide it, say so honestly — never
  invent a number, status, or time.
- **Never imply an all-clear.** A missing/silent life-safety feed is **"Unknown,"
  never "0," "None," or a green all-clear.** Evacuations especially: an active-events
  feed that's quiet means we _can't confirm_ there are no orders — say "Unknown" and
  link the authoritative source.
- **Stale ≠ live.** When showing a last-known snapshot, label it ("Last known"), don't
  pretend it just synced.
- **Point to the authority for life-safety.** For evacuations, link Cal OES / Genasys
  and tell people to follow official orders. We surface presence, we don't assert safety.
- **Label placeholders.** Unfinished copy is clearly bracketed (`[Placeholder]`) or
  marked ("Coming soon"); a reader can always tell real data from a stand-in.
- **Say it's real.** Where it helps trust, state provenance plainly: "Nothing here is
  simulated"; name the source agency.

## 4. Naming & terminology

- **The organization:** always **`S.I.E.R.R.A`** with periods in visible copy. ("SIERRA"
  without periods only appears in code/IDs.) The full legal name —
  **Signal Integrity & Emergency Radio Response Alliance** — must appear at least once
  per page (the footer does this automatically).
- **Place:** "the **Calaveras & Tuolumne foothills**," or "the foothills." Counties:
  Calaveras County, Tuolumne County. Corridors: **Highway 4** and **Highway 49** (short:
  Hwy 4, Hwy 49); Highway 108 for the Tuolumne side. Towns: Murphys (HQ), Angels Camp,
  Arnold, Bear Valley, Dorrington, Sonora, Columbia, Twain Harte.
- **The network:** **LoRa mesh** running **MeshCore** (never "Meshtastic"); **amateur
  radio** / "ham" operators; solar relays / repeater sites.
- **Agencies & sources (use exact names):** CAL FIRE, Cal OES, Genasys, NWS Sacramento,
  CHP, Caltrans, USGS, Broadcastify.
- **Status & severity words (don't improvise synonyms):**
  - Situation status: **Operational → Advisory → Active Incident**.
  - Fire weather: **Normal → Elevated → Red Flag**.
  - Hazard severity: **Info → Moderate → Severe → Extreme**.
- **The 911 line (verbatim, every page footer):** "S.I.E.R.R.A is a volunteer
  organization, not an emergency dispatch service. In a life-threatening emergency,
  call 911."

## 5. Mechanics

- **Capitalization:**
  - _Statement headlines_ (most h1/h2/h3): **sentence case, end with a period.**
    e.g. "Resilience is built before the disaster." "Train before the emergency."
  - _Short titles / section labels_ (page names, nav): **Title Case, no period.**
    e.g. "The Live Feed," "Contact & Volunteer."
  - _Kickers, stat-tile labels, button text:_ **Title Case** (CSS renders kickers and
    labels uppercase — write them in Title Case, not ALL CAPS).
- **Punctuation:**
  - **No exclamation marks.** Ever. Calm beats loud.
  - **Em dash** (`—`), spaced, for an aside or a beat: "outlasts the grid — and trains
    the people who keep it running."
  - **Middle dot** (`·`) separates meta items: "Calaveras County · Situation,"
    "Synced 17:43 PT · Auto-refreshes every 90 seconds."
  - **Ampersand** (`&`) in names, titles, and short labels ("Calaveras & Tuolumne");
    **"and"** in flowing sentences.
  - Oxford comma: yes ("neighbors, first responders, and emergency managers").
- **Numbers & units:**
  - Audience is US public-safety/residents → **imperial**: °F, mph, miles (the feed is
    metric; it's converted for display).
  - **Numerals for data** — counts, stats, measurements: "6 Active," "2 Counties,"
    "1,240 acres · 15% contained," "M3.4," "gusts to 45 mph."
  - Spell out a number only when it reads better in prose and isn't a datapoint.
- **Dates & times:** Pacific time, 24-hour, "PT" suffix: "17:43 PT." Use "Synced
  HH:MM PT" for fresh data, "Last known" when stale.
- **Voice & grammar:** active voice, present tense, second person where it helps the
  reader act ("look up your address"). Short sentences. Cut adverbs and hedges.

## 6. Component copy patterns

- **Headlines** — a claim, not a label: "the signal stays up," not "Our Network."
- **Kickers** — 1–3 words orienting the section: "Mission," "Operational Doctrine."
- **CTAs / buttons** — verb-first, concrete: "Open Live Map," "View the Live Feed,"
  "Volunteer." One primary action per context (the emergency banner has exactly one CTA).
- **Stat tiles** — `Label` (what), big `Value` (the number/state), small `sublabel`
  (source/scope). Value is short; sublabel names the source ("CAL FIRE," "Cal OES").
- **Alerts / hazards** — lead with severity + kind, then the headline, then where, then
  detail. Keep agency phrasing intact where it's authoritative; trim only filler.
- **Empty states** — honest and specific, not cute: "No active hazards in the service
  area right now." Never "All good!"
- **Degraded / stale states** — explain plainly without alarm: "Showing last-known
  values — the live feed was unreachable." For an unavailable life-safety source,
  "Unknown" + where to verify.
- **Placeholders** — bracket or tag them and keep the surrounding copy truthful.

## 7. Accessibility in writing (part of the job, not extra)

- **Plain language.** Spell out an acronym on first use unless it's an exact, well-known
  agency name (CAL FIRE, NWS). Avoid jargon a resident won't know.
- **Link text describes the destination** — "Open the evacuation map (Genasys)," never
  "click here" or a bare URL.
- **Never rely on color or an icon alone** to carry meaning — pair it with a word
  ("Severe," "Red Flag," "Closure").
- **Alt text** states what an image shows, briefly; decorative images get empty alt.
- One `<h1>` per page; headings describe real structure (this is content _and_ a11y).

## 8. Prefer / avoid

| Prefer                                   | Avoid                                         |
| ---------------------------------------- | --------------------------------------------- |
| off-grid emergency communications        | cutting-edge / next-gen / revolutionary comms |
| built before the disaster                | be ready for anything!                        |
| we build, operate, and train             | we leverage / we empower / synergize          |
| keeps neighbors connected                | seamless connectivity solutions               |
| Unknown · check Genasys                  | 0 evacuations / All clear                     |
| Red Flag Warning in effect until 8 PM PT | DANGER!! Extreme fire risk!!                  |
| volunteer non-profit                     | startup / company / platform                  |

## 9. Quick checklist before shipping copy

- [ ] Does it read calm and institutional — would a county fire district publish it?
- [ ] No exclamation marks, hype words, or invented numbers.
- [ ] Live/safety data is honest: stale labeled, unavailable = "Unknown," no implied
      all-clear, authoritative source linked.
- [ ] `S.I.E.R.R.A` spelled with periods; exact agency/place/tech names used.
- [ ] Capitalization, em dashes, `·`, `&`/"and," imperial units all per §5.
- [ ] Link text is descriptive; meaning never rests on color alone.
- [ ] Copy is in `src/config/*`, not hard-coded in a component or page.
