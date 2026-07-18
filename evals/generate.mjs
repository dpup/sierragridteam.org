#!/usr/bin/env node
// Generate-then-judge: run the WRITER prompt on each scenario, then judge the output.
// This is the loop for tuning the writer (prompt + brief) — vs judge.mjs, which scores
// fixed, already-written posts. Edit the writer prompt (or point --prompt at a variant),
// re-run, and compare the scorecard.
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
import { read, callClaude, judgeWithVotes, meanScore } from './lib.mjs';

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
const brief = read('docs/news-feed-content-brief.md');
const style = read('docs/content-style-guide.md');

const GEN_MODEL = process.env.EVAL_GEN_MODEL || cfg.genModel || 'claude-opus-4-8';
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || cfg.judgeModel || 'claude-sonnet-4-6';
const VOTES = Math.max(1, Number(process.env.EVAL_VOTES || 1));
const NO_WRITE = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash']; // keep generation from touching the repo

const runDir = join(
  tmpdir(),
  `signal-desk-gen-${basename(WRITER_PROMPT_PATH).replace(/\W+/g, '-')}`
);
mkdirSync(runDir, { recursive: true });

// Pull the post out of a generation, tolerating a stray preamble line or code fence the
// model may add before the frontmatter. Decline only when there's no frontmatter at all.
function extractPost(text) {
  const t = text
    .trim()
    .replace(/^```[a-z]*\n/i, '')
    .replace(/\n```$/i, '')
    .trim();
  const lines = t.split('\n');
  const fmStart = lines.findIndex((l) => l.trim() === '---');
  if (fmStart !== -1 && /\btitle:/.test(lines.slice(fmStart, fmStart + 12).join('\n'))) {
    return { decline: false, post: lines.slice(fmStart).join('\n').trim() };
  }
  return { decline: true, post: null };
}

function genPrompt(sc) {
  return [
    writerPrompt,
    '\n\n===== THE MANDATE (docs/news-feed-content-brief.md) =====\n',
    brief,
    '\n\n===== THE STYLE GUIDE (docs/content-style-guide.md) =====\n',
    style,
    '\n\n===== EVAL MODE — OVERRIDES THE CI MECHANICS ABOVE =====',
    '\nYou are in an OFFLINE eval, not CI. Do NOT use tools, read/write files, or run commands — everything is inline. Apply the brief and voice exactly, including the v1.5 rules.',
    '\nThe mechanical guards (major-fire pause and the 3-day cadence floor) have ALREADY passed before you were invoked — the same way the workflow runs them before the writer. Do NOT decline on cadence or timing. Decide purely on editorial merit: topic worth, the "so what", variety, honesty, and the hard rules.',
    `\n\nToday: ${ctx.date}. Current conditions: ${ctx.conditions}`,
    `\n\nRecent archive (do not repeat a topic, headline shape, or signature construction):\n${ctx.archive}`,
    ctx.declined
      ? `\n\nPreviously declined — covered ground; don't re-propose without a materially new, sourced angle:\n${ctx.declined}`
      : '',
    `\n\n## Your assignment\nConsider this topic:\n\n${sc.topic}\n\n## Source material (treat as already verified; cite these URLs)\n${sc.sources}`,
    '\n\n## Output — EXACTLY ONE OF:',
    '\n1. The complete post as Markdown, starting on the very first line with the `---` frontmatter delimiter (no sentence before it) and nothing after the body; or',
    '\n2. The single line: DECISION: NO POST — followed by one short paragraph of reasoning.',
    '\nNo writer notes, no preamble, no commentary, no code fences.',
  ].join('');
}

const rows = [];
let fails = 0;

if (!jsonOut)
  console.log(
    `\nGenerate-then-judge — writer:${GEN_MODEL} · judge:${JUDGE_MODEL}${VOTES > 1 ? ` · ${VOTES} votes` : ''}\n  prompt: ${WRITER_PROMPT_PATH}\n`
  );

for (const sc of cfg.scenarios) {
  if (!jsonOut) process.stdout.write(`· ${sc.name}\n    `);
  let gen, out, err, outcome;

  try {
    gen = callClaude(genPrompt(sc), GEN_MODEL, { extraArgs: ['--disallowedTools', ...NO_WRITE] });
  } catch (e) {
    err = `generate: ${e.message}`;
  }

  if (!err) {
    writeFileSync(join(runDir, `${sc.name}.md`), gen);
    const { decline, post } = extractPost(gen);
    if (decline) {
      outcome = 'DECLINE';
    } else {
      try {
        out = judgeWithVotes(post, JUDGE_MODEL, VOTES);
        outcome = out.verdict;
      } catch (e) {
        err = `judge: ${e.message}`;
      }
    }
  }

  const pass = !err && sc.acceptable.includes(outcome);
  if (!pass) fails++;
  rows.push({ name: sc.name, outcome, pass, err, out, gen });

  if (!jsonOut) {
    if (err) {
      console.log(`ERROR ${err}\n`);
      continue;
    }
    if (outcome === 'DECLINE') {
      console.log(`DECLINE  [${pass ? 'ok' : 'MISS'}]  (acceptable: ${sc.acceptable.join('/')})\n`);
      continue;
    }
    const s = out.scores || {};
    console.log(
      `${outcome}  gate:${out.gate?.pass ? 'pass' : 'FAIL'}  mean:${meanScore(s).toFixed(1)}/5  [${pass ? 'ok' : 'MISS'}]  (acceptable: ${sc.acceptable.join('/')})`
    );
    console.log(
      `    value:${s.value_sowhat} accuracy:${s.accuracy_sourcing} voice:${s.voice_style} scope:${s.scope_variety} format:${s.structure_format}`
    );
    if (out.top_issues?.length) console.log(`    issues: ${out.top_issues.join('; ')}`);
    console.log('');
  }
}

if (jsonOut) {
  console.log(
    JSON.stringify(
      { genModel: GEN_MODEL, judgeModel: JUDGE_MODEL, prompt: WRITER_PROMPT_PATH, rows },
      null,
      2
    )
  );
} else {
  const drafts = rows.filter((r) => r.out);
  const meanAll = drafts.length
    ? drafts.reduce((a, r) => a + meanScore(r.out.scores), 0) / drafts.length
    : NaN;
  const gateFails = drafts.filter((r) => r.out?.gate && !r.out.gate.pass).length;
  const passes = rows.filter((r) => r.pass).length;
  console.log('─'.repeat(64));
  console.log(
    `${passes}/${rows.length} scenarios acceptable · ${drafts.length} drafts, mean ${Number.isNaN(meanAll) ? '—' : meanAll.toFixed(2)}/5 · ${gateFails} gate-fail(s)`
  );
  console.log(`drafts saved to ${runDir}`);
  console.log(
    fails ? 'RESULT: FAIL — a scenario landed outside its acceptable set.' : 'RESULT: OK'
  );
}

process.exit(fails ? 1 : 0);
