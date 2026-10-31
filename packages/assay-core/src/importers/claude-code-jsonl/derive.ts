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

  for (const ev of events) {
    const obj = ev.raw
    const evOffset = ev.offset

    if (ev.kind === 'summary') {
      // Compaction boundary
      compactions.push({
        evidence: [evOffset],
        turnIndex,
        summaryOffset: evOffset,
      })
      continue
    }

    if (ev.kind === 'user' || ev.kind === 'assistant') {
      // Skip sidechain events — they belong to subagent files
      if (obj['isSidechain'] === true) continue

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

      if (ev.kind === 'assistant' && !seenMsgIds.has(msgId)) {
        seenMsgIds.add(msgId)
        turnIndex++

        const msg = typeof obj['message'] === 'object' && obj['message'] !== null
          ? (obj['message'] as Record<string, unknown>)
          : null

        if (msg) {
          // LlmRequest — D2 dedupe by msgId
          const usage = extractUsage(msg)
          if (usage && !llmRequestsByMsgId.has(msgId)) {
            llmRequestsByMsgId.set(msgId, {
              evidence: [evOffset],
              messageId: msgId,
              usage,
              requestRef: typeof obj['requestId'] === 'string' ? obj['requestId'] : undefined,
            })
          }

          // ToolCalls from content array — outer guard already ensures first occurrence only
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
        // ToolResults from content array
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
              toolResults.push({
                evidence: [evOffset],
                toolUseId,
                messageId: msgId,
                isError: b['is_error'] === true,
              })
              if (toolUseId) {
                edges.push({ kind: 'observed', fromId: msgId, toId: toolUseId, evidence: [evOffset] })
              }
            }
          }
        }

        // Agent references from agentId field
        if (ev.agentId) {
          if (!agents.has(ev.agentId)) {
            agents.set(ev.agentId, {
              evidence: [evOffset],
              agentId: ev.agentId,
              parentAgentId: undefined,
              type: 'subagent',
            })
          }
        }
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
