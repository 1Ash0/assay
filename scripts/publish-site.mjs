// Build the public site into dist/site (ADR-038) and refuse to finish if any
// unredacted content could ship. Usage: node scripts/publish-site.mjs
//
// What ships: the pages, core's redacted export (data.js) and per-run spines
// (runs/*.json). TRAIL runs never ship (its licence forbids resharing).
// The check walks every string inside raw records and provenance samples,
// the only places user content can appear, and allows only redaction
// placeholders and recognisable ids, hashes, timestamps and short tokens.
// It also scans every shipped file for paths, emails and secret patterns.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'

const SRC = 'web/prototype', OUT = 'dist/site'
const PAGES = ['home.html', 'index.html', 'theme.css', 'app.js', 'views.js', 'report.js', 'fx.js', 'home.js', 'assay-core.js', 'worker.js']
const TRAIL = 'openinference-smolagents'
const fail = []

if (!existsSync(`${SRC}/data.js`)) { console.error('publish-site: data.js missing; run pnpm web'); process.exit(1) }
const text = readFileSync(`${SRC}/data.js`, 'utf-8')
const data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
const runs = data.runs.filter(r => r.harness.tool !== TRAIL)
const dropped = data.runs.length - runs.length

const OK = [
  /^‹redacted · \d+ chars›$/,
  /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i,           // uuid
  /^[0-9a-f]{8,64}$/i,                                       // hash or short id
  /^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/,                           // ISO timestamp
  /^(msg|req|toolu|srvtoolu|call)_[A-Za-z0-9]+$/,            // API ids
  /^[\w.-]{1,128}\.[A-Za-z0-9]{1,6}$/,                       // file basename (core keeps names, never directories)
  /^(claude|gpt|o\d|gemini)[\w.:-]*$/i,                      // model names
  /^\d+(\.\d+)+$/,                                           // versions
  /^[\w.:@-]{1,64}$/,                                        // identifiers: tool names, enum values, record types (no spaces, no slashes)
]
const shortOk = s => s.length <= 24 && !/[\\/]/.test(s)
function walk(v, where) {
  if (typeof v === 'string') { if (!shortOk(v) && !OK.some(re => re.test(v))) fail.push(`${where}: unredacted string (${v.length} chars): ${v.slice(0, 30)}…`) }
  else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, `${where}.${k}`)
}
const LEAKS = [
  [/[A-Za-z]:\\\\?[A-Za-z]/, 'Windows path'], [/\/(home|Users)\/[^"\s]+/, 'home path'], [/[\w.+-]+@[\w-]+\.[a-z]{2,}/i, 'email address'],
  [/\b(sk-[A-Za-z0-9-]{16,}|gsk_[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16})/, 'secret-like token'],
]
const leakScan = (name, s) => { for (const [re, what] of LEAKS) { const m = s.match(re); if (m) fail.push(`${name} contains a ${what}: ${m[0].slice(0, 24)}`) } }

for (const r of runs) {
  for (const f of r.findings) for (const it of f.items) if (it.raw) walk(it.raw, `${r.id}.${f.id}.raw`)
  if (r.unknownSample) walk(r.unknownSample, `${r.id}.unknownSample`)
  if (r.rawApi) walk(r.rawApi, `${r.id}.rawApi`)
}
const spines = {}
for (const r of runs) {
  const p = `${SRC}/runs/${r.id}.json`
  if (!existsSync(p)) { fail.push(`runs/${r.id}.json missing; run pnpm web`); continue }
  const s = readFileSync(p, 'utf-8'); spines[r.id] = s; leakScan(`runs/${r.id}.json`, s)
  const sp = JSON.parse(s), steps = (sp.spine || sp).steps || []
  steps.forEach((st, i) => (st.provenance || []).forEach(pv => pv.examples.forEach(([t]) => walk(t, `${r.id}.step${i}.example`))))
}
const outData = text.slice(0, text.indexOf('{')) + JSON.stringify({ ...data, runs }) + text.slice(text.lastIndexOf('}') + 1)
leakScan('data.js', outData)
for (const f of PAGES) if (existsSync(`${SRC}/${f}`)) leakScan(f, readFileSync(`${SRC}/${f}`, 'utf-8'))

if (fail.length) {
  console.error(`publish-site refused: ${fail.length} problem(s)\n  ` + fail.slice(0, 40).join('\n  ') + (fail.length > 40 ? `\n  … ${fail.length - 40} more` : ''))
  process.exit(1)
}
rmSync(OUT, { recursive: true, force: true }); mkdirSync(`${OUT}/runs`, { recursive: true })
for (const f of PAGES) if (existsSync(`${SRC}/${f}`)) cpSync(`${SRC}/${f}`, `${OUT}/${f}`)
writeFileSync(`${OUT}/data.js`, outData)
for (const [id, s] of Object.entries(spines)) writeFileSync(`${OUT}/runs/${id}.json`, s)

// The landing page is the front door: published as index.html, with the
// explorer as explorer.html. Links are rewritten here so the sources keep
// their local names (home.html, index.html) and nothing else changes.
const swap = (f, pairs) => { let t = readFileSync(`${OUT}/${f}`, 'utf-8'); for (const [a, b] of pairs) t = t.split(a).join(b); writeFileSync(`${OUT}/${f}`, t) }
cpSync(`${OUT}/index.html`, `${OUT}/explorer.html`); cpSync(`${OUT}/home.html`, `${OUT}/index.html`); rmSync(`${OUT}/home.html`)
swap('explorer.html', [['home.html', 'index.html']]); swap('report.js', [['home.html', 'index.html']])
swap('index.html', [['index.html', 'explorer.html'], ['home.html', 'index.html']]); swap('home.js', [['index.html', 'explorer.html']])
console.error(`publish-site ok: ${runs.length} runs (${dropped} TRAIL run(s) left out) in ${OUT}`)
