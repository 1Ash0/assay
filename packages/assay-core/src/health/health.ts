import { Run } from '../schema/run.js'
import {
  d1SubagentBlindSpot,
  d2UsageDoubleCount,
  d3ChainBreak,
  d4OrphanTool,
  d5ContextOverflow,
  d6UsageDisagreement,
  d7CompactionTokenDrop,
  d8SessionIdConflict,
  d9TimestampReversal,
  d10ApiRequestCount,
  dCostStateCheck,
} from './detectors.js'
import { CategoryObservability, Finding, HealthReport, MetricVerdict, ValidityCard } from './types.js'

export function runHealth(run: Run): HealthReport {
  const findings: Finding[] = [
    ...d1SubagentBlindSpot(run),
    ...d2UsageDoubleCount(run),
    ...d3ChainBreak(run),
    ...d4OrphanTool(run),
    ...d5ContextOverflow(run),
    ...d6UsageDisagreement(run),
    ...d7CompactionTokenDrop(run),
    ...d8SessionIdConflict(run),
    ...d9TimestampReversal(run),
    ...d10ApiRequestCount(run),
    ...dCostStateCheck(run),
  ]

  const errorFindings = findings.filter(f => f.severity === 'error')
  const warnFindings = findings.filter(f => f.severity === 'warn')

  // Per-metric verdicts
  const verdicts: Record<string, MetricVerdict> = {
    tokens: tokensVerdict(findings),
    structure: structureVerdict(findings),
    subagents: subagentsVerdict(findings),
  }

  // Schema verdict: only fire on parse errors or non-object lines — those indicate
  // actual malformation. App-metadata unknowns (mode, api-request, etc.) are expected
  // at L1 and do not degrade the verdict.
  const badUnknowns = run.unknowns.filter(
    u => u.reason === 'json-parse-error' || u.reason === 'not-an-object'
  )
  if (badUnknowns.length > 0) {
    verdicts['schema'] = 'usable-with-caveats'
  }

  const overall = deriveOverall(verdicts, errorFindings, warnFindings)

  const validity = buildValidityCard(run, findings, overall)
  return { runId: run.id, captureLevel: run.capture.level, verdicts, findings, overall, validity }
}

export function buildValidityCard(run: Run, findings: Finding[], overall: MetricVerdict): ValidityCard {
  // claimedTurns: deduplicated assistant messages (approximate turns)
  const claimedTurns = run.messages.filter(m => m.role === 'assistant').length

  // verifiedUsageTurns: LlmRequests that have non-zero usage (usage coverage, not structural)
  const verifiedUsageTurns = run.llmRequests.filter(
    r => r.usage.inputTokens > 0 || r.usage.outputTokens > 0
  ).length

  // usageCoverageRate: fraction of claimed turns with usage data
  const usageCoverageRate = claimedTurns > 0 ? verifiedUsageTurns / claimedTurns : null

  // modelIdentificationRate: fraction of LlmRequests where we know the model
  const modelByMsgId = new Map<string, string>()
  for (const ev of run.events) {
    if (ev.kind !== 'assistant') continue
    const obj = ev.raw as Record<string, unknown>
    const msg = obj['message'] as Record<string, unknown> | undefined
    if (!msg) continue
    const mid = typeof msg['id'] === 'string' ? msg['id'] : ev.id
    if (!modelByMsgId.has(mid) && typeof msg['model'] === 'string') {
      modelByMsgId.set(mid, msg['model'])
    }
  }
  const identifiedCount = run.llmRequests.filter(r => modelByMsgId.has(r.messageId)).length
  const modelIdentificationRate = run.llmRequests.length > 0
    ? identifiedCount / run.llmRequests.length
    : null

  // Totals from deduplicated, max-usage-canonicalized LlmRequests
  let totalInputTokens = 0
  let totalOutputTokens = 0
  let totalCacheRead = 0
  for (const req of run.llmRequests) {
    totalInputTokens += req.usage.inputTokens
    totalOutputTokens += req.usage.outputTokens
    totalCacheRead += req.usage.cacheReadTokens
  }

  // totalContextTokens = input + cacheRead (actual context window usage per request, summed)
  const totalContextTokens = totalInputTokens + totalCacheRead

  // cacheHitRate = cacheRead / (input + cacheRead); null when denominator is zero
  const denom = totalContextTokens
  const cacheHitRate = denom > 0 ? totalCacheRead / denom : null

  // Importer coverage
  const eventLines = run.events.length + run.costStates.length + run.rawApiRequestCount
  const unknownLines = run.unknowns.length
  const totalLines = eventLines + unknownLines
  const unknownRatio = totalLines > 0 ? unknownLines / totalLines : 0
  const importerCoverage = { totalLines, eventLines, unknownLines, unknownRatio }

  // Per-category observability
  const observability: Record<string, CategoryObservability> = {}

  // Compaction: observed if we have any, not-observed otherwise (L1 cannot confirm absence)
  if (run.compactions.length > 0) {
    observability['compaction'] = {
      state: 'observed',
      count: run.compactions.length,
      reason: `${run.compactions.length} compaction event(s) found in JSONL`,
    }
  } else {
    observability['compaction'] = {
      state: 'not-observed',
      count: 0,
      reason: 'No compaction events in JSONL; L1 capture cannot confirm absence (no independent record kept)',
    }
  }

  // Subagent: observed if agents list has entries
  if (run.agents.length > 0) {
    observability['subagent'] = {
      state: 'observed',
      count: run.agents.length,
      reason: `${run.agents.length} agent reference(s) found`,
    }
  } else {
    observability['subagent'] = {
      state: 'not-observed',
      count: 0,
      reason: 'No subagent references in JSONL; not confirmed absent — subagent use leaves no explicit marker in main transcript at L1',
    }
  }

  // Skill: observed if skills list has entries
  if (run.skills.length > 0) {
    observability['skill'] = {
      state: 'observed',
      count: run.skills.length,
      reason: `${run.skills.length} skill invocation(s) found via tool_use`,
    }
  } else {
    observability['skill'] = {
      state: 'not-observed',
      count: 0,
      reason: 'No skill invocations detected; inference is from Skill tool_use only — actual skill use may differ',
    }
  }

  // costState: observed if cost-state records were captured
  if (run.costStates.length > 0) {
    observability['costState'] = {
      state: 'observed',
      count: run.costStates.length,
      reason: `${run.costStates.length} cost-state record(s) from runtime (v2.1.308+)`,
    }
  } else {
    observability['costState'] = {
      state: 'not-observed',
      count: 0,
      reason: 'No cost-state records; either pre-v2.1.308 session or records not emitted — no independent cost cross-check available',
    }
  }

  // Runtime cost from cost-state records (last record = final accounting)
  const lastCostState = run.costStates.at(-1)
  const runtimeCostUSD = lastCostState?.totalCostUSD ?? null
  const runtimeCostHasUnknownModel = lastCostState?.hasUnknownModelCost ?? false

  // Build caveats from findings
  const caveats: string[] = []
  const d1 = findings.filter(f => f.detectorId === 'D1')
  const d2 = findings.filter(f => f.detectorId === 'D2')
  const d5 = findings.filter(f => f.detectorId === 'D5' && f.severity === 'warn')
  const d6warn = findings.filter(f => f.detectorId === 'D6' && f.severity === 'warn')
  const d6info = findings.filter(f => f.detectorId === 'D6' && f.severity === 'info')
  const d7 = findings.filter(f => f.detectorId === 'D7' && f.severity === 'info')
  const d8 = findings.filter(f => f.detectorId === 'D8')
  const d10 = findings.filter(f => f.detectorId === 'D10')
  const dCost = findings.filter(f => f.detectorId === 'D-cost' && f.severity === 'warn')

  if (d1.length > 0)
    caveats.push(`${d1.length} subagent(s) missing transcript files — token totals are undercounted`)
  if (d2.length > 0)
    caveats.push(`${d2.length} message(s) appeared as raw duplicates; deduplicated before counting`)
  if (d6info.length > 0)
    caveats.push(`${d6info.length} message(s) had streaming-partial usage duplicates; max-usage record selected`)
  if (d6warn.length > 0)
    caveats.push(`${d6warn.length} message(s) had unexpected inputToken disagreement across duplicates`)
  if (d5.length > 0)
    caveats.push(`${d5.length} request(s) exceeded or approached the model context limit`)
  if (d7.length > 0)
    caveats.push(`${d7.length} compaction(s) showed unusual token patterns — post-compaction counts may not reflect summarization`)
  if (d8.length > 0)
    caveats.push(`${d8.length} source file(s) contained conflicting sessionIds`)
  if (d10.length > 0)
    caveats.push(`api-request count mismatch: JSONL has ${run.rawApiRequestCount} api-request records vs ${run.llmRequests.length} LlmRequests — may indicate capture gaps or internal routing calls not reflected in conversation transcript`)
  if (dCost.length > 0)
    caveats.push(`Runtime cost-state token totals disagree with JSONL usage fields — one source may be incomplete`)
  if (modelIdentificationRate !== null && modelIdentificationRate < 0.5)
    caveats.push(`Model identified for only ${Math.round(modelIdentificationRate * 100)}% of LlmRequests — context-limit checks were skipped for most requests`)
  if (unknownRatio > 0.2)
    caveats.push(`${Math.round(unknownRatio * 100)}% of JSONL lines were not recognized by the importer — coverage metrics may be incomplete`)
  if (run.capture.level < 3)
    caveats.push(`Capture Level ${run.capture.level}: internal non-conversation API calls (e.g. tool-routing requests) not captured — token totals understate full API spend; OTel (L3+) required for complete cost accounting`)
  if (run.capture.level < 2)
    caveats.push(`Capture Level ${run.capture.level}: tool content and request bodies not captured`)

  return {
    claimedTurns,
    verifiedUsageTurns,
    usageCoverageRate,
    modelIdentificationRate,
    totalInputTokens,
    totalContextTokens,
    totalOutputTokens,
    cacheHitRate,
    importerCoverage,
    observability,
    runtimeCostUSD,
    runtimeCostHasUnknownModel,
    captureLevel: run.capture.level,
    overallHealth: overall,
    caveats,
  }
}

function tokensVerdict(findings: Finding[]): MetricVerdict {
  const d2 = findings.filter(f => f.detectorId === 'D2')
  if (d2.length > 0) return 'usable-with-caveats'
  return 'trustworthy'
}

function structureVerdict(findings: Finding[]): MetricVerdict {
  const d3 = findings.filter(f => f.detectorId === 'D3')
  const d4 = findings.filter(f => f.detectorId === 'D4')
  if (d3.length > 0 || d4.length > 0) return 'usable-with-caveats'
  return 'trustworthy'
}

function subagentsVerdict(findings: Finding[]): MetricVerdict {
  const d1 = findings.filter(f => f.detectorId === 'D1')
  if (d1.length > 0) return `do-not-trust-for:subagent-token-totals`
  return 'trustworthy'
}

function deriveOverall(
  verdicts: Record<string, MetricVerdict>,
  errors: Finding[],
  warns: Finding[],
): MetricVerdict {
  const values = Object.values(verdicts)
  if (values.some(v => v.startsWith('do-not-trust-for:'))) {
    const affected = values
      .filter(v => v.startsWith('do-not-trust-for:'))
      .map(v => v.replace('do-not-trust-for:', ''))
      .join(',')
    return `do-not-trust-for:${affected}`
  }
  if (errors.length > 0) return 'do-not-trust-for:data-integrity'
  if (values.some(v => v === 'usable-with-caveats') || warns.length > 0) {
    return 'usable-with-caveats'
  }
  return 'trustworthy'
}
