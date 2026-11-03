// Records real footage of the redacted site (dist/site) for the launch film,
// one frame at a time. The page's clock is frozen: JS timers, rAF and
// performance.now through Playwright's fake clock, CSS animations and
// transitions through the Web Animations API. Each frame advances both by
// exactly 1/30 s and is then captured, so motion is perfectly even no matter
// how long a frame takes to paint. Scrolls are eased in JS (no mouse, so no
// hover states); the mouse only moves to click, and is parked off-page after.
// Click positions and times go to public/clips/<shot>.json for the film.
// Usage: node capture.mjs [shot ...]   (default: all shots)
import { chromium } from 'playwright'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { serve, PORT } from './serve.mjs'

const BASE = `http://localhost:${PORT}/index.html`
const HERO = 'ef76e3fc'
const W = 1920, H = 1080, FPS = 30

// Each step: ['wait', ms] | ['click', selector] | ['scroll', dy, ms] | ['js', code]
const SHOTS = {
  runs: { url: '#shelf', steps: [['wait', 900], ['scroll', 260, 900], ['wait', 500], ['click', `tr[data-run="${HERO}"]`], ['wait', 2600]] },
  report: { url: `#run=${HERO}`, live: true, steps: [['wait', 6500], ['scroll', 640, 1400], ['wait', 2200]] },
  scan: { url: `#run=${HERO}`, steps: [['click', '.tab[data-view="bench"]'], ['wait', 700], ['js', "document.querySelector('[data-speed=\"4\"]').click()"], ['click', '#play'], ['wait', 8000]] },
  timeline: { url: `#run=${HERO}`, steps: [['click', '.tab[data-view="traverse"]'], ['wait', 5600]] },
  rebuild: { url: `#run=${HERO}`, steps: [['click', '.tab[data-view="replay"]'], ['wait', 900], ['scroll', 520, 1000], ['wait', 1800], ['click', '[data-rebuild]'], ['wait', 3600], ['scroll', -560, 1700], ['wait', 4000]] },
  compare: { url: '#run=twin-a', steps: [['click', '.tab[data-view="diff"]'], ['wait', 5600]] },
  learn: { url: '#tamper', steps: [['wait', 900], ['click', '[data-mission="m3"]'], ['wait', 1300], ['click', '#doTamper'], ['wait', 1300], ['js', "document.querySelector('[data-speed=\"4\"]').click()"], ['click', '#doSubmit'], ['wait', 10000]] },
}

// Advance every Web Animation by dt ms; new ones are paused and start at 0.
const STEP = dt => { for (const a of document.getAnimations()) { if (a.__t === undefined) { a.__t = 0; a.pause() } a.__t += dt; a.currentTime = a.__t } }
// Eased scroll of whatever scrolls at the page centre.
const SCROLL = ([y0, y]) => {
  let el = document.elementFromPoint(960, 540)
  while (el && !(el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement
  const s = el || document.scrollingElement
  if (y0 === null) return s.scrollTop
  s.scrollTop = y
}
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2

const srv = await fetch(BASE).then(() => null, () => serve())
const browser = await chromium.launch()
mkdirSync('public/clips', { recursive: true })
const want = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(SHOTS)

for (const name of want) {
  const shot = SHOTS[name]
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: 'dark', deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  const cdp = await ctx.newCDPSession(page)
  const T0 = new Date('2026-11-03T12:00:00Z').getTime()
  await page.clock.install({ time: T0 })
  await page.clock.pauseAt(T0 + 1000)
  const dir = `out/frames-${name}`
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true })
  let n = 0, ms = 0
  const tick = async (shoot = true) => {
    const next = Math.round(((n + 1) * 1000) / FPS), dt = next - Math.round((n * 1000) / FPS)
    await page.clock.runFor(dt)
    await page.evaluate(STEP, dt)
    ms += dt
    if (shoot) { const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 93 }); writeFileSync(`${dir}/${String(n).padStart(5, '0')}.jpg`, Buffer.from(data, 'base64')); n++ }
    else n++
  }
  await page.mouse.move(W - 2, H - 2)
  await page.goto(`${BASE}${shot.url}`)
  // Non-live shots start once the page has settled; live ones film the load.
  if (!shot.live) { for (let i = 0; i < 45; i++) await tick(false); n = 0 }
  const clicks = []
  for (const [op, a, b] of shot.steps) {
    if (op === 'wait') for (let i = Math.round((a / 1000) * FPS); i > 0; i--) await tick()
    if (op === 'js') await page.evaluate(a)
    if (op === 'scroll') {
      const y0 = await page.evaluate(SCROLL, [null, 0]), k = Math.round((b / 1000) * FPS)
      for (let i = 1; i <= k; i++) { await page.evaluate(SCROLL, [y0, y0 + a * ease(i / k)]); await tick() }
    }
    if (op === 'click') {
      const box = await page.locator(a).first().boundingBox()
      const x = box.x + box.width / 2, y = box.y + box.height / 2
      clicks.push({ t: +(n / FPS).toFixed(3), x, y })
      await page.mouse.click(x, y)
      await page.mouse.move(W - 2, H - 2)
    }
  }
  await ctx.close()
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${dir}/%05d.jpg`, '-vf', 'format=yuv420p', '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', `public/clips/${name}.mp4`])
  writeFileSync(`public/clips/${name}.json`, JSON.stringify({ clicks, seconds: +(n / FPS).toFixed(3) }, null, 1))
  console.log(`${name.padEnd(9)} ${n} frames (${(n / FPS).toFixed(2)} s), clicks ${clicks.map(c => c.t.toFixed(2)).join(' ')}`)
}
await browser.close(); srv?.close()
