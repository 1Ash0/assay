import { Offset } from '../../schema/offset.js'
import { OtelApiRequest, Run } from '../../schema/index.js'
import { sha256Hex } from '../claude-code-jsonl/sha256.js'

// OTLP JSON file-exporter output (one ExportLogsServiceRequest or
// ExportTraceServiceRequest per line), Claude Code profile. fs-free like the
// JSONL importer (ADR-019). Attaching OTel to a run raises it to L3 (ADR-025).
//
// Records are joined to the JSONL only by exact ids: session.id selects the
// run, request_id matches an LlmRequest's requestRef. An api_request with no
// JSONL counterpart is an internal request the transcript never wrote (R1-F2).

const decoder = new TextDecoder('utf-8')

type AnyValue = { stringValue?: string; intValue?: string | number; doubleValue?: number; boolValue?: boolean }
type KV = { key: string; value: AnyValue }

function attrs(list: KV[] | undefined): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const { key, value } of list ?? []) {
    const v = value.stringValue ?? value.intValue ?? value.doubleValue ?? value.boolValue
    if (v !== undefined) out[key] = v
  }
  return out
}

const n = (v: unknown) => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' && !Number.isNaN(+v) ? +v : 0)

export interface OtlpFile { path: string; bytes: Uint8Array }

export function attachOtlp(run: Run, files: OtlpFile[]): Run {
  const sessionId = run.id
  const apiRequests: OtelApiRequest[] = []
  let logRecords = 0, spans = 0, otherSessions = 0
  const sources = [...run.sources]

  for (const f of files) {
    const raw = f.bytes
    let line = 0, start = 0
    while (start <= raw.length) {
      let nl = raw.indexOf(0x0a, start)
      if (nl === -1) nl = raw.length
      const text = decoder.decode(raw.subarray(start, nl)).trim()
      const offset: Offset = { file: f.path, line, byteStart: start, byteEnd: nl }
      if (text) {
        const doc = JSON.parse(text) as Record<string, unknown>
        for (const rl of (doc['resourceLogs'] as Array<Record<string, unknown>>) ?? []) {
          for (const sl of (rl['scopeLogs'] as Array<Record<string, unknown>>) ?? []) {
            for (const lr of (sl['logRecords'] as Array<Record<string, unknown>>) ?? []) {
              const a = attrs(lr['attributes'] as KV[])
              if (a['session.id'] !== sessionId) { otherSessions++; continue }
              logRecords++
              if (a['event.name'] !== 'api_request') continue
              apiRequests.push({
                evidence: [offset],
                requestId: String(a['request_id'] ?? ''),
                model: String(a['model'] ?? ''),
                inputTokens: n(a['input_tokens']),
                outputTokens: n(a['output_tokens']),
                cacheReadTokens: n(a['cache_read_tokens']),
                cacheWriteTokens: n(a['cache_creation_tokens']),
                costUSD: n(a['cost_usd']),
                durationMs: n(a['duration_ms']),
                querySource: String(a['query_source'] ?? ''),
                inTranscript: false,
              })
            }
          }
        }
        for (const rs of (doc['resourceSpans'] as Array<Record<string, unknown>>) ?? []) {
          for (const ss of (rs['scopeSpans'] as Array<Record<string, unknown>>) ?? []) {
            for (const sp of (ss['spans'] as Array<Record<string, unknown>>) ?? []) {
              if (attrs(sp['attributes'] as KV[])['session.id'] === sessionId) spans++
              else otherSessions++
            }
          }
        }
      }
      line++
      start = nl + 1
    }
    sources.push({ kind: 'otlp', path: f.path, sha256: sha256Hex(raw), bytes: raw.length, lines: line })
  }

  const transcriptRefs = new Set(run.llmRequests.map(r => r.requestRef).filter((x): x is string => Boolean(x)))
  for (const q of apiRequests) q.inTranscript = transcriptRefs.has(q.requestId)

  const seen = apiRequests.length > 0 || spans > 0
  return {
    ...run,
    sources,
    capture: seen ? { ...run.capture, level: Math.max(run.capture.level, 3) as 3 | 4 } : run.capture,
    otel: { apiRequests, logRecords, spans, otherSessionRecords: otherSessions },
  }
}
