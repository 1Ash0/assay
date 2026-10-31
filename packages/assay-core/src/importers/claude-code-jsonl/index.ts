import { createHash } from 'crypto'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { ContentFlags, Run, Source } from '../../schema/index.js'
import { deriveEntities } from './derive.js'
import { ParsedFile, parseJsonlFile } from './parse.js'
import { detectLayout, detectVersion } from './version.js'

export interface ImportOptions {
  // Which content was captured (caller must declare; default all false)
  contentFlags?: Partial<ContentFlags>
}

// Import a Claude Code session directory or a single JSONL file.
// Always reads the whole directory to avoid subagent undercount (D1).
export function importClaudeCodeDir(sessionPath: string, opts: ImportOptions = {}): Run {
  const flags: ContentFlags = {
    prompts: false,
    responses: false,
    toolDetails: false,
    toolContent: false,
    rawBodies: false,
    ...opts.contentFlags,
  }

  // Resolve to session directory
  const isJsonl = sessionPath.endsWith('.jsonl')
  const dirPath = isJsonl ? sessionPath.replace(/\.jsonl$/, '') : sessionPath
  const mainJsonl = isJsonl ? sessionPath : `${sessionPath}.jsonl`

  const allFiles: string[] = []
  if (existsSync(mainJsonl)) allFiles.push(mainJsonl)

  // Check for subagent directory
  const subagentDir = join(dirPath, 'subagents')
  const hasSubagentDir = existsSync(subagentDir)
  if (hasSubagentDir) {
    for (const f of readdirSync(subagentDir)) {
      if (f.endsWith('.jsonl')) allFiles.push(join(subagentDir, f))
    }
  }

  if (allFiles.length === 0) {
    throw new Error(`No JSONL files found at: ${sessionPath}`)
  }

  // Parse all files
  const parsed: ParsedFile[] = allFiles.map(parseJsonlFile)
  const allEvents = parsed.flatMap(p => p.events)
  const allUnknowns = parsed.flatMap(p => p.unknowns)

  // Detect version and layout from main file lines
  const mainParsed = parsed[0]
  if (!mainParsed) throw new Error('No parsed files')
  const version = detectVersion(mainParsed.events.map(e => e.raw))
  const layout = detectLayout(hasSubagentDir, mainParsed.events.map(e => e.raw))

  // Derive entities
  const entities = deriveEntities(allEvents)

  // Determine Capture Level: L1 baseline, L2 if hooks events found
  // (hooks-log import would upgrade; JSONL-only = L1)
  const captureLevel = 1 as const

  // Build sources
  const sources: Source[] = parsed.map(p => ({
    kind: 'jsonl' as const,
    path: p.path,
    sha256: p.sha256,
    bytes: p.bytes,
    lines: p.lines,
  }))

  // Session id from directory name or file name
  const sessionId = mainJsonl.split(/[\\/]/).pop()?.replace('.jsonl', '') ?? 'unknown'

  return {
    id: sessionId,
    harness: { tool: 'claude-code', version, layout },
    capture: {
      level: captureLevel,
      flags,
      truncated: false,
      version,
      layout,
    },
    truth: 'real',
    sources,
    events: allEvents,
    ...entities,
    unknowns: allUnknowns,
  }
}
