import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { buildRunView, importClaudeCodeDir, redact, runHealth } from '../packages/assay-core/src/index.js'

const DETECTORS = resolve('fixtures/real/session-detectors.jsonl')
const view = () => {
  const run = importClaudeCodeDir(DETECTORS)
  return buildRunView(run, runHealth(run))
}

describe('redact (ADR-020)', () => {
  it('keeps ids, timestamps, numbers and short tokens', () => {
    expect(redact({ id: 'msg_01ABC', ts: '2026-11-01T10:00:00.000Z', n: 5, type: 'assistant' }))
      .toEqual({ id: 'msg_01ABC', ts: '2026-11-01T10:00:00.000Z', n: 5, type: 'assistant' })
  })
  it('replaces free text, paths and sensitive keys', () => {
    const r = redact({ text: 'hi', cwd: 'C:/Users/x/proj', note: 'a sentence with spaces' }) as Record<string, string>
    expect(r.text).toBe('‹redacted · 2 chars›')
    expect(r.cwd).toMatch(/^‹redacted/)
    expect(r.note).toMatch(/^‹redacted/)
  })
})

describe('buildRunView', () => {
  it('is deterministic', () => {
    expect(JSON.stringify(view())).toBe(JSON.stringify(view()))
  })
  it('carries the hallmark from the validity card', () => {
    const v = view()
    expect(v.hallmark.fineness).toBe(v.validity.fineness.value)
    expect(v.hallmark.bound).toBe(v.validity.fineness.bound)
  })
  it('dedup totals equal the validity card', () => {
    const v = view()
    expect(v.dedup[0]).toBe(v.validity.totalInputTokens)
    expect(v.dedup[3]).toBe(v.validity.totalOutputTokens)
  })
  it('every string in redacted raw samples is an id, timestamp, short token or marker', () => {
    const v = view()
    const ok = (x: string) => x.startsWith('‹') || x.length <= 28 && !/[\s\/]/.test(x)
    const walk = (x: unknown): string[] =>
      typeof x === 'string' ? [x] : x && typeof x === 'object' ? Object.values(x).flatMap(walk) : []
    const raws = [...v.findings.flatMap(f => f.items.map(i => i.raw)), v.unknownSample?.raw]
    const strings = raws.flatMap(walk)
    expect(strings.length).toBeGreaterThan(0)
    expect(strings.filter(x => !ok(x))).toEqual([])
    expect(v.source.file).not.toMatch(/[\/]/)
  })
})
