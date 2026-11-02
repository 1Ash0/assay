// T3 scorer (docs/experiments/T3-diff-stability-v1.md). Applies the
// preregistered perturbations in memory to each real session (nothing is
// written), aligns perturbed against original, and scores stability and
// detection. Usage: node scripts/t3-score.mjs <out.json>
import { execSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { align, buildSpine, importFromFiles, runHealth } from '../packages/assay-core/dist/index.js'

const IDS = '2b152411 3620a96a c99e5c98 ef76e3fc 2825791a f6c8e47e 3ff3c7b6 48ad08c2 435395c9 4a153124 ef28c299 93de073c 2f1182fe c3170ecf 2ac7ce78 334cd181 17f6f5b7 6973b17c d013da8e c438a9b3'.split(' ')
const files = new Map()
const walk = d => {
  for (const f of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, f.name)
    if (f.isDirectory()) { if (!['subagents', 'tool-results', 'otel', 'l4', 'real-perturbed', 'scripted'].includes(f.name)) walk(p) }
    else if (f.name.endsWith('.jsonl')) files.set(f.name.slice(0, 8), p)
  }
}
walk('corpus/frozen')

const enc = new TextEncoder()
function steps(mainLines, path) {
  const dir = path.replace(/\.jsonl$/, ''), subDir = join(dir, 'subagents')
  const subs = existsSync(subDir) ? readdirSync(subDir).filter(f => f.endsWith('.jsonl')).map(f => ({ path: join(subDir, f), bytes: new Uint8Array(readFileSync(join(subDir, f))) })) : []
  const run = importFromFiles([{ path, bytes: enc.encode(mainLines.join('\n') + '\n') }, ...subs], {}, existsSync(subDir))
  return buildSpine(run, runHealth(run)).steps
}

const parse = l => { try { return JSON.parse(l) } catch { return null } }
const toolUses = o => (o?.type === 'assistant' && Array.isArray(o.message?.content) ? o.message.content.filter(b => b.type === 'tool_use') : [])

const PERTURB = {
  reorder(lines) {
    const out = [...lines], byMsg = new Map()
    lines.forEach((l, i) => { const o = parse(l); if (toolUses(o).length) { const id = o.message.id; byMsg.set(id, [...(byMsg.get(id) ?? []), i]) } })
    for (const idx of byMsg.values()) if (idx.length >= 2) { const rev = [...idx].reverse(); idx.forEach((pos, k) => { out[pos] = lines[rev[k]] }) }
    return out
  },
  rename: lines => lines.map(l => l.split('scratchpad').join('scratchpaX')),
  rewrite(lines) {
    const out = [], seen = new Map()
    for (const l of lines) {
      out.push(l)
      const o = parse(l)
      if (o?.type === 'assistant' && o.message?.id && !seen.has(o.message.id)) { seen.set(o.message.id, seen.size); if (seen.get(o.message.id) % 5 === 0) out.push(l) }
    }
    return out
  },
}

function negative(lines, original) {
  // The middle tool call of the main file, its assistant line and its result line.
  const calls = []
  lines.forEach((l, i) => { for (const b of toolUses(parse(l))) calls.push({ id: b.id, line: i }) })
  if (calls.length === 0) return null
  const c = calls[Math.floor(calls.length / 2)]
  const resultLine = lines.findIndex(l => { const o = parse(l); return o?.type === 'user' && Array.isArray(o.message?.content) && o.message.content.some(b => b.tool_use_id === c.id) })
  const drop = new Set([c.line, resultLine].filter(x => x >= 0))
  const expected = original.findIndex(s => s.tools.some(t => t.id === c.id))
  const onlyCall = expected >= 0 && original[expected].tools.length === 1
  return { lines: lines.filter((_, i) => !drop.has(i)), expected, onlyCall }
}

const rows = []
for (const id of IDS) {
  const path = files.get(id)
  const lines = readFileSync(path, 'utf8').split('\n').filter(l => l.length)
  const original = steps(lines, path)
  const row = { session: id, steps: original.length, benign: {}, negative: null }
  for (const [name, f] of Object.entries(PERTURB)) {
    const a = align(original, steps(f(lines), path))
    row.benign[name] = { stable: a.firstDivergence === null && a.onlyA === 0 && a.onlyB === 0, firstDivergence: a.firstDivergence, onlyA: a.onlyA, onlyB: a.onlyB }
  }
  const n = negative(lines, original)
  if (n) {
    const a = align(original, steps(n.lines, path))
    const fd = a.firstDivergence
    row.negative = { expected: n.expected, onlyCall: n.onlyCall, firstDivergence: fd, detected: fd === n.expected || (n.onlyCall && fd !== null && fd <= n.expected) }
  }
  rows.push(row)
  console.error(id, JSON.stringify(row.benign), JSON.stringify(row.negative))
}

function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32) }
function meanCI(xs, seed = 26, B = 10000) {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length
  const r = rng(seed), means = []
  for (let b = 0; b < B; b++) { let s = 0; for (let i = 0; i < xs.length; i++) s += xs[Math.floor(r() * xs.length)]; means.push(s / xs.length) }
  means.sort((a, b) => a - b)
  return { mean: m, ci95: [means[Math.floor(0.025 * B)], means[Math.floor(0.975 * B) - 1]] }
}
const perSessionStable = rows.map(r => Object.values(r.benign).filter(x => x.stable).length / Object.keys(r.benign).length)
const neg = rows.filter(r => r.negative)
const result = {
  experiment: 'T3-diff-stability-v1', scorerCommit: execSync('git rev-parse HEAD').toString().trim(), scoredAt: new Date().toISOString(),
  primary_stability: meanCI(perSessionStable),
  pairs: rows.length * Object.keys(PERTURB).length,
  stablePairs: rows.reduce((s, r) => s + Object.values(r.benign).filter(x => x.stable).length, 0),
  byPerturbation: Object.fromEntries(Object.keys(PERTURB).map(k => [k, rows.filter(r => r.benign[k].stable).length + '/' + rows.length])),
  secondary_detection: neg.length ? meanCI(neg.map(r => (r.negative.detected ? 1 : 0))) : null,
  detected: neg.filter(r => r.negative.detected).length + '/' + neg.length,
  sessions: rows,
}
writeFileSync(process.argv[2], JSON.stringify(result, null, 2))
console.log(JSON.stringify({ ...result, sessions: undefined }, null, 1))
