import { describe, expect, it } from 'vitest'
import { categoryOfText, compose, NOT_SEPARABLE } from '../packages/assay-core/src/reconstruct/categories.js'
import { attributeTokens } from '../packages/assay-core/src/reconstruct/tokens.js'
import { Run } from '../packages/assay-core/src/index.js'

describe('context categories (ADR-032)', () => {
  it('classifies injected blocks by their literal opening, and the user only by exclusion', () => {
    expect(categoryOfText('<system-reminder>\nCodebase and user instructions are shown below.', 'user')).toBe('CLAUDE.md')
    expect(categoryOfText('<system-reminder>\nThe following skills are available for use', 'user')).toBe('Skills')
    expect(categoryOfText('<system-reminder>\nSessionStart hook additional context: x', 'user')).toBe('Hooks')
    expect(categoryOfText('This session is being continued from a previous conversation that ran out', 'user')).toBe('Claude')
    expect(categoryOfText('please fix the bug', 'user')).toBe('You')
    expect(categoryOfText('<system-reminder>\nsomething new', 'user')).toBe('uncategorised')
  })

  it('places tool results by the tool that produced them, and MCP tools by name', () => {
    const parts = compose(
      [{ type: 'text', text: 'You are Claude Code' }],
      [{ name: 'Read' }, { name: 'mcp__x__y' }],
      [
        { role: 'assistant', content: [{ type: 'tool_use', id: 't1', name: 'Read' }, { type: 'tool_use', id: 't2', name: 'Bash' }] },
        { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'file' }, { type: 'tool_result', tool_use_id: 't2', content: 'out' }] },
      ],
    )
    expect(parts.map(p => [p.category, p.blocks])).toEqual([['System', 2], ['MCP', 1], ['Files', 1], ['Output', 1], ['Claude', 2]])
  })

  it('says which categories cannot be separated instead of reporting zero', () => {
    expect(Object.keys(NOT_SEPARABLE).sort()).toEqual(['Memory', 'Rules'])
  })
})

describe('token attribution by usage deltas', () => {
  // Scripted run: r1 (first), r2 appends one category, r3 appends two, r4 drops a message.
  const rec = (id: string, base: string | null, keep: number, messageCount: number, tail: [string, number][]) => ({
    id, base, keep, messageCount, shapeHash: 's', seal: 'sealed',
    composition: [{ category: 'System', chars: 300, blocks: 1 }, { category: 'You', chars: 100, blocks: 1 }],
    tailComposition: tail.map(([category, chars]) => ({ category, chars, blocks: 1 })),
  })
  const ev = (ref: string, mid: string) => ({ kind: 'assistant', raw: { requestRef: ref, message: { id: mid } } })
  const use = (mid: string, total: number) => ({ messageId: mid, usage: { inputTokens: total, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 } })
  const run = {
    requests: { records: [rec('r1', null, 0, 1, []), rec('r2', 'r1', 1, 2, [['Claude', 50]]), rec('r3', 'r2', 2, 4, [['Claude', 50], ['Output', 150]]), rec('r4', 'r3', 1, 2, [['You', 10]])] },
    events: [ev('r1', 'm1'), ev('r2', 'm2'), ev('r3', 'm3'), ev('r4', 'm4')],
    llmRequests: [use('m1', 1000), use('m2', 1100), use('m3', 1300), use('m4', 900)],
  } as unknown as Run
  const t = new Map(attributeTokens(run).map(x => [x.recordId, x]))
  const part = (id: string, c: string) => t.get(id)!.parts.find(p => p.category === c)!

  it('splits the first request by characters, as inferred', () => {
    expect(part('r1', 'System')).toEqual({ category: 'System', measured: 0, inferred: 750 })
    expect(t.get('r1')!.deltaMeasured).toBe(0)
  })

  it('measures a single-category addition exactly', () => {
    expect(part('r2', 'Claude')).toEqual({ category: 'Claude', measured: 100, inferred: 0 })
    expect(t.get('r2')!.deltaMeasured).toBe(100)
  })

  it('measures a mixed addition as a whole but splits it by characters', () => {
    expect(part('r3', 'Output').inferred).toBe(150)
    expect(t.get('r3')!.deltaMeasured).toBe(300)
  })

  it('falls back to a characters split when the chain dropped messages', () => {
    expect(t.get('r4')!.deltaMeasured).toBe(0)
    expect(t.get('r4')!.parts.every(p => p.measured === 0)).toBe(true)
  })
})
