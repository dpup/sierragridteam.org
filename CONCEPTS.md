# Concepts

Shared domain vocabulary for this project — entities, named processes, and status concepts
with project-specific meaning. Seeded with core domain vocabulary, then accretes as
ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary
only, not a spec or catch-all.

## The automated desks

### Desk

An autonomous editorial agent that drafts posts for the public blog and opens them as pull
requests. A desk never publishes: a human merging the pull request is what publishes, and
every desk's public disclosure promises that review.

Each desk is a pipeline of at least two agents — a writer (or editor) followed by a Critic
— governed by a Brief.

### News Desk

The slow-channel desk: technology news, analysis, preparedness, explainers, and
retrospectives. It runs on a schedule, declines to publish on most runs, and never covers
an incident that is still unfolding.

### Fire Desk

The live-channel desk, and the only sanctioned exception to the rule that a desk never
covers an unfolding incident. It maintains a single Fire Bulletin during an active
wildfire, safe only because it is framed as a timestamped digest of official figures that
defers to official sources and re-publishes often enough never to go stale.

### Desk Editor

The agent that applies a trusted member's review comment to an open desk pull request,
editing the post in place on its branch. It is the point at which a human's instruction
enters a run that has already started, and — like the desks — its output is re-checked by a
Critic before the branch is updated.

### Critic

The adversarial verification stage that reviews a desk's or editor's output and may reject
it: by deleting a new draft, or by reverting an edit. Where a pipeline pins its models, the
Critic is pinned to a different one from the agent it reviews, on the principle that a
verifier sharing the producer's blind spots catches fewer of its errors.

The Critic is the **last writer of record** — whatever it concludes is what reaches the
pull request, so any policy exception, human decision, or source material that does not
reach the Critic will be undone by it. Its authority is bounded to verification: it does
not overturn an editorial decision a human already made in review.

### Brief

A desk's governing editorial policy — scope, audience, sourcing, the publish decision,
voice, and the hard rules — versioned and referenced by section number from every prompt in
that desk's pipeline. Each desk has its own; where a prompt and the brief conflict, the
brief wins.

## Member input and post kinds

### Topic proposal

A member's filed request for a post — a link, an angle, rough notes, or a complete draft —
which is what authorizes the desk to cover a subject it could not raise on its own.

What arrives decides the path: notes or an angle become a Commissioned post; a finished,
signed piece becomes a Signed member submission. A proposal also carries editorial
authority — a member filing one has made the publish decision, so the desk's own pacing
rules are not grounds to decline it — and it becomes the source of record for any
organizational facts the post states.

### Commissioned post

Organizational news that a member explicitly proposed, written by the desk in the desk's
own voice under the desk's byline. It is the only route by which the organization itself
may be a post's subject: a desk never originates news about the organization, because it
cannot verify any of it, so a member proposing it is what supplies the authority.

The proposal is the source of record for the organization's own facts. It authorizes
nothing else — every other claim still needs its own citable source, and no proposal
authorizes a claim about the network's coverage, reach, or performance.

### Signed member submission

A member's own finished piece, published under **their** byline and copy-edited rather than
rewritten. Voice, structure, register, and sign-off belong to the author; the desk fixes
what is simply wrong — canonical names, errors of execution, and hard specs — and applies
the honesty rules in full.

_Distinguished from:_ a Commissioned post, where the member supplies the topic and facts
and the desk supplies the writing. The test is what arrived: notes and an angle make a
commissioned post; a finished signed piece makes a submission.

### Fire Bulletin

The single live-updating post the Fire Desk maintains during an active wildfire. Exactly
one is open at a time; it is updated in place rather than superseded, keeps its original
publication date for the whole episode, and is converted to a retrospective when the
incident closes.

## Flagged ambiguities

- "Member's draft" had been used for both a Topic proposal generally and a finished signed
  piece specifically — these are distinct, and they receive opposite editorial treatment
  (the desk writes a Commissioned post; it only copy-edits a Signed member submission).
