import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { importClaudeCodeDir, runHealth } from '../packages/assay-core/src/index.js'
import { assertRules, card, checkExit, parseRules } from '../packages/assay-cli/src/check.js'

const REQ = resolve('fixtures/scripted/requests/sc-req.jsonl')

describe('assay check', () => {
  const run = importClaudeCodeDir(REQ, { truth: 'scripted' })
  const h = runHealth(run)

  it('states the Capture Level on the first line, before any number (Rule 1)', () => {
    expect(card(run, h).split('\n')[0]).toMatch(/^capture {3}L1 of L4 · truth scripted/)
  })

  it('exits 2 when a request record disagrees with itself', () => {
    expect(h.validity.requests!.broken).toBe(1)
    expect(checkExit(h)).toBe(2)
  })
})

describe('assay assert', () => {
  const run = importClaudeCodeDir(REQ, { truth: 'scripted' })
  const h = runHealth(run)

  it('passes an empty rule set and reports each broken rule', () => {
    expect(assertRules(run, h, {})).toEqual([])
    const fails = assertRules(run, h, { minCaptureLevel: 3, forbidDetectors: ['D11'], minSealedShare: 0.9 })
    expect(fails.map(f => f.rule).sort()).toEqual(['forbidDetectors', 'forbidDetectors', 'minCaptureLevel', 'minSealedShare'])
    expect(fails.find(f => f.rule === 'forbidDetectors')!.line).toBeGreaterThan(0)
  })

  it('rejects an unknown rule name instead of ignoring it', () => {
    expect(() => parseRules('{"minCaptureLevl": 3}')).toThrow(/unknown rule/)
    expect(parseRules('{"$schema": "x", "minCaptureLevel": 1}')).toMatchObject({ minCaptureLevel: 1 })
  })
})
