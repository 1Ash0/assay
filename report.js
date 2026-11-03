/* Report: the default run view (ADR-038). One page that answers "can I trust
   this run's numbers, and if not, which ones and why", in plain words. It
   reads only what core computed (RunView); nothing here recomputes Health.
   Also: the Ctrl+K run finder and the pointer sheen on .sheen cards.
   Talks to app.js only through window.ASSAY. */
(() => {
  const A = window.ASSAY, { DMAP, LADDER, esc, full, load, go } = A, RUNS = A.runs;
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const NAMES = { D0: 'Unknown format version', D11: 'Request record broken', D12: 'Agent total disagrees' };
  const name = id => (DMAP[id] && DMAP[id].name) || NAMES[id] || id;
  const what = id => (DMAP[id] && DMAP[id].what) || '';
  const tone = v => !v ? 'mute' : v === 'trustworthy' ? 'mint' : v.startsWith('usable') ? 'ochre' : 'verm';
  const say = v => !v ? 'not assessed' : v === 'trustworthy' ? 'Trustworthy' : v.startsWith('usable') ? 'Usable, with caveats' : 'Do not trust';
  const day = ts => ts ? new Date(ts).toISOString().slice(0, 10) : 'undated';

  // A run's name is what it was, not its hash (the hash stays as secondary text).
  const title = r => `${day(r.hallmark.firstTs)} · ${r.harness.tool.replace('claude-code', 'Claude Code')} ${r.harness.version || ''}`;
  // "No subagents seen", never "0": at L1 subagent use can leave no marker (see the subagent card).
  const sub = r => `${full(r.validity.claimedTurns)} requests · ${full(r.counts.tools)} tool calls · ${r.counts.agents ? full(r.counts.agents) + " subagents" : "no subagents seen"}`;

  // The run's shape, drawn from core's 140-column band: lines per column by
  // kind (bars), context per request (the trace), findings (ticks). The
  // sweeping head is decoration: it moves over the data and encodes nothing.
  function scope(r) {
    const B = r.band || [], n = B.length; if (!n) return '';
    const W = 1000, H = 120, cw = W / n;
    const tot = b => b.user + b.assistant + b.system + b.other + b.unknown;
    const maxL = Math.max(1, ...B.map(tot)), maxC = Math.max(1, ...B.map(b => b.nc || 0));
    let bars = '', ticks = '', pts = [];
    B.forEach((b, i) => {
      let y = H - 4;
      for (const [k, col] of [['user', 'var(--u)'], ['assistant', 'var(--a)'], ['system', 'var(--s)'], ['other', 'var(--s)'], ['unknown', 'var(--o)']]) {
        const h = (H - 34) * b[k] / maxL; if (h <= 0) continue;
        y -= h; bars += `<rect x="${(i * cw + .6).toFixed(1)}" y="${y.toFixed(1)}" width="${(cw - 1.2).toFixed(1)}" height="${h.toFixed(1)}" fill="${col}" opacity=".75"/>`;
      }
      if (b.nc) pts.push(`${(i * cw + cw / 2).toFixed(1)},${(H - 6 - (H - 30) * b.nc / maxC).toFixed(1)}`);
      if (b.f && Object.keys(b.f).length) {
        const warn = Object.keys(b.f).some(id => (r.findings.find(f => f.id === id) || {}).severity === 'warn');
        ticks += `<rect x="${(i * cw).toFixed(1)}" y="2" width="${Math.max(1.5, cw - 1).toFixed(1)}" height="${warn ? 10 : 5}" fill="${warn ? 'var(--ochre)' : 'var(--mute)'}"/>`;
      }
    });
    const trace = pts.length > 1 ? `<polyline points="${pts.join(' ')}" fill="none" stroke="var(--cob)" stroke-width="1.6" class="sc-trace"/>` : '';
    return `<figure class="sc">
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Shape of the transcript: ${full(r.source.lines)} lines in ${n} columns, with context per request and where findings sit">
        <defs><linearGradient id="scg" x1="0" x2="1"><stop offset="0" stop-color="var(--cob)" stop-opacity="0"/><stop offset="1" stop-color="var(--cob)" stop-opacity=".35"/></linearGradient></defs>
        ${bars}${trace}${ticks}<rect class="sc-head" x="-60" y="0" width="60" height="${H}" fill="url(#scg)"/></svg>
      <figcaption class="label">The whole transcript, ${full(r.source.lines)} lines, left to right · bars: lines by kind · trace: context per request · ticks: findings</figcaption>
    </figure>`;
  }
  // Where in the file a finding sits, as a mark on a bar the width of the file.
  const locate = (r, e) => e && r.source.lines ? `<span class="rp-loc" aria-hidden="true"><i style="left:${(100 * e.line / r.source.lines).toFixed(2)}%"></i></span>` : '';

  function ring(r) {
    const f = r.hallmark.fineness, C = 2 * Math.PI * 52;
    const off = f == null ? C : C * (1 - f / 1000);
    return `<div class="rp-ring" role="img" aria-label="Trust score ${f ?? 'none'} of 1000, capped by ${esc(r.hallmark.bound || 'nothing')}">
      <svg viewBox="0 0 120 120" width="148" height="148">
        <circle cx="60" cy="60" r="52" fill="none" stroke="var(--rule)" stroke-width="6"/>
        <circle cx="60" cy="60" r="52" fill="none" stroke="var(--rule)" stroke-width="10" stroke-dasharray="1 5.53" opacity=".7"/>
        <circle class="rp-arc" cx="60" cy="60" r="52" fill="none" stroke="var(--${tone(r.overall)})" stroke-width="6" stroke-linecap="butt"
          stroke-dasharray="${C}" stroke-dashoffset="${still() ? off : C}" data-off="${off}" transform="rotate(-90 60 60)" style="filter:drop-shadow(0 0 6px color-mix(in srgb,var(--${tone(r.overall)}) 45%,transparent))"/>
      </svg>
      <div class="rp-ringnum"><b class="display" data-count="${f ?? 0}">${f == null ? '–' : still() ? f : 0}</b><span class="label" tabindex="0" data-tip="Trust score (fineness): 1000 × the lowest of usage coverage, parsed telemetry and model identification. The rate that sets it is named.">trust / 1000</span></div>
    </div>`;
  }

  function capture(r) {
    const L = r.capture.level;
    const cells = [0, 1, 2, 3, 4].map(i => `<span class="rp-cap ${i <= L ? 'on' : ''}" title="${esc(LADDER[i][1])}">L${i}</span>`).join('');
    return `<div class="rp-capture"><span class="label" tabindex="0" data-tip="Capture Level: how much of the run was recorded. L1 is the transcript alone; L4 adds the exact API bodies. Anything above this level is not in the record.">Captured at</span><b class="display">L${L}</b><span class="label">of L4</span><span class="rp-caps">${cells}</span></div>`;
  }

  function answer(fam, r, body) {
    const v = r.verdicts[fam];
    return `<div class="panel sheen rp-ans rise" style="--c:var(--${tone(v)})">
      <div class="label">${fam === 'tokens' ? 'Can I trust the token totals?' : fam === 'structure' ? 'Can I trust the structure?' : 'Can I trust the subagent picture?'}</div>
      <div class="rp-verdict"><i></i>${say(v)}</div>
      <div class="rp-body">${body}</div>
    </div>`;
  }

  function numbers(r) {
    const v = r.validity, range = v.inputTokenRange && v.inputTokenRange.min !== v.inputTokenRange.max;
    const naive = r.naive && r.naive[3], real = r.dedup && r.dedup[3];
    const tile = (k, n, note, raw) => `<div class="rp-num"><span class="label">${k}</span><b class="display" ${raw ? '' : `data-count="${n}"`}>${raw || (still() ? full(n) : 0)}</b><span class="rp-note">${note}</span></div>`;
    return [
      tile('Context tokens', v.totalContextTokens, 'cache read + write + input, deduplicated'),
      tile('Output tokens', v.totalOutputTokens, naive && real && naive > real ? `summing every line says ${full(naive)} · ×${(naive / real).toFixed(2)} too many` : 'one count per message'),
      range ? tile('Uncached input', null, 'copies disagree, so this is a range, not a number', `${full(v.inputTokenRange.min)}–${full(v.inputTokenRange.max)}`) : tile('Uncached input', v.totalInputTokens, 'copies agree'),
      tile('Cache hit rate', null, 'share of input served from cache', v.cacheHitRate == null ? '–' : (v.cacheHitRate * 100).toFixed(1) + '%'),
    ].join('');
  }

  function findings(r) {
    const fs = r.findings.slice().sort((a, b) => ({ error: 0, warn: 1, info: 2 }[a.severity] - { error: 0, warn: 1, info: 2 }[b.severity]));
    if (!fs.length) return '<div class="rp-empty">No detector fired on this run.</div>';
    return fs.map((f, i) => {
      const e = f.items[0] && f.items[0].ev && f.items[0].ev[0];
      return `<button class="rp-find rise" style="animation-delay:${i * 40}ms" data-jump="${esc(f.id)}">
        <span class="rp-sev ${f.severity}">${f.severity}</span>
        <span class="rp-fname"><b>${esc(name(f.id))}</b> <span class="mono rp-id">${esc(f.id)}</span><br><span class="rp-note">${esc(what(f.id) || (f.items[0] ? f.items[0].msg.slice(0, 140) : ''))}</span></span>
        <span class="mono rp-cnt">×${full(f.count)}</span>
        <span class="mono rp-at">${locate(r, e)}${e ? `line ${full(e.line + 1)} · bytes ${full(e.b0)}–${full(e.b1)}` : 'no single line'}</span>
      </button>`;
    }).join('');
  }

  function render(r) {
    const host = document.getElementById('report'); if (!host || !r) return;
    const v = r.validity, obs = v.observability || {};
    const next = LADDER[r.capture.level + 1];
    const req = v.requests;
    // Capture-level caveats are the same on every run at that level; they live
    // with the level, not in this run's own list.
    const levelCav = v.caveats.filter(c => /^Capture Level \d+:/.test(c)), runCav = v.caveats.filter(c => !levelCav.includes(c));
    host.innerHTML = `
    <div class="rp-head rise">
      <div class="rp-id">
        <div class="rp-kicker"><span class="pulse"></span><span class="label">Run report · <span tabindex="0" data-tip="real: an unmodified session. real-perturbed: a real session with a deliberate, documented change. scripted: written by hand for tests, never shown as an example.">${esc(r.truth)}</span>${r.truth === 'scripted' ? ' · synthetic' : ''}</span></div>
        <h1 class="rp-title">${esc(title(r))}</h1>
        <div class="rp-sub">${sub(r)} · <span class="mono">${esc(r.id)}</span> <span class="mono rp-hash">${esc(r.file)}</span></div>
        ${capture(r)}
        <p class="rp-say"><span class="rp-dot" style="background:var(--${tone(r.overall)})"></span>${say(r.overall)}. ${r.hallmark.bound ? `The trust score is capped by <b>${esc(r.hallmark.bound)}</b> (${((r.hallmark.rates[r.hallmark.bound] ?? 0) * 100).toFixed(1)}%).` : ''}</p>
        <div class="rp-acts"><button class="btn" data-act="scan">▶ Replay the assay</button><button class="tool" data-goto="replay">Step through requests</button><button class="tool" data-act="finder">Find a run <kbd>Ctrl K</kbd></button></div>
      </div>
      ${ring(r)}
    </div>
    ${scope(r)}
    <div class="rp-answers">
      ${answer('tokens', r, `${full(v.verifiedUsageTurns)} of ${full(v.claimedTurns)} requests carry usage. ${r.findings.some(f => f.id === 'D2') ? 'Messages written on several lines were counted once.' : 'No duplicated messages.'}`)}
      ${answer('structure', r, `${full(r.counts.observed)} links observed by id, ${full(r.counts.matched)} by exact match, none guessed. ${obs.transcript ? esc(obs.transcript.reason) : ''}`)}
      ${answer('subagents', r, obs.subagent ? esc(obs.subagent.reason) : 'No subagent information.')}
    </div>
    <div class="rp-grid">
      <section class="panel rp-sec"><div class="label">Numbers you can quote</div><div class="rp-nums">${numbers(r)}</div>
        ${req ? `<div class="rp-seal"><span class="rp-sealmark ${req.broken ? 'bad' : ''}">${req.broken ? '✕' : '✓'}</span><span>${full(req.sealed)} of ${full(req.records)} request records <span tabindex="0" data-tip="Sealed: the request body was rebuilt from the transcript and hashes to the digest Claude Code recorded for it.">sealed</span>: rebuilt from the transcript, they hash to their own digest.${req.broken ? ` ${full(req.broken)} broken.` : ''}</span></div>` : ''}
      </section>
      <section class="panel rp-sec"><div class="label">What went wrong · click to see the bytes</div><div class="rp-finds">${findings(r)}</div></section>
      <section class="panel rp-sec"><div class="label">What this record can't tell you</div>
        <ul class="rp-cav">${runCav.map(c => `<li>${esc(c)}</li>`).join('') || '<li>Nothing beyond the capture level below.</li>'}</ul>
        ${levelCav.length ? `<div class="rp-level"><span class="label">What L${r.capture.level} cannot see</span>${levelCav.map(c => { const t = c.replace(/^Capture Level \d+: /, ''); return esc(t[0].toUpperCase() + t.slice(1)); }).join('. ')}.</div>` : ''}
        ${next ? `<div class="rp-next"><span class="label">Capture more</span>${esc(next[0])} adds ${esc(next[1].replace(/^\+ /, ''))}. <a href="index.html#levels">How to turn it on →</a></div>` : ''}
      </section>
    </div>`;
    animate(host);
  }

  function animate(host) {
    if (still()) return;
    requestAnimationFrame(() => host.querySelectorAll('.rp-arc').forEach(a => { a.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.2,.7,.1,1)'; a.style.strokeDashoffset = a.dataset.off; }));
    host.querySelectorAll('[data-count]').forEach(n => countUp(n, +n.dataset.count));
  }
  function countUp(node, to, ms = 1400) {
    const t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 4); node.textContent = full(to * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  document.addEventListener('click', e => {
    const j = e.target.closest('[data-jump]');
    if (j) { A.focus(j.dataset.jump); return; }
    const a = e.target.closest('[data-act="scan"]');
    if (a) { go('bench'); load(A.current().id, { autoplay: true }); return; }
    if (e.target.closest('[data-act="finder"]')) openFinder();
  });

  /* ---------- Ctrl+K run finder ---------- */
  const fd = document.createElement('div');
  fd.id = 'finder'; fd.setAttribute('role', 'dialog'); fd.setAttribute('aria-label', 'Find a run'); fd.hidden = true;
  fd.innerHTML = `<div class="panel fd-box"><input id="fdq" placeholder="Search runs: id, date, version, verdict, truth…" autocomplete="off" aria-label="Search runs"><div id="fdl" role="listbox"></div><div class="fd-foot label">↑ ↓ choose · Enter open · Esc close</div></div>`;
  document.body.appendChild(fd);
  let sel = 0, hits = [];
  function list() {
    const q = document.getElementById('fdq').value.toLowerCase().trim();
    hits = RUNS.filter(r => !q || [r.id, title(r), r.truth, say(r.overall), 'L' + r.capture.level].join(' ').toLowerCase().includes(q)).slice(0, 12);
    sel = Math.min(sel, Math.max(0, hits.length - 1));
    document.getElementById('fdl').innerHTML = hits.map((r, i) => `<div class="fd-row" role="option" aria-selected="${i === sel}" data-fd="${esc(r.id)}">
      <span class="rp-dot" style="background:var(--${tone(r.overall)})"></span><b>${esc(title(r))}</b><span class="mono">${esc(r.id)}</span><span class="label">L${r.capture.level} · ${esc(r.truth)}</span></div>`).join('') || '<div class="rp-empty">No run matches.</div>';
  }
  function openFinder() { fd.hidden = false; const q = document.getElementById('fdq'); q.value = ''; sel = 0; list(); q.focus(); }
  function pick(id) { fd.hidden = true; load(id); go('report'); }
  fd.addEventListener('input', list);
  fd.addEventListener('click', e => { const r = e.target.closest('[data-fd]'); if (r) pick(r.dataset.fd); else if (e.target === fd) fd.hidden = true; });
  fd.addEventListener('keydown', e => {
    if (e.key === 'Escape') { fd.hidden = true; e.stopPropagation(); }
    if (e.key === 'ArrowDown') { sel = Math.min(hits.length - 1, sel + 1); list(); e.preventDefault(); }
    if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); list(); e.preventDefault(); }
    if (e.key === 'Enter' && hits[sel]) pick(hits[sel].id);
  });
  document.addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openFinder(); } }, true);

  // Sheen follows the pointer on glossy cards (decoration only).
  document.addEventListener('pointermove', e => {
    const c = e.target.closest && e.target.closest('.sheen'); if (!c) return;
    const b = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - b.left) + 'px'); c.style.setProperty('--my', (e.clientY - b.top) + 'px');
  });

  window.ASSAY_REPORT = { render, title, say, tone };
  // app.js loads the first run before this file exists; draw it now.
  if (A.view() === 'report') render(A.current());
})();
