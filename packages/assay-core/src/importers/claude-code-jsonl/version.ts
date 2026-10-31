// Detect Claude Code version from parsed JSONL lines.
// Returns the version string from the first line that has one, or undefined.
export function detectVersion(lines: unknown[]): string | undefined {
  for (const line of lines) {
    if (
      typeof line === 'object' &&
      line !== null &&
      'version' in line &&
      typeof (line as Record<string, unknown>)['version'] === 'string'
    ) {
      return (line as Record<string, unknown>)['version'] as string
    }
  }
  return undefined
}

// Detect subagent layout from session directory contents.
// 'subagent-files' = separate subagents/ dir (v2.0.42+)
// 'inline-sidechain' = isSidechain=true lines in main file (older)
export function detectLayout(
  hasSubagentDir: boolean,
  lines: unknown[],
): 'subagent-files' | 'inline-sidechain' | 'unknown' {
  if (hasSubagentDir) return 'subagent-files'
  for (const line of lines) {
    if (
      typeof line === 'object' &&
      line !== null &&
      'isSidechain' in line &&
      (line as Record<string, unknown>)['isSidechain'] === true
    ) {
      return 'inline-sidechain'
    }
  }
  return 'unknown'
}
