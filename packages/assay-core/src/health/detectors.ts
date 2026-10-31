import { Run } from '../schema/run.js'
import { Finding } from './types.js'

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
