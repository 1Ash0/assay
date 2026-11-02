// Calibration of a probabilistic judge against known truth (LEARNING unit 9).
// Pure functions over (p, y) pairs; y is 1 for a positive, 0 otherwise.

export interface Scored { p: number; y: 0 | 1 }

export interface Bin { lo: number; hi: number; n: number; meanP: number | null; rate: number | null }

// Equal-width bins on [0, 1]; p = 1 falls in the last bin.
export function reliability(xs: Scored[], bins = 10): Bin[] {
  const out: Bin[] = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, meanP: null, rate: null }))
  const sums = out.map(() => ({ p: 0, y: 0 }))
  for (const x of xs) {
    const i = Math.min(bins - 1, Math.max(0, Math.floor(x.p * bins)))
    out[i]!.n++; sums[i]!.p += x.p; sums[i]!.y += x.y
  }
  out.forEach((b, i) => { if (b.n) { b.meanP = sums[i]!.p / b.n; b.rate = sums[i]!.y / b.n } })
  return out
}

// Expected calibration error: bin-weighted |observed rate - mean confidence|.
export function ece(xs: Scored[], bins = 10): number {
  if (!xs.length) return NaN
  return reliability(xs, bins).reduce((s, b) => s + (b.n ? (b.n / xs.length) * Math.abs(b.rate! - b.meanP!) : 0), 0)
}

// Probability that a random positive scores above a random negative (ties 1/2).
export function auroc(xs: Scored[]): number {
  const pos = xs.filter(x => x.y === 1).map(x => x.p), neg = xs.filter(x => x.y === 0).map(x => x.p)
  if (!pos.length || !neg.length) return NaN
  // Rank-sum form, O(n log n), with average ranks for ties.
  const all = [...pos.map(p => ({ p, y: 1 })), ...neg.map(p => ({ p, y: 0 }))].sort((a, b) => a.p - b.p)
  let rankSumPos = 0
  for (let i = 0; i < all.length;) {
    let j = i
    while (j < all.length && all[j]!.p === all[i]!.p) j++
    const avg = (i + 1 + j) / 2
    for (let k = i; k < j; k++) if (all[k]!.y === 1) rankSumPos += avg
    i = j
  }
  return (rankSumPos - (pos.length * (pos.length + 1)) / 2) / (pos.length * neg.length)
}

export function confusion(xs: Scored[], threshold: number) {
  let tp = 0, fp = 0, fn = 0, tn = 0
  for (const x of xs) { const yhat = x.p >= threshold ? 1 : 0; if (yhat && x.y) tp++; else if (yhat) fp++; else if (x.y) fn++; else tn++ }
  return { tp, fp, fn, tn, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null }
}

// The threshold that maximises F1 on a (calibration) set, from the observed p values.
export function bestF1Threshold(xs: Scored[]): number {
  let best = 0.5, bestF = -1
  for (const t of [...new Set(xs.map(x => x.p))].sort((a, b) => a - b)) {
    const c = confusion(xs, t)
    const f = c.precision !== null && c.recall !== null && c.precision + c.recall > 0 ? (2 * c.precision * c.recall) / (c.precision + c.recall) : 0
    if (f > bestF) { bestF = f; best = t }
  }
  return best
}
