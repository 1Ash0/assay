import { Agent, ContentFlags, Edge, Event, LlmRequest, Message, Run, ToolCall, ToolResult, Truth, UnknownLine } from '../../schema/index.js'
import { sha256Hex } from '../claude-code-jsonl/sha256.js'
import { spanOffsets } from './offsets.js'

// TRAIL importer (ADR-037): one TRAIL trace file (OpenInference spans from
// smolagents, as published by PatronusAI) into a canonical Run. fs-free: takes
// the file's bytes. Every span is kept as an event with its exact byte range.
//   LLM span   -> LlmRequest (prompt, completion; no cache layers in this format)
//   TOOL span  -> ToolCall and its ToolResult (one span holds both)
//   AGENT span -> Agent, parented by span ancestry (an observed link)
// Tokens come from LLM spans only. AGENT spans carry totals whose meaning
// cannot be established from the data (ADR-037); they are kept, never summed,
// and D12 reports where they disagree with the LLM calls beneath them.

export const TRAIL_TOOL = 'openinference-smolagents'
const TRUNCATION = /\.\.\.\s*\(truncated|\[truncated/i

type Span = Record<string, unknown> & { span_id: string; span_name: string; child_spans?: Span[]; span_attributes?: Record<string, unknown> }
const dec = new TextDecoder()

export interface TrailImportOptions { truth?: Truth }

export function importTrail(file: { path: string; bytes: Uint8Array }, opts: TrailImportOptions = {}): Run {
  const text = dec.decode(file.bytes)
  const doc = JSON.parse(text) as { trace_id: string; spans: Span[] }
  const offsets = spanOffsets(file.path, file.bytes)

  const events: Event[] = [], unknowns: UnknownLine[] = []
  const messages: Message[] = []
  const llmRequests: LlmRequest[] = [], toolCalls: ToolCall[] = [], toolResults: ToolResult[] = []
  const agents: Agent[] = [], edges: Edge[] = []
  const versions = new Set<string>()
  let truncated = false
  const seen = new Set<string>()

  const walk = (s: Span, parent: Span | null, agent: string | null) => {
    const off = offsets.get(s.span_id)
    const a = (s.span_attributes ?? {}) as Record<string, unknown>
    const kind = typeof a['openinference.span.kind'] === 'string' ? (a['openinference.span.kind'] as string) : null
    const { child_spans: kids, ...own } = s
    if (typeof s['scope_name'] === 'string' && String(s['scope_name']).startsWith('openinference') && s['scope_version']) versions.add(String(s['scope_version']))
    if (!truncated && Object.values(a).some(v => typeof v === 'string' && TRUNCATION.test(v))) truncated = true

    // A span id repeated within one trace: the second span has no distinct
    // offset, so it is kept as an unknown line pointing at the first, flagged.
    if (!off || seen.has(s.span_id)) {
      unknowns.push({ offset: off ?? { file: file.path, line: 0, byteStart: 0, byteEnd: 0 }, reason: seen.has(s.span_id) ? 'trail:duplicate-span-id' : 'trail:span-without-offset', raw: JSON.stringify(own) })
    } else {
      seen.add(s.span_id)
      const ts = typeof s['timestamp'] === 'string' ? Date.parse(String(s['timestamp']).replace(/(\.\d{3})\d+/, '$1') + (/[zZ]|[+-]\d\d:\d\d$/.test(String(s['timestamp'])) ? '' : 'Z')) : NaN
      events.push({
        id: s.span_id, sourceFile: file.path, offset: off, kind: 'otel-span',
        ...(Number.isNaN(ts) ? {} : { ts }),
        ...(parent ? { parentId: parent.span_id } : {}),
        ...(agent ? { agentId: agent } : {}),
        sessionId: doc.trace_id,
        raw: own as Record<string, unknown>,
      })
      // parent_span_id is an explicit id link: an observed edge (Rule 5).
      if (parent) edges.push({ kind: 'observed', fromId: parent.span_id, toId: s.span_id, evidence: [off] })
      const n = (k: string) => (a[k] == null ? null : Number(a[k]))
      if (kind === 'LLM' && n('llm.token_count.prompt') !== null) {
        llmRequests.push({ evidence: [off], messageId: s.span_id, usage: { inputTokens: n('llm.token_count.prompt')!, outputTokens: n('llm.token_count.completion') ?? 0, cacheReadTokens: 0, cacheWriteTokens: 0 }, ...(typeof a['llm.model_name'] === 'string' ? { model: a['llm.model_name'] as string } : {}) })
      }
      // Every LLM call is an assistant turn, with or without token counts, so
      // usage coverage means the same thing it does for Claude Code.
      if (kind === 'LLM') messages.push({ evidence: [off], id: s.span_id, role: 'assistant', ...(agent ? { agentId: agent } : {}), sessionId: doc.trace_id, ...(Number.isNaN(ts) ? {} : { ts }) })
      if (kind === 'TOOL') {
        toolCalls.push({ evidence: [off], id: s.span_id, name: String(a['tool.name'] ?? s.span_name), messageId: parent?.span_id ?? s.span_id, ...(agent ? { agentId: agent } : {}) })
        toolResults.push({ evidence: [off], toolUseId: s.span_id, messageId: s.span_id, isError: s['status_code'] === 'Error' })
      }
      if (kind === 'AGENT') agents.push({ evidence: [off], agentId: s.span_id, ...(agent ? { parentAgentId: agent } : {}), type: agent ? 'subagent' : 'main' })
    }
    const nextAgent = kind === 'AGENT' ? s.span_id : agent
    for (const c of kids ?? []) walk(c, s, nextAgent)
  }
  doc.spans.forEach(s => walk(s, null, null))

  const flags: ContentFlags = { prompts: true, responses: true, toolDetails: true, toolContent: true, rawBodies: false }
  const version = versions.size ? [...versions].sort().join('+') : undefined
  return {
    id: doc.trace_id,
    harness: { tool: TRAIL_TOOL, ...(version ? { version } : {}), layout: 'otlp' },
    capture: { level: 3, flags, truncated, ...(version ? { version } : {}) },
    truth: opts.truth ?? 'real',
    sources: [{ kind: 'external', path: file.path, sha256: sha256Hex(file.bytes), bytes: file.bytes.length, lines: text.split('\n').length }],
    events,
    messages, toolCalls, toolResults, llmRequests, agents, compactions: [], skills: [], edges,
    unknowns, costStates: [], rawApiRequestCount: 0,
  }
}
