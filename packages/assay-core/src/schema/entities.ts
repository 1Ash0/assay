import { z } from 'zod'
import { OffsetSchema } from './offset.js'

// Every entity carries evidence: the offsets it was derived from
const WithEvidence = { evidence: z.array(OffsetSchema) }

export const UsageSchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  cacheReadTokens: z.number().int().nonnegative(),
  cacheWriteTokens: z.number().int().nonnegative(),
})

export type Usage = z.infer<typeof UsageSchema>

export const MessageSchema = z.object({
  ...WithEvidence,
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  agentId: z.string().optional(),
  sessionId: z.string().optional(),
  parentId: z.string().optional(),
  ts: z.number().optional(),
})

export type Message = z.infer<typeof MessageSchema>

export const ToolCallSchema = z.object({
  ...WithEvidence,
  id: z.string(),               // tool_use_id
  name: z.string(),
  messageId: z.string(),        // assistant message that issued it
  agentId: z.string().optional(),
})

export type ToolCall = z.infer<typeof ToolCallSchema>

export const ToolResultSchema = z.object({
  ...WithEvidence,
  toolUseId: z.string(),        // links to ToolCall.id
  messageId: z.string(),        // user message that carries the result
  isError: z.boolean(),
})

export type ToolResult = z.infer<typeof ToolResultSchema>

export const LlmRequestSchema = z.object({
  ...WithEvidence,
  messageId: z.string(),
  usage: UsageSchema,
  // The API's request id (assistant `requestId`, `req_…`). Not the transcript's
  // own `requestRef` field, which names an api-request record (D10).
  requestRef: z.string().optional(),
  // The model, when the source names it on the request itself (TRAIL's
  // llm.model_name). Claude Code transcripts carry it on the message instead.
  model: z.string().optional(),
})

export type LlmRequest = z.infer<typeof LlmRequestSchema>

export const AgentSchema = z.object({
  ...WithEvidence,
  agentId: z.string(),
  parentAgentId: z.string().optional(),
  type: z.enum(['main', 'subagent', 'background']),
  // path to the subagent JSONL file if it exists
  transcriptFile: z.string().optional(),
})

export type Agent = z.infer<typeof AgentSchema>

export const CompactionSchema = z.object({
  ...WithEvidence,
  // turn index where the compaction summary appeared
  turnIndex: z.number().int().nonnegative(),
  summaryOffset: OffsetSchema.optional(),
  // uuids of the turns that were compacted, when the format exposes them (v2.1.308+)
  summarizedTurnUuids: z.array(z.string()).optional(),
  // preTokens/postTokens: the JSONL format does not emit these fields; they are always
  // undefined at L1. D7 infers compaction impact from surrounding LlmRequests instead.
})

export type Compaction = z.infer<typeof CompactionSchema>

export const SkillSchema = z.object({
  ...WithEvidence,
  name: z.string(),
  trigger: z.string().optional(),
  sourceUri: z.string().optional(),
})

export type Skill = z.infer<typeof SkillSchema>

// Per-model usage breakdown from cost-state records (v2.1.308+).
// This is the runtime's own accounting — an independent check against LlmRequest sums.
export const ModelUsageEntrySchema = z.object({
  inputTokens: z.number().int().nonnegative(),
  outputTokens: z.number().int().nonnegative(),
  thinkingTokens: z.number().int().nonnegative(),
  cacheReadInputTokens: z.number().int().nonnegative(),
  cacheCreationInputTokens: z.number().int().nonnegative(),
  costUSD: z.number().nonnegative(),
})
export type ModelUsageEntry = z.infer<typeof ModelUsageEntrySchema>

export const CostStateSchema = z.object({
  ...WithEvidence,
  totalCostUSD: z.number().nonnegative(),
  totalAPIDurationMs: z.number().int().nonnegative(),
  hasUnknownModelCost: z.boolean(),
  // model → usage breakdown; keys are model id strings
  modelUsage: z.record(z.string(), ModelUsageEntrySchema),
})
export type CostState = z.infer<typeof CostStateSchema>

// Edge kinds: only these two exist
export const EdgeKindSchema = z.enum(['observed', 'matched'])
export type EdgeKind = z.infer<typeof EdgeKindSchema>

export const EdgeSchema = z.object({
  kind: EdgeKindSchema,
  fromId: z.string(),
  toId: z.string(),
  evidence: z.array(OffsetSchema),
})

export type Edge = z.infer<typeof EdgeSchema>
