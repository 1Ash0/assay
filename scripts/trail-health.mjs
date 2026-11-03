// Health over every TRAIL trace (ADR-037): aggregates only, since TRAIL is
// gated and is not reshared. Usage: node scripts/trail-health.mjs <out.json>
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { importTrail, runHealth } from '../packages/assay-core/dist/index.js'

const out = process.argv[2]
if (!out) { console.error('usage: trail-health <out.json>'); process.exit(1) }
if (!existsSync('TRAIL/GAIA')) { console.error('trail-health: no TRAIL/ folder (gated dataset, local only)'); process.exit(1) }

const r = { traces: 0, spans: 0, llmCalls: 0, llmCallsWithTokens: 0, toolCalls: 0, toolErrors: 0, agents: 0, overall: {}, findings: {}, versionSupport: {},
  tokensFromLlmCalls: 0, tokensNaiveAllSpans: 0, agentSpansWithTotals: 0, agentTotalsDisagreeing: 0, truncatedTraces: 0, duplicateSpanIds: 0, tracesWithUsageCoverageBelow1: 0 }
for (const dir of ['TRAIL/GAIA', 'TRAIL/SWE Bench']) {
  for (const f of readdirSync(dir)) {
    const run = importTrail({ path: `${dir}/${f}`, bytes: new Uint8Array(readFileSync(`${dir}/${f}`)) })
    const h = runHealth(run)
    r.traces++; r.spans += run.events.length + run.unknowns.length
    r.llmCalls += run.events.filter(e => e.raw.span_attributes?.['openinference.span.kind'] === 'LLM').length
    r.llmCallsWithTokens += run.llmRequests.length
    r.toolCalls += run.toolCalls.length; r.toolErrors += run.toolResults.filter(x => x.isError).length; r.agents += run.agents.length
    r.overall[h.overall] = (r.overall[h.overall] ?? 0) + 1
    r.versionSupport[h.validity.version.support] = (r.versionSupport[h.validity.version.support] ?? 0) + 1
    for (const x of h.findings) r.findings[`${x.detectorId}:${x.severity}`] = (r.findings[`${x.detectorId}:${x.severity}`] ?? 0) + 1
    r.tokensFromLlmCalls += run.llmRequests.reduce((s, q) => s + q.usage.inputTokens + q.usage.outputTokens, 0)
    // What a consumer summing every span's total would get (the overcount D12 warns about).
    for (const e of run.events) { const t = e.raw.span_attributes?.['llm.token_count.total']; if (t != null) r.tokensNaiveAllSpans += Number(t) }
    r.agentSpansWithTotals += run.events.filter(e => e.raw.span_attributes?.['openinference.span.kind'] === 'AGENT' && e.raw.span_attributes?.['llm.token_count.total'] != null).length
    r.agentTotalsDisagreeing += h.findings.filter(x => x.detectorId === 'D12').length
    if (run.capture.truncated) r.truncatedTraces++
    r.duplicateSpanIds += run.unknowns.filter(u => u.reason === 'trail:duplicate-span-id').length
    const cov = h.validity.fineness.rates['usage coverage']
    if (cov !== null && cov < 1) r.tracesWithUsageCoverageBelow1++
  }
}
r.naiveOvercount = r.tokensNaiveAllSpans / r.tokensFromLlmCalls
writeFileSync(out, JSON.stringify(r, null, 2))
console.log(JSON.stringify(r, null, 1))
