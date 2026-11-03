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
    if (!existsSync(norm(e.path))) missing.push(e.path)
    else if (sha(e.path) !== e.sha256) changed.push(e.path)
  }
  const cards = corpusCardAudit()
  console.log(`audited ${m.length} manifest entries: ${m.length - missing.length - changed.length} intact, ${missing.length} missing, ${changed.length} changed; ${cards.length} card or listing problem(s)`)
  for (const p of [...missing.map(p => `missing  ${p}`), ...changed.map(p => `CHANGED  ${p}`), ...cards].slice(0, 30)) console.log('  ' + p)
  return missing.length + changed.length + cards.length > 0 ? 1 : 0
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

// ---- Session cards (corpus v1). A card is the manifest entry of a session's
// main transcript plus who/what/why fields; the site's run list is generated
// from cards, so the corpus is the one source of truth.
export interface CardFacts { version: string | null; level: number; layout: string; agents: number; compactions: number; requestRecords: number; flags: Record<string, boolean> }
const isSession = (e: Entry) => e.file.endsWith('.jsonl') && !/\/(subagents|l4|otel)\//.test(e.path)
const norm = (p: string) => p.split('\\').join('/')

// Files already under corpus/frozen (perturbed, scripted, older copies) are
// registered where they are: hashed and listed, never moved.
export function corpusRegister(path: string, truth: string): number {
  const p = norm(rel(resolve(path)))
  if (!p.startsWith('corpus/frozen/') || !existsSync(p)) { console.error(`register takes a file already under corpus/frozen: ${path}`); return 1 }
  const m = load().map(e => ({ ...e, path: norm(e.path) })) as Entry[]
  const files = [p]
  const sub = p.replace(/\.jsonl$/, '') + '/subagents'
  if (existsSync(sub)) for (const f of readdirSync(sub)) files.push(`${sub}/${f}`)
  let added = 0
  for (const f of files) {
    const h = sha(f), known = m.find(e => e.path === f)
    if (known) { if (known.sha256 !== h) { console.error(`refused: ${f} is listed with a different sha`); return 1 } continue }
    const buf = readFileSync(f)
    m.push({ project: f.split('/')[2]!, file: basename(f), path: f, sha256: h, size: buf.length, lines: buf.toString().split('\n').filter(Boolean).length, src_mtime: statSync(f).mtime.toISOString(), truth })
    added++
  }
  save(m)
  console.log(`registered ${added} file(s) for ${p}`)
  return 0
}

export function corpusCard(path: string, fields: { id?: string; truth?: string; purpose?: string; site?: boolean; contributor?: string; otlp?: string; twinOf?: string }, facts: CardFacts): number {
  const p = norm(rel(resolve(path)))
  const m = load().map(e => ({ ...e, path: norm(e.path) })) as Entry[]
  const e = m.find(x => x.path === p)
  if (!e) { console.error(`no manifest entry for ${p}; run corpus add or corpus register first`); return 1 }
  Object.assign(e, { id: fields.id ?? e.id ?? basename(p).slice(0, 8), truth: fields.truth ?? e.truth ?? 'real', purpose: fields.purpose ?? e.purpose,
    contributor: fields.contributor ?? e.contributor ?? 'owner', site: fields.site ?? e.site ?? false, otlp: fields.otlp ?? e.otlp, twinOf: fields.twinOf ?? e.twinOf, facts })
  save(m)
  console.log(`card ${e.id}: ${e.truth} · L${facts.level} · ${facts.version ?? 'no version'} · ${facts.layout}${e.site ? ' · on site' : ''}`)
  return 0
}

// The site's run list, written from cards (never edited by hand).
export function corpusSite(out: string): number {
  const cards = load().filter(e => isSession(e) && e.site)
  writeFileSync(out, JSON.stringify({ _comment: 'Generated by assay corpus site from corpus cards. Paths are local corpus files (gitignored); this list holds no content.',
    runs: cards.map(e => ({ id: e.id, path: norm(e.path), truth: e.truth, ...(e.otlp ? { otlp: e.otlp } : {}), ...(e.twinOf ? { twinOf: e.twinOf } : {}) })) }, null, 1) + '\n')
  console.log(`wrote ${out}: ${cards.length} runs from cards`)
  return 0
}

// Every frozen file is listed, every session has a card with a purpose.
export function corpusCardAudit(): string[] {
  const m = load(), listed = new Set(m.map(e => norm(e.path))), out: string[] = []
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap(x => x.isDirectory() ? walk(`${d}/${x.name}`) : [`${d}/${x.name}`])
  // Notes about the corpus (.md) are not data and are not listed.
  if (existsSync('corpus/frozen')) for (const f of walk('corpus/frozen')) if (!listed.has(f) && !f.endsWith('.md')) out.push(`unlisted  ${f}`)
  for (const e of m) if (e.path.includes('\\')) out.push(`backslash ${e.path}`)
  for (const e of m.filter(isSession)) if (!e.facts || !e.purpose) out.push(`no card   ${norm(e.path)}`)
  return out
}
