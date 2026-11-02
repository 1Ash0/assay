import { join } from 'path'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { Run } from '../../schema/index.js'
import { ImportOptions, importFromFiles } from './from-files.js'

export { importFromFiles } from './from-files.js'
export type { ImportOptions, SourceFile } from './from-files.js'

// Import a Claude Code session directory or a single JSONL file.
// Always reads the whole directory to avoid subagent undercount (D1).
export function importClaudeCodeDir(sessionPath: string, opts: ImportOptions = {}): Run {
  // Resolve main JSONL and session directory
  // Accepts: a .jsonl file path, or a directory containing a same-named .jsonl
  const isJsonl = sessionPath.endsWith('.jsonl')
  let mainJsonl: string
  let dirPath: string
  if (isJsonl) {
    mainJsonl = sessionPath
    dirPath = sessionPath.replace(/\.jsonl$/, '')
  } else {
    // directory — find the .jsonl file inside it
    dirPath = sessionPath
    const base = sessionPath.replace(/[\\/]$/, '').split(/[\\/]/).pop() ?? ''
    mainJsonl = join(sessionPath, `${base}.jsonl`)
    // If not found by name, try any .jsonl in the dir
    if (!existsSync(mainJsonl)) {
      const found = readdirSync(sessionPath).find(f => f.endsWith('.jsonl') && !f.includes('subagent'))
      mainJsonl = found ? join(sessionPath, found) : mainJsonl
    }
  }

  const allFiles: string[] = []
  if (existsSync(mainJsonl)) allFiles.push(mainJsonl)

  // Check for subagent directory
  const subagentDir = join(dirPath, 'subagents')
  const hasSubagentDir = existsSync(subagentDir)
  if (hasSubagentDir) {
    for (const f of readdirSync(subagentDir)) {
      if (f.endsWith('.jsonl')) allFiles.push(join(subagentDir, f))
    }
  }

  if (allFiles.length === 0) {
    throw new Error(`No JSONL files found at: ${sessionPath}`)
  }

  const files = allFiles.map(path => ({ path, bytes: new Uint8Array(readFileSync(path)) }))
  return importFromFiles(files, opts, hasSubagentDir)
}
