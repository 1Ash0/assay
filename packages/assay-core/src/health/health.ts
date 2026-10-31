import { Run } from '../schema/run.js'
import { d1SubagentBlindSpot, d2UsageDoubleCount, d3ChainBreak, d4OrphanTool } from './detectors.js'
import { Finding, HealthReport, MetricVerdict } from './types.js'

export function runHealth(run: Run): HealthReport {
  const findings: Finding[] = [
    ...d1SubagentBlindSpot(run),
    ...d2UsageDoubleCount(run),
    ...d3ChainBreak(run),
    ...d4OrphanTool(run),
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

  return { runId: run.id, captureLevel: run.capture.level, verdicts, findings, overall }
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
  if (values.some(v => v === 'usable-with-caveats') || warns.length > 0) {
    return 'usable-with-caveats'
  }
  return 'trustworthy'
}
