/* Links, the way Notion shows them: rest on a link (or click it) and a small card comes up under
   it with where it goes. Click the address to open it; copy it, change it, or take the link off.
   ⌘-click opens it straight away. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { Editor, UI } = TDW;
  const { el, icon } = UI;

  let card = null, forEl = null, showTimer = 0, hideTimer = 0;
  const safe = (u) => /^(https?:|mailto:)/i.test(String(u || ''));
  const pretty = (u) => String(u).replace(/^https?:\/\/(www\.)?/i, '').replace(/^mailto:/i, '').replace(/\/$/, '');

  function hide() {
    clearTimeout(showTimer);
    clearTimeout(hideTimer);
    if (!card) return;
    card.remove();
    card = null;
    forEl = null;
  }
  const hideSoon = () => { clearTimeout(hideTimer); hideTimer = setTimeout(hide, 220); };

  function show(a) {
    clearTimeout(hideTimer);
    if (forEl === a && card) return;
    hide();
    const url = a.dataset.href;
    if (!url) return;
    forEl = a;
    const btn = (name, ic, run) => {
      const b = el('button', { type: 'button', class: 'link-act', 'aria-label': name, 'data-tip': name }, icon(ic));
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', run);
      return b;
    };
    const open = safe(url)
      ? el('a', { class: 'link-url', href: url, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), el('span', { text: pretty(url) }))
      : el('span', { class: 'link-url is-plain' }, el('span', { text: url }));
    const editable = Editor.rootEl().contentEditable === 'true';
    card = el('div', { class: 'link-card', role: 'group', 'aria-label': 'Link' }, open,
      btn('Copy link', 'copy', () => { (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => UI.toast('Copied'), () => {}); hide(); }),
      editable ? btn('Edit', 'pencil', () => { const x = a; hide(); Editor.editLink(x); }) : null,
      editable ? btn('Remove link', 'unlink', () => { const x = a; hide(); Editor.editLink(x, true); }) : null);
    card.addEventListener('mouseenter', () => clearTimeout(hideTimer));
    card.addEventListener('mouseleave', hideSoon);
    document.body.append(card);
    const rects = a.getClientRects();
    const r = rects.length ? rects[rects.length - 1] : a.getBoundingClientRect();
    const w = card.offsetWidth, h = card.offsetHeight;
    let top = r.bottom + 6;
    if (top + h > UI.visibleBottom() - 8) top = r.top - h - 6;
    card.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
    card.style.top = top + 'px';
  }

  TDW.Links = {
    init() {
      const root = Editor.rootEl();
      const linkOf = (t) => (t && t.closest ? t.closest('.lk[data-href]') : null);
      root.addEventListener('mouseover', (e) => {
        const a = linkOf(e.target);
        if (!a || e.buttons) return;
        clearTimeout(hideTimer);
        clearTimeout(showTimer);
        showTimer = setTimeout(() => { if (a.isConnected) show(a); }, 280);
      });
      root.addEventListener('mouseout', (e) => { if (linkOf(e.target)) { clearTimeout(showTimer); hideSoon(); } });
      root.addEventListener('click', (e) => {
        const a = linkOf(e.target);
        if (!a) return;
        const mod = UI.device.apple ? e.metaKey : e.ctrlKey;
        if (mod && safe(a.dataset.href)) { e.preventDefault(); window.open(a.dataset.href, '_blank', 'noopener,noreferrer'); return; }
        const s = Editor.getSelection();
        if (s.end > s.start) return; // dragging across it selects; it doesn't open the card
        clearTimeout(showTimer);
        show(a);
      });
      root.addEventListener('keydown', hide);
      window.addEventListener('scroll', hide, { passive: true });
      document.addEventListener('pointerdown', (e) => { if (card && !card.contains(e.target) && !linkOf(e.target)) hide(); }, true);
    },
    load: hide, onMode: hide, onText: hide
  };
})();
