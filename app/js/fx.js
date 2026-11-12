/* The moments that make the desk feel alive. Each one answers something you did, and none of
   them holds the page up: the text has already changed by the time anything moves.
   - Cut words burst: their letters fly off the line and the saving flies up to the spend.
   - Trim scans the page while the AI reads, then strikes its cuts one after another.
   - Rolling a challenge spins a reel of them; a red pencil rings the one you got.
   - A challenge met punches a handful of paper out of the card.
   Settings → Look → Effects turns them off; so does the system's Reduce Motion. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { UI } = TDW;
  const { el } = UI;

  const on = () => !UI.reducedMotion() && !(TDW.App && TDW.App.state.settings && TDW.App.state.settings.effects === false);
  const sound = (k, o) => { if (TDW.Sound) TDW.Sound.play(k, o); };
  const rnd = (a, b) => a + Math.random() * (b - a);

  let layer = null;
  function host() {
    if (!layer) { layer = el('div', { class: 'fx-layer', 'aria-hidden': 'true' }); document.body.append(layer); }
    return layer;
  }

  /* ---------- Letters ---------- */

  // Where the letters of markdown [start, end) are now, to burst once they're gone from the page.
  function capture(ranges) {
    if (!on()) return null;
    const root = TDW.Editor.rootEl();
    const cs = getComputedStyle(root);
    const each = Math.max(24, Math.floor(260 / Math.max(1, ranges.length)));
    const glyphs = [];
    for (const r of ranges) for (const g of TDW.Editor.glyphs(r.start, r.end, each)) glyphs.push(g);
    return glyphs.length ? { glyphs, font: cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + '/' + cs.lineHeight + ' ' + cs.fontFamily } : null;
  }

  // The captured letters fly apart: up and out from the middle of what was cut, then down.
  function burst(shot) {
    if (!shot || !on()) return null;
    const gs = shot.glyphs.filter((g) => g.y > -40 && g.y < window.innerHeight + 40);
    if (!gs.length) return null;
    const h = host();
    let cx = 0, cy = 0;
    for (const g of gs) { cx += g.x + g.w / 2; cy += g.y + g.h / 2; }
    cx /= gs.length; cy /= gs.length;
    const frag = document.createDocumentFragment();
    const nodes = [];
    for (const g of gs) {
      const s = document.createElement('span');
      s.className = 'fx-glyph';
      s.textContent = g.ch;
      s.style.cssText = 'left:' + g.x + 'px;top:' + (g.y + g.h / 2) + 'px;font:' + shot.font;
      frag.append(s);
      nodes.push(s);
    }
    h.append(frag);
    nodes.forEach((s, k) => {
      const g = gs[k];
      const dx = g.x + g.w / 2 - cx;
      const out = (dx / (Math.abs(dx) + 40)) * rnd(40, 110) + rnd(-26, 26);
      const up = rnd(-70, -24);
      const fall = rnd(60, 150);
      const spin = rnd(-220, 220);
      const t = rnd(520, 820);
      s.animate([
        { transform: 'translate(0, -50%) rotate(0deg) scale(1)', opacity: 1, color: 'var(--ink)', offset: 0 },
        { transform: 'translate(' + out * 0.55 + 'px, calc(-50% + ' + up + 'px)) rotate(' + spin * 0.45 + 'deg) scale(1.08)', opacity: 1, color: 'var(--red-mark)', offset: 0.3, easing: 'cubic-bezier(.3, 0, .7, .4)' },
        { transform: 'translate(' + out + 'px, calc(-50% + ' + fall + 'px)) rotate(' + spin + 'deg) scale(.7)', opacity: 0, color: 'var(--red-mark)', offset: 1 }
      ], { duration: t, delay: Math.min(120, k * 2), easing: 'cubic-bezier(.2, .6, .4, 1)', fill: 'both' }).onfinish = () => s.remove();
    });
    sound('tear');
    return { x: cx, y: cy };
  }

  // The saving flies from where the words were to the spend in the spine.
  function fly(text, from) {
    const to = document.querySelector('#spine-spend .spend-amt');
    if (!from || !to || !on()) return;
    const r = to.getBoundingClientRect();
    const chip = el('span', { class: 'fx-money', text });
    host().append(chip);
    const x1 = r.left + r.width / 2, y1 = r.top + r.height / 2;
    const midX = from.x + (x1 - from.x) * 0.35, midY = Math.min(from.y, y1) - 34;
    chip.style.left = '0px';
    chip.style.top = '0px';
    const at = (x, y, s) => 'translate(' + x + 'px,' + y + 'px) translate(-50%, -50%) scale(' + s + ')';
    chip.animate([
      { transform: at(from.x, from.y - 6, 0.6), opacity: 0, offset: 0 },
      { transform: at(from.x, from.y - 26, 1.15), opacity: 1, offset: 0.16, easing: 'cubic-bezier(.4, 0, .9, .5)' },
      { transform: at(midX, midY, 1), opacity: 1, offset: 0.5, easing: 'cubic-bezier(.2, .4, .4, 1)' },
      { transform: at(x1, y1, 0.7), opacity: 0.2, offset: 1 }
    ], { duration: 760, fill: 'both' }).onfinish = () => {
      chip.remove();
      to.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.14)' }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.2, .8, .3, 1)' });
    };
  }

  // Words cut from the page: shot is what capture() saw just before, words is how many went.
  function cut(shot, words) {
    const from = burst(shot);
    if (from && words > 0) fly('−' + UI.money(words * 10), from);
    return !!from;
  }

  /* ---------- Trim: a pencil line reads down the page; the cuts are struck in turn ---------- */

  let scanEl = null;
  function scan(start) {
    if (scanEl) { scanEl.remove(); scanEl = null; }
    if (!start || !on()) return;
    const s = document.getElementById('surface').getBoundingClientRect();
    const top = Math.max(s.top, 56), bottom = Math.min(s.bottom, window.innerHeight - 12);
    if (bottom - top < 40) return;
    scanEl = el('div', { class: 'fx-scan' }, el('i'));
    scanEl.style.cssText = 'left:' + (s.left - 14) + 'px;width:' + (s.width + 28) + 'px;top:' + top + 'px;height:' + (bottom - top) + 'px';
    scanEl.style.setProperty('--run', (bottom - top) + 'px');
    scanEl.style.setProperty('--t', Math.max(900, Math.round((bottom - top) * 2.6)) + 'ms');
    host().append(scanEl);
  }

  // The marks trim just made, struck one by one from the top.
  function zap() {
    scan(false);
    if (!on()) return;
    const marks = [...TDW.Editor.rootEl().querySelectorAll('.lab-trim')];
    const gap = Math.max(14, Math.min(70, 900 / Math.max(1, marks.length)));
    marks.forEach((m, k) => {
      const d = k * gap;
      m.animate([
        { color: 'var(--ink)', textDecorationColor: 'transparent', backgroundColor: 'transparent', offset: 0 },
        { color: 'var(--ink)', textDecorationColor: 'transparent', backgroundColor: 'var(--highlight)', offset: 0.35 },
        { color: 'color-mix(in srgb, var(--ink) 42%, transparent)', textDecorationColor: 'var(--red-mark)', backgroundColor: 'transparent', offset: 1 }
      ], { duration: 280, delay: d, fill: 'backwards', easing: 'ease-out' });
      if (k < 14) setTimeout(() => sound('zap', { gain: 0.5, rate: 0.9 + k * 0.02 }), d + 90);
    });
  }

  /* ---------- Rolling a challenge ---------- */

  let rolling = null;
  // names: what could come up; winner: what did. Resolves as it lands; the reel clears itself.
  function roll(names, winner) {
    if (rolling) rolling.end(true);
    if (!on() || !names.length) return Promise.resolve();
    return new Promise((resolve) => {
      const ROW = 34;
      const pool = names.filter((n) => n !== winner);
      const strip = [];
      for (let k = 0; k < 16; k++) strip.push(pool.length ? pool[Math.floor(Math.random() * pool.length)] : winner);
      strip.push(winner);
      const list = el('div', { class: 'fx-reel-list' }, strip.map((n) => el('div', { class: 'fx-reel-row', text: n })));
      const ring = el('span', { class: 'fx-ring' });
      ring.innerHTML = '<svg viewBox="0 0 240 44" preserveAspectRatio="none"><path pathLength="1" d="M26 9 C70 1 170 0 214 8 C238 13 239 30 215 36 C168 45 66 45 24 36 C2 30 2 15 30 8 C44 5 62 4 80 4"/></svg>';
      const box = el('div', { class: 'fx-reel', role: 'status', 'aria-label': 'Rolled: ' + winner }, el('div', { class: 'fx-reel-window' }, el('div', { class: 'fx-reel-mask' }, list)), ring);
      // Where the challenge's card is about to be: the foot of the margin, or the middle of a phone.
      const foot = document.getElementById('margin-foot');
      const wide = !UI.isNarrow();
      const col = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--col-r')) || 800;
      const w = 258;
      const left = wide ? Math.min(window.innerWidth - w - 12, col + 55 - 12) : (window.innerWidth - w) / 2;
      const bottom = wide ? 26 + (foot ? foot.offsetHeight : 0) : 110;
      box.style.cssText = 'left:' + left + 'px;bottom:' + bottom + 'px;width:' + w + 'px';
      host().append(box);

      const end = (strip.length - 1) * ROW;
      const T = 1050;
      const t0 = performance.now();
      let raf = 0, last = 0, done = false, timers = [];
      const land = () => {
        if (done) return;
        done = true;
        cancelAnimationFrame(raf);
        list.style.transform = 'translateY(' + -end + 'px)';
        list.style.filter = '';
        box.classList.add('is-landed');
        sound('stamp', { gain: 0.8 });
        timers.push(setTimeout(() => sound('scratch', { gain: 0.7 }), 90));
        // Long enough to read it and see the ring close; then the card takes its place.
        timers.push(setTimeout(() => { resolve(); box.classList.add('is-leaving'); timers.push(setTimeout(() => finish(true), 240)); }, 620));
      };
      const finish = (quiet) => {
        timers.forEach(clearTimeout);
        cancelAnimationFrame(raf);
        box.remove();
        window.removeEventListener('keydown', skip, true);
        window.removeEventListener('pointerdown', skip, true);
        if (rolling && rolling.box === box) rolling = null;
        done = true;
        resolve();
        return quiet;
      };
      const skip = () => { if (!done) land(); else if (!box.classList.contains('is-leaving')) { resolve(); finish(true); } };
      const frame = (now) => {
        const p = Math.min(1, (now - t0) / T);
        const eased = 1 - Math.pow(1 - p, 4); // fast, then it runs out of breath
        const y = end * eased;
        const row = Math.floor(y / ROW + 0.5);
        if (row !== last) { last = row; sound('tick', { gain: 0.35 + 0.5 * p, rate: 1.25 - 0.4 * p }); }
        const speed = 4 * Math.pow(1 - p, 3) * end / T; // px per ms
        list.style.transform = 'translateY(' + -y + 'px)';
        list.style.filter = speed > 0.5 ? 'blur(' + Math.min(2.2, speed * 0.7).toFixed(2) + 'px)' : '';
        if (p < 1) raf = requestAnimationFrame(frame); else land();
      };
      rolling = { box, end: finish };
      window.addEventListener('keydown', skip, true);
      window.addEventListener('pointerdown', skip, true);
      raf = requestAnimationFrame(frame);
    });
  }

  /* ---------- A challenge met ---------- */

  // Paper punched out of the card: small rounds that scatter and fall.
  function chads(from) {
    if (!from || !on()) return;
    const h = host();
    const x = from.left + from.width / 2, y = from.top + from.height / 2;
    for (let k = 0; k < 22; k++) {
      const c = el('i', { class: 'fx-chad' + (k % 4 === 0 ? ' is-red' : k % 3 === 0 ? ' is-blue' : '') });
      const size = rnd(4, 8);
      c.style.cssText = 'left:' + x + 'px;top:' + y + 'px;width:' + size + 'px;height:' + size + 'px';
      h.append(c);
      const a = rnd(-Math.PI, 0), v = rnd(50, 150);
      const dx = Math.cos(a) * v, up = Math.sin(a) * v;
      c.animate([
        { transform: 'translate(-50%, -50%) scale(.4)', opacity: 1, offset: 0 },
        { transform: 'translate(calc(-50% + ' + dx * 0.6 + 'px), calc(-50% + ' + up + 'px)) scale(1) rotateX(' + rnd(0, 360) + 'deg)', opacity: 1, offset: 0.35, easing: 'cubic-bezier(.3, 0, .8, .5)' },
        { transform: 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + (up + rnd(120, 240)) + 'px)) scale(.9) rotateX(' + rnd(360, 900) + 'deg)', opacity: 0, offset: 1 }
      ], { duration: rnd(800, 1300), easing: 'cubic-bezier(.15, .7, .3, 1)', fill: 'both' }).onfinish = () => c.remove();
    }
  }

  TDW.Fx = { on, capture, burst, fly, cut, scan, zap, roll, chads };
})();
