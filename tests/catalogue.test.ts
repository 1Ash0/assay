import { resolve } from 'path'
import { describe, expect, it } from 'vitest'
import { census, diffCensus, importClaudeCodeDir, runHealth, versionSupport } from '../packages/assay-core/src/index.js'

const enc = new TextEncoder()
const file = (path: string, lines: object[]) => ({ path, bytes: enc.encode(lines.map(l => JSON.stringify(l)).join('\n') + '\n') })

describe('version support (Rule 7)', () => {
  it('separates checked, in-range, outside and missing versions', () => {
    expect(versionSupport('2.1.309')).toBe('checked')
    expect(versionSupport('2.1.310')).toBe('in-range-unchecked')
    expect(versionSupport('2.1.400')).toBe('outside-range')
    expect(versionSupport('2.0.9')).toBe('outside-range')
    expect(versionSupport('nightly')).toBe('outside-range')
    expect(versionSupport(undefined)).toBe('no-version')
  })

  it('D0 warns on a run with no version and puts the state on the card', () => {
    const report = runHealth(importClaudeCodeDir(resolve('fixtures/scripted/subagent/sess-sub.jsonl')))
    expect(report.findings.filter(f => f.detectorId === 'D0').map(f => f.severity)).toEqual(['warn'])
    expect(report.validity.version.support).toBe('no-version')
    expect(report.overall).not.toBe('trustworthy')
  })

  it('D0 stays silent on a checked version', () => {
    const report = runHealth(importClaudeCodeDir(resolve('fixtures/scripted/catalogue.jsonl')))
    expect(report.findings.some(f => f.detectorId === 'D0')).toBe(false)
    expect(report.validity.version).toEqual({ value: '2.1.308', support: 'checked', range: '2.1.165–2.1.316' })
  })
})

describe('format census', () => {
  const c = census([
    file('a.jsonl', [{ type: 'user', version: '2.1.308', uuid: 'u' }, { type: 'mode' }]),
    file('b.jsonl', [{ type: 'user', version: '2.1.309', uuid: 'u', slug: 's' }, { type: 'tools-used', version: '2.1.309' }]),
    file('c.jsonl', [{ type: 'user', version: '2.1.316', uuid: 'u' }]),
  ])

  it('groups lines by version; a line without one takes its file\'s first version', () => {
    expect(c.map(v => [v.version, v.lines])).toEqual([['2.1.308', 2], ['2.1.309', 2], ['2.1.316', 1]])
    expect(c[0]!.types['mode']!.count).toBe(1)
  })

  it('flags a type or field once, where it first appears, and never reports absence', () => {
    const d = diffCensus(c)
    expect(d[1]).toMatchObject({ newTypes: ['tools-used'], newFields: { user: ['slug'] } })
    // 2.1.316 lacks `slug` and `tools-used`; that is sampling, not a change.
    expect(d[2]).toMatchObject({ newTypes: [], newFields: {} })
  })
})
