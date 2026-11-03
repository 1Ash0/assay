// Serves the redacted, publish-gated build (dist/site) so footage is only ever
// taken from what would be public.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'

const ROOT = new URL('../dist/site/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' }
export const PORT = 4321
export function serve() {
  return createServer(async (req, res) => {
    const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^[\/]+/, '')
    try { const b = await readFile(join(ROOT, p || 'index.html')); res.writeHead(200, { 'content-type': TYPES[extname(p)] || 'application/octet-stream' }); res.end(b) }
    catch { res.writeHead(404); res.end() }
  }).listen(PORT)
}
if (process.argv[1].endsWith('serve.mjs')) { serve(); console.log(`dist/site on http://localhost:${PORT}`) }
