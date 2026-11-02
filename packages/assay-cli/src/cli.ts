#!/usr/bin/env node
import { attachOtlp, buildRunView, census, diffCensus, IMPORTER_SUPPORT, importClaudeCodeDir, Run, runHealth, Truth } from '@assay/core'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

const [, , command, ...args] = process.argv

function usage(): never {
  console.error(`
assay <command> [options]

Commands:
  import <path>        Import a Claude Code session directory or JSONL file [--otlp file]
  health <run.json>    Run Health detectors on an imported run
  requests <path>      Seal of every request record in a session (ADR-026)
  catalogue check [dir ...]
                       Versions and record formats seen vs the importer's support
                       (default: corpus/frozen and ~/.claude/projects) [--results dir]
  export-view <path>   Redacted view model of one session [--truth t] [--id x]
  export-site <runs.json> --out <data.js> [--results dir]
                       Site data for every listed run; regenerates health results

Options:
  --out <file>         Write JSON output to file (default: stdout)
`.trim())
  process.exit(1)
}

if (!command) usage()

const outIdx = args.indexOf('--out')
const outArg = outIdx !== -1 ? args[outIdx + 1] : undefined
if (outIdx !== -1 && (!outArg || outArg.startsWith('--'))) {
  console.error('--out requires a file path argument')
  process.exit(1)
}
const outFile = outArg ?? null

function writeOutput(data: unknown): void {
  const json = JSON.stringify(data, null, 2)
  if (outFile) {
    writeFileSync(outFile, json, 'utf-8')
    console.error(`wrote ${outFile}`)
  } else {
    process.stdout.write(json + '\n')
  }
}

if (command === 'import') {
  const path = args[0]
  if (!path) { console.error('import requires a path'); process.exit(1) }
  try {
    const run = withOtlp(importClaudeCodeDir(resolve(path)), flag('--otlp'))
    console.error(
      `imported  L${run.capture.level}  ${run.events.length} events  ` +
      `${run.unknowns.length} unknowns  ${run.compactions.length} compactions  ` +
      `v${run.harness.version ?? '?'}  layout=${run.harness.layout}`
    )
    writeOutput(run)
  } catch (err) {
    console.error('import failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  }
} else if (command === 'health') {
  const runFile = args[0]
  if (!runFile) { console.error('health requires a run JSON file'); process.exit(1) }
  try {
    const run = JSON.parse(readFileSync(resolve(runFile), 'utf-8'))
    const report = runHealth(run)
    console.error(`health  overall=${report.overall}  findings=${report.findings.length}`)
    writeOutput(report)
  } catch (err) {
    console.error('health failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  }
} else if (command === 'requests') {
  // One line per request record: sealed means the rebuilt body hashes to the
  // record's own digest; unresolved names how many messages have no blob.
  const path = args[0]
  if (!path) { console.error('requests requires a session path'); process.exit(1) }
  const q = importClaudeCodeDir(resolve(path)).requests
  if (!q) { console.error('no request records (Claude Code before 2.1.299, or none written)'); process.exit(0) }
  for (const r of q.records) {
    const gap = r.seal === 'unresolved' ? `  ${r.missingMessages}/${r.messageCount} messages without blob` : ''
    console.log(`${r.seal.padEnd(10)} line ${String(r.offset.line + 1).padStart(6)}  ${(r.querySource ?? '?').padEnd(18)} ${r.messageCount} msgs${gap}`)
  }
  const n = (s: string) => q.records.filter(r => r.seal === s).length
  console.error(`requests  ${q.records.length}  sealed ${n('sealed')}  broken ${n('broken')}  unresolved ${n('unresolved')}  no-shape ${n('no-shape')}  blobs failing their key ${q.blobsFailed.length}`)
  if (n('broken') > 0 || q.blobsFailed.length + q.shapesFailed.length > 0) process.exit(2)
} else if (command === 'catalogue' && args[0] === 'check') {
  // Rule 7 as a signal (M4_PLAN §4a, 2a/2b): every version seen against the
  // importer's declared support, and what changed in the record format from
  // one version to the next. Exit 1 when any version is outside the range.
  const dirs = args.slice(1).filter(a => !a.startsWith('--') && a !== flag('--results'))
  const roots = dirs.length ? dirs : ['corpus/frozen', join(homedir(), '.claude', 'projects')]
  const paths: string[] = []
  const walk = (d: string) => {
    if (!existsSync(d)) return
    for (const f of readdirSync(d)) {
      const q = join(d, f)
      if (statSync(q).isDirectory()) { if (!['tool-results', 'otel', 'l4'].includes(f)) walk(q) }
      else if (f.endsWith('.jsonl')) paths.push(q)
    }
  }
  roots.forEach(r => walk(resolve(r)))
  const c = census(paths.map(path => ({ path, bytes: new Uint8Array(readFileSync(path)) })))
  const diffs = diffCensus(c)
  const resultsDir = flag('--results')
  if (resultsDir) {
    mkdirSync(resolve(resultsDir, 'catalogue'), { recursive: true })
    for (const v of c) writeFileSync(resolve(resultsDir, 'catalogue', `${v.version}.json`), JSON.stringify({ ...v, diff: diffs.find(d => d.version === v.version) }, null, 2))
  }
  console.log(`importer support: ${IMPORTER_SUPPORT.tool} ${IMPORTER_SUPPORT.min}–${IMPORTER_SUPPORT.max}  (${paths.length} files)`)
  for (const v of c) {
    const d = diffs.find(x => x.version === v.version)!
    const changes = [
      ...d.newTypes.map(t => `+type ${t}`),
      ...Object.entries(d.newFields).map(([t, f]) => `+fields ${t}: ${f.join(', ')}`),
    ]
    console.log(`${v.version.padEnd(10)} ${v.support.padEnd(19)} ${String(v.files).padStart(4)} files ${String(v.lines).padStart(7)} lines`)
    for (const ch of changes) console.log(`             first seen here: ${ch}`)
  }
  if (c.some(v => v.support === 'outside-range')) process.exit(1)
} else if (command === 'export-view') {
  // ADR-020: the view is redacted by construction (raw samples pass through redact()).
  const path = args[0]
  if (!path) { console.error('export-view requires a session path'); process.exit(1) }
  const truth = flag('--truth') as Truth | undefined
  const run = withOtlp(importClaudeCodeDir(resolve(path), truth ? { truth } : {}), flag('--otlp'))
  const id = flag('--id')
  writeOutput(buildRunView(run, runHealth(run), { ...(id ? { id } : {}), ...(truth ? { truth } : {}) }))
} else if (command === 'export-site') {
  // Builds the site's data file from a run list, and regenerates results/<id>.health.json
  // with the right truth label (M3_PLAN §7.6). Paths in the list are local corpus files.
  const list = args[0]
  if (!list || !outFile) { console.error('export-site requires <runs.json> --out <data.js>'); process.exit(1) }
  const { mkdirSync } = await import('fs')
  const spec = JSON.parse(readFileSync(resolve(list), 'utf-8')) as { runs: Array<{ id: string; path: string; truth: Truth; otlp?: string }> }
  const resultsDir = flag('--results')
  if (resultsDir) mkdirSync(resolve(resultsDir), { recursive: true })
  const runs = spec.runs.map(r => {
    const run = withOtlp(importClaudeCodeDir(resolve(r.path), { truth: r.truth }), r.otlp)
    const report = runHealth(run)
    if (resultsDir) writeFileSync(resolve(resultsDir, `${r.id}.health.json`), JSON.stringify({ truth: run.truth, ...report }, null, 2))
    console.error(`  ${r.id.padEnd(16)} ${run.truth.padEnd(15)} fineness ${report.validity.fineness.value ?? '–'} (${report.validity.fineness.bound ?? '–'})`)
    return buildRunView(run, report, { id: r.id, file: `results/${r.id}.health.json` })
  })
  const js = '// Generated by `assay export-site` from local corpus files. Raw samples redacted.\n' +
    `window.ASSAY_DATA = ${JSON.stringify({ generatedBy: 'assay export-site', runs })};\n`
  writeFileSync(outFile, js, 'utf-8')
  console.error(`wrote ${outFile} (${Math.round(js.length / 1024)} KB, ${runs.length} runs)`)
} else {
  usage()
}

// ADR-025: an OTLP file-exporter capture joined by session.id and request_id.
function withOtlp(run: Run, path: string | undefined): Run {
  if (!path) return run
  return attachOtlp(run, [{ path: resolve(path), bytes: new Uint8Array(readFileSync(resolve(path))) }])
}

function flag(name: string): string | undefined {
  const i = args.indexOf(name)
  return i !== -1 ? args[i + 1] : undefined
}
