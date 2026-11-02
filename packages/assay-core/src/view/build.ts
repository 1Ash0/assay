import { HealthReport } from '../health/types.js'
import { CONTEXT_LIMITS } from '../health/detectors.js'
import { Run, Truth } from '../schema/index.js'
import { basename, redact, stripPaths } from './redact.js'
import { buildSpine } from './spine.js'

// The site's view of one run (ADR-020). Every number the site shows comes
// from here; the site itself only lays it out. Field names match what the
// prototype read from extract.py, so the bench needs no rewrite.
export const SEGMENTS = 140

export interface ViewOptions {
  // Short id the site uses (defaults to the first 8 chars of the session id).
  id?: string
  // Relabel truth when the run was imported without it (e.g. perturbed copies).
  truth?: Truth
  // Where the run's health result lives, shown as its source on the site.
  file?: string
}

type Band = { user: number; assistant: number; system: number; other: number; unknown: number; f: Record<string, number>; n: number; nc: number }

function usageOf(raw: unknown): [number, number, number, number] | null {
  const msg = (raw as Record<string, unknown>)?.['message'] as Record<string, unknown> | undefined
  const u = msg?.['usage'] as Record<string, number> | undefined
  if (!u) return null
  return [u['input_tokens'] ?? 0, u['cache_read_input_tokens'] ?? 0, u['cache_creation_input_tokens'] ?? 0, u['output_tokens'] ?? 0]
}

function counter<T>(xs: T[], top: number): Array<[T, number]> {
  const m = new Map<T, number>()
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1)
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, top)
}

export function buildRunView(run: Run, report: HealthReport, opts: ViewOptions = {}) {
  const totalLines = Math.max(1, ...run.sources.map(s => s.lines))
  const seg = (line: number) => Math.min(SEGMENTS - 1, Math.floor((line / totalLines) * SEGMENTS))
  const byLine = new Map<number, unknown>()
  for (const e of run.events) if (!byLine.has(e.offset.line)) byLine.set(e.offset.line, e.raw)
  const unkByLine = new Map(run.unknowns.map(u => [u.offset.line, u] as const))

  const band: Band[] = Array.from({ length: SEGMENTS }, () => ({ user: 0, assistant: 0, system: 0, other: 0, unknown: 0, f: {}, n: 0, nc: 0 }))
  for (const e of run.events) {
    const k = e.kind === 'user' || e.kind === 'assistant' || e.kind === 'system' ? e.kind : 'other'
    band[seg(e.offset.line)]![k]++
  }
  for (const u of run.unknowns) band[seg(u.offset.line)]!.unknown++

  type Item = { msg: string; ev: Array<{ file: string; line: number; b0: number; b1: number }>; raw?: unknown }
  const findings = new Map<string, { id: string; severity: string; count: number; ci?: boolean; items: Item[] }>()
  for (const f of report.findings) {
    const ent = findings.get(f.detectorId) ?? { id: f.detectorId, severity: f.severity, count: 0, items: [] }
    findings.set(f.detectorId, ent)
    ent.count++
    if (f.severity === 'warn') ent.severity = 'warn'
    if (f.captureIntegrity) ent.ci = true
    const line = f.evidence[0]?.line
    if (line !== undefined) band[seg(line)]!.f[f.detectorId] = (band[seg(line)]!.f[f.detectorId] ?? 0) + 1
    if (ent.items.length >= 60) continue
    const item: Item = {
      msg: stripPaths(f.message),
      ev: f.evidence.slice(0, 3).map(x => ({ file: basename(x.file), line: x.line, b0: x.byteStart, b1: x.byteEnd })),
    }
    if (ent.items.length < 25 && line !== undefined) {
      let raw = byLine.get(line)
      const unk = unkByLine.get(line)
      if (raw === undefined && unk) { try { raw = JSON.parse(unk.raw) } catch { raw = undefined } }
      if (raw !== undefined) item.raw = redact(raw)
    }
    ent.items.push(item)
  }

  // Naive = every assistant line's usage summed as written; dedup = LlmRequests.
  const naive = [0, 0, 0, 0]
  for (const e of run.events) {
    if (e.kind !== 'assistant') continue
    const u = usageOf(e.raw)
    if (!u) continue
    for (let i = 0; i < 4; i++) naive[i]! += u[i]!
    const b = band[seg(e.offset.line)]!
    b.n += u[3]
    b.nc += u[0] + u[1] + u[2]
  }
  const reqs = run.llmRequests.map(q => [q.evidence[0]?.line ?? 0, q.usage.inputTokens, q.usage.cacheReadTokens, q.usage.cacheWriteTokens, q.usage.outputTokens])
  const dedup = [1, 2, 3, 4].map(i => reqs.reduce((s, r) => s + (r[i] ?? 0), 0))

  const firstUnk = run.unknowns[0]
  let unknownSample = null
  if (firstUnk) {
    try {
      unknownSample = { line: firstUnk.offset.line, b0: firstUnk.offset.byteStart, b1: firstUnk.offset.byteEnd, reason: firstUnk.reason, raw: redact(JSON.parse(firstUnk.raw)) }
    } catch { /* not JSON: no sample */ }
  }

  const seen = new Set<string>()
  const modelIds: string[] = []
  for (const e of run.events) {
    if (e.kind !== 'assistant') continue
    const m = (e.raw as Record<string, unknown>)['message'] as Record<string, unknown> | undefined
    const id = m?.['id']
    if (typeof id === 'string' && !seen.has(id)) { seen.add(id); modelIds.push(typeof m?.['model'] === 'string' ? m['model'] as string : '?') }
  }
  const models = counter(modelIds, 4)
  const mainModel = models[0]?.[0] ?? null
  const ts = run.events.map(e => e.ts).filter((t): t is number => typeof t === 'number' && !Number.isNaN(t))
  const v = report.validity
  const src = run.sources[0]!

  return {
    hallmark: {
      fineness: v.fineness.value, bound: v.fineness.bound, rates: v.fineness.rates,
      firstTs: ts.length ? Math.min(...ts) : null, model: mainModel,
      contextLimit: mainModel ? CONTEXT_LIMITS[mainModel] ?? null : null,
    },
    models,
    id: opts.id ?? run.id.slice(0, 8),
    session: run.id,
    file: opts.file ?? basename(run.sources[0]!.path),
    truth: opts.truth ?? run.truth,
    harness: run.harness,
    capture: run.capture,
    source: { file: basename(src.path), sha256: src.sha256, bytes: run.sources.reduce((s, x) => s + x.bytes, 0), lines: totalLines, count: run.sources.length },
    counts: {
      events: run.events.length, llm: run.llmRequests.length, tools: run.toolCalls.length, agents: run.agents.length,
      compactions: run.compactions.length, skills: run.skills.length, unknowns: run.unknowns.length, edges: run.edges.length,
      observed: run.edges.filter(e => e.kind === 'observed').length, matched: run.edges.filter(e => e.kind === 'matched').length,
    },
    verdicts: report.verdicts,
    overall: report.overall,
    validity: { ...v, caveats: v.caveats.map(stripPaths) },
    findings: [...findings.values()].sort((a, b) => a.id.localeCompare(b.id)),
    band,
    reqs,
    compactions: run.compactions.map(c => c.evidence[0]?.line).filter((l): l is number => l !== undefined),
    naive,
    dedup,
    tools: counter(run.toolCalls.map(t => t.name), 10),
    unknownReasons: counter(run.unknowns.map(u => u.reason), 8),
    unknownSample,
    rawApi: run.rawApiRequestCount,
    spine: buildSpine(run, report),
    // M4 fills these per run; null means not reconstructed / not traced yet.
    m4: { reconstruction: null, provenance: null },
  }
}

export type RunView = ReturnType<typeof buildRunView>
