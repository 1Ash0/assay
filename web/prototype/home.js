/* assay landing. Every figure here is read from data.js (`assay
   export-site`); nothing is invented for the page. */
(() => {
'use strict';
const RUNS = window.ASSAY_DATA.runs, byId = Object.fromEntries(RUNS.map(r => [r.id, r]));
const REAL = RUNS.filter(r => r.truth === 'real');
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const full = n => n == null ? '–' : Math.round(n).toLocaleString();
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : full(n);
const store = { get(k, d) { try { const v = localStorage.getItem('assay.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('assay.' + k, JSON.stringify(v)); } catch {} } };
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const DET = [
  ['D1', 'Subagent blind spot', 'A subagent is named but its transcript is missing. Totals become a lower bound.'],
  ['D2', 'Usage double-count', 'One message written on several lines. Summing every line inflates tokens.'],
  ['D3', 'Chain break', 'A parent link points at a line that is no longer there.'],
  ['D4', 'Orphan tool call', 'A tool result with no tool call to match it.'],
  ['D5', 'Context overflow', 'Input past the model’s window. Unknown model: noted, never guessed.'],
  ['D6', 'Usage disagreement', 'Copies of one message report different token counts.'],
  ['D7', 'Compaction pattern', 'Context grew across a compaction instead of shrinking.'],
  ['D8', 'Session conflict', 'One file holds more than one session.'],
  ['D9', 'Clock reversal', 'A timestamp runs backwards.'],
  ['D10', 'Request count', 'The runtime’s own request count disagrees with what was found.'],
  ['D11', 'Request record broken', 'A recorded request does not rebuild to its own digest, so the record disagrees with itself.'],
  ['D12', 'Agent total disagrees', 'An agent span reports a token total that differs from the LLM calls beneath it.'],
  ['D0', 'Unknown format version', 'The harness version is outside what the importer was checked against.'],
  ['D-cost', 'Cost cross-check', 'Runtime cost totals disagree with the transcript’s usage.'],
];

/* ---------- hero specimen: one real run, one real finding with its offset ---------- */
function specimen() {
  const r = byId['9e6a9543'], h = r.hallmark, d = new Date(h.firstTs);
  const date = d.getUTCFullYear() + '·' + String(d.getUTCMonth() + 1).padStart(2, '0');
  const f = r.findings.find(x => x.id === 'D9') || r.findings[0], it = f.items[0], e = it.ev[0];
  $('#specimen').innerHTML = `<span class="tag-hole" aria-hidden="true"></span>
    <div class="label">Specimen · real session</div>
    <div class="sp-id">${esc(r.id)}</div>
    <div class="src" style="margin-top:6px">${esc(r.source.file)} · ${full(r.source.lines)} lines · sha256 ${esc(r.source.sha256.slice(0, 12))}…</div>
    <div class="punches" id="punches">
      <span class="punch sponsor"><b>CC</b><i>${esc(r.harness.version)}</i></span>
      <span class="punch capture"><b>L${r.capture.level}</b><i>capture</i><span class="hm-pips" aria-hidden="true">${[0, 1, 2, 3, 4].map(i => `<s class="${i <= r.capture.level ? 'on' : ''}"></s>`).join('')}</span></span>
      <span class="punch fine" title="capped by ${esc(h.bound)}"><b>${h.fineness}</b><i>trust</i><span class="hm-bar" aria-hidden="true"><s style="width:${h.fineness / 10}%"></s></span></span>
      <span class="punch truth real"><b>R</b><i>real</i></span>
      <span class="punch date"><b>${date}</b><i>date</i></span>
      <span class="punch verdict ${r.overall === 'trustworthy' ? 'ok' : r.overall.startsWith('usable') ? 'caveat' : 'bad'}"><b>${r.overall === 'trustworthy' ? '●' : r.overall.startsWith('usable') ? '▲' : '✕'}</b><i>${r.overall === 'trustworthy' ? 'trustworthy' : r.overall.startsWith('usable') ? 'usable, with caveats' : 'do not trust'}</i><em>trust capped by ${esc(h.bound)}</em></span>
    </div>
    <div class="finding">
      <span class="d">${f.id}</span><span class="m">${esc(DET.find(x => x[0] === f.id)[1])}: the next event is stamped earlier than the one before it.</span>
      <span class="w">line ${full(e.line)} · bytes ${full(e.b0)}–${full(e.b1)}</span>
      <span class="bytes" aria-hidden="true"><i style="left:${(e.b0 / r.source.bytes * 100).toFixed(2)}%;width:${Math.max(0.5, (e.b1 - e.b0) / r.source.bytes * 100).toFixed(2)}%"></i></span>
    </div>
    <div style="margin-top:14px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <span class="src">${esc(r.file)}</span><a class="btn ghost" style="height:40px;font-size:14px;padding:0 16px" href="index.html#run=${esc(r.id)}">Assay it →</a>
    </div>`;
  const ps = [...document.querySelectorAll('#punches .punch')];
  ps.forEach((p, i) => setTimeout(() => p.classList.add('in'), reduced ? 0 : 500 + i * 180));
}

/* ---------- game: call the true output-token count ---------- */
// Rounds use real sessions where the naive sum and the assayed count differ.
const ROUNDS = REAL.filter(r => r.dedup[3] > 0 && r.naive[3] / r.dedup[3] > 1.15).sort((a, b) => b.source.lines - a.source.lines);
const G = { i: 0, guess: 0.6, done: false, log: store.get('callLog', []) };
function renderGame() {
  const r = ROUNDS[G.i % ROUNDS.length], max = r.naive[3], truth = r.dedup[3], d2 = r.findings.find(f => f.id === 'D2');
  $('#game').innerHTML = `
    <div>
      <div class="label">Round ${G.i % ROUNDS.length + 1} of ${ROUNDS.length} · session <span class="mono">${esc(r.id)}</span> · Claude Code ${esc(r.harness.version)}</div>
      <div class="gq" style="margin-top:10px">Summing every line says the model wrote <span class="mono" style="color:var(--ochre)">${full(max)}</span> output tokens. How many did it really write?</div>
      <div class="gauge" id="gauge">
        <div class="naive"><span class="label">sum of every line</span><b>${fmt(max)}</b></div>
        <div class="track"></div><div class="fill" id="gfill"></div>
        <div class="truth" id="gtruth" style="left:${truth / max * 100}%" data-v="assayed ${fmt(truth)}"></div>
        <div class="guess" id="gguess"></div>
        <input type="range" id="grange" min="0" max="1000" value="${G.guess * 1000}" aria-label="Your guess of the true output tokens" ${G.done ? 'disabled' : ''}>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:22px">
        <button class="btn" id="gcheck" ${G.done ? 'hidden' : ''}>Assay it</button>
        <button class="btn" id="gnext" ${G.done ? '' : 'hidden'}>Next session →</button>
        <a class="btn ghost" href="index.html#run=${esc(r.id)}">Watch the full assay</a>
      </div>
    </div>
    <div class="gside">
      <div class="label">Your calls</div>
      <div class="dots" aria-label="Past rounds">${G.log.slice(-15).map(x => `<i class="${x ? 'hit' : 'miss'}"></i>`).join('') || '<span class="src">none yet</span>'}</div>
      <div class="big" id="gbig">${G.done ? '×' + (max / truth).toFixed(2) : '?'}</div>
      <div class="verdict-line ${G.done ? (G.hit ? 'good' : 'bad') : ''}" id="gline">${G.done ? (G.hit ? 'Within 15%. Good eye.' : `Off by ${Math.round(G.err * 100)}%.`) : 'Drag the marker.'}</div>
      <div class="src" id="gwhy">${G.done && d2 ? `D2 found ${full(d2.count)} message ids written more than once. assay keeps one copy of each.` : 'Within 15% counts as a hit.'}</div>
    </div>`;
  const setGuess = v => { G.guess = v; const g = $('#gguess'); g.style.left = (v * 100) + '%'; g.dataset.v = 'you: ' + fmt(v * max); };
  setGuess(G.guess);
  if (G.done) { $('#gtruth').classList.add('on'); $('#gfill').style.width = (truth / max * 100) + '%'; }
  $('#grange').oninput = e => setGuess(e.target.value / 1000);
  $('#gcheck').onclick = () => {
    G.err = Math.abs(G.guess * max - truth) / truth; G.hit = G.err <= 0.15; G.done = true;
    G.log.push(G.hit); store.set('callLog', G.log.slice(-30));
    renderGame();
    $('#gfill').style.width = '0'; requestAnimationFrame(() => requestAnimationFrame(() => { $('#gfill').style.width = (truth / max * 100) + '%'; }));
  };
  $('#gnext').onclick = () => { G.i++; G.done = false; G.guess = 0.6; renderGame(); };
}

/* ---------- gates rack ---------- */
let gsel = 'D2';
function renderRack() {
  const hits = id => REAL.filter(r => r.findings.some(f => f.id === id));
  const allHits = id => RUNS.filter(r => r.findings.some(f => f.id === id));
  $('#rack').innerHTML = DET.map(([id, name]) => {
    const h = hits(id), a = allHits(id), warn = RUNS.some(r => r.findings.some(f => f.id === id && f.severity === 'warn'));
    return `<button class="g ${a.length ? '' : 'never'} ${warn ? 'warn' : ''}" data-g="${id}" aria-pressed="${gsel === id}" aria-label="${id} ${name}">
      <span class="id">${id}</span><span class="n">${h.length}<small>of ${REAL.length} real</small></span></button>`;
  }).join('');
  const [id, name, what] = DET.find(x => x[0] === gsel), h = hits(gsel), a = allHits(gsel);
  const total = h.reduce((s, r) => s + r.findings.find(f => f.id === gsel).count, 0);
  const others = a.filter(r => r.truth !== 'real');
  $('#gdetail').innerHTML = `<div><div class="label">${id}</div><h3>${esc(name)}</h3><p>${esc(what)}</p></div>
    <div>
      <div class="src" style="margin-bottom:10px">${h.length ? `Fired ${full(total)} times across ${h.length} real session${h.length > 1 ? 's' : ''}.` : 'Never fired on a real session yet. The check still runs on every one.'}${others.length ? ` Also on ${others.map(r => `<span class="mono">${esc(r.id)}</span> (${r.truth})`).join(', ')}.` : ''}</div>
      <div class="mini-shelf" aria-label="Real sessions">${REAL.map(r => { const hit = r.findings.some(f => f.id === gsel); return `<a class="${hit ? 'hit' : ''}" style="height:${24 + Math.min(70, Math.log10(r.source.lines + 1) * 18)}px" href="index.html#run=${esc(r.id)}" title="${esc(r.id)}${hit ? ' · fired' : ''}"></a>`; }).join('')}</div>
      <div class="src" style="margin-top:8px">One bar per real session, height by file length. Amber: this gate fired.</div>
    </div>`;
}

/* ---------- capture ladder ---------- */
const LEVELS = [
  ['L0', 'Final text', 'Only the final answer or an export. No turns, no usage, nothing to check.'],
  ['L1', 'Transcript', 'The JSONL Claude Code writes: events, parent links and usage per message.'],
  ['L2', '+ Hooks', 'Lifecycle events: compaction before and after, subagent start and stop, instructions loaded.'],
  ['L3', '+ OTel', 'Spans with tool, request and agent ids. Catches internal calls the transcript never shows.'],
  ['L4', '+ API bodies', 'The exact request and response bodies. What the model actually received.'],
];
let lsel = 1;
function renderLadder() {
  const max = Math.max(...RUNS.map(r => r.capture.level));
  $('#ladder').innerHTML = LEVELS.map(([id, t], i) => `<button class="lv ${i <= max ? 'on' : ''}" data-l="${i}" aria-pressed="${lsel === i}"><b>${id}</b><span>${t}</span></button>`).join('');
  const [id, t, what] = LEVELS[lsel], n = RUNS.filter(r => r.capture.level === lsel).length;
  $('#ldetail').innerHTML = `<b>${id} · ${t}.</b> ${what} <span class="src">${n} of ${RUNS.length} shelf sessions at this level.</span>`;
}

/* ---------- shelf cores ---------- */
function core(r, w = 92, h = 230) {
  const rh = h / r.band.length; let s = '';
  r.band.forEach((b, i) => {
    const tot = b.user + b.assistant + b.system + b.other + b.unknown, y = i * rh; if (!tot) return;
    let x = 0; const seg = (n, f) => { if (!n) return; const ww = n / tot * w; s += `<rect x="${x}" y="${y}" width="${ww}" height="${rh + .3}" fill="${f}"/>`; x += ww; };
    seg(b.assistant, 'var(--a)'); seg(b.user, 'var(--u)'); seg(b.system + b.other, 'var(--s)'); seg(b.unknown, 'url(#hp)');
    if (Object.keys(b.f).length) s += `<rect x="0" y="${y}" width="10" height="${Math.max(rh, 1.5)}" fill="var(--ochre)"/>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><rect width="${w}" height="${h}" fill="var(--paper-2)"/>${s}</svg>`;
}
function renderCores() {
  $('#cores').innerHTML = `<svg width="0" height="0" style="position:absolute"><defs><pattern id="hp" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="4" fill="var(--paper)"/><line x1="0" y1="0" x2="0" y2="4" stroke="var(--unk)" stroke-width="1" opacity=".5"/></pattern></defs></svg>` +
    REAL.map(r => `<a class="core" href="index.html#run=${esc(r.id)}" aria-label="Assay ${esc(r.id)}">${core(r)}<span class="cid">${esc(r.id)}</span><span class="cv">v${esc(r.harness.version)} · ${fmt(r.source.lines)} ln</span></a>`).join('');
}

/* ---------- missions ---------- */
function renderMissions() {
  const caught = store.get('caught', {});
  const M = [['m0', '00', 'Count every line', 'Add up usage on every line, like a quick parser would.'],
    ['m1', '01', 'Lose a subagent', 'Make a subagent’s transcript disappear before the total is taken.'],
    ['m2', '02', 'Forge a giant prompt', 'Rewrite one copy of a message to read 195,000 input tokens.'],
    ['m3', '03', 'Make copies disagree', 'Nudge one copy of a message from 3 tokens to 8.']];
  $('#missions').innerHTML = M.map(([id, no, t, p]) => `<a class="panel mission" href="index.html#mission=${id}">${caught[id] ? `<span class="stamp">${/leaked/.test(caught[id]) ? 'FLAGGED' : 'CAUGHT'}</span>` : ''}
    <span class="no">MISSION ${no}</span><h3>${t}</h3><p>${p}</p><span class="st">${caught[id] ? '✓ ' + esc(caught[id]) : 'Play →'}</span></a>`).join('');
}

/* ---------- wiring ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return;
  if (t.dataset.g) { gsel = t.dataset.g; renderRack(); }
  if (t.dataset.l) { lsel = +t.dataset.l; renderLadder(); }
});
$('#copy').onclick = () => { try { navigator.clipboard.writeText('assay check ~/.claude/projects/<proj>/<session>.jsonl'); $('#copy').textContent = 'copied'; } catch {} };
$('#theme').onclick = () => {
  const root = document.documentElement, dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark'; store.set('theme', root.dataset.theme);
};
{ const th = store.get('theme', null); if (th) document.documentElement.dataset.theme = th; }
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(x => { if (x.isIntersecting) { x.target.classList.add('seen'); io.unobserve(x.target); } }), { threshold: 0.12 }) : null;
document.querySelectorAll('.reveal').forEach(n => io ? io.observe(n) : n.classList.add('seen'));
// Live wire: one real finding per run and detector, with its line; the track is
// doubled so the loop is seamless. Names come from the detector list above.
{ const W = document.getElementById('wire'); if (W) { const NAME = Object.fromEntries(DET.map(([id, n]) => [id, n])); const items = [];
  for (const r of REAL) for (const f of r.findings) { const e = f.items[0] && f.items[0].ev && f.items[0].ev[0]; items.push(`<a href="index.html#run=${esc(r.id)}"><i>${f.severity === 'warn' ? '▲' : '●'}</i><b>${esc(NAME[f.id] || f.id)}</b>${esc(r.id)}${e ? ' · line ' + full(e.line + 1) : ''} · ×${full(f.count)}</a>`); }
  const pick = items.filter((_, i) => i % Math.max(1, Math.floor(items.length / 40)) === 0); W.innerHTML = pick.join('') + pick.join(''); } }
// The heading counts the detectors listed above, so it cannot drift from them.
{ const W = ['Zero','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen']; const g = document.getElementById('gcount'); if (g) g.textContent = W[DET.length] || DET.length; }
$('#foot').textContent = `${REAL.length} real · ${RUNS.filter(r => r.truth === 'real-perturbed').length} perturbed · ${RUNS.filter(r => r.truth === 'scripted').length} scripted sessions`;

specimen(); renderGame(); renderRack(); renderLadder(); renderCores(); renderMissions();
})();
