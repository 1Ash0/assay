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
  // Overall summary
  overall: MetricVerdict
}
