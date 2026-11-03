// Writes out/assay.srt from the film's caption timings (src/Film.tsx), so the
// uploaded captions match the burned-in ones exactly.
import { readFileSync, writeFileSync } from 'node:fs'
const src = readFileSync('src/Film.tsx', 'utf8')
const caps = [...src.matchAll(/\{ at: (\d+), end: (\d+),(?: kicker: '[^']*',)? text: '([^']+)'/g)].map(m => ({ at: +m[1], end: +m[2], text: m[3] }))
const cold = [...src.matchAll(/<Caption text="([^"]+)" inAt=\{(\d+)\} outAt=\{(\d+)\}/g)].map(m => ({ at: +m[2], end: +m[3], text: m[1] }))
const all = [...cold, ...caps].sort((a, b) => a.at - b.at)
const ts = f => { const ms = Math.round((f / 30) * 1000), p = (n, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}` }
writeFileSync('out/assay.srt', all.map((c, i) => `${i + 1}\n${ts(c.at)} --> ${ts(c.end + 6)}\n${c.text.replace(/\*/g, '')}\n`).join('\n'))
console.log(`${all.length} captions`)
