#!/usr/bin/env node
// Auto-learn loop for the writer prompt: generate → judge → optimise → repeat, keep the best.
//
// Each round: an optimiser model reads the current writer prompt + the judge's feedback on
// the latest drafts and proposes a sharper writer prompt; we re-generate and re-judge; we
// keep the candidate only if it beats the current best on the TRAIN scenarios AND does not
// regress on a held-out set the optimiser never sees. Dozens of drafts are generated and
// discarded along the way — only the scores and the winning prompt survive.
//
// Guardrails (auto-tuning against an LLM judge is easy to break):
//  - Reward-hacking: fitness rewards good PUBLISHED posts and penalises gate-fails +
//    out-of-bounds outcomes, so "just decline everything" scores badly. The optimiser is
//    explicitly forbidden to weaken the mandate, change the output format, or make the
//    writer decline/hedge to dodge low scores. Candidates missing required structure are
//    discarded before they're even scored.
//  - Overfitting: a held-out scenario set gates acceptance.
//  - Human-in-the-loop: the winner is written to a *.candidate.md for review, NEVER merged
//    or written over the live prompt.
//
// Usage:  npm run eval:autotune            (3 rounds)
//         node evals/autotune.mjs --rounds=5
//   env:  EVAL_GEN_MODEL, EVAL_JUDGE_MODEL, EVAL_OPT_MODEL, EVAL_VOTES
//
// NOTE: this is many `claude` calls (~5 generations+judgements per round + 1 optimiser).
// Run it in the background.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { read, ROOT, callClaude, generateAndJudge, scorecard } from './lib.mjs';

const roundsArg = process.argv.find((a) => a.startsWith('--rounds='));
const ROUNDS = Math.max(1, Number(roundsArg?.split('=')[1] || 3));

const cfg = JSON.parse(read('evals/scenarios.json'));
const ctx = cfg.context;
const GEN = process.env.EVAL_GEN_MODEL || cfg.genModel || 'claude-opus-4-8';
const JUDGE = process.env.EVAL_JUDGE_MODEL || cfg.judgeModel || 'claude-sonnet-4-6';
const OPT = process.env.EVAL_OPT_MODEL || 'claude-opus-4-8';
const VOTES = Math.max(1, Number(process.env.EVAL_VOTES || 1));

const WRITER_REL = '.github/prompts/news-desk-writer.md';
const CANDIDATE = join(ROOT, '.github/prompts/news-desk-writer.candidate.md');
const HOLDOUT = new Set(['legit-fieldreport', 'retro-minor-fire']);

// A candidate must keep the writer's essential machinery — the optimiser only refines
// editorial guidance, it never gets to drop the format or the CI mechanics.
const REQUIRED = ['src/content/blog/', 'make verify', 'DECISION: NO POST', '## If you DO publish'];
const GAIN = 1.0; // train-fitness improvement needed to accept (avoids chasing noise)
const HOLD_EPS = 1.0; // allowed holdout-fitness slack (no meaningful regression)

const NO_WRITE = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash'];

const OPTIMISER = `You are improving the WRITER PROMPT for the S.I.E.R.R.A automated News Desk so the posts it produces are genuinely better — as a careful human editor would judge them, not merely higher-scoring to an automated judge.

You are given the current writer prompt and a judge's feedback on the latest drafts it produced. Propose an improved writer prompt.

HARD CONSTRAINTS — violating any makes your output worthless:
- Do NOT weaken, contradict, or remove any editorial, honesty, or hard rule. The mandate is fixed policy; help the writer FOLLOW it, never relax it.
- Do NOT change the required output format, the frontmatter template, or the CI mechanics (create one file in src/content/blog/, run make verify, the DECISION: NO POST path). Preserve all of that in substance.
- Do NOT tell the writer to decline more, hedge, pad, or write vaguely to avoid low scores. The goal is BETTER published posts, not fewer of them. A prompt that mainly makes the writer decline is a failure.
- Do NOT add anything that targets the judge or the rubric. Improve the writing guidance for READERS.
- Keep the desk persona and the pointers to the brief. Keep it tight — sharpen and reorganise for salience; do not bloat.

METHOD: find the RECURRING weaknesses in the feedback (a repeated tic, a weak "so what", a thin local angle, a §10.4 slip). Add or sharpen concrete, checkable guidance that prevents them at drafting time. Specific instructions beat vague exhortation.

Output ONLY the complete revised writer prompt (Markdown), starting on its first line. No commentary, no code fences.`;

function feedback(rows) {
  return rows
    .map((r) => {
      if (r.err) return `- ${r.name}: ERROR (${r.err})`;
      if (r.outcome === 'DECLINE') return `- ${r.name}: writer DECLINED to post`;
      const s = r.out.scores || {};
      return `- ${r.name}: ${r.outcome}, gate ${r.out.gate?.pass ? 'pass' : 'FAIL'}, scores value=${s.value_sowhat} accuracy=${s.accuracy_sourcing} voice=${s.voice_style} scope=${s.scope_variety} format=${s.structure_format}. Issues: ${(r.out.top_issues || []).join('; ') || 'none'}`;
    })
    .join('\n');
}

function optimise(currentPrompt, trainRows) {
  const prompt = [
    OPTIMISER,
    '\n\n===== CURRENT WRITER PROMPT =====\n',
    currentPrompt,
    '\n\n===== JUDGE FEEDBACK ON THE LATEST DRAFTS (train scenarios) =====\n',
    feedback(trainRows),
    '\n\n===== END =====\nOutput the complete revised writer prompt now.',
  ].join('');
  const text = callClaude(prompt, OPT, { extraArgs: ['--disallowedTools', ...NO_WRITE] });
  return text
    .trim()
    .replace(/^```[a-z]*\n/i, '')
    .replace(/\n```$/i, '')
    .trim();
}

function structurallyValid(candidate, current) {
  const missing = REQUIRED.filter((a) => !candidate.includes(a));
  if (missing.length)
    return { ok: false, why: `dropped required section(s): ${missing.join(', ')}` };
  const ratio = candidate.length / current.length;
  if (ratio > 2.5) return { ok: false, why: `bloated ${ratio.toFixed(1)}x` };
  if (ratio < 0.6) return { ok: false, why: `truncated to ${ratio.toFixed(1)}x` };
  return { ok: true };
}

function evaluate(writerPrompt) {
  const rows = cfg.scenarios.map((sc) =>
    generateAndJudge({ writerPrompt, ctx, sc, genModel: GEN, judgeModel: JUDGE, votes: VOTES })
  );
  const train = scorecard(rows.filter((r) => !HOLDOUT.has(r.name)));
  const hold = scorecard(rows.filter((r) => HOLDOUT.has(r.name)));
  return { rows, train, hold };
}

const fmt = (c) =>
  `fitness ${c.fitness.toFixed(1)} (mean ${c.meanAll.toFixed(2)}, ${c.gateFails} gate-fail, ${c.misses} miss)`;

// ── run ────────────────────────────────────────────────────────────────────────
console.log(
  `\nAuto-tune — writer:${GEN} · judge:${JUDGE} · optimiser:${OPT} · ${ROUNDS} rounds · votes ${VOTES}`
);
console.log(
  `train: ${cfg.scenarios
    .filter((s) => !HOLDOUT.has(s.name))
    .map((s) => s.name)
    .join(', ')}`
);
console.log(`holdout: ${[...HOLDOUT].join(', ')}\n`);

const current = read(WRITER_REL);
let best = { prompt: current, ...evaluate(current), label: 'baseline' };
console.log(`baseline   train ${fmt(best.train)} · holdout ${fmt(best.hold)}\n`);

const history = [
  {
    round: 0,
    label: 'baseline',
    train: best.train.fitness,
    hold: best.hold.fitness,
    accepted: true,
  },
];

for (let r = 1; r <= ROUNDS; r++) {
  process.stdout.write(`round ${r}   optimising… `);
  let cand;
  try {
    cand = optimise(
      best.prompt,
      best.rows.filter((row) => !HOLDOUT.has(row.name))
    );
  } catch (e) {
    console.log(`optimiser error: ${e.message}`);
    history.push({ round: r, accepted: false, note: `optimiser error` });
    continue;
  }

  const check = structurallyValid(cand, current);
  if (!check.ok) {
    console.log(`discarded (${check.why})`);
    history.push({ round: r, accepted: false, note: check.why });
    continue;
  }

  process.stdout.write('evaluating… ');
  const ev = evaluate(cand);
  const improved = ev.train.fitness > best.train.fitness + GAIN;
  const noRegress = ev.hold.fitness >= best.hold.fitness - HOLD_EPS;
  const accept = improved && noRegress;
  const note = accept
    ? 'ACCEPTED'
    : improved
      ? 'rejected (holdout regressed)'
      : 'rejected (no train gain)';
  console.log(`train ${fmt(ev.train)} · holdout ${fmt(ev.hold)} → ${note}`);
  history.push({
    round: r,
    train: ev.train.fitness,
    hold: ev.hold.fitness,
    accepted: accept,
    note,
  });
  if (accept) best = { prompt: cand, ...ev, label: `round ${r}` };
}

console.log('\n' + '─'.repeat(64));
for (const h of history) {
  const t = h.train == null ? '—' : h.train.toFixed(1);
  const ho = h.hold == null ? '—' : h.hold.toFixed(1);
  console.log(
    `round ${h.round}: train ${t} · holdout ${ho} · ${h.accepted ? 'kept' : 'discarded'}${h.note ? ` (${h.note})` : ''}`
  );
}

if (best.label === 'baseline') {
  console.log(`\nNo candidate beat the baseline. The current writer prompt stands.`);
} else {
  writeFileSync(CANDIDATE, best.prompt);
  console.log(
    `\nBest: ${best.label}. Baseline train ${history[0].train.toFixed(1)} → ${best.train.fitness.toFixed(1)}.`
  );
  console.log(`Wrote candidate to ${CANDIDATE}`);
  console.log(`Review it (diff against ${WRITER_REL}); it is NOT applied automatically.`);
}
