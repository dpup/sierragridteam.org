#!/usr/bin/env node
// Minimal LLM-as-judge eval for the Signal (News) Desk.
//
// For each artifact in evals/cases.json it builds a prompt from evals/rubric.md plus the
// live mandate (docs/news-feed-content-brief.md + docs/content-style-guide.md), asks a
// pinned Claude model (via `claude -p --output-format json`) for a structured verdict,
// and compares that verdict to the human-labeled `expected`. It is a tuning tool: edit
// the brief, the writer prompt, or the rubric, re-run, and watch the verdicts move.
//
// Usage:  node evals/judge.mjs            (or: npm run eval:desk)
//         EVAL_JUDGE_MODEL=claude-sonnet-4-6 node evals/judge.mjs
//         node evals/judge.mjs --json     (machine-readable results to stdout)
//
// Exit code: 0 if every verdict is within one notch of expected; 1 on a two-notch miss
// (PUBLISH<->REJECT), an unparseable judge response, or a harness error.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const jsonOut = process.argv.includes('--json');

const rubric = read('evals/rubric.md');
const brief = read('docs/news-feed-content-brief.md');
const style = read('docs/content-style-guide.md');
const manifest = JSON.parse(read('evals/cases.json'));

const MODEL = process.env.EVAL_JUDGE_MODEL || manifest.judgeModel || 'claude-opus-4-8';
const ORDER = { REJECT: 0, REVISE: 1, PUBLISH: 2 };

// Verdicts are noisy near the REVISE boundary. Take N votes per case and pick the
// majority; ties break toward the harsher verdict (this is a trust-critical feed — when
// judges split, don't ship). Default 1; bump for borderline cases or a stable baseline.
const votesArg = process.argv.find((a) => a.startsWith('--votes='));
const VOTES = Math.max(1, Number(votesArg?.split('=')[1] || process.env.EVAL_VOTES || 1));

function majority(outs) {
  const tally = { PUBLISH: 0, REVISE: 0, REJECT: 0 };
  for (const o of outs) if (o.verdict in tally) tally[o.verdict]++;
  // Order ties harsher-first: REJECT, then REVISE, then PUBLISH.
  const winner = ['REJECT', 'REVISE', 'PUBLISH'].reduce((a, b) => (tally[b] > tally[a] ? b : a));
  // Return the representative judgement matching the winning verdict, plus the spread.
  const rep = outs.find((o) => o.verdict === winner) || outs[0];
  return { ...rep, verdict: winner, votes: tally };
}

function judge(artifact) {
  const prompt = [
    rubric,
    '\n\n===== THE MANDATE: docs/news-feed-content-brief.md =====\n',
    brief,
    '\n\n===== THE STYLE GUIDE: docs/content-style-guide.md =====\n',
    style,
    '\n\n===== THE POST UNDER REVIEW =====\n',
    artifact,
    '\n\n===== END =====\nRespond with ONLY the JSON object from the rubric — minified, no code fences, no prose.',
  ].join('');

  const res = spawnSync(
    'claude',
    ['-p', prompt, '--model', MODEL, '--output-format', 'json', '--dangerously-skip-permissions'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 300000 }
  );
  if (res.error) throw new Error(`spawn failed: ${res.error.message}`);
  if (res.status !== 0)
    throw new Error(
      `claude exited ${res.status}: ${(res.stderr || res.stdout || '').slice(0, 400)}`
    );

  const envelope = JSON.parse(res.stdout);
  if (envelope.is_error)
    throw new Error(`claude reported an error: ${envelope.result?.slice(0, 400)}`);
  return extractJson((envelope.result || '').trim());
}

function extractJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    /* fall through */
  }
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      return JSON.parse(m[0]);
    } catch {
      /* fall through */
    }
  }
  throw new Error(`could not parse judge JSON from: ${text.slice(0, 300)}`);
}

const results = [];
let hardFails = 0;

if (!jsonOut)
  console.log(
    `\nSignal Desk eval — judge model: ${MODEL}${VOTES > 1 ? ` · ${VOTES} votes/case` : ''}\n`
  );

for (const c of manifest.cases) {
  if (!jsonOut) process.stdout.write(`· ${c.file}\n    `);
  const artifact = read(c.file);
  const ballots = [];
  let err;
  for (let v = 0; v < VOTES; v++) {
    let vote;
    for (let attempt = 1; attempt <= 2 && !vote; attempt++) {
      try {
        vote = judge(artifact);
      } catch (e) {
        err = `${e.message}${attempt < 2 ? ' (retrying)' : ''}`;
      }
    }
    if (vote) ballots.push(vote);
  }
  const out = ballots.length ? majority(ballots) : undefined;
  if (out) err = undefined;

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
