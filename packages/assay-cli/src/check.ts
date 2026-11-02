// `assay check` (one human-readable card) and `assay assert` (rules for CI).
// Exit codes, shared by the CLI: 0 ok · 1 usage error or a failed assertion ·
// 2 the run is do-not-trust, or a request record disagrees with itself.
import { HealthReport, Run } from '@assay/core'

const n = (v: number | null | undefined) => (v == null ? '–' : Math.round(v).toLocaleString('en-US'))

export function card(run: Run, h: HealthReport): string {
  const v = h.validity
  const q = v.requests
  const lines = [
    // Capture Level first, before any number (Rule 1).
    `capture   L${run.capture.level} of L4 · truth ${run.truth} · ${run.harness.tool} ${run.harness.version ?? '(no version)'} (${v.version.support}, importer ${v.version.range})`,
    `overall   ${h.overall}`,
    `verdicts  ${Object.entries(h.verdicts).map(([k, x]) => `${k}: ${x}`).join(' · ')}`,
    `fineness  ${v.fineness.value ?? '–'} (bounded by ${v.fineness.bound ?? '–'})`,
    `tokens    context ${n(v.totalContextTokens)} (uncached input ${v.inputTokenRange.min === v.inputTokenRange.max ? n(v.inputTokenRange.max) : `${n(v.inputTokenRange.min)}–${n(v.inputTokenRange.max)}, copies disagree`})${v.otel ? ` · ${v.otel.otelOnly} request(s) seen only in OTel` : ''}`,
    q ? `requests  ${q.records} recorded · sealed ${q.sealed} (blobs alone ${q.sealedFromBlobs}, lines alone ${q.sealedFromLines}) · broken ${q.broken} · unresolved ${q.unresolved}` : 'requests  none recorded (Claude Code before 2.1.299 writes none)',
  ]
  const fs = h.findings.filter(f => f.severity !== 'info')
  lines.push(`findings  ${h.findings.length} (${fs.length} warn/error)`)
  for (const f of fs.slice(0, 12)) lines.push(`  ${f.severity.padEnd(5)} ${f.detectorId.padEnd(6)} ${f.evidence[0] ? `line ${f.evidence[0].line + 1}  ` : ''}${f.message.slice(0, 140)}`)
  if (fs.length > 12) lines.push(`  … ${fs.length - 12} more (assay check --json)`)
  for (const c of v.caveats.slice(0, 4)) lines.push(`caveat    ${c.slice(0, 160)}`)
  return lines.join('\n')
}

export function checkExit(h: HealthReport): number {
  if (h.overall.startsWith('do-not-trust')) return 2
  if (h.validity.requests && h.validity.requests.broken > 0) return 2
  return 0
}

// Rules for `assay assert`. Every field is optional; an empty rule set passes.
export interface Rules {
  minCaptureLevel?: number
  versionSupport?: string[]          // allowed: checked | in-range-unchecked | outside-range | no-version
  forbidSeverity?: ('warn' | 'error')[]
  forbidDetectors?: string[]
  overallNot?: string[]              // prefixes, e.g. "do-not-trust"
  maxInputTokens?: number
  minSealedShare?: number            // sealed / recorded requests, when records exist
  maxUnparsedTelemetry?: number      // fineness rate 1 - parsed telemetry
}

export interface Failure { rule: string; detail: string; line?: number }

export function assertRules(run: Run, h: HealthReport, r: Rules): Failure[] {
  const out: Failure[] = []
  const v = h.validity
  if (r.minCaptureLevel !== undefined && run.capture.level < r.minCaptureLevel) out.push({ rule: 'minCaptureLevel', detail: `capture L${run.capture.level} < L${r.minCaptureLevel}` })
  if (r.versionSupport && !r.versionSupport.includes(v.version.support)) out.push({ rule: 'versionSupport', detail: `${v.version.value ?? 'no version'} is ${v.version.support}` })
  for (const f of h.findings) {
    const o = f.evidence[0]
    const at = o ? { line: o.line + 1 } : {}
    if (r.forbidSeverity?.includes(f.severity as 'warn' | 'error')) out.push({ rule: 'forbidSeverity', detail: `${f.detectorId} ${f.severity}: ${f.message.slice(0, 120)}`, ...at })
    else if (r.forbidDetectors?.includes(f.detectorId)) out.push({ rule: 'forbidDetectors', detail: `${f.detectorId}: ${f.message.slice(0, 120)}`, ...at })
  }
  if (r.overallNot?.some(p => h.overall.startsWith(p))) out.push({ rule: 'overallNot', detail: `overall is ${h.overall}` })
  if (r.maxInputTokens !== undefined && v.inputTokenRange.max > r.maxInputTokens) out.push({ rule: 'maxInputTokens', detail: `input tokens up to ${v.inputTokenRange.max} > ${r.maxInputTokens}` })
  if (r.minSealedShare !== undefined && v.requests && v.requests.records > 0) {
    const share = v.requests.sealed / v.requests.records
    if (share < r.minSealedShare) out.push({ rule: 'minSealedShare', detail: `sealed ${v.requests.sealed}/${v.requests.records} = ${share.toFixed(3)} < ${r.minSealedShare}` })
  }
  if (r.maxUnparsedTelemetry !== undefined && v.importerCoverage.unparsedTelemetryRatio > r.maxUnparsedTelemetry) out.push({ rule: 'maxUnparsedTelemetry', detail: `unparsed telemetry ${v.importerCoverage.unparsedTelemetryRatio.toFixed(3)} > ${r.maxUnparsedTelemetry}` })
  return out
}

const KNOWN = new Set(['minCaptureLevel', 'versionSupport', 'forbidSeverity', 'forbidDetectors', 'overallNot', 'maxInputTokens', 'minSealedShare', 'maxUnparsedTelemetry'])
// An unknown rule name is an error, not ignored: a typo must not pass silently.
export function parseRules(text: string): Rules {
  const r = JSON.parse(text) as Record<string, unknown>
  const bad = Object.keys(r).filter(k => !KNOWN.has(k) && !k.startsWith('$'))
  if (bad.length) throw new Error(`unknown rule(s): ${bad.join(', ')}`)
  return r as Rules
}
