// L4 calibration (ADR-026, M4_PLAN §1): compares a session's transcript request
// records with the raw API bodies Claude Code logged for the same requests
// (OTEL_LOG_RAW_API_BODIES). Usage:
//   node scripts/l4-calibrate.mjs <session.jsonl> <raw-dir> <out.json>
// The wire uses server-side threads on 2.1.316 (`thread: create|continue`), so
// each wire request is replayed into its full message list first: the previous
// logical messages, the previous response, then the new messages.
// Three differences are expected and applied, each counted, never hidden:
// the billing-header system block (wire only), cache_control (inline on the
// wire, paths in the record), and placeholders the raw-body logger writes in
// place of redacted values (wire values treated as unknown, not as matches).
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

const [session, rawDir, outFile] = process.argv.slice(2)
if (!session || !rawDir || !outFile) { console.error('usage: l4-calibrate <session.jsonl> <raw-dir> <out.json>'); process.exit(1) }

const sha = s => createHash('sha256').update(s).digest('hex')
const sortKeys = v => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v
const canon = v => JSON.stringify(sortKeys(v))
const noCache = v => Array.isArray(v) ? v.map(noCache) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== 'cache_control').map(([k, x]) => [k, noCache(x)])) : v
const asBlocks = m => typeof m.content === 'string' ? { ...m, content: [{ type: 'text', text: m.content }] } : m
const PLACEHOLDERS = new Set(['<REDACTED>', '[account memory text not recorded]'])
const PARAMS = ['model', 'betas', 'max_tokens', 'thinking', 'context_management', 'output_config']

// Leaf-by-leaf comparison; a wire placeholder counts as unknown, not equal.
function compare(rec, wire, st, path = '') {
  if (typeof wire === 'string' && PLACEHOLDERS.has(wire)) { st.redacted++; return true }
  if (rec === null || wire === null || typeof rec !== 'object' || typeof wire !== 'object') {
    if (rec === wire) return true
    st.diffs.push({ path, rec: String(rec).slice(0, 80), wire: String(wire).slice(0, 80) }); return false
  }
  let ok = true
  for (const k of new Set([...Object.keys(rec), ...Object.keys(wire)])) {
    if (!(k in rec) || !(k in wire)) { st.diffs.push({ path: `${path}.${k}`, only: k in rec ? 'record' : 'wire' }); ok = false; continue }
    if (!compare(rec[k], wire[k], st, `${path}.${k}`)) ok = false
  }
  return ok
}

const lines = readFileSync(session, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l))
const blobs = new Map(), shapes = new Map()
for (const o of lines) {
  if (o.type === 'api-request-blob') blobs.set(o.hash, o.message)
  if (o.type === 'api-request-shape') shapes.set(o.shapeHash, o.shape)
}
const records = lines.filter(o => o.type === 'api-request')
const chain = new Map()
for (const q of records) chain.set(q.id, [...(q.base ? chain.get(q.base) ?? [] : []).slice(0, q.keep), ...q.tail])

// One raw-body folder can hold several sessions; keep only this one's requests.
const sessionId = lines.find(o => typeof o.sessionId === 'string')?.sessionId
const index = readFileSync(`${rawDir}/index.jsonl`, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(x => !sessionId || x.session_id === sessionId)
const read = f => JSON.parse(readFileSync(`${rawDir}/${f}`, 'utf8'))

const wire = []
for (const x of index) {
  const body = read(x.request_file)
  let messages = body.messages
  if (body.thread?.type === 'continue') {
    const prev = wire.find(w => w.x.message_id === body.thread.previous_message_id)
    if (!prev) { wire.push({ x, body, messages: null, why: 'previous wire request not logged' }); continue }
    messages = [...prev.messages, { role: 'assistant', content: read(prev.x.response_file).content }, ...body.messages]
  }
  wire.push({ x, body, messages })
}

const st = { redacted: 0, diffs: [] }
const out = { session: session.split(/[\\/]/).pop(), rawRequests: index.length, bySource: {}, paired: 0, unpaired: [], params: 0, system: [0, 0], tools: [0, 0], messages: { compared: 0, equal: 0, notInRecord: 0 }, billingHeaderBlocks: 0, redactedLeaves: 0, differences: [] }
for (const w of wire) {
  out.bySource[w.x.query_source] = (out.bySource[w.x.query_source] ?? 0) + 1
  if (!w.messages) { out.unpaired.push({ request: w.x.request_id, why: w.why }); continue }
  // Pair by exact containment: every tail hash of the record must be a wire message hash.
  const wireHashes = new Set(w.messages.map(m => sha(canon(asBlocks(noCache(m))))))
  const cands = records.filter(q => q.querySource === w.x.query_source && chain.get(q.id).length === w.messages.length && q.tail.some(h => wireHashes.has(h)))
  if (cands.length !== 1) { out.unpaired.push({ request: w.x.request_id, source: w.x.query_source, why: `${cands.length} candidate records` }); continue }
  const q = cands[0]; out.paired++
  if (PARAMS.every(k => canon(q.params[k]) === canon(w.body[k]))) out.params++
  const sys = (w.body.system ?? []).filter(b => !(b.text ?? '').startsWith('x-anthropic-billing-header'))
  out.billingHeaderBlocks += (w.body.system ?? []).length - sys.length
  const shape = shapes.get(q.shapeHash)
  if (w.body.tools) { out.tools[1]++; if (compare(shape.tools, noCache(w.body.tools), st, 'tools')) out.tools[0]++ }
  if (sys.length && w.body.tools) { out.system[1]++; if (compare(shape.system, noCache(sys), st, 'system')) out.system[0]++ }
  chain.get(q.id).forEach((h, i) => {
    const m = blobs.get(h)
    if (!m) { out.messages.notInRecord++; return }
    out.messages.compared++
    if (compare(asBlocks(m), asBlocks(noCache(w.messages[i])), st, `${q.id.slice(0, 8)}.messages.${i}`)) out.messages.equal++
  })
}
out.redactedLeaves = st.redacted
out.differences = st.diffs
writeFileSync(outFile, JSON.stringify(out, null, 2))
console.log(JSON.stringify({ ...out, differences: out.differences.length }, null, 1))
