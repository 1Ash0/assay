import { createHash } from 'crypto'
import { readFileSync, statSync } from 'fs'
import { Event, UnknownLine } from '../../schema/index.js'
import { Offset } from '../../schema/offset.js'

export interface ParsedFile {
  path: string
  sha256: string
  bytes: number
  lines: number
  events: Event[]
  unknowns: UnknownLine[]
}

// Known top-level type values in Claude Code JSONL
const KNOWN_TYPES = new Set(['user', 'assistant', 'system', 'summary'])

export function parseJsonlFile(filePath: string): ParsedFile {
  const raw = readFileSync(filePath)
  const sha256 = createHash('sha256').update(raw).digest('hex')
  const bytes = raw.length
  const text = raw.toString('utf-8')

  const events: Event[] = []
  const unknowns: UnknownLine[] = []
  let lineNum = 0
  let bytePos = 0

  for (const lineText of text.split('\n')) {
    const lineStart = bytePos
    bytePos += Buffer.byteLength(lineText, 'utf-8') + 1 // +1 for \n

    const trimmed = lineText.trim()
    if (!trimmed) { lineNum++; continue }

    let parsed: unknown
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      unknowns.push({
        offset: makeOffset(filePath, lineNum, lineStart, bytePos - 1),
        reason: 'json-parse-error',
        raw: lineText,
      })
      lineNum++
      continue
    }

    if (typeof parsed !== 'object' || parsed === null) {
      unknowns.push({
        offset: makeOffset(filePath, lineNum, lineStart, bytePos - 1),
        reason: 'not-an-object',
        raw: lineText,
      })
      lineNum++
      continue
    }

    const obj = parsed as Record<string, unknown>
    const type = obj['type']

    if (typeof type !== 'string' || !KNOWN_TYPES.has(type)) {
      unknowns.push({
        offset: makeOffset(filePath, lineNum, lineStart, bytePos - 1),
        reason: `unknown-type:${String(type ?? 'missing')}`,
        raw: lineText,
      })
      lineNum++
      continue
    }

    const id: string =
      typeof obj['uuid'] === 'string'
        ? obj['uuid']
        : `${filePath}:${lineNum}`

    const kind =
      type === 'summary'
        ? 'summary'
        : (type as 'user' | 'assistant' | 'system')

    events.push({
      id,
      sourceFile: filePath,
      offset: makeOffset(filePath, lineNum, lineStart, bytePos - 1),
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

  return { path: filePath, sha256, bytes, lines: lineNum, events, unknowns }
}

function makeOffset(file: string, line: number, byteStart: number, byteEnd: number): Offset {
  return { file, line, byteStart, byteEnd }
}
