---
title: 'feat: Live-updating wildfire bulletins on the blog'
type: feat
date: 2026-07-08
origin: docs/brainstorms/2026-07-08-fire-bulletins-requirements.md
---

# feat: Live-updating wildfire bulletins on the blog

## Summary

Add a **fire desk** — a second automated blog channel that runs each morning, reads the `sierra-grid` MCP, and maintains one "current wildfire situation" bulletin: it creates the post when a fire becomes active, updates it in place daily (bumping it to the top of the feed), and closes it as a retrospective at all-clear. Supporting this needs blog-rendering changes (an `updatedDate` field, activity-based feed ordering, a feed fold so the live bulletin shows only its current-status head, and an "Updated" post-meta line) and coexistence changes to the existing news desk (a later slot and a pause during a major fire). All output still ships through the member-review PR gate, and all Grid-derived text is treated as untrusted input.

## Problem Frame

The desk is forbidden from covering live incidents, and for good reason — a static "60% contained" post is dangerous once it's hours old (see origin: `docs/brainstorms/2026-07-08-fire-bulletins-requirements.md`). But `/live` is a numbers dashboard; it doesn't tell a reader _what changed_ or _which way a fire is trending_. The fire desk fills that gap as a **daily digest of official figures** — safe because it's honestly framed and timestamped, never the authoritative source, with `/live` and CAL FIRE one click away. This plan is the HOW; the brainstorm settled the WHAT (single combined bulletin, daily-while-active cadence, evacuation-order pause gate, retire-to-retrospective).

---

## High-Level Technical Design

Two independent scheduled workflows write to the same blog collection. The fire desk owns the live bulletin; the news desk is unchanged except for a pause gate and a later slot.

```mermaid
flowchart TB
  subgraph FD[fire-desk.yml · morning]
    FG[Query sierra-grid MCP:\nactive fires in the two counties?] --> FR[Fire writer:\ncreate / update / close bulletin]
    FR --> FC[Fire critic:\nadversarial review or veto]
    FC --> FV[verify + build] --> FPR[open PR · branch per run]
  end
  subgraph ND[news-desk.yml · afternoon]
    NG[Pause gate:\nactive evacuation ORDER? -> skip\n+ 3-day cadence excl. fire posts] --> NW[News writer] --> NC[News critic] --> NPR[open PR]
  end
  FPR --> MEM[Member reviews + merges]
  NPR --> MEM
  MEM --> DEPLOY[deploy.yml -> live site]
```

The bulletin's lifecycle is carried by its `tag`: an open bulletin is tagged `Fire Update`; closing retags it `Retrospective`. The writer finds the open bulletin by that tag and the MCP tells it which path to take.

```mermaid
stateDiagram-v2
  [*] --> None
  None --> Open: fire active, no open bulletin\n(create, tag Fire Update)
  Open --> Open: fire(s) still active\n(update in place, bump updatedDate)
  Open --> Retrospective: all fires RESOLVED\n(final update, retag Retrospective)
  Retrospective --> [*]
  None --> None: no active fire\n(no post)
```

The bulletin carries its own state: each update writes a machine-readable stamp (`<!-- grid-state: … -->`, KTD2) holding the last observation time and per-fire figures, so the next run computes the day's delta from (a) that stamp and (b) the live feed — never by re-parsing prose, and with no separate state store.

---

## Requirements

Traced to the origin requirements doc; origin R-IDs cited in parentheses.

**Blog rendering & schema**

- R1. The blog collection accepts an optional `updatedDate`; the feed orders posts by `updatedDate ?? pubDate`, so an updated bulletin bumps to the top (origin R14).
- R2. The feed shows a live bulletin's current-status head only; the full reverse-chronological timeline renders on the permalink. Posts without a `summary` render in full as today (origin R15, R16).
- R3. Post meta shows "Updated <date>" when `updatedDate` is present and later than `pubDate` (origin R3, R14).

**Fire bulletin content & lifecycle**

- R4. One bulletin is open at a time, tagged `Fire Update`; it covers every fire active in Calaveras & Tuolumne, updated in place, never duplicated (origin R6, R8).
- R5. The title reflects the active-fire count: one named, two both named, 3+ the generic "N active wildfires in the foothills"; it drops the "update(s)" framing on close (origin R27).
- R6. Each update leads with the per-fire delta since the last update, from official figures, every figure timestamped in Pacific (origin R1, R2, R3).
- R7. Each fire links its CAL FIRE incident page (the MCP event's source link); the bulletin links `/live` and Cal OES / Genasys (origin R5).
- R8. The bulletin publishes every active day, including an honest "no material change" update; it tapers to ~every-third-day for a fire with no change for 3+ days at high containment (origin R11, R12, R13).
- R9. When every tracked fire resolves, the bulletin closes: a final update, retag to `Retrospective`, no longer bumped; a later outbreak starts a fresh bulletin (origin R7, R9, R10, R26).

**Editorial safety (carried verbatim from origin hard rules)**

- R10. The bulletin never issues emergency instructions and never characterizes S.I.E.R.R.A's own response; an `ACTIVE` fire is never called over; an `UNAVAILABLE` source reads "Unknown," never "0"/safe; the standing hazards disclaimer and colophon line are present (origin R20–R23).

**Scheduling & coexistence**

- R11. The fire desk runs in the morning slot; the news desk moves to a separate later slot and no longer suppresses on mere fire activity (origin R17, R18).
- R12. The news desk pauses regular posts while an active evacuation **order** tied to a wildfire exists; its cadence guard ignores `Fire Update` posts so a minor-fire bulletin doesn't pause tech posts (origin R19).

**Data source**

- R13. The fire desk reads the `sierra-grid` MCP (`grid_situation`, `grid_events`, `grid_event`, `grid_conditions` for fire-weather state); figures are reference-only with official sources cited; resolution is confirmed from the Grid, not inferred from containment (origin R24, R25, R26).

---

## Key Technical Decisions

- KTD1. **Two workflows, not one mode switch.** A new `fire-desk.yml` runs alongside the unchanged-in-shape `news-desk.yml`. The fire path's cadence (daily), draft detection (edit-in-place), and writer/critic rules differ fundamentally from the 3-day new-file desk; a mode switch would tangle both guards, and separate workflows isolate failures. (Resolves the origin's deferred workflow-shape question — see Alternatives.)
- KTD2. **The bulletin carries its own machine-readable state.** The writer computes each day's delta from a small structured stamp it emitted last run — an HTML comment holding the last observation time (ISO) and per-fire figures (`<!-- grid-state: {...} -->`) — plus the live feed, never by re-parsing its own prose. The `updatedDate`/stamp time is the `since` window. This removes the fragile prose-round-trip that could otherwise fabricate a "no change" (the exact R10/AE2 failure).
- KTD3. **Lifecycle by tag.** `Fire Update` = open (the writer's update target, found by tag); retag `Retrospective` = closed. One field carries create/update/close routing and satisfies the origin's retrospective-close requirement.
- KTD4. **Feed fold via a `summary` frontmatter field + `updatedDate` sort — no new dependency.** The live bulletin carries a plain-text `summary` (its current-status head); the feed renders that plus a "Read the full situation →" link, and the permalink renders the full markdown timeline. Posts without `summary` render fully as today (backward compatible). Chosen over a `<!--more-->` marker that would need a markdown-substring renderer — Astro's `render()` compiles whole entries only, and adding `marked`/`remark` violates the repo's one-runtime-library rule (`CLAUDE.md`) and risks head-vs-permalink render drift. A structured `fires[]` status card is the deferred richer form.
- KTD5. **Separate fire-desk editorial brief.** `docs/fire-desk-content-brief.md` governs the fire writer/critic, since they invert the news brief's "no unfolding incidents" rule. The existing `docs/news-feed-content-brief.md` §3 gains a pointer to the exception rather than absorbing contradictory rules.
- KTD6. **MCP primary, REST fallback — with a runner smoke test first.** The fire writer uses the user-named `sierra-grid` MCP (`grid_situation`, `grid_events`, `grid_event`, `grid_conditions`) for typed detail + CAL FIRE source links; the REST endpoints the news writer already curls are the proven fallback. Because no MCP is registered in the repo today and reachability was verified only from this sandbox (not a GitHub runner), U7 registers it via `--mcp-config` and gates the writer with `--allowedTools` (the `grid_*` tools + the specific file/verify commands), and a one-time `workflow_dispatch` smoke job confirms `tools/list` from a runner before the desk relies on it.
- KTD7. **Draft detection handles new _or_ modified files.** The fire workflow detects any change under `src/content/blog/` — `git status --porcelain` matching `??` (new) **and** ` M`/`M ` (modified), not the news desk's untracked-only `$1=="??"`. The critic's veto is `git checkout -- <path>` for a modified bulletin, `rm` for a new one. The PR branch is unique per run (`fire-desk/<slug>-<run_id>`).
- KTD8. **All Grid-derived text is untrusted input.** Feed content (fire names, prose fields, event ids, `source_url`s) is data, never instructions: the writer/critic prompts state this explicitly and ignore any imperative text inside feed values; the `--allowedTools` gate (KTD6) bounds what a hijacked run can do; and any Grid-supplied link must match an official-domain allowlist (`fire.ca.gov`, `caloes.ca.gov`, Genasys) before it is published or fetched — a link outside it is a veto, not a passing "resolves" check. This guards the path from an unauthenticated external feed → a skip-permissions writer → an auto-deploying PR.

---

## Implementation Units

### Phase 1 — Blog rendering & schema

### U1. Add `updatedDate`, `summary`, and the `Fire Update` tag

- **Goal:** Schema + vocabulary support for live bulletins.
- **Requirements:** R1, R2, R4, R5
- **Dependencies:** none
- **Files:** `src/content.config.ts`, `docs/news-feed-content-brief.md` (tag list), `.github/prompts/news-desk-writer.md` (tag list mention only if needed)
- **Approach:** Add `updatedDate: z.coerce.date().optional()` (must be ≥ `pubDate`) and `summary: z.string().optional()` (the feed's current-status head for a folded bulletin) to the blog schema, each with a doc comment. Add `Fire Update` to the documented tag vocabulary. No behavioral change beyond accepting the fields.
- **Patterns to follow:** existing optional fields in `src/content.config.ts` (`tag`, `author`).
- **Test scenarios:** `astro check` passes with the new fields; a fixture post carrying `updatedDate` + `summary` type-checks; a post without them still validates. Test expectation: schema-level, covered by `make verify` + build.
- **Verification:** `make verify` green; a sample bulletin with `updatedDate` + `summary` builds.

### U2. Feed: activity ordering + `summary` fold

- **Goal:** The feed bumps updated bulletins and shows only the current-status head for a folded bulletin.
- **Requirements:** R1, R2
- **Dependencies:** U1
- **Files:** `src/pages/blog/index.astro`, `src/pages/blog/archive.astro` (sort parity)
- **Approach:** Sort by `updatedDate ?? pubDate` descending. For each recent post: if it has a `summary`, render the `summary` as the feed head plus a "Read the full situation →" link pointing at the permalink's timeline anchor (`/blog/<id>#timeline`); otherwise render the full `<Content />` as today. No markdown-substring render and no new dependency (KTD4). The permalink (`[slug].astro`) is unchanged — it renders the whole body.
- **Patterns to follow:** current `render()` + `<Prose>` usage and the `pubDate` sort in `src/pages/blog/index.astro`.
- **Test scenarios:** Feed sort orders a bulletin with a newer `updatedDate` above a post with a newer `pubDate`. A post with a `summary` shows the summary + "Read the full situation" link in the feed and NOT the full timeline; a post without `summary` shows its full body unchanged. `make verify` + build + screenshots stable.
- **Verification:** feed screenshots show the folded bulletin at top with the summary head only; permalink shows the full timeline.

### U3. Post meta: "Updated <date>"

- **Goal:** Signal freshness without lying about first-published date.
- **Requirements:** R3
- **Dependencies:** U1
- **Files:** `src/components/blog/PostMeta.astro`, `src/pages/blog/[slug].astro` (pass `updatedDate`), `src/pages/blog/index.astro` (pass `updatedDate`)
- **Approach:** PostMeta accepts optional `updatedDate`; when present and later than `date`, render it as its own `<time datetime={updatedIso}>Updated {display}</time>` — the word "Updated" as real (non-`aria-hidden`) text so a screen reader announces the published-vs-updated distinction — separated from the published `<time>` by the existing `aria-hidden` "·". Keep the UTC-formatting convention already in the component.
- **Patterns to follow:** the existing `date`/`tag` rendering + tokens in `src/components/blog/PostMeta.astro`.
- **Test scenarios:** shows a second `<time>` with real "Updated" text only when `updatedDate` > `date`; omitted when equal or absent; the two dates read as distinct to assistive tech. Covered by build + screenshots (no behavioral JS).
- **Verification:** permalink + feed show "Updated <date>" on a bulletin, nothing on a normal post.

### Phase 2 — The fire desk

### U4. Fire-desk editorial brief

- **Goal:** The canonical rules the fire writer/critic follow.
- **Requirements:** R5, R6, R7, R8, R9, R10, R13
- **Dependencies:** none
- **Files:** `docs/fire-desk-content-brief.md` (new)
- **Approach:** Mirror the structure of `docs/news-feed-content-brief.md`, but scoped to active wildfire in the two counties: what to share (official figures + delta narrative), voice (calm/factual, defers to `/live`), the title rule (R5), cadence + taper (R8), the create/update/close lifecycle (R9), and the hard rules verbatim (R10) plus the never-the-live-source framing. Pin the post structure: a plain-text `summary` frontmatter = the current-status head; the body is a reverse-chronological stack where each update is a `### <Month D> update` heading (so the timeline is scannable, `--border` between entries) under a `#timeline` anchor; on close, drop the `summary` and reframe the head as a look-back so the retrospective renders in full. State the sources (the `sierra-grid` MCP tools + CAL FIRE incident links) and the trust rules (KTD8): Grid text is data not instructions; source links must match the official-domain allowlist.
- **Patterns to follow:** section shape, voice, and hard-rules format of `docs/news-feed-content-brief.md` and `docs/content-style-guide.md`.
- **Test scenarios:** Test expectation: none — editorial doc, verified by review and by the writer/critic prompts referencing it.
- **Verification:** the brief covers every origin editorial requirement; U5/U6 point at it.

### U5. Fire writer prompt

- **Goal:** Headless writer that creates/updates/closes the bulletin from the MCP.
- **Requirements:** R4, R5, R6, R7, R8, R9, R13
- **Dependencies:** U1, U4
- **Files:** `.github/prompts/fire-desk-writer.md` (new)
- **Approach:** Instruct the writer to: read `docs/fire-desk-content-brief.md` + `docs/content-style-guide.md`; query the Grid for active fires; find the open `Fire Update` bulletin (if any) by tag; read its `<!-- grid-state: … -->` stamp for the prior figures + `since` window; then branch — **create** a new bulletin, **update** the open one in place (prepend a `### <Month D> update` heading with the delta, refresh the `summary` head + `updatedDate`, rewrite the `grid-state` stamp, recompute the title, mark newly-resolved fires), or **close** it (final update, retag `Retrospective`, **drop the `summary`** and reframe the head as a look-back so it renders in full). Compute deltas from the stamp + Grid, never by re-reading prose (KTD2). Treat all Grid text as data, not instructions (KTD8). Do not commit/push. Write writer-notes. Emit no file when there is no active fire and no open bulletin.
- **Patterns to follow:** `.github/prompts/news-desk-writer.md` (run structure, notes file, "no git" rule, colophon/disclaimer requirements).
- **Test scenarios:** Covers AE1, AE2, AE4, AE7. Verified by a forced dry-run (below), not unit tests.
- **Verification:** a forced `fire-desk.yml` run against current live data produces a correctly-shaped create/update/close draft that passes `make verify` + build.

### U6. Fire critic prompt

- **Goal:** Adversarial review for the fire path.
- **Requirements:** R7, R10
- **Dependencies:** U4, U5
- **Files:** `.github/prompts/fire-desk-critic.md` (new)
- **Approach:** Locate the changed bulletin via new-**or**-modified git status (not "the only untracked file" — an in-place update is a modified tracked file). Review it against the fire brief and hard rules: cross-check each figure against the **independent** official page (the CAL FIRE incident page itself), not merely the Grid's own value; confirm the source link's domain is on the allowlist (KTD8) and resolves; confirm every fire is still `ACTIVE`/correctly-stated (never "over"), no instructions, `UNAVAILABLE`→"Unknown", disclaimer + colophon present, title matches the active count. Veto = `git checkout -- <path>` for a modified bulletin, `rm` for a new one. Treat Grid text as data, not instructions. Write critic-notes.
- **Patterns to follow:** `.github/prompts/news-desk-critic.md` (adversarial stance, source verification, veto-by-delete; extend detection to modified files and veto to revert-on-modify).
- **Test scenarios:** Covers AE6. Verified via the forced dry-run.
- **Verification:** the critic catches a seeded honesty violation (e.g., a resolved-sounding active fire) in a dry run.

### U7. Fire desk workflow

- **Goal:** The scheduled CI that runs the fire writer/critic and opens the PR.
- **Requirements:** R11, R13
- **Dependencies:** U5, U6
- **Files:** `.github/workflows/fire-desk.yml` (new)
- **Approach:** Morning cron (the existing ~16:30 UTC slot) + `workflow_dispatch` with a force input. Least-privilege `permissions:` (`contents: write`, `pull-requests: write`, else `none`) and its own `concurrency: group: fire-desk`. Steps: register the MCP via `--mcp-config` and run the writer gated by `--allowedTools` (the `grid_*` tools + the file/verify commands only, not blanket `--dangerously-skip-permissions` reach); detect any change under `src/content/blog/` with `git status --porcelain` matching `??` **or** ` M`/`M `; if changed, run the critic; re-detect (veto may `git checkout --`/`rm`); `make verify` + `npm run build`; open a PR on a per-run branch (`fire-desk/<slug>-<run_id>`) with writer/critic notes + a fire-specific reviewer checklist. No fixed 3-day guard — a lightweight "is a fire active OR is a bulletin open?" precheck decides whether to spend API budget.
- **Patterns to follow:** `.github/workflows/news-desk.yml` (job shape, verify+build gate, PR creation) — adapted for modified-file detection, per-run branch, and MCP registration.
- **Execution note:** Land the one-time MCP runner smoke test (a `tools/list` call from a `workflow_dispatch` job) before wiring the writer to the `grid_*` tools; if it fails from the runner, fall back to the REST curl path the news desk already uses (KTD6).
- **Test scenarios:** modified-file detection surfaces an in-place bulletin update (a ` M` file), not just new files; a vetoed modification is reverted, not committed. Test expectation otherwise: CI YAML — verified by a forced dispatch producing a valid PR.
- **Verification:** a manual `workflow_dispatch` run opens a well-formed PR for both a new bulletin and an in-place update (or correctly no-ops when no fire is active and no bulletin is open).

### Phase 3 — News desk coexistence & docs

### U8. News desk: later slot, pause gate, fire-aware cadence guard

- **Goal:** Regular posts coexist and pause during a major fire.
- **Requirements:** R11, R12
- **Dependencies:** U1
- **Files:** `.github/workflows/news-desk.yml`, `.github/prompts/news-desk-writer.md`
- **Approach:** Move the cron to a separate later slot (early-afternoon PT). Add a pause-gate step before the writer: query the Grid; if an active evacuation **order** tied to a wildfire exists, skip the run. Make the cadence guard **read frontmatter, not filenames**: the current guard is `ls … | sort | tail -1 | cut -c1-10` (never opens a file), so excluding fire bulletins means iterating posts newest-first and `grep`-ing each for `^tag: *Fire Update`, taking the first non-fire post's date for the age calc. Also narrow the **writer prompt's** step-3 stop: today it halts on _any_ active incident, which would defeat coexistence (R18) — change it so the news writer may still publish a non-fire tech post during a fire (it just never writes _about_ the fire, per §3); the workflow's evacuation-order pause gate is the only thing that halts it during a major fire.
- **Patterns to follow:** the existing cadence-guard shell + step `if:` gating in `.github/workflows/news-desk.yml`; the writer's step-3 conditions in `.github/prompts/news-desk-writer.md`.
- **Test scenarios:** Covers AE5. The tag-aware guard picks the newest **non-fire** post's date (a fixture where the newest file is a `Fire Update` bulletin must not trip the 3-day guard). Pause-gate skips when the Grid reports an active evacuation order; a minor fire (no order) does not pause a due tech post. Verified by forced dispatch + reading the guard logic.
- **Verification:** with a seeded active evacuation order, a forced news-desk run skips; with only a minor fire bulletin present, the guard still allows a due tech post.

### U9. Documentation & guardrail updates

- **Goal:** Keep the canonical docs honest about the new channel.
- **Requirements:** R10, R11
- **Dependencies:** U4, U7, U8
- **Files:** `docs/news-feed-content-brief.md` (§3 pointer to the fire-desk exception), `docs/architecture/news-desk.md` (runbook: two desks, force-run, manual-close), `CLAUDE.md` (blog section: fire-bulletin conventions — the `Fire Update` tag, `updatedDate`, the `summary` fold, one-open-bulletin rule), `src/config/content.ts` (colophon copy only if it must mention the fire desk)
- **Approach:** Narrow §3 in place (the blog _may_ carry active-fire bulletins via the fire desk, the sanctioned live channel; the news desk still never does) — resolve the text, don't stack a caveat. Document the operational shape and the manual levers, the trust model (Grid data is untrusted; source-link allowlist), and state branch protection on `main` as a **prerequisite** (both desks' PRs must require a human merge, since merge auto-deploys) rather than optional.
- **Patterns to follow:** existing prose in `docs/news-feed-content-brief.md` and the CLAUDE.md blog section.
- **Test scenarios:** Test expectation: none — docs. `make verify` (prettier) passes.
- **Verification:** a reader of §3 + CLAUDE.md understands the two-desk split and the fire-bulletin conventions.

---

## System-Wide Impact

- **The feed sort change touches every post, not just bulletins** — ordering moves from `pubDate` to `updatedDate ?? pubDate`. Normal posts (no `updatedDate`) are unaffected, but the change is site-wide; verify the existing feed order is unchanged in screenshots.
- **The fold path runs for every feed post** — posts without a `summary` must render exactly as today. Backward compatibility is a hard requirement of U2.
- **Merging a bulletin PR auto-deploys** (deploy.yml on merge to main) — each daily update publishes to the live site on merge, same as any post.
- **Two desks share `src/content/blog/`** — the news cadence guard and the fire bulletin must not interfere (U8 handles the exclusion).

## Risks & Dependencies

- **Malicious / compromised / spoofed Grid data.** The dangerous case is a reachable-but-lying feed, not an unavailable one — abort-on-failure does nothing against confidently-wrong or attacker-crafted figures/links flowing through a skip-permissions writer into an auto-deploying PR. Trust assumption stated explicitly; mitigations are KTD8 (untrusted-data framing, `--allowedTools` bound, source-link allowlist), the critic's independent cross-check against the official page (U6), and the member gate. A compromise that survives all three would publish bad official-looking figures.
- **The member gate is only real if `main` is branch-protected.** The whole safety model leans on human merge; make branch protection on `main` a stated prerequisite for the auto-deploy path (upgrade the runbook's "Optional"), documented in U9.
- **MCP reachability from a GitHub runner is unverified.** Reachability was confirmed from this sandbox only; the U7 smoke test settles it from a runner, with the proven REST curl as fallback (KTD6). A failed data fetch aborts the run, never publishes a partial bulletin.
- **Daily PR-review load during a fire.** Each update is a PR a member must merge; a multi-week fire means daily review. Accepted per the brainstorm (digest framing); flagged operationally in U9. Auto-merge is a deferred option, not v1.
- **Delta correctness.** The writer must not fabricate "no change" when data is missing — missing/`UNAVAILABLE` reads "Unknown" (R10), the machine-readable stamp (KTD2) grounds the delta, and the critic verifies figures against the independent source (U6).

## Scope Boundaries

### Deferred to follow-up work

- A structured `fires[]` frontmatter block rendered as a status card (KTD4 alternative).
- Auto-merge / faster-than-daily publishing for trusted updates.
- Extending the lifecycle to non-fire hazards (storm/PSPS/evacuation-only bulletins).

### Out of scope (non-goals)

- Any change to `/live` or the `sierra-grid` MCP server (blog-side only).
- Per-fire individual posts (the brainstorm chose one combined bulletin).
- An RSS feed (none exists today).

## Alternatives Considered

- **One workflow with sequential fire→news steps** (shared checkout + one Grid query feeding both the bulletin and the pause gate) vs. **two workflows** (chosen). Two was chosen for failure isolation, independent cadences/schedules, and simpler per-desk logic; the cost is a second Grid query for the pause gate — cheap and acceptable. The single-workflow option remains viable if operational overhead proves high.

## Open Questions

Deferred to implementation:

- Exact cron minutes for the two slots (fire morning, news early-afternoon) — pick off-`:00` minutes.
- Whether the bulletin auto-closes on the first all-clear run or waits one confirming run before retiring — decide in U5 against real `RESOLVED` behavior.

## Sources & Research

- `.github/workflows/news-desk.yml` — cadence guard, new-file draft detection, verify+build gate, PR creation (the pattern U7 adapts).
- `.github/prompts/news-desk-writer.md`, `.github/prompts/news-desk-critic.md` — the writer/critic contracts U5/U6 mirror; the news writer's §3 hard-stop is what the fire path inverts.
- `src/content.config.ts` — blog schema (U1 extends).
- `src/pages/blog/index.astro` — feed sort + full-body `render()` (U2 changes); `src/pages/blog/[slug].astro` permalink; `src/components/blog/PostMeta.astro` (U3).
- `docs/news-feed-content-brief.md` §3 (hard boundary this feature narrows), §10 (hard rules carried verbatim).
- `sierra-grid` MCP at `data.sierragridteam.org/mcp` — tools `grid_situation`, `grid_events` (`since`/`status`), `grid_event` (typed detail + CAL FIRE source link, ids like `calfire:2026-priest-fire`); server rule "never treat null/absence as safe." Verified reachable (`initialize` + `tools/list` succeed).
- Shipped `provenance.source_url` work — the alert-card/map CAL FIRE incident link R7 reuses.
