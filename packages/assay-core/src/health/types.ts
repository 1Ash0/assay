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

// Three-way observability state for an event category.
// Distinguishes what we know from what we can only estimate from what is genuinely unknowable.
//   verified-absent: independent evidence confirms no such event occurred
//   not-observed:    no events found, but the capture level cannot confirm absence
//   observed:        at least one event of this category was captured
export type ObservabilityState = 'observed' | 'not-observed' | 'verified-absent'

// Per-category observability report.
export interface CategoryObservability {
  state: ObservabilityState
  count: number
  // Why this state was assigned — short human-readable reason.
  reason: string
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

  // Fraction of claimed turns that have non-zero usage. Low ratio = token totals unreliable.
  usageCoverageRate: number | null

  // Fraction of LlmRequests where the model id was identified.
  // Low ratio = D5 context-limit checks were skipped for most requests.
  modelIdentificationRate: number | null

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

  // Importer coverage: how much of the raw source was understood.
  // unknownRatio = unknowns / (events + unknowns). High ratio = more data was not parsed.
  importerCoverage: {
    totalLines: number
    eventLines: number
    unknownLines: number
    unknownRatio: number
  }

  // Per-category observability — distinguishes "not seen" from "confirmed absent".
  // Categories: compaction, subagent, skill, costState
  observability: Record<string, CategoryObservability>

  // Runtime cost cross-check, when cost-state records are present.
  // null when no cost-state records were captured.
  runtimeCostUSD: number | null
  runtimeCostHasUnknownModel: boolean

  captureLevel: number
  overallHealth: MetricVerdict

  // Human-readable caveats derived from Health findings.
  // Each caveat explains a specific limitation — never implies a metric is verified
  // merely because it was successfully calculated.
  caveats: string[]
}
