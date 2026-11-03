// Dev aid: full-resolution stills of each view for shot planning.
import { chromium } from 'playwright'
import { serve, PORT } from './serve.mjs'
const srv = await fetch(`http://localhost:${PORT}/index.html`).then(() => null, () => serve())
const b = await chromium.launch()
const p = await b.newPage({ viewport: { width: 1920, height: 1080 }, colorScheme: 'dark' })
const shot = n => p.screenshot({ path: `out/explore-${n}.png` })
await p.goto(`http://localhost:${PORT}/index.html#run=2b152411`); await p.waitForTimeout(1500)
for (const v of process.argv.slice(2)) {
  if (v.startsWith('js:')) { console.log(await p.evaluate(v.slice(3))); continue }
  if (v.startsWith('wait:')) { await p.waitForTimeout(+v.slice(5)); continue }
  if (v.startsWith('click:')) { await p.click(v.slice(6)); continue }
  if (v.startsWith('goto:')) { await p.goto('about:blank'); await p.goto(`http://localhost:${PORT}/${v.slice(5)}`); await p.waitForTimeout(1500); continue }
  if (v.startsWith('shot:')) { await shot(v.slice(5)); continue }
  await p.click(`.tab[data-view="${v}"]`); await p.waitForTimeout(1500); await shot(v)
}
await b.close(); srv?.close()
