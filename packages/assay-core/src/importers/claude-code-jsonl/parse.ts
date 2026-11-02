import { Event, UnknownLine } from '../../schema/index.js'
import { Offset } from '../../schema/offset.js'
import { SET_ASIDE_TYPES } from './catalogue.js'
import { sha256Hex } from './sha256.js'

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

// fs-free (ADR-019): takes the file's bytes so the same parser runs in Node
// and in the browser. Lines are split on raw 0x0A bytes, so byte offsets are
// exact however the text decodes.
const decoder = new TextDecoder('utf-8')

export function parseJsonlBytes(filePath: string, raw: Uint8Array): ParsedFile {
  const sha256 = sha256Hex(raw)
  const bytes = raw.length

  const events: Event[] = []
  const unknowns: UnknownLine[] = []
  const costStates: RawCostState[] = []
  let apiRequestCount = 0
  let lineNum = 0
  let lineStart = 0

  while (lineStart <= bytes) {
    let nl = raw.indexOf(0x0a, lineStart)
    if (nl === -1) nl = bytes
    const lineEnd = nl
    const lineText = decoder.decode(raw.subarray(lineStart, lineEnd))
    const next = nl + 1
    const advance = () => { lineNum++; lineStart = next }

    const trimmed = lineText.trim()
    if (!trimmed) { advance(); continue }

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      unknowns.push({
        offset: makeOffset(filePath, lineNum, lineStart, lineEnd),
        reason: 'json-parse-error',
        raw: lineText,
      })
      advance()
      continue
    }

    if (typeof parsed !== 'object' || parsed === null) {
      unknowns.push({
        offset: makeOffset(filePath, lineNum, lineStart, lineEnd),
        reason: 'not-an-object',
        raw: lineText,
      })
      advance()
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
      advance()
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

    advance()
  }

  return { path: filePath, sha256, bytes, lines: lineNum, events, unknowns, costStates, apiRequestCount }
}

function makeOffset(file: string, line: number, byteStart: number, byteEnd: number): Offset {
  return { file, line, byteStart, byteEnd }
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0
}
