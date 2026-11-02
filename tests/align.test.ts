import { describe, expect, it } from 'vitest'
import { align, stepKey } from '../packages/assay-core/src/index.js'

const s = (...names: string[]) => ({ tools: names.map(name => ({ name })) })

describe('Run Diff alignment (T3 preregistration)', () => {
  it('treats parallel calls in one turn as unordered', () => {
    expect(stepKey(s('Read', 'Bash'))).toBe(stepKey(s('Bash', 'Read')))
  })

  it('finds no divergence for identical runs', () => {
    const r = [s('Read'), s('Bash', 'Read'), s()]
    expect(align(r, r)).toMatchObject({ matched: 3, onlyA: 0, onlyB: 0, firstDivergence: null })
  })

  it('aligns around an extra step and reports where the runs first differ', () => {
    const a = [s('Read'), s('Edit'), s('Bash')]
    const b = [s('Read'), s('Grep'), s('Edit'), s('Bash')]
    const r = align(a, b)
    expect(r.firstDivergence).toBe(1)
    expect(r.matched).toBe(3)
    expect(r.pairs).toEqual([{ a: 0, b: 0 }, { a: null, b: 1 }, { a: 1, b: 2 }, { a: 2, b: 3 }])
  })

  it('reports a shorter run as diverging where it ends', () => {
    expect(align([s('Read'), s('Bash')], [s('Read')]).firstDivergence).toBe(1)
  })
})
