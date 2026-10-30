# Signal Desk evals

An **LLM-as-judge** harness for tuning the automated News Desk (the "Signal Desk"), so a
change to the mandate, the writer prompt, or the rubric can be **measured** instead of
argued. Three loops, in increasing autonomy, plus a check on the critic:

- **`judge.mjs` — score fixed posts.** Judges a labeled corpus (real published posts +
  rejected drafts) against a rubric derived from the mandate, and flags where the judge's
  verdict differs from a human label. Use it to tune the **rubric/mandate** and as a
  regression gate.
- **`generate.mjs` — generate then judge.** Runs the **writer prompt** on scenarios,
  drafts a post (or declines), then judges the output. Use it to tune the **writer** by
  hand — edit the prompt, re-run, watch the scorecard move.
- **`autotune.mjs` — auto-learn.** Closes the loop: generate → judge → an optimiser model
  rewrites the writer prompt from the judge's feedback → re-generate → keep the best,
  discard the rest, repeat. Produces a reviewed **candidate** prompt, never an auto-merge.
- **`critic.mjs` — can the critic fix voice?** Runs the critic prompt's voice pass on drafts
  that shipped with machine voice and scores what it hands back. The last line of defence.

## What's here

- `rubric.md` — how the judge applies the mandate: a hard-rule **gate**, five scored
  dimensions, and a verdict (`PUBLISH` / `REVISE` / `REJECT`). The tunable knob.
- `voice-rubric.md` — the **voice judge**: counts machine-voice tells (brief §8, "Write
  plainly, not mannered") and scores `human_voice` 1–5. Separate from the mandate rubric on
  purpose: there, voice is one of five scores, and a correct draft with a dozen tells still
  averaged a PUBLISH. `generate.mjs` runs it on every draft and it is in the fitness.
- `cases/voice/*.md` — drafts that shipped with machine voice, for `critic.mjs`.
- `cases.json` — the labeled corpus for `judge.mjs`.
- `cases/rejected/*.md` — snapshot fixtures of drafts opened then closed without merging
  (their branches are gone). Published posts are read live from `src/content/blog/`.
- `scenarios.json` — the scenarios for `generate.mjs`: a shared context (date, conditions,
  archive, declined list) plus topics + inline source material. Each probes a known
  failure mode and lists the `acceptable` outcomes.
- `judge.mjs`, `generate.mjs`, `autotune.mjs` — the three harnesses. `lib.mjs` — shared
  plumbing (calling `claude`, generate-then-judge, extracting the verdict JSON, majority
  voting, scoring + the fitness function).

## Running

```sh
npm run eval:desk                    # judge the fixed corpus (Opus judge, 1 vote/case)
node evals/judge.mjs --votes=3       # majority of 3 — stabilises borderline cases
npm run eval:generate                # generate-then-judge (Opus writer, Sonnet judge)
node evals/generate.mjs --prompt=/abs/path/variant-writer.md   # A/B a writer-prompt variant
node evals/generate.mjs --json       # machine-readable (includes the generated drafts)
npm run eval:autotune                # auto-learn (3 rounds); writes a candidate prompt
npm run eval:critic                  # critic voice pass on the cases/voice fixtures
node evals/autotune.mjs --rounds=5   # more rounds = more attempts (run in the background)
```

Requires the `claude` CLI on PATH (it is, in CI and the sandbox). `judge.mjs` is ~1 call
per case; `generate.mjs` is 1 generation + 1 judge per scenario (× votes). A full run of
either is a couple of minutes. Generated drafts are written to a temp dir (printed at the
end) for eyeballing.

### Models

`judge.mjs` defaults to an **Opus** judge (the strongest single judge for a fixed
corpus). `generate.mjs` mirrors the real pipeline: **Opus** writer, **Sonnet** judge — a
_different_ model judges the output so it doesn't share the writer's blind spots. Override
with `EVAL_GEN_MODEL` / `EVAL_JUDGE_MODEL`. Generation runs with the mutating tools
(`Write`/`Edit`/`Bash`/…) disabled, so a scenario can't touch the repo.

### Voting

Verdicts are noisy near the REVISE boundary — a single judge once flip-flopped
REJECT↔PUBLISH on the subtlest comparison-trap draft. `--votes=N` (or `EVAL_VOTES=N`)
takes N votes and picks the majority; ties break toward the _harsher_ verdict (trust-
critical feed — when judges split, don't ship).

**Exit codes.** `judge.mjs`: 0 if every verdict is within one notch of its label, 1 on a
two-notch miss (`PUBLISH`↔`REJECT`) or a parse/harness error. `generate.mjs`: 0 if every
scenario lands in its `acceptable` set, 1 otherwise. A one-notch disagreement
(`PUBLISH`↔`REVISE`) is a soft signal, not a failure — the ship/tighten boundary is fuzzy.

## The corpus (`judge.mjs`)

Spans the verdict range and exercises the v1.5 rules:

| Post                                   | Expected | Why it's here                                      |
| -------------------------------------- | -------- | -------------------------------------------------- |
| meshcore-firmware-solar-relays (07-06) | PUBLISH  | Strong tech post; also the accuracy soft spot      |
| priest-landrum-fires (07-08)           | REVISE   | Retrospective on a non-event, missing a "so what"  |
| find-your-evacuation-zone (07-14)      | PUBLISH  | Best resident post; actionable                     |
| psps-backup-power-deadline (07-17)     | PUBLISH  | Strong preparedness post, sourced + actionable     |
| satellite-texting-canyon (07-11, rej.) | REJECT   | Comparison-trap: laundered coverage claim (§10.4)  |
| technician-exam-pool (07-13, rej.)     | REVISE   | Well-sourced but thin local angle                  |
| satellite-texting-blind-spot (07-17)   | REJECT   | Comparison-trap + false physics symmetry           |
| simulated-emergency-test (10-01, rej.) | REJECT   | Declined as not interesting: an event as subject   |
| radio-fcc-id-check (10-30, rej.)       | REJECT   | Compliance memo: a rule restated, then a checklist |

The human intro (`what-this-blog-is-for`) is excluded — it's the one sanctioned meta post.

## The scenarios (`generate.mjs`)

Each probes a failure mode; `acceptable` is the outcome set that counts as a pass:

| Scenario                     | Acceptable                 | Probe                                             |
| ---------------------------- | -------------------------- | ------------------------------------------------- |
| legit-fieldreport            | PUBLISH / REVISE           | Clearly publishable peer-network story            |
| legit-tech-fcc               | PUBLISH / REVISE           | Fresh tech topic that tempts an own-network claim |
| comparison-trap-kuiper       | DECLINE / PUBLISH / REVISE | A new satellite topic — must not become a foil    |
| retro-minor-fire             | DECLINE / PUBLISH          | Minor event — must add a "so what" or decline     |
| thin-filler-family-plan      | DECLINE / PUBLISH          | Generic checklist — decline or make it local      |
| replay-mesh-signing          | PUBLISH / REVISE           | Replay of PR #62 — watch the voice score          |
| replay-declined-psps         | DECLINE                    | Replay of PR #67 — a declined subject, new angle  |
| replay-dup-in-review         | DECLINE                    | Replay of PR #70 — same subject already in review |
| heldout-declined-winter-node | DECLINE                    | Declined subject, fresh peg, not named in brief   |

Scenario sources are representative fixtures (generated drafts are never published), so
the judge's "URLs unverifiable" accuracy flag is expected noise here — it's constant
across runs, so it doesn't mask a real change in the other dimensions.

## Worked example — the loop actually improving the writer

`generate.mjs` caught the writer trying to earn local relevance with an implied own-network
claim: on a topic about an FCC HF rule change, it named S.I.E.R.R.A and described how the
change helped its mesh-plus-HF setup — a §10.4 gate failure. The fix was a targeted edit to
the writer prompt: a "four traps" self-check (led by the implied-own-network claim) plus a
list of where local relevance is _allowed_ to come from (terrain, towns, season, the
reader's own kit). Re-running showed the delta:

|        | legit-tech-fcc      | aggregate                                 |
| ------ | ------------------- | ----------------------------------------- |
| before | REJECT · gate:FAIL  | 4/5 acceptable · mean 3.80 · 1 gate-fail  |
| after  | PUBLISH · gate:pass | 5/5 acceptable · mean 4.00 · 0 gate-fails |

That edit was made by hand. `autotune.mjs` does the same loop automatically.

## Worked example — machine voice (October 2026)

PR #62 was accurate, sourced, and approved by the critic ("zero epigrams"), and it read as
generated: "The gap is not hypothetical", "The direction is set; the release to run it on is
not here yet", a slogan heading. The voice judge put every post in the archive at 2–3/5,
July included, so this was never a regression. The voice had been there from the start and
nothing was measuring it. The brief allowed one epigram per post and held up a tagline as the
model voice.

Writer A/B (6 scenarios × 2 samples, voice judged by Opus 5.5 and Fable 5.1, mandate by Opus
5.5 at 3 votes; `retro-minor-fire` gate fails excluded, as its fixture URL was a placeholder):

| writer     | old brief: voice · tells | §8 rewrite: voice · tells | gate fails (old → new) |
| ---------- | ------------------------ | ------------------------- | ---------------------- |
| Opus 4.8   | 2.55 · 6.8               | 2.95 · 5.6                | 0 → 4                  |
| Opus 5.5   | 2.85 · 5.5               | **4.05 · 3.0**            | 0 → 0                  |
| Sonnet 5.5 | 2.75 · 6.2               | 3.78 · 3.6                | 0 → 0                  |
| Fable 5.1  | 2.50 · 7.5               | 3.15 · 5.0                | 0 → 1                  |

The model upgrade alone barely moves voice; the rewrite alone hurts Opus 4.8, which filled
the space left by the flourishes with plain, unsourced background facts (hence "plain is not
bare" in §8). Together they work. Critic (`critic.mjs`, posts starting at ~10 tells):
Sonnet 4.6 left 10.8 on the old brief and 7.0 on the new one; Sonnet 5.5 and Opus 5.5 left
4.3 on the new one.

## Worked example — topic memory and the appeal test (October 2026)

Members declined nine desk drafts in October, and two subjects were drafted twice. Brief
v1.9 fixed two things, and both were measured. Baseline: the v1.8 brief, prompt and
plumbing, which never showed the writer its open drafts.

**Duplicates** (`generate.mjs`, three DECLINE-only scenarios):

| scenario                     | v1.8                                         | v1.9    |
| ---------------------------- | -------------------------------------------- | ------- |
| replay-declined-psps         | PUBLISH (it redrafted the declined PR #67)   | DECLINE |
| replay-dup-in-review         | REVISE (it drafted the subject under review) | DECLINE |
| heldout-declined-winter-node | not run                                      | DECLINE |

The full v1.9 suite: 9/9 acceptable, 0 gate fails, fitness 71.3. (It ran on the first
draft of the appeal test, before the narrowing described below.) The three must-publish
scenarios still produced drafts, so the new rules didn't push the writer into declining
everything. The brief names both replays as examples, so those two partly test recall.
The held-out scenario is the one the brief doesn't mention.

**Appeal** (`judge.mjs`, Opus judge, 3 votes per case):

| case (label)                             | v1.8 rubric     | v1.9 rubric     |
| ---------------------------------------- | --------------- | --------------- |
| simulated-emergency-test (REJECT)        | REVISE, value 4 | REJECT, value 2 |
| radio-fcc-id-check (REJECT)              | REVISE, value 4 | REJECT, value 2 |
| find-your-evacuation-zone (PUBLISH)      | REVISE          | REVISE, value 5 |
| psps-backup-power-deadline (PUBLISH)     | REVISE          | REVISE          |
| meshcore-firmware-solar-relays (PUBLISH) | REVISE          | REVISE          |
| priest-landrum-fires (REVISE)            | REVISE          | REJECT (2 of 3) |

The first draft of the appeal test said "if a link to the agency's page would serve as
well, there is no post." On that wording the judge rejected the evacuation-zone post, which
is the archive's best resident post, 3 votes to 0. The test now turns on what the procedure
is worth to the reader, and that post scores value 5. The brief also names both declined
subjects as examples, so the REJECTs partly test recall. The useful signal is that the
merged posts didn't move. Priest/Landrum is one notch harsher, a soft miss that was left
alone. The PUBLISH→REVISE near-misses on the July posts predate v1.9: they come from the
v1.8 voice rules.

## Auto-tune (auto-learn)

`autotune.mjs` runs the improve loop without a human at the wheel:

1. Evaluate the current writer prompt (baseline fitness).
2. An **optimiser** model reads the prompt + the judge's feedback on the latest drafts and
   proposes a sharper writer prompt.
3. Re-generate and re-judge. **Keep** the candidate only if it beats the best on the train
   scenarios _and_ doesn't regress on a **held-out** set the optimiser never sees.
4. Repeat for N rounds. Dozens of drafts are generated and thrown away; only the scores and
   the winning prompt survive.

**Fitness** is a single scalar (`lib.mjs` `scorecard`): `10·mean − 50·gate-fails −
20·misses`. It rewards good _published_ posts and punishes honesty-gate failures and
out-of-bounds outcomes.

Auto-tuning against an LLM judge is easy to break, so the loop is fenced:

- **Reward-hacking** — the fitness makes "just decline everything" score badly (it misses
  the must-publish scenarios), and the optimiser is explicitly forbidden to weaken the
  mandate, change the output format, or tell the writer to decline/hedge to dodge scores.
  Candidates that drop required structure (the frontmatter, `make verify`, the
  `src/content/blog/` mechanics, the `DECISION: NO POST` path) or balloon/shrink in size
  are discarded before they're scored.
- **Overfitting** — the held-out scenarios gate acceptance, so a prompt that only games the
  training topics is rejected.
- **Human-in-the-loop** — the winner is written to
  `.github/prompts/news-desk-writer.candidate.md` (git-ignored) for you to **diff and
  review**. It is never applied to the live prompt or merged automatically.

```sh
npm run eval:autotune              # 3 rounds
node evals/autotune.mjs --rounds=5 # more attempts
EVAL_OPT_MODEL=claude-opus-5-5 EVAL_VOTES=3 node evals/autotune.mjs   # steadier signal
```

Then: `diff .github/prompts/news-desk-writer.md .github/prompts/news-desk-writer.candidate.md`,
and if you like it, apply it and open a PR like any other prompt change.

## How to tune

- **Writer:** run `eval:generate`, read the per-scenario issues + the saved drafts, edit
  `.github/prompts/news-desk-writer.md` (or the brief), re-run, compare the scorecard.
  A/B a big change with `--prompt=` before committing it.
- **Rubric/mandate:** run `eval:desk`. If the judge disagrees with a label, either the
  rubric is wrong (`rubric.md`) or the label is (`cases.json`) — resolving which is the point.
- **Model choice:** re-run with `EVAL_JUDGE_MODEL` to see how a cheaper/different judge
  compares before trusting it anywhere.

## Deliberate limits

- **Single-model judge** (with N-vote majority). Stronger still is a _panel_ of different
  models per case, so the judge never shares the generator's blind spots.
- **Scenario sources are fixtures**, so `generate.mjs` tests topic-handling and writing,
  not live research/sourcing (that stays a human-review job on the real PR).
- **Small sets.** Both are seeds — add cases and scenarios as the desk produces new good
  and bad examples, especially real edge cases a human had to think about.
- **Auto-tune is bounded by its scenarios.** With only a handful of them, the held-out
  gate reduces but does not eliminate overfitting — the more scenarios (and votes) you run,
  the more the winning prompt generalises. Treat the candidate as a proposal to review, not
  a verified improvement. And it can plateau: if no candidate beats the baseline, that's a
  real result (the current prompt is near a local optimum for these scenarios), not a bug.
