// `assay corpus add|audit|stats` (CLAUDE.md commands; Rule 8: the corpus stays
// local and is never committed). The corpus is frozen copies plus
// corpus/MANIFEST.json, one entry per file with its SHA-256.
import { createHash } from 'crypto'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { basename, dirname, join, relative, resolve } from 'path'

const MANIFEST = 'corpus/MANIFEST.json'
// A transcript written to in the last two minutes is probably a live session;
// freezing it would capture a half-written file.
const ACTIVE_MS = 120_000

interface Entry { project: string; file: string; path: string; sha256: string; size: number; lines?: number; src_mtime?: string; truth?: string; [k: string]: unknown }

const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')
const load = (): Entry[] => (existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, 'utf-8')) as Entry[]) : [])
const save = (m: Entry[]) => writeFileSync(MANIFEST, JSON.stringify(m, null, 4) + '\n')
const rel = (p: string) => relative(process.cwd(), p).split('\\').join('/')

export function corpusAdd(src: string, opts: { project?: string; truth?: string; now?: number }): number {
  const main = resolve(src)
  if (!main.endsWith('.jsonl') || !existsSync(main)) { console.error(`not a session .jsonl: ${src}`); return 1 }
  const age = (opts.now ?? Date.now()) - statSync(main).mtimeMs
  if (age < ACTIVE_MS) { console.error(`refused: ${basename(main)} was written ${Math.round(age / 1000)} s ago; a live session must not be frozen. Try again once it has ended.`); return 1 }
  const project = opts.project ?? basename(dirname(main))
  const dest = resolve('corpus/frozen', project)
  const files = [main]
  const sub = join(main.replace(/\.jsonl$/, ''), 'subagents')
  if (existsSync(sub)) for (const f of readdirSync(sub)) files.push(join(sub, f))
  const m = load()
  let added = 0
  for (const f of files) {
    const to = join(dest, relative(dirname(main), f))
    const known = m.find(e => e.path === rel(to))
    if (known && known.sha256 === sha(f)) continue
    if (known) { console.error(`refused: ${rel(to)} is already frozen with a different sha; frozen files are never replaced`); return 1 }
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(f, to)
    const h = sha(to)
    if (h !== sha(f)) { console.error(`copy of ${f} does not match its source`); return 1 }
    const buf = readFileSync(to)
    m.push({ project, file: basename(to), path: rel(to), sha256: h, size: buf.length, lines: buf.toString().split('\n').filter(Boolean).length, src_mtime: statSync(f).mtime.toISOString(), truth: opts.truth ?? 'real' })
    added++
  }
  save(m)
  console.log(`froze ${added} file(s) into ${rel(dest)}; ${files.length - added} already frozen`)
  return 0
}

export function corpusAudit(): number {
  const m = load()
  const missing: string[] = [], changed: string[] = []
  for (const e of m) {
    if (!existsSync(e.path)) missing.push(e.path)
    else if (sha(e.path) !== e.sha256) changed.push(e.path)
  }
  console.log(`audited ${m.length} manifest entries: ${m.length - missing.length - changed.length} intact, ${missing.length} missing, ${changed.length} changed`)
  for (const p of [...missing.map(p => `missing  ${p}`), ...changed.map(p => `CHANGED  ${p}`)].slice(0, 20)) console.log('  ' + p)
  return missing.length + changed.length > 0 ? 1 : 0
}

export function corpusStats(): number {
  const m = load()
  const sessions = m.filter(e => e.file.endsWith('.jsonl') && !e.path.includes('/subagents/') && !e.path.includes('/l4/') && !e.path.includes('/otel/'))
  const by = (k: (e: Entry) => string) => sessions.reduce<Record<string, number>>((a, e) => { const v = k(e); a[v] = (a[v] ?? 0) + 1; return a }, {})
  const version = (e: Entry) => {
    if (!existsSync(e.path)) return 'missing'
    const hit = /"version":"(\d+\.\d+\.\d+)"/.exec(readFileSync(e.path, 'utf-8').slice(0, 200_000))
    return hit?.[1] ?? 'none'
  }
  const bytes = m.reduce((s, e) => s + (e.size ?? 0), 0)
  console.log(`corpus: ${m.length} files, ${sessions.length} session transcripts, ${(bytes / 1e6).toFixed(1)} MB`)
  console.log(`by project: ${JSON.stringify(by(e => e.project))}`)
  console.log(`by truth:   ${JSON.stringify(by(e => String(e.truth ?? 'unlabelled')))}`)
  console.log(`by version: ${JSON.stringify(by(version))}`)
  console.log('users: not recorded in transcripts; every session here was captured on one machine (one user)')
  return 0
}
