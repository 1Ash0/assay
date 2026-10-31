import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { importClaudeCodeDir, runHealth } from '../packages/assay-core/src/index.js'

const FIXTURE = resolve('fixtures/real/session-minimal.jsonl')

describe('claude-code-jsonl importer', () => {
  it('parses events without dropping lines', () => {
    const run = importClaudeCodeDir(FIXTURE)
    // 9 known-type lines (incl. system) + 2 unknown (mode, queue-operation) = 11 total non-empty lines
    expect(run.events.length + run.unknowns.length).toBe(11)
  })

  it('surfaces unknown types', () => {
    const run = importClaudeCodeDir(FIXTURE)
    expect(run.unknowns.length).toBe(2)
    const reasons = run.unknowns.map(u => u.reason)
    expect(reasons).toContain('unknown-type:mode')
    expect(reasons).toContain('unknown-type:queue-operation')
  })

  it('parses system events as events (not unknowns)', () => {
    const run = importClaudeCodeDir(FIXTURE)
    const sysEvents = run.events.filter(e => e.kind === 'system')
    expect(sysEvents.length).toBe(1)
    expect(sysEvents[0]?.id).toBe('sys1')
    // system events produce no Message entity
    const sysMsgs = run.messages.filter(m => m.id === 'msg_sys1')
    expect(sysMsgs.length).toBe(0)
  })

  it('detects version from assistant line', () => {
    const run = importClaudeCodeDir(FIXTURE)
    expect(run.harness.version).toBe('2.1.181')
  })

  it('deduplicates LlmRequests by message.id (D2)', () => {
    const run = importClaudeCodeDir(FIXTURE)
    // msg_a2 appears twice in events; should yield only one LlmRequest
    const a2Requests = run.llmRequests.filter(r => r.messageId === 'msg_a2')
    expect(a2Requests.length).toBe(1)
  })

  it('deduplicates Messages by message.id (D2)', () => {
    const run = importClaudeCodeDir(FIXTURE)
    // msg_a2 appears twice in events; should yield only one Message
    const a2Messages = run.messages.filter(m => m.id === 'msg_a2')
    expect(a2Messages.length).toBe(1)
  })

  it('links tool_use to tool_result via edge', () => {
    const run = importClaudeCodeDir(FIXTURE)
    const toolCall = run.toolCalls.find(c => c.id === 'tool_1')
    const toolResult = run.toolResults.find(r => r.toolUseId === 'tool_1')
    expect(toolCall).toBeDefined()
    expect(toolResult).toBeDefined()
    expect(toolResult?.isError).toBe(false)
  })

  it('records compaction event', () => {
    const run = importClaudeCodeDir(FIXTURE)
    expect(run.compactions.length).toBe(1)
  })

  it('round-trip: parsed lines <= total source lines across all files (lossless)', () => {
    const run = importClaudeCodeDir(FIXTURE)
    const totalSrcLines = run.sources.reduce((a, s) => a + s.lines, 0)
    // parsed = events + unknowns (blank lines skipped, so always <= total)
    expect(run.events.length + run.unknowns.length).toBeLessThanOrEqual(totalSrcLines)
  })

  it('all events carry valid offsets', () => {
    const run = importClaudeCodeDir(FIXTURE)
    for (const ev of run.events) {
      expect(ev.offset.byteStart).toBeGreaterThanOrEqual(0)
      expect(ev.offset.byteEnd).toBeGreaterThan(ev.offset.byteStart)
    }
  })
})

describe('Health detectors', () => {
  it('D2 fires for double-counted message', () => {
    const run = importClaudeCodeDir(FIXTURE)
    const report = runHealth(run)
    const d2 = report.findings.filter(f => f.detectorId === 'D2')
    expect(d2.length).toBeGreaterThan(0)
  })

  it('D3 fires for broken parent chain', () => {
    const run = importClaudeCodeDir(FIXTURE)
    const report = runHealth(run)
    const d3 = report.findings.filter(f => f.detectorId === 'D3')
    expect(d3.length).toBeGreaterThan(0)
    expect(d3[0]?.message).toContain('missing-parent-uuid')
  })

  it('overall is not trustworthy when findings present', () => {
    const run = importClaudeCodeDir(FIXTURE)
    const report = runHealth(run)
    expect(report.overall).not.toBe('trustworthy')
  })
})
