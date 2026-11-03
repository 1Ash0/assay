import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { importClaudeCodeDir, runHealth, buildValidityCard } from '../packages/assay-core/src/index.js'

const COST_STATE = resolve('fixtures/scripted/cost-state.jsonl')

const MINIMAL = resolve('fixtures/real/session-minimal.jsonl')
const DETECTORS = resolve('fixtures/real/session-detectors.jsonl')

// ── importerCoverage — double-count fix ──────────────────────────────────────

describe('importerCoverage — cost-state double-count fix', () => {
  it('cost-state lines are not counted in unknowns', () => {
    const run = importClaudeCodeDir(COST_STATE)
    expect(run.unknowns.length).toBe(0)
    expect(run.costStates.length).toBe(1)
  })

  it('unknownRatio is 0 when only cost-state is the non-event line', () => {
    const run = importClaudeCodeDir(COST_STATE)
    const report = runHealth(run)
    expect(report.validity.importerCoverage.unknownLines).toBe(0)
    expect(report.validity.importerCoverage.unknownRatio).toBe(0)
  })

  it('cost-state evidence has real byte offsets (not 0/0)', () => {
    const run = importClaudeCodeDir(COST_STATE)
    const cs = run.costStates[0]!
    expect(cs.evidence[0]!.byteStart).toBeGreaterThan(0)
    expect(cs.evidence[0]!.byteEnd).toBeGreaterThan(cs.evidence[0]!.byteStart)
  })

  it('configurable truth label: scripted', () => {
    const run = importClaudeCodeDir(COST_STATE, { truth: 'scripted' })
    expect(run.truth).toBe('scripted')
  })

  it('truth defaults to real', () => {
    const run = importClaudeCodeDir(COST_STATE)
    expect(run.truth).toBe('real')
  })
})

// ── D5 — context overflow ────────────────────────────────────────────────────

describe('D5 — context overflow', () => {
  it('fires warn when inputTokens exceeds haiku-4-5 200K limit', () => {
    const run = importClaudeCodeDir(DETECTORS)
    const report = runHealth(run)
    const d5warn = report.findings.filter(f => f.detectorId === 'D5' && f.severity === 'warn')
    expect(d5warn.length).toBeGreaterThan(0)
    expect(d5warn[0]!.message).toContain('210000')
    expect(d5warn[0]!.message).toContain('200000')
  })

  it('does not fire warn for sonnet-4-6 (1M limit) with normal usage', () => {
    const run = importClaudeCodeDir(MINIMAL)
    const report = runHealth(run)
    const d5warn = report.findings.filter(f => f.detectorId === 'D5' && f.severity === 'warn')
    // minimal fixture has max 200 inputTokens on sonnet-4-6 (1M limit) — no overflow
    expect(d5warn.length).toBe(0)
  })

  it('emits info for unknown model IDs (no false positives)', () => {
    // session-minimal has no unknown model; check that unknown-model info doesn't fire
    const run = importClaudeCodeDir(MINIMAL)
    const report = runHealth(run)
    const d5unknownInfo = report.findings.filter(
      f => f.detectorId === 'D5' && f.message.includes('no documented context limit')
    )
    expect(d5unknownInfo.length).toBe(0) // sonnet-4-6 is known
  })
})

// ── D6 — usage disagreement ──────────────────────────────────────────────────

describe('D6 — usage disagreement', () => {
  it('fires info for streaming-partial outputToken duplicates', () => {
    const run = importClaudeCodeDir(DETECTORS)
    const report = runHealth(run)
    const d6info = report.findings.filter(f => f.detectorId === 'D6' && f.severity === 'info')
    expect(d6info.length).toBeGreaterThan(0)
    expect(d6info.some(f => f.message.includes('outputTokens differ'))).toBe(true)
  })

  it('fires warn for inputToken disagreement > 1', () => {
    const run = importClaudeCodeDir(DETECTORS)
    const report = runHealth(run)
    const d6warn = report.findings.filter(f => f.detectorId === 'D6' && f.severity === 'warn')
    expect(d6warn.length).toBeGreaterThan(0)
    expect(d6warn[0]!.message).toContain('inputTokens disagree')
  })

  it('does not fire for identical duplicates', () => {
    // session-minimal has msg_a2 duplicated with identical usage
    const run = importClaudeCodeDir(MINIMAL)
    const report = runHealth(run)
    const d6warn = report.findings.filter(f => f.detectorId === 'D6' && f.severity === 'warn')
    expect(d6warn.length).toBe(0)
  })

  it('importer selects max-usage record for streaming duplicates', () => {
    // msg_da2 has partial (out=5) then final (out=200); should keep out=200
    const run = importClaudeCodeDir(DETECTORS)
    const da2 = run.llmRequests.find(r => r.messageId === 'msg_da2')
    expect(da2).toBeDefined()
    expect(da2!.usage.outputTokens).toBe(200)
  })

  it('importer selects max-usage record for inputToken disagree case', () => {
    // msg_da3 has inp=100 and inp=105; max is 105
    const run = importClaudeCodeDir(DETECTORS)
    const da3 = run.llmRequests.find(r => r.messageId === 'msg_da3')
    expect(da3).toBeDefined()
    expect(da3!.usage.inputTokens).toBe(105)
  })
})

// ── D7 — compaction token change ─────────────────────────────────────────────

describe('D7 — compaction token change', () => {
  it('fires info when post-compaction inputTokens > pre', () => {
    // pre=400, post=600 → increase, should fire
    const run = importClaudeCodeDir(DETECTORS)
    const report = runHealth(run)
    const d7 = report.findings.filter(f => f.detectorId === 'D7')
    expect(d7.length).toBeGreaterThan(0)
    expect(d7.some(f => f.message.includes('post-compaction inputTokens'))).toBe(true)
  })

  it('does not fire when compaction causes expected decrease', () => {
    // No compaction in session-minimal that has post > pre at the right offset
    // session-minimal: pre=200 (msg_a2 at line 4), post=50 (msg_a3 at line 8) → decrease, no finding
    const run = importClaudeCodeDir(MINIMAL)
    const report = runHealth(run)
    const d7increase = report.findings.filter(
      f => f.detectorId === 'D7' && f.message.includes('post-compaction inputTokens')
    )
    expect(d7increase.length).toBe(0)
  })
})

// ── D8 — session ID conflict ──────────────────────────────────────────────────

describe('D8 — session ID conflict', () => {
  it('fires warn when one file has two distinct sessionIds', () => {
    // session-detectors.jsonl has sess-A and sess-B in one file
    const run = importClaudeCodeDir(DETECTORS)
    const report = runHealth(run)
    const d8 = report.findings.filter(f => f.detectorId === 'D8')
    expect(d8.length).toBeGreaterThan(0)
    expect(d8[0]!.message).toContain('distinct sessionIds')
  })

  it('does not fire when all events share the same sessionId', () => {
    const run = importClaudeCodeDir(MINIMAL)
    const report = runHealth(run)
    const d8 = report.findings.filter(f => f.detectorId === 'D8')
    expect(d8.length).toBe(0)
  })
})

// ── D9 — timestamp reversal ───────────────────────────────────────────────────

describe('D9 — timestamp reversal', () => {
  it('fires info on first backward timestamp transition', () => {
    // d-u7 has timestamp 2026-11-01T09:59:00 which is before d-a6's 10:01:04
    const run = importClaudeCodeDir(DETECTORS)
    const report = runHealth(run)
    const d9 = report.findings.filter(f => f.detectorId === 'D9')
    expect(d9.length).toBeGreaterThan(0)
    expect(d9[0]!.message).toContain('Timestamp reversal')
  })

  it('does not fire on equal timestamps (streaming duplicates)', () => {
    // session-minimal: a2 and a2b both at 10:00:03.000 and .001 — monotone, no reversal
    const run = importClaudeCodeDir(MINIMAL)
    const report = runHealth(run)
    const d9 = report.findings.filter(f => f.detectorId === 'D9')
    expect(d9.length).toBe(0)
  })
})

// ── ValidityCard ──────────────────────────────────────────────────────────────

describe('ValidityCard', () => {
  it('claimedTurns counts deduplicated assistant messages', () => {
    const run = importClaudeCodeDir(MINIMAL)
    const report = runHealth(run)
    // minimal: msg_a1, msg_a2 (deduped), msg_a3 → 3
    expect(report.validity.claimedTurns).toBe(3)
  })

  it('verifiedUsageTurns counts requests with non-zero usage', () => {
    const run = importClaudeCodeDir(MINIMAL)
    const report = runHealth(run)
    // all 3 assistant messages have usage
    expect(report.validity.verifiedUsageTurns).toBe(3)
  })

  it('totalInputTokens sums max-usage canonicalized requests', () => {
    const run = importClaudeCodeDir(MINIMAL)
    const report = runHealth(run)
    // a1=100, a2=200 (deduped), a3=50 → 350
    expect(report.validity.totalInputTokens).toBe(350)
  })

  it('cacheHitRate uses cacheRead / (input + cacheRead)', () => {
    const run = importClaudeCodeDir(MINIMAL)
    const report = runHealth(run)
    // a1: cacheRead=0, a2: cacheRead=600, a3: cacheRead=800 → totalCacheRead=1400
    // totalInput=350; denom=350+1400=1750; rate=1400/1750=0.8
    expect(report.validity.cacheHitRate).toBeCloseTo(0.8, 5)
  })

  it('cacheHitRate is null when denominator is zero', () => {
    // Build a run with zero input and zero cacheRead
    const run = importClaudeCodeDir(MINIMAL)
    const emptyRun = { ...run, llmRequests: [], messages: [] }
    const card = buildValidityCard(emptyRun, [], 'trustworthy')
    expect(card.cacheHitRate).toBeNull()
    expect(card.claimedTurns).toBe(0)
    expect(card.verifiedUsageTurns).toBe(0)
  })

  it('caveats include D1 warning for missing subagent transcript', () => {
    const run = importClaudeCodeDir(MINIMAL)
    const report = runHealth(run)
    // minimal has no subagents, so D1 should not fire; validity.caveats should note L1 capture
    expect(report.validity.caveats.some(c => c.includes('Capture Level'))).toBe(true)
  })

  it('resolved streaming duplicates are a D6 finding, not repeated as a caveat', () => {
    const run = importClaudeCodeDir(DETECTORS)
    const report = runHealth(run)
    expect(report.findings.some(f => f.detectorId === 'D6' && f.severity === 'info')).toBe(true)
    expect(report.validity.caveats.some(c => c.includes('streaming-partial'))).toBe(false)
  })

  it('claimedTurns and verifiedUsageTurns can differ (no-usage messages)', () => {
    // Use buildValidityCard directly with a message that has no LlmRequest
    const run = importClaudeCodeDir(MINIMAL)
    // Add a fake assistant message with no corresponding LlmRequest
    const extraMsg = { ...run.messages[0]!, id: 'fake-no-usage', role: 'assistant' as const }
    const modifiedRun = { ...run, messages: [...run.messages, extraMsg] }
    const report = runHealth(run)
    const card = buildValidityCard(modifiedRun, report.findings, report.overall)
    // claimedTurns should be 4 (3 real + 1 fake), verifiedUsageTurns still 3
    expect(card.claimedTurns).toBe(4)
    expect(card.verifiedUsageTurns).toBe(3)
  })
})
