/* Decorative motion for the landing (ADR-038): flowing phosphor lines behind
   the hero and text that decodes into place. Encodes no quantity; still under
   reduced motion; pauses when off screen or the tab is hidden. */
(() => {
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  // Line waves (after React Bits' Line Waves): a stack of slow sine ribbons.
  const host = document.querySelector('[data-fx="waves"]');
  if (host) {
    const cv = document.createElement('canvas');
    cv.setAttribute('aria-hidden', 'true');
    cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:.55;mask-image:linear-gradient(180deg,transparent,#000 25%,#000 70%,transparent)';
    host.style.position = 'relative'; host.prepend(cv);
    const g = cv.getContext('2d');
    let w = 0, h = 0, t = 0, on = true;
    const size = () => { const d = devicePixelRatio || 1; w = cv.clientWidth; h = cv.clientHeight; cv.width = w * d; cv.height = h * d; g.setTransform(d, 0, 0, d, 0, 0); };
    size(); addEventListener('resize', size);
    new IntersectionObserver(([e]) => { on = e.isIntersecting; }).observe(host);
    const draw = () => {
      g.clearRect(0, 0, w, h);
      const a = css('--cob'), b = css('--rule');
      for (let k = 0; k < 18; k++) {
        g.beginPath();
        for (let x = 0; x <= w; x += 12) {
          const y = h * .55 + Math.sin(x * .004 + t * .6 + k * .35) * (40 + k * 6) + Math.sin(x * .011 - t * .4 + k) * 12 + (k - 9) * 9;
          x ? g.lineTo(x, y) : g.moveTo(x, y);
        }
        g.strokeStyle = k % 6 === 0 ? a : b; g.globalAlpha = k % 6 === 0 ? .55 : .6; g.lineWidth = k % 6 === 0 ? 1.4 : 1; g.stroke();
      }
      g.globalAlpha = 1;
    };
    const loop = () => { if (on && !document.hidden) { t += .012; draw(); } requestAnimationFrame(loop); };
    draw(); if (!still) requestAnimationFrame(loop);
  }

  // Decode: characters scramble, then settle left to right (after Tech Text).
  const GLYPHS = '01<>/[]{}#=+*:;.-';
  document.querySelectorAll('[data-fx="decode"]').forEach(el => {
    if (still) return;
    const final = el.textContent; let f = 0;
    const tick = () => {
      el.textContent = [...final].map((c, i) => c === ' ' || i < f / 2 ? c : GLYPHS[(Math.random() * GLYPHS.length) | 0]).join('');
      if (f++ < final.length * 2) requestAnimationFrame(tick); else el.textContent = final;
    };
    new IntersectionObserver(([e], o) => { if (e.isIntersecting) { o.disconnect(); tick(); } }).observe(el);
  });
})();
