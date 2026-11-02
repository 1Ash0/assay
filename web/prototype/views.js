/* Traverse, Replay and Run Diff. Readings of the core spine (RunView.spine);
   nothing here computes a statistic. A step selected in one view stays
   selected in the others. */
(() => {
'use strict';
const A = window.ASSAY;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const full = n => n == null ? '–' : Math.round(n).toLocaleString();
const ms = n => n == null ? '–' : n < 1000 ? n + ' ms' : (n / 1000).toFixed(n < 1e4 ? 1 : 0) + ' s';
const V = { step: 0, diffA: null, diffB: null };

/* ---------- Traverse: Marey diagram ---------- */
// x = observed time, rows = stations (the model, then the most used tools),
// one line per agent. Dwell on a station is the observed tool latency.
// No result captured = open bracket. A step whose time runs backwards is
// drawn as a backward segment (D9), in ochre.
function traverse(r) {
  const sp = r.spine, steps = sp.steps.filter(s => s.ts != null);
  const untimed = sp.steps.length - steps.length;
  const counts = {};
  sp.steps.forEach(s => s.tools.forEach(t => counts[t.name] = (counts[t.name] || 0) + 1));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0]);
  const rows = ['model', ...top, 'other tools'];
  const rowOf = n => n === 'model' ? 0 : top.includes(n) ? top.indexOf(n) + 1 : rows.length - 1;
  const W = 1100, rowH = 34, padL = 120, H = rows.length * rowH + 30;
  if (!steps.length) return `<div class="panel" style="padding:20px"><div class="hint">No step carries a timestamp, so there is nothing to place in time.</div></div>`;
  const t0 = Math.min(...steps.map(s => s.ts)), t1 = Math.max(...steps.map(s => s.ts + Math.max(0, ...s.tools.map(t => t.ms || 0))));
  const x = t => padL + (W - padL - 10) * ((t - t0) / Math.max(1, t1 - t0));
  const y = i => 20 + i * rowH;
  const agents = [...new Set(steps.map(s => s.agent))];
  // MCP tool names are long (mcp__server__tool); the station shows the tool part, the full name on hover.
  const short = n => { const t = n.split('__').pop(); return t.length > 16 ? t.slice(0, 15) + '…' : t; };
  let svg = rows.map((n, i) => `<line x1="${padL}" x2="${W}" y1="${y(i)}" y2="${y(i)}" stroke="var(--rule)"/><text x="${padL - 10}" y="${y(i) + 4}" text-anchor="end" font-family="var(--mono)" font-size="11" fill="var(--mute)"><title>${esc(n)}</title>${esc(short(n))}</text>`).join('');
  agents.forEach((ag, ai) => {
    const own = steps.filter(s => s.agent === ag);
    const colour = ai === 0 ? 'var(--ink)' : 'var(--cob)';
    let prev = null, path = '';
    own.forEach(s => {
      const px = x(s.ts), py = y(0);
      if (prev) {
        const back = s.ts < prev.t;
        path += `<line x1="${prev.x}" y1="${prev.y}" x2="${px}" y2="${py}" stroke="${back ? 'var(--ochre)' : colour}" stroke-width="${back ? 2.5 : 1.2}" ${back ? 'stroke-dasharray="4 3"' : ''}><title>${back ? 'D9: time runs backwards here' : ''}</title></line>`;
      }
      prev = { x: px, y: py, t: s.ts };
      s.tools.forEach(t => {
        const ty = y(rowOf(t.name));
        path += `<line x1="${px}" y1="${py}" x2="${px}" y2="${ty}" stroke="${colour}" stroke-width=".8" opacity=".5"/>`;
        if (t.ms != null) path += `<line x1="${px}" y1="${ty}" x2="${Math.max(px + 2, x(s.ts + Math.max(0, t.ms)))}" y2="${ty}" stroke="${colour}" stroke-width="4" stroke-linecap="round"><title>${esc(t.name)} · ${ms(t.ms)} observed</title></line>`;
        else path += `<path d="M${px + 6} ${ty - 7} h-5 v14 h5" fill="none" stroke="var(--ochre)" stroke-width="1.5"><title>${esc(t.name)} · ${t.resultLine == null ? 'no result captured (open)' : 'no timestamp on one side'}</title></path>`;
      });
      svg += `<circle data-step="${s.i}" cx="${px}" cy="${py}" r="${s.i === V.step ? 6 : 3}" fill="${s.findings.length ? 'var(--ochre)' : colour}" stroke="var(--paper)" style="cursor:pointer"><title>step ${s.i + 1} · ${esc(s.agent)} · ${s.findings.join(' ') || 'no findings'}</title></circle>`;
    });
    svg = path + svg;
  });
  const legend = agents.map((a, i) => `<span class="mono" style="color:${i === 0 ? 'var(--ink)' : 'var(--cob)'}">— ${esc(a === 'main' ? 'main agent' : a)}</span>`).join(' ');
  return `<div class="panel" style="padding:18px;display:grid;gap:10px">
    <div style="display:flex;gap:16px;flex-wrap:wrap;align-items:baseline"><span class="label">Traverse · who did what, when</span><span class="hint">${legend} · bar = observed tool time · <span style="color:var(--ochre)">[</span> = no result captured</span></div>
    <div style="overflow-x:auto"><svg viewBox="0 0 ${W} ${H}" style="min-width:760px;width:100%" role="img" aria-label="Marey diagram: ${steps.length} model steps across ${rows.length} stations">${svg}</svg></div>
    <div class="hint">${full(steps.length)} steps placed by their own timestamps${untimed ? ` · ${full(untimed)} without a timestamp, not drawn` : ''} · links drawn only where an id matched exactly. Click a step to replay it.</div>
  </div>`;
}

/* ---------- Replay: three columns ---------- */
function replay(r) {
  const sp = r.spine, n = sp.steps.length;
  if (!n) return `<div class="panel" style="padding:20px"><div class="hint">This run has no model requests to step through.</div></div>`;
  V.step = Math.max(0, Math.min(n - 1, V.step));
  const s = sp.steps[V.step];
  const [inp, cr, cw, out] = s.usage, tot = inp + cr + cw;
  const lim = r.hallmark.contextLimit;
  const bar = (v, c, label) => v ? `<div title="${label}: ${full(v)}" style="flex:${v};background:${c};min-width:2px"></div>` : '';
  const local = A.files && A.files.get(s.file);
  const tools = s.tools.length ? s.tools.map(t => `<div style="display:flex;gap:8px;align-items:baseline;padding:4px 0;border-top:1px solid var(--rule)"><span class="mono" style="min-width:90px">${esc(t.name)}</span><span class="hint">${t.edge ? 'result linked by id' : '<span style="color:var(--ochre)">no result captured</span>'}${t.ms != null ? ' · ' + ms(t.ms) : ''}${t.isError ? ' · error' : ''}</span></div>`).join('') : '<div class="hint">No tool calls in this step.</div>';
  return `<div class="panel" style="padding:18px;display:grid;gap:14px">
    <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
      <span class="label">Replay · step ${full(V.step + 1)} of ${full(n)}</span>
      <button class="tool" data-rstep="-1" aria-label="Previous step">←</button><button class="tool" data-rstep="1" aria-label="Next step">→</button>
      <input type="range" id="rscrub" min="0" max="${n - 1}" value="${V.step}" aria-label="Step" style="flex:1;min-width:160px">
      <span class="hint"><kbd>J</kbd> <kbd>K</kbd> step</span>
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px">
      <div style="display:grid;gap:8px;align-content:start">
        <div class="label">What happened</div>
        <div class="mono" style="font-size:13px">${esc(s.agent === 'main' ? 'main agent' : s.agent)} · epoch ${s.epoch + 1} of ${sp.epochs}${s.ts != null ? ' · ' + new Date(s.ts).toISOString().slice(11, 19) + ' UTC' : ' · no timestamp'}</div>
        ${tools}
        ${s.findings.length ? `<div class="hint">Findings on this line: <span class="mono">${s.findings.join(' ')}</span></div>` : ''}
      </div>
      <div style="display:grid;gap:8px;align-content:start">
        <div class="label">What the model had</div>
        <div class="mono" style="font-size:22px">${full(tot)} <span class="hint">tokens in</span></div>
        <div style="display:flex;height:16px;border:1px solid var(--rule);border-radius:4px;overflow:hidden">${bar(cr, 'var(--ink)', 'cache read')}${bar(cw, 'var(--cob)', 'cache write')}${bar(inp, 'var(--ochre)', 'uncached input')}</div>
        <div class="hint">cache read ${full(cr)} · cache write ${full(cw)} · uncached ${full(inp)} · out ${full(out)}${lim ? ` · ${(100 * tot / lim).toFixed(1)}% of ${full(lim)}` : ''}</div>
        <div style="border:1.5px dashed var(--rule);border-radius:8px;padding:10px">
          <div class="label">What it was made of</div>
          <div class="hint">Not reconstructed. At L1 the log measures four layers, not their sources. M4 fills this box (system, tools, CLAUDE.md, files, history…) and must reconcile to ${full(tot)}.</div>
        </div>
      </div>
      <div style="display:grid;gap:8px;align-content:start">
        <div class="label">The record</div>
        <div class="mono" style="font-size:12px">${esc(s.file)}<br>line ${full(s.line)} · bytes ${full(s.b0)}–${full(s.b1)}</div>
        <pre id="rbytes" class="mono" style="margin:0;font-size:11px;white-space:pre-wrap;word-break:break-all;max-height:260px;overflow:auto;background:var(--paper-2);border:1px solid var(--rule);border-radius:8px;padding:10px">${local ? 'reading your file…' : 'These bytes stay on the machine that holds the session. Drop the session folder on this page to read them here.'}</pre>
        <div class="hint">Provenance: not traced (M4).</div>
      </div>
    </div>
  </div>`;
}
async function fillBytes(r) {
  const s = r.spine.steps[V.step], f = s && A.files && A.files.get(s.file), pre = $('#rbytes');
  if (!f || !pre) return;
  const text = await f.slice(s.b0, s.b1).text();
  if (r.spine.steps[V.step] !== s) return;
  pre.textContent = text.length > 4000 ? text.slice(0, 4000) + `\n… ${full(text.length - 4000)} more characters` : text;
}

/* ---------- Run Diff (stub) ---------- */
function diff() {
  const runs = A.runs;
  V.diffA = V.diffA || A.current().id;
  V.diffB = V.diffB || (runs.find(x => x.id !== V.diffA && x.harness.version === A.byId[V.diffA].harness.version) || runs.find(x => x.id !== V.diffA)).id;
  const a = A.byId[V.diffA], b = A.byId[V.diffB];
  const opt = sel => runs.map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.id)} · ${esc(x.truth)}</option>`).join('');
  const sa = a.spine.toolSequence, sb = b.spine.toolSequence;
  let d = null; const m = Math.min(sa.length, sb.length);
  for (let i = 0; i < m; i++) if (sa[i] !== sb[i]) { d = i; break; }
  if (d === null && sa.length !== sb.length) d = m;
  const win = (seq, other) => d == null ? '' : seq.slice(Math.max(0, d - 3), d + 4).map((t, k) => { const i = Math.max(0, d - 3) + k; return `<span class="mono" style="padding:2px 6px;border-radius:4px;${i === d ? 'outline:2px solid var(--ochre)' : i < d ? 'opacity:.55' : ''}">${esc(t)}</span>`; }).join(' ');
  const row = (k, fa, fb) => `<div style="display:grid;grid-template-columns:140px 1fr 1fr;gap:10px;padding:6px 0;border-top:1px solid var(--rule)"><span class="label">${k}</span><span class="mono">${fa}</span><span class="mono">${fb}</span></div>`;
  const tot = r => r.validity.inputTokenRange && r.validity.inputTokenRange.min !== r.validity.inputTokenRange.max ? `${full(r.validity.inputTokenRange.min)}–${full(r.validity.inputTokenRange.max)}` : full(r.validity.totalInputTokens);
  return `<div class="panel" style="padding:18px;display:grid;gap:12px">
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><span class="label">Run Diff · stub</span>
      <label class="hint">A <select id="dA">${opt(V.diffA)}</select></label><label class="hint">B <select id="dB">${opt(V.diffB)}</select></label></div>
    ${row('', esc(a.id), esc(b.id))}
    ${row('truth', esc(a.truth), esc(b.truth))}
    ${row('capture', 'L' + a.capture.level, 'L' + b.capture.level)}
    ${row('fineness', full(a.hallmark.fineness) + ' · ' + esc(a.hallmark.bound || ''), full(b.hallmark.fineness) + ' · ' + esc(b.hallmark.bound || ''))}
    ${row('verdict', esc(a.overall), esc(b.overall))}
    ${row('steps', full(a.spine.steps.length), full(b.spine.steps.length))}
    ${row('input tokens', tot(a), tot(b))}
    <div style="display:grid;gap:6px;margin-top:6px">
      <div class="label">First divergence · tool sequence, exact match only</div>
      ${d == null ? '<div class="hint">Identical tool sequences.</div>' : `<div class="hint">Tool call ${full(d + 1)} differs.</div><div>A: ${win(sa)}</div><div>B: ${win(sb)}</div>`}
      <div class="hint">Stub: aligns by tool name only. Divergence by context and provenance is M4.</div>
    </div>
  </div>`;
}

/* ---------- wiring ---------- */
const VIEWS = { traverse, replay, diff: () => diff() };
function render(v) {
  const host = $('#v-' + v + ' .host'); if (!host) return;
  const r = A.current();
  host.innerHTML = VIEWS[v](r);
  if (v === 'replay') fillBytes(r);
}
window.ASSAY_VIEWS = { render, setStep(i) { V.step = i; }, step: () => V.step, reset() { V.step = 0; } };

document.addEventListener('click', e => {
  const c = e.target.closest('[data-step]'); if (c) { V.step = +c.dataset.step; A.go('replay'); return; }
  const b = e.target.closest('[data-rstep]'); if (b) { V.step += +b.dataset.rstep; render('replay'); }
});
document.addEventListener('input', e => {
  if (e.target.id === 'rscrub') { V.step = +e.target.value; render('replay'); $('#rscrub') && $('#rscrub').focus(); }
});
document.addEventListener('change', e => {
  if (e.target.id === 'dA') { V.diffA = e.target.value; render('diff'); }
  if (e.target.id === 'dB') { V.diffB = e.target.value; render('diff'); }
});
document.addEventListener('keydown', e => {
  if (A.view() !== 'replay' || e.target.closest('input, select, textarea')) return;
  if (e.key === 'j' || e.key === 'J') { V.step += 1; render('replay'); }
  if (e.key === 'k' || e.key === 'K') { V.step -= 1; render('replay'); }
});
})();
