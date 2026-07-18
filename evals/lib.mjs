// evals/lib.mjs — shared helpers for the Signal Desk eval harnesses.
//
// One place for: reading repo files, calling the `claude` CLI headless, extracting the
// judge's JSON, judging an artifact against the rubric+mandate, and majority voting.
// Both judge.mjs (fixed-corpus regression) and generate.mjs (generate-then-judge tuning)
// import from here.

import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const read = (p) => readFileSync(join(ROOT, p), 'utf8');
export const ORDER = { REJECT: 0, REVISE: 1, PUBLISH: 2 };

// Run one headless `claude -p` turn and return the model's final text.
// extraArgs lets callers restrict tools (e.g. --disallowedTools) so a generation run
// can't mutate the repo.
export function callClaude(prompt, model, { timeout = 300000, extraArgs = [] } = {}) {
  const res = spawnSync(
    'claude',
    [
      '-p',
      prompt,
      '--model',
      model,
      '--output-format',
      'json',
      '--dangerously-skip-permissions',
      ...extraArgs,
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout }
  );
  if (res.error) throw new Error(`spawn failed: ${res.error.message}`);
  if (res.status !== 0)
    throw new Error(
      `claude exited ${res.status}: ${(res.stderr || res.stdout || '').slice(0, 400)}`
    );
  const envelope = JSON.parse(res.stdout);
  if (envelope.is_error)
    throw new Error(`claude reported an error: ${(envelope.result || '').slice(0, 400)}`);
  return (envelope.result || '').trim();
}

// Pull the first balanced-looking JSON object out of a model response.
export function extractJson(text) {
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
  throw new Error(`could not parse JSON from: ${text.slice(0, 300)}`);
}

const rubric = read('evals/rubric.md');
const brief = read('docs/news-feed-content-brief.md');
const style = read('docs/content-style-guide.md');

// Judge one post (markdown string) against the rubric + mandate. Returns the parsed verdict.
export function judgeArtifact(artifact, model) {
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
  return extractJson(callClaude(prompt, model));
}

// Judge N times and take the majority (ties break toward the harsher verdict).
export function judgeWithVotes(artifact, model, votes = 1) {
  const ballots = [];
  let lastErr;
  for (let v = 0; v < votes; v++) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        ballots.push(judgeArtifact(artifact, model));
        break;
      } catch (e) {
        lastErr = e.message;
      }
    }
  }
  if (!ballots.length) throw new Error(lastErr || 'no ballots returned');
  return majority(ballots);
}

export function majority(outs) {
  const tally = { PUBLISH: 0, REVISE: 0, REJECT: 0 };
  for (const o of outs) if (o.verdict in tally) tally[o.verdict]++;
  // Ties break harsher-first: REJECT, then REVISE, then PUBLISH.
  const winner = ['REJECT', 'REVISE', 'PUBLISH'].reduce((a, b) => (tally[b] > tally[a] ? b : a));
  const rep = outs.find((o) => o.verdict === winner) || outs[0];
  return { ...rep, verdict: winner, votes: tally };
}

// Mean of the five rubric dimensions, for aggregate scorecards.
export function meanScore(scores = {}) {
  const keys = [
    'value_sowhat',
    'accuracy_sourcing',
    'voice_style',
    'scope_variety',
    'structure_format',
  ];
  const vals = keys.map((k) => Number(scores[k])).filter((n) => Number.isFinite(n));
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : NaN;
}

// ── Generate-then-judge (shared by generate.mjs and autotune.mjs) ──────────────

// Tools that could mutate the repo — disabled during generation.
const NO_WRITE = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash'];

// Pull the post out of a generation, tolerating a stray preamble line or code fence.
// Decline only when there's no frontmatter at all.
export function extractPost(text) {
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

// Build the eval-mode generation prompt: the writer prompt + mandate + a scenario, with
// the CI mechanics overridden (no tools/files) and the cadence guard treated as passed.
export function buildGenPrompt(writerPrompt, ctx, sc) {
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

// Generate one draft for a scenario and judge it. Returns a row:
// { name, outcome: DECLINE|PUBLISH|REVISE|REJECT, pass, out, gen, err }
export function generateAndJudge({ writerPrompt, ctx, sc, genModel, judgeModel, votes = 1 }) {
  let gen, out, err, outcome;
  try {
    gen = callClaude(buildGenPrompt(writerPrompt, ctx, sc), genModel, {
      extraArgs: ['--disallowedTools', ...NO_WRITE],
    });
  } catch (e) {
    err = `generate: ${e.message}`;
  }
  if (!err) {
    const { decline, post } = extractPost(gen);
    if (decline) {
      outcome = 'DECLINE';
    } else {
      try {
        out = judgeWithVotes(post, judgeModel, votes);
        outcome = out.verdict;
      } catch (e) {
        err = `judge: ${e.message}`;
      }
    }
  }
  const pass = !err && sc.acceptable.includes(outcome);
  return { name: sc.name, outcome, pass, out, gen, err };
}

// Aggregate a set of generate-then-judge rows into a scorecard with a single fitness
// scalar. Fitness rewards good published posts and heavily penalises gate failures and
// out-of-bounds outcomes — so "just decline everything" scores badly (it misses the
// must-publish scenarios). Higher is better.
export function scorecard(rows) {
  const drafts = rows.filter((r) => r.out);
  const meanAll = drafts.length
    ? drafts.reduce((a, r) => a + meanScore(r.out.scores), 0) / drafts.length
    : 0;
  const gateFails = drafts.filter((r) => r.out?.gate && !r.out.gate.pass).length;
  const misses = rows.filter((r) => !r.pass).length;
  const fitness = 10 * meanAll - 50 * gateFails - 20 * misses;
  return {
    passes: rows.length - misses,
    total: rows.length,
    drafts: drafts.length,
    meanAll,
    gateFails,
    misses,
    fitness,
  };
}
