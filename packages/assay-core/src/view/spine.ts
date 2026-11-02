import { HealthReport } from '../health/types.js'
import { Run } from '../schema/index.js'
import { basename } from './redact.js'

// The spine (M3_PLAN §5): one step per LlmRequest in transcript order. Traverse,
// Replay and Run Diff are all readings of it, so a selected step carries
// across views. Times are joined from the event at each evidence line; tool
// latency is observed (result ts − call ts), never estimated.
//
// `context` and `provenance` are the M4 slots: reconstruction (what the model
// had in context at this step, R2) and exact-match provenance. They are null
// until M4 fills them, and the site draws them as "not reconstructed".

export interface SpineTool {
  name: string
  id: string
  line: number
  // Line of the matching tool_result, or null when none was captured (D4).
  resultLine: number | null
  // Observed latency in ms; null when either timestamp is missing.
  ms: number | null
  isError: boolean
  // 'observed' when an explicit id link exists; tools never get inferred links.
  edge: 'observed' | null
}

export interface SpineStep {
  i: number
  line: number
  file: string
  b0: number
  b1: number
  ts: number | null
  agent: string
  epoch: number
  usage: [number, number, number, number] // input, cache read, cache write, output
  tools: SpineTool[]
  findings: string[] // detector ids anchored on this step's line
  context: null
  provenance: null
}

export function buildSpine(run: Run, report: HealthReport) {
  const tsByLine = new Map<string, number>()
  const agentByLine = new Map<string, string>()
  const key = (file: string, line: number) => `${file}\u0000${line}`
  for (const e of run.events) {
    const k = key(e.offset.file, e.offset.line)
    if (typeof e.ts === 'number' && !Number.isNaN(e.ts)) tsByLine.set(k, e.ts)
    if (e.agentId) agentByLine.set(k, e.agentId)
  }
  const tsOf = (o?: { file: string; line: number }) => (o ? tsByLine.get(key(o.file, o.line)) ?? null : null)

  const resultByUse = new Map(run.toolResults.map(r => [r.toolUseId, r]))
  const toolsByMsg = new Map<string, SpineTool[]>()
  for (const c of run.toolCalls) {
    const r = resultByUse.get(c.id)
    const t0 = tsOf(c.evidence[0]), t1 = tsOf(r?.evidence[0])
    const list = toolsByMsg.get(c.messageId) ?? []
    list.push({
      name: c.name, id: c.id, line: c.evidence[0]?.line ?? 0,
      resultLine: r?.evidence[0]?.line ?? null,
      ms: t0 !== null && t1 !== null ? t1 - t0 : null,
      isError: r?.isError ?? false,
      // A ToolResult exists only when its tool_use_id matched this call exactly.
      edge: r ? 'observed' : null,
    })
    toolsByMsg.set(c.messageId, list)
  }

  const findingLines = new Map<string, Set<string>>()
  for (const f of report.findings) {
    const o = f.evidence[0]
    if (!o) continue
    const k = key(o.file, o.line)
    const s = findingLines.get(k) ?? new Set<string>()
    s.add(f.detectorId)
    findingLines.set(k, s)
  }

  // Compaction lines cut the main transcript into epochs.
  const cuts = run.compactions.map(c => c.evidence[0]?.line ?? 0).sort((a, b) => a - b)
  const mainFile = run.sources[0]?.path
  const reqs = [...run.llmRequests].sort((a, b) => {
    const ea = a.evidence[0], eb = b.evidence[0]
    const fa = ea?.file === mainFile ? 0 : 1, fb = eb?.file === mainFile ? 0 : 1
    return fa - fb || (ea?.line ?? 0) - (eb?.line ?? 0)
  })

  const steps: SpineStep[] = reqs.map((q, i) => {
    const o = q.evidence[0]!
    const k = key(o.file, o.line)
    return {
      i, line: o.line, file: basename(o.file), b0: o.byteStart, b1: o.byteEnd,
      ts: tsByLine.get(k) ?? null,
      agent: agentByLine.get(k) ?? 'main',
      epoch: o.file === mainFile ? cuts.filter(c => c <= o.line).length : 0,
      usage: [q.usage.inputTokens, q.usage.cacheReadTokens, q.usage.cacheWriteTokens, q.usage.outputTokens],
      tools: (toolsByMsg.get(q.messageId) ?? []).sort((a, b) => a.line - b.line),
      findings: [...(findingLines.get(k) ?? [])].sort(),
      context: null,
      provenance: null,
    }
  })

  const agents = run.agents.map(a => ({
    id: a.agentId, type: a.type, parent: a.parentAgentId ?? null, transcript: Boolean(a.transcriptFile),
  }))

  // Run Diff key (M3 stub, M4 full): the tool-name sequence. Two runs are
  // compared by exact equality only (Rule 5); the first index where the
  // sequences differ is the first divergence.
  const toolSequence = steps.flatMap(s => s.tools.map(t => t.name))

  return { steps, agents, epochs: cuts.length + 1, toolSequence }
}

export type Spine = ReturnType<typeof buildSpine>

// First index where two sequences differ, or null when identical.
export function firstDivergence(a: string[], b: string[]): number | null {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i
  return a.length === b.length ? null : n
}
