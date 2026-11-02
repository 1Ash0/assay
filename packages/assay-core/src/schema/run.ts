import { z } from 'zod'
import { CaptureLevelSchema } from './capture.js'
import { EventSchema, UnknownLineSchema } from './event.js'
import { OffsetSchema } from './offset.js'
import {
  AgentSchema,
  CompactionSchema,
  CostStateSchema,
  EdgeSchema,
  LlmRequestSchema,
  MessageSchema,
  SkillSchema,
  ToolCallSchema,
  ToolResultSchema,
} from './entities.js'

export const TruthSchema = z.enum(['real', 'real-perturbed', 'scripted', 'inferred'])
export type Truth = z.infer<typeof TruthSchema>

export const SourceSchema = z.object({
  kind: z.enum(['jsonl', 'otlp', 'hooks-log', 'external']),
  path: z.string(),
  sha256: z.string(),
  bytes: z.number().int().nonnegative(),
  lines: z.number().int().nonnegative(),
})

export type Source = z.infer<typeof SourceSchema>

// One api_request log record from OTel (L3), Claude Code profile (ADR-025).
export const OtelApiRequestSchema = z.object({
  evidence: z.array(OffsetSchema),
  requestId: z.string(),
  model: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheWriteTokens: z.number(),
  costUSD: z.number(),
  durationMs: z.number(),
  querySource: z.string(),
  // request_id equals a transcript LlmRequest's requestRef (exact match).
  inTranscript: z.boolean(),
})
export type OtelApiRequest = z.infer<typeof OtelApiRequestSchema>

export const RunSchema = z.object({
  id: z.string(),
  harness: z.object({
    tool: z.string(),
    version: z.string().optional(),
    layout: z.enum(['main-only', 'inline-sidechain', 'subagent-files', 'otlp', 'unknown']),
  }),
  capture: CaptureLevelSchema,
  truth: TruthSchema,
  sources: z.array(SourceSchema),

  // Raw events (one per parsed line)
  events: z.array(EventSchema),

  // Derived entities
  messages: z.array(MessageSchema),
  toolCalls: z.array(ToolCallSchema),
  toolResults: z.array(ToolResultSchema),
  llmRequests: z.array(LlmRequestSchema),
  agents: z.array(AgentSchema),
  compactions: z.array(CompactionSchema),
  skills: z.array(SkillSchema),
  edges: z.array(EdgeSchema),

  // Lines the importer did not understand — never dropped
  unknowns: z.array(UnknownLineSchema),

  // Cost-state records from the runtime's own accounting (v2.1.308+, L1).
  // Independent cross-check against LlmRequest token sums. May be empty.
  costStates: z.array(CostStateSchema),

  // Count of api-request type lines found in source files.
  // Used by D10 to check whether captured API-request records roughly match LlmRequests.
  // api-request IDs use a different namespace from assistant.requestId; linkage is not possible.
  rawApiRequestCount: z.number().int().nonnegative(),

  // Present only when an OTLP capture was attached (L3).
  otel: z.object({
    apiRequests: z.array(OtelApiRequestSchema),
    logRecords: z.number().int().nonnegative(),
    spans: z.number().int().nonnegative(),
    otherSessionRecords: z.number().int().nonnegative(),
  }).optional(),
})

export type Run = z.infer<typeof RunSchema>
