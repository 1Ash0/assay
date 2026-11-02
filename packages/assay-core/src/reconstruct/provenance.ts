// Provenance of tool-call literals (docs/experiments/P4-provenance-v1.md,
// ADR-033). For each literal in a tool call's input: the earliest exact
// occurrence in what the model had, or none. The claim is only "appeared
// earlier at X", a `matched` edge (Rule 5), never "came from X". A literal
// with no earlier occurrence is unsourced, which is a count, not an error.

export const MIN_LITERAL = 8
const PATH_LIKE = /(?:[A-Za-z]:[\\/]|\/)?(?:[\w.-]+[\\/])+[\w.-]+/g

// Literal extraction, fixed in the preregistration: string values of at least
// 8 characters with no newline, plus path-like tokens inside any string value.
// Pure numbers and `description` values are excluded.
export function extractLiterals(input: unknown): string[] {
  const out = new Set<string>()
  const walk = (v: unknown, key: string | null) => {
    if (typeof v === 'string') {
      if (key === 'description') return
      if (v.length >= MIN_LITERAL && !v.includes('\n') && !/^\d+(\.\d+)?$/.test(v)) out.add(v)
      for (const m of v.match(PATH_LIKE) ?? []) if (m.length >= MIN_LITERAL) out.add(m)
    } else if (Array.isArray(v)) v.forEach(x => walk(x, key))
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walk(x, k)
  }
  walk(input, null)
  return [...out]
}

export interface Where { part: 'system' | 'tools' | 'message'; index: number; block: number }
export interface LiteralProvenance { text: string; at: Where | null }

type Block = Record<string, unknown>

// Searchable text of a block: the strings a model reads, not JSON syntax.
function textOf(b: unknown): string {
  const parts: string[] = []
  const walk = (v: unknown) => {
    if (typeof v === 'string') parts.push(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(b)
  return parts.join('\n')
}

// Every literal against a request body, earliest position first.
export function locate(literals: string[], system: unknown, tools: unknown, messages: Block[]): LiteralProvenance[] {
  const segments: { where: Where; text: string }[] = []
  ;(Array.isArray(system) ? system : []).forEach((b, i) => segments.push({ where: { part: 'system', index: i, block: 0 }, text: textOf(b) }))
  ;(Array.isArray(tools) ? tools : []).forEach((t, i) => segments.push({ where: { part: 'tools', index: i, block: 0 }, text: textOf(t) }))
  messages.forEach((m, i) => {
    const content = Array.isArray(m['content']) ? (m['content'] as Block[]) : [{ type: 'text', text: m['content'] }]
    content.forEach((b, j) => segments.push({ where: { part: 'message', index: i, block: j }, text: textOf(b) }))
  })
  return literals.map(text => ({ text, at: segments.find(s => s.text.includes(text))?.where ?? null }))
}

export interface ToolProvenance {
  toolUseId: string
  // 'request': checked against the sealed request body the model received.
  // 'l1-lines': no sealed request, so checked against the transcript lines
  // written before the call; weaker, since injected context is not in them.
  source: 'request' | 'l1-lines'
  literals: LiteralProvenance[]
  line: number | null // for l1-lines: the 0-based line of the earliest occurrence
}

interface ToolUseAt { id: string; input: unknown; file: string; line: number }
interface TextAt { file: string; line: number; text: string }

// Fallback for tool calls whose request is not sealed: earliest occurrence in
// the text of transcript lines (events and rendered attachments) before the
// call, in the same file.
export function provenanceFromLines(calls: ToolUseAt[], texts: TextAt[]): ToolProvenance[] {
  const byFile = new Map<string, TextAt[]>()
  for (const t of texts) { const l = byFile.get(t.file) ?? []; l.push(t); byFile.set(t.file, l) }
  for (const l of byFile.values()) l.sort((a, b) => a.line - b.line)
  return calls.map(c => {
    const prior = (byFile.get(c.file) ?? []).filter(t => t.line < c.line)
    const literals = extractLiterals(c.input).map(text => {
      const hit = prior.find(t => t.text.includes(text))
      return { text, at: hit ? { part: 'message' as const, index: hit.line, block: 0 } : null }
    })
    const first = literals.find(l => l.at)?.at?.index ?? null
    return { toolUseId: c.id, source: 'l1-lines' as const, literals, line: first }
  })
}

export { textOf }
