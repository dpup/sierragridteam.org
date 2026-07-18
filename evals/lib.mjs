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
