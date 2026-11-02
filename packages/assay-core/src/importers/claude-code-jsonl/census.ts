import { SourceFile } from './from-files.js'
import { versionSupport, VersionSupport } from './support.js'

// Format census (M4_PLAN §4a, item 2b): per Claude Code version, which record
// types appear and which top-level fields each type carries. Diffing a
// version against the one before it lists what changed, so a format change
// is a signal to read, not something found later in a wrong number. It only
// counts; it never decides that a change is harmless.

export interface VersionCensus {
  version: string
  support: VersionSupport
  files: number
  lines: number
  types: Record<string, { count: number; fields: string[] }>
}

// Compared with everything seen in all earlier versions, not only the one
// before: with a handful of sessions per version, a type missing from one
// version is sampling, not a format change. So a type or field is flagged
// once, at the first version it appears in. Absence is not reported.
export interface CensusDiff {
  version: string
  previous: string | null
  newTypes: string[]
  newFields: Record<string, string[]>
}

const dec = new TextDecoder()

export function census(files: SourceFile[]): VersionCensus[] {
  const byVersion = new Map<string, { files: Set<string>; lines: number; types: Map<string, { count: number; fields: Set<string> }> }>()
  for (const f of files) {
    let fileVersion: string | undefined
    const parsed: Record<string, unknown>[] = []
    for (const line of dec.decode(f.bytes).split('\n')) {
      if (!line.trim()) continue
      try {
        const o = JSON.parse(line) as unknown
        if (o && typeof o === 'object' && !Array.isArray(o)) {
          parsed.push(o as Record<string, unknown>)
          const v = (o as Record<string, unknown>)['version']
          if (!fileVersion && typeof v === 'string') fileVersion = v
        }
      } catch { /* unparseable lines are the importer's to report, not the census's */ }
    }
    for (const o of parsed) {
      // A line without its own version belongs to the file's first version.
      const v = typeof o['version'] === 'string' ? (o['version'] as string) : fileVersion ?? '(none)'
      const e = byVersion.get(v) ?? { files: new Set(), lines: 0, types: new Map() }
      e.files.add(f.path); e.lines++
      const type = typeof o['type'] === 'string' ? (o['type'] as string) : '(no type)'
      const t = e.types.get(type) ?? { count: 0, fields: new Set<string>() }
      t.count++
      for (const k of Object.keys(o)) t.fields.add(k)
      e.types.set(type, t)
      byVersion.set(v, e)
    }
  }
  return [...byVersion.entries()].sort((a, b) => compareVersions(a[0], b[0])).map(([version, e]) => ({
    version,
    support: versionSupport(version === '(none)' ? undefined : version),
    files: e.files.size,
    lines: e.lines,
    types: Object.fromEntries([...e.types.entries()].sort().map(([k, t]) => [k, { count: t.count, fields: [...t.fields].sort() }])),
  }))
}

export function diffCensus(versions: VersionCensus[]): CensusDiff[] {
  const seen = new Map<string, Set<string>>()
  return versions.map((c, i) => {
    const newTypes: string[] = []
    const newFields: Record<string, string[]> = {}
    for (const [type, t] of Object.entries(c.types)) {
      const known = seen.get(type)
      if (i > 0 && !known) newTypes.push(type)
      else if (i > 0 && known) {
        const added = t.fields.filter(f => !known.has(f))
        if (added.length) newFields[type] = added
      }
    }
    for (const [type, t] of Object.entries(c.types)) {
      const s = seen.get(type) ?? new Set<string>()
      t.fields.forEach(f => s.add(f)); seen.set(type, s)
    }
    return { version: c.version, previous: i > 0 ? versions[i - 1]!.version : null, newTypes, newFields }
  })
}

function compareVersions(a: string, b: string): number {
  const p = (v: string) => v.split(/[.-]/).map(x => (/^\d+$/.test(x) ? Number(x) : Number.NaN))
  const x = p(a), y = p(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const u = x[i] ?? 0, w = y[i] ?? 0
    if (Number.isNaN(u) || Number.isNaN(w)) return a < b ? -1 : a > b ? 1 : 0
    if (u !== w) return u - w
  }
  return 0
}
