#!/usr/bin/env node
// Fixed-corpus regression eval for the Signal (News) Desk.
//
// Judges each labeled artifact in evals/cases.json against the mandate-derived rubric
// (see evals/lib.mjs) and compares the verdict to its human label. It is a regression
// gate + a rubric-tuning tool: edit the brief or the rubric, re-run, watch verdicts move.
// To tune the *writer* instead of scoring existing posts, use evals/generate.mjs.
//
// Usage:  npm run eval:desk
//         node evals/judge.mjs --votes=3     (majority of 3 — stabilises borderline cases)
//         node evals/judge.mjs --json        (machine-readable results)
//         EVAL_JUDGE_MODEL=claude-sonnet-4-6 node evals/judge.mjs
//
// Exit code: 0 if every verdict is within one notch of expected; 1 on a two-notch miss
// (PUBLISH<->REJECT), an unparseable judge response, or a harness error.

import { read, ORDER, judgeWithVotes } from './lib.mjs';

const jsonOut = process.argv.includes('--json');
const manifest = JSON.parse(read('evals/cases.json'));
const MODEL = process.env.EVAL_JUDGE_MODEL || manifest.judgeModel || 'claude-opus-4-8';
const votesArg = process.argv.find((a) => a.startsWith('--votes='));
const VOTES = Math.max(1, Number(votesArg?.split('=')[1] || process.env.EVAL_VOTES || 1));

const results = [];
let hardFails = 0;

if (!jsonOut)
  console.log(
    `\nSignal Desk eval — judge model: ${MODEL}${VOTES > 1 ? ` · ${VOTES} votes/case` : ''}\n`
  );

for (const c of manifest.cases) {
  if (!jsonOut) process.stdout.write(`· ${c.file}\n    `);
  let out, err;
  try {
    out = judgeWithVotes(read(c.file), MODEL, VOTES);
  } catch (e) {
    err = e.message;
  }

  if (err) {
    hardFails++;
    results.push({ file: c.file, expected: c.expected, error: err });
    if (!jsonOut) console.log(`ERROR: ${err}\n`);
    continue;
  }

  const dist = Math.abs((ORDER[out.verdict] ?? -9) - ORDER[c.expected]);
  const status = out.verdict === c.expected ? 'MATCH' : dist >= 2 ? 'FAIL' : 'near';
  if (dist >= 2 || !(out.verdict in ORDER)) hardFails++;
  results.push({ file: c.file, expected: c.expected, ...out, status });

  if (!jsonOut) {
    const s = out.scores || {};
    const spread = out.votes
      ? `  votes:${out.votes.REJECT}/${out.votes.REVISE}/${out.votes.PUBLISH} (R/Rv/P)`
      : '';
    console.log(
      `${out.verdict}  (expected ${c.expected})  [${status}]  gate:${out.gate?.pass ? 'pass' : 'FAIL'}${spread}`
    );
    console.log(
      `    scores  value:${s.value_sowhat} accuracy:${s.accuracy_sourcing} voice:${s.voice_style} scope:${s.scope_variety} format:${s.structure_format}`
    );
    console.log(`    so-what: ${out.one_line_so_what || '—'}`);
    if (out.top_issues?.length) console.log(`    issues:  ${out.top_issues.join('; ')}`);
    console.log('');
  }
}

if (jsonOut) {
  console.log(JSON.stringify({ model: MODEL, results }, null, 2));
} else {
  const matched = results.filter((r) => r.status === 'MATCH').length;
  const near = results.filter((r) => r.status === 'near').length;
  console.log('─'.repeat(60));
  console.log(
    `${matched} exact · ${near} within one notch · ${hardFails} hard fail(s) of ${results.length}`
  );
  console.log(
    hardFails ? 'RESULT: FAIL — a verdict is two notches off or unparseable.' : 'RESULT: OK'
  );
}

process.exit(hardFails ? 1 : 0);
