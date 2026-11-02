// J1 judge calibration on TRAIL (docs/experiments/J1-judge-calibration-v1.md).
//   node scripts/j1.mjs run      -> calls Groq for the 600 sampled spans (cached)
//   node scripts/j1.mjs score    -> results/J1-judge-calibration-v1.json
// Keys come only from the environment (GROQ_API_KEY, optionally GROQ_API_KEY_2,
// used in turn on rate limits) and are never written or logged. Answers are
// cached in results/J1/cache.jsonl, so a rerun never calls Groq twice for a span.
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { auroc, bestF1Threshold, confusion, ece, redactForJudge, reliability } from '../packages/assay-core/dist/index.js'

const sha = s => createHash('sha256').update(s).digest('hex')
const DIR = 'results/J1', CACHE = `${DIR}/cache.jsonl`, N = 600, CUT = 6000
const QUESTION = 'Does this span show an error made by the agent (wrong reasoning, wrong or failed tool use, instruction or format non-compliance, hallucination, goal deviation)? Answer JSON {"p": probability 0 to 1}.'
const MERGE = { 'Language-Only': 'Language-only', 'Context Handling Failure': 'Context Handling Failures' }

const lenient = t => { try { return JSON.parse(t) } catch { return JSON.parse(t.replace(/,(\s*[\]}])/g, '$1')) } }

function load() {
  const spans = [], notFound = []
  for (const [td, ad] of [['TRAIL/GAIA', 'TRAIL/processed_annotations_gaia'], ['TRAIL/SWE Bench', 'TRAIL/processed_annotations_swe_bench']]) {
    for (const f of readdirSync(td)) {
      const tr = JSON.parse(readFileSync(`${td}/${f}`, 'utf8'))
      const ann = existsSync(`${ad}/${f}`) ? lenient(readFileSync(`${ad}/${f}`, 'utf8')) : { errors: [] }
      const byLoc = new Map()
      for (const e of ann.errors ?? []) byLoc.set(e.location, [...(byLoc.get(e.location) ?? []), MERGE[e.category] ?? e.category])
      const all = []
      const walk = s => { all.push(s); (s.child_spans ?? []).forEach(walk) }
      tr.spans.forEach(walk)
      const ids = new Set(all.map(s => s.span_id))
      for (const loc of byLoc.keys()) if (!ids.has(loc)) notFound.push(`${tr.trace_id}:${loc}`)
      const task = JSON.stringify(all.find(s => /task|input|question/i.test(JSON.stringify(s.span_attributes ?? {})))?.span_attributes ?? {}).slice(0, 1000)
      for (const s of all) {
        const { child_spans: _c, ...own } = s
        spans.push({ trace: tr.trace_id, span: s.span_id, y: byLoc.has(s.span_id) ? 1 : 0, cats: byLoc.get(s.span_id) ?? [], own, task, status: s.status_code })
      }
    }
  }
  const sample = spans.map(s => ({ ...s, order: sha(`assay-J1-v1:${s.trace}:${s.span}`) })).sort((a, b) => (a.order < b.order ? -1 : 1)).slice(0, N)
  for (const s of sample) s.split = /^[0-4]/.test(sha(`assay-J1-split:${s.trace}`)) ? 'calibration' : 'held-out'
  return { spans, sample, notFound }
}

const cache = () => new Map((existsSync(CACHE) ? readFileSync(CACHE, 'utf8').split('\n').filter(Boolean) : []).map(l => { const o = JSON.parse(l); return [o.id, o] }))

async function run() {
  // Any of these names; duplicates dropped. A key Groq rejects is set aside
  // and the next one tried; the run stops only when none is accepted.
  const names = ['GROQ_API_KEY', 'GROQ_API_KEY_1', 'GROQ_API_KEY_2']
  const keys = [...new Set(names.map(n => process.env[n]).filter(v => v && !/^<.*>$/.test(v)))]
  const rejected = new Set()
  if (!keys.length) { console.error(`Set ${names.join(', ')} in your shell (a value still in <angle brackets> is ignored); keys are read from the environment only.`); process.exit(1) }
  mkdirSync(DIR, { recursive: true })
  let k = 0
  const call = async (path, body) => {
    let last = ''
    for (let attempt = 0; attempt < 6; attempt++) {
      let r
      try {
        r = await fetch(`https://api.groq.com/openai/v1/${path}`, { method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(60_000), headers: { Authorization: `Bearer ${keys[k % keys.length]}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })
      } catch (e) {
        // A dropped or timed-out connection is retried, not fatal; the cause is named.
        last = `network: ${e.cause?.code ?? e.name}`
        await new Promise(res => setTimeout(res, 2000 * 2 ** attempt)); continue
      }
      if (r.ok) return r.json()
      if (r.status === 401) {
        rejected.add(k % keys.length)
        if (rejected.size >= keys.length) throw new Error(`groq 401: all ${keys.length} key(s) rejected; check ${names.join(' / ')} in your shell (values are never printed)`)
        do { k++ } while (rejected.has(k % keys.length))
        attempt--; continue
      }
      if (r.status === 429 || r.status >= 500) { last = `http ${r.status}`; k++; await new Promise(res => setTimeout(res, 2000 * 2 ** attempt)); continue }
      throw new Error(`groq ${r.status}: ${(await r.text()).slice(0, 200)}`)
    }
    throw new Error(`groq: retries exhausted (${last}); if this is a connection timeout, check VPN or proxy settings for api.groq.com`)
  }
  const models = (await call('models')).data.map(m => m.id)
  // Preference order from the preregistration, as amended before any call (Amendment 1).
  const model = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'].find(m => models.includes(m))
  if (!model) { console.error(`none of the preregistered models is listed: ${models.join(', ')}`); process.exit(1) }
  const { sample } = load(), done = cache()
  let n = 0
  for (const s of sample) {
    const id = sha(`${s.trace}:${s.span}`).slice(0, 16)
    if (done.has(id)) continue
    const input = JSON.stringify(redactForJudge(s.own)).slice(0, CUT)
    const task = JSON.stringify(redactForJudge(s.task)).slice(0, 1000)
    let p = null, error
    try {
      const out = await call('chat/completions', {
        model, temperature: 0, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: 'You audit AI agent traces. Reply with JSON only.' }, { role: 'user', content: `Task context:\n${task}\n\nSpan:\n${input}\n\n${QUESTION}` }],
      })
      const v = Number(JSON.parse(out.choices[0].message.content).p)
      if (Number.isFinite(v) && v >= 0 && v <= 1) p = v; else error = 'reply had no p in [0,1]'
    } catch (e) { error = String(e.message).slice(0, 200) }
    appendFileSync(CACHE, JSON.stringify({ id, model, p, ...(error ? { error } : {}) }) + '\n')
    if (++n % 25 === 0) console.error(`${n} answered this run`)
  }
  console.error(`done: ${n} new answers, model ${model}`)
}

function score() {
  const { spans, sample, notFound } = load(), done = cache()
  const rows = sample.map(s => ({ ...s, ans: done.get(sha(`${s.trace}:${s.span}`).slice(0, 16)) }))
  const answered = rows.filter(r => r.ans && r.ans.p !== null)
  // The preregistration fixes one pass over all 600 spans: no result is written
  // until every span has been attempted (answered or failed after retries).
  const attempted = rows.filter(r => r.ans).length
  if (attempted < rows.length) {
    console.error(`J1 not complete: ${attempted}/${rows.length} spans attempted (${answered.length} answered). Run \`node scripts/j1.mjs run\` until done; no result is written before that.`)
    process.exit(process.argv.includes('--progress') ? 0 : 1)
  }
  const set = sp => answered.filter(r => r.split === sp).map(r => ({ p: r.ans.p, y: r.y, trace: r.trace }))
  const cal = set('calibration'), held = set('held-out')
  const t = bestF1Threshold(cal)
  // Bootstrap ECE over held-out traces.
  const traces = [...new Set(held.map(x => x.trace))]
  let s = 26; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32)
  const es = []
  for (let b = 0; b < 10000; b++) { const pick = traces.map(() => traces[Math.floor(rnd() * traces.length)]); const xs = pick.flatMap(id => held.filter(x => x.trace === id)); if (xs.length) es.push(ece(xs)) }
  es.sort((a, b) => a - b)
  const errorish = r => (r.status && !/^(unset|ok)$/i.test(String(r.status))) || /Error|Exception|Traceback/.test(JSON.stringify(r.own))
  const baseHeld = rows.filter(r => r.split === 'held-out').map(r => ({ p: errorish(r) ? 1 : 0, y: r.y }))
  const out = {
    experiment: 'J1-judge-calibration-v1', kind: 'model-judged', model: answered[0]?.ans.model ?? null,
    corpus: { traces: new Set(spans.map(x => x.trace)).size, spans: spans.length, positiveSpans: spans.filter(x => x.y).length, labelLocationsNotFound: notFound.length },
    sample: { n: rows.length, answered: answered.length, unanswered: rows.length - answered.length, calibration: cal.length, heldOut: held.length, heldOutPositives: held.filter(x => x.y).length },
    primary_ece_heldOut: { value: ece(held), ci95: [es[Math.floor(0.025 * es.length)], es[Math.floor(0.975 * es.length) - 1]] },
    auroc_heldOut: auroc(held),
    reliability_heldOut: reliability(held),
    threshold_fromCalibration: t,
    judge_heldOut_atThreshold: confusion(held, t),
    baseline_heldOut: confusion(baseHeld, 1),
    // Per span: hashed id, split, label, p. No trace text (TRAIL is gated, not reshared).
    spans: rows.map(r => ({ id: sha(`${r.trace}:${r.span}`).slice(0, 16), split: r.split, y: r.y, p: r.ans?.p ?? null })),
  }
  writeFileSync('results/J1-judge-calibration-v1.json', JSON.stringify(out, null, 2))
  console.log(JSON.stringify({ ...out, spans: undefined, reliability_heldOut: out.reliability_heldOut.map(b => `${b.lo.toFixed(1)}: n=${b.n} rate=${b.rate === null ? '-' : b.rate.toFixed(2)}`) }, null, 1))
}

const cmd = process.argv[2]
if (cmd === 'run') await run().catch(e => { console.error(e.message); process.exit(1) })
else if (cmd === 'score') score()
else { console.error('usage: node scripts/j1.mjs run|score'); process.exit(1) }
