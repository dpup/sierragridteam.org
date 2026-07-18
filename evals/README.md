# Signal Desk evals

A minimal **LLM-as-judge** harness for tuning the automated News Desk (the "Signal
Desk"). It scores a labeled corpus of real drafts against a rubric derived from the
mandate and reports where the judge's verdict differs from a human editor's label.

It exists so that a change to the mandate, the writer/critic prompts, or the rubric can
be **measured** instead of argued: edit, re-run, watch the verdicts move.

## What's here

- `rubric.md` — how the judge applies the mandate: a hard-rule **gate**, five scored
  dimensions, and a verdict (`PUBLISH` / `REVISE` / `REJECT`). This is the tunable knob.
- `cases.json` — the labeled corpus. Each case is a post + the `expected` verdict a human
  editor would defend under the current mandate.
- `cases/rejected/*.md` — snapshot fixtures of drafts that were opened and closed without
  merging (their branches are gone, so they're pinned here). Published posts are read
  live from `src/content/blog/`.
- `judge.mjs` — the harness.

## The corpus

Chosen to span the verdict range and to exercise the v1.5 rules specifically:

| Post                                   | Expected | Why it's here                                         |
| -------------------------------------- | -------- | ----------------------------------------------------- |
| meshcore-firmware-solar-relays (07-06) | PUBLISH  | Strong tech post; also the accuracy soft spot (specs) |
| priest-landrum-fires (07-08)           | REVISE   | Retrospective on a non-event, missing a "so what"     |
| find-your-evacuation-zone (07-14)      | PUBLISH  | Best resident post; actionable                        |
| satellite-texting-canyon (07-11, rej.) | REJECT   | Comparison-trap: laundered coverage claim (§10.4)     |
| technician-exam-pool (07-13, rej.)     | REVISE   | Well-sourced but thin local angle                     |
| satellite-texting-blind-spot (07-17)   | REJECT   | Comparison-trap + false physics symmetry              |

The human intro post (`what-this-blog-is-for`) is intentionally excluded: it is the one
sanctioned meta/charter post, not automated desk output.

## Running

```sh
npm run eval:desk                 # judge with the default model (Opus), 1 vote/case
node evals/judge.mjs --votes=3    # 3 votes/case, majority verdict — stabilises borderline cases
node evals/judge.mjs --json       # machine-readable results
EVAL_JUDGE_MODEL=claude-sonnet-4-6 node evals/judge.mjs   # judge with a different model
```

**Voting.** Verdicts are noisy near the REVISE boundary — a single judge flip-flopped
between REJECT and PUBLISH on the subtlest comparison-trap draft across two runs. `--votes=N`
(or `EVAL_VOTES=N`) takes N votes per case and picks the majority; ties break toward the
_harsher_ verdict (this is a trust-critical feed — when judges split, don't ship). Use it
for a stable baseline or when a case sits on a boundary.

Requires the `claude` CLI on PATH (it is, in CI and in the sandbox). Each case is one
`claude -p` call, so a full run is ~6 calls / a couple of minutes.

**Exit code:** 0 if every verdict is within one notch of its label; 1 on a two-notch
miss (`PUBLISH`↔`REJECT`), an unparseable judge response, or a harness error. A one-notch
disagreement (`PUBLISH`↔`REVISE`) is a soft signal, not a failure — verdicts are
judgments and the boundary between "ship it" and "tighten it" is genuinely fuzzy.

## How to use it for tuning

- **Regression:** run before and after a mandate/prompt edit. The gate should keep
  rejecting the comparison-trap drafts; the good posts should keep passing.
- **Rubric work:** if the judge disagrees with a label, either the rubric is wrong (fix
  `rubric.md`) or the label is (fix `cases.json`) — resolving which is the point.
- **Model choice:** re-run with `EVAL_JUDGE_MODEL` to see how a cheaper/different judge
  compares, before trusting it anywhere in the pipeline.

## Deliberate limits (not yet built)

- It judges **existing artifacts**, not fresh generations. A natural next step is a
  generate-then-judge mode that runs the writer prompt on a scenario and scores the
  output — closing the loop from "tune the rubric" to "tune the writer."
- Single model judges (with N-vote majority). A stronger check is a _panel_ of different
  models per case, so the judge doesn't share the writer's blind spots — the same
  cross-model logic the pipeline itself now uses.
- The corpus is tiny (6). It's a seed; add cases as the desk produces more good and bad
  examples — especially real edge cases a human had to think about.
