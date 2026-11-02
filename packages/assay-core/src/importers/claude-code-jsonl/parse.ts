import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { Event, UnknownLine } from '../../schema/index.js'
import { Offset } from '../../schema/offset.js'
import { SET_ASIDE_TYPES } from './catalogue.js'

export interface RawCostState {
  totalCostUSD: number
  totalAPIDurationMs: number
  hasUnknownModelCost: boolean
  modelUsage: Record<string, {
    inputTokens: number
    outputTokens: number
    thinkingTokens: number
    cacheReadInputTokens: number
    cacheCreationInputTokens: number
    costUSD: number
  }>
  sourceLine: number
  sourceFile: string
  byteStart: number
  byteEnd: number
}

export interface ParsedFile {
  path: string
  sha256: string
  bytes: number
  lines: number
  events: Event[]
  unknowns: UnknownLine[]
  costStates: RawCostState[]
  apiRequestCount: number
}

// Known top-level type values in Claude Code JSONL
const KNOWN_TYPES = new Set(['user', 'assistant', 'system', 'summary'])

// Types that are deliberately parsed by the importer for metadata but are not Events.
// These are extracted during parseJsonlFile and returned separately.
export const PARSED_METADATA_TYPES = new Set([
  'cost-state',        // runtime cost/usage accounting (v2.1.308+)
  'api-request',       // raw API call record (UUID-keyed, not linked to requestId)
])

export function parseJsonlFile(filePath: string): ParsedFile {
  const raw = readFileSync(filePath)
  const sha256 = createHash('sha256').update(raw).digest('hex')
  const bytes = raw.length
  const text = raw.toString('utf-8')

  const events: Event[] = []
  const unknowns: UnknownLine[] = []
  const costStates: RawCostState[] = []
  let apiRequestCount = 0
  let lineNum = 0
  let bytePos = 0

  for (const lineText of text.split('\n')) {
    const lineStart = bytePos
    bytePos += Buffer.byteLength(lineText, 'utf-8') + 1 // +1 for \n (clamped to bytes at offset use)

    const trimmed = lineText.trim()
    if (!trimmed) { lineNum++; continue }

    // bytePos-1 points to the \n we just counted, but on the last line without a
    // trailing newline that overshoots the file by 1. Clamp to actual file size.
    const lineEnd = Math.min(bytePos - 1, bytes)

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      unknowns.push({
        offset: makeOffset(filePath, lineNum, lineStart, lineEnd),
        reason: 'json-parse-error',
        raw: lineText,
      })
      lineNum++
      continue
    }

    if (typeof parsed !== 'object' || parsed === null) {
      unknowns.push({
        offset: makeOffset(filePath, lineNum, lineStart, lineEnd),
        reason: 'not-an-object',
        raw: lineText,
      })
      lineNum++
      continue
    }

    const obj = parsed as Record<string, unknown>
    const type = obj['type']

    if (typeof type !== 'string' || !KNOWN_TYPES.has(type)) {
      // Extract metadata from specific non-event types before filing as unknown
      if (type === 'cost-state') {
        const mu = obj['modelUsage']
        if (typeof mu === 'object' && mu !== null) {
          const modelUsage: RawCostState['modelUsage'] = {}
          for (const [model, entry] of Object.entries(mu as Record<string, unknown>)) {
            if (typeof entry === 'object' && entry !== null) {
              const e = entry as Record<string, unknown>
              modelUsage[model] = {
                inputTokens: num(e['inputTokens']),
                outputTokens: num(e['outputTokens']),
                thinkingTokens: num(e['thinkingTokens']),
                cacheReadInputTokens: num(e['cacheReadInputTokens']),
                cacheCreationInputTokens: num(e['cacheCreationInputTokens']),
                costUSD: typeof e['costUSD'] === 'number' ? e['costUSD'] : 0,
              }
            }
          }
          costStates.push({
            totalCostUSD: typeof obj['totalCostUSD'] === 'number' ? obj['totalCostUSD'] : 0,
            totalAPIDurationMs: num(obj['totalAPIDuration']),
            hasUnknownModelCost: obj['hasUnknownModelCost'] === true,
            modelUsage,
            sourceLine: lineNum,
            sourceFile: filePath,
            byteStart: lineStart,
            byteEnd: lineEnd,
          })
        }
      } else if (type === 'api-request') {
        apiRequestCount++
      }
      if (typeof type !== 'string' || !PARSED_METADATA_TYPES.has(type)) {
        unknowns.push({
          offset: makeOffset(filePath, lineNum, lineStart, lineEnd),
          reason: `unknown-type:${String(type ?? 'missing')}`,
          raw: lineText,
          ...(typeof type === 'string' && SET_ASIDE_TYPES.has(type) ? { catalogued: true } : {}),
        })
      }
      lineNum++
      continue
    }

    const id: string =
      typeof obj['uuid'] === 'string'
        ? obj['uuid']
        : `${filePath}:${lineNum}`

    // Compaction summary is a `type: user` line with `isCompactSummary: true`
    const kind =
      type === 'summary' || (type === 'user' && obj['isCompactSummary'] === true)
        ? 'summary'
        : (type as 'user' | 'assistant' | 'system')

    events.push({
      id,
      sourceFile: filePath,
      offset: makeOffset(filePath, lineNum, lineStart, lineEnd),
      ts: typeof obj['timestamp'] === 'string'
        ? Date.parse(obj['timestamp'])
        : undefined,
      kind,
      parentId: typeof obj['parentUuid'] === 'string' ? obj['parentUuid'] : undefined,
      agentId: typeof obj['agentId'] === 'string' ? obj['agentId'] : undefined,
      sessionId: typeof obj['sessionId'] === 'string' ? obj['sessionId'] : undefined,
      raw: obj,
    })

    lineNum++
  }

  return { path: filePath, sha256, bytes, lines: lineNum, events, unknowns, costStates, apiRequestCount }
}

function makeOffset(file: string, line: number, byteStart: number, byteEnd: number): Offset {
  return { file, line, byteStart, byteEnd }
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0
}
