// R4 detector audit (docs/experiments/R4-audit-v1.md).
//   node scripts/r4.mjs sheet          -> results/R4/sheet.csv and sheet-pass2.csv
//   node scripts/r4.mjs agree          -> results/R4/agreement.json from both filled sheets
// Sheets hold finding messages and offsets from the local corpus, so they live
// in results/ (gitignored, Rule 8). Labels: true | false | unsure.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { importClaudeCodeDir, runHealth } from '../packages/assay-core/dist/index.js'

const DIR = 'results/R4'
const sha = s => createHash('sha256').update(s).digest('hex')
const csvCell = v => `"${String(v ?? '').replace(/"/g, '""')}"`
const HEAD = ['item', 'session', 'detector', 'severity', 'file', 'line_1based', 'byte_start', 'byte_end', 'message', 'label', 'note']

function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (c === '"') q = false; else cell += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cell); cell = '' }
    else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else if (c !== '\r') cell += c
  }
  if (cell || row.length) { row.push(cell); rows.push(row) }
  const [h, ...rest] = rows
  return rest.filter(r => r.length > 1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])))
}

function sheet() {
  const runs = JSON.parse(readFileSync('web/prototype/site-runs.json', 'utf8')).runs.filter(r => r.truth === 'real')
  const strata = new Map()
  for (const r of runs) {
    for (const f of runHealth(importClaudeCodeDir(r.path)).findings) {
      const o = f.evidence[0]
      const key = `${f.detectorId}:${f.severity}`
      const item = { session: r.id, detector: f.detectorId, severity: f.severity, file: o ? o.file.split(/[\\/]/).slice(-2).join('/') : '', line: o ? o.line + 1 : '', b0: o?.byteStart ?? '', b1: o?.byteEnd ?? '', message: f.message, order: sha(`assay-R4-v1:${r.id}:${f.detectorId}:${o?.line ?? ''}:${f.message}`) }
      strata.set(key, [...(strata.get(key) ?? []), item])
    }
  }
  const picked = [...strata.values()].flatMap(list => list.sort((a, b) => (a.order < b.order ? -1 : 1)).slice(0, 6))
  picked.forEach((p, i) => { p.item = `R4-${String(i + 1).padStart(3, '0')}` })
  const write = (name, items) => writeFileSync(`${DIR}/${name}`, [HEAD.join(','), ...items.map(p => [p.item, p.session, p.detector, p.severity, p.file, p.line, p.b0, p.b1, p.message, '', ''].map(csvCell).join(','))].join('\n') + '\n')
  mkdirSync(DIR, { recursive: true })
  write('sheet.csv', picked)
  write('sheet-pass2.csv', [...picked].sort((a, b) => (sha('pass2:' + a.item) < sha('pass2:' + b.item) ? -1 : 1)))
  console.log(`wrote ${DIR}/sheet.csv and sheet-pass2.csv: ${picked.length} findings in ${strata.size} strata`)
}

function kappa(pairs) {
  const cats = ['true', 'false', 'unsure'], n = pairs.length
  const po = pairs.filter(([a, b]) => a === b).length / n
  const pe = cats.reduce((s, c) => s + (pairs.filter(([a]) => a === c).length / n) * (pairs.filter(([, b]) => b === c).length / n), 0)
  return pe === 1 ? 1 : (po - pe) / (1 - pe)
}

function agree() {
  const p1 = parseCsv(readFileSync(`${DIR}/sheet.csv`, 'utf8')), p2 = new Map(parseCsv(readFileSync(`${DIR}/sheet-pass2.csv`, 'utf8')).map(r => [r.item, r]))
  const ok = new Set(['true', 'false', 'unsure'])
  const rows = p1.map(r => ({ ...r, l1: r.label.trim().toLowerCase(), l2: (p2.get(r.item)?.label ?? '').trim().toLowerCase() }))
  const bad = rows.filter(r => !ok.has(r.l1) || !ok.has(r.l2))
  if (bad.length) { console.error(`${bad.length} items lack a valid label in one pass (true|false|unsure): ${bad.slice(0, 5).map(r => r.item).join(' ')}`); process.exit(1) }
  const pairs = rows.map(r => [r.l1, r.l2])
  // Bootstrap over sessions (findings cluster by session).
  const sessions = [...new Set(rows.map(r => r.session))]
  let s = 26; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32)
  const ks = []
  for (let b = 0; b < 10000; b++) {
    const pick = sessions.map(() => sessions[Math.floor(rnd() * sessions.length)])
    const bp = pick.flatMap(id => rows.filter(r => r.session === id).map(r => [r.l1, r.l2]))
    if (bp.length) ks.push(kappa(bp))
  }
  ks.sort((a, b) => a - b)
  const precision = {}
  for (const r of rows) {
    if (r.l1 !== r.l2 || r.l1 === 'unsure') continue
    const k = `${r.detector}:${r.severity}`
    precision[k] = precision[k] ?? { true: 0, false: 0 }
    precision[k][r.l1]++
  }
  const out = {
    experiment: 'R4-audit-v1', items: rows.length, sessions: sessions.length,
    kappa: kappa(pairs), kappaCI95: [ks[Math.floor(0.025 * ks.length)], ks[Math.floor(0.975 * ks.length) - 1]],
    rawAgreement: pairs.filter(([a, b]) => a === b).length / pairs.length,
    precisionByStratum: Object.fromEntries(Object.entries(precision).map(([k, v]) => [k, { ...v, precision: v.true + v.false ? v.true / (v.true + v.false) : null }])),
  }
  writeFileSync(`${DIR}/agreement.json`, JSON.stringify(out, null, 2))
  console.log(JSON.stringify(out, null, 1))
}

const cmd = process.argv[2]
if (cmd === 'sheet') sheet()
else if (cmd === 'agree') { if (!existsSync(`${DIR}/sheet-pass2.csv`)) { console.error('run sheet first'); process.exit(1) } agree() }
else { console.error('usage: node scripts/r4.mjs sheet|agree'); process.exit(1) }
