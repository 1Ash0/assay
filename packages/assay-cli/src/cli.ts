#!/usr/bin/env node
import { importClaudeCodeDir, runHealth } from '@assay/core'
import { writeFileSync } from 'fs'
import { resolve } from 'path'

const [, , command, ...args] = process.argv

function usage(): never {
  console.error(`
assay <command> [options]

Commands:
  import <path>        Import a Claude Code session directory or JSONL file
  health <run.json>    Run Health detectors on an imported run

Options:
  --out <file>         Write JSON output to file (default: stdout)
  --profile <name>     Importer profile (default: claude-code)
`.trim())
  process.exit(1)
}

if (!command) usage()

const outIdx = args.indexOf('--out')
const outFile = outIdx !== -1 ? args[outIdx + 1] : null

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
    const run = importClaudeCodeDir(resolve(path))
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
    const { readFileSync } = await import('fs')
    const run = JSON.parse(readFileSync(resolve(runFile), 'utf-8'))
    const report = runHealth(run)
    console.error(`health  overall=${report.overall}  findings=${report.findings.length}`)
    writeOutput(report)
  } catch (err) {
    console.error('health failed:', err instanceof Error ? err.message : err)
    process.exit(1)
  }
} else {
  usage()
}
