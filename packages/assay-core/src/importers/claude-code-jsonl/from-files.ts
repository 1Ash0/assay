import { ContentFlags, CostState, Run, Source, Truth } from '../../schema/index.js'
import { deriveEntities } from './derive.js'
import { ParsedFile, parseJsonlBytes } from './parse.js'
import { readRequestRecords, REQUEST_RECORD_TYPES } from './requests.js'
import { detectLayout, detectVersion } from './version.js'

export interface ImportOptions {
  // Which content was captured (caller must declare; default all false)
  contentFlags?: Partial<ContentFlags>
  // Truth label for this run. Default 'real'. Use 'scripted' for synthetic fixtures.
  truth?: Truth
}

export interface SourceFile {
  path: string
  bytes: Uint8Array
}

// fs-free import (ADR-019). `files[0]` is the main transcript; the rest are its
// subagent transcripts. `hasSubagentDir` says whether a subagents/ folder
// existed, which version layout detection needs even when it was empty.
export function importFromFiles(files: SourceFile[], opts: ImportOptions = {}, hasSubagentDir = files.length > 1): Run {
  if (files.length === 0) throw new Error('No JSONL files given')
  const flags: ContentFlags = {
    prompts: false,
    responses: false,
    toolDetails: false,
    toolContent: false,
    rawBodies: false,
    ...opts.contentFlags,
  }

  // Parse all files
  const parsed: ParsedFile[] = files.map(f => parseJsonlBytes(f.path, f.bytes))
  const allEvents = parsed.flatMap(p => p.events)
  const allUnknowns = parsed.flatMap(p => p.unknowns)
  const requests = readRequestRecords(allUnknowns, allEvents)
  for (const u of allUnknowns) if (REQUEST_RECORD_TYPES.has(u.reason.slice('unknown-type:'.length))) u.parsedAs = 'request-record'
  const rawApiRequestCount = parsed.reduce((s, p) => s + p.apiRequestCount, 0)

  // Collect cost-state records — convert from raw to schema type.
  // Multiple cost-state records may appear (incremental snapshots); keep all.
  const allCostStates: CostState[] = parsed.flatMap(p =>
    p.costStates.map(cs => ({
      evidence: [{ file: cs.sourceFile, line: cs.sourceLine, byteStart: cs.byteStart, byteEnd: cs.byteEnd }],
      totalCostUSD: cs.totalCostUSD,
      totalAPIDurationMs: cs.totalAPIDurationMs,
      hasUnknownModelCost: cs.hasUnknownModelCost,
      modelUsage: cs.modelUsage,
    }))
  )

  // Detect version and layout from main file lines
  const mainParsed = parsed[0]
  if (!mainParsed) throw new Error('No parsed files')
  const version = detectVersion(mainParsed.events.map(e => e.raw))
  const layout = detectLayout(hasSubagentDir, mainParsed.events.map(e => e.raw))

  // Derive entities
  const entities = deriveEntities(allEvents)

  // D1 fix: stamp transcriptFile onto agents that have a matching subagent JSONL.
  // derive.ts creates Agent entries from agentId fields but can't know file paths.
  // The subagent filenames are UUIDs matching the agentId they contain.
  const subagentFiles = files.slice(1).map(f => f.path) // everything after the main file
  for (const agent of entities.agents) {
    const match = subagentFiles.find(f => f.includes(agent.agentId))
    if (match) agent.transcriptFile = match
  }

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
  const sessionId = files[0]!.path.split(/[\\/]/).pop()?.replace('.jsonl', '') ?? 'unknown'

  return {
    id: sessionId,
    harness: { tool: 'claude-code', version, layout },
    capture: {
      level: captureLevel,
      flags,
      truncated: false,
      version,
    },
    truth: opts.truth ?? 'real',
    sources,
    events: allEvents,
    ...entities,
    unknowns: allUnknowns,
    costStates: allCostStates,
    rawApiRequestCount,
    ...(requests ? { requests } : {}),
  }
}
