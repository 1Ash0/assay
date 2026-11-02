import { z } from 'zod'
import { OffsetSchema } from './offset.js'

// Request records (ADR-026): from 2.1.299 Claude Code writes each SDK request
// into the transcript as a delta chain. `api-request-shape` holds system and
// tools, `api-request-blob` one message, `api-request` the params plus
// base/keep/tail and a digest of the whole body. Every hash is SHA-256 of
// sorted-key JSON, so the chain can be checked without any other channel.

export const RequestTailSchema = z.object({
  hash: z.string(),
  // Offset of the blob line, or null when no blob with this hash was written.
  blob: OffsetSchema.nullable(),
})

// sealed: the rebuilt body hashes to requestDigest (exact, byte for byte).
// broken: every part is present but the digest does not match; something in
//   the record or our rebuild is wrong, and that is a finding, not noise.
// unresolved: some message in the chain is missing, so no digest was tried.
// no-shape: the shape the record names was never written.
export const SealSchema = z.enum(['sealed', 'broken', 'unresolved', 'no-shape'])

export const RequestRecordSchema = z.object({
  id: z.string(),
  offset: OffsetSchema,
  ts: z.number().optional(),
  version: z.string().optional(),
  querySource: z.string().optional(),
  shapeHash: z.string(),
  base: z.string().nullable(),
  keep: z.number().int().nonnegative(),
  tail: z.array(RequestTailSchema),
  // Messages in the full chain (kept from the base plus this tail).
  messageCount: z.number().int().nonnegative(),
  // Chain messages with no verified blob behind them.
  missingMessages: z.number().int().nonnegative(),
  seal: SealSchema,
})

export const RequestRecordsSchema = z.object({
  records: z.array(RequestRecordSchema),
  blobs: z.number().int().nonnegative(),
  // Blobs whose content does not hash to their own key. They are kept as
  // unknown lines but never used to rebuild a request.
  blobsFailed: z.array(OffsetSchema),
  shapes: z.number().int().nonnegative(),
  shapesFailed: z.array(OffsetSchema),
})

export type RequestTail = z.infer<typeof RequestTailSchema>
export type Seal = z.infer<typeof SealSchema>
export type RequestRecord = z.infer<typeof RequestRecordSchema>
export type RequestRecords = z.infer<typeof RequestRecordsSchema>
