import { z } from 'zod'

// What content was captured (chosen deliberately per run, logged in notebook)
export const ContentFlagsSchema = z.object({
  prompts: z.boolean(),
  responses: z.boolean(),
  toolDetails: z.boolean(),
  toolContent: z.boolean(),
  rawBodies: z.boolean(),
})

export type ContentFlags = z.infer<typeof ContentFlagsSchema>

export const CaptureLevelSchema = z.object({
  level: z.union([
    z.literal(0), // final text or export only
    z.literal(1), // transcript events with uuids/usage
    z.literal(2), // L1 + lifecycle hook events
    z.literal(3), // structured OTel events/spans
    z.literal(4), // exact API request/response bodies
  ]),
  flags: ContentFlagsSchema,
  truncated: z.boolean(),
  version: z.string().optional(), // harness version if known
  layout: z.enum(['inline-sidechain', 'subagent-files', 'otlp', 'unknown']),
})

export type CaptureLevel = z.infer<typeof CaptureLevelSchema>
