import { Run } from '../schema/index.js'

// Tokens per context category for each sealed request (ADR-032). There is no
// tokenizer here, so tokens are only ever *measured* one way: when a request
// keeps every message of its base request and the same shape, the difference
// in total input (uncached + cache read + cache write) between the two is the
// exact token cost of what this request added. If what it added is one
// category, that count is measured for that category. Everything else (the
// first request, a tail mixing categories, a chain that dropped messages, a
// negative difference) is split by characters and labelled inferred.

export interface CategoryTokens { category: string; measured: number; inferred: number }
export interface RequestTokens {
  recordId: string
  messageId: string | null
  total: number
  parts: CategoryTokens[]
  // Tokens whose amount is measured by a usage delta, even where their split
  // across categories is by characters: the added part of each request in an
  // unbroken append chain. total - deltaMeasured came from a characters split
  // of a whole request (the first, or after a chain break).
  deltaMeasured: number
}

type Acc = Map<string, { measured: number; inferred: number }>

function split(acc: Acc, tokens: number, parts: { category: string; chars: number }[]) {
  const chars = parts.reduce((s, p) => s + p.chars, 0)
  if (chars === 0 || tokens <= 0) return
  for (const p of parts) {
    const e = acc.get(p.category) ?? { measured: 0, inferred: 0 }
    e.inferred += (tokens * p.chars) / chars
    acc.set(p.category, e)
  }
}

export function attributeTokens(run: Run): RequestTokens[] {
  const records = run.requests?.records ?? []
  // record id -> the LlmRequest whose assistant line names it (requestRef, D10)
  const msgByRecord = new Map<string, string>()
  for (const e of run.events) {
    if (e.kind !== 'assistant') continue
    const ref = (e.raw as Record<string, unknown>)['requestRef']
    const mid = ((e.raw as Record<string, unknown>)['message'] as Record<string, unknown> | undefined)?.['id']
    if (typeof ref === 'string' && typeof mid === 'string' && !msgByRecord.has(ref)) msgByRecord.set(ref, mid)
  }
  const usage = new Map(run.llmRequests.map(q => [q.messageId, q.usage]))
  const totalOf = (id: string) => {
    const u = usage.get(msgByRecord.get(id) ?? '')
    return u ? u.inputTokens + u.cacheReadTokens + u.cacheWriteTokens : null
  }

  const done = new Map<string, { acc: Acc; total: number; messageCount: number; shapeHash: string; deltaMeasured: number }>()
  const out: RequestTokens[] = []
  for (const r of records) {
    const total = totalOf(r.id)
    if (!r.composition || total === null) continue
    const b = r.base ? done.get(r.base) : undefined
    const acc: Acc = new Map()
    const delta = b ? total - b.total : -1
    let deltaMeasured = 0
    if (b && b.shapeHash === r.shapeHash && r.keep === b.messageCount && delta >= 0 && r.tailComposition) {
      for (const [c, e] of b.acc) acc.set(c, { ...e })
      deltaMeasured = b.deltaMeasured + delta
      const tail = r.tailComposition.filter(p => p.chars > 0)
      if (tail.length === 1) {
        const e = acc.get(tail[0]!.category) ?? { measured: 0, inferred: 0 }
        e.measured += delta
        acc.set(tail[0]!.category, e)
      } else split(acc, delta, tail)
    } else {
      split(acc, total, r.composition)
    }
    done.set(r.id, { acc, total, messageCount: r.messageCount, shapeHash: r.shapeHash, deltaMeasured })
    out.push({
      recordId: r.id,
      messageId: msgByRecord.get(r.id) ?? null,
      total,
      parts: [...acc.entries()].map(([category, e]) => ({ category, measured: Math.round(e.measured), inferred: Math.round(e.inferred) })),
      deltaMeasured,
    })
  }
  return out
}
