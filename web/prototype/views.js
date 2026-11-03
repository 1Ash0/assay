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
      svg += `<circle data-step="${s.i}" tabindex="0" role="button" aria-label="Replay step ${s.i + 1}${s.findings.length ? ', findings ' + s.findings.join(' ') : ''}" cx="${px}" cy="${py}" r="${s.i === V.step ? 6 : 3}" fill="${s.findings.length ? 'var(--ochre)' : colour}" stroke="var(--paper)" style="cursor:pointer"><title>step ${s.i + 1} · ${esc(s.agent)} · ${s.findings.join(' ') || 'no findings'}</title></circle>`;
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

/* ---------- M4: categories, the Charge, the Core box, streaks ---------- */
// One colour per category, from the bench palette; vermilion stays reserved
// for capture failure. A category's inferred tokens are drawn stippled.
const CAT = {
  System: 'var(--c1)', 'CLAUDE.md': 'var(--c2)', Memory: 'var(--c2)', Skills: 'var(--c3)', MCP: 'var(--c4)', Rules: 'var(--c2)',
  You: 'var(--u)', Files: 'var(--c5)', Output: 'var(--c6)', Claude: 'var(--a)', Hooks: 'var(--c3)', uncategorised: 'var(--o)',
};
const partsOf = c => c ? c.parts.map(([cat, m, i]) => ({ cat, m, i, t: m + i })).filter(p => p.t > 0) : [];

// The Charge as a flow: each category on the left pours along a ribbon, as
// wide as its tokens, into the request body on the right. A category mostly
// split by characters (inferred) has a dashed ribbon edge. The seal is core's
// digest check, already done; the animation only reveals it.
function charge(r, s) {
  const c = s.context;
  if (!c) {
    // Core's validity card says whether the run has request records at all.
    const why = !r.validity.requests ? 'This run has no request records (Claude Code before 2.1.299 writes none), so there is nothing to check a rebuild against.' : 'This step has no sealed request record, so its make-up is not drawn.';
    return `<div class="chg-empty"><div class="label">Rebuild · not reconstructed</div><div class="hint">${why} Only a request whose rebuild hashes to its own digest is drawn here.</div></div>`;
  }
  const ps = partsOf(c).sort((a, b) => b.t - a.t), tot = ps.reduce((a, p) => a + p.t, 0) || 1;
  // Source bands get a floor of 16px so every label stays legible; the body
  // stack on the right keeps true proportions.
  const W = 560, gap = 6, BX = 470, BW = 60, hs = ps.map(p => Math.max(16, 240 * p.t / tot)), H = hs.reduce((a, h) => a + h, 0) + gap * (ps.length - 1);
  let y = 0, by = 0, svg = '';
  ps.forEach((p, k) => {
    const h = hs[k], bh = Math.max(1.5, H * p.t / tot), inf = p.i >= p.m, col = CAT[p.cat] || 'var(--o)';
    const y0 = y + h / 2, y1 = by + bh / 2, mid = (150 + BX) / 2;
    svg += `<g class="chg-band" style="--d:${k * 110}ms">
      <rect x="0" y="${y}" width="6" height="${h}" fill="${col}"/>
      <text x="14" y="${y + Math.min(h, 22) / 2 + 4}" class="chg-t">${esc(p.cat)} <tspan class="chg-n">${full(p.t)} · ${(100 * p.t / tot).toFixed(1)}%</tspan></text>
      <path class="chg-rib" d="M150 ${y0} C ${mid} ${y0}, ${mid} ${y1}, ${BX} ${y1}" stroke="${col}" stroke-width="${Math.max(1.5, Math.min(h, bh))}" fill="none" opacity=".5" ${inf ? 'stroke-dasharray="3 3"' : ''}><title>${esc(p.cat)}: ${full(p.t)} tokens (${full(p.m)} measured, ${full(p.i)} split by characters)</title></path>
      <path class="chg-flow" d="M150 ${y0} C ${mid} ${y0}, ${mid} ${y1}, ${BX} ${y1}" stroke="${col}" stroke-width="1.2" fill="none"/>
      <rect class="chg-blk" x="${BX}" y="${by}" width="${BW}" height="${bh}" fill="${col}"/>
    </g>`;
    y += h + gap; by += bh;
  });
  const ns = r.spine.notSeparable ? Object.entries(r.spine.notSeparable).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(' · ') : '';
  return `<div class="chg-box">
    <div class="chg-top"><span class="label">Rebuild · what this request was made of</span><button class="tool" data-rebuild aria-label="Rebuild this request again">↻ Rebuild</button></div>
    <div style="overflow-x:auto"><svg id="chg" viewBox="0 0 ${W} ${H}" style="width:100%;max-width:880px;min-width:420px;height:auto;display:block;margin:0 auto" role="img" aria-label="${ps.length} categories flowing into a request of ${full(c.total)} tokens">${svg}
      <rect x="${BX - 1}" y="0" width="${BW + 2}" height="${H}" fill="none" stroke="var(--ink)" stroke-width="1"/></svg></div>
    <div id="seal" class="chg-seal"><span>✓</span><div><b>Sealed</b><span class="mono">rebuilt body hashes to the record's own digest · line ${full(c.line + 1)}</span></div></div>
    <div class="hint">${full(c.deltaMeasured)} of ${full(c.total)} tokens measured by usage deltas; the split across categories is by characters (dashed ribbons where most of a category is split). ${ns}</div>
  </div>`;
}

function coreBox(r) {
  const st = r.spine.steps, withC = st.filter(s => s.context);
  if (!withC.length) {
    // Point at a run that has sealed requests rather than leave the flagship view empty.
    const other = A.runs.find(x => x.validity.requests && x.validity.requests.sealed > 0);
    return `<div class="hint">Core box: no sealed requests in this run, so no columns to draw.${other ? ` <button class="tool" data-run="${esc(other.id)}" data-replay="1">Replay ${esc(other.id)}, which has ${full(other.validity.requests.sealed)} sealed</button>` : ""}</div>`;
  }
  const W = 1000, H = 90, n = st.length, cw = W / n, max = Math.max(...withC.map(s => s.context.total));
  let svg = '';
  st.forEach((s, i) => {
    const x = i * cw;
    if (i > 0 && s.epoch !== st[i - 1].epoch) {
      // A compaction is an unconformity: a gap in the record, drawn as a wavy line.
      let d = `M${x} 0`; for (let y = 0; y <= H; y += 6) d += ` Q${x + (y / 6 % 2 ? 3 : -3)} ${y + 3} ${x} ${y + 6}`;
      svg += `<path d="${d}" fill="none" stroke="var(--ink)" stroke-width="1"><title>compaction</title></path>`;
    }
    if (!s.context) { svg += `<rect x="${x}" y="${H - 6}" width="${Math.max(cw - 0.3, 0.6)}" height="6" fill="none" stroke="var(--rule)" stroke-dasharray="2 2"><title>step ${i + 1}: not reconstructed</title></rect>`; return; }
    let y = H;
    for (const p of partsOf(s.context)) { const h = (p.t / max) * H; y -= h; svg += `<rect x="${x}" y="${y}" width="${Math.max(cw - 0.3, 0.6)}" height="${h}" fill="${CAT[p.cat]}"/>`; }
    svg += `<rect data-step="${i}" x="${x}" y="0" width="${cw}" height="${H}" fill="transparent" style="cursor:pointer"><title>step ${i + 1} · ${full(s.context.total)} tokens</title></rect>`;
  });
  svg += `<rect x="${V.step * cw}" y="0" width="${Math.max(cw, 2)}" height="${H}" fill="none" stroke="var(--ochre)" stroke-width="2"/>`;
  return `<div style="display:grid;gap:4px"><div class="label">Core box · every request, category bands at measured height</div>
    <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:90px;background:var(--paper-2);border-radius:4px" role="img" aria-label="Context make-up of ${withC.length} of ${n} requests; click a column to replay it">${svg}</svg>
    <div class="hint">${full(withC.length)} of ${full(n)} requests sealed and drawn · dashed = not reconstructed · wavy line = compaction</div></div>`;
}

function streaks(s) {
  const ps = s.provenance || [];
  if (!ps.length) return '<div class="hint">No tool-call literals in this step.</div>';
  const where = w => w == null ? '<span style="color:var(--mute)">◯ no earlier occurrence</span>' : esc(w[0] === 's' ? 'system block ' + w.slice(1) : w[0] === 't' ? 'tool definition ' + w.slice(1) : w[0] === 'm' ? 'message ' + w.slice(1) : 'line ' + (+w.slice(1) + 1));
  return ps.map(p => {
    const t = s.tools[p.tool] || { name: '?' };
    const ex = p.examples.map(([text, w]) => `<div style="display:flex;gap:8px;align-items:baseline;font-size:12px;padding-left:10px;border-left:2px ${w == null ? 'dotted var(--rule)' : 'dashed var(--ochre)'}"><span class="mono">${esc(text)}</span><span class="hint">${where(w)}</span></div>`).join('');
    return `<div style="display:grid;gap:3px;padding:4px 0;border-top:1px solid var(--rule)"><div class="hint"><span class="mono" style="color:var(--ink)">${esc(t.name)}</span> · ${full(p.sourced)} of ${full(p.count)} literals appeared earlier${p.source === 'l1-lines' ? ' · <span title="No sealed request: searched the transcript lines before the call. The transcript holds text the model never received, so this over-counts.">checked against earlier lines (upper bound)</span>' : ' · checked against the request it received'}</div>${ex}</div>`;
  }).join('');
}

/* ---------- Replay: three columns ---------- */
function replay(r) {
  const sp = r.spine, n = sp.steps.length;
  if (!n) return `<div class="panel" style="padding:20px"><div class="hint">This run has no model requests to step through.</div></div>`;
  // A freshly loaded run opens on its first sealed request, so Rebuild has something to rebuild.
  if (V.sealFor !== r.id) { V.sealFor = r.id; const k = sp.steps.findIndex(x => x.context); if (k > 0) V.step = k; }
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
    ${coreBox(r)}
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
        <div style="display:flex;height:16px;border:1px solid var(--rule);border-radius:4px;overflow:hidden">${bar(cr, 'var(--ink)', 'cache read')}${bar(cw, 'var(--cob)', 'cache write')}${bar(inp, 'var(--u)', 'uncached input')}</div>
        <div class="hint">cache read ${full(cr)} · cache write ${full(cw)} · uncached ${full(inp)} · out ${full(out)}${lim ? ` · ${(100 * tot / lim).toFixed(1)}% of ${full(lim)}` : ''}</div>
      </div>
      <div style="display:grid;gap:8px;align-content:start">
        <div class="label">The record</div>
        <div class="mono" style="font-size:12px">${esc(s.file)}<br>line ${full(s.line)} · bytes ${full(s.b0)}–${full(s.b1)}</div>
        <pre id="rbytes" class="mono" style="margin:0;font-size:11px;white-space:pre-wrap;word-break:break-all;max-height:260px;overflow:auto;background:var(--paper-2);border:1px solid var(--rule);border-radius:8px;padding:10px">${local ? 'reading your file…' : 'These bytes stay on the machine that holds the session. Drop the session folder on this page to read them here.'}</pre>
        <div class="label" style="margin-top:6px">Streaks · where each literal first appeared</div>
        ${streaks(s)}
      </div>
    </div>
    ${charge(r, s)}
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
function pickDiff() {
  const runs = A.runs;
  V.diffA = V.diffA || A.current().id;
  const tw = A.byId[A.byId[V.diffA].twinOf];
  V.diffB = V.diffB || (tw && tw.id) || (runs.find(x => x.id !== V.diffA && x.harness.version === A.byId[V.diffA].harness.version) || runs.find(x => x.id !== V.diffA)).id;
}
function diff() {
  const runs = A.runs;
  pickDiff();
  const a = A.byId[V.diffA], b = A.byId[V.diffB];
  const opt = sel => runs.map(x => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.id)} · ${esc(x.truth)}</option>`).join('');
  const row = (k, fa, fb) => `<div style="display:grid;grid-template-columns:140px 1fr 1fr;gap:10px;padding:5px 0;border-top:1px solid var(--rule)"><span class="label">${k}</span><span class="mono">${fa}</span><span class="mono">${fb}</span></div>`;
  const tot = r => r.validity.inputTokenRange && r.validity.inputTokenRange.min !== r.validity.inputTokenRange.max ? `${full(r.validity.inputTokenRange.min)}–${full(r.validity.inputTokenRange.max)}` : full(r.validity.totalInputTokens);
  // Alignment is core's (ADR-034): keys are tool-name multisets, exact equality only.
  const al = window.AssayCore.align(a.spine.steps, b.spine.steps);
  const ka = a.spine.steps.map(window.AssayCore.stepKey), kb = b.spine.steps.map(window.AssayCore.stepKey);
  const d = al.firstDivergence;
  // An exact-key alignment cannot tell which of two identical steps went missing (T3).
  const fuzzy = d != null && d > 0 && (ka[d - 1] === ka[d] || kb[d - 1] === kb[d]);
  const W = 1000, n = Math.max(ka.length, kb.length, 1), xa = i => 10 + (W - 20) * i / Math.max(1, ka.length - 1), xb = j => 10 + (W - 20) * j / Math.max(1, kb.length - 1);
  let svg = '';
  for (const p of al.pairs) if (p.a != null && p.b != null) svg += `<path class="df-rib" style="--d:${Math.min(1200, p.a * 12)}ms" d="M${xa(p.a)} 22 C ${xa(p.a)} 60, ${xb(p.b)} 60, ${xb(p.b)} 98" stroke="var(--cob)" stroke-width="1" fill="none"/>`;
  ka.forEach((k, i) => { svg += `<rect x="${xa(i) - 1}" y="10" width="2" height="12" fill="${k ? 'var(--ink)' : 'var(--mute)'}"><title>A step ${i + 1}: ${esc(k || 'no tools')}</title></rect>`; });
  kb.forEach((k, j) => { svg += `<rect x="${xb(j) - 1}" y="98" width="2" height="12" fill="${k ? 'var(--ink)' : 'var(--mute)'}"><title>B step ${j + 1}: ${esc(k || 'no tools')}</title></rect>`; });
  if (d != null) { const fx = xa(Math.min(d, ka.length - 1)), gx = xb(Math.min(d, kb.length - 1)); svg += `<g class="df-fork"><line x1="${fx}" y1="2" x2="${gx}" y2="118" stroke="var(--ochre)" stroke-width="2" stroke-dasharray="5 3"><title>first divergence</title></line><circle cx="${(fx + gx) / 2}" cy="60" r="6" fill="var(--ochre)"/><circle class="df-ping" cx="${(fx + gx) / 2}" cy="60" r="6" fill="none" stroke="var(--ochre)"/></g>`; }
  const near = (keys, i) => keys.slice(Math.max(0, i - 2), i + 3).map((k, j) => { const at = Math.max(0, i - 2) + j; return `<span class="mono" style="padding:1px 5px;border-radius:4px;${at === i ? 'outline:2px solid var(--ochre)' : 'opacity:.6'}">${esc(k || '·')}</span>`; }).join(' ');
  const twin = a.twinOf === b.id || b.twinOf === a.id;
  return `<div class="panel" style="padding:18px;display:grid;gap:12px">
    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center"><span class="label">Run Diff · twin lanes</span>
      <label class="hint">A <select id="dA">${opt(V.diffA)}</select></label><label class="hint">B <select id="dB">${opt(V.diffB)}</select></label></div>
    <div class="hint">${twin ? 'A recorded twin pair: same prompt, same repo commit.' : 'Not a recorded twin pair: unrelated runs diverge early by nature. Pick twin-a and twin-b for a recorded pair.'}</div>
    <div style="overflow-x:auto"><svg viewBox="0 0 ${W} 120" style="min-width:600px;width:100%" role="img" aria-label="${full(al.matched)} of ${full(n)} steps aligned by exact tool keys">${svg}</svg></div>
    <div class="hint">top lane A, bottom lane B · a ribbon joins two steps whose tool-name sets are identical · ${full(al.matched)} matched, ${full(al.onlyA)} only in A, ${full(al.onlyB)} only in B</div>
    <div style="display:grid;gap:6px">
      <div class="label">First divergence</div>
      ${d == null ? '<div class="hint">None: every step has the same tool-name set, in the same order.</div>' : `<div class="hint">${fuzzy ? 'At or after' : 'At'} step ${full(d + 1)}${fuzzy ? ': the steps around it share a key, so exact matching cannot say which one went missing' : ''}.</div><div>A: ${near(ka, d)}</div><div>B: ${near(kb, d)}</div>`}
      <div class="hint">Keys ignore tool inputs: two runs calling the same tools on different files align perfectly. Where inputs came from is the streaks' job, in Replay.</div>
    </div>
    ${row('', esc(a.id), esc(b.id))}
    ${row('truth', esc(a.truth), esc(b.truth))}
    ${row('capture', 'L' + a.capture.level, 'L' + b.capture.level)}
    ${row('steps', full(a.spine.steps.length), full(b.spine.steps.length))}
    ${row('context tokens', full(a.validity.totalContextTokens), full(b.validity.totalContextTokens))}
    ${row('uncached input', tot(a), tot(b))}
  </div>`;
}

/* ---------- wiring ---------- */
const VIEWS = { traverse, replay, diff: () => diff() };
// A corpus run's spine lives in runs/<id>.json (export-site), loaded on first
// use; a dropped folder's run already carries it.
const loading = {};
async function ensureSpine(r) {
  if (!r.spine || !r.spine.lazy) return r;
  loading[r.id] = loading[r.id] || fetch(r.spine.lazy).then(x => { if (!x.ok) throw new Error(x.status); return x.json(); });
  r.spine = await loading[r.id];
  return r;
}
async function render(v) {
  const host = $('#v-' + v + ' .host'); if (!host) return;
  let r = A.current();
  if (v === 'diff') { pickDiff(); await Promise.all([ensureSpine(A.byId[V.diffA]), ensureSpine(A.byId[V.diffB])]); }
  if (r.spine && r.spine.lazy) {
    host.innerHTML = `<div class="panel" style="padding:20px"><div class="hint">Loading ${esc(r.id)}'s steps…</div></div>`;
    try { r = await ensureSpine(r); } catch (e) { host.innerHTML = `<div class="panel" style="padding:20px"><div class="hint">Could not load runs/${esc(r.id)}.json (${esc(e.message)}). Run pnpm web.</div></div>`; return; }
  }
  host.innerHTML = VIEWS[v](r);
  if (v === 'replay') { fillBytes(r); rebuild(); }
}
window.ASSAY_VIEWS = { render, setStep(i) { V.step = i; }, step: () => V.step, reset() { V.step = 0; } };

// Rebuild: lay the Charge's blocks back one by one, then strike the seal. The
// seal is core's digest check, already done; the motion only reveals it.
function rebuild() {
  const box = $('#chg'), seal = $('#seal');
  if (!box || !seal) return;
  // Restart the CSS animation: drop the class, force a reflow, add it back.
  box.classList.remove('rb-on'); seal.classList.remove('rb-on'); void box.getBoundingClientRect();
  box.classList.add('rb-on'); seal.style.setProperty('--d', (box.querySelectorAll('.chg-band').length * 110 + 700) + 'ms'); seal.classList.add('rb-on');
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-rebuild]')) { rebuild(); return; }
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
// SVG marks that act as buttons answer Enter and Space like buttons do.
document.addEventListener('keydown', e => {
  const t = e.target;
  if ((e.key === 'Enter' || e.key === ' ') && t instanceof SVGElement && t.getAttribute('role') === 'button') { e.preventDefault(); t.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
});
document.addEventListener('keydown', e => {
  if (A.view() !== 'replay' || e.target.closest('input, select, textarea')) return;
  if (e.key === 'j' || e.key === 'J') { V.step += 1; render('replay'); }
  if (e.key === 'k' || e.key === 'K') { V.step -= 1; render('replay'); }
});
})();
