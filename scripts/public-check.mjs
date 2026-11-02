// Public-safety check (README "Privacy", Rule 8): this repository is public, so
// no tracked file may hold traces, corpus or result data, personal paths,
// email addresses, identity attributes or key-shaped strings. Runs in
// `pnpm check` and in CI; fails with the file and line of every hit.
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const files = execSync('git ls-files -z', { encoding: 'utf8' }).split('\0').filter(Boolean)

// Paths that must never be tracked.
const FORBIDDEN_PATHS = [
  [/^corpus\//, 'corpus data'], [/^results\//, 'result artifacts'], [/^TRAIL\//, 'TRAIL (gated dataset)'],
  [/\.otlp\.jsonl$/, 'OTel capture'], [/\.(request|response)\.json$/, 'raw API body'],
  [/^web\/prototype\/(data\.js|runs\/)/, 'generated site data'], [/^learn\/[^/]+\/(answers|gate|attempt)\.md$/, 'withheld gate material'],
  [/^MASTER_PROMPT\.md$/, 'personal profile'], [/(^|\/)\.env/, 'environment file'],
]
// Scripted OTel fixtures are synthetic by construction.
const ALLOW_PATHS = [/^fixtures\/scripted\//]

const CONTENT = [
  [/[A-Za-z]:\\{1,2}Users\\{1,2}(?!<|bob\b|x\b)[A-Za-z0-9._-]+/g, 'Windows home path'],
  [/\/(?:c\/)?Users\/(?!<|bob\b|x\b)[A-Za-z0-9._-]+/g, 'home path'],
  [/\/home\/(?!runner\b|u\b|<)[A-Za-z0-9._-]+/g, 'home path'], // /home/u: a fake path in a redaction test
  [/[A-Za-z0-9._%+-]+@(?!users\.noreply\.github\.com|anthropic\.com|x\.com\b|x\b)[A-Za-z0-9-]+\.[A-Za-z]{2,}/g, 'email address'],
  [/\b(?:gsk|ghp|gho|github_pat|xox[abpr])_[A-Za-z0-9_]{16,}/g, 'key-shaped string'],
  [/\bsk-(?:ant-)?[A-Za-z0-9-]{20,}/g, 'key-shaped string'],
  [/\bAKIA[A-Z0-9]{16}\b/g, 'AWS key id'],
  [/user\.account_uuid|organization\.id"\s*:\s*"[0-9a-f-]{8,}|device_id\\?"\s*:\s*\\?"[0-9a-f]{16,}/g, 'identity attribute'],
]
// Files allowed to name the patterns they guard against.
const SKIP_CONTENT = new Set(['scripts/public-check.mjs', 'scripts/web-check.mjs', 'pnpm-lock.yaml'])

const hits = []
for (const f of files) {
  if (ALLOW_PATHS.some(re => re.test(f))) continue
  for (const [re, what] of FORBIDDEN_PATHS) if (re.test(f)) hits.push(`${f}: tracked ${what}`)
  if (SKIP_CONTENT.has(f)) continue
  let text
  try { text = readFileSync(f, 'utf8') } catch { continue }
  if (text.includes('\u0000')) continue // binary
  text.split('\n').forEach((line, i) => {
    for (const [re, what] of CONTENT) for (const m of line.matchAll(re)) hits.push(`${f}:${i + 1}: ${what}: ${m[0].slice(0, 24)}${m[0].length > 24 ? '…' : ''}`)
  })
}
// Commit metadata is public too: every author and committer email must be a
// no-reply address (set `git config user.email <id>@users.noreply.github.com`).
const emails = new Set(execSync('git log --format=%ae%n%ce', { encoding: 'utf8' }).split('\n').filter(Boolean))
for (const e of emails) if (!/@users\.noreply\.github\.com$|^noreply@anthropic\.com$/.test(e)) hits.push(`commit metadata: email ${e.replace(/^(.{2}).*(@.*)$/, '$1…$2')} is not a no-reply address`)
for (const h of hits.slice(0, 40)) console.log(h)
console.log(hits.length ? `public-check: ${hits.length} problem(s) in ${files.length} tracked files` : `public-check: ${files.length} tracked files clean`)
process.exit(hits.length ? 1 : 0)
