import { existsSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { importClaudeCodeDir, runHealth } from '../packages/assay-core/src/index.js'
import { canonicalHash } from '../packages/assay-core/src/importers/claude-code-jsonl/requests.js'

// Scripted chain with one of each outcome: r1, r2 sealed; r3 unresolved (its
// m3 blob was tampered with, m4 never written); r4 broken; r5 no shape.
// r1 starts with string content, so it seals only if the digest is taken in
// block form (the rule that fixed 19 broken seals on real data).
const REQ = resolve('fixtures/scripted/requests/sc-req.jsonl')

describe('request records (ADR-026)', () => {
  const run = importClaudeCodeDir(REQ, { truth: 'scripted' })
  const seals = Object.fromEntries(run.requests!.records.map(r => [r.id, r.seal]))

  it('seals a request only when the rebuilt body hashes to its digest', () => {
    expect(seals).toEqual({ r1: 'sealed', r2: 'sealed', r3: 'unresolved', r4: 'broken', r5: 'no-shape' })
  })

  it('never rebuilds from a blob whose content fails its own hash', () => {
    expect(run.requests!.blobsFailed).toHaveLength(1)
    const r3 = run.requests!.records.find(r => r.id === 'r3')!
    expect(r3.missingMessages).toBe(2)
    expect(r3.tail.map(t => t.blob === null)).toEqual([true, true])
  })

  it('keeps every request-record line, marked parsed, with its offset', () => {
    const lines = run.unknowns.filter(u => u.parsedAs === 'request-record')
    expect(lines).toHaveLength(10) // 1 shape, 4 blobs, 5 requests
    expect(run.requests!.records[0]!.offset.line).toBeGreaterThan(0)
  })

  it('counts request-record lines as parsed, not unparsed', () => {
    const v = runHealth(run).validity.importerCoverage
    expect(v.unknownLines).toBe(0)
    expect(v.unparsedTelemetryRatio).toBe(0)
  })

  it('hashes sorted-key JSON, so key order does not matter', () => {
    expect(canonicalHash({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonicalHash({ a: [{ c: 3, d: 2 }], b: 1 }))
  })

  it('leaves runs without records alone', () => {
    expect(importClaudeCodeDir(resolve('fixtures/scripted/catalogue.jsonl')).requests).toBeUndefined()
  })
})

// Real-data checks run only where the local corpus exists (Rule 8: it is never
// in the repo). They pin what was verified by hand on 2026-11-02.
const REAL = resolve('corpus/frozen/E--assay/ef76e3fc-3d50-4f52-b5c6-00596db08ce6.jsonl')
describe.skipIf(!existsSync(REAL))('request records on a real 2.1.316 session (local corpus)', () => {
  it('verifies every blob and shape, and seals what it can rebuild', () => {
    const q = importClaudeCodeDir(REAL).requests!
    expect(q.blobsFailed).toHaveLength(0)
    expect(q.shapesFailed).toHaveLength(0)
    expect(q.records.filter(r => r.seal === 'broken')).toHaveLength(0)
    expect(q.records.filter(r => r.seal === 'sealed')).toHaveLength(2)
  })
})
