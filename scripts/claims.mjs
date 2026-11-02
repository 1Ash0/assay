// Claims ledger check (docs/CLAIMS.md, Rule 3). Each row names an artifact,
// a JSON pointer and the value published. Fails on any disagreement; an
// absent artifact is "unchecked", which is reported and never counted as a pass.
import { existsSync, readFileSync } from 'node:fs'

const rows = readFileSync('docs/CLAIMS.md', 'utf8').split('\n')
  .filter(l => /^\| [a-z0-9-]+ \|/.test(l))
  .map(l => l.split('|').slice(1, -1).map(c => c.trim()))
  .map(([id, claim, artifact, pointer, value, tol]) => ({ id, claim, artifact, pointer, value, tol: Number(tol) }))
  .filter(r => r.id !== 'id') // the table header

const at = (obj, pointer) => pointer.split('/').slice(1).reduce((o, k) => (o == null ? undefined : k === 'length' && Array.isArray(o) ? o.length : o[k]), obj)
let bad = 0, unchecked = 0, ok = 0
const cache = new Map()
for (const r of rows) {
  if (!existsSync(r.artifact)) { unchecked++; console.log(`unchecked  ${r.id.padEnd(22)} ${r.artifact} absent`); continue }
  if (!cache.has(r.artifact)) cache.set(r.artifact, JSON.parse(readFileSync(r.artifact, 'utf8')))
  const got = at(cache.get(r.artifact), r.pointer)
  const num = Number(r.value)
  const pass = Number.isFinite(num) && typeof got === 'number' ? Math.abs(got - num) <= r.tol : String(got) === r.value
  if (pass) ok++
  else { bad++; console.log(`MISMATCH   ${r.id.padEnd(22)} published ${r.value}, artifact ${JSON.stringify(got)} (${r.artifact}${r.pointer})`) }
}
console.log(`claims: ${ok} match, ${bad} mismatch, ${unchecked} unchecked (artifact absent) of ${rows.length}`)
process.exit(bad ? 1 : 0)
