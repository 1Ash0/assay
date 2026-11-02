import { Offset } from '../schema/offset.js'
import { Run } from '../schema/run.js'

// Capture-quality counters (M4_PLAN §4a, item 3): deterministic counts shown
// beside the Capture Level, each with the offsets of its first cases. They
// count; they do not judge. Each says how it can be a false positive.
export interface Counter {
  count: number
  first: Offset[]
  falsePositive: string
}

export interface CaptureQuality {
  duplicateUuids: Counter
  duplicateRequestIdAcrossFiles: Counter
  sessionIdMismatch: Counter
  timestampBeforeParent: Counter
  orphanParents: Counter
  unknownRecordTypes: { count: number; types: Record<string, number> }
}

const FIRST = 5
const counter = (falsePositive: string) => ({ count: 0, first: [] as Offset[], falsePositive })
const hit = (c: Counter, o: Offset) => { c.count++; if (c.first.length < FIRST) c.first.push(o) }
const stem = (path: string) => (path.split(/[\\/]/).pop() ?? '').replace(/\.jsonl$/, '')

export function captureQuality(run: Run): CaptureQuality {
  const q: CaptureQuality = {
    duplicateUuids: counter('a line rewritten in place by the harness (same record, new bytes) would also count'),
    duplicateRequestIdAcrossFiles: counter('a subagent transcript that legitimately repeats its parent\'s last request would count; D2 still dedups by message id'),
    sessionIdMismatch: counter('a resumed or forked session writes its new lines into the old file with its own id'),
    timestampBeforeParent: counter('clock skew between a subagent process and its parent'),
    orphanParents: counter('a parent removed by the harness when it compacts or prunes, not lost in capture'),
    unknownRecordTypes: { count: 0, types: {} },
  }

  const byUuid = new Map<string, Offset>()
  const reqFile = new Map<string, string>()
  const tsById = new Map<string, number>()
  for (const e of run.events) if (typeof e.ts === 'number') tsById.set(e.id, e.ts)
  // A parent can be a line the importer keeps as unknown (attachments,
  // request records), so its uuid counts as present too.
  const ids = new Set(run.events.map(e => e.id))
  for (const u of run.unknowns) {
    const m = /"uuid":"([^"]+)"/.exec(u.raw)
    if (m) ids.add(m[1]!)
  }
  const mainStem = run.sources[0] ? stem(run.sources[0].path) : null

  for (const e of run.events) {
    const raw = e.raw as Record<string, unknown>
    if (typeof raw['uuid'] === 'string') {
      if (byUuid.has(raw['uuid'])) hit(q.duplicateUuids, e.offset)
      else byUuid.set(raw['uuid'], e.offset)
    }
    const rid = raw['requestId']
    if (e.kind === 'assistant' && typeof rid === 'string') {
      const f = reqFile.get(rid)
      if (f !== undefined && f !== e.sourceFile) hit(q.duplicateRequestIdAcrossFiles, e.offset)
      else if (f === undefined) reqFile.set(rid, e.sourceFile)
    }
    // Subagent files carry the parent's session id, so every file is compared
    // with the main transcript's name, never with its own.
    if (mainStem && e.sessionId && e.sessionId !== mainStem) hit(q.sessionIdMismatch, e.offset)
    if (e.parentId) {
      if (!ids.has(e.parentId)) hit(q.orphanParents, e.offset)
      else {
        const pt = tsById.get(e.parentId)
        if (pt !== undefined && typeof e.ts === 'number' && e.ts < pt) hit(q.timestampBeforeParent, e.offset)
      }
    }
  }

  for (const u of run.unknowns) {
    if (u.catalogued || u.parsedAs) continue
    q.unknownRecordTypes.count++
    q.unknownRecordTypes.types[u.reason] = (q.unknownRecordTypes.types[u.reason] ?? 0) + 1
  }
  return q
}
