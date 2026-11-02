import { Offset, RequestRecord, RequestRecords, Seal, UnknownLine } from '../../schema/index.js'
import { sha256Hex } from './sha256.js'

// Reads request records out of the unknown lines that hold them (ADR-026).
// The hash rules were checked against real transcripts (M4_PLAN §0), not
// assumed: a blob's key is the hash of its message with string content
// written as one text block; requestDigest covers {...params, system, tools,
// messages} with each cacheControl value set at its path.

export const REQUEST_RECORD_TYPES = new Set(['api-request', 'api-request-shape', 'api-request-blob'])

type Json = unknown
const enc = new TextEncoder()

function sortKeys(v: Json): Json {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v && typeof v === 'object') {
    const o = v as Record<string, Json>
    return Object.fromEntries(Object.keys(o).sort().map(k => [k, sortKeys(o[k])]))
  }
  return v
}

export function canonicalHash(v: Json): string {
  return sha256Hex(enc.encode(JSON.stringify(sortKeys(v))))
}

function asBlocks(m: Record<string, Json>): Record<string, Json> {
  return typeof m['content'] === 'string' ? { ...m, content: [{ type: 'text', text: m['content'] }] } : m
}

// Sets `value` at `path` inside a copy of `body`; a path that does not resolve
// is left alone, which then shows up as a broken seal rather than a guess.
function setAt(body: Json, path: (string | number)[], value: Json): void {
  let t = body as Record<string | number, Json> | undefined
  for (const p of path) t = t && typeof t === 'object' ? (t[p] as Record<string | number, Json>) : undefined
  if (t && typeof t === 'object' && !Array.isArray(t)) (t as Record<string, Json>)['cache_control'] = value
}

export function readRequestRecords(unknowns: UnknownLine[]): RequestRecords | undefined {
  const blobs = new Map<string, { message: Json; offset: Offset }>()
  const shapes = new Map<string, Json>()
  const blobsFailed: Offset[] = [], shapesFailed: Offset[] = []
  const reqs: { obj: Record<string, Json>; offset: Offset }[] = []
  let blobCount = 0, shapeCount = 0

  for (const u of unknowns) {
    const type = u.reason.startsWith('unknown-type:') ? u.reason.slice('unknown-type:'.length) : null
    if (!type || !REQUEST_RECORD_TYPES.has(type)) continue
    const obj = JSON.parse(u.raw) as Record<string, Json>
    if (type === 'api-request-blob') {
      blobCount++
      const m = obj['message'] as Record<string, Json> | undefined
      const key = obj['hash']
      if (m && typeof key === 'string' && canonicalHash(asBlocks(m)) === key) blobs.set(key, { message: m, offset: u.offset })
      else blobsFailed.push(u.offset)
    } else if (type === 'api-request-shape') {
      shapeCount++
      const key = obj['shapeHash']
      if (typeof key === 'string' && canonicalHash(obj['shape']) === key) shapes.set(key, obj['shape'])
      else shapesFailed.push(u.offset)
    } else {
      reqs.push({ obj, offset: u.offset })
    }
  }
  if (reqs.length === 0 && blobCount === 0 && shapeCount === 0) return undefined

  // Each chain entry is the message itself, or null when no verified blob holds it.
  const chains = new Map<string, (Json | null)[]>()
  const records: RequestRecord[] = []
  for (const { obj, offset } of reqs) {
    const id = String(obj['id'])
    const base = typeof obj['base'] === 'string' ? obj['base'] : null
    const keep = typeof obj['keep'] === 'number' ? obj['keep'] : 0
    const tailHashes = Array.isArray(obj['tail']) ? (obj['tail'] as Json[]).map(String) : []
    // A base the transcript never wrote makes the kept messages unknown, not empty.
    const baseChain = base === null ? [] : chains.get(base) ?? new Array<Json | null>(keep).fill(null)
    // Messages enter the body in block form: the digest, like the blob key,
    // is taken after string content becomes one text block. Using them as
    // stored broke 19 of 75 complete requests in the corpus (2026-11-02).
    const chain = [...baseChain.slice(0, keep), ...tailHashes.map(h => {
      const m = blobs.get(h)?.message as Record<string, Json> | undefined
      return m ? asBlocks(m) : null
    })]
    chains.set(id, chain)

    const shapeHash = String(obj['shapeHash'] ?? '')
    const shape = shapes.get(shapeHash) as Record<string, Json> | undefined
    const missing = chain.filter(m => m === null).length
    let seal: Seal
    if (!shape) seal = 'no-shape'
    else if (missing > 0) seal = 'unresolved'
    else {
      const body = JSON.parse(JSON.stringify({ ...(obj['params'] as object), system: shape['system'], tools: shape['tools'], messages: chain })) as Json
      const cc = Array.isArray(obj['cacheControl']) ? (obj['cacheControl'] as { path: (string | number)[]; value: Json }[]) : []
      for (const c of cc) setAt(body, c.path, c.value)
      seal = canonicalHash(body) === obj['requestDigest'] ? 'sealed' : 'broken'
    }

    const ts = typeof obj['timestamp'] === 'string' ? Date.parse(obj['timestamp']) : NaN
    records.push({
      id, offset,
      ...(Number.isNaN(ts) ? {} : { ts }),
      ...(typeof obj['version'] === 'string' ? { version: obj['version'] } : {}),
      ...(typeof obj['querySource'] === 'string' ? { querySource: obj['querySource'] } : {}),
      shapeHash, base, keep,
      tail: tailHashes.map(h => ({ hash: h, blob: blobs.get(h)?.offset ?? null })),
      messageCount: chain.length,
      missingMessages: missing,
      seal,
    })
  }
  return { records, blobs: blobCount, blobsFailed, shapes: shapeCount, shapesFailed }
}
