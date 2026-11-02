import { describe, expect, it } from 'vitest'
import { candidates, Line } from '../packages/assay-core/src/reconstruct/rebuild.js'

// Scripted lines; each test checks one rule found on the R2 dev sessions.
const at = (line: number, raw: Record<string, unknown>): Line => ({ offset: { file: 's.jsonl', line, byteStart: 0, byteEnd: 0 }, raw })
const find = (lines: Line[], rule: string) => candidates(lines).find(c => c.rule === rule)

describe('rebuild rules', () => {
  it('joins streamed assistant lines and can use the re-sent tool inputs', () => {
    const lines = [
      at(0, { type: 'assistant', message: { id: 'm', content: [{ type: 'text', text: 'hi' }] } }),
      at(1, { type: 'assistant', message: { id: 'm', content: [{ type: 'tool_use', id: 't', name: 'Bash', input: { command: 'ls' } }] }, wireToolInputs: { t: { command: 'cd /x && ls' } } }),
    ]
    expect(find(lines, 'assistant-joined')!.message['content']).toHaveLength(2)
    const wire = find(lines, 'assistant-wire-inputs')!.message['content'] as { input?: unknown }[]
    expect(wire[1]!.input).toEqual({ command: 'cd /x && ls' })
    expect(find(lines, 'assistant-joined')!.from.map(o => o.line)).toEqual([0, 1])
  })

  it('appends system-role reminders to a string tool result, after a blank line', () => {
    const lines = [
      at(0, { type: 'assistant', message: { id: 'm', content: [] } }),
      at(1, { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: 'out' }] } }),
      at(2, { type: 'attachment', renderedRole: 'system', rendered: [{ content: '<system-reminder>\nR\n</system-reminder>' }] }),
    ]
    const c = find(lines, 'user-turn+reminders')!
    expect((c.message['content'] as { content: string }[])[0]!.content).toBe('out\n\n<system-reminder>\nR\n</system-reminder>')
    expect(c.from.map(o => o.line)).toEqual([1, 2])
  })

  it('puts a human turn\'s attachments before the prompt, whatever order they were written in', () => {
    const lines = [
      at(0, { type: 'user', message: { content: 'question' } }),
      at(1, { type: 'attachment', renderedRole: 'system', rendered: [{ content: 'ctx' }] }),
    ]
    const c = find(lines, 'human-turn+attachments-first+nl')!
    expect(c.message['content']).toEqual([{ type: 'text', text: 'ctx\n' }, { type: 'text', text: 'question' }])
  })

  it('offers a system-role attachment as its own system message, unwrapped', () => {
    const lines = [at(0, { type: 'attachment', renderedRole: 'system', rendered: [{ content: '<system-reminder>\nToday is X.\n</system-reminder>' }] })]
    expect(find(lines, 'system-attachment-unwrapped')!.message).toEqual({ role: 'system', content: 'Today is X.' })
  })
})
