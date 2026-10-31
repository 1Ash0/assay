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
  // requestRef resolves to a request id in the session directory (D10)
  requestRef: z.string().optional(),
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
  preTokens: z.number().int().nonnegative().optional(),
  postTokens: z.number().int().nonnegative().optional(),
  summaryOffset: OffsetSchema.optional(),
})

export type Compaction = z.infer<typeof CompactionSchema>

export const SkillSchema = z.object({
  ...WithEvidence,
  name: z.string(),
  trigger: z.string().optional(),
  sourceUri: z.string().optional(),
})

export type Skill = z.infer<typeof SkillSchema>

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
