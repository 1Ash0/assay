// One-time migration to corpus v1 cards (step 1 of the corpus plan): every run
// the site shows gets registered (if it was never listed) and carded, with
// truth taken from the old hand-kept list. Re-running is harmless.
// Usage: node scripts/corpus-migrate.mjs
import { execFileSync } from 'child_process'
import { readFileSync } from 'fs'

const CLI = 'packages/assay-cli/dist/cli.js'
const runs = JSON.parse(readFileSync('web/prototype/site-runs.json', 'utf-8')).runs
const listed = new Set(JSON.parse(readFileSync('corpus/MANIFEST.json', 'utf-8')).map(e => e.path.split('\\').join('/')))
const PURPOSE = {
  real: 'Owner session collected for the M1-M5 corpus (card migrated from the site list)',
  'real-perturbed': 'Real session with one deliberate, documented change, for a tamper mission and a detector check (card migrated)',
  scripted: 'Hand-written fixture; never shown as an example (card migrated)',
}
const cli = (...a) => execFileSync('node', [CLI, ...a], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
for (const r of runs) {
  if (!listed.has(r.path)) console.log(cli('corpus', 'register', r.path, '--truth', r.truth))
  console.log(cli('corpus', 'card', r.path, '--id', r.id, '--truth', r.truth, '--purpose', PURPOSE[r.truth], '--site', ...(r.otlp ? ['--otlp', r.otlp] : []), ...(r.twinOf ? ['--twin-of', r.twinOf] : [])))
}
