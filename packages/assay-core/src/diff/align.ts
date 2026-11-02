// Run Diff alignment (docs/experiments/T3-diff-stability-v1.md, ADR-034).
// A step's key is the sorted multiset of its tool-call names: calls made in
// parallel in one turn have no meaningful order, so ordering them would make
// a benign reordering look like a divergence. Two runs are aligned by longest
// common subsequence over keys, with exact key equality only (Rule 5). Keys
// ignore tool inputs on purpose; where inputs differ is provenance's question.

export interface StepLike { tools: { name: string }[] }

export function stepKey(s: StepLike): string {
  return s.tools.map(t => t.name).sort().join('+')
}

export type Pair = { a: number | null; b: number | null }

export interface Alignment {
  pairs: Pair[]             // in order; a or b null where one side has a step the other lacks
  matched: number
  onlyA: number
  onlyB: number
  firstDivergence: number | null // first index where the key sequences differ
}

export function align(a: StepLike[], b: StepLike[]): Alignment {
  const ka = a.map(stepKey), kb = b.map(stepKey)
  const n = ka.length, m = kb.length
  // LCS table, bottom-up; Uint32 keeps a 1,000 x 1,000 alignment small.
  const w = m + 1
  const L = new Uint32Array((n + 1) * w)
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i * w + j] = ka[i] === kb[j] ? L[(i + 1) * w + j + 1]! + 1 : Math.max(L[(i + 1) * w + j]!, L[i * w + j + 1]!)
    }
  }
  const pairs: Pair[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (ka[i] === kb[j]) { pairs.push({ a: i++, b: j++ }) }
    else if (L[(i + 1) * w + j]! >= L[i * w + j + 1]!) pairs.push({ a: i++, b: null })
    else pairs.push({ a: null, b: j++ })
  }
  while (i < n) pairs.push({ a: i++, b: null })
  while (j < m) pairs.push({ a: null, b: j++ })

  let first: number | null = null
  for (let k = 0; k < Math.min(n, m); k++) if (ka[k] !== kb[k]) { first = k; break }
  if (first === null && n !== m) first = Math.min(n, m)
  const matched = pairs.filter(p => p.a !== null && p.b !== null).length
  return { pairs, matched, onlyA: n - matched, onlyB: m - matched, firstDivergence: first }
}
