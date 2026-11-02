// R2 scorer (docs/experiments/R2-reconstruction-v1.md). Scores the frozen
// rebuild (ADR-031) once on the held-out set, and reports the dev set
// separately, marked dev. Usage: node scripts/r2-score.mjs <out.json>
// Primary: digest-exact rate from transcript lines alone, per session, mean
// over held-out sessions, 95% bootstrap CI over sessions (10,000, seed 26).
import { execSync } from 'node:child_process'
import { readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { importClaudeCodeDir } from '../packages/assay-core/dist/index.js'

const DEV = '2b152411 3620a96a c99e5c98 ef76e3fc 2825791a f6c8e47e'.split(' ')
const HELD = '3ff3c7b6 48ad08c2 435395c9 4a153124 ef28c299 93de073c 2f1182fe c3170ecf 2ac7ce78 334cd181 17f6f5b7 6973b17c d013da8e c438a9b3'.split(' ')

// Finds each session's main transcript in the frozen corpus (never the
// real-perturbed copies).
const files = new Map()
const walk = d => {
  for (const f of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, f.name)
    if (f.isDirectory()) { if (!['subagents', 'tool-results', 'otel', 'l4', 'real-perturbed', 'scripted'].includes(f.name)) walk(p) }
    else if (f.name.endsWith('.jsonl')) files.set(f.name.slice(0, 8), p)
  }
}
walk('corpus/frozen')

function score(id) {
  const path = files.get(id)
  if (!path) throw new Error(`session ${id} not in corpus`)
  const q = importClaudeCodeDir(path).requests
  const recs = q?.records ?? []
  const n = recs.length
  const count = k => recs.filter(r => r[k] === 'sealed').length
  // Exploratory (not preregistered): distinct messages the lines rebuild.
  const named = new Map()
  for (const r of recs) for (const t of r.tail) if (!named.has(t.hash)) named.set(t.hash, t)
  return {
    session: id, version: recs[0]?.version ?? null, requests: n,
    linesSealed: count('sealFromLines'), blobsSealed: count('sealFromBlobs'), combinedSealed: count('seal'),
    broken: recs.filter(r => r.seal === 'broken').length,
    rateLines: n ? count('sealFromLines') / n : null,
    rateBlobs: n ? count('sealFromBlobs') / n : null,
    rateCombined: n ? count('seal') / n : null,
    exploratory: { distinctMessages: named.size },
  }
}

// Seeded resampling, so the CI is reproducible.
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) }
function meanCI(xs, seed = 26, B = 10000) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  const r = rng(seed), means = []
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[Math.floor(r() * xs.length)]; means.push(s / xs.length) }
  means.sort((a, b) => a - b)
  return { mean: m, ci95: [means[Math.floor(0.025 * B)], means[Math.floor(0.975 * B) - 1]] }
}

function summarise(rows) {
  const scored = rows.filter(r => r.requests > 0)
  const pooled = k => scored.reduce((s, r) => s + r[k], 0) / scored.reduce((s, r) => s + r.requests, 0)
  return {
    sessions: rows.length, sessionsWithRequests: scored.length,
    requests: scored.reduce((s, r) => s + r.requests, 0),
    primary_linesOnly: meanCI(scored.map(r => r.rateLines)),
    pooled_linesOnly: pooled('linesSealed'),
    combined_blobsPlusRebuild: meanCI(scored.map(r => r.rateCombined)),
    pooled_combined: pooled('combinedSealed'),
    blobsOnly: meanCI(scored.map(r => r.rateBlobs)),
    broken: scored.reduce((s, r) => s + r.broken, 0),
  }
}

const out = process.argv[2]
if (!out) { console.error('usage: r2-score <out.json>'); process.exit(1) }
const commit = execSync('git rev-parse HEAD').toString().trim()
const held = HELD.map(score), dev = DEV.map(score)
const result = {
  experiment: 'R2-reconstruction-v1', scorerCommit: commit, scoredAt: new Date().toISOString(),
  heldOut: { summary: summarise(held), sessions: held },
  dev: { note: 'dev set: rules were developed here; not the result', summary: summarise(dev), sessions: dev },
}
writeFileSync(out, JSON.stringify(result, null, 2))
console.log(JSON.stringify({ scorerCommit: commit, heldOut: result.heldOut.summary, dev: result.dev.summary }, null, 1))
