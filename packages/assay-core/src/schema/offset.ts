import { z } from 'zod'

export const OffsetSchema = z.object({
  file: z.string(),
  line: z.number().int().nonnegative(),
  byteStart: z.number().int().nonnegative(),
  byteEnd: z.number().int().nonnegative(),
})

export type Offset = z.infer<typeof OffsetSchema>
