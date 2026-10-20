#!/usr/bin/env node
// Critic voice eval: can the CRITIC strip machine voice from a draft that has it?
//
// The writer evals measure what a draft starts as; this measures the last line of defence.
// Each fixture is a desk draft that shipped with mannered prose (brief §8). The critic prompt
// runs its voice + format passes on it offline (no tools, sources treated as verified), and
// the voice judge scores the result. PR #62's critic reported "zero epigrams" on a draft the
// judge counts a dozen tells in — this is the check that would have caught that.
//
// Usage:  npm run eval:critic
//         node evals/critic.mjs --json
//   env:  EVAL_CRITIC_MODEL (default sonnet — the pipeline's critic),
//         EVAL_VOICE_MODEL (voice judge, default opus), EVAL_SAMPLES (edits per fixture, default 1)
//
// Exit: 0 if every edited draft scores at least MIN_VOICE; 1 otherwise.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { read, callClaude, judgeVoice } from './lib.mjs';

const FIXTURES = [
  'evals/cases/voice/2026-10-20-mesh-message-signing.md',
  'src/content/blog/2026-10-12-radio-privacy-codes.md',
];
const MIN_VOICE = 3;
const CRITIC = process.env.EVAL_CRITIC_MODEL || 'claude-sonnet-5-5';
const JUDGE = process.env.EVAL_VOICE_MODEL || 'claude-opus-5-5';
const SAMPLES = Math.max(1, Number(process.env.EVAL_SAMPLES || 1));
const jsonOut = process.argv.includes('--json');

const prompt = (draft) =>
  [
    read('.github/prompts/news-desk-critic.md'),
    '\n\n===== THE MANDATE (docs/news-feed-content-brief.md) =====\n',
    read('docs/news-feed-content-brief.md'),
    '\n\n===== THE STYLE GUIDE (docs/content-style-guide.md) =====\n',
    read('docs/content-style-guide.md'),
    '\n\n===== EVAL MODE — OVERRIDES THE CI MECHANICS ABOVE =====',
    '\nOffline eval: do not use tools. The sources are already verified; skip the source,',
    ' unfolding-incident and duplicate checks. Perform ONLY the voice and format passes on this',
    ' desk-authored draft, editing it as you would the file. Output the complete edited post,',
    ' starting with the --- frontmatter line, and nothing else.',
    '\n\n===== THE DRAFT =====\n',
    draft,
  ].join('');

const runDir = join(tmpdir(), 'signal-desk-critic');
mkdirSync(runDir, { recursive: true });
const rows = [];

if (!jsonOut) console.log(`\nCritic voice eval — critic:${CRITIC} · voice judge:${JUDGE}\n`);

for (const file of FIXTURES) {
  const draft = read(file);
  const before = judgeVoice(draft, JUDGE);
  for (let k = 0; k < SAMPLES; k++) {
    let row;
    try {
      const out = callClaude(prompt(draft), CRITIC, { extraArgs: ['--tools', ''] });
      const edited = out.slice(Math.max(0, out.indexOf('---')));
      writeFileSync(join(runDir, `${k}-${file.split('/').pop()}`), edited);
      const after = judgeVoice(edited, JUDGE);
      row = { file, before, after, pass: Number(after.human_voice) >= MIN_VOICE };
    } catch (e) {
      row = { file, before, err: e.message, pass: false };
    }
    rows.push(row);
    if (!jsonOut) {
      const b = `${before.human_voice}/5 (${before.tell_count} tells)`;
      if (row.err) console.log(`· ${file}\n    ERROR ${row.err}\n`);
      else {
        console.log(
          `· ${file}\n    ${b} → ${row.after.human_voice}/5 (${row.after.tell_count} tells)  [${row.pass ? 'ok' : 'MISS'}]`
        );
        if (row.after.worst) console.log(`    worst left: ${row.after.worst}`);
        console.log('');
      }
    }
  }
}

const misses = rows.filter((r) => !r.pass).length;
if (jsonOut) console.log(JSON.stringify({ critic: CRITIC, judge: JUDGE, rows }, null, 2));
else {
  console.log('─'.repeat(64));
  console.log(`${rows.length - misses}/${rows.length} edited drafts at ≥${MIN_VOICE}/5 voice`);
  console.log(`edited drafts saved to ${runDir}`);
  console.log(
    misses ? 'RESULT: FAIL — the critic left a draft reading as generated.' : 'RESULT: OK'
  );
}
process.exit(misses ? 1 : 0);
