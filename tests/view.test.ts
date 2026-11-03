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
    const ok = (x: string) => x.startsWith('‹') || x.length <= 28 && !/[\s\\/]/.test(x)
    const walk = (x: unknown): string[] =>
      typeof x === 'string' ? [x] : x && typeof x === 'object' ? Object.values(x).flatMap(walk) : []
    const raws = [...v.findings.flatMap(f => f.items.map(i => i.raw)), v.unknownSample?.raw]
    const strings = raws.flatMap(walk)
    expect(strings.length).toBeGreaterThan(0)
    expect(strings.filter(x => !ok(x))).toEqual([])
    expect(v.source.file).not.toMatch(/[\\/]/)
  })
})

describe('path stripping', () => {
  it('reduces Windows and POSIX paths to basenames', async () => {
    const { basename, stripPaths } = await import('../packages/assay-core/src/view/redact.js')
    expect(basename(String.raw`E:\a\b\c.jsonl`)).toBe('c.jsonl')
    expect(stripPaths(String.raw`missing E:\a\b\agent-1.jsonl here`)).toBe('missing agent-1.jsonl here')
    expect(stripPaths('see /home/u/x/y.jsonl')).toBe('see y.jsonl')
  })
  it('strips paths anywhere in a structure, such as validity offsets', async () => {
    const { scrubPaths } = await import('../packages/assay-core/src/view/redact.js')
    expect(scrubPaths({ q: { first: [{ file: String.raw`E:\assay\corpus\frozen\p\s.jsonl`, line: 3 }] } }))
      .toEqual({ q: { first: [{ file: 's.jsonl', line: 3 }] } })
  })
  it('redacts short diff lines in tool results (publish check found one)', () => {
    const r = redact({ structuredPatch: [{ lines: ['+langchain-classic>=1.0.3', ' ok'] }] }) as { structuredPatch: { lines: string[] }[] }
    expect(r.structuredPatch[0]!.lines.every(l => l.startsWith('‹redacted'))).toBe(true)
  })
  it('view validity carries no directory', () => {
    expect(JSON.stringify(view().validity)).not.toMatch(/[A-Za-z]:\\|\/(home|Users)\//)
  })
  it('view evidence files carry no directory', () => {
    const v = view()
    for (const f of v.findings) for (const i of f.items) for (const e of i.ev) expect(e.file).not.toMatch(/[\\/]/)
  })
})

describe('spine (Traverse, Replay, Run Diff)', () => {
  it('has one step per LlmRequest, in line order, with M4 slots empty', () => {
    const run = importClaudeCodeDir(DETECTORS)
    const s = buildRunView(run, runHealth(run)).spine
    expect(s.steps.length).toBe(run.llmRequests.length)
    for (let i = 1; i < s.steps.length; i++) expect(s.steps[i]!.line).toBeGreaterThanOrEqual(s.steps[i - 1]!.line)
    expect(s.steps.every(x => x.context === null && x.provenance === null)).toBe(true)
  })
  it('tool latency is observed or null, never negative-by-guess', () => {
    const run = importClaudeCodeDir(resolve('fixtures/real/session-minimal.jsonl'))
    const tools = buildRunView(run, runHealth(run)).spine.steps.flatMap(x => x.tools)
    expect(tools.length).toBeGreaterThan(0)
    for (const t of tools) expect(t.resultLine === null ? t.edge === null : t.edge === 'observed').toBe(true)
  })
  it('firstDivergence', async () => {
    const { firstDivergence } = await import('../packages/assay-core/src/view/spine.js')
    expect(firstDivergence(['Read', 'Edit'], ['Read', 'Edit'])).toBeNull()
    expect(firstDivergence(['Read', 'Edit'], ['Read', 'Bash'])).toBe(1)
    expect(firstDivergence(['Read'], ['Read', 'Bash'])).toBe(1)
  })
})
