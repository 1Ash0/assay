import { describe, expect, it } from 'vitest'
import { importFromFiles, runHealth } from '../packages/assay-core/src/index.js'

// Scripted: three assistant turns name request records by `requestRef`; one
// names a record that was never written, and one record is named by nothing.
const enc = new TextEncoder()
const S = 'sess-links'
const asst = (uuid: string, id: string, ref: string, line: number) => ({
  type: 'assistant', uuid, sessionId: S, version: '2.1.309', requestId: `req_${line}`, requestRef: ref,
  timestamp: `2026-11-02T10:00:0${line}.000Z`,
  message: { id, role: 'assistant', content: [{ type: 'text', text: 'x' }], usage: { input_tokens: 1, output_tokens: 1 } },
})
const rec = (id: string) => ({ type: 'api-request', id, sessionId: S, version: '2.1.309', shapeHash: 'none', params: {}, keep: 0, tail: [], requestDigest: '0' })
const lines = [rec('r1'), asst('a1', 'm1', 'r1', 1), rec('r2'), asst('a2', 'm2', 'r2', 2), asst('a3', 'm3', 'never-written', 3), rec('r-orphan')]
const run = importFromFiles([{ path: `${S}.jsonl`, bytes: enc.encode(lines.map(l => JSON.stringify(l)).join('\n') + '\n') }], { truth: 'scripted' })

describe('D10 joins transcript requests to request records by requestRef', () => {
  const report = runHealth(run)

  it('counts linked, missing and unnamed records on the card', () => {
    expect(report.validity.requests).toMatchObject({ requestsWithRef: 3, linked: 2, refWithoutRecord: 1, recordWithoutRef: 1 })
  })

  it('points at the transcript line whose record was never written', () => {
    const d10 = report.findings.filter(f => f.detectorId === 'D10')
    expect(d10).toHaveLength(1)
    expect(d10[0]!.evidence.map(o => o.line)).toEqual([4]) // 0-based
  })
})
