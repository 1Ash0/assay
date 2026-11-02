// Site checks that run offline (M3 exit). Fails on: personal data or local
// paths in the generated data, budgets exceeded, or basic markup a11y gaps.
import { readFileSync, statSync, existsSync } from 'fs'

const fail = []
const dir = 'web/prototype'
const KB = f => Math.round(statSync(`${dir}/${f}`).size / 1024)

// 1. Privacy: the data file is redacted by core; check nothing slipped through.
if (existsSync(`${dir}/data.js`)) {
  const data = readFileSync(`${dir}/data.js`, 'utf-8')
  const leaks = [
    [/[A-Za-z]:\\[A-Za-z]/, 'Windows path'],
    [/\/(home|Users)\/[^"\s]+/, 'home path'],
    [/[\w.+-]+@[\w-]+\.[\w.]+/, 'email address'],
    [/user\.account|organization\.id/, 'OTel identity attribute'],
  ]
  for (const [re, what] of leaks) { const m = data.match(re); if (m) fail.push(`data.js contains a ${what}: ${m[0].slice(0, 40)}`) }
  // 2. Budgets (site data grows with the corpus; split per run past this).
  if (KB('data.js') > 8 * 1024) fail.push(`data.js is ${KB('data.js')} KB (budget 8192)`)
} else fail.push('data.js missing: run pnpm web')
if (existsSync(`${dir}/assay-core.js`) && KB('assay-core.js') > 150) fail.push(`assay-core.js is ${KB('assay-core.js')} KB (budget 150)`)
for (const f of ['app.js', 'views.js', 'home.js']) if (KB(f) > 120) fail.push(`${f} is ${KB(f)} KB (budget 120)`)

// 3. Markup a11y basics in the static pages.
for (const f of ['index.html', 'home.html']) {
  const html = readFileSync(`${dir}/${f}`, 'utf-8')
  if (!/<html[^>]*\slang=/.test(html)) fail.push(`${f}: <html> has no lang`)
  for (const m of html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)) {
    const text = m[2].replace(/<[^>]+>/g, '').trim()
    if (!text && !/aria-label=/.test(m[1])) fail.push(`${f}: button without text or aria-label: ${m[0].slice(0, 60)}`)
  }
  for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\salt=/.test(m[0])) fail.push(`${f}: img without alt`)
  for (const m of html.matchAll(/<svg\b[^>]*>/g)) if (!/aria-hidden|role=/.test(m[0])) fail.push(`${f}: svg without role or aria-hidden: ${m[0].slice(0, 60)}`)
  for (const m of html.matchAll(/<input\b[^>]*>/g)) if (!/aria-label|hidden|type="range"[^>]*aria-label/.test(m[0]) && !/id="/.test(m[0])) fail.push(`${f}: input without a label: ${m[0].slice(0, 60)}`)
}

if (fail.length) { console.error('web-check failed:\n  ' + fail.join('\n  ')); process.exit(1) }
console.error('web-check ok')
