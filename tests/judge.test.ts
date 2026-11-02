import { describe, expect, it } from 'vitest'
import { auroc, bestF1Threshold, confusion, ece, reliability } from '../packages/assay-core/src/judge/calibration.js'
import { redactForJudge } from '../packages/assay-core/src/judge/judge.js'

describe('calibration maths', () => {
  it('ECE is zero for a perfectly calibrated set and large for an overconfident one', () => {
    expect(ece([{ p: 0.25, y: 0 }, { p: 0.25, y: 0 }, { p: 0.25, y: 0 }, { p: 0.25, y: 1 }])).toBeCloseTo(0, 10)
    expect(ece([{ p: 0.95, y: 0 }, { p: 0.95, y: 0 }])).toBeCloseTo(0.95, 10)
  })

  it('puts p = 1 in the last bin and reports empty bins as null', () => {
    const r = reliability([{ p: 1, y: 1 }])
    expect(r[9]).toMatchObject({ n: 1, meanP: 1, rate: 1 })
    expect(r[0]).toMatchObject({ n: 0, meanP: null })
  })

  it('AUROC: 1 for perfect ranking, 0.5 for ties, 0 for inverted', () => {
    expect(auroc([{ p: 0.9, y: 1 }, { p: 0.1, y: 0 }])).toBe(1)
    expect(auroc([{ p: 0.5, y: 1 }, { p: 0.5, y: 0 }])).toBe(0.5)
    expect(auroc([{ p: 0.1, y: 1 }, { p: 0.9, y: 0 }])).toBe(0)
  })

  it('chooses the F1-best threshold and reports precision and recall there', () => {
    const xs = [{ p: 0.9, y: 1 }, { p: 0.8, y: 1 }, { p: 0.6, y: 0 }, { p: 0.2, y: 0 }] as const
    expect(bestF1Threshold([...xs])).toBe(0.8)
    expect(confusion([...xs], 0.8)).toMatchObject({ tp: 2, fp: 0, precision: 1, recall: 1 })
  })
})

describe('judge redaction (Rule 6)', () => {
  it('drops identity fields and masks emails, keys and home paths', () => {
    // A fake key in a real key's shape, assembled at runtime so no key-shaped
    // string sits in the public source (scripts/public-check.mjs).
    const fakeKey = ['gsk', 'abcdefghijklmnopqrstuv'].join('_')
    const out = redactForJudge({
      resource_attributes: { 'pat.account.id': 'x' },
      span_attributes: { 'pat.account.id': 'a', text: `mail me@x.com key ${fakeKey} at C:\\Users\\bob\\f.txt` },
    }) as { span_attributes: Record<string, string> }
    expect(out).not.toHaveProperty('resource_attributes')
    expect(out.span_attributes).not.toHaveProperty('pat.account.id')
    expect(out.span_attributes['text']).toBe('mail ‹email› key ‹key› at ‹home›\\f.txt')
  })
})
