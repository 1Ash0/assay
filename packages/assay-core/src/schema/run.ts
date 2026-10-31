import { z } from 'zod'
import { CaptureLevelSchema } from './capture.js'
import { EventSchema, UnknownLineSchema } from './event.js'
import {
  AgentSchema,
  CompactionSchema,
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
    layout: z.string(),
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
})

export type Run = z.infer<typeof RunSchema>
