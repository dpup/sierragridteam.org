---
title: A policy exception the adversarial critic was never taught gets silently reverted
category: architecture-patterns
module: desk-agents
date: 2026-07-29
last_updated: 2026-07-29
problem_type: architecture_pattern
component: assistant
severity: high
related_components:
  - background_job
  - development_workflow
  - documentation
symptoms:
  - 'The critic ran a full re-review after a one-word edit and reverted an entire treatment a human reviewer had explicitly requested — author byline, tag, headline, sign-off, and opening paragraph'
  - 'The critic cited real policy sections as justification for each revert, so its notes read as correct enforcement rather than as a regression'
  - "The writer declined a member's commissioned submission because a scope rule written to stop the desk INVENTING org news also fired when a human handed it the news"
  - 'A cadence guard demoted an issue-triggered proposal to a backlog candidate, where it lost the general publish bar on pacing every run and was deferred forever with no failure signal'
  - "The critic could not verify that a commissioned post's facts traced back to the member proposal, because the proposal was never passed to it"
root_cause: inadequate_documentation
resolution_type: workflow_improvement
applies_when:
  - 'A writer/editor agent is followed by an adversarial critic or verifier agent that can itself edit the artifact'
  - "Adding a policy exception, override, or special case to a multi-agent pipeline's policy document or prompts"
  - "A human reviewer's decision enters the loop mid-pipeline and a downstream automated stage runs after it"
  - 'A verifier is asked to check traceability, sourcing, or provenance against material it must be explicitly handed'
  - 'A guard (cadence, rate limit, quota, pacing) can defer work into a queue that has no separate escalation or expiry path'
tags:
  - multi-agent
  - agent-pipeline
  - adversarial-critic
  - prompt-design
  - policy-exception
  - human-in-the-loop
  - github-actions
  - editorial-workflow
---

# A policy exception the adversarial critic was never taught gets silently reverted

## Context

This repo publishes a blog written by a pipeline of LLM agents running headless in GitHub
Actions. Three agents matter here, and all three are governed by one policy document,
`docs/news-feed-content-brief.md`, whose numbered sections (§4 scope, §6 the publish
decision, §7–§9 voice and format, §10 the ten honesty hard rules) are quoted by every
prompt:

- **News Desk** (`.github/workflows/news-desk.yml`) — a WRITER agent
  (`.github/prompts/news-desk-writer.md`) drafts a post, then an adversarial CRITIC on a
  deliberately different model (`.github/prompts/news-desk-critic.md`) reviews it and can
  veto by deleting the file. Whatever survives becomes a PR for a human to merge.
- **Desk Editor** (`.github/workflows/desk-editor.yml`) — triggered when a trusted member
  comments on an open desk PR. An EDITOR agent applies the feedback, then the _same_
  news-desk critic prompt re-reviews the result with an "editor-mode preamble" appended by
  the workflow. Here the veto is `git checkout --` — a revert rather than a delete.

The pipeline is deliberately adversarial, and it worked as designed. That is the problem:
it kept working as designed while producing four consecutive wrong outcomes.

**The failure chain.** A member — the founder — filed issue #21 containing his own
finished, signed draft announcing a grant application, and labelled it `desk:news`.

1. **The desk declined it as out of scope.** The brief said the desk never writes about
   the organization itself ("Humans publish those manually"). That rule exists to stop the
   desk _inventing_ unverifiable organizational news — but the rule stated the prohibition
   without its reason, so the agent applied it to a case the reason never covered: a human
   handing the desk the news.
2. **The cadence guard silently demoted it.** The proposal arrived two days after the last
   post, so the 3-day guard caught the issue-triggered run and the workflow commented
   "kept as a candidate" on the issue. That converted an explicit human request into a
   backlog item, where it was judged by the _general_ editorial bar — pacing, pillar
   variety, the "so what" test — and lost on every subsequent daily run. The writer's own
   notes named cadence as the decisive factor.
3. **Fix 1 (PR #22)** added brief §4.6 "commissioned organizational posts", made an issue
   trigger bypass the cadence guard, **passed the run context to the critic**, and fenced
   the untrusted member body — `printf '%s'` leaves no trailing newline, so the member's
   draft had been running directly into the instructions that followed it.
4. **The desk then rewrote the member's signed draft into desk voice** (PR #23). The human
   reviewer redirected it to a light copy-edit, and the Desk Editor did that well.
5. **The verifier undid the human.** The reviewer commented "It should be MeshCore." The
   editor made exactly that edit — and then the critic performed a "full re-review" and
   reverted the entire submission treatment: `author` from the member's name back to the
   desk, `tag` from `Member Submission` back to `Announcement`, the headline replaced, the
   personal sign-off stripped, the exclamation mark removed, the opening paragraph
   rewritten. It cited §7–§9 and §4.6 for every revert, correctly, per the rules it had
   been given. Its preamble had told it "every review standard above still binds to the
   WHOLE edited post" and "Review the entire current file, not just the diff".
6. **Fix 2 (also PR #23)** added brief §4.7 "signed member submissions", taught the
   news-desk critic that the voice rules do not bind a signed submission and that stripping
   an author's byline is "a defect you introduce, not a fix", and added two numbered points
   to the critic preamble in `.github/workflows/desk-editor.yml`.
7. **Verified.** The pipeline was retriggered on the same PR and the bot correctly made no
   changes: it verified the sources, confirmed the hand-applied fixes, and left the
   author's voice intact.

Fix 2 also settled a secondary question that had been leaking into the reviewer's inbox:
three classes of change are **always** the desk's job regardless of byline — canonical
proper-noun spellings from the style guide, errors of execution (typos, dropped words),
and hard specs (frontmatter, headline length) — because the editor had been raising them
as open questions for the author instead of just fixing them.

## Guidance

**1. A policy exception must reach every agent in the pipeline — especially the verifier.**
The verifier is the last writer of record. Whatever it believes at the end of the run is
what ships; an earlier agent's understanding has no standing against it. An exception added
to the writer's prompt but not the critic's is not an exception, it is a round trip: the
writer produces the exceptional artifact and the verifier grinds it back to the default.
When you add a carve-out to a shared policy, enumerate every agent that reads that policy
and update each one. Grep for the rule's text across every prompt and workflow that reads
it (here, `.github/prompts/` and `.github/workflows/`), not just the file you were editing.

**2. A verifier told to re-review the whole artifact against house rules will treat any
human-directed exception as a defect to fix.** "Review everything" and "enforce style"
compose into "restyle everything" — and the verifier will produce a _correct_ citation for
every regression it introduces, which makes the output look reviewed rather than reverted.
If you want a broad re-review, say what broad means: look for defects everywhere, do not
restyle text the human left alone.

**3. A verifier must not overturn an editorial decision a human already made in review.**
Rank the human's instruction above the style rules explicitly, in the verifier's own
prompt, and give it the conflict-resolution heuristic: a rule that reads against the
reviewer's explicit instruction is a rule you have misread — expect an exception and go
find it. Leave exactly one escape hatch (a genuine safety/honesty violation), scope it
narrowly ("fix that one thing, leave the rest of the decision standing"), and require it to
be stated in the notes.

**4. A verifier cannot check provenance against source material it was never given.** If
the writer's job is "every organizational fact must trace to the member's proposal," the
critic needs the proposal. Give the verifier the same context as the producer — and note
the second-order effect: a verifier missing the context does not merely fail to check, it
_misjudges_, because the artifact now looks unsourced or out of scope on its face.

**5. State the WHY inside a categorical rule.** "Never write about X" without its reason
gets applied to every case the words cover, including the ones the reason does not. An
agent cannot infer intent from a prohibition. Write the rule as prohibition + purpose +
the shape of its exception, so that when a novel case arrives the agent can test it against
the purpose instead of pattern-matching the words.

**6. A guard that defers rather than refuses will silently kill work.** Routing an explicit
human request into a general-purpose queue, judged by a general-purpose bar, means it never
runs — and it fails _politely_, with a friendly "kept as a candidate" that reads like
progress. When a human has already made the decision the guard exists to substitute for,
the guard does not apply: bypass it, and say in the code comment why. If a request truly
cannot run, refuse it loudly with a reason, rather than deferring it into a backlog where
it will lose quietly and repeatedly.

**7. Give the pipeline a place to record "this class of thing is always yours."** Where an
agent must defer to a human, name the narrow set of changes it should still make
unilaterally — canonical names, outright errors, hard specs — or deference degrades into
either timidity (a queue of questions for the human) or overreach (rewriting everything).
Deference that ships a human's work at its worst is not deference.

**8. The same rule applies _within_ a prompt: a carve-out is undone by an unqualified
restatement further down.** An agent reads a prompt top to bottom, and a later blanket
sentence reads as the more specific instruction because it is the last one seen. This
learning's own fix demonstrates it — see "The fix reproduced the bug" below. After adding
an exception, re-read the whole file for any earlier or later sentence that restates the
default without qualification, and qualify it in place.

## Why This Matters

The expensive property of a critic/verifier stage is that it is _last_. Every improvement
upstream — a better prompt, a richer context, a human's own words — is provisional until
the verifier agrees with it. That inverts the usual intuition about where to put a policy
change: the natural place is the producer's prompt, because that is where the work happens,
but the _binding_ place is the verifier's, because that is where the work is confirmed or
undone. A pipeline where the exception lives only upstream burns a full run and produces an
artifact that looks like a considered decision.

The failure mode is also nearly invisible in review. Every revert in step 5 came with a
correct rule citation. The PR comment reads as a thorough review, the notes read as
diligence, and the diff reads as house style being applied. Nothing looks broken; the
member simply gets back a stranger's essay under the desk's name. A human skimming the bot
comment has no signal that a decision was overturned — the only signal is the diff, and
diffs from a "review" step are exactly the ones people skim.

And the human cost is asymmetric. The pipeline's throughput loss was one run. The
volunteer's loss was his byline, his sign-off, and his sentences, applied twice after he
had already corrected it once. Systems that quietly overrule the people they are meant to
serve stop being used — a founder who has to fight a bot for his own byline files the next
announcement by hand, and the automation's value goes to zero without anyone filing a bug.

Finally, the deferral pattern in step 2 is worth naming on its own because it produces no
error at all. A refusal gets argued with; a deferral gets thanked. "Kept as a candidate"
was true, polite, and fatal — the request lived on in a queue where the bar was written for
a different kind of input. Any guard whose failure mode is "later" should be audited for
whether "later" ever arrives.

## When to Apply

Reach for this checklist whenever:

- **You are adding an exception, carve-out, or override to a policy read by more than one
  agent.** Before you commit, list every agent that reads it and confirm each one now knows
  about the exception — the verifier first.
- **You are writing or editing a verifier/critic/judge prompt.** Ask what happens when the
  artifact it reviews was shaped by a human decision it cannot see. If the answer is "it
  normalizes it," the prompt is incomplete.
- **A human is in the loop mid-pipeline** — review comments, approvals, commissioned work,
  anything where a person's instruction enters after the run started. That instruction is
  context every downstream agent needs, ranked above the defaults.
- **You are adding a rate limiter, cadence guard, quota, or queue** to an autonomous system
  that also accepts explicit human requests. Decide which class of input the guard governs,
  and route human-initiated work around it rather than through it.
- **A rule is stated categorically** ("never," "always," "only"). If you cannot find its
  reason in the same paragraph, add it — that is the sentence a future agent will need to
  decide a case you did not anticipate.
- **An agent produced a defensible-looking wrong result with correct citations.** That
  signature almost always means missing context or an unstated exception, not a bad model.
  The fix is in the prompt/context plumbing, not in more rules.

It does _not_ apply to a single-agent flow with no verification stage, or to rules that
genuinely admit no exception. Note how the brief treats §10.4 (no claims about network
coverage or performance): it is written as absolute _and says so repeatedly_, including
inside the exception itself — "This rule has no exception… no member proposal, quote, or
draft authorizes it either". An exception-free rule should be labelled as one, at each site
where a reader might expect an exception.

## Examples

**The rule that lacked its reason, and the reason being added.** The original scope rule
stated only the prohibition. The brief now states the purpose in the same breath
(`docs/news-feed-content-brief.md`):

> **On your own initiative you never write about S.I.E.R.R.A itself** — new relays on the
> air, coverage changes, grants, trainings, volunteer events. None of it is verifiable from
> where you sit, and manufacturing organizational news is the worst failure available to
> you.

…and the run context makes the boundary explicit for the case that actually arrived
(`.github/workflows/news-desk.yml`):

> The out-of-scope rule stops you INVENTING organizational news; it does not stop a member
> commissioning it.

**The guard that deferred instead of refusing.** The bypass, with the diagnosis preserved
in the comment (`.github/workflows/news-desk.yml`):

```bash
# A member labelling an issue `desk:news` IS the editorial decision to run now, so
# the cadence guard doesn't apply: pacing is the desk's rule for the ideas it
# originates (brief §6, §4.6). Deferring a member's proposal on spacing sent it to
# the daily run, where it competed against the general publish bar and quietly died.
# The major-fire pause above still holds; the publish decision still holds.
if [ "${{ github.event_name }}" = "issues" ]; then
```

The corresponding policy line ranks the two bars against each other: "All of §6 governs the
ideas you originate… Do not decline one on pacing, cadence, pillar balance, or the 'so
what' test." Note that the safety guard above it — the major-fire pause — is deliberately
_not_ bypassed. Human authority overrides editorial judgment, not safety.

**The verifier that could not check provenance.** PR #22 gave the critic the writer's
context; the comment states the two distinct failures that omission caused
(`.github/workflows/news-desk.yml`):

```bash
# The critic gets the same run context as the writer — without the member's proposal
# it cannot check that a commissioned post's organizational facts trace back to it,
# and would read the subject itself as out-of-scope and veto.
claude --model "$CRITIC_MODEL" --dangerously-skip-permissions --max-turns 50 \
  -p "$(cat .github/prompts/news-desk-critic.md; echo; cat /tmp/news-desk/run-context.md)"
```

**"Review the whole file" becoming "restyle the whole file."** The instruction the critic
was given (`.github/workflows/desk-editor.yml`): "every review standard above still binds
to the WHOLE edited post" and "Review the entire current file, not just the diff." What it
produced — the reviewer had asked for one word to change, `MeshCORE` → `MeshCore`:

```diff
-title: 'Connecting the Corridor: S.I.E.R.R.A Applies for Calaveras Grant to Expand MeshCORE Infrastructure'
+title: 'S.I.E.R.R.A applies for a Calaveras grant'
-tag: Member Submission
-author: Jay Goldberg, founder
+tag: Announcement
+author: News Desk
```

…plus a rewritten opening paragraph and a stripped sign-off. The requested one-word fix was
applied correctly; everything around it was normalized to house voice, and every revert
carried a real citation — §7–§9, §4.6, the style guide, the repo's headline-length rule.

**The two guardrails that stopped it** (`.github/workflows/desk-editor.yml`):

> 5. **Do NOT overturn the reviewer's editorial decisions.** … A trusted member made those
>    calls — the byline, the tag, the headline, whether the piece keeps its author's voice,
>    what publishes at all. Your job is verification (honesty, figures, sources, canonical
>    spellings, typos, hard specs), not re-litigating an editorial judgment a human already
>    made. Reverting an explicitly requested treatment because a style rule reads against it
>    is a REGRESSION, and **a rule cited against the reviewer's own instruction is a rule
>    you have misread — expect an exception … and go find it.**
> 6. **"Review the whole file" means look for defects everywhere — not restyle
>    everything.** … Do not treat unchanged text the reviewer left alone as an invitation to
>    rewrite it to house voice.

Point 5 is the generalizable shape: rank the human above the rules, then hand the agent a
_resolution procedure_ for the conflict rather than trusting it to resolve one. "A rule
cited against the reviewer's instruction is a rule you have misread" converts an apparent
license to revert into a prompt to go looking for the exception.

**The same exception, restated for the verifier.** Fix 1 had already added the
commissioned-post carve-out to the writer; the critic's own copy of it
(`.github/prompts/news-desk-critic.md`) is what makes it real:

> **If this is a commissioned organizational post** (brief §4.6 …): **do not veto it on
> scope.** §4.6 is a real exception to the out-of-scope rule and to §6's pacing/variety
> tests.

And for signed submissions:

> **The voice pass above does not apply to it** … Re-voicing a submission, stripping its
> author's byline or sign-off, or retagging it as desk reporting is a **defect you
> introduce**, not a fix.

**Bounded deference.** Deference without a floor turns into a queue of questions for the
human, so both the editor prompt and the brief name what the desk fixes regardless of
byline — canonical names, errors of execution, and hard specs — with the test that
separates the two columns:

> The test: _is this how the author writes, or is it simply wrong?_ How they write is
> theirs. Wrong is yours.

…and the disposal rule that keeps it out of the human's inbox: "**Make them; do not raise
them as questions.**"

**The fix reproduced the bug — four times.** Documenting this learning surfaced four places
where the §4.7 carve-out was contradicted by unqualified text elsewhere. All four have since
been fixed, but they are why guidance point 8 exists:

- `.github/prompts/news-desk-critic.md` — the "Format pass" bullet read "300–700 words…
  `author` set to the desk name" in the _very next bullet_ after the signed-submission check
  that says neither binds a submission. A critic reading top to bottom met the exception
  first and the unqualified restatement last. Fixed by scoping both the voice and format
  passes to "desk-authored copy only", and by moving the classification check ahead of them
  so it frames the passes instead of forward-referencing them.
- `docs/architecture/news-desk.md` — the "Proposing topics" section described copy-editing a
  signed piece, then a few lines later still asserted that the writer "verifies every claim,
  re-voices it… never publishes the submission verbatim." That was the pre-§4.7 rule, and
  exactly the sentence a future agent would cite to justify re-voicing a guest post. Fixed by
  scoping it to a _topic proposal_ and pointing the finished-piece case at §4.7.
- `.github/workflows/news-desk.yml` — the writer's run context still said "Do NOT publish a
  member's draft verbatim… rewrite it into the desk's voice." Fixed by branching the
  instruction on the proposal's shape.
- `.github/workflows/desk-editor.yml` — the editor-mode preamble header still announced "four
  ways" after the list grew to six, so an agent was told to expect four items and met six.

Note what the four had in common: each was a _default restated without qualification_
somewhere the author of the exception was not looking. The exception itself was correct every
time. That is why point 1 says to grep for the rule's text rather than to re-read the file
you just edited — the dangerous copy is the one you have forgotten exists.

## Related

- Issue #21 — the member proposal carrying the signed draft; the provenance artifact the
  critic could not see until the run context was passed through.
- PR #22 — added brief §4.6 (commissioned posts), the cadence-guard bypass, run-context
  propagation to the critic, and the untrusted-body fence. Notably, §4.6 _was_ propagated
  into the critic prompt; §4.7 initially was not, which is the regression documented here.
- PR #23 — the incident PR: the guest post itself plus brief §4.7 and the two critic
  guardrails.
- `docs/news-feed-content-brief.md` — the shared policy both writer and critic defer to
  (§4.6, §4.7, §7–§9 voice, §10 hard rules).
- `docs/architecture/news-desk.md` — the runbook for all three desk agents.
- `docs/fire-desk-content-brief.md`, `.github/prompts/fire-desk-critic.md` — the second
  instance of the same writer/critic structure (though the Fire Desk pins no models, so its
  two stages currently share one). Any exception that ever applies to the Fire Desk must
  move through both prompts together.
- `evals/README.md`, `evals/autotune.mjs`, `evals/rubric.md` — the eval and auto-tune
  harness scores the _writer_ prompt only. Nothing exercises critic prompts, so a critic
  that silently reverts correct work produces a green pipeline.
