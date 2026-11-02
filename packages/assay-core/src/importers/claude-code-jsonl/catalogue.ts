// Record types that Claude Code writes into session JSONL but that carry no
// per-request usage telemetry (UI state, titles, queue and file-history
// bookkeeping). They are still preserved as UnknownLines (Rule 4) but marked
// `catalogued`, so fineness measures lost telemetry, not unnamed metadata.
// ADR-022. Named from the corpus (2.1.165–2.1.316); not schema-verified, so a
// type stays out of this list until it has been seen and its fields checked.
// Anything not listed here still counts as unparsed. `cost-state` is left out
// on purpose: it carries the client's own per-model usage totals (M4_PLAN §3).
export const CATALOGUE_VERSION_RANGE = '2.1.165–2.1.316'

export const SET_ASIDE_TYPES = new Set([
  'attachment',
  'last-prompt',
  'mode',
  'permission-mode',
  'custom-title',
  'ai-title',
  'agent-name',
  'queue-operation',
  'bridge-session',
  'frame-link',
  'file-history-delta',
  'file-history-snapshot',
  'tools-used', // running list of tool names; no usage (2.1.316)
])
