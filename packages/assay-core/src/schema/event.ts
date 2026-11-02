import { z } from 'zod'
import { OffsetSchema } from './offset.js'

export const EventKindSchema = z.enum([
  'user',
  'assistant',
  'system',
  'summary',       // compaction summary line
  'hook',
  'otel-span',
  'unknown',
])

export type EventKind = z.infer<typeof EventKindSchema>

export const EventSchema = z.object({
  id: z.string(),
  sourceFile: z.string(),
  offset: OffsetSchema,
  ts: z.number().optional(),          // unix ms; absent on some lines
  kind: EventKindSchema,
  parentId: z.string().optional(),
  agentId: z.string().optional(),
  sessionId: z.string().optional(),
  raw: z.record(z.unknown()),         // original parsed JSON; always kept
})

export type Event = z.infer<typeof EventSchema>

// A line the importer did not understand for the detected version
export const UnknownLineSchema = z.object({
  offset: OffsetSchema,
  reason: z.string(),
  raw: z.string(),                    // original text line
  // Known record type with no usage telemetry (importer catalogue, ADR-022).
  catalogued: z.boolean().optional(),
  // Read by a later reader from its raw text (request records, ADR-026). Still
  // kept here, so offsets stay lossless; no longer counted as unparsed.
  parsedAs: z.literal('request-record').optional(),
})

export type UnknownLine = z.infer<typeof UnknownLineSchema>
