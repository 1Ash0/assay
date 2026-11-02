/* Folder-drop worker (ADR-019). Runs assay-core on the user's own files, in
   their browser. Nothing is uploaded; the result is the same RunView that
   `assay export-site` produces, built by the same code. */
importScripts('assay-core.js');

self.onmessage = e => {
  const { files, id } = e.data;
  try {
    const isSub = p => /(^|\/)subagents\//.test(p);
    const main = files.filter(f => f.path.endsWith('.jsonl') && !isSub(f.path)).sort((a, b) => a.path.length - b.path.length)[0];
    if (!main) throw new Error('No session .jsonl found in what was dropped.');
    const subs = files.filter(f => f.path.endsWith('.jsonl') && isSub(f.path));
    const input = [main, ...subs].map(f => ({ path: f.path, bytes: new Uint8Array(f.buffer) }));
    const run = AssayCore.importFromFiles(input, { truth: 'real' }, subs.length > 0 || files.some(f => isSub(f.path)));
    const report = AssayCore.runHealth(run);
    const view = AssayCore.buildRunView(run, report, { id, file: main.path.split('/').pop() + ' (dropped, local)' });
    self.postMessage({ ok: true, view });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.message || err) });
  }
};
