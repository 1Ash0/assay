import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { importClaudeCodeDir, runHealth } from '../packages/assay-core/src/index.js'

const CATALOGUE = resolve('fixtures/scripted/catalogue.jsonl')
const MINIMAL = resolve('fixtures/real/session-minimal.jsonl')
const DETECTORS = resolve('fixtures/real/session-detectors.jsonl')

describe('record-type catalogue (ADR-022)', () => {
  it('keeps catalogued lines as unknowns, flagged', () => {
    const run = importClaudeCodeDir(CATALOGUE, { truth: 'scripted' })
    expect(run.unknowns.length).toBe(3)
    expect(run.unknowns.filter(u => u.catalogued).map(u => u.reason)).toEqual([
      'unknown-type:attachment', 'unknown-type:queue-operation',
    ])
  })

  it('uncatalogued types still count against parsed telemetry', () => {
    const v = runHealth(importClaudeCodeDir(CATALOGUE)).validity
    expect(v.importerCoverage.cataloguedLines).toBe(2)
    expect(v.importerCoverage.unparsedTelemetryRatio).toBeCloseTo(1 / 5, 5)
    expect(v.importerCoverage.unknownRatio).toBeCloseTo(3 / 5, 5)
  })
})

describe('fineness (ADR-022)', () => {
  it('is marked to the lowest rate and names it', () => {
    const f = runHealth(importClaudeCodeDir(CATALOGUE)).validity.fineness
    expect(f.bound).toBe('parsed telemetry')
    expect(f.value).toBe(800)
  })

  it('is 1000 when every rate is 1', () => {
    const f = runHealth(importClaudeCodeDir(MINIMAL)).validity.fineness
    expect(f.rates['usage coverage']).toBe(1)
    expect(f.value).toBe(Math.floor(1000 * Math.min(...Object.values(f.rates).map(r => r ?? 1))))
  })
})

describe('forged usage range (ADR-021)', () => {
  it('reports a range when copies disagree on inputTokens', () => {
    const v = runHealth(importClaudeCodeDir(DETECTORS)).validity
    // msg_da3 has copies of 100 and 105; the importer keeps 105
    expect(v.inputTokenRange.max).toBe(v.totalInputTokens)
    expect(v.inputTokenRange.max - v.inputTokenRange.min).toBe(5)
  })

  it('demotes the tokens verdict when D6 warns', () => {
    expect(runHealth(importClaudeCodeDir(DETECTORS)).verdicts['tokens']).toBe('usable-with-caveats')
  })

  it('is a point when copies agree', () => {
    const r = runHealth(importClaudeCodeDir(MINIMAL))
    expect(r.validity.inputTokenRange.min).toBe(r.validity.inputTokenRange.max)
  })
})

describe('fs-free import (ADR-019)', () => {
  it('importFromFiles matches the directory importer', async () => {
    const { readFileSync } = await import('fs')
    const { importFromFiles } = await import('../packages/assay-core/src/index.js')
    const viaDir = importClaudeCodeDir(DETECTORS)
    const viaBytes = importFromFiles([{ path: DETECTORS, bytes: new Uint8Array(readFileSync(DETECTORS)) }])
    expect(viaBytes.events.map(e => e.offset)).toEqual(viaDir.events.map(e => e.offset))
    expect(viaBytes.sources[0]!.sha256).toBe(viaDir.sources[0]!.sha256)
  })

  it('parser and fs-free importer import no Node built-ins', async () => {
    const { readFileSync } = await import('fs')
    for (const f of ['parse.ts', 'from-files.ts', 'sha256.ts', 'derive.ts', 'version.ts']) {
      const src = readFileSync(resolve('packages/assay-core/src/importers/claude-code-jsonl', f), 'utf-8')
      expect(src).not.toMatch(/from '(fs|path|crypto|node:[a-z]+)'/)
    }
  })
})

describe('subagent transcripts (ADR-024)', () => {
  const WITH = resolve('fixtures/scripted/subagent/sess-sub.jsonl')
  const WITHOUT = resolve('fixtures/scripted/subagent-missing/sess-sub.jsonl')

  it('counts usage from the subagent file', () => {
    const run = importClaudeCodeDir(WITH, { truth: 'scripted' })
    expect(run.llmRequests.map(r => r.messageId).sort()).toEqual(['msg_p_a1', 'msg_p_a2', 'msg_s_a1'])
    expect(runHealth(run).validity.totalInputTokens).toBe(1030)
  })

  it('links the parent reference to the transcript file; D1 stays quiet', () => {
    const run = importClaudeCodeDir(WITH)
    expect(run.agents.map(a => [a.agentId, Boolean(a.transcriptFile)])).toEqual([['abc123def', true]])
    expect(runHealth(run).findings.filter(f => f.detectorId === 'D1')).toEqual([])
  })

  it('D1 fires when the parent names a subagent whose file is missing', () => {
    const d1 = runHealth(importClaudeCodeDir(WITHOUT)).findings.filter(f => f.detectorId === 'D1')
    expect(d1.length).toBe(1)
    expect(d1[0]!.evidence[0]!.line).toBe(2)
  })

  it('subagent turns do not shift main-chain turn numbering', () => {
    const run = importClaudeCodeDir(WITH)
    expect(run.messages.filter(m => m.role === 'assistant').length).toBe(3)
  })
})

describe('OTLP importer (ADR-025)', () => {
  const J = resolve('fixtures/scripted/otlp/sc-otel.jsonl')
  const O = resolve('fixtures/scripted/otlp/sc-otel.otlp.jsonl')
  const withOtel = async () => {
    const { readFileSync } = await import('fs')
    const { attachOtlp } = await import('../packages/assay-core/src/index.js')
    return attachOtlp(importClaudeCodeDir(J, { truth: 'scripted' }), [{ path: O, bytes: new Uint8Array(readFileSync(O)) }])
  }

  it('raises capture to L3 and keeps only this session\'s records', async () => {
    const run = await withOtel()
    expect(run.capture.level).toBe(3)
    expect(run.otel!.apiRequests.map(q => q.requestId)).toEqual(['req_A', 'req_T'])
    expect(run.otel!.otherSessionRecords).toBe(1)
    expect(run.otel!.spans).toBe(1)
    expect(run.sources.map(s => s.kind)).toEqual(['jsonl', 'otlp'])
  })

  it('joins by exact request_id and reports OTel-only and transcript-only requests', async () => {
    const v = runHealth(await withOtel()).validity
    expect(v.otel).toMatchObject({ apiRequests: 2, inTranscript: 1, otelOnly: 1, otelOnlyInputTokens: 1342, otelOnlyOutputTokens: 248, transcriptOnly: 1 })
    expect(v.otel!.otelOnlyBySource).toEqual({ generate_session_title: 1 })
    expect(v.caveats.some(c => c.includes('appear only in OTel'))).toBe(true)
  })

  it('without OTel the card says so and keeps the L1 caveat', () => {
    const v = runHealth(importClaudeCodeDir(J)).validity
    expect(v.otel).toBeNull()
    expect(v.caveats.some(c => c.includes('OTel (L3+) required'))).toBe(true)
  })
})
