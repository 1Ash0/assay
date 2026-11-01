import { z } from 'zod'
import { CaptureLevelSchema } from './capture.js'
import { EventSchema, UnknownLineSchema } from './event.js'
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
})

export type Run = z.infer<typeof RunSchema>
