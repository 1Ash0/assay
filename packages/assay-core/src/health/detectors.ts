import { Run } from '../schema/run.js'
import { Finding } from './types.js'

// ─── D5–D9 helpers ──────────────────────────────────────────────────────────

// Model context-window limits (inputTokens), sourced from Anthropic docs.
// Sources:
//   1M models: docs.anthropic.com/en/docs/build-with-claude/context-windows (Nov 2026)
//      claude-sonnet-4-6 (1M, per release notes Feb 17 2026), claude-sonnet-5-5,
//      claude-opus-5-5, claude-haiku-5-5, claude-fable-5-1
//   200K models: claude-haiku-4-5-20251001 (absent from 1M list; standard 200K window
//      for Haiku 4.x per April 2026 release notes)
//   <synthetic>: excluded — no real context limit applies
const CONTEXT_LIMITS: Record<string, number> = {
  'claude-sonnet-4-6':          1_000_000,
  'claude-haiku-4-5-20251001':    200_000,
  'claude-sonnet-5-5':          1_000_000,
  'claude-opus-5-5':            1_000_000,
  'claude-haiku-5-5':           1_000_000,
  'claude-fable-5-1':           1_000_000,
}
const SYNTHETIC_MODEL = '<synthetic>'

// D1 — subagent blind spot
// Fires when a tool result references an agentId but no agent transcript file was found.
export function d1SubagentBlindSpot(run: Run): Finding[] {
  const findings: Finding[] = []
  // Agents known from events
  const agentsWithFile = new Set(
    run.agents.filter(a => a.transcriptFile).map(a => a.agentId)
  )
  for (const agent of run.agents) {
    if (agent.type !== 'main' && !agentsWithFile.has(agent.agentId)) {
      findings.push({
        detectorId: 'D1',
        severity: 'warn',
        message: `Subagent ${agent.agentId} referenced but no transcript file found — token usage undercounted`,
        evidence: agent.evidence,
      })
    }
  }
  return findings
}

// D2 — usage double-count
// Fires when the same message.id appears in more than one LlmRequest.
// The importer already dedupes, but we verify here and report if raw event count
// differs from deduplicated count.
export function d2UsageDoubleCount(run: Run): Finding[] {
  const findings: Finding[] = []
  // Count raw assistant events per message id
  const rawCountById = new Map<string, number>()
  for (const ev of run.events) {
    if (ev.kind !== 'assistant') continue
    const obj = ev.raw as Record<string, unknown>
    const msg = obj['message'] as Record<string, unknown> | undefined
    const msgId = typeof msg?.['id'] === 'string' ? msg['id'] : ev.id
    rawCountById.set(msgId, (rawCountById.get(msgId) ?? 0) + 1)
  }
  for (const [msgId, count] of rawCountById) {
    if (count > 1) {
      const req = run.llmRequests.find(r => r.messageId === msgId)
      findings.push({
        detectorId: 'D2',
        severity: 'info',
        message: `message.id ${msgId} appears ${count}× in events; deduplicated to 1 LlmRequest. Summing all lines would inflate tokens ~${count}×`,
        evidence: req?.evidence ?? [],
      })
    }
  }
  return findings
}

// D3 — chain break
// parentUuid points to an absent uuid mid-file (GC or truncation).
// The first event in each source file is exempt: its parent lives in the
// preceding session and will always be absent when importing a single session.
export function d3ChainBreak(run: Run): Finding[] {
  const findings: Finding[] = []
  // Include UUIDs from unknowns — an unknown-type line (e.g. attachment, api-request)
  // is a real JSONL object that can be a valid parent even though we don't parse it fully.
  const unknownUuids = new Set<string>()
  for (const u of run.unknowns) {
    try {
      const obj = JSON.parse(u.raw) as Record<string, unknown>
      if (typeof obj['uuid'] === 'string') unknownUuids.add(obj['uuid'])
    } catch {
      // json-parse-error unknowns: no uuid to extract, skip
    }
  }
  const knownIds = new Set([...run.events.map(e => e.id), ...unknownUuids])

  // First event per source file — exempt from D3 (cross-session boundary)
  const firstEventPerFile = new Map<string, string>()
  for (const ev of run.events) {
    if (!firstEventPerFile.has(ev.sourceFile)) {
      firstEventPerFile.set(ev.sourceFile, ev.id)
    }
  }

  for (const ev of run.events) {
    if (!ev.parentId || knownIds.has(ev.parentId)) continue
    if (firstEventPerFile.get(ev.sourceFile) === ev.id) continue // session boundary
    findings.push({
      detectorId: 'D3',
      severity: 'warn',
      message: `Event ${ev.id} has parentId ${ev.parentId} which is not in this run — possible GC truncation`,
      evidence: [ev.offset],
    })
  }
  return findings
}

// D4 — orphan tool_use / tool_result
// Two legitimate exemptions:
//   in-flight: unmatched tool_use at end-of-file (session still running)
//   post-compaction: tool_result whose tool_use was in the compacted portion
export function d4OrphanTool(run: Run): Finding[] {
  const findings: Finding[] = []
  const resultIds = new Set(run.toolResults.map(r => r.toolUseId))
  const callIds = new Set(run.toolCalls.map(c => c.id))

  // Earliest line after which a compaction has occurred (tool_use may be gone)
  const postCompactionLine = run.compactions.length > 0
    ? Math.min(...run.compactions.map(c => c.summaryOffset?.line ?? Infinity))
    : Infinity

  // tool_use with no matching tool_result
  const lastEventOffset = run.events.at(-1)?.offset
  for (const call of run.toolCalls) {
    if (!resultIds.has(call.id)) {
      const callLine = call.evidence[0]?.line ?? 0
      const isInFlight =
        lastEventOffset !== undefined && callLine >= lastEventOffset.line - 2
      if (!isInFlight) {
        findings.push({
          detectorId: 'D4',
          severity: 'warn',
          message: `tool_use ${call.id} (${call.name}) has no matching tool_result`,
          evidence: call.evidence,
        })
      }
    }
  }

  // tool_result with no matching tool_use
  for (const result of run.toolResults) {
    if (!result.toolUseId || callIds.has(result.toolUseId)) continue
    const resultLine = result.evidence[0]?.line ?? 0
    // If a compaction occurred before this result, the tool_use may have been
    // in the compacted portion — not a defect
    if (resultLine > postCompactionLine) continue
    findings.push({
      detectorId: 'D4',
      severity: 'warn',
      message: `tool_result references tool_use_id ${result.toolUseId} which has no corresponding tool_use`,
      evidence: result.evidence,
    })
  }

  return findings
}

// ─── D5–D9 ──────────────────────────────────────────────────────────────────

// D5 — context-window overflow
// Reports any single request whose inputTokens exceeds the known model context limit.
// Also reports the session-average inputTokens if it exceeds the limit.
// Unknown model IDs or <synthetic> produce an info finding and no limit check.
// Source: CONTEXT_LIMITS table above.
export function d5ContextOverflow(run: Run): Finding[] {
  const findings: Finding[] = []

  // Build a fast msgId→model lookup from raw events
  const modelByMsgId = new Map<string, string>()
  for (const ev of run.events) {
    if (ev.kind !== 'assistant') continue
    const obj = ev.raw as Record<string, unknown>
    const msg = obj['message'] as Record<string, unknown> | undefined
    if (!msg) continue
    const mid = typeof msg['id'] === 'string' ? msg['id'] : ev.id
    if (!modelByMsgId.has(mid) && typeof msg['model'] === 'string') {
      modelByMsgId.set(mid, msg['model'])
    }
  }

  for (const req of run.llmRequests) {
    const model = modelByMsgId.get(req.messageId) ?? null

    if (!model || model === SYNTHETIC_MODEL) {
      findings.push({
        detectorId: 'D5',
        severity: 'info',
        message: `message ${req.messageId}: model unknown or synthetic — context-limit check skipped`,
        evidence: req.evidence,
      })
      continue
    }

    const limit = CONTEXT_LIMITS[model]
    if (limit === undefined) {
      findings.push({
        detectorId: 'D5',
        severity: 'info',
        message: `message ${req.messageId}: model "${model}" has no documented context limit — skipping overflow check`,
        evidence: req.evidence,
      })
      continue
    }

    if (req.usage.inputTokens > limit) {
      findings.push({
        detectorId: 'D5',
        severity: 'warn',
        message: `message ${req.messageId}: inputTokens ${req.usage.inputTokens} exceeds ${model} context limit ${limit}`,
        evidence: req.evidence,
      })
    }
  }

  // Session-average check per model
  const byModel = new Map<string, number[]>()
  for (const req of run.llmRequests) {
    const model = modelByMsgId.get(req.messageId)
    if (!model || model === SYNTHETIC_MODEL) continue
    const limit = CONTEXT_LIMITS[model]
    if (limit === undefined) continue
    const arr = byModel.get(model) ?? []
    arr.push(req.usage.inputTokens)
    byModel.set(model, arr)
  }
  for (const [model, inputs] of byModel) {
    const avg = inputs.reduce((a, b) => a + b, 0) / inputs.length
    const limit = CONTEXT_LIMITS[model]!
    if (avg > limit) {
      findings.push({
        detectorId: 'D5',
        severity: 'warn',
        message: `${model}: average inputTokens ${Math.round(avg)} exceeds context limit ${limit} across ${inputs.length} requests`,
        evidence: [],
      })
    }
  }

  return findings
}

// D6 — usage disagreement across raw duplicates
// Groups raw assistant events by message.id and compares inputTokens and outputTokens
// across duplicates. The importer now selects the max-usage occurrence; this detector
// reports when duplicates disagreed so the selection is auditable.
// Tolerance: inputTokens absolute diff > 1 = warn. outputTokens disagreement is
// reported as info (streaming-partial early records are expected).
export function d6UsageDisagreement(run: Run): Finding[] {
  const findings: Finding[] = []

  const byMsgId = new Map<string, Array<{ inp: number; out: number }>>()
  for (const ev of run.events) {
    if (ev.kind !== 'assistant') continue
    const obj = ev.raw as Record<string, unknown>
    const msg = obj['message'] as Record<string, unknown> | undefined
    if (!msg) continue
    const msgId = typeof msg['id'] === 'string' ? msg['id'] : ev.id
    const usage = msg['usage'] as Record<string, unknown> | undefined
    if (!usage) continue
    const inp = typeof usage['input_tokens'] === 'number' ? usage['input_tokens'] : 0
    const out = typeof usage['output_tokens'] === 'number' ? usage['output_tokens'] : 0
    const arr = byMsgId.get(msgId) ?? []
    arr.push({ inp, out })
    byMsgId.set(msgId, arr)
  }

  for (const [msgId, records] of byMsgId) {
    if (records.length < 2) continue
    const inpVals = records.map(r => r.inp)
    const outVals = records.map(r => r.out)
    const maxInpDiff = Math.max(...inpVals) - Math.min(...inpVals)
    const maxOutDiff = Math.max(...outVals) - Math.min(...outVals)

    const req = run.llmRequests.find(r => r.messageId === msgId)

    if (maxInpDiff > 1) {
      findings.push({
        detectorId: 'D6',
        severity: 'warn',
        message: `message.id ${msgId}: inputTokens disagree across ${records.length} duplicates (range ${Math.min(...inpVals)}–${Math.max(...inpVals)}); max-usage record selected`,
        evidence: req?.evidence ?? [],
      })
    }

    if (maxOutDiff > 0) {
      findings.push({
        detectorId: 'D6',
        severity: 'info',
        message: `message.id ${msgId}: outputTokens differ across ${records.length} duplicates (${Math.min(...outVals)}–${Math.max(...outVals)}); likely streaming-partial early records; max-usage record selected`,
        evidence: req?.evidence ?? [],
      })
    }
  }

  return findings
}

// D7 — token change at compaction
// Compares inputTokens of the closest LlmRequest before each compaction with the
// closest after. An increase is suspicious (post should be lower after summarization).
// Missing surrounding requests produce an info finding noting insufficient evidence.
export function d7CompactionTokenDrop(run: Run): Finding[] {
  const findings: Finding[] = []
  if (run.compactions.length === 0) return findings

  const reqsByLine: Array<{ line: number; req: typeof run.llmRequests[0] }> = []
  for (const req of run.llmRequests) {
    const line = req.evidence[0]?.line ?? 0
    reqsByLine.push({ line, req })
  }
  reqsByLine.sort((a, b) => a.line - b.line)

  for (const compaction of run.compactions) {
    const cLine = compaction.summaryOffset?.line ?? 0

    let pre: typeof run.llmRequests[0] | null = null
    for (let i = reqsByLine.length - 1; i >= 0; i--) {
      if (reqsByLine[i]!.line < cLine) { pre = reqsByLine[i]!.req; break }
    }

    let post: typeof run.llmRequests[0] | null = null
    for (const { line, req } of reqsByLine) {
      if (line > cLine) { post = req; break }
    }

    if (!pre || !post) {
      findings.push({
        detectorId: 'D7',
        severity: 'info',
        message: `compaction at line ${cLine}: ${!pre ? 'no preceding' : 'no following'} LlmRequest — insufficient evidence for token-change check`,
        evidence: compaction.evidence,
      })
      continue
    }

    const preInp = pre.usage.inputTokens
    const postInp = post.usage.inputTokens
    if (postInp > preInp) {
      findings.push({
        detectorId: 'D7',
        severity: 'info',
        message: `compaction at line ${cLine}: post-compaction inputTokens ${postInp} > pre-compaction ${preInp} (diff +${postInp - preInp}); may indicate a large tool result rather than failed compaction`,
        evidence: [...compaction.evidence, ...pre.evidence, ...post.evidence],
      })
    }
  }

  return findings
}

// D8 — session ID conflict within a source file
// Fires when a single source file contains more than one distinct non-empty sessionId.
// Different files having different IDs is expected for subagent files.
// Missing sessionIds are excluded from the conflict set.
export function d8SessionIdConflict(run: Run): Finding[] {
  const findings: Finding[] = []

  const byFile = new Map<string, Set<string>>()
  for (const ev of run.events) {
    if (!byFile.has(ev.sourceFile)) byFile.set(ev.sourceFile, new Set())
    if (ev.sessionId) byFile.get(ev.sourceFile)!.add(ev.sessionId)
  }

  for (const [file, ids] of byFile) {
    if (ids.size > 1) {
      findings.push({
        detectorId: 'D8',
        severity: 'warn',
        message: `Source file ${file}: ${ids.size} distinct sessionIds found (${[...ids].join(', ')}) — possible session boundary or mis-attributed events`,
        evidence: [],
      })
    }
  }

  return findings
}

// D9 — timestamp reversal
// Checks timestamps in JSONL order per source file. Reports the first backward
// transition per file. Equal timestamps are allowed (streaming duplicates). Events
// with no ts are skipped; comparison uses the nearest defined ts.
export function d9TimestampReversal(run: Run): Finding[] {
  const findings: Finding[] = []

  const byFile = new Map<string, typeof run.events>()
  for (const ev of run.events) {
    const arr = byFile.get(ev.sourceFile) ?? []
    arr.push(ev)
    byFile.set(ev.sourceFile, arr)
  }

  for (const [, evs] of byFile) {
    let prevTs: number | undefined
    let prevId: string | undefined
    for (const ev of evs) {
      if (ev.ts === undefined) continue
      if (prevTs !== undefined && ev.ts < prevTs) {
        findings.push({
          detectorId: 'D9',
          severity: 'info',
          message: `Timestamp reversal in ${ev.sourceFile}: event ${ev.id} (${new Date(ev.ts).toISOString()}) is before preceding ${prevId} (${new Date(prevTs).toISOString()})`,
          evidence: [ev.offset],
        })
        break // first reversal per file only
      }
      prevTs = ev.ts
      prevId = ev.id
    }
  }

  return findings
}
