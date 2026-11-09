/* The ledger column: in Review, each paragraph's cost sits in the left margin of the page as a
   small plum figure, right-aligned in tabular figures like a column of accounts. When a fix cuts
   a paragraph, its old figure stays for a moment, struck through, with the cut beside it. */
(function () {
  'use strict';
  const TDW = (window.TDW = window.TDW || {});
  const { Editor, Store, UI } = TDW;
  const app = () => TDW.App;
  let col = null;
  let prev = new Map();   // line index -> last figure, to see what a fix took off
  let prevDraft = null;
  let timer = 0;

  const active = () => {
    const a = app();
    return !!(a && a.state.draft && a.state.mode === 'edit' && TDW.Inspector.isOpen() && TDW.Inspector.tab() === 'review' && !TDW.Inspector.pushed());
  };

  function build() {
    if (col) return;
    col = UI.el('div', { id: 'ledger', class: 'ledger', 'aria-hidden': 'true' });
    document.getElementById('surface').append(col);
  }

  function update() {
    if (!col) return;
    if (!active()) { col.hidden = true; return; }
    const surface = document.getElementById('surface');
    const sr = surface.getBoundingClientRect();
    if (sr.left < 84) { col.hidden = true; return; } // no margin to speak of
    col.hidden = false;
    const draft = app().state.draft;
    if (draft !== prevDraft) { prev = new Map(); prevDraft = draft; }
    const lines = Editor.getText().split('\n');
    const next = new Map();
    const nodes = [];
    let at = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const start = at;
      at += line.length + 1;
      if (!line.trim()) continue;
      const words = Store.countWords(line.replace(/^\s*(#{1,6}|[-*+>]|\d+\.)\s+/, ''));
      if (!words) continue;
      const rc = Editor.rectAt(start);
      if (!rc) continue;
      const cost = words * 10;
      next.set(i, cost);
      const was = prev.get(i);
      const cut = was != null && was > cost;
      const kids = [];
      if (cut) {
        kids.push(UI.el('span', { class: 'ledger-cut', text: '−' + UI.money(was - cost) }));
      }
      kids.push(UI.el('span', { class: 'ledger-fig', text: UI.money(cost) }));
      nodes.push(UI.el('div', { class: 'ledger-row' + (cut ? ' is-cut' : ''), style: 'top:' + Math.round(rc.lineTop - sr.top) + 'px' }, kids));
    }
    col.replaceChildren(...nodes);
    // What was struck stays a moment, then the old figure is forgotten.
    clearTimeout(timer);
    if (nodes.some((n) => n.classList.contains('is-cut'))) timer = setTimeout(() => { prev = new Map(next); update(); }, 2600);
    else prev = next;
  }

  let raf = 0;
  const later = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(update); };

  TDW.Ledger = {
    init() { build(); window.addEventListener('resize', later); },
    load() { prev = new Map(); later(); },
    onMode() { later(); },
    onTab() { later(); },
    onText() { later(); },
    update: later,
    reposition: later
  };
})();
