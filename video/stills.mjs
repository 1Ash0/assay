// Dev aid: bundle once and render stills at the given frames for review.
import { bundle } from '@remotion/bundler'
import { renderStill, selectComposition } from '@remotion/renderer'
const frames = process.argv.slice(2).map(Number)
const serveUrl = await bundle({ entryPoint: 'src/index.ts' })
const composition = await selectComposition({ serveUrl, id: 'Film' })
for (const frame of frames) {
  await renderStill({ composition, serveUrl, frame, output: `out/still-${String(frame).padStart(4, '0')}.jpg`, imageFormat: 'jpeg', jpegQuality: 80 })
  console.log('still', frame)
}
