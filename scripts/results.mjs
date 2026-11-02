// `pnpm results`: regenerates every result artifact from the local corpus, in
// order, and writes results/RUN.json (commit, corpus manifest hash, and the
// sha of each artifact), so a published number can be traced to a run.
// Without the corpus it stops and says so; it never writes partial results.
import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

if (!existsSync('corpus/MANIFEST.json')) { console.error('results: no local corpus (corpus/MANIFEST.json). Results are regenerated only where the corpus lives; CI checks the scripted fixtures instead.'); process.exit(1) }
const sha = f => createHash('sha256').update(readFileSync(f)).digest('hex')
const sh = (cmd, out) => { console.error(`$ ${cmd}`); execSync(cmd, { stdio: ['ignore', 'ignore', 'inherit'] }); return out }
const cli = 'node packages/assay-cli/dist/cli.js'
const calib = [
  ['cae68025', 'corpus/frozen/E--assay/cae68025-c82f-4c24-8d87-3c23dd0a60a5.jsonl', 'corpus/frozen/l4/2026-11-02-cae68025'],
  ['ff627b48', 'corpus/frozen/E--twin-demo/ff627b48-1ecc-4528-a679-e6e8fae001ff.jsonl', 'corpus/frozen/l4/2026-11-03-twin-demo'],
  ['6068d64d', 'corpus/frozen/E--twin-demo/6068d64d-2aea-4e2c-843a-43460fa835e0.jsonl', 'corpus/frozen/l4/2026-11-03-twin-demo'],
  ['257eafee', 'corpus/frozen/E--twin-demo/257eafee-c066-4947-ae42-582538c1e84d.jsonl', 'corpus/frozen/l4/2026-11-03-twin-demo'],
]
const started = new Date().toISOString()
const artifacts = [
  sh('pnpm --filter @assay/core build && pnpm --filter @assay/cli build && pnpm build:web', null),
  sh(`${cli} export-site web/prototype/site-runs.json --out web/prototype/data.js --results results`, 'web/prototype/data.js'),
  sh(`${cli} catalogue check corpus/frozen --results results`, null),
  sh('node scripts/r2-score.mjs results/R2-reconstruction-v1.json', 'results/R2-reconstruction-v1.json'),
  sh('node scripts/p4-score.mjs results/P4-provenance-v1.json', 'results/P4-provenance-v1.json'),
  ...calib.map(([id, s, raw]) => sh(`node scripts/l4-calibrate.mjs ${s} ${raw} results/L4-calibration-${id}.json`, `results/L4-calibration-${id}.json`)),
  // Slowest last: T3 imports every session five times.
  sh('node scripts/t3-score.mjs results/T3-diff-stability-v1.json', 'results/T3-diff-stability-v1.json'),
].filter(Boolean)
if (existsSync('results/J1/cache.jsonl')) artifacts.push(sh('node scripts/j1.mjs score', 'results/J1-judge-calibration-v1.json'))
const run = {
  commit: execSync('git rev-parse HEAD').toString().trim(),
  dirty: execSync('git status --porcelain -- packages scripts').toString().trim().length > 0,
  started, finished: new Date().toISOString(),
  corpusManifestSha256: sha('corpus/MANIFEST.json'),
  artifacts: Object.fromEntries(artifacts.map(a => [a, sha(a)])),
}
writeFileSync('results/RUN.json', JSON.stringify(run, null, 2))
console.error(`results: ${artifacts.length} artifacts at ${run.commit.slice(0, 8)}${run.dirty ? ' (uncommitted changes in packages/ or scripts/)' : ''}`)
execSync('node scripts/claims.mjs', { stdio: 'inherit' })
