import { Offset } from '../../schema/index.js'

// Exact byte range of every JSON object that has a "span_id" key, in one pass
// over the bytes (Rule 4). JSON's structural characters are ASCII, so scanning
// bytes is safe for UTF-8 content. Lines are 0-based, like the JSONL importer.
// Only the object's own `"span_id": "<value>"` at its own depth counts, so a
// span_id quoted inside a string or a nested object is not mistaken for it.
// An object must also have its own `span_name`: Patronus log records nested in
// a span repeat the span's id, and would otherwise be taken for it.

const Q = 0x22, BS = 0x5c, LB = 0x7b, RB = 0x7d, NL = 0x0a, COLON = 0x3a
const dec = new TextDecoder()

export function spanOffsets(file: string, bytes: Uint8Array): Map<string, Offset> {
  const out = new Map<string, Offset>()
  // Stack of open objects: start byte, start line, and the span_id found at its own depth.
  const stack: { start: number; line: number; id: string | null; named: boolean }[] = []
  let line = 0, inStr = false, strStart = -1, lastKey: string | null = null, expectValueFor: string | null = null
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i]!
    if (inStr) {
      if (c === BS) { i++; continue }
      if (c === Q) {
        inStr = false
        const text = dec.decode(bytes.subarray(strStart + 1, i))
        if (expectValueFor === 'span_id' && stack.length) { stack[stack.length - 1]!.id = text; expectValueFor = null }
        else lastKey = text
      }
      if (c === NL) line++
      continue
    }
    if (c === Q) { inStr = true; strStart = i; continue }
    if (c === NL) { line++; continue }
    if (c === COLON) { if (lastKey === 'span_name' && stack.length) stack[stack.length - 1]!.named = true; expectValueFor = lastKey; lastKey = null; continue }
    if (c === LB) { stack.push({ start: i, line, id: null, named: false }); expectValueFor = null; lastKey = null; continue }
    if (c === RB) {
      const o = stack.pop()
      if (o?.id && o.named && !out.has(o.id)) out.set(o.id, { file, line: o.line, byteStart: o.start, byteEnd: i + 1 })
      continue
    }
    // Any other structural byte (comma, bracket, literal) ends a pending key.
    if (c === 0x2c || c === 0x5b || c === 0x5d) { expectValueFor = null; lastKey = null }
  }
  return out
}
