import { Offset } from '../schema/index.js'

// Rebuilding request messages from ordinary transcript lines (R2, ADR-031).
// Each rule turns transcript lines into a candidate API message. A candidate is
// used only when its hash equals a hash some request record names, so a rule
// that builds the wrong thing produces nothing: there is no "close enough".
// The rules were developed on the R2 dev sessions only
// (docs/experiments/R2-reconstruction-v1.md) and frozen before the held-out
// score. Changing them after that is a new preregistration.
//
// What the client does to a user turn before sending it, as found on the dev
// sessions (each step is a variant, since not every version does every step):
// - tool results answering one assistant turn are written as separate lines
//   but sent as one message;
// - string tool-result content is trimmed;
// - attachments rendered with role `system` after the results (token budget,
//   task reminders) are appended: to a string result after "\n\n", to an
//   array result as text blocks;
// - attachments rendered with role `user` follow as text blocks.

export interface Line {
  offset: Offset
  raw: Record<string, unknown>
}

export interface Candidate {
  message: Record<string, unknown>
  rule: string
  // The transcript lines the candidate was built from.
  from: Offset[]
}

type Block = Record<string, unknown>
const blocksOf = (content: unknown): Block[] =>
  Array.isArray(content) ? (content as Block[]) : [{ type: 'text', text: content }]
const msgOf = (l: Line) => l.raw['message'] as Record<string, unknown> | undefined
const rendered = (l: Line): string[] =>
  Array.isArray(l.raw['rendered']) ? (l.raw['rendered'] as { content?: unknown }[]).map(r => r.content).filter((c): c is string => typeof c === 'string') : []
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

const noCaller = (blocks: Block[]) => blocks.map(b => {
  if (b['type'] !== 'tool_use' || !('caller' in b)) return b
  const { caller: _caller, ...rest } = b
  return rest
})

// `lines` are every parsed line of the session in file order (events and the
// attachment lines kept as unknowns), so rendered attachments sit where written.
export function candidates(lines: Line[]): Candidate[] {
  const out: Candidate[] = []

  // Assistant: a response is streamed as several lines sharing message.id.
  const groups = new Map<string, Line[]>()
  for (const l of lines) {
    if (l.raw['type'] !== 'assistant') continue
    const id = msgOf(l)?.['id']
    if (typeof id !== 'string') continue
    const g = groups.get(id) ?? []
    g.push(l); groups.set(id, g)
  }
  for (const g of groups.values()) {
    const from = g.map(l => l.offset)
    const joined = g.flatMap(l => blocksOf(msgOf(l)!['content']))
    const wire = g.flatMap(l => {
      const inputs = l.raw['wireToolInputs'] as Record<string, unknown> | undefined
      return blocksOf(msgOf(l)!['content']).map(b =>
        b['type'] === 'tool_use' && inputs && typeof b['id'] === 'string' && b['id'] in inputs ? { ...b, input: inputs[b['id']] } : b)
    })
    out.push(
      { message: { role: 'assistant', content: joined }, rule: 'assistant-joined', from },
      { message: { role: 'assistant', content: wire }, rule: 'assistant-wire-inputs', from },
      { message: { role: 'assistant', content: noCaller(joined) }, rule: 'assistant-joined-no-caller', from },
      { message: { role: 'assistant', content: noCaller(wire) }, rule: 'assistant-wire-no-caller', from },
    )
  }

  // System messages: a system-role attachment can also be sent as its own
  // `system` message, without the <system-reminder> wrapper it is rendered in.
  for (const l of lines) {
    if (l.raw['type'] !== 'attachment' || l.raw['renderedRole'] !== 'system') continue
    for (const text of rendered(l)) {
      const bare = /^<system-reminder>\n([\s\S]*)\n<\/system-reminder>$/.exec(text)?.[1]
      out.push({ message: { role: 'system', content: text }, rule: 'system-attachment', from: [l.offset] })
      if (bare !== undefined) out.push({ message: { role: 'system', content: bare }, rule: 'system-attachment-unwrapped', from: [l.offset] })
    }
  }

  // User turns: everything between two assistant turns.
  let seg: Line[] = []
  const flush = () => {
    const users = seg.filter(l => l.raw['type'] === 'user' && msgOf(l))
    if (users.length > 0) userCandidates(users, seg, out)
    seg = []
  }
  for (const l of lines) {
    if (l.raw['type'] === 'assistant') flush()
    else seg.push(l)
  }
  flush()
  return out
}

function userCandidates(users: Line[], seg: Line[], out: Candidate[]) {
  const from = users.map(l => l.offset)
  const content = users.flatMap(l => blocksOf(msgOf(l)!['content']))
  out.push({ message: { role: 'user', content }, rule: 'user-joined', from })
  for (const l of users) out.push({ message: { role: 'user', content: blocksOf(msgOf(l)!['content']) }, rule: 'user-single', from: [l.offset] })

  // A human turn (no tool results): the rendered attachments of the turn come
  // first as text blocks, then the prompt, whatever order the lines were written in.
  if (!content.some(b => b['type'] === 'tool_result')) {
    const attLines = seg.filter(l => l.raw['type'] === 'attachment' && rendered(l).length)
    const texts = attLines.flatMap(rendered)
    if (texts.length) {
      for (const nl of [false, true]) {
        const blocks = texts.map(t => ({ type: 'text', text: nl ? `${t}\n` : t }))
        out.push({
          message: { role: 'user', content: [...blocks, ...clone(content)] },
          rule: `human-turn+attachments-first${nl ? '+nl' : ''}`,
          from: [...attLines.map(l => l.offset), ...from],
        })
      }
    }
  }

  const sysLines = seg.filter(l => l.raw['type'] === 'attachment' && l.raw['renderedRole'] === 'system' && rendered(l).length)
  const userLines = seg.filter(l => l.raw['type'] === 'attachment' && l.raw['renderedRole'] === 'user' && rendered(l).length)
  const sys = sysLines.flatMap(rendered), usr = userLines.flatMap(rendered)
  const withAtt = [...from, ...sysLines.map(l => l.offset)]
  for (const trim of [false, true]) for (const nl of [false, true]) for (const withUser of [false, true]) {
    if (!trim && !nl && !withUser && sys.length === 0) continue // same as user-joined
    const c = clone(content)
    if (trim) for (const b of c) if (b['type'] === 'tool_result' && typeof b['content'] === 'string') b['content'] = (b['content'] as string).trim()
    const last = [...c].reverse().find(b => b['type'] === 'tool_result')
    if (last && sys.length) {
      if (typeof last['content'] === 'string') last['content'] = `${last['content'] as string}\n\n${sys.join('\n\n')}`
      else if (Array.isArray(last['content'])) {
        const arr = last['content'] as Block[]
        const tb = [...arr].reverse().find(x => x['type'] === 'text')
        if (nl && tb) tb['text'] = `${tb['text'] as string}\n`
        arr.push(...sys.map(t => ({ type: 'text', text: t })))
      }
    }
    const extra = withUser ? usr.map(t => ({ type: 'text', text: t })) : []
    const rule = ['user-turn', trim && 'trim', nl && 'nl', sys.length && 'reminders', withUser && 'user-attachments'].filter(Boolean).join('+')
    out.push({ message: { role: 'user', content: [...c, ...extra] }, rule, from: withUser ? [...withAtt, ...userLines.map(l => l.offset)] : withAtt })
  }
}
