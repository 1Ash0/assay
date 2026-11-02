// zod → JSON Schema (CLAUDE.md: zod is the single source of truth). With
// --check, fails if spec/ is out of date instead of writing it.
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { RunSchema } from '../packages/assay-core/src/schema/index.js'

const out = 'spec/run.schema.json'
const json = JSON.stringify(zodToJsonSchema(RunSchema, { name: 'Run', $refStrategy: 'none' }), null, 2) + '\n'
if (process.argv.includes('--check')) {
  if (!existsSync(out) || readFileSync(out, 'utf-8').replace(/\r\n/g, '\n') !== json) {
    console.error(`${out} is out of date with the zod schema. Run: pnpm schema`)
    process.exit(1)
  }
  console.error(`${out} matches the zod schema`)
} else {
  writeFileSync(out, json)
  console.error(`wrote ${out}`)
}
