// P4 scorer (docs/experiments/P4-provenance-v1.md). Compares assay's provenance
// claim for every tool-call literal with an independent check: a raw substring
// search of the session's JSONL bytes before the assistant line, for the
// literal and for its JSON-escaped form. Usage: node scripts/p4-score.mjs <out.json>
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { importClaudeCodeDir } from '../packages/assay-core/dist/index.js'
import { runProvenance } from '../packages/assay-core/dist/reconstruct/run-provenance.js'

const DEV = '2b152411 3620a96a c99e5c98 ef76e3fc 2825791a f6c8e47e'.split(' ')
const HELD = '3ff3c7b6 48ad08c2 435395c9 4a153124 ef28c299 93de073c 2f1182fe c3170ecf 2ac7ce78 334cd181 17f6f5b7 6973b17c d013da8e c438a9b3'.split(' ')

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
  const run = importClaudeCodeDir(path)
  const prov = runProvenance(run)
  // Only main-file tool calls: the independent check searches one file.
  const bytes = readFileSync(path)
  const callAt = new Map()
  for (const e of run.events) {
    if (e.kind !== 'assistant' || e.offset.file !== run.sources[0].path) continue
    for (const b of e.raw.message?.content ?? []) if (b.type === 'tool_use' && !callAt.has(b.id)) callAt.set(b.id, e.offset.byteStart)
  }
  const cls = { agreeFound: 0, agreeUnsourced: 0, requestOnly: 0, fileOnly: 0 }
  const bySource = { request: 0, 'l1-lines': 0 }
  const examples = { requestOnly: [], fileOnly: [] }
  for (const [tid, p] of prov) {
    const at = callAt.get(tid)
    if (at === undefined) continue
    bySource[p.source]++
    const before = bytes.subarray(0, at)
    for (const l of p.literals) {
      const escaped = JSON.stringify(l.text).slice(1, -1)
      const inFile = before.includes(Buffer.from(l.text)) || before.includes(Buffer.from(escaped))
      const claimed = l.at !== null
      if (claimed && inFile) cls.agreeFound++
      else if (!claimed && !inFile) cls.agreeUnsourced++
      else if (claimed) { cls.requestOnly++; if (examples.requestOnly.length < 3) examples.requestOnly.push({ part: l.at.part, chars: l.text.length }) }
      else { cls.fileOnly++; if (examples.fileOnly.length < 3) examples.fileOnly.push({ source: p.source, chars: l.text.length }) }
    }
  }
  const n = cls.agreeFound + cls.agreeUnsourced + cls.requestOnly + cls.fileOnly
  return {
    session: id, literals: n, ...cls, bySource,
    agreement: n ? (cls.agreeFound + cls.agreeUnsourced) / n : null,
    unsourcedShare: n ? (cls.agreeUnsourced + cls.fileOnly) / n : null,
    examples, // lengths and positions only, never literal text
  }
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) }
function meanCI(xs, seed = 26, B = 10000) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  const r = rng(seed), means = []
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[Math.floor(r() * xs.length)]; means.push(s / xs.length) }
  means.sort((a, b) => a - b)
  return { mean: m, ci95: [means[Math.floor(0.025 * B)], means[Math.floor(0.975 * B) - 1]] }
}
function summarise(rows) {
  const s = rows.filter(r => r.literals > 0)
  const sum = k => s.reduce((a, r) => a + r[k], 0)
  return {
    sessions: rows.length, sessionsWithLiterals: s.length, literals: sum('literals'),
    primary_agreement: meanCI(s.map(r => r.agreement)),
    unsourcedShare: meanCI(s.map(r => r.unsourcedShare)),
    disagreements: { requestOnly: sum('requestOnly'), fileOnly: sum('fileOnly') },
    toolCallsBySource: { request: s.reduce((a, r) => a + r.bySource.request, 0), 'l1-lines': s.reduce((a, r) => a + r.bySource['l1-lines'], 0) },
  }
}

const out = process.argv[2]
if (!out) { console.error('usage: p4-score <out.json>'); process.exit(1) }
const held = HELD.map(score), dev = DEV.map(score)
const result = {
  experiment: 'P4-provenance-v1', scorerCommit: execSync('git rev-parse HEAD').toString().trim(), scoredAt: new Date().toISOString(),
  heldOut: { summary: summarise(held), sessions: held },
  dev: { note: 'dev set', summary: summarise(dev), sessions: dev },
}
writeFileSync(out, JSON.stringify(result, null, 2))
console.log(JSON.stringify({ scorerCommit: result.scorerCommit, heldOut: result.heldOut.summary, dev: result.dev.summary }, null, 1))
