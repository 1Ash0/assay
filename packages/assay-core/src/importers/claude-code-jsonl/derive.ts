import {
  Agent,
  Compaction,
  Edge,
  LlmRequest,
  Message,
  Skill,
  ToolCall,
  ToolResult,
  Usage,
} from '../../schema/entities.js'
import { Event } from '../../schema/event.js'
import { Offset } from '../../schema/offset.js'

interface DerivedEntities {
  messages: Message[]
  toolCalls: ToolCall[]
  toolResults: ToolResult[]
  llmRequests: LlmRequest[]
  agents: Agent[]
  compactions: Compaction[]
  skills: Skill[]
  edges: Edge[]
}

export function deriveEntities(events: Event[]): DerivedEntities {
  const toolCalls: ToolCall[] = []
  const toolResults: ToolResult[] = []
  // D2: dedupe by message.id — same id = same API call, keep first occurrence only
  const messagesByMsgId = new Map<string, Message>()
  const llmRequestsByMsgId = new Map<string, LlmRequest>()
  const agents = new Map<string, Agent>()
  const compactions: Compaction[] = []
  const skills: Skill[] = []
  const edges: Edge[] = []

  // turnIndex counts deduplicated assistant messages only
  let turnIndex = 0
  const seenMsgIds = new Set<string>()
  const seenToolIds = new Set<string>() // dedup tool_use across thinking-first duplicates

  for (const ev of events) {
    const obj = ev.raw
    const evOffset = ev.offset

    if (ev.kind === 'summary') {
      // Compaction boundary — extract summarizedTurnPromptUuids if present (v2.1.308+)
      const summarizedUuids = obj['summarizedTurnPromptUuids']
      compactions.push({
        evidence: [evOffset],
        turnIndex,
        summaryOffset: evOffset,
        summarizedTurnUuids: Array.isArray(summarizedUuids)
          ? summarizedUuids.filter((u): u is string => typeof u === 'string')
          : undefined,
      })
      continue
    }

    // system/hook/otel-span events are kept in run.events for losslessness
    // but produce no derived entity — they're not conversation turns.
    if (ev.kind !== 'user' && ev.kind !== 'assistant') continue

    // Sidechain events are subagent turns (ADR-024). They used to be skipped,
    // which dropped every subagent file's usage from all totals. They are now
    // derived like any other event; message.id dedup keeps an inline copy and
    // its subagent-file copy from counting twice.
    const sidechain = obj['isSidechain'] === true

    const messageId = typeof obj['message'] === 'object' && obj['message'] !== null
      ? (obj['message'] as Record<string, unknown>)['id'] as string | undefined
      : undefined

    const msgId = messageId ?? ev.id

    // Dedupe messages by msgId — D2 duplicates have the same message.id
    if (!messagesByMsgId.has(msgId)) {
      messagesByMsgId.set(msgId, {
        evidence: [evOffset],
        id: msgId,
        role: ev.kind,
        agentId: ev.agentId,
        sessionId: ev.sessionId,
        parentId: ev.parentId,
        ts: ev.ts,
      })

      // parentId edge: parent→child (causal direction)
      if (ev.parentId) {
        edges.push({ kind: 'observed', fromId: ev.parentId, toId: msgId, evidence: [evOffset] })
      }
    }

    if (ev.kind === 'assistant') {
      const msg = typeof obj['message'] === 'object' && obj['message'] !== null
        ? (obj['message'] as Record<string, unknown>)
        : null

      if (msg) {
        // LlmRequest — canonicalize to max-usage occurrence across ALL duplicates.
        // Streaming duplicates write partial outputTokens first, then a final line with
        // complete counts. Cross-session copies sometimes have zeroed usage.
        // Taking the maximum picks the most complete record in both cases.
        // Ties go to first occurrence (stable for identical duplicates).
        const usage = extractUsage(msg)
        if (usage) {
          const existing = llmRequestsByMsgId.get(msgId)
          const existingTotal = existing
            ? existing.usage.inputTokens + existing.usage.outputTokens
            : -1
          const newTotal = usage.inputTokens + usage.outputTokens
          if (newTotal > existingTotal) {
            llmRequestsByMsgId.set(msgId, {
              evidence: [evOffset],
              messageId: msgId,
              usage,
              requestRef: typeof obj['requestId'] === 'string' ? obj['requestId'] : undefined,
            })
          }
        }
      }
    }

    // turnIndex counts main-chain turns only, so compaction positions are unchanged.
    if (ev.kind === 'assistant' && !seenMsgIds.has(msgId)) {
      seenMsgIds.add(msgId)
      if (!sidechain) turnIndex++
    }

    // ToolCalls: collect from ALL occurrences of a message.id.
    // Rationale: v2.1.299+ emits two lines per turn with the same message.id —
    // first has thinking content only, second has tool_use blocks. Restricting to
    // first-occurrence would silently drop all tool_uses for those sessions (B10).
    // tool_use ids are globally unique (toolu_...) so collecting across occurrences
    // is safe — seenToolIds guards against re-adding a tool_use already seen.
    if (ev.kind === 'assistant') {
      const msg = typeof obj['message'] === 'object' && obj['message'] !== null
        ? (obj['message'] as Record<string, unknown>)
        : null

      if (msg) {
        // ToolCalls from content array — all occurrences, deduped by tool id
        const content = msg['content']
        if (Array.isArray(content)) {
          for (const block of content) {
            if (
              typeof block === 'object' &&
              block !== null &&
              (block as Record<string, unknown>)['type'] === 'tool_use'
            ) {
              const b = block as Record<string, unknown>
              const toolId = typeof b['id'] === 'string' ? b['id'] : `tool:${ev.id}`
              if (seenToolIds.has(toolId)) continue
              seenToolIds.add(toolId)
              toolCalls.push({
                evidence: [evOffset],
                id: toolId,
                name: typeof b['name'] === 'string' ? b['name'] : 'unknown',
                messageId: msgId,
                agentId: ev.agentId,
              })
              edges.push({ kind: 'observed', fromId: msgId, toId: toolId, evidence: [evOffset] })

              // Skill detection
              if (typeof b['name'] === 'string' && b['name'] === 'Skill') {
                const input = b['input'] as Record<string, unknown> | undefined
                const skillName = input && typeof input['skill'] === 'string' ? input['skill'] : 'unknown'
                skills.push({
                  evidence: [evOffset],
                  name: skillName,
                  trigger: msgId,
                })
              }
            }
          }
        }
      }
    }

    if (ev.kind === 'user') {
      // ToolResults from content array — skip if this user msgId was already processed
      if (!seenMsgIds.has(msgId)) {
        seenMsgIds.add(msgId)
        const msg = typeof obj['message'] === 'object' && obj['message'] !== null
          ? (obj['message'] as Record<string, unknown>)
          : null
        const content = msg?.['content']
        if (Array.isArray(content)) {
          for (const block of content) {
            if (
              typeof block === 'object' &&
              block !== null &&
              (block as Record<string, unknown>)['type'] === 'tool_result'
            ) {
              const b = block as Record<string, unknown>
              const toolUseId = typeof b['tool_use_id'] === 'string' ? b['tool_use_id'] : ''
              if (!toolUseId) continue
              toolResults.push({
                evidence: [evOffset],
                toolUseId,
                messageId: msgId,
                isError: b['is_error'] === true,
              })
              edges.push({ kind: 'observed', fromId: msgId, toId: toolUseId, evidence: [evOffset] })
            }
          }
        }
      }

      // A parent records the subagent it ran in toolUseResult.agentId (observed
      // reference). This is what lets D1 see a subagent whose file is missing.
      const tur = obj['toolUseResult'] as Record<string, unknown> | undefined
      const refId = tur && typeof tur['agentId'] === 'string' ? tur['agentId'] : undefined
      if (refId && !agents.has(refId)) {
        agents.set(refId, { evidence: [evOffset], agentId: refId, parentAgentId: ev.agentId, type: 'subagent' })
      }

      // Agent references from agentId field
      if (ev.agentId && !agents.has(ev.agentId)) {
        agents.set(ev.agentId, {
          evidence: [evOffset],
          agentId: ev.agentId,
          parentAgentId: undefined,
          type: 'subagent',
        })
      }
    }
  }

  return {
    messages: Array.from(messagesByMsgId.values()),
    toolCalls,
    toolResults,
    llmRequests: Array.from(llmRequestsByMsgId.values()),
    agents: Array.from(agents.values()),
    compactions,
    skills,
    edges,
  }
}

function extractUsage(msg: Record<string, unknown>): Usage | null {
  const u = msg['usage']
  if (typeof u !== 'object' || u === null) return null
  const usage = u as Record<string, unknown>
  return {
    inputTokens: num(usage['input_tokens']),
    outputTokens: num(usage['output_tokens']),
    cacheReadTokens: num(usage['cache_read_input_tokens']),
    cacheWriteTokens: num(usage['cache_creation_input_tokens']),
  }
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0
}
