import { Offset } from '../schema/offset.js'

export type Severity = 'info' | 'warn' | 'error'

export interface Finding {
  detectorId: string
  severity: Severity
  message: string
  evidence: Offset[]
}

// Verdict per metric family
export type MetricVerdict =
  | 'trustworthy'
  | 'usable-with-caveats'
  | `do-not-trust-for:${string}`

export interface HealthReport {
  runId: string
  captureLevel: number
  verdicts: Record<string, MetricVerdict>
  findings: Finding[]
  overall: MetricVerdict
  validity: ValidityCard
}

// ValidityCard — summary of what a run's metrics mean and how much to trust them.
// Emitted alongside every HealthReport; shown before any metric display.
export interface ValidityCard {
  // Approximate count of distinct assistant turns (deduplicated by message.id).
  // Labelled "approximate" because it counts Message entities, not verified round-trips.
  claimedTurns: number

  // Count of LlmRequests with usage data — turns for which token counts are available.
  // Structural completeness (tool round-trips) is NOT implied; this is usage coverage only.
  verifiedUsageTurns: number

  // Non-cached input tokens (input_tokens field only; does NOT include cache_read).
  // WARNING: this understates total context. Use totalContextTokens for context size.
  totalInputTokens: number

  // Total context tokens = input + cacheRead. This is the actual context window usage.
  totalContextTokens: number

  // Total deduplicated output tokens.
  totalOutputTokens: number

  // cacheHitRate = cacheRead / (input + cacheRead). null when denominator is zero.
  // Formula source: M2 primer.
  cacheHitRate: number | null

  captureLevel: number
  overallHealth: MetricVerdict

  // Human-readable caveats derived from Health findings.
  // Each caveat explains a specific limitation — never implies a metric is verified
  // merely because it was successfully calculated.
  caveats: string[]
}
