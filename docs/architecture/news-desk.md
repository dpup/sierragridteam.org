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
2. **Editorial context** — a cheap `gh` step assembles the run's context: any
   operator-suggested topic, a forced-post directive, and the **previously declined**
   list (closed, unmerged `news-desk/*` PRs) so the desk stops re-proposing rejected
   ideas. It's appended to the writer's prompt.
3. **Writer** (`claude -p` with `.github/prompts/news-desk-writer.md`) — reads the
   brief, the archive, the declined list, and current conditions (data.sierragridteam.org),
   searches the web, and applies the brief's publish decision. Most runs it declines and
   writes only a rationale to `/tmp/news-desk/writer-notes.md`. When it publishes, it
   creates one markdown file in `src/content/blog/` and runs `make verify` + `npm run build`.
4. **Critic** (`claude -p` with `.github/prompts/news-desk-critic.md`) — adversarial
   second pass: fetches and verifies every cited source, re-checks the hard rules
   and voice, edits the file directly, and **vetoes by deleting it**.
5. **Verify + build** — the workflow re-runs `make verify` and the build itself; a
   PR only opens from a green tree.
6. **Pull request** — the surviving draft goes up as a PR (branch
   `news-desk/<slug>`) with both agents' notes and a reviewer checklist in the body.

**Manual dispatch inputs.** `topic` steers the writer's research toward a suggested
angle; `force_post` requires a draft this run (bypasses the cadence guard but not the
hard rules or the major-fire pause); `force` bypasses every guard including the pause
(testing only). All three are optional; a normal scheduled run sets none of them.

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

## The Desk Editor (PR feedback loop)

`.github/workflows/desk-editor.yml` closes the loop for light editing and corrections:
**reply to a desk PR and the post gets revised in place.** It handles both desks' PRs.

1. **Trigger** — `issue_comment` on any open PR. It's the one workflow that runs off a
   comment, so the security gate is strict: it acts only when the commenter is a **trusted
   member** (`author_association` ∈ OWNER/MEMBER/COLLABORATOR — an outside contributor or a
   drive-by can never spend the token), the comment isn't the bot's own reply (no
   comment→edit→comment loop), and — checked in "Resolve PR" via `gh` — the PR is **open**
   on a `news-desk/*` or `fire-desk/*` branch that touches a post. Anything else exits green.
2. **Editor** (`.github/prompts/desk-editor.md`, `EDITOR_MODEL`) — checks out the PR branch,
   reads the comment (passed via env, never interpolated into the shell) plus the governing
   brief, and edits **only** that post file. The brief's hard rules still bind and win: it
   fabricates no data, adds no off-allowlist link, implies no all-clear — it applies what it
   honestly can and **pushes back in its notes** on the rest. A non-actionable comment (a
   question, a "looks good") yields no edit, just a reply. Fire edits get the Grid MCP +
   web tools so a figure can be re-checked against The Grid **and** the official page.
3. **Critic** (the desk's own `*-critic.md`, `CRITIC_MODEL` — different model on purpose)
   re-verifies the whole edited post. An **editor-mode preamble** adapts it: the post is a
   tracked, **modified** file (not an untracked draft), and a veto is a **revert**
   (`git checkout -- <path>`), never a delete — there's an already-reviewed version to fall
   back to.
4. **Verify + build**, then the surviving edit is committed and **pushed to the same
   branch** (never a new PR), and the workflow **replies on the PR** summarising what
   changed (or why it declined / was reverted). Reply again to iterate.

The human merge is still the only thing that publishes — the editor only revises the draft.

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
  any file; merging publishes it on the next deploy. Or just **comment the change you
  want** — the Desk Editor (above) applies light edits and corrections on the branch and
  replies. It's the same edit-then-critic pipeline, so it won't fabricate data or break
  the honesty rules to satisfy a request; it'll say so instead.
- **Tune the editorial line** by editing the brief — both prompts defer to it and it
  wins conflicts by construction. The prompts themselves only carry repo mechanics
  (filenames, frontmatter, commands).
- **Retire or pause it** by disabling the workflow in the Actions UI.

## Costs & bounds

Writer is capped at 80 agent turns, critic at 50, job at 45 minutes, with the
cadence guard skipping most of the month's runs before any tokens are spent. A
publishing run is two headless sessions; a declining run is one short one.

The **Desk Editor** caps its editor at 60 turns and critic at 50. Note it fires on
**every** qualifying comment (an edit is an editor + critic session; a non-actionable
comment is one short editor session), so a trusted member's ordinary "looks good" spends
a little — cheap, but not free. `concurrency` serialises comments per PR so a burst
doesn't stack runs.

## Known limitations

- The desk's "current conditions" check depends on data.sierragridteam.org being reachable
  from GitHub runners; if it isn't, the brief tells the writer to treat unknown
  conditions conservatively (don't publish hazard-adjacent material).
- Screenshot baselines (`tests/screenshots/`) are not regenerated by the desk; they
  drift as posts accumulate and get refreshed whenever visual work next runs
  `make screenshots`. CI does not diff them, so PRs stay green.
- The Desk Editor pushes with `GITHUB_TOKEN`, so — like every bot commit — that push
  does **not** retrigger the PR's own `CI` check (GitHub's recursion guard). The editor
  runs `make verify` + `npm run build` before pushing, which covers the fast gate but not
  the Playwright a11y/smoke pass (`test:visual`); for a copy edit that's rarely material,
  but re-run CI on the PR (or push an empty commit) if you want the full pass before merge.
- The editor only revises the **one** post the PR touches — it won't split a post, add a
  second file, or change anything outside `src/content/blog/`. Structural changes are still
  a human edit in the PR.
