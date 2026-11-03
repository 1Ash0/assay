/* assay bench. Displays what assay-core computed (`assay export-site` →
   data.js); it never recomputes Health. Every number has a file behind it. */
(() => {
'use strict';
const RUNS = window.ASSAY_DATA.runs;
const byId = Object.fromEntries(RUNS.map(r => [r.id, r]));
const BINS = 140;
const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, html = '') => { const e = document.createElement(tag); for (const k in attrs) e.setAttribute(k, attrs[k]); e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmt = n => n == null ? '–' : n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toLocaleString();
const full = n => n == null ? '–' : Math.round(n).toLocaleString();
const store = { get(k, d) { try { const v = localStorage.getItem('assay.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('assay.' + k, JSON.stringify(v)); } catch {} } };

// What each gate checks, telegraphed before the scan (from ARCHITECTURE.md).
const DET = [
  ['D1', 'Subagent blind spot', 'A subagent is named but its transcript file is missing, so token totals undercount.', ['agentId', 'subagent_type']],
  ['D2', 'Usage double-count', 'One message.id written on several lines. Summing every line inflates tokens.', ['id', 'usage']],
  ['D3', 'Chain break', 'parentUuid points at a line that is not there (GC or truncation).', ['parentUuid']],
  ['D4', 'Orphan tool call', 'A tool_result with no tool_use, excluding in-flight and compacted turns.', ['tool_use_id']],
  ['D5', 'Context overflow', 'Input exceeds the model’s known window. Unknown model: noted, not checked.', ['model']],
  ['D6', 'Usage disagreement', 'Copies of one message report different token counts.', ['input_tokens', 'output_tokens']],
  ['D7', 'Compaction pattern', 'Context grew after a compaction instead of shrinking.', []],
  ['D8', 'Session conflict', 'One file holds more than one sessionId.', ['sessionId']],
  ['D9', 'Clock reversal', 'A timestamp runs backwards.', ['timestamp']],
  ['D10', 'Request count', 'The runtime’s own API request count disagrees with requests found.', []],
  ['D11', 'Request record broken', 'A recorded request does not rebuild to its own digest (ADR-026).', ['requestDigest']],
  ['D12', 'Agent total disagrees', 'An agent span reports a total that differs from the LLM calls beneath it.', []],
  ['D0', 'Unknown format version', 'The harness version is outside what the importer was checked against (Rule 7).', ['version']],
  ['D-cost', 'Cost cross-check', 'Runtime cost-state totals disagree with the transcript’s usage.', []],
].map(([id, name, what, keys]) => ({ id, name, what, keys }));
const DMAP = Object.fromEntries(DET.map(d => [d.id, d]));
const LADDER = [
  ['L0', 'Final text only'], ['L1', 'Transcript events, usage per message'], ['L2', '+ lifecycle hooks'],
  ['L3', '+ OTel spans with ids'], ['L4', '+ exact API bodies'],
];

const verdictClass = v => !v ? '' : v === 'trustworthy' ? 'ok' : v.startsWith('usable') ? 'caveat' : 'bad';
const verdictGlyph = v => ({ ok: '●', caveat: '▲', bad: '✕' }[verdictClass(v)] || '');
const verdictText = v => v === 'trustworthy' ? 'trustworthy' : v.startsWith('usable') ? 'usable, with caveats' : v.replace('do-not-trust-for:', 'do not trust: ').replace(/-/g, ' ');

/* ---------- sound (off by default) ---------- */
let actx = null, lastBlip = 0;
const sound = { on: store.get('sound', false) };
function tone(freq, dur = 0.06, type = 'triangle', gain = 0.05) {
  if (!sound.on) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator(), g = actx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = gain;
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
    o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime + dur);
  } catch {}
}
const blip = i => { const t = performance.now(); if (t - lastBlip < 55) return; lastBlip = t; tone(330 + i * 55, 0.05); };
const thunk = () => { tone(90, 0.25, 'sine', 0.2); setTimeout(() => tone(60, 0.3, 'sine', 0.15), 40); };

/* ---------- state ---------- */
const S = {
  view: 'report', run: null, p: 0, playing: false, speed: 1, struck: false,
  sel: null, item: null, table: false, desc: false, mission: null,
  filter: 'all', det: null, layout: 'table', sort: ['date', -1], caught: store.get('caught', {}), call: null,
  calls: store.get('calls', { right: 0, total: 0, streak: 0 }), punches: store.get('punches', {}),
};

/* ---------- per-run precompute ---------- */
function prep(r) {
  if (r._c) return r._c;
  const lines = r.source.lines || 1;
  const binOf = line => Math.min(BINS - 1, Math.floor(line / lines * BINS));
  const cum = (f) => { const a = new Float64Array(BINS + 1); for (let i = 0; i < BINS; i++) a[i + 1] = a[i] + f(i); return a; };
  const outB = new Float64Array(BINS), reqB = new Float64Array(BINS);
  r.reqs.forEach(q => { const b = binOf(q[0]); outB[b] += q[4]; reqB[b] += 1; });
  const f = {};
  DET.forEach(d => { f[d.id] = cum(i => r.band[i].f[d.id] || 0); });
  // Feed items in file order: findings with a line, placed at their bin.
  const items = [];
  r.findings.forEach(fd => fd.items.forEach((it, k) => { const line = it.ev[0] ? it.ev[0].line : null; if (line != null) items.push({ d: fd.id, sev: fd.severity, k, bin: binOf(line), line, it }); }));
  items.sort((a, b) => a.line - b.line);
  const reasonsSeen = [];
  r._c = {
    binOf, f, items,
    naive: cum(i => r.band[i].n || 0), out: cum(i => outB[i]), req: cum(i => reqB[i]),
    unk: cum(i => r.band[i].unknown), reasonsSeen,
  };
  return r._c;
}
const at = (arr, p) => { const i = Math.floor(p); if (i >= BINS) return arr[BINS]; const fr = p - i; return arr[i] + (arr[i + 1] - arr[i]) * fr; };

/* ---------- capture plate (always first) ---------- */
function renderPlate(r) {
  const lvl = r.capture.level, fl = r.capture.flags || {};
  const truthNote = '';
  $('#plate').innerHTML = `
    <div><div class="label">Capture level</div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-top:6px"><span class="big" style="font-size:46px">L${lvl}</span><span class="hint" style="font-size:12px">of L4</span></div></div>
    <div class="ladder">${LADDER.map(([id, t], i) => `<div class="rung ${i <= lvl ? 'on' : 'off hatch'}"><b>${id}</b><span>${t}${i > lvl ? ' · not captured' : ''}</span></div>`).join('')}</div>
    <div><div class="label" style="margin-bottom:6px">Content flags</div>
      <div class="flags">${[['prompts', 'Prompts'], ['responses', 'Responses'], ['toolDetails', 'Tool details'], ['toolContent', 'Tool content'], ['rawBodies', 'Raw bodies']].map(([k, t]) => `<span>${t}</span><span class="pip ${fl[k] ? 'yes' : ''}">${fl[k] ? 'ON' : 'OFF'}</span>`).join('')}</div></div>
    <dl class="kv">
      <dt>Harness</dt><dd>${esc(r.harness.tool)} ${esc(r.harness.version)}</dd>
      <dt>Layout</dt><dd>${esc(r.harness.layout)}</dd>
      <dt>Truncated</dt><dd>${r.capture.truncated ? 'yes' : 'no'}</dd>
      <dt>Sources</dt><dd>${r.source.count} file${r.source.count > 1 ? 's' : ''}</dd>
    </dl>
    <div><span class="truth ${r.truth}">${r.truth}</span></div>
    ${r.truth === 'scripted' ? '<div class="ribbon">SYNTHETIC · NOT A PRODUCTION EXAMPLE</div>' : ''}
    ${truthNote}`;
}

/* ---------- head + picker ---------- */
function renderHead(r) {
  const pick = RUNS.filter(x => x.truth === 'real').slice(0, 10);
  if (!pick.includes(r)) pick.unshift(r);
  $('#head').innerHTML = `
    <div style="min-width:0;flex:1">
      <div class="label">${S.mission ? 'Mission specimen · tampered' : 'Specimen'}</div>
      <h1 style="margin-top:6px">${esc(r.id)}</h1>
      <div class="sub">
        <span class="truth ${r.truth}">${r.truth}</span>
        <span>${full(r.source.lines)} lines · ${fmt(r.source.bytes)} bytes · ${full(r.counts.events)} events</span>
      </div>
      <div class="sha" style="margin-top:6px" title="${esc(r.source.sha256)}">${esc(r.source.file)} · sha256 ${esc(r.source.sha256.slice(0, 16))}…</div>
      <div class="picker" aria-label="Pick a specimen">${pick.map(x => `<button class="chip ${x.truth}" data-run="${esc(x.id)}" aria-pressed="${x === r}">${esc(x.id)}</button>`).join('')}<button class="chip" data-goto="shelf">all →</button></div>
      <div class="punches" id="punches" aria-label="Hallmark">${punchStrip(r, false)}</div>
    </div>`;
  $('#axisEnd').textContent = 'line ' + full(r.source.lines);
}

function dateLetter(ts) { if (!ts) return '–'; const d = new Date(ts); return d.getUTCFullYear() + '·' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
// Read left to right like a real hallmark; fineness is marked to the lowest rate.
function punchStrip(r, struck) {
  const h = r.hallmark || {}, cls = verdictClass(r.overall);
  const P = (kind, top, bot, title, on = true) => `<span class="punch ${kind} ${on ? 'on' : 'blank'}" title="${esc(title)}"><b>${top}</b><i>${bot}</i></span>`;
  return P('sponsor', 'CC', esc(r.harness.version), 'Sponsor: ' + r.harness.tool + ' ' + r.harness.version) +
    P('capture', 'L' + r.capture.level, 'capture', 'Capture level ' + r.capture.level + ' of 4') +
    P('fine', struck ? (h.fineness ?? '–') : '???', struck ? 'fineness' : 'assaying', h.bound ? `Fineness ${h.fineness}/1000, bounded by ${h.bound}` : 'Fineness', struck) +
    P('truth ' + r.truth, r.truth === 'real' ? 'R' : r.truth === 'scripted' ? 'S' : 'P', r.truth, 'Truth: ' + r.truth) +
    P('date', dateLetter(h.firstTs), 'date', 'First event date (UTC)', struck) +
    `<span class="punch verdict ${struck ? 'on ' + cls : 'blank'}" id="hallmark" title="${esc(verdictText(r.overall))}"><b>${struck ? verdictGlyph(r.overall) : '?'}</b><i>${struck ? esc(verdictText(r.overall)) : 'verdict'}</i></span>`;
}

/* ---------- gates ---------- */
function renderGates(r) {
  const present = Object.fromEntries(r.findings.map(f => [f.id, f]));
  $('#gates').innerHTML = DET.map(d => {
    const f = present[d.id];
    return `<button class="gate ${f ? f.severity : ''}" data-gate="${d.id}" aria-pressed="${S.sel === d.id}" aria-label="${d.id} ${d.name}">
      <div class="gid">${d.id}</div><div class="gn" data-n="${d.id}">0</div>
      <div class="tip" role="tooltip"><b>${d.name}</b>${d.what}${f ? '' : '<div style="margin-top:6px;opacity:.7">Nothing fired on this run.</div>'}</div></button>`;
  }).join('');
}

/* ---------- tape ---------- */
const W = 1000, H = 150;
function renderTape(r) {
  const c = prep(r), cw = W / BINS;
  let g = `<defs><pattern id="hp" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="5" height="5" fill="var(--paper)"/><line x1="0" y1="0" x2="0" y2="5" stroke="var(--unk)" stroke-width="1.4" opacity=".55"/></pattern>
    <clipPath id="scanClip"><rect id="scanRect" x="0" y="-30" width="0" height="${H + 40}"/></clipPath></defs>`;
  const body = (dim) => {
    let s = '';
    r.band.forEach((b, i) => {
      const x = i * cw, top = 22, h = H - top;
      const known = b.user + b.assistant + b.system + b.other, tot = known + b.unknown;
      if (!tot) { s += `<rect x="${x}" y="${top}" width="${cw - 0.8}" height="${h}" fill="none" stroke="var(--rule)" stroke-dasharray="2 2"/>`; return; }
      let y = top;
      const seg = (n, fill) => { if (!n) return; const hh = n / tot * h; s += `<rect x="${x}" y="${y}" width="${cw - 0.8}" height="${hh}" fill="${fill}"/>`; y += hh; };
      seg(b.unknown, 'url(#hp)'); seg(b.system + b.other, 'var(--s)'); seg(b.user, 'var(--u)'); seg(b.assistant, 'var(--a)');
    });
    return `<g opacity="${dim ? 0.18 : 1}">${s}</g>`;
  };
  g += body(true) + `<g clip-path="url(#scanClip)">${body(false)}`;
  // finding pins, warn ones taller
  r.band.forEach((b, i) => {
    const ids = Object.keys(b.f); if (!ids.length) return;
    const warn = ids.some(id => (r.findings.find(f => f.id === id) || {}).severity === 'warn');
    const x = i * cw + cw / 2;
    g += `<line x1="${x}" x2="${x}" y1="${warn ? 0 : 11}" y2="20" stroke="${warn ? 'var(--ochre)' : 'var(--mute)'}" stroke-width="${warn ? 2.4 : 1.2}"/>${warn ? `<circle cx="${x}" cy="2" r="3" fill="var(--ochre)"/>` : ''}`;
  });
  r.compactions.forEach(line => { const x = c.binOf(line) * cw + cw / 2; g += `<line x1="${x}" x2="${x}" y1="22" y2="${H}" stroke="var(--paper)" stroke-width="1.5" stroke-dasharray="3 3"/>`; });
  g += `</g><line id="head1" x1="0" x2="0" y1="-6" y2="${H + 4}" stroke="var(--ink)" stroke-width="2"/><rect id="hover1" x="0" y="0" width="${cw}" height="${H}" fill="var(--ink)" opacity="0"/>`;
  const svg = $('#tape'); svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.innerHTML = g;
}

function renderCtx(r) {
  const c = prep(r), lines = r.source.lines || 1, svg = $('#ctx');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const pts = r.reqs.map(q => [q[0] / lines * W, q[1] + q[2] + q[3]]);
  const max = Math.max(1, ...pts.map(p => p[1]));
  const y = v => H - 6 - v / max * (H - 20);
  let d = '', a = '';
  pts.forEach(([x, v], i) => { d += (i ? 'L' : 'M') + x.toFixed(1) + ',' + y(v).toFixed(1); });
  if (pts.length) a = d + `L${pts[pts.length - 1][0].toFixed(1)},${H - 6}L${pts[0][0].toFixed(1)},${H - 6}Z`;
  const comp = r.compactions.map(line => { const x = line / lines * W; return `<line x1="${x}" x2="${x}" y1="0" y2="${H - 6}" stroke="var(--ink)" stroke-dasharray="3 3" stroke-width="1"/>`; }).join('');
  svg.innerHTML = `<defs><clipPath id="ctxClip"><rect id="ctxRect" x="0" y="-10" width="0" height="${H + 20}"/></clipPath></defs>
    <line x1="0" x2="${W}" y1="${H - 6}" y2="${H - 6}" stroke="var(--rule)"/>
    <text x="0" y="10" font-family="IBM Plex Mono" font-size="10" fill="var(--mute)">${fmt(max)} tokens</text>
    ${pts.length ? '' : `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-family="IBM Plex Mono" font-size="12" fill="var(--mute)">No usage records on this run</text>`}
    <g clip-path="url(#ctxClip)"><path d="${a}" fill="var(--cob)" opacity=".14"/><path d="${d}" fill="none" stroke="var(--cob)" stroke-width="1.4" vector-effect="non-scaling-stroke"/>${comp}</g>
    <line id="head2" x1="0" x2="0" y1="0" y2="${H}" stroke="var(--ink)" stroke-width="2"/>`;
  void c;
}

/* ---------- live update while scanning ---------- */
let prevBin = -1;
function update(fromUser) {
  const r = S.run, c = prep(r), p = S.p, x = p / BINS * W;
  $('#scanRect').setAttribute('width', x); $('#ctxRect').setAttribute('width', x);
  ['#head1', '#head2'].forEach(s => { const h = $(s); h.setAttribute('x1', x); h.setAttribute('x2', x); });
  $('#scrub').value = p;
  const lineAt = Math.round(p / BINS * r.source.lines);
  $('#pos').textContent = `line ${full(lineAt)} / ${full(r.source.lines)}`;
  // gates
  DET.forEach((d, i) => {
    const n = Math.round(at(c.f[d.id], p)), node = document.querySelector(`[data-n="${d.id}"]`);
    if (!node) return;
    const old = +node.textContent;
    if (n !== old) {
      node.textContent = n; const g = node.parentElement; g.classList.toggle('has', n > 0);
      if (n > old && !fromUser) { g.classList.add('hit'); setTimeout(() => g.classList.remove('hit'), 220); blip(i); if (!old) award(d.id); }
    }
  });
  // meters
  const nv = at(c.naive, p), av = at(c.out, p);
  const lb = r.findings.some(f => f.id === 'D1') && p > (prep(r).items.find(i => i.d === 'D1') || { bin: 1e9 }).bin;
  $('#mNaive').textContent = fmt(nv); $('#mAssay').textContent = (lb ? '≥ ' : '') + fmt(av);
  $('#mNaive').title = full(nv); $('#mAssay').title = full(av);
  $('#mRatio').innerHTML = av > 0 ? (nv / av > 1.01 ? `Summing every line would overcount by <b>×${(nv / av).toFixed(2)}</b>` : 'No double-counting on this run') : (r.reqs.length ? '&nbsp;' : 'No usage records to count');
  $('#mReq').textContent = full(at(c.req, p));
  $('#mReqSub').textContent = `${full(r.counts.events)} events → ${full(r.counts.llm)} unique requests`;
  $('#mUnk').textContent = full(at(c.unk, p));
  const frac = p / BINS, reasons = $('#mReasons').children;
  for (let i = 0; i < reasons.length; i++) reasons[i].classList.toggle('in', frac >= (i + 1) / (reasons.length + 1) || S.struck);
  // feed: findings the head has passed
  const bin = Math.floor(p);
  if (bin !== prevBin && !S.sel) renderFeed();
  prevBin = bin;
  if (p >= BINS && !S.struck) strike();
}

function strike() {
  S.struck = true; S.playing = false; setPlay();
  const r = S.run;
  $('#punches').innerHTML = punchStrip(r, true);
  $('#punches').querySelectorAll('.punch').forEach((n, i) => { n.style.animationDelay = (i * 70) + 'ms'; n.classList.add('stamp'); });
  if (S.call) {
    const right = S.call === verdictClass(r.overall);
    S.callResult = right; S.calls.total++; if (right) { S.calls.right++; S.calls.streak++; } else S.calls.streak = 0;
    store.set('calls', S.calls); S.call = null; renderScore();
  }
  r.findings.forEach(f => award(f.id));
  setTimeout(() => { $('#head').classList.add('shake'); thunk(); setTimeout(() => $('#head').classList.remove('shake'), 350); }, 300);
  live(`Assay complete. ${r.id}: ${verdictText(r.overall)}. Capture level ${r.capture.level}.`);
  if (!S.sel) renderRail();
  if (S.mission) setTimeout(() => showOutcome(S.mission), 900);
}
function unstrike() { S.struck = false; S.callResult = undefined; const ps = $('#punches'); if (ps && S.run) ps.innerHTML = punchStrip(S.run, false); }

/* ---------- rail ---------- */
function railHead(html) { $('#railHead').innerHTML = html; }
function renderRail() {
  if (S.item) return renderBytes();
  if (S.sel) return renderDetector();
  const r = S.run;
  if (S.struck) {
    const v = r.validity || {};
    railHead(`<span class="label">Validity card</span><span class="spacer"></span><span class="mono" style="font-size:10px;color:var(--mute)">${esc(r.file.split('/').pop())}</span>`);
    const cr = S.callResult === undefined ? '' : `<div class="callres ${S.callResult ? 'yes' : 'no'}"><b>${S.callResult ? 'Called it.' : 'Not this time.'}</b><span>Assay says ${esc(verdictText(r.overall))}. ${S.calls.right}/${S.calls.total} right${S.calls.streak > 1 ? ' · streak ' + S.calls.streak : ''}</span></div>`;
    $('#railBody').innerHTML = `${cr}
      ${S.desc ? `<div class="desc">${describe(r)}</div>` : ''}
      <div class="verdicts">${Object.entries(r.verdicts).map(([k, val]) => `<div class="vrow"><span class="mono" style="color:var(--mute)">${k}</span><span><span class="vtag ${verdictClass(val)}">${verdictGlyph(val)} ${esc(verdictText(val))}</span></span></div>`).join('')}</div>
      <dl class="kv" style="font-size:12.5px">
        <dt>Claimed turns</dt><dd>${full(v.claimedTurns)}</dd>
        <dt>With verified usage</dt><dd>${full(v.verifiedUsageTurns)}</dd>
        <dt>Output tokens</dt><dd>${full(v.totalOutputTokens)}</dd>
        ${v.totalContextTokens != null ? `<dt>Context tokens</dt><dd>${full(v.totalContextTokens)}</dd>` : ''}
        <dt>Cache hit rate</dt><dd>${v.cacheHitRate == null ? '–' : (v.cacheHitRate * 100).toFixed(2) + '%'}</dd>
        <dt>Edges</dt><dd>${full(r.counts.observed)} observed · ${full(r.counts.matched)} matched</dd>
      </dl>
      <div><div class="label" style="margin-bottom:6px">What the record can’t tell you</div><ul class="caveats">${(v.caveats || []).map(c => `<li>${esc(c)}</li>`).join('') || '<li>No caveats.</li>'}</ul></div>
      ${r.unknownSample ? `<button class="btn ghost" data-unk="1">Open a held-aside line →</button>` : ''}
      <div class="label">Click any gate or red tick to drill to the bytes.</div>`;
    return;
  }
  railHead(`<span class="label">${S.p > 0 ? 'Caught so far' : 'Ready'}</span><span class="spacer"></span><span class="mono" style="font-size:10px;color:var(--mute)">evidence rail</span>`);
  renderFeed();
}
function renderFeed() {
  if (S.sel || S.item || S.struck) return;
  const r = S.run, c = prep(r);
  if (S.p === 0) {
    $('#railBody').innerHTML = `${S.desc ? `<div class="desc">${describe(r)}</div>` : ''}
      <div class="callit">
        <div class="label">Call it first</div>
        <div class="q">Would you trust this session's numbers?</div>
        <div class="hint">You've seen the capture plate and the tape. Make your call, then watch assay check it.</div>
        <div class="calls">
          <button data-call="ok"><span class="vtag ok">●</span>Trust them</button>
          <button data-call="caveat"><span class="vtag caveat">▲</span>Only with caveats</button>
          <button data-call="bad"><span class="vtag bad">✕</span>Don't trust some</button>
        </div>
        <button class="linkish" data-act="play">or just assay it <kbd>Space</kbd></button>
      </div>`;
    return;
  }
  const passed = c.items.filter(it => it.bin < S.p);
  const shown = passed.slice(-40).reverse();
  railHead(`<span class="label">Caught so far · ${passed.length}${passed.length < c.items.length || S.p < BINS ? '' : ''}</span><span class="spacer"></span><span class="mono" style="font-size:10px;color:var(--mute)">newest first</span>`);
  $('#railBody').innerHTML = `<div class="feed">${shown.map(it => `<button class="row" data-d="${it.d}" data-k="${it.k}"><span class="d ${it.sev}">${it.d}</span><span><span class="msg">${esc(short(it.it.msg))}</span><div class="where">line ${full(it.line)}</div></span></button>`).join('') || '<div class="hint">Nothing yet. Clean so far.</div>'}</div>`;
}
const short = m => m.length > 120 ? m.slice(0, 117) + '…' : m;

function award(id) {
  if (S.punches[id]) return;
  S.punches[id] = S.run.id; store.set('punches', S.punches); renderScore();
  const d = DMAP[id], t = el('div', { class: 'toast', role: 'status' }, `<span class="mini-punch">${id.replace('D-cost', 'D$')}</span><span><b>New punch</b>${esc(d.name)} · found on ${esc(S.run.id)}</span>`);
  document.body.appendChild(t); tone(880, 0.09, 'square', 0.03);
  setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3100);
}
function renderCard() {
  const where = id => RUNS.filter(r => r.findings.some(f => f.id === id));
  $('#cardBody').innerHTML = DET.map(d => {
    const got = S.punches[d.id], w = where(d.id), real = w.filter(r => r.truth === 'real');
    const hint = got ? `First seen on <span class="mono">${esc(got)}</span>` : w.length ? `Fires on ${w.length} session${w.length > 1 ? 's' : ''}${real.length ? '' : ' (none real yet)'}` : 'Never fired on a run here. The check still runs on every session.';
    return `<div class="pc ${got ? 'got' : w.length ? '' : 'never'}"><span class="mini-punch">${d.id.replace('D-cost', 'D$')}</span><div><b>${esc(d.name)}</b><div class="where">${hint}</div></div>
      ${!got && w.length ? `<button class="chip" data-run="${esc((real[0] || w[0]).id)}" data-open="1" data-close="card">hunt →</button>` : ''}</div>`;
  }).join('');
  $('#card').classList.add('on');
}
// One small figure per detector, drawn from the finding's own numbers (M3_PLAN §6).
function figure(id, f) {
  const m = (f.items[0] || {}).msg || '', n = re => { const x = m.match(re); return x ? x.slice(1).map(Number) : null; };
  const T = (x, y, t, a = 'start', c = 'var(--mute)') => `<text x="${x}" y="${y}" text-anchor="${a}" font-family="IBM Plex Mono" font-size="11" fill="${c}">${t}</text>`;
  let g = '';
  if (id === 'D2') {
    const k = (n(/appears (\d+)×/) || [2])[0];
    for (let i = Math.min(k, 12) - 1; i >= 0; i--) g += `<rect x="${20 + i * 9}" y="${18 + i * 3}" width="150" height="26" rx="3" fill="${i ? 'none' : 'var(--cob)'}" stroke="${i ? 'var(--ochre)' : 'var(--cob)'}" stroke-dasharray="${i ? '3 3' : ''}" opacity="${i ? 0.75 : 1}"/>`;
    g += T(20, 14, `${k} copies of one message.id`) + T(26, 36, 'kept: 1 request', 'start', 'var(--paper)') + T(300, 70, `naive sum ×${k}`, 'end', 'var(--ochre)');
  } else if (id === 'D6') {
    const r = n(/range (\d+)–(\d+)/) || n(/\((\d+)–(\d+)\)/) || [0, 1], [a, b] = r, x = v => 20 + (v - a) / Math.max(1, b - a) * 260;
    g = `<line x1="20" x2="280" y1="40" y2="40" stroke="var(--ink)" stroke-width="2"/><line x1="20" x2="20" y1="32" y2="48" stroke="var(--ink)" stroke-width="2"/><circle cx="${x(b)}" cy="40" r="7" fill="var(--ochre)"/>` +
      T(20, 66, full(a)) + T(280, 66, full(b) + ' · selected', 'end', 'var(--ochre)') + T(20, 18, 'duplicate copies disagree; max-usage kept');
  } else if (id === 'D-cost') {
    const r = n(/total \((\d+)\) vs JSONL input total \((\d+)\)/) || [0, 0];
    g = `<line x1="150" x2="150" y1="20" y2="70" stroke="var(--ink)" stroke-width="2"/><line x1="40" x2="260" y1="24" y2="24" stroke="var(--ink)" stroke-width="2"/><path d="M150 70l-10 10h20z" fill="var(--ink)"/>
      <rect x="20" y="30" width="90" height="34" rx="4" fill="var(--paper-2)" stroke="var(--rule)"/><rect x="190" y="30" width="90" height="34" rx="4" fill="var(--paper-2)" stroke="var(--rule)"/>` +
      T(65, 46, 'cost-state', 'middle') + T(65, 59, fmt(r[0]), 'middle', 'var(--ink)') + T(235, 46, 'JSONL', 'middle') + T(235, 59, fmt(r[1]), 'middle', 'var(--ink)') +
      T(150, 14, r[1] ? `${Math.round(Math.abs(r[1] - r[0]) / Math.max(r[0], r[1]) * 100)}% apart` : '', 'middle', 'var(--ochre)');
  } else if (id === 'D1') {
    g = `<rect x="20" y="14" width="120" height="50" fill="var(--cob)" opacity=".85"/>` + T(26, 30, 'main', 'start', 'var(--paper)') +
      `<rect x="160" y="14" width="120" height="50" fill="none" stroke="var(--verm)" stroke-dasharray="4 3" stroke-width="1.5"/><path d="M160 14L280 64M280 14L160 64" stroke="var(--verm)" stroke-width="1.5"/>` +
      T(220, 78, 'subagent · no recovery', 'middle', 'var(--verm)') + T(20, 78, 'totals are a lower bound (≥)');
  } else if (id === 'D9') {
    g = `<line x1="20" x2="280" y1="44" y2="44" stroke="var(--rule)"/><path d="M60 44L240 44" stroke="var(--ink)" stroke-width="2"/><path d="M240 44L190 24" stroke="var(--ochre)" stroke-width="2.5"/><circle cx="190" cy="24" r="4" fill="var(--ochre)"/>` +
      T(20, 70, 'time →') + T(280, 70, 'next event stamped earlier', 'end', 'var(--ochre)');
  } else if (id === 'D7') {
    const r = n(/inputTokens (\d+) > pre-compaction (\d+)/);
    g = `<path d="M20 30 Q60 20 100 30 T180 30" fill="none" stroke="var(--rule)"/><path d="M20 60 L130 60" stroke="var(--cob)" stroke-width="6"/><path d="M140 60 L280 50" stroke="var(--ochre)" stroke-width="6"/><path d="M135 20 q5 10 0 20 q-5 10 0 20 q5 10 0 20" fill="none" stroke="var(--ink)" stroke-dasharray="3 2"/>` +
      T(20, 80, r ? `pre ${r[1]}` : 'pre') + T(280, 80, r ? `post ${r[0]} · rose` : 'post rose', 'end', 'var(--ochre)') + T(20, 14, 'context grew across a compaction');
  } else if (id === 'D5') {
    g = `<rect x="20" y="30" width="190" height="24" fill="var(--cob)" opacity=".8"/><line x1="240" x2="240" y1="14" y2="70" stroke="var(--ink)" stroke-width="2" stroke-dasharray="${/unknown/.test(m) ? '4 4' : ''}"/>` +
      T(240, 84, /unknown/.test(m) ? 'limit unknown · not guessed' : 'model limit', 'middle') + T(20, 20, 'context vs the model window');
  } else if (id === 'D4') {
    g = `<path d="M40 20 h-14 v40 h14" fill="none" stroke="var(--ochre)" stroke-width="2"/><circle cx="60" cy="40" r="5" fill="var(--ink)"/><line x1="60" x2="270" y1="40" y2="40" stroke="var(--rule)" stroke-dasharray="4 4"/>` +
      T(80, 30, 'tool_result arrives') + T(80, 64, 'no tool_use to match it', 'start', 'var(--ochre)');
  } else return '';
  return `<svg class="fig" viewBox="0 0 300 90" role="img" aria-label="${esc(DMAP[id].name)} figure">${g}</svg>`;
}
function renderDetector() {
  const r = S.run, d = DMAP[S.sel], f = r.findings.find(x => x.id === S.sel);
  railHead(`<button class="tbtn" data-act="up" aria-label="Back">←</button><span class="label">${d.id} · ${esc(d.name)}</span>`);
  $('#railBody').innerHTML = `<div class="msg" style="font-size:13px">${esc(d.what)}</div>
    ${f ? figure(d.id, f) : ''}
    ${f ? `<div style="display:flex;gap:8px;align-items:baseline"><span class="big" style="font-size:34px;color:${f.severity === 'warn' ? 'var(--ochre)' : 'var(--ink)'}">${full(f.count)}</span><span class="hint">${f.severity} finding${f.count > 1 ? 's' : ''}${f.count > f.items.length ? ` · first ${f.items.length} listed` : ''}</span></div>
    <div class="feed">${f.items.map((it, k) => `<button class="row" data-d="${f.id}" data-k="${k}"><span class="d ${f.severity}">#${k + 1}</span><span><span class="msg">${esc(short(it.msg))}</span><div class="where">${it.ev.map(e => `line ${full(e.line)} · bytes ${full(e.b0)}–${full(e.b1)}`).join('<br>')}</div></span></button>`).join('')}</div>`
    : `<div class="desc">This gate found nothing on <span class="mono">${esc(r.id)}</span>. That is a result too: the check ran and passed.</div>`}`;
}

function renderBytes() {
  const r = S.run, { d, k, unk } = S.item;
  let it, keys = [];
  if (unk) { const u = r.unknownSample; it = { msg: `Importer did not recognise this line (${u.reason}). It is kept and flagged, never dropped.`, ev: [{ file: r.source.file, line: u.line, b0: u.b0, b1: u.b1 }], raw: u.raw }; keys = ['type']; }
  else { it = r.findings.find(x => x.id === d).items[k]; keys = DMAP[d].keys; }
  const e = it.ev[0] || {};
  const bytes = r.source.bytes || 1;
  railHead(`<button class="tbtn" data-act="up" aria-label="Back">←</button><span class="label">${unk ? 'Held aside' : esc(d) + ' #' + (k + 1)} · the bytes</span>`);
  $('#railBody').innerHTML = `<div class="msg" style="font-size:13px">${esc(it.msg)}</div>
    <dl class="kv"><dt>File</dt><dd title="${esc(e.file || '')}">${esc(e.file || '')}</dd><dt>Line</dt><dd>${full(e.line)}</dd><dt>Bytes</dt><dd>${full(e.b0)} – ${full(e.b1)}</dd><dt>sha256</dt><dd title="${esc(r.source.sha256)}">${esc(r.source.sha256.slice(0, 20))}…</dd></dl>
    <div><div class="label" style="margin-bottom:4px">Where in the file</div><div class="bytebar"><i style="left:${(e.b0 / bytes * 100).toFixed(2)}%;width:${Math.max(0.4, (e.b1 - e.b0) / bytes * 100).toFixed(2)}%"></i></div></div>
    ${it.ev.length > 1 ? `<div class="where">Also: ${it.ev.slice(1).map(x => `line ${full(x.line)}`).join(', ')}</div>` : ''}
    ${it.raw ? `<div><div class="label" style="margin-bottom:4px">Raw line · text redacted, structure exact</div><pre class="raw">${pretty(it.raw, keys)}</pre></div>` : `<div class="desc">No raw excerpt for this finding: the extract keeps raw lines for the first 25 per detector, and file-level records have none.</div>`}`;
}

function pretty(v, keys, ind = '') {
  const pad = ind + '  ';
  if (Array.isArray(v)) return v.length ? '[\n' + v.map(x => pad + pretty(x, keys, pad)).join(',\n') + '\n' + ind + ']' : '[]';
  if (v && typeof v === 'object') {
    const ents = Object.entries(v);
    return ents.length ? '{\n' + ents.map(([k, x]) => { const hl = keys.includes(k); const val = pretty(x, keys, pad); return pad + `<span class="k">"${esc(k)}"</span>: ` + (hl ? `<span class="hl">${val}</span>` : val); }).join(',\n') + '\n' + ind + '}' : '{}';
  }
  if (typeof v === 'string') return v.startsWith('‹') ? `<span class="r">${esc(v)}</span>` : `<span class="s">"${esc(v)}"</span>`;
  return `<span class="n">${esc(String(v))}</span>`;
}

function describe(r) {
  const f = r.findings.map(x => `${x.id} ${DMAP[x.id] ? DMAP[x.id].name.toLowerCase() : ''} (${x.count}, ${x.severity})`).join('; ');
  const ratio = r.dedup[3] ? (r.naive[3] / r.dedup[3]).toFixed(2) : null;
  return `Session <b>${esc(r.id)}</b>, ${esc(r.truth)} data, captured at level ${r.capture.level} of 4 from ${esc(r.harness.tool)} ${esc(r.harness.version)}. ` +
    `The transcript has ${full(r.source.lines)} lines; the importer recognised ${full(r.counts.events)} events and kept ${full(r.counts.unknowns)} unknown records aside. ` +
    `${full(r.counts.llm)} unique model requests carry usage. ${ratio && ratio > 1.01 ? `Summing every line would report ${full(r.naive[3])} output tokens; deduplicated, it is ${full(r.dedup[3])} (×${ratio}). ` : ''}` +
    `Findings: ${f || 'none'}. Overall: ${esc(verdictText(r.overall))}.`;
}

/* ---------- table mode ---------- */
function renderTable() {
  const r = S.run;
  $('#tableView').innerHTML = `<div class="label" style="margin:14px 0 6px">Findings by detector</div>
    <div class="tablebox"><table><thead><tr><th>Gate</th><th>Checks</th><th>Severity</th><th style="text-align:right">Count</th><th style="text-align:right">First line</th></tr></thead><tbody>
    ${DET.map(d => { const f = r.findings.find(x => x.id === d.id); return `<tr><td class="mono">${d.id}</td><td>${d.name}</td><td>${f ? f.severity : '–'}</td><td class="n">${f ? full(f.count) : 0}</td><td class="n">${f && f.items[0] && f.items[0].ev[0] ? full(f.items[0].ev[0].line) : '–'}</td></tr>`; }).join('')}
    </tbody></table></div>
    <div class="label" style="margin:14px 0 6px">Requests (deduplicated) · ${full(r.reqs.length)} rows${r.reqs.length > 300 ? ', first 300 shown' : ''}</div>
    <div class="tablebox"><table><thead><tr><th>#</th><th style="text-align:right">Line</th><th style="text-align:right">Input</th><th style="text-align:right">Cache read</th><th style="text-align:right">Cache write</th><th style="text-align:right">Output</th></tr></thead><tbody>
    ${r.reqs.slice(0, 300).map((q, i) => `<tr><td class="mono">${i + 1}</td>${q.map(v => `<td class="n">${full(v)}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>`;
}

/* ---------- loading a run ---------- */
function load(id, opts = {}) {
  const r = byId[id]; if (!r) return;
  S.run = r; S.p = 0; S.playing = false; S.sel = null; S.item = null; prevBin = -1;
  if (window.ASSAY_VIEWS) window.ASSAY_VIEWS.reset();
  if (!opts.keepMission) S.mission = null;
  unstrike(); prep(r);
  renderPlate(r); renderHead(r); renderGates(r); renderTape(r); renderCtx(r);
  $('#mReasons').innerHTML = r.unknownReasons.map(([k, n]) => `<span title="${n} records">${esc(k.replace('unknown-type:', ''))} · ${n}</span>`).join('');
  if (S.table) renderTable();
  setPlay(); renderRail(); update(true);
  if (S.view === 'report' && window.ASSAY_REPORT) window.ASSAY_REPORT.render(r);
  if (opts.autoplay) setTimeout(() => { S.playing = true; setPlay(); }, 450);
}

/* ---------- transport ---------- */
let lastT = 0;
function loop(t) {
  const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t;
  if (S.playing && S.view === 'bench') {
    S.p = Math.min(BINS, S.p + dt * 16 * S.speed);
    update(false);
  }
  requestAnimationFrame(loop);
}
function setPlay() {
  $('#play').innerHTML = S.playing ? '<svg width="18" height="18" viewBox="0 0 18 18"><rect x="3" y="2" width="4" height="14" fill="currentColor"/><rect x="11" y="2" width="4" height="14" fill="currentColor"/></svg>'
    : S.struck ? '<svg width="20" height="20" viewBox="0 0 20 20"><path d="M4 10a6 6 0 1 0 2-4.5M4 3v4h4" fill="none" stroke="currentColor" stroke-width="2"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 18 18"><path d="M4 2l12 7-12 7z" fill="currentColor"/></svg>';
  $('#play').setAttribute('aria-label', S.playing ? 'Pause (Space)' : S.struck ? 'Assay again' : 'Assay (Space)');
}
function toggle() {
  if (S.struck) { S.p = 0; unstrike(); update(true); renderRail(); }
  S.playing = !S.playing; setPlay(); if (S.playing && S.p === 0) renderRail();
}
function seek(p) {
  S.p = Math.max(0, Math.min(BINS, p));
  if (S.p < BINS && S.struck) { unstrike(); renderRail(); }
  update(true); if (S.p >= BINS && !S.struck) strike();
}

/* ---------- shelf ---------- */
function coreSvg(r, w = 160, h = 120) {
  const rows = BINS, rh = h / rows; let s = '';
  r.band.forEach((b, i) => {
    const known = b.user + b.assistant + b.system + b.other, tot = known + b.unknown, y = i * rh;
    if (!tot) return;
    const uw = b.unknown / tot * w; let x = 0;
    const seg = (n, fill) => { if (!n) return; const ww = n / tot * w; s += `<rect x="${x}" y="${y}" width="${ww}" height="${rh + 0.3}" fill="${fill}"/>`; x += ww; };
    seg(b.assistant, 'var(--a)'); seg(b.user, 'var(--u)'); seg(b.system + b.other, 'var(--s)');
    if (uw) s += `<rect x="${x}" y="${y}" width="${uw}" height="${rh + 0.3}" fill="url(#hpc)"/>`;
    const ids = Object.keys(b.f);
    if (ids.length) { const warn = ids.some(id => (r.findings.find(f => f.id === id) || {}).severity === 'warn'); s += `<rect x="0" y="${y}" width="${w * (warn ? 0.14 : 0.04)}" height="${Math.max(rh, warn ? 2.4 : 1)}" fill="${warn ? 'var(--ochre)' : 'var(--ink)'}" opacity="${warn ? 1 : 0.5}"/>`; }
  });
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><defs><pattern id="hpc" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="var(--paper)"/><line x1="0" y1="0" x2="0" y2="4" stroke="var(--unk)" stroke-width="1" opacity=".5"/></pattern></defs><rect width="${w}" height="${h}" fill="var(--paper-2)"/>${s}</svg>`;
}
// Runs as a sortable table (default) or the gallery of cores. A detector
// filter narrows to runs where it fired and states what those runs share,
// read straight from their fields (after Honeycomb's BubbleUp).
const COLS = [
  ['date', 'Date', r => r.hallmark.firstTs || 0, r => r.hallmark.firstTs ? new Date(r.hallmark.firstTs).toISOString().slice(0, 10) : '–'],
  ['id', 'Run', r => r.id, r => `<span class="mono">${esc(r.id)}</span>`],
  ['ver', 'Version', r => r.harness.version || '', r => esc(r.harness.version || '–')],
  ['cap', 'Capture', r => r.capture.level, r => 'L' + r.capture.level],
  ['truth', 'Truth', r => r.truth, r => `<span class="truth ${r.truth}" style="font-size:10px;padding:1px 6px">${esc(r.truth)}</span>`],
  ['trust', 'Trust', r => r.hallmark.fineness ?? -1, r => r.hallmark.fineness ?? '–'],
  ['verdict', 'Verdict', r => r.overall, r => `<span class="vtag ${verdictClass(r.overall)}">${verdictGlyph(r.overall)}</span> ${esc(verdictText(r.overall))}`],
  ['find', 'Findings', r => r.findings.reduce((a, f) => a + f.count, 0), r => fmt(r.findings.reduce((a, f) => a + f.count, 0))],
  ['ctx', 'Context tokens', r => r.validity.totalContextTokens || 0, r => fmt(r.validity.totalContextTokens)],
];
function shared(list) {
  if (!list.length) return '';
  const uniq = f => [...new Set(list.map(f))];
  const vs = uniq(r => r.harness.version).filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const caps = uniq(r => 'L' + r.capture.level), lay = uniq(r => r.harness.layout).filter(Boolean), tr = uniq(r => r.truth);
  return `${list.length} run${list.length > 1 ? 's' : ''} · versions ${esc(vs.length > 1 ? vs[0] + '–' + vs[vs.length - 1] : vs[0] || '–')} · capture ${esc(caps.join(', '))} · layout ${esc(lay.join(', ') || '–')} · ${esc(tr.join(', '))}`;
}
function renderShelf() {
  const kinds = [['all', 'All'], ['real', 'Real'], ['real-perturbed', 'Perturbed'], ['scripted', 'Scripted']];
  $('#filters').innerHTML = kinds.map(([k, t]) => `<button class="chip" data-filter="${k}" aria-pressed="${S.filter === k}">${t} · ${k === 'all' ? RUNS.length : RUNS.filter(r => r.truth === k).length}</button>`).join('');
  const dets = DET.filter(d => RUNS.some(r => r.findings.some(f => f.id === d.id)));
  $('#filters').innerHTML += `<select class="chip" id="detf" aria-label="Only runs where a detector fired"><option value="">Any finding</option>${dets.map(d => `<option value="${d.id}" ${S.det === d.id ? 'selected' : ''}>${esc(d.name)} · ${d.id}</option>`).join('')}</select><button class="chip" data-layout="${S.layout === 'gallery' ? 'table' : 'gallery'}">${S.layout === 'gallery' ? 'Table' : 'Gallery'}</button>`;
  let list = RUNS.filter(r => (S.filter === 'all' || r.truth === S.filter) && (!S.det || r.findings.some(f => f.id === S.det)));
  $('#shared').innerHTML = S.det ? `<span class="label">${esc(DMAP[S.det].name)} fired on</span> ${shared(list)}` : '';
  if (S.layout !== 'gallery') {
    const c = COLS.find(x => x[0] === S.sort[0]) || COLS[0], dir = S.sort[1];
    list = list.slice().sort((x, y) => { const p = c[2](x), q = c[2](y); return (p < q ? -1 : p > q ? 1 : 0) * dir; });
    $('#grid').className = 'runtable';
    $('#grid').innerHTML = `<table><thead><tr>${COLS.map(([k, t]) => `<th><button data-sort="${k}" aria-sort="${S.sort[0] === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'}">${t}${S.sort[0] === k ? (dir > 0 ? ' ↑' : ' ↓') : ''}</button></th>`).join('')}</tr></thead><tbody>${list.map(r => `<tr data-run="${esc(r.id)}" data-open="1" tabindex="0">${COLS.map(col => `<td>${col[3](r)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  } else { $('#grid').className = 'grid'; $('#grid').innerHTML = list.map(r => {
    const fc = r.findings.reduce((a, f) => a + f.count, 0);
    return `<button class="panel card sheen ${r.truth}" data-run="${esc(r.id)}" data-open="1" aria-label="Assay ${esc(r.id)}">
      ${coreSvg(r)}
      <div class="foot"><span class="cid">${esc(r.id)}</span><span class="vtag ${verdictClass(r.overall)}" title="${esc(verdictText(r.overall))}">${verdictGlyph(r.overall)}</span></div>
      <div class="meta"><span>v${esc(r.harness.version)}</span><span>L${r.capture.level}</span><span>${fmt(r.source.lines)} ln</span></div>
      <div class="meta"><span class="truth ${r.truth}" style="font-size:9px;padding:1px 5px">${r.truth}</span><span>${fmt(fc)} findings</span></div>
    </button>`;
  }).join(''); }
  // overcount strip: real sessions with usage only
  const pts = RUNS.filter(r => r.truth === 'real' && r.dedup[3] > 0).map(r => ({ r, v: r.naive[3] / r.dedup[3] }));
  const max = Math.max(3.6, ...pts.map(p => p.v)), Wd = 1000, Hd = 90, x = v => 30 + (v - 1) / (max - 1) * (Wd - 60);
  let s = `<line x1="30" x2="${Wd - 30}" y1="56" y2="56" stroke="var(--rule)"/>`;
  for (let t = 1; t <= max; t += 0.5) s += `<line x1="${x(t)}" x2="${x(t)}" y1="52" y2="60" stroke="var(--rule)"/><text x="${x(t)}" y="78" text-anchor="middle" font-family="IBM Plex Mono" font-size="11" fill="var(--mute)">×${t.toFixed(1)}</text>`;
  pts.sort((a, b) => a.v - b.v).forEach((p, i) => { const cx = x(p.v), cy = 56 - (i % 3) * 14 - 6; s += `<g class="dot" data-run="${esc(p.r.id)}" data-open="1" tabindex="0" role="button" aria-label="Open ${esc(p.r.id)}, overcount ×${p.v.toFixed(2)}" style="cursor:pointer"><line x1="${cx}" x2="${cx}" y1="${cy}" y2="56" stroke="var(--rule)"/><circle cx="${cx}" cy="${cy}" r="6" fill="var(--ochre)" stroke="var(--paper)" stroke-width="2"><title>${esc(p.r.id)}: ×${p.v.toFixed(2)} (${full(p.r.naive[3])} vs ${full(p.r.dedup[3])})</title></circle></g>`; });
  
  const svg = $('#dots'); svg.setAttribute('viewBox', `0 0 ${Wd} ${Hd}`); svg.innerHTML = s;
}
document.addEventListener('change', e => { if (e.target.id === 'detf') { S.det = e.target.value || null; renderShelf(); } });
// Rows open on Enter like the buttons they stand in for.
document.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches && e.target.matches('tr[data-run]')) e.target.click(); });
// gentle tilt toward the pointer; depth never encodes a quantity here
document.addEventListener('pointermove', e => {
  const c = e.target.closest && e.target.closest('.card'); document.querySelectorAll('.card.tilt').forEach(x => { if (x !== c) { x.classList.remove('tilt'); x.style.transform = ''; } });
  if (!c || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const b = c.getBoundingClientRect(), px = (e.clientX - b.left) / b.width - 0.5, py = (e.clientY - b.top) / b.height - 0.5;
  c.classList.add('tilt'); c.style.transform = `rotateY(${px * 10}deg) rotateX(${-py * 10}deg) translateY(-4px)`;
});

/* ---------- tamper missions ---------- */
const MISSIONS = [
  { id: 'm0', no: '00', base: '9e6a9543', run: '9e6a9543', title: 'Count every line', pitch: 'Add up usage on every assistant line, the way a quick parser would. Bigger numbers, nobody checks.', verb: 'Sum it all', kind: 'sum' },
  { id: 'm1', no: '01', base: 'd1-trigger', run: 'd1-perturbed', title: 'Lose a subagent', pitch: 'A parent line names a subagent. Make its transcript file disappear, so its tokens never reach the total.', verb: 'Shred the file', kind: 'shred' },
  { id: 'm2', no: '02', base: '3620a96a', run: 'forged-copy', title: 'Forge a giant prompt', pitch: 'Rewrite one copy of a message so its inputTokens read 195,000 instead of 2.', verb: 'Forge the number', kind: 'forge' },
  { id: 'm3', no: '03', base: 'd1-trigger', run: 'd6-perturbed', title: 'Make the copies disagree', pitch: 'One message is written three times. Nudge one copy’s inputTokens from 3 to 8.', verb: 'Nudge one copy', kind: 'nudge' },
];
function renderScore() {
  const n = MISSIONS.filter(m => S.caught[m.id]).length;
  const pc = Object.keys(S.punches).length;
  $('#score').innerHTML = `<button class="tool" data-act="card" title="Detectors you've seen fire">Punch card <b>${pc}/${DET.length}</b></button><span>Calls <b>${S.calls.right}/${S.calls.total}</b></span><span>Tamper <b>${n}/${MISSIONS.length}</b></span>`;
}
function renderMissions() {
  $('#missions').innerHTML = MISSIONS.map(m => `<button class="panel mission ${S.caught[m.id] ? 'done' : ''}" data-mission="${m.id}">
    <span class="stamp">${/leaked/.test(S.caught[m.id] || '') ? 'FLAGGED' : 'CAUGHT'}</span><span class="no">MISSION ${m.no}</span><h3>${m.title}</h3><p>${m.pitch}</p>
    <span class="state">${S.caught[m.id] ? '✓ ' + esc(S.caught[m.id]) : 'Not attempted'}</span></button>`).join('');
  renderScore();
}
function openMission(id) {
  const m = MISSIONS.find(x => x.id === id), wb = $('#workbench'), base = byId[m.base], t = byId[m.run];
  let work = '';
  if (m.kind === 'sum') work = `<div class="label">Line-by-line sum of output_tokens</div><div class="dial" id="dial">${full(base.dedup[3])}</div><div class="hint">What the deduplicated requests say. Press the button to count every line instead.</div>`;
  if (m.kind === 'shred') work = `<div class="label">Sources the importer will read</div><div class="files"><div class="file">▤ main transcript<span class="tag">${fmt(base.source.lines)} lines</span></div><div class="file" id="victim">▤ subagents/agent-perturbed-d1test.jsonl<span class="tag">referenced at line 2</span></div></div>`;
  if (m.kind === 'forge') work = `<div class="label">inputTokens on one copy of message …ZXo, line 26</div><div class="dial" id="dial">2</div>`;
  if (m.kind === 'nudge') work = `<div class="label">Three copies of one message</div><div class="dupes" style="grid-template-columns:repeat(3,1fr)"><div class="dupe">copy A<b>3</b>input_tokens</div><div class="dupe" id="victim">copy B<b id="dial">3</b>input_tokens</div><div class="dupe">copy C<b>3</b>input_tokens</div></div>`;
  wb.innerHTML = `<div style="display:flex;flex-direction:column;gap:12px">
      <span class="label">Mission ${m.no}</span><h3 style="margin:0;font-size:30px;letter-spacing:-.03em">${m.title}</h3>
      <div class="hint">Specimen <span class="mono">${esc(base.id)}</span> → tampered file <span class="mono">${esc(t.source.file)}</span>. <span class="truth ${t.truth}" style="font-size:9px">${t.truth}</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px"><button class="btn" id="doTamper">${m.verb}</button><button class="btn ghost" id="doSubmit" disabled style="opacity:.4">Hand it to assay →</button></div>
    </div><div style="display:flex;flex-direction:column;gap:12px;justify-content:center">${work}</div>`;
  wb.classList.add('on'); wb.dataset.m = id; wb.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  $('#doTamper').onclick = () => {
    tone(220, 0.12, 'sawtooth', 0.04);
    const dial = $('#dial');
    if (m.kind === 'shred') $('#victim').classList.add('cut');
    if (m.kind === 'nudge') { $('#victim').classList.add('forged'); roll(dial, 3, 8, 500); }
    if (m.kind === 'forge') { dial.style.color = 'var(--ochre)'; roll(dial, 2, 195000, 1100); }
    if (m.kind === 'sum') { dial.style.color = 'var(--ochre)'; roll(dial, base.dedup[3], base.naive[3], 1200); }
    $('#doTamper').disabled = true; $('#doTamper').style.opacity = .4;
    const sub = $('#doSubmit'); sub.disabled = false; sub.style.opacity = 1; sub.className = 'btn'; sub.focus();
  };
  $('#doSubmit').onclick = () => { S.mission = m; go('bench'); load(m.run, { autoplay: true, keepMission: true }); };
}
function roll(node, a, b, ms) {
  const t0 = performance.now();
  const step = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); node.textContent = full(a + (b - a) * e); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step);
}
const pointTotal = r => !r.validity.inputTokenRange || r.validity.inputTokenRange.min === r.validity.inputTokenRange.max;
function showOutcome(m) {
  const base = byId[m.base], t = byId[m.run];
  const cnt = r => Object.fromEntries(r.findings.map(f => [f.id, f]));
  const A = cnt(base), B = cnt(t);
  let rows = [], caughtBy = null;
  if (m.kind === 'sum') {
    const f = B.D2; caughtBy = f ? 'D2' : null;
    rows.push(`<div class="diffrow"><span class="mono">D2</span><span>${f ? full(f.count) + ' repeated message ids found and collapsed' : 'none'}</span><span class="up">${f ? f.count : 0}</span></div>`);
    rows.push(`<div class="diffrow"><span class="mono">tokens</span><span>Sum-every-line ${full(t.naive[3])} → assayed ${full(t.dedup[3])}</span><span class="up">×${(t.naive[3] / t.dedup[3]).toFixed(2)}</span></div>`);
  } else {
    DET.forEach(d => {
      const a = A[d.id] ? A[d.id].count : 0, b = B[d.id] ? B[d.id].count : 0;
      if (a === b) return;
      if (b > a && B[d.id].severity === 'warn' && !caughtBy) caughtBy = d.id;
      rows.push(`<div class="diffrow"><span class="mono">${d.id}</span><span>${esc(d.name)}${b > a && B[d.id].items[0] ? `<div class="where">${esc(short(B[d.id].items.find(x => !A[d.id] || true).msg))}</div>` : b < a ? '<div class="where">differs between the two source files, not caused by the tamper</div>' : ''}</span><span class="${b > a ? 'up' : 'down'}">${a} → ${b}</span></div>`);
    });
    Object.keys(t.verdicts).forEach(k => { if (t.verdicts[k] !== base.verdicts[k]) rows.push(`<div class="diffrow"><span class="mono">${k}</span><span><span class="vtag ${verdictClass(base.verdicts[k])}">${esc(verdictText(base.verdicts[k]))}</span> → <span class="vtag ${verdictClass(t.verdicts[k])}">${esc(verdictText(t.verdicts[k]))}</span></span><span class="up">verdict</span></div>`); });
    if (m.kind === 'forge') rows.push(`<div class="diffrow"><span class="mono">D5</span><span>Stayed quiet: 195,000 is under this model’s 1M window in the detector’s limit table.</span><span class="down">0</span></div>
      ${pointTotal(t) ? `<div class="diffrow"><span class="mono">total</span><span>Input tokens ${full(base.validity.totalInputTokens)} → ${full(t.validity.totalInputTokens)}. Flagged, but the forged copy is still in a point total.</span><span class="up">gap</span></div>`
        : `<div class="diffrow"><span class="mono">total</span><span>Input tokens shown as a range, ${full(t.validity.inputTokenRange.min)}–${full(t.validity.inputTokenRange.max)}, never as one number. Tokens verdict demoted.</span><span class="down">range</span></div>`}`);
  }
  const first = caughtBy && B[caughtBy] && B[caughtBy].items[0] && B[caughtBy].items[0].ev[0];
  // ADR-021: CAUGHT only when the forged value is no longer shown as a point total.
  const leaked = m.kind === 'forge' && pointTotal(t);
  const label = caughtBy ? `${leaked ? 'flagged by ' : ''}${caughtBy}${first ? ' at line ' + full(first.line) : ''}${leaked ? ', leaked into total' : ''}` : 'not caught';
  if (caughtBy) { S.caught[m.id] = label; store.set('caught', S.caught); }
  $('#ocard').innerHTML = `<span class="label">Mission ${m.no} · ${caughtBy ? 'result' : 'result'}</span>
    <h3 id="oTitle">${caughtBy ? (leaked ? `Flagged by ${esc(caughtBy)}. Still in the total.` : `Caught by ${esc(caughtBy)}.`) : 'It got through.'}</h3>
    <div class="hint">${caughtBy && first ? `Line ${full(first.line)}, bytes ${full(first.b0)}–${full(first.b1)} of <span class="mono">${esc(first.file)}</span>.` : ''}</div>
    <div>${rows.join('')}</div>
    <div class="where">Before: ${esc(base.file)} · After: ${esc(t.file)}</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">${caughtBy ? `<button class="btn" data-act="evidence" data-d="${caughtBy}">See the evidence</button>` : ''}<button class="btn ghost" data-act="next">Next mission →</button></div>`;
  $('#outcome').classList.add('on'); renderScore();
  (caughtBy ? thunk : () => tone(140, 0.4, 'sawtooth', 0.05))();
  $('#ocard').querySelector('.btn').focus();
}

/* ---------- navigation & input ---------- */
function go(v) {
  S.view = v; if (v !== 'bench') { S.playing = false; setPlay(); }
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.view === v));
  document.querySelectorAll('.view').forEach(x => x.classList.toggle('on', x.id === 'v-' + v));
  if (v === 'shelf') renderShelf();
  if (v === 'report' && window.ASSAY_REPORT) window.ASSAY_REPORT.render(S.run);
  if (v === 'tamper') renderMissions();
  if (window.ASSAY_VIEWS && ['traverse', 'replay', 'diff'].includes(v)) window.ASSAY_VIEWS.render(v);
  window.scrollTo({ top: 0 });
}
function live(t) { $('#live').textContent = t; }
function up() {
  if ($('#outcome').classList.contains('on')) return $('#outcome').classList.remove('on');
  if ($('#help').classList.contains('on')) return $('#help').classList.remove('on');
  if ($('#card').classList.contains('on')) return $('#card').classList.remove('on');
  if (S.item) { S.item = null; return renderRail(); }
  if (S.sel) { S.sel = null; document.querySelectorAll('.gate').forEach(g => g.setAttribute('aria-pressed', 'false')); return renderRail(); }
  if (S.view !== 'report') go('report');
}
function setTable(on) { S.table = on; $('#tableBtn').setAttribute('aria-pressed', on); $('#visual').hidden = on; $('#tableView').hidden = !on; if (on) renderTable(); }
function setDesc(on) { S.desc = on; $('#descBtn').setAttribute('aria-pressed', on); if (on) live(describe(S.run).replace(/<[^>]+>/g, '')); renderRail(); }

document.addEventListener('click', e => {
  const t = e.target.closest('button, [data-run], [data-goto]'); if (!t) return;
  if (t.dataset.view) return go(t.dataset.view);
  if (t.dataset.goto) return go(t.dataset.goto);
  if (t.dataset.close === 'card') $('#card').classList.remove('on');
  if (t.dataset.run) { S.mission = null; if (t.dataset.open) go('report'); const p = load(t.dataset.run); if (t.dataset.replay) go('replay'); return p; }
  if (t.dataset.gate) { S.sel = S.sel === t.dataset.gate ? null : t.dataset.gate; S.item = null; document.querySelectorAll('.gate').forEach(g => g.setAttribute('aria-pressed', g.dataset.gate === S.sel)); return renderRail(); }
  if (t.dataset.d && t.dataset.k != null) { S.sel = t.dataset.d; S.item = { d: t.dataset.d, k: +t.dataset.k }; return renderRail(); }
  if (t.dataset.unk) { S.item = { unk: true }; return renderRail(); }
  if (t.dataset.filter) { S.filter = t.dataset.filter; return renderShelf(); }
  if (t.dataset.layout) { S.layout = t.dataset.layout; return renderShelf(); }
  if (t.dataset.sort) { S.sort = [t.dataset.sort, S.sort[0] === t.dataset.sort ? -S.sort[1] : 1]; return renderShelf(); }
  if (t.dataset.mission) return openMission(t.dataset.mission);
  if (t.dataset.speed) { S.speed = +t.dataset.speed; document.querySelectorAll('[data-speed]').forEach(b => b.setAttribute('aria-pressed', b === t)); return; }
  if (t.dataset.call) { S.call = t.dataset.call; tone(520, 0.05); return toggle(); }
  if (t.dataset.close === 'card') $('#card').classList.remove('on');
  const act = t.dataset.act;
  if (act === 'card') return renderCard();
  if (act === 'closecard') return $('#card').classList.remove('on');
  if (act === 'play') return toggle();
  if (act === 'up') return up();
  if (act === 'next') { $('#outcome').classList.remove('on'); const i = MISSIONS.findIndex(m => m === S.mission); S.mission = null; go('tamper'); return openMission(MISSIONS[(i + 1) % MISSIONS.length].id); }
  if (act === 'evidence') { $('#outcome').classList.remove('on'); const d = t.dataset.d; S.sel = d; S.item = { d, k: 0 }; return renderRail(); }
});
// tape: click a column to jump the head there and open what it caught
$('#tape').addEventListener('click', e => {
  const b = $('#tape').getBoundingClientRect(), bin = Math.floor((e.clientX - b.left) / b.width * BINS);
  seek(Math.max(S.p, bin + 1));
  const c = prep(S.run), hit = c.items.find(it => it.bin === bin);
  if (hit) { S.sel = hit.d; S.item = { d: hit.d, k: hit.k }; renderRail(); }
});
$('#tape').addEventListener('mousemove', e => {
  const b = $('#tape').getBoundingClientRect(), bin = Math.floor((e.clientX - b.left) / b.width * BINS), h = $('#hover1');
  if (h) { h.setAttribute('x', bin * W / BINS); h.setAttribute('opacity', 0.08); }
});
$('#tape').addEventListener('mouseleave', () => { const h = $('#hover1'); if (h) h.setAttribute('opacity', 0); });
$('#play').onclick = toggle;
$('#back').onclick = () => seek(Math.ceil(S.p) - 1);
$('#fwd').onclick = () => seek(Math.floor(S.p) + 1);
$('#scrub').oninput = e => { S.playing = false; setPlay(); seek(+e.target.value); };
$('#tableBtn').onclick = () => setTable(!S.table);
$('#descBtn').onclick = () => setDesc(!S.desc);
$('#helpBtn').onclick = () => $('#help').classList.add('on');
$('#helpClose').onclick = () => $('#help').classList.remove('on');
$('#outcome').addEventListener('click', e => { if (e.target.id === 'outcome') up(); });
$('#sound').setAttribute('aria-pressed', sound.on);
$('#sound').onclick = () => { sound.on = !sound.on; store.set('sound', sound.on); $('#sound').setAttribute('aria-pressed', sound.on); tone(660, 0.08); };
$('#theme').onclick = () => {
  const root = document.documentElement, dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark'; store.set('theme', root.dataset.theme);
};
{ const th = store.get('theme', null); if (th) document.documentElement.dataset.theme = th; }

document.addEventListener('keydown', e => {
  if (e.target.closest('input, textarea') && e.key !== 'Escape') return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key;
  if (k === 'Escape') return up();
  if (k === '?') return $('#help').classList.add('on');
  if (k === 'p' || k === 'P') return renderCard();
  if (k === '1') return go('report'); if (k === '2') return go('bench'); if (k === '3') return go('replay');
  if (k === '4') return go('traverse'); if (k === '5') return go('diff'); if (k === '6') return go('shelf'); if (k === '7') return go('tamper');
  if (S.view !== 'bench') return;
  if (k === ' ' && !e.target.closest('button')) { e.preventDefault(); return toggle(); }
  if (k === 'ArrowRight') { e.preventDefault(); return seek(Math.floor(S.p) + (e.shiftKey ? 10 : 1)); }
  if (k === 'ArrowLeft') { e.preventDefault(); return seek(Math.ceil(S.p) - (e.shiftKey ? 10 : 1)); }
  if (k === 'Home') return seek(0);
  if (k === 'End') return seek(BINS);
  if (k === 't' || k === 'T') return setTable(!S.table);
  if (k === 'd' || k === 'D') return setDesc(!S.desc);
});

// Shared with views.js (Traverse, Replay, Diff) and the folder drop.
window.ASSAY = { runs: RUNS, byId, current: () => S.run, load, go, view: () => S.view, files: new Map(), DMAP, LADDER, esc, full,
  // Report → Scan: open a detector's first finding with the scan finished.
  focus(d) { go('bench'); S.p = BINS; S.sel = d; S.item = { d, k: 0 }; update(true); renderRail(); },
};

/* ---------- folder drop (ADR-019): assay runs in a worker, on your files ---------- */
async function readEntries(items) {
  const out = [];
  async function walk(entry, path) {
    if (entry.isFile) { const f = await new Promise((res, rej) => entry.file(res, rej)); out.push({ path: path + f.name, file: f }); return; }
    const reader = entry.createReader();
    let batch;
    do { batch = await new Promise((res, rej) => reader.readEntries(res, rej)); for (const e of batch) await walk(e, path + entry.name + '/'); } while (batch.length);
  }
  for (const it of items) { const e = it.webkitGetAsEntry && it.webkitGetAsEntry(); if (e) await walk(e, ''); }
  return out;
}
let dropN = 0;
async function assayFiles(list) {
  const files = list.filter(x => x.path.endsWith('.jsonl'));
  if (!files.length) return live('No .jsonl files in what was dropped.');
  $('#dropzone').classList.add('busy'); $('#dropmsg').textContent = `Assaying ${files.length} file${files.length > 1 ? 's' : ''} on this machine…`;
  const payload = await Promise.all(files.map(async x => ({ path: x.path, buffer: await x.file.arrayBuffer() })));
  const id = 'dropped-' + (++dropN);
  const w = new Worker('worker.js');
  w.onmessage = e => {
    w.terminate(); $('#dropzone').classList.remove('on', 'busy');
    if (!e.data.ok) return live('Could not assay: ' + e.data.error);
    const v = e.data.view;
    files.forEach(x => window.ASSAY.files.set(x.path.split('/').pop(), x.file));
    RUNS.unshift(v); byId[v.id] = v;
    go('bench'); load(v.id, { autoplay: true }); live(`Assayed ${v.session} locally.`);
  };
  w.postMessage({ files: payload, id }, payload.map(x => x.buffer));
}
let dragDepth = 0;
window.addEventListener('dragenter', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; $('#dropzone').classList.add('on'); } });
window.addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('#dropzone').classList.remove('on'); } });
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', async e => {
  e.preventDefault(); dragDepth = 0;
  const items = [...(e.dataTransfer.items || [])];
  const list = items.length && items[0].webkitGetAsEntry ? await readEntries(items) : [...e.dataTransfer.files].map(f => ({ path: f.name, file: f }));
  assayFiles(list);
});
$('#pickdir').addEventListener('change', e => assayFiles([...e.target.files].map(f => ({ path: f.webkitRelativePath || f.name, file: f }))));

// Landing shows a real run (DESIGN.md: no synthetic hero).
{
  const h = decodeURIComponent(location.hash.slice(1)), run = h.startsWith('run=') && byId[h.slice(4)] ? h.slice(4) : '9e6a9543';
  load(run);
  if (h === 'shelf' || h === 'tamper') go(h);
  if (h.startsWith('mission=')) { go('tamper'); openMission(h.slice(8)); }
}
renderScore();
requestAnimationFrame(t => { lastT = t; loop(t); });
})();
