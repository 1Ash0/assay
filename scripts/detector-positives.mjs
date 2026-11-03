// Known positives for detectors that never fired on a real session (step 4 of
// the corpus plan). Each is one documented change to a real session, written
// to corpus/frozen/real-perturbed/ (local, never committed), then checked:
// does the target detector fire, and what else fires? The aggregate result
// goes to results/detector-positives.json.
// Usage: node scripts/detector-positives.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { importClaudeCodeDir, runHealth } from '../packages/assay-core/dist/index.js'

const BASE = 'corpus/frozen/E--assay/2b152411-20f3-4422-9a7e-3914a988e040.jsonl'
if (!existsSync(BASE)) { console.error('detector-positives: base session missing (the corpus is local)'); process.exit(1) }
const lines = readFileSync(BASE, 'utf-8').split('\n').filter(Boolean)
const obj = lines.map(l => JSON.parse(l))

// Each perturbation returns new lines and says exactly what it changed.
const CASES = [
  { id: 'D3', file: 'd3-chain-break.jsonl', change: () => {
    // The child must be a conversation event past the first one: D3 checks the
    // parent links of events only (see the note in the result).
    const ev = o => o.type === 'user' || o.type === 'assistant'
    const firstEv = obj.findIndex(ev)
    const child = obj.findIndex((o, i) => i > firstEv && ev(o) && o.parentUuid && obj.some(p => p.uuid === o.parentUuid))
    const parent = obj.findIndex(p => p.uuid === obj[child].parentUuid)
    return { out: lines.filter((_, i) => i !== parent), what: `deleted line ${parent + 1} (uuid ${obj[parent].uuid}); line ${child + 1} still names it as parentUuid` }
  } },
  { id: 'D8', file: 'd8-session-conflict.jsonl', change: () => {
    const i = obj.findIndex(o => o.type === 'assistant')
    const o = { ...obj[i], sessionId: '00000000-0000-4000-8000-000000000000' }
    return { out: lines.map((l, k) => k === i ? JSON.stringify(o) : l), what: `line ${i + 1}: sessionId set to 00000000-0000-4000-8000-000000000000` }
  } },
  { id: 'D11', file: 'd11-broken-seal.jsonl', change: () => {
    const i = obj.findIndex(o => o.type === 'api-request')
    const d = obj[i].requestDigest, flipped = (d[0] === '0' ? '1' : '0') + d.slice(1)
    return { out: lines.map((l, k) => k === i ? JSON.stringify({ ...obj[i], requestDigest: flipped }) : l), what: `line ${i + 1}: first hex character of requestDigest changed (${d.slice(0, 8)}… → ${flipped.slice(0, 8)}…)` }
  } },
  { id: 'D0', file: 'd0-unknown-version.jsonl', change: () => {
    const n = obj.filter(o => o.version).length
    return { out: obj.map(o => JSON.stringify(o.version ? { ...o, version: '9.0.0' } : o)), what: `version set to 9.0.0 on all ${n} lines that carry one` }
  } },
]

mkdirSync('corpus/frozen/real-perturbed', { recursive: true })
const results = []
for (const c of CASES) {
  const { out, what } = c.change()
  const path = `corpus/frozen/real-perturbed/${c.file}`
  if (!existsSync(path)) writeFileSync(path, out.join('\n') + '\n')
  const h = runHealth(importClaudeCodeDir(path, { truth: 'real-perturbed' }))
  const fired = [...new Set(h.findings.filter(f => f.severity !== 'info' || f.detectorId === c.id).map(f => f.detectorId))]
  const hit = h.findings.some(f => f.detectorId === c.id)
  results.push({ detector: c.id, base: '2b152411', file: path, change: what, fired: hit, otherWarnings: fired.filter(x => x !== c.id), overall: h.overall })
  console.log(`${c.id.padEnd(4)} ${hit ? 'FIRED ' : 'MISSED'} ${what}${fired.filter(x => x !== c.id).length ? ' · also: ' + fired.filter(x => x !== c.id).join(',') : ''} · ${h.overall}`)
}
mkdirSync('results', { recursive: true })
writeFileSync('results/detector-positives.json', JSON.stringify({ base: '2b152411', cases: results,
  notes: ['D3 checks the parent links of conversation events only. Deleting the first user line of 2b152411, whose child is an attachment line, was not flagged: a break in the links of kept non-event lines is a known blind spot.'], fired: results.filter(r => r.fired).length, total: results.length }, null, 2) + '\n')
process.exit(results.every(r => r.fired) ? 0 : 1)
