import { readFileSync } from 'fs'
import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { importTrail, runHealth } from '../packages/assay-core/src/index.js'
import { spanOffsets } from '../packages/assay-core/src/importers/trail/offsets.js'

// Scripted TRAIL-format trace (truth: scripted; the real dataset is gated and
// never committed). It holds, by construction, every quirk the real data
// showed: an AGENT total that disagrees with its LLM calls, an LLM call with no
// token counts, a failed TOOL span with a truncation marker, a nested log
// record repeating its span's id, and one span id used twice.
const PATH = resolve('fixtures/scripted/trail/sc-trail.json')
const bytes = new Uint8Array(readFileSync(PATH))
const run = importTrail({ path: PATH, bytes }, { truth: 'scripted' })
const h = runHealth(run)

describe('TRAIL byte offsets (Rule 4)', () => {
  it('gives each span its own object, not a nested log record with the same id', () => {
    const o = spanOffsets(PATH, bytes)
    for (const id of ['s0000002', 's0000005', 's0000007']) {
      const obj = JSON.parse(new TextDecoder().decode(bytes.subarray(o.get(id)!.byteStart, o.get(id)!.byteEnd)))
      expect(obj.span_id).toBe(id)
      expect(obj).toHaveProperty('span_name')
    }
  })
})

describe('TRAIL importer (ADR-037)', () => {
  it('maps LLM, TOOL and AGENT spans, and links every span to its parent by an observed edge', () => {
    expect(run.harness).toMatchObject({ tool: 'openinference-smolagents', version: '0.1.8' })
    expect(run.capture).toMatchObject({ level: 3, truncated: true })
    expect(run.llmRequests.map(q => q.messageId)).toEqual(['s0000003', 's0000004'])
    expect(run.llmRequests[0]!.model).toBe('o3-mini')
    expect(run.toolResults).toEqual([expect.objectContaining({ toolUseId: 's0000005', isError: true })])
    expect(run.agents.map(a => a.agentId)).toEqual(['s0000002'])
    expect(run.edges.every(e => e.kind === 'observed')).toBe(true)
  })

  it('keeps a repeated span id as a flagged unknown line, not counted', () => {
    expect(run.unknowns.map(u => u.reason)).toEqual(['trail:duplicate-span-id'])
    expect(run.llmRequests.reduce((s, q) => s + q.usage.inputTokens, 0)).toBe(300)
  })

  it('counts an LLM call without token counts against usage coverage', () => {
    expect(h.validity.fineness.rates['usage coverage']).toBeCloseTo(2 / 3, 5)
  })
})

describe('Health on TRAIL', () => {
  it('D12 reports the agent total that disagrees with its LLM calls', () => {
    const d12 = h.findings.filter(f => f.detectorId === 'D12')
    expect(d12).toHaveLength(1)
    expect(d12[0]!.message).toMatch(/reports 100 tokens; the LLM calls beneath it total 350/)
  })

  it('does not apply D1, whose premise is Claude Code subagent files', () => {
    expect(h.findings.some(f => f.detectorId === 'D1')).toBe(false)
  })

  it('checks the version against this importer, and says content was truncated', () => {
    expect(h.validity.version).toEqual({ value: '0.1.8', support: 'checked', range: '0.1.6–0.1.8' })
    expect(h.validity.caveats.some(c => /truncated at the source/.test(c))).toBe(true)
  })
})
