# Signal Desk evals

An **LLM-as-judge** harness for tuning the automated News Desk (the "Signal Desk"), so a
change to the mandate, the writer prompt, or the rubric can be **measured** instead of
argued. Two loops:

- **`judge.mjs` — score fixed posts.** Judges a labeled corpus (real published posts +
  rejected drafts) against a rubric derived from the mandate, and flags where the judge's
  verdict differs from a human label. Use it to tune the **rubric/mandate** and as a
  regression gate.
- **`generate.mjs` — generate then judge.** Runs the **writer prompt** on scenarios,
  drafts a post (or declines), then judges the output. Use it to tune the **writer** —
  edit the prompt, re-run, watch the scorecard move.

## What's here

- `rubric.md` — how the judge applies the mandate: a hard-rule **gate**, five scored
  dimensions, and a verdict (`PUBLISH` / `REVISE` / `REJECT`). The tunable knob.
- `cases.json` — the labeled corpus for `judge.mjs`.
- `cases/rejected/*.md` — snapshot fixtures of drafts opened then closed without merging
  (their branches are gone). Published posts are read live from `src/content/blog/`.
- `scenarios.json` — the scenarios for `generate.mjs`: a shared context (date, conditions,
  archive, declined list) plus topics + inline source material. Each probes a known
  failure mode and lists the `acceptable` outcomes.
- `judge.mjs`, `generate.mjs` — the two harnesses. `lib.mjs` — shared plumbing (calling
  `claude`, extracting the verdict JSON, majority voting, scoring).

## Running

```sh
npm run eval:desk                    # judge the fixed corpus (Opus judge, 1 vote/case)
node evals/judge.mjs --votes=3       # majority of 3 — stabilises borderline cases
npm run eval:generate                # generate-then-judge (Opus writer, Sonnet judge)
node evals/generate.mjs --prompt=/abs/path/variant-writer.md   # A/B a writer-prompt variant
node evals/generate.mjs --json       # machine-readable (includes the generated drafts)
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

| Post                                   | Expected | Why it's here                                     |
| -------------------------------------- | -------- | ------------------------------------------------- |
| meshcore-firmware-solar-relays (07-06) | PUBLISH  | Strong tech post; also the accuracy soft spot     |
| priest-landrum-fires (07-08)           | REVISE   | Retrospective on a non-event, missing a "so what" |
| find-your-evacuation-zone (07-14)      | PUBLISH  | Best resident post; actionable                    |
| psps-backup-power-deadline (07-17)     | PUBLISH  | Strong preparedness post, sourced + actionable    |
| satellite-texting-canyon (07-11, rej.) | REJECT   | Comparison-trap: laundered coverage claim (§10.4) |
| technician-exam-pool (07-13, rej.)     | REVISE   | Well-sourced but thin local angle                 |
| satellite-texting-blind-spot (07-17)   | REJECT   | Comparison-trap + false physics symmetry          |

The human intro (`what-this-blog-is-for`) is excluded — it's the one sanctioned meta post.

## The scenarios (`generate.mjs`)

Each probes a failure mode; `acceptable` is the outcome set that counts as a pass:

| Scenario                | Acceptable                 | Probe                                             |
| ----------------------- | -------------------------- | ------------------------------------------------- |
| legit-fieldreport       | PUBLISH / REVISE           | Clearly publishable peer-network story            |
| legit-tech-fcc          | PUBLISH / REVISE           | Fresh tech topic that tempts an own-network claim |
| comparison-trap-kuiper  | DECLINE / PUBLISH / REVISE | A new satellite topic — must not become a foil    |
| retro-minor-fire        | DECLINE / PUBLISH          | Minor event — must add a "so what" or decline     |
| thin-filler-family-plan | DECLINE / PUBLISH          | Generic checklist — decline or make it local      |

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
