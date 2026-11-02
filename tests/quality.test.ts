import { describe, expect, it } from 'vitest'
import { importFromFiles, runHealth } from '../packages/assay-core/src/index.js'

// Scripted (truth: scripted): one of each counted case, in memory.
const enc = new TextEncoder()
const file = (path: string, lines: object[]) => ({ path, bytes: enc.encode(lines.map(l => JSON.stringify(l)).join('\n') + '\n') })
const S = 'sess-q'
const msg = (role: string, id?: string) => ({ role, content: [{ type: 'text', text: 'x' }], ...(id ? { id, usage: { input_tokens: 1, output_tokens: 1 } } : {}) })
const main = file(`${S}.jsonl`, [
  { type: 'user', uuid: 'a', parentUuid: null, sessionId: S, timestamp: '2026-11-02T10:00:00.000Z', version: '2.1.309', message: msg('user') },
  { type: 'attachment', uuid: 'att', parentUuid: 'a', sessionId: S, timestamp: '2026-11-02T10:00:01.000Z' },
  { type: 'assistant', uuid: 'b', parentUuid: 'att', sessionId: S, requestId: 'req_1', timestamp: '2026-11-02T10:00:02.000Z', message: msg('assistant', 'm1') },
  // child timestamped before its parent
  { type: 'user', uuid: 'c', parentUuid: 'b', sessionId: S, timestamp: '2026-11-02T10:00:01.500Z', message: msg('user') },
  // the same record written again
  { type: 'user', uuid: 'c', parentUuid: 'b', sessionId: S, timestamp: '2026-11-02T10:00:01.500Z', message: msg('user') },
  // parent never written
  { type: 'user', uuid: 'd', parentUuid: 'gone', sessionId: S, timestamp: '2026-11-02T10:00:03.000Z', message: msg('user') },
  // another session's id inside this file
  { type: 'user', uuid: 'e', parentUuid: 'd', sessionId: 'other', timestamp: '2026-11-02T10:00:04.000Z', message: msg('user') },
  { type: 'brand-new-type', uuid: 'f' },
])
const sub = file(`${S}/subagents/agent-x.jsonl`, [
  // subagent lines carry the parent's session id: not a mismatch
  { type: 'assistant', uuid: 's1', parentUuid: null, sessionId: S, isSidechain: true, agentId: 'x', requestId: 'req_1', timestamp: '2026-11-02T10:00:05.000Z', message: msg('assistant', 'm2') },
])

describe('capture-quality counters', () => {
  const q = runHealth(importFromFiles([main, sub], { truth: 'scripted' }, true)).validity.captureQuality

  it('counts each case once, with its offset', () => {
    expect(q.duplicateUuids.count).toBe(1)
    expect(q.duplicateUuids.first[0]!.line).toBe(4) // offsets are 0-based
    expect(q.timestampBeforeParent.count).toBe(2) // line 4 and its rewrite on line 5
    expect(q.orphanParents.count).toBe(1)
    expect(q.orphanParents.first[0]!.line).toBe(5)
    expect(q.sessionIdMismatch.count).toBe(1)
    expect(q.duplicateRequestIdAcrossFiles.count).toBe(1)
  })

  it('treats a parent kept as an unknown line as present', () => {
    // `b`'s parent is the attachment line, which the importer keeps as unknown.
    expect(q.orphanParents.first.map(o => o.line)).not.toContain(2)
  })

  it('counts uncatalogued record types by name, and says how each counter can mislead', () => {
    expect(q.unknownRecordTypes.types).toEqual({ 'unknown-type:brand-new-type': 1 })
    expect(q.duplicateUuids.falsePositive.length).toBeGreaterThan(0)
  })
})
