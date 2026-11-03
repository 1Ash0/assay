// Corpus versions (step 6 of the corpus plan). A version names the data, not
// the notes: its hash covers each listed file's path and sha256, so editing a
// card's purpose does not make a new corpus, while adding or changing a file
// does. Usage: node scripts/corpus-version.mjs freeze <v1|v2|...>
//              node scripts/corpus-version.mjs show
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

export function corpusData() {
  if (!existsSync('corpus/MANIFEST.json')) return null
  const m = JSON.parse(readFileSync('corpus/MANIFEST.json', 'utf-8'))
  const rows = m.map(e => `${e.path.split('\\').join('/')} ${e.sha256}`).sort()
  const sessions = m.filter(e => e.facts).length
  return { sha256: createHash('sha256').update(rows.join('\n')).digest('hex'), files: rows.length, sessions }
}
export function corpusVersion() {
  return existsSync('corpus/VERSION.json') ? JSON.parse(readFileSync('corpus/VERSION.json', 'utf-8')) : null
}

if (process.argv[1] && process.argv[1].endsWith('corpus-version.mjs')) {
  const [cmd, name] = process.argv.slice(2)
  const d = corpusData()
  if (!d) { console.error('corpus-version: no corpus/MANIFEST.json (the corpus is local)'); process.exit(1) }
  if (cmd === 'freeze' && name) {
    const prev = corpusVersion()
    if (prev && prev.sha256 === d.sha256) { console.log(`corpus unchanged since ${prev.version}`); process.exit(0) }
    if (prev && prev.version === name) { console.error(`refused: ${name} already names different data; pick a new version`); process.exit(1) }
    writeFileSync('corpus/VERSION.json', JSON.stringify({ version: name, ...d, frozenAt: new Date().toISOString(), previous: prev?.version ?? null }, null, 2) + '\n')
    console.log(`corpus ${name}: ${d.sessions} carded sessions, ${d.files} files, data ${d.sha256.slice(0, 12)}`)
  } else if (cmd === 'show') {
    const v = corpusVersion()
    console.log(v ? `${v.version} (${v.sha256.slice(0, 12)}) ${v.sha256 === d.sha256 ? 'matches the files' : 'DOES NOT match the files: freeze a new version'}` : 'no version frozen yet')
  } else { console.error('usage: corpus-version.mjs freeze <name> | show'); process.exit(1) }
}
