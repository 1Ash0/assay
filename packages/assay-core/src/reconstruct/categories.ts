// Context categories for a sealed request (M4_PLAN §3.4, ADR-032). Every block of
// the request body gets one category by an exact rule: where it sits (system,
// tools, an assistant message, a tool result) or a literal opening taken from
// real attachments on the R2 dev sessions. A block no rule claims is
// `uncategorised`, and its share is reported, not hidden.
//
// Two categories cannot be separated at this level, and say so rather than
// read as zero: Memory (MEMORY.md is sent inside the same block as CLAUDE.md)
// and Rules (no rules block was seen in the corpus).

export const CATEGORIES = [
  'System', 'CLAUDE.md', 'Memory', 'Skills', 'MCP', 'Rules', 'You', 'Files', 'Output', 'Claude', 'Hooks', 'uncategorised',
] as const
export type Category = (typeof CATEGORIES)[number]

export const NOT_SEPARABLE: Partial<Record<Category, string>> = {
  Memory: 'sent inside the CLAUDE.md instructions block; counted there',
  Rules: 'no rules block seen in the corpus; no marker',
}

// Openings after an optional "<system-reminder>\n", from real attachments.
const MARKERS: [string, Category][] = [
  ['Codebase and user instructions are shown below', 'CLAUDE.md'],
  ['Instruction files were re-read', 'CLAUDE.md'],
  ['The following skills are available', 'Skills'],
  ['The following skills were invoked', 'Skills'],
  ['# MCP Server Instructions', 'MCP'],
  ['The following MCP servers', 'MCP'],
  ['The following deferred tools', 'MCP'],
  ['The following tools just became available', 'MCP'],
  ['SessionStart hook additional context', 'Hooks'],
  ['PostToolUse:', 'Hooks'],
  ['PreToolUse:', 'Hooks'],
  ['Called the Read tool with the following input', 'Files'],
  ['Result of calling the Read tool', 'Files'],
  ['# Environment', 'System'],
  ["Today's date is", 'System'],
  ['The date has changed', 'System'],
  ['You are powered by the model named', 'System'],
  ['## Auto Mode Active', 'System'],
  ['<total_tokens>', 'System'],
  ['The task tools haven', 'System'],
  ["The user hasn't heard from you", 'System'],
  ['Attribution for git commits', 'System'],
  ["As you answer the user's questions", 'System'],
  ['Available agent types for the Agent tool', 'System'],
  ['[SYSTEM NOTIFICATION', 'System'],
  ['<artifact-view-context', 'System'],
  // The compaction summary is model-written history carried forward.
  ['This session is being continued from a previous conversation', 'Claude'],
  // A slash command or skill invocation, and the skill text it loads.
  ['<command-message>', 'Skills'],
  ['<command-name>', 'Skills'],
  ['Base directory for this skill', 'Skills'],
]
// Known residual: a skill body with no standard opening (one seen on the dev
// set, "## Page contract …") still lands in You. A user-role block is You
// only by exclusion, so You is an upper bound on the user's own text.
// Deferred-tool counts ("12 deferred tools are available again ...").
const DEFERRED = /^\d+ deferred tools? (are|is) /

export function categoryOfText(text: string, role: 'user' | 'system'): Category {
  const t = text.startsWith('<system-reminder>\n') ? text.slice('<system-reminder>\n'.length) : text
  for (const [m, c] of MARKERS) if (t.startsWith(m)) return c
  if (DEFERRED.test(t)) return 'MCP'
  if (/^`\/[\w:-]+` was invoked/.test(t)) return 'Skills'
  if (/^Note: .* (was read before|changed on disk)/.test(t)) return 'Files'
  // A user's own text: a user-role block that is not an injected reminder.
  if (role === 'user' && !text.startsWith('<system-reminder>')) return 'You'
  return 'uncategorised'
}

type Block = Record<string, unknown>
export interface Part { category: Category; chars: number; blocks: number }

const size = (v: unknown) => JSON.stringify(v).length

// Composition of a whole request body. `toolNames` maps tool_use ids to tool
// names (from the body's own assistant blocks), so a Read result is Files.
export function compose(system: unknown, tools: unknown, messages: Block[]): Part[] {
  const acc = new Map<Category, Part>()
  const add = (c: Category, v: unknown) => {
    const p = acc.get(c) ?? { category: c, chars: 0, blocks: 0 }
    p.chars += size(v); p.blocks++; acc.set(c, p)
  }
  for (const b of Array.isArray(system) ? (system as Block[]) : []) {
    add(typeof b['text'] === 'string' && categoryOfText(b['text'] as string, 'system') !== 'uncategorised' ? categoryOfText(b['text'] as string, 'system') : 'System', b)
  }
  for (const t of Array.isArray(tools) ? (tools as Block[]) : []) add(String(t['name'] ?? '').startsWith('mcp__') ? 'MCP' : 'System', t)
  for (const p of messageParts(messages)) {
    const q = acc.get(p.category) ?? { category: p.category, chars: 0, blocks: 0 }
    q.chars += p.chars; q.blocks += p.blocks; acc.set(p.category, q)
  }
  return CATEGORIES.filter(c => acc.has(c)).map(c => acc.get(c)!)
}

export function messageParts(messages: Block[], toolNames = toolNamesOf(messages)): Part[] {
  const out: Part[] = []
  for (const m of messages) {
    const role = m['role']
    const content = Array.isArray(m['content']) ? (m['content'] as Block[]) : [{ type: 'text', text: m['content'] }]
    for (const b of content) {
      let c: Category
      if (role === 'assistant') c = 'Claude'
      else if (b['type'] === 'tool_result') c = toolNames.get(String(b['tool_use_id'])) === 'Read' ? 'Files' : 'Output'
      else if (b['type'] === 'tool_addition') c = String((b['tool'] as Block | undefined)?.['name'] ?? (((b['tool'] as Block | undefined)?.['definition'] as Block | undefined)?.['name']) ?? '').startsWith('mcp__') ? 'MCP' : 'System'
      else if (b['type'] === 'text' && typeof b['text'] === 'string') c = categoryOfText(b['text'] as string, role === 'system' ? 'system' : 'user')
      else if (b['type'] === 'image') c = role === 'user' ? 'You' : 'uncategorised'
      else c = 'uncategorised'
      out.push({ category: c, chars: size(b), blocks: 1 })
    }
  }
  return out
}

function toolNamesOf(messages: Block[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const m of messages) {
    if (m['role'] !== 'assistant' || !Array.isArray(m['content'])) continue
    for (const b of m['content'] as Block[]) if (b['type'] === 'tool_use') names.set(String(b['id']), String(b['name']))
  }
  return names
}
