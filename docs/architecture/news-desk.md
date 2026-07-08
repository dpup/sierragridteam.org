# The automated news desks — runbook

The blog has **two** automated editorial desks, both member-reviewed via PR, never
pushing to main:

- **News Desk** (the slow channel) — `.github/workflows/news-desk.yml`, policy in
  `docs/news-feed-content-brief.md`. Tech/preparedness/retrospectives; never covers
  unfolding incidents.
- **Fire Desk** (the live channel) — `.github/workflows/fire-desk.yml`, policy in
  `docs/fire-desk-content-brief.md`. Maintains one live wildfire bulletin during an
  active fire (see "The Fire Desk" below).

This document covers the machinery; the briefs own editorial policy.

## How the News Desk works

`.github/workflows/news-desk.yml` runs daily (21:12 UTC ≈ afternoon Pacific — the Fire
Desk has the morning) and on manual dispatch:

1. **Guards** — pure shell, before any API spend. First a **major-fire pause**: if the
   Grid shows an active evacuation ORDER in the service area, the run exits (the Fire
   Desk covers it; a cheerful tech post then reads as tone-deaf). Then the **cadence
   guard**: if the newest **non-fire** post is under 3 days old, the run exits (a live
   `Fire Update` bulletin is excluded so its daily updates don't suppress tech posts).
2. **Writer** (`claude -p` with `.github/prompts/news-desk-writer.md`) — reads the
   brief, the archive, and current conditions (data.sierragridteam.org), searches the web, and
   applies the brief's publish decision. Most runs it declines and writes only a
   rationale to `/tmp/news-desk/writer-notes.md`. When it publishes, it creates one
   markdown file in `src/content/blog/` and runs `make verify` + `npm run build`.
3. **Critic** (`claude -p` with `.github/prompts/news-desk-critic.md`) — adversarial
   second pass: fetches and verifies every cited source, re-checks the hard rules
   and voice, edits the file directly, and **vetoes by deleting it**.
4. **Verify + build** — the workflow re-runs `make verify` and the build itself; a
   PR only opens from a green tree.
5. **Pull request** — the surviving draft goes up as a PR (branch
   `news-desk/<slug>`) with both agents' notes and a reviewer checklist in the body.

**The desk never pushes to main.** The colophon (and every post's closing line)
promises member review before publication — merging the PR is that review. CI runs
on the PR as usual; the merge triggers the normal deploy.

## The Fire Desk

`.github/workflows/fire-desk.yml` runs each morning (15:35 UTC ≈ 08:35 Pacific) and on
manual dispatch. It maintains **one** live "current wildfire situation" bulletin:

1. **Precheck** — act only if a fire is active (Grid) or a `Fire Update` bulletin is
   open; otherwise exit before any spend.
2. **Writer** (`.github/prompts/fire-desk-writer.md`) — reads The Grid via the
   `sierra-grid` MCP and **creates / updates / closes** the one bulletin (found by its
   `tag: Fire Update`), computing the day's delta from a machine-readable `grid-state`
   stamp it re-reads each run.
3. **Critic** (`.github/prompts/fire-desk-critic.md`) — verifies every figure against
   the **independent** CAL FIRE incident page (not the Grid's own value), enforces the
   source-link allowlist and the honesty hard rules, and **vetoes by reverting** a
   modified bulletin or deleting a new one.
4. **Verify + build**, then a PR on a per-run branch (`fire-desk/<slug>-<run_id>`).

**Trust model.** All Grid-derived text is untrusted input — data, never instructions.
The agents are gated with `--allowedTools` (not blanket skip-permissions), only publish
links on the official allowlist (`fire.ca.gov`, `caloes.ca.gov`, `protect.genasys.com`),
and the critic cross-checks against the official source. The member-review gate + branch
protection are the final control. Run the workflow's **smoke-test dispatch** once to
confirm the runner can reach the MCP before relying on the `grid_*` tools.

## Setup (one-time)

- Add the **`CLAUDE_CODE_OAUTH_TOKEN`** repository secret (Settings → Secrets and
  variables → Actions): run `claude setup-token` locally and paste the resulting
  token — both desks' Claude Code CLI reads this env var directly. Nothing else —
  `GITHUB_TOKEN` covers branch + PR creation via each workflow's
  `contents: write` / `pull-requests: write` permissions.
- **Prerequisite (not optional): branch-protect `main`** so both desks' PRs require a
  human merge. Merge auto-deploys to the live site (`deploy.yml`), so the review gate is
  the whole safety model — without branch protection an automated bad bulletin could
  reach residents unreviewed.

## Operating it

- **Run it now:** Actions → News Desk → Run workflow.
- **Read a run:** the writer/critic notes are echoed into the step logs; a declined
  run logs the rationale and exits green. No PR ≠ failure — silence is the desk's
  most common (and correct) output.
- **Review a PR:** the body carries the writer's sources and the critic's verdict,
  plus a checklist drawn from the brief's hard rules. Edit the post in the PR like
  any file; merging publishes it on the next deploy.
- **Tune the editorial line** by editing the brief — both prompts defer to it and it
  wins conflicts by construction. The prompts themselves only carry repo mechanics
  (filenames, frontmatter, commands).
- **Retire or pause it** by disabling the workflow in the Actions UI.

## Costs & bounds

Writer is capped at 80 agent turns, critic at 50, job at 45 minutes, with the
cadence guard skipping most of the month's runs before any tokens are spent. A
publishing run is two headless sessions; a declining run is one short one.

## Known limitations

- The desk's "current conditions" check depends on data.sierragridteam.org being reachable
  from GitHub runners; if it isn't, the brief tells the writer to treat unknown
  conditions conservatively (don't publish hazard-adjacent material).
- Screenshot baselines (`tests/screenshots/`) are not regenerated by the desk; they
  drift as posts accumulate and get refreshed whenever visual work next runs
  `make screenshots`. CI does not diff them, so PRs stay green.
