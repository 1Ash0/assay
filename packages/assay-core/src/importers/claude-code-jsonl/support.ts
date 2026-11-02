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

export type VersionSupport = 'checked' | 'in-range-unchecked' | 'outside-range' | 'no-version'

function parts(v: string): number[] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v)
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null
}

function cmp(a: number[], b: number[]): number {
  for (let i = 0; i < 3; i++) if (a[i]! !== b[i]!) return a[i]! - b[i]!
  return 0
}

export function versionSupport(version: string | undefined): VersionSupport {
  if (!version) return 'no-version'
  if ((IMPORTER_SUPPORT.seen as readonly string[]).includes(version)) return 'checked'
  const v = parts(version)
  if (!v) return 'outside-range'
  const lo = parts(IMPORTER_SUPPORT.min)!, hi = parts(IMPORTER_SUPPORT.max)!
  return cmp(v, lo) >= 0 && cmp(v, hi) <= 0 ? 'in-range-unchecked' : 'outside-range'
}
