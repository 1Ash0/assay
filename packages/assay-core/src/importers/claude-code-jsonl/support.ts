// The importer's declared support (Rule 7): importers are keyed by (tool,
// version range), and a run outside the range is read but stamped degraded
// with a visible warning, never parsed silently on a best-effort basis.
//
// `seen` lists the versions whose output has been read and checked against the
// frozen corpus. A version inside the range but not in `seen` is in range,
// unchecked: it is plausible because its neighbours were checked, but it is
// reported as such. Widening the range needs a corpus session at the new
// version, a census diff (`assay catalogue check`) and a CHANGES.md line.
export const IMPORTER_SUPPORT = {
  tool: 'claude-code',
  min: '2.1.165',
  max: '2.1.316',
  seen: ['2.1.165', '2.1.170', '2.1.177', '2.1.181', '2.1.299', '2.1.301', '2.1.304', '2.1.308', '2.1.309', '2.1.316'],
} as const

// Every importer, keyed by the tool it reads (Rule 7). The TRAIL importer
// (ADR-037) is keyed by its instrumenter; its version is the spans' scope_version.
export const SUPPORT_BY_TOOL: Record<string, { tool: string; min: string; max: string; seen: readonly string[] }> = {
  'claude-code': IMPORTER_SUPPORT,
  'openinference-smolagents': { tool: 'openinference-smolagents', min: '0.1.6', max: '0.1.8', seen: ['0.1.6', '0.1.8', '0.1.6+0.1.8'] },
}

export const supportRange = (tool = 'claude-code') => {
  const s = SUPPORT_BY_TOOL[tool]
  return s ? `${s.min}–${s.max}` : 'no importer support declared'
}

export type VersionSupport = 'checked' | 'in-range-unchecked' | 'outside-range' | 'no-version'

function parts(v: string): number[] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) if (a[i]! !== b[i]!) return a[i]! - b[i]!
  return 0
}

export function versionSupport(version: string | undefined, tool = 'claude-code'): VersionSupport {
  const sup = SUPPORT_BY_TOOL[tool]
  if (!sup) return 'outside-range'
  if (!version) return 'no-version'
  if (sup.seen.includes(version)) return 'checked'
  const v = parts(version)
  if (!v) return 'outside-range'
  const lo = parts(sup.min)!, hi = parts(sup.max)!
  return cmp(v, lo) >= 0 && cmp(v, hi) <= 0 ? 'in-range-unchecked' : 'outside-range'
}
