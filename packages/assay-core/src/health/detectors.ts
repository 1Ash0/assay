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
// parentUuid points to an absent uuid (GC or truncation).
export function d3ChainBreak(run: Run): Finding[] {
  const findings: Finding[] = []
  const knownIds = new Set(run.events.map(e => e.id))
  for (const ev of run.events) {
    if (ev.parentId && !knownIds.has(ev.parentId)) {
      findings.push({
        detectorId: 'D3',
        severity: 'warn',
        message: `Event ${ev.id} has parentId ${ev.parentId} which is not in this run — possible GC truncation`,
        evidence: [ev.offset],
      })
    }
  }
  return findings
}

// D4 — orphan tool_use / tool_result
// An unmatched tool_use at end-of-file is in-flight (not a defect).
export function d4OrphanTool(run: Run): Finding[] {
  const findings: Finding[] = []
  const resultIds = new Set(run.toolResults.map(r => r.toolUseId))
  const callIds = new Set(run.toolCalls.map(c => c.id))

  // tool_use with no matching tool_result
  const lastEventOffset = run.events.at(-1)?.offset
  for (const call of run.toolCalls) {
    if (!resultIds.has(call.id)) {
      // in-flight if this call is at the very end of the file
      const isInFlight =
        call.evidence[0] !== undefined &&
        lastEventOffset !== undefined &&
        call.evidence[0].line >= lastEventOffset.line - 2
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
    if (result.toolUseId && !callIds.has(result.toolUseId)) {
      findings.push({
        detectorId: 'D4',
        severity: 'warn',
        message: `tool_result references tool_use_id ${result.toolUseId} which has no corresponding tool_use`,
        evidence: result.evidence,
      })
    }
  }

  return findings
}
