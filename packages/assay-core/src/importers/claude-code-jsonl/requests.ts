import { compose, messageParts, Part } from '../../reconstruct/categories.js'
import { extractLiterals, locate } from '../../reconstruct/provenance.js'
import { Candidate, candidates, Line } from '../../reconstruct/rebuild.js'
import { Event, Offset, RequestRecord, RequestRecords, Seal, UnknownLine } from '../../schema/index.js'
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

export function readRequestRecords(unknowns: UnknownLine[], events: Event[] = []): RequestRecords | undefined {
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

  // record id -> tool calls in the assistant response that names it (requestRef)
  const responses = new Map<string, { id: string; input: Json }[]>()
  for (const e of events) {
    if (e.kind !== 'assistant') continue
    const ref = e.raw['requestRef']
    const content = (e.raw['message'] as Record<string, Json> | undefined)?.['content']
    if (typeof ref !== 'string' || !Array.isArray(content)) continue
    for (const b of content as Record<string, Json>[]) {
      if (b['type'] !== 'tool_use') continue
      const list = responses.get(ref) ?? []
      if (!list.some(x => x.id === b['id'])) list.push({ id: String(b['id']), input: b['input'] })
      responses.set(ref, list)
    }
  }

  // Rebuilt candidates, keyed by the hash they produce; only hashes that some
  // record names are kept. The first rule to produce a hash is recorded.
  const named = new Set(reqs.flatMap(({ obj }) => (Array.isArray(obj['tail']) ? (obj['tail'] as Json[]).map(String) : [])))
  const rebuilt = new Map<string, Candidate>()
  if (events.length > 0) {
    // Every line in file order: events plus the attachment lines kept as unknowns.
    const lines: Line[] = [
      ...events.map(e => ({ offset: e.offset, raw: e.raw })),
      ...unknowns.filter(u => u.reason === 'unknown-type:attachment').map(u => ({ offset: u.offset, raw: JSON.parse(u.raw) as Record<string, unknown> })),
    ].sort((a, b) => (a.offset.file === b.offset.file ? a.offset.line - b.offset.line : a.offset.file < b.offset.file ? -1 : 1))
    for (const c of candidates(lines)) {
      const h = canonicalHash(asBlocks(c.message))
      // Kept even where a blob exists, so the lines-only seal can be computed.
      if (named.has(h) && !rebuilt.has(h)) rebuilt.set(h, c)
    }
  }

  type Entry = { message: Json; source: 'blob' | 'rebuilt' } | null
  const chains = new Map<string, Entry[]>()
  // The same chain built from transcript lines only (no blobs): R2's primary.
  const lineChains = new Map<string, Entry[]>()
  const records: RequestRecord[] = []
  for (const { obj, offset } of reqs) {
    const id = String(obj['id'])
    const base = typeof obj['base'] === 'string' ? obj['base'] : null
    const keep = typeof obj['keep'] === 'number' ? obj['keep'] : 0
    const tailHashes = Array.isArray(obj['tail']) ? (obj['tail'] as Json[]).map(String) : []
    // A base the transcript never wrote makes the kept messages unknown, not empty.
    const baseChain = base === null ? [] : chains.get(base) ?? new Array<Entry>(keep).fill(null)
    // Messages enter the body in block form: the digest, like the blob key,
    // is taken after string content becomes one text block. Using them as
    // stored broke 19 of 75 complete requests in the corpus (2026-11-02).
    const tailEntries: Entry[] = tailHashes.map(h => {
      const b = blobs.get(h)
      if (b) return { message: asBlocks(b.message as Record<string, Json>), source: 'blob' }
      const r = rebuilt.get(h)
      return r ? { message: asBlocks(r.message), source: 'rebuilt' } : null
    })
    const chain = [...baseChain.slice(0, keep), ...tailEntries]
    chains.set(id, chain)
    const lineBase = base === null ? [] : lineChains.get(base) ?? new Array<Entry>(keep).fill(null)
    const lineChain: Entry[] = [...lineBase.slice(0, keep), ...tailHashes.map(h => {
      const r = rebuilt.get(h)
      return r ? { message: asBlocks(r.message), source: 'rebuilt' as const } : null
    })]
    lineChains.set(id, lineChain)

    const shapeHash = String(obj['shapeHash'] ?? '')
    const shape = shapes.get(shapeHash) as Record<string, Json> | undefined
    const sealOf = (msgs: Entry[]): Seal => {
      if (!shape) return 'no-shape'
      if (msgs.some(m => m === null)) return 'unresolved'
      const body = JSON.parse(JSON.stringify({ ...(obj['params'] as object), system: shape['system'], tools: shape['tools'], messages: msgs.map(m => m!.message) })) as Json
      const cc = Array.isArray(obj['cacheControl']) ? (obj['cacheControl'] as { path: (string | number)[]; value: Json }[]) : []
      for (const c of cc) setAt(body, c.path, c.value)
      return canonicalHash(body) === obj['requestDigest'] ? 'sealed' : 'broken'
    }
    const seal = sealOf(chain)
    const sealFromBlobs = sealOf(chain.map(m => (m && m.source === 'blob' ? m : null)))
    const sealFromLines = sealOf(lineChain)
    // Categories only for a request proven exact (ADR-032): the whole body, and
    // the part this request added (its tail), for delta token attribution.
    const msgs = chain.map(m => m?.message as Record<string, Json>)
    const composition = seal === 'sealed' && shape ? compose(shape['system'], shape['tools'], msgs) : null
    const tailComposition = seal === 'sealed' ? sumParts(messageParts(msgs.slice(keep), toolNamesOfAll(msgs))) : null
    // Provenance (ADR-033): the tool calls in the response that names this
    // record, checked against exactly this body.
    const provenance = seal === 'sealed' && shape
      ? (responses.get(id) ?? []).map(t => ({ toolUseId: t.id, literals: locate(extractLiterals(t.input), shape['system'], shape['tools'], msgs) }))
      : null

    const ts = typeof obj['timestamp'] === 'string' ? Date.parse(obj['timestamp']) : NaN
    records.push({
      id, offset,
      ...(Number.isNaN(ts) ? {} : { ts }),
      ...(typeof obj['version'] === 'string' ? { version: obj['version'] } : {}),
      ...(typeof obj['querySource'] === 'string' ? { querySource: obj['querySource'] } : {}),
      shapeHash, base, keep,
      tail: tailHashes.map(h => {
        const r = blobs.has(h) ? undefined : rebuilt.get(h)
        return {
          hash: h,
          blob: blobs.get(h)?.offset ?? null,
          source: blobs.has(h) ? 'blob' as const : r ? 'rebuilt' as const : null,
          ...(r ? { rule: r.rule, from: r.from } : {}),
        }
      }),
      messageCount: chain.length,
      missingMessages: chain.filter(m => m === null).length,
      rebuiltMessages: chain.filter(m => m?.source === 'rebuilt').length,
      seal,
      sealFromBlobs,
      sealFromLines,
      composition,
      tailComposition,
      provenance,
    })
  }
  return { records, blobs: blobCount, blobsFailed, shapes: shapeCount, shapesFailed }
}

function sumParts(parts: Part[]): Part[] {
  const acc = new Map<string, Part>()
  for (const p of parts) {
    const q = acc.get(p.category) ?? { category: p.category, chars: 0, blocks: 0 }
    q.chars += p.chars; q.blocks += p.blocks; acc.set(p.category, q)
  }
  return [...acc.values()]
}

function toolNamesOfAll(messages: Record<string, Json>[]): Map<string, string> {
  const names = new Map<string, string>()
  for (const m of messages) {
    if (m['role'] !== 'assistant' || !Array.isArray(m['content'])) continue
    for (const b of m['content'] as Record<string, Json>[]) if (b['type'] === 'tool_use') names.set(String(b['id']), String(b['name']))
  }
  return names
}
