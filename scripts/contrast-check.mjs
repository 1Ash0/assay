// WCAG 2.x contrast for the site's design tokens (M3 exit: "colour contrast
// measured"). Reads the tokens out of each page's CSS so the numbers cannot
// drift from what ships. Text pairs must reach 4.5:1 (AA); mark pairs 3:1.
import { readFileSync } from 'fs'

const pages = ['web/prototype/index.html', 'web/prototype/home.html']

// Which token is used as text, and which as a mark (bar, dot, rule), on which grounds.
const TEXT = ['ink', 'ink-2', 'mute', 'verm', 'cob', 'ochre']
const GROUNDS = ['ground', 'paper', 'paper-2']
const SOFT_TEXT = [['verm', 'verm-soft'], ['cob', 'cob-soft'], ['ochre', 'ochre-soft']]
const MARKS = ['u', 'a', 's']

const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
const lum = hex => {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}
const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

// A theme block is the text between "{" and the matching "}" after its selector.
function tokens(css, selector) {
  const start = css.indexOf(selector)
  if (start < 0) return null
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  return Object.fromEntries([...body.matchAll(/--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})\b/g)].map(m => [m[1], m[2]]))
}

const failures = []
const rows = []
for (const page of pages) {
  const css = readFileSync(page, 'utf-8')
  const themes = {
    light: tokens(css, ':root{'),
    dark: tokens(css, ':root[data-theme="dark"]{'),
  }
  for (const [name, t] of Object.entries(themes)) {
    if (!t) { failures.push(`${page}: no ${name} token block found`); continue }
    const check = (fg, bg, min, kind) => {
      if (!t[fg] || !t[bg]) return
      const r = ratio(t[fg], t[bg])
      rows.push({ page: page.split('/').pop(), theme: name, kind, pair: `${fg} on ${bg}`, ratio: r, min })
      if (r < min) failures.push(`${page} [${name}] ${kind}: ${fg} ${t[fg]} on ${bg} ${t[bg]} = ${r.toFixed(2)} (needs ${min})`)
    }
    for (const fg of TEXT) for (const bg of GROUNDS) check(fg, bg, 4.5, 'text')
    for (const [fg, bg] of SOFT_TEXT) check(fg, bg, 4.5, 'text')
    for (const fg of MARKS) for (const bg of GROUNDS) check(fg, bg, 3, 'mark')
  }
}

const worst = [...rows].sort((a, b) => (a.ratio - a.min) - (b.ratio - b.min)).slice(0, 8)
console.error(`checked ${rows.length} pairs across ${pages.length} pages x light/dark; tightest:`)
for (const w of worst) console.error(`  ${w.ratio.toFixed(2)}  (min ${w.min})  ${w.page} ${w.theme} ${w.kind}  ${w.pair}`)
if (failures.length) { console.error('\ncontrast-check failed:\n  ' + failures.join('\n  ')); process.exit(1) }
console.error('contrast-check ok')
