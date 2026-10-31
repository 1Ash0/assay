export { runHealth, buildValidityCard } from './health.js'
export type { Finding, HealthReport, MetricVerdict, Severity, ValidityCard } from './types.js'
export {
  d5ContextOverflow,
  d6UsageDisagreement,
  d7CompactionTokenDrop,
  d8SessionIdConflict,
  d9TimestampReversal,
} from './detectors.js'
