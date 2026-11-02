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
