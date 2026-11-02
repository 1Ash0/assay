import { createHash } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { importClaudeCodeDir, runHealth } from '../packages/assay-core/src/index.js'

// Version canaries (M4_PLAN §4a, 2d): one real session per tracked Claude Code
// version, frozen in the local corpus. Only a hash of what the importer and
// Health derive from it is committed (Rule 8: the session itself never enters
// the repo). If a code change moves any derived number, the hash moves and
// this fails until the change is acknowledged: rerun with CANARY_UPDATE=1 and
// add a CHANGES.md line or ADR saying why the output changed.
// Skipped, visibly, on a machine without the corpus.
const CANARIES: Record<string, string> = {
  '2.1.165': 'corpus/frozen/E--SPARK/dc47743b-7c35-402c-98ac-3d0057537c05.jsonl',
  '2.1.177': 'corpus/frozen/E--SPARK-Paper2/37216832-7dd8-45e9-b230-c2c9c5b5403c.jsonl',
  '2.1.299': 'corpus/frozen/E--RL/9e6a9543-0d5d-4a8a-9d76-d51b83368c61.jsonl',
  '2.1.301': 'corpus/frozen/e--m26-mp2-2026121006/3620a96a-e976-4e0d-81e8-a14359aee837.jsonl',
  '2.1.308': 'corpus/frozen/E--assay/6973b17c-2043-40dd-9ddd-5a5e95d7727a.jsonl',
  '2.1.309': 'corpus/frozen/E--assay/334cd181-c965-40bb-ae91-a1aef63fd80f.jsonl',
  '2.1.316': 'corpus/frozen/E--assay/cae68025-c82f-4c24-8d87-3c23dd0a60a5.jsonl',
}
const STORE = resolve('tests/canary.json')

// Everything a published number is made from, without paths or content.
function summary(path: string) {
  const run = importClaudeCodeDir(resolve(path))
  const h = runHealth(run)
  const { caveats: _c, ...card } = h.validity
  const strip = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (k, x) => (k === 'file' ? undefined : x)))
  return strip({
    version: run.harness.version, layout: run.harness.layout, capture: run.capture.level,
    events: run.events.length, unknowns: run.unknowns.length,
    llmRequests: run.llmRequests.map(q => [q.messageId, q.usage]),
    toolCalls: run.toolCalls.length, toolResults: run.toolResults.length, agents: run.agents.length,
    seals: run.requests?.records.map(r => r.seal) ?? null,
    findings: h.findings.map(f => [f.detectorId, f.severity, f.message]),
    verdicts: h.verdicts, overall: h.overall, card,
  })
}
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')

const present = Object.values(CANARIES).every(p => existsSync(resolve(p)))
describe.skipIf(!present)('version canaries (local corpus)', () => {
  const stored = existsSync(STORE) ? (JSON.parse(readFileSync(STORE, 'utf-8')) as Record<string, string>) : {}
  const now = Object.fromEntries(Object.entries(CANARIES).map(([v, p]) => [v, hash(summary(p))]))
  if (process.env['CANARY_UPDATE'] === '1') writeFileSync(STORE, JSON.stringify(now, null, 2) + '\n')

  for (const v of Object.keys(CANARIES)) {
    it(`importer output for ${v} is unchanged`, () => {
      expect(now[v], `canary ${v} moved: rerun with CANARY_UPDATE=1 and record why in CHANGES.md`).toBe(stored[v])
    })
  }
})
