// Redaction for anything that leaves the machine (ADR-020, Rule 8). Keeps the
// shape of a record exactly; replaces every string that could carry content.
const ID_RE = /^(msg_|toolu_|req_|srvtoolu_)[A-Za-z0-9]+$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[0-9a-f]{16,17}$/
const TS_RE = /^\d{4}-\d\d-\d\dT[\d:.]+Z$/
// Keys whose values are free text even when short (titles, paths, prompts).
const SENSITIVE = new Set(['content', 'text', 'thinking', 'signature', 'input', 'prompt', 'cwd', 'gitBranch', 'slug',
  'summary', 'display', 'leafUuid', 'title', 'customTitle', 'lastPrompt', 'agentName', 'stdout', 'stderr', 'operation',
  // Tool results that carry file or diff content: a short diff line passes the token rule otherwise.
  'lines', 'oldString', 'newString', 'old_string', 'new_string', 'originalFile', 'filePath', 'file_path', 'path', 'command',
  'query', 'url', 'pattern', 'description'])
const MAX_LIST = 6

export function redact(v: unknown, key?: string): unknown {
  if (Array.isArray(v)) {
    const head = v.slice(0, MAX_LIST).map(x => redact(x, key))
    return v.length > MAX_LIST ? [...head, `‹+${v.length - MAX_LIST} more›`] : head
  }
  if (v !== null && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, redact(x, k)]))
  }
  if (typeof v === 'string') {
    const shortToken = v.length <= 28 && !/[\s\\/]/.test(v)
    if (!(key && SENSITIVE.has(key)) && (ID_RE.test(v) || TS_RE.test(v) || shortToken)) return v
    return `‹redacted · ${v.length} chars›`
  }
  return v
}

// File paths reduced to their last segment, inside messages too.
export function basename(p: string): string {
  return p.split(/[\\/]/).pop() ?? p
}

export function stripPaths(msg: string): string {
  return msg.replace(/[A-Za-z]:\\[^\s:]+|\/(?:[^\s/:]+\/)+[^\s/:]+/g, m => basename(m))
}

// Every string in a structure with its paths cut to file names; for exports
// of core's own results (validity), whose offsets carry absolute paths.
export function scrubPaths<T>(v: T): T {
  if (typeof v === 'string') return stripPaths(v) as T
  if (Array.isArray(v)) return v.map(scrubPaths) as T
  if (v !== null && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, scrubPaths(x)])) as T
  return v
}
