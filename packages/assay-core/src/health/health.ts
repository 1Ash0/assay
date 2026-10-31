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
} from './detectors.js'
import { Finding, HealthReport, MetricVerdict, ValidityCard } from './types.js'

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

  // Build caveats from findings
  const caveats: string[] = []
  const d1 = findings.filter(f => f.detectorId === 'D1')
  const d2 = findings.filter(f => f.detectorId === 'D2')
  const d5 = findings.filter(f => f.detectorId === 'D5' && f.severity === 'warn')
  const d6warn = findings.filter(f => f.detectorId === 'D6' && f.severity === 'warn')
  const d6info = findings.filter(f => f.detectorId === 'D6' && f.severity === 'info')
  const d7 = findings.filter(f => f.detectorId === 'D7' && f.severity === 'info')
  const d8 = findings.filter(f => f.detectorId === 'D8')

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
  if (run.capture.level < 2)
    caveats.push(`Capture Level ${run.capture.level}: tool content and request bodies not captured`)

  return {
    claimedTurns,
    verifiedUsageTurns,
    totalInputTokens,
    totalContextTokens,
    totalOutputTokens,
    cacheHitRate,
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
