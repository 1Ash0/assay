import { Run } from '../schema/index.js'
import { provenanceFromLines, textOf, ToolProvenance } from './provenance.js'

// Provenance for every tool call in a run (ADR-033): from the sealed request
// body where there is one, otherwise from the transcript lines before the call.
export function runProvenance(run: Run): Map<string, ToolProvenance> {
  const out = new Map<string, ToolProvenance>()
  for (const r of run.requests?.records ?? []) {
    for (const p of r.provenance ?? []) {
      const first = p.literals.find(l => l.at)
      out.set(p.toolUseId, { toolUseId: p.toolUseId, source: 'request', literals: p.literals, line: first ? r.offset.line : null })
    }
  }

  const calls: { id: string; input: unknown; file: string; line: number }[] = []
  const texts: { file: string; line: number; text: string }[] = []
  for (const e of run.events) {
    const content = (e.raw['message'] as Record<string, unknown> | undefined)?.['content']
    if (e.kind === 'assistant' && Array.isArray(content)) {
      for (const b of content as Record<string, unknown>[]) {
        if (b['type'] === 'tool_use' && !out.has(String(b['id']))) calls.push({ id: String(b['id']), input: b['input'], file: e.offset.file, line: e.offset.line })
      }
    }
    if (content !== undefined) texts.push({ file: e.offset.file, line: e.offset.line, text: textOf(content) })
  }
  for (const u of run.unknowns) {
    if (u.reason !== 'unknown-type:attachment') continue
    const rendered = (JSON.parse(u.raw) as Record<string, unknown>)['rendered']
    if (rendered) texts.push({ file: u.offset.file, line: u.offset.line, text: textOf(rendered) })
  }
  for (const p of provenanceFromLines(calls, texts)) out.set(p.toolUseId, p)
  return out
}
