#!/usr/bin/env node
// Generate-then-judge: run the WRITER prompt on each scenario, then judge the output.
// This is the loop for tuning the writer (prompt + brief) — vs judge.mjs, which scores
// fixed, already-written posts. Edit the writer prompt (or point --prompt at a variant),
// re-run, and compare the scorecard. For an automated tuning loop, see autotune.mjs.
//
// Generation mirrors the real pipeline: writer model (Opus) drafts; a DIFFERENT judge
// model (Sonnet) scores, so the judge doesn't share the writer's blind spots. Tools that
// could mutate the repo are disabled during generation — everything is provided inline.
//
// Usage:  npm run eval:generate
//         node evals/generate.mjs --prompt=/abs/path/variant-writer.md   (A/B a variant)
//         node evals/generate.mjs --json
//   env:  EVAL_GEN_MODEL (writer, default opus), EVAL_JUDGE_MODEL (judge, default sonnet),
//         EVAL_VOTES (judge votes/draft, default 1)
//
// Exit: 0 if every scenario's outcome is in its `acceptable` set; 1 otherwise.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { isAbsolute, join, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { read, generateAndJudge, scorecard, meanScore } from './lib.mjs';

const jsonOut = process.argv.includes('--json');
const promptArg = process.argv.find((a) => a.startsWith('--prompt='));
const WRITER_PROMPT_PATH = promptArg
  ? promptArg.split('=')[1]
  : '.github/prompts/news-desk-writer.md';
const writerPrompt = isAbsolute(WRITER_PROMPT_PATH)
  ? readFileSync(WRITER_PROMPT_PATH, 'utf8')
  : read(WRITER_PROMPT_PATH);

const cfg = JSON.parse(read('evals/scenarios.json'));
const ctx = cfg.context;
const GEN_MODEL = process.env.EVAL_GEN_MODEL || cfg.genModel || 'claude-opus-4-8';
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || cfg.judgeModel || 'claude-sonnet-4-6';
const VOTES = Math.max(1, Number(process.env.EVAL_VOTES || 1));

const runDir = join(
  tmpdir(),
  `signal-desk-gen-${basename(WRITER_PROMPT_PATH).replace(/\W+/g, '-')}`
);
mkdirSync(runDir, { recursive: true });

const rows = [];

if (!jsonOut)
  console.log(
    `\nGenerate-then-judge — writer:${GEN_MODEL} · judge:${JUDGE_MODEL}${VOTES > 1 ? ` · ${VOTES} votes` : ''}\n  prompt: ${WRITER_PROMPT_PATH}\n`
  );

for (const sc of cfg.scenarios) {
  if (!jsonOut) process.stdout.write(`· ${sc.name}\n    `);
  const row = generateAndJudge({
    writerPrompt,
    ctx,
    sc,
    genModel: GEN_MODEL,
    judgeModel: JUDGE_MODEL,
    votes: VOTES,
  });
  if (row.gen) writeFileSync(join(runDir, `${sc.name}.md`), row.gen);
  rows.push(row);

  if (!jsonOut) {
    if (row.err) {
      console.log(`ERROR ${row.err}\n`);
    } else if (row.outcome === 'DECLINE') {
      console.log(
        `DECLINE  [${row.pass ? 'ok' : 'MISS'}]  (acceptable: ${sc.acceptable.join('/')})\n`
      );
    } else {
      const s = row.out.scores || {};
      console.log(
        `${row.outcome}  gate:${row.out.gate?.pass ? 'pass' : 'FAIL'}  mean:${meanScore(s).toFixed(1)}/5  [${row.pass ? 'ok' : 'MISS'}]  (acceptable: ${sc.acceptable.join('/')})`
      );
      console.log(
        `    value:${s.value_sowhat} accuracy:${s.accuracy_sourcing} voice:${s.voice_style} scope:${s.scope_variety} format:${s.structure_format}`
      );
      if (row.out.top_issues?.length) console.log(`    issues: ${row.out.top_issues.join('; ')}`);
      console.log('');
    }
  }
}

const card = scorecard(rows);

if (jsonOut) {
  console.log(
    JSON.stringify(
      { genModel: GEN_MODEL, judgeModel: JUDGE_MODEL, prompt: WRITER_PROMPT_PATH, card, rows },
      null,
      2
    )
  );
} else {
  console.log('─'.repeat(64));
  console.log(
    `${card.passes}/${card.total} acceptable · ${card.drafts} drafts, mean ${card.meanAll ? card.meanAll.toFixed(2) : '—'}/5 · ${card.gateFails} gate-fail(s) · fitness ${card.fitness.toFixed(1)}`
  );
  console.log(`drafts saved to ${runDir}`);
  console.log(
    card.misses ? 'RESULT: FAIL — a scenario landed outside its acceptable set.' : 'RESULT: OK'
  );
}

process.exit(card.misses ? 1 : 0);
