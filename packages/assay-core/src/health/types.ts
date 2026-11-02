import { Offset } from '../schema/offset.js'
import { CaptureQuality } from './quality.js'

export type FinenessRate = 'usage coverage' | 'parsed telemetry' | 'model identification'

export type Severity = 'info' | 'warn' | 'error'

export interface Finding {
  detectorId: string
  severity: Severity
  message: string
  evidence: Offset[]
  // True when this finding is evidence of a capture failure rather than a
  // structural or usage anomaly inside the transcript. Used to promote the
  // relevant observability category from 'not-observed' to 'capture-incomplete'.
  captureIntegrity?: boolean
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

// Four-way observability state for an event category.
//   observed:          at least one event of this category was captured
//   not-observed:      no events found, but the capture level cannot confirm absence
//   verified-absent:   independent evidence confirms no such event occurred
//   capture-incomplete: affirmative evidence of capture failure for this category
//                       (sequence gap, source disagreement, truncation, missing transcript)
//                       — stronger than not-observed; weaker than verified-absent
export type ObservabilityState = 'observed' | 'not-observed' | 'verified-absent' | 'capture-incomplete'

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
    // Unknown lines whose type is in the importer catalogue (no usage telemetry).
    cataloguedLines: number
    // (unknown - catalogued) / totalLines: telemetry-bearing lines we could not parse.
    unparsedTelemetryRatio: number
  }

  // Total non-cached input tokens as a range (ADR-021). When D6 finds copies of
  // a message that disagree on inputTokens, min uses the smallest copy and max
  // the largest (the importer's choice). A point total only when min === max.
  inputTokenRange: { min: number; max: number }

  // Deterministic capture-quality counters with first offsets (health/quality.ts).
  captureQuality: CaptureQuality

  // Rule 7: the harness version against the importer's declared support.
  version: {
    value: string | null
    support: 'checked' | 'in-range-unchecked' | 'outside-range' | 'no-version'
    range: string
  }

  // Request records in the transcript (ADR-026); null when the version writes none.
  // sealed = rebuilt body hashes to requestDigest; unresolved = a message in the
  // chain has no verified blob (the reconstruction gap R2 measures).
  requests: {
    records: number
    sealed: number
    broken: number
    unresolved: number
    noShape: number
    blobs: number
    blobsFailed: number
    shapesFailed: number
    messagesWithoutBlob: number
  } | null

  // Cross-channel check against OTel (ADR-025); null when no OTLP capture is
  // attached. otelOnly = api_request records with no transcript request of the
  // same request_id: internal calls the JSONL never wrote (R1-F2).
  otel: {
    apiRequests: number
    inTranscript: number
    otelOnly: number
    otelOnlyInputTokens: number
    otelOnlyOutputTokens: number
    otelOnlyCostUSD: number
    otelOnlyBySource: Record<string, number>
    // Transcript requests whose requestRef never appears in OTel.
    transcriptOnly: number
  } | null

  // Hallmark fineness (ADR-022): floor(1000 x the lowest of three rates),
  // marked to the lowest standard. `bound` names the rate that set it.
  fineness: {
    value: number | null
    bound: FinenessRate | null
    rates: Record<FinenessRate, number | null>
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
