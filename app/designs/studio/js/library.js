/* The library: every draft, grouped by its Notion stage, with search, a compose button, the
   sync status and Settings. On a computer it slides in from the left (⌘\); on a phone it is the
   home screen and a draft is pushed over it like an iOS detail view (back button, or a swipe
   from the left edge). Also the inspector's Draft tab: the open draft's Notion properties,
   numbers and dates. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { el, icon, toast, money, plural, relTime, menu, closeMenu, spring, isNarrow, tip, keys } = TDW.UI;
  const { Store, Sync, Engine } = TDW;
  const app = () => TDW.App;
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  const FOLD_KEY = 'tdw.studio.folded';
  const LIB_KEY = 'tdw.studio.library';
  const VIEW_KEY = 'tdw.studio.view';
  const PROP_TYPES = new Set(['status', 'select', 'multi_select', 'date', 'checkbox', 'rich_text', 'number', 'url', 'email', 'phone_number']);

  let listEl = null, searchEl = null;
  let query = '';
  let open = true;
  let libSpring = null, pushSpring = null;
  let view = 'page';
  let folded = new Set();

  const readJSON = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (_) { return d; } };
  const writeJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* blocked */ } };

  /* ---------- Groups ---------- */
  function stageProp(c) {
    const names = Object.keys((c && c.schema) || {});
    return names.find((n) => c.schema[n].type === 'status') ||
      names.find((n) => c.schema[n].type === 'select' && /stage|status/i.test(n)) || null;
  }

  function groupsOf(list) {
    const c = Sync.config();
    const sp = stageProp(c);
    if (!c || !sp) return [{ key: 'all', name: '', items: list }];
    const s = c.schema[sp];
    const order = (s.options || []).slice();
    const by = new Map(order.map((o) => [o, []]));
    const none = [], local = [];
    for (const d of list) {
      if (d.localOnly) { local.push(d); continue; }
      const v = d.props && d.props[sp];
      if (typeof v === 'string' && by.has(v)) by.get(v).push(d);
      else none.push(d);
    }
    const out = order.filter((o) => by.get(o).length).map((o) => ({ key: 's:' + o, name: o, color: s.colors && s.colors[o], items: by.get(o) }));
    if (none.length) out.push({ key: 'none', name: 'No ' + sp.toLowerCase(), items: none });
    if (local.length) out.push({ key: 'local', name: 'On this device', items: local });
    return out;
  }

  function matches(d) {
    if (!query) return true;
    const q = query.toLowerCase();
    return Store.displayTitle(d).toLowerCase().includes(q) || d.text.toLowerCase().includes(q);
  }

  /* ---------- Rows ---------- */
  function metaOf(d) {
    const fetched = !(d.notionId && !d.contentFetchedAt && !d.text);
    const words = fetched ? Store.countWords(app().publishTextOf ? app().publishTextOf(d) : d.text) : null;
    return { spend: words == null ? '' : money(words * 10), words, when: relTime(d.updatedAt) };
  }

  function row(d, isCurrent) {
    const title = Store.displayTitle(d);
    const m = metaOf(d);
    const b = el('button', {
      type: 'button', class: 'lib-row' + (isCurrent ? ' is-current' : '') + (title === 'Untitled draft' ? ' is-untitled' : ''),
      'aria-current': isCurrent ? 'page' : null, dataset: { id: d.id }
    },
    el('span', { class: 'lib-row-title', text: title }),
    el('span', { class: 'lib-row-meta' },
      el('span', { class: 'lib-row-spend', text: m.spend }),
      el('span', { class: 'lib-row-when', text: m.when })));
    b.addEventListener('click', () => openRow(d));
    b.addEventListener('contextmenu', (e) => { e.preventDefault(); rowMenu(b, d, e.clientX, e.clientY); });
    const more = el('button', { type: 'button', class: 'lib-row-more icon-btn icon-btn-sm', 'aria-label': 'More for “' + title + '”', tabindex: '-1' }, icon('more'));
    more.addEventListener('click', (e) => { e.stopPropagation(); rowMenu(more, d); });
    return el('div', { class: 'lib-item', role: 'listitem' }, b, more);
  }

  function openRow(d) {
    if (app().state.draft === d) { if (isNarrow()) pushPage(); else TDW.Editor.focus(); return; }
    app().openDraft(d.id);
    if (isNarrow()) pushPage();
  }

  function render() {
    if (!listEl) return;
    const cur = app().state.draft;
    const focusId = document.activeElement && listEl.contains(document.activeElement) && document.activeElement.dataset.id;
    const all = Store.listDrafts().filter(matches);
    const groups = groupsOf(all);
    const kids = [];
    for (const g of groups) {
      if (!g.items.length) continue;
      const isFolded = !query && g.name && folded.has(g.key);
      const items = el('div', { class: 'lib-group-items', role: 'list', hidden: isFolded });
      for (const d of g.items) items.append(row(d, !!cur && cur.id === d.id));
      if (g.name) {
        const head = el('button', { type: 'button', class: 'lib-group-head', 'aria-expanded': String(!isFolded) },
          el('span', { class: 'lib-chev', 'aria-hidden': 'true' }, icon('chevDown')),
          g.color ? el('span', { class: 'lib-dot', dataset: { color: g.color }, 'aria-hidden': 'true' }) : null,
          el('span', { class: 'lib-group-name', text: g.name }),
          el('span', { class: 'lib-group-count', text: String(g.items.length) }));
        head.addEventListener('click', () => {
          if (folded.has(g.key)) folded.delete(g.key); else folded.add(g.key);
          writeJSON(FOLD_KEY, [...folded]);
          render();
        });
        kids.push(el('section', { class: 'lib-group', 'aria-label': g.name }, head, items));
      } else kids.push(el('section', { class: 'lib-group' }, items));
    }
    if (!kids.length) kids.push(el('p', { class: 'lib-empty', text: query ? 'No drafts match “' + query + '”.' : 'No drafts yet.' }));
    listEl.replaceChildren(...kids);
    if (focusId) {
      const again = listEl.querySelector('.lib-row[data-id="' + CSS.escape(focusId) + '"]');
      if (again) again.focus({ preventScroll: true });
    }
    const curRow = listEl.querySelector('.lib-row.is-current');
    if (curRow && !focusId) curRow.scrollIntoView({ block: 'nearest' });
    renderSync();
  }

  /* ---------- Sync status, at the bottom ---------- */
  const SYNC_LABEL = { syncing: 'Syncing…', synced: 'Synced', offline: 'Offline', error: 'Sync error', 'other-tab': 'Syncing in another tab' };
  function renderSync() {
    const b = $('sync-status');
    if (!b) return;
    const c = Sync.config();
    if (!c) {
      b.replaceChildren(el('span', { class: 'sync-dot is-off', 'aria-hidden': 'true' }), el('span', { class: 'sync-text', text: 'On this device' }));
      tip(b, 'Connect Notion in Settings to sync');
      b.dataset.state = 'off';
      return;
    }
    const s = Sync.status();
    const label = SYNC_LABEL[s.state] || 'Notion';
    b.dataset.state = s.state || '';
    b.replaceChildren(el('span', { class: 'sync-dot', 'aria-hidden': 'true' }),
      el('span', { class: 'sync-text' }, el('span', { class: 'sync-state', text: label }), ' with ' + c.dbTitle));
    tip(b, s.at ? 'Last sync ' + relTime(s.at).toLowerCase() : (s.message || 'Not synced yet'));
  }
  function syncDetails() {
    const c = Sync.config();
    if (!c) { app().openSettings('notion'); return; }
    const s = Sync.status();
    const what = s.message || SYNC_LABEL[s.state] || '';
    toast((what ? what.replace(/\.?$/, '. ') : '') + (s.at ? 'Last sync ' + relTime(s.at).toLowerCase() + '.' : 'Not synced yet.'));
  }

  /* ---------- Notion properties: one editor for the row menu and the Draft tab ---------- */
  function propNames(c) {
    if (!c || !c.schema) return [];
    const rank = (t) => ['status', 'select', 'multi_select', 'date'].indexOf(t) + 1 || 9;
    return Object.keys(c.schema).filter((n) => n !== c.titleProp && PROP_TYPES.has(c.schema[n].type))
      .sort((x, y) => rank(c.schema[x].type) - rank(c.schema[y].type));
  }

  function showValue(s, v) {
    if (v == null || v === '' || (Array.isArray(v) && !v.length)) return '';
    if (s.type === 'multi_select') return v.join(', ');
    if (s.type === 'date') {
      const t = Date.parse(String(v).slice(0, 10) + 'T12:00:00');
      return isNaN(t) ? String(v) : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
    }
    if (s.type === 'checkbox') return v ? 'Yes' : 'No';
    return String(v);
  }

  function editProp(anchor, d, name, s, after) {
    const v = d.props[name];
    const set = (value) => { app().setProp(d, name, value); if (after) after(); };
    if (s.type === 'checkbox') { set(!v); return; }
    if (s.type === 'status' || s.type === 'select') {
      const items = (s.options || []).map((o) => ({ label: o, value: o, checked: o === v }));
      if (s.type === 'select' && v) items.push({ type: 'sep' }, { label: 'Clear', value: null });
      menu(anchor, items, (it) => { set(it.value); });
      return;
    }
    if (s.type === 'multi_select') {
      const chosen = new Set(Array.isArray(v) ? v : []);
      menu(anchor, (s.options || []).map((o) => ({ label: o, value: o, checked: chosen.has(o) })), (it, btn) => {
        if (chosen.has(it.value)) chosen.delete(it.value); else chosen.add(it.value);
        btn.setAttribute('aria-checked', String(chosen.has(it.value)));
        app().setProp(d, name, [...chosen]);
        return true;
      }, null, after);
      return;
    }
    if (s.type === 'date') {
      const cal = TDW.UI.calendar({ value: v ? String(v).slice(0, 10) : '', onPick: (iso) => { closeMenu(); set(iso || null); } });
      menu(anchor, [], () => false, cal);
      cal.focusDay();
      return;
    }
    const type = { number: 'number', url: 'url', email: 'email', phone_number: 'tel' }[s.type] || 'text';
    const input = el('input', { type, class: 'field', 'aria-label': name, value: v == null ? '' : String(v) });
    const save = () => {
      const raw = input.value.trim();
      closeMenu();
      set(raw === '' ? null : s.type === 'number' ? Number(raw) : raw);
    };
    const form = el('form', { class: 'menu-form' }, el('label', { class: 'menu-form-label', text: name }), input,
      el('div', { class: 'row-end' },
        v != null && v !== '' ? el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: 'Clear', onclick: () => { input.value = ''; save(); } }) : null,
        el('button', { type: 'submit', class: 'btn btn-sm', text: 'Save' })));
    form.noValidate = true;
    form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    menu(anchor, [], () => false, form);
    input.focus();
  }

  function rowMenu(anchor, d, x, y) {
    let a = anchor;
    if (x != null) {
      a = el('span', { class: 'ctx-anchor' });
      a.style.left = x + 'px'; a.style.top = y + 'px';
      document.body.append(a);
      setTimeout(() => a.remove(), 2000);
    }
    const c = Sync.config();
    const items = [];
    if (c && !d.localOnly) {
      for (const n of propNames(c).slice(0, 4)) {
        const s = c.schema[n];
        items.push({ label: n, note: showValue(s, d.props[n]) || 'Empty', value: 'prop:' + n });
      }
      items.push({ type: 'sep' });
    }
    if (d.url && /^https?:\/\//.test(d.url)) items.push({ label: 'Open in Notion', icon: 'external', value: 'notion' });
    items.push({ label: 'Delete draft', icon: 'trash', value: 'del', danger: true });
    menu(a, items, (it) => {
      if (it.value === 'notion') window.open(d.url, '_blank', 'noopener');
      else if (it.value === 'del') deleteDraft(d.id);
      else if (it.value.startsWith('prop:')) {
        const n = it.value.slice(5);
        setTimeout(() => editProp(anchor.isConnected ? anchor : a, d, n, c.schema[n], refreshAll), 0);
      }
      return false;
    });
  }

  function refreshAll() { render(); renderDraftTab(); }

  function deleteDraft(id) {
    const d = Store.getDraft(id);
    if (!d) return;
    const wasOpen = app().state.draft === d;
    if (wasOpen) app().saveNow();
    const copy = JSON.parse(JSON.stringify(d));
    Sync.trash(d);
    Store.deleteDraft(id);
    app().draftDeleted(id);
    render();
    toast('Draft deleted', {
      label: 'Undo',
      run: () => {
        Store.saveDraft(copy);
        Sync.restore(copy);
        if (wasOpen) app().openDraft(copy.id);
        render();
      }
    });
  }

  /* ---------- The Draft tab ---------- */
  let draftTabRaf = 0;
  function renderDraftTab() {
    cancelAnimationFrame(draftTabRaf);
    draftTabRaf = requestAnimationFrame(drawDraftTab);
  }
  function drawDraftTab() {
    const host = $('tab-draft');
    const d = app() && app().state.draft;
    if (!host || !d) return;
    if (host.hidden && host.childElementCount) return; // drawn again when it's shown
    const c = Sync.config();
    const kids = [el('h2', { class: 'dt-title', text: Store.displayTitle(d) })];
    if (c && !d.localOnly) {
      const names = propNames(c);
      if (names.length) {
        const dl = el('div', { class: 'dt-props', role: 'list', 'aria-label': 'Notion properties' });
        for (const n of names) {
          const s = c.schema[n];
          const v = d.props[n];
          const shown = showValue(s, v);
          const color = s.colors && typeof v === 'string' ? s.colors[v] : null;
          const b = el('button', { type: 'button', class: 'dt-value' + (shown ? '' : ' is-empty') },
            color ? el('span', { class: 'lib-dot', dataset: { color }, 'aria-hidden': 'true' }) : null,
            el('span', { text: shown || 'Empty' }));
          b.setAttribute('aria-label', n + ': ' + (shown || 'empty'));
          b.addEventListener('click', () => editProp(b, d, n, s, refreshAll));
          dl.append(el('div', { class: 'dt-row', role: 'listitem' }, el('span', { class: 'dt-key', text: n }), b));
        }
        kids.push(el('section', { class: 'dt-sec' }, el('div', { class: 'rv-label', text: 'In Notion' }), dl));
      }
      if (d.url && /^https?:\/\//.test(d.url)) {
        kids.push(el('a', { class: 'dt-link', href: d.url, target: '_blank', rel: 'noopener' }, 'Open in Notion', icon('external')));
      } else if (!d.notionId) {
        kids.push(el('p', { class: 'hint', text: 'This draft goes to Notion once it has some text.' }));
      }
    } else if (c && d.localOnly) {
      kids.push(el('p', { class: 'hint', text: 'This draft stays on this device. It came from a database you disconnected.' }));
    } else {
      kids.push(el('p', { class: 'hint' }, 'Drafts live in this browser. ',
        el('button', { type: 'button', class: 'link-btn', text: 'Connect Notion', onclick: () => app().openSettings('notion') }), ' to sync them.'));
    }
    const text = app().publishText();
    const words = Engine.countWords(text);
    const chars = text.replace(/\s+/g, ' ').trim().length;
    const f = TDW.Formats.get(d.format);
    const facts = [
      ['Format', f.label],
      ['Budget', money(d.budget)],
      ['Words', words.toLocaleString('en-US')],
      ['Characters', chars.toLocaleString('en-US')],
      ['Reading time', Math.max(1, Math.round(words / 238)) + ' min'],
      ['Created', new Date(d.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })],
      ['Edited', relTime(d.updatedAt)]
    ];
    kids.push(el('section', { class: 'dt-sec' }, el('div', { class: 'rv-label', text: 'This draft' }),
      el('dl', { class: 'dt-facts' }, facts.map(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]))));
    kids.push(el('div', { class: 'dt-actions' },
      el('button', { type: 'button', class: 'btn btn-quiet is-danger', onclick: () => deleteDraft(d.id) }, icon('trash'), 'Delete draft')));
    host.replaceChildren(...kids);
  }

  /* ---------- Computer: slide in from the left ---------- */
  function setLibValue(v) {
    root.style.setProperty('--lib', String(Math.max(0, Math.min(1.02, v))));
    if (TDW.App && TDW.App.layoutMoved) TDW.App.layoutMoved();
  }

  function show(opts) {
    const o = opts || {};
    if (isNarrow()) { popToLibrary(); if (o.focusSearch) setTimeout(() => searchEl.focus(), 50); return; }
    if (!open) {
      open = true;
      root.classList.add('lib-open');
      $('library').inert = false;
      libSpring.to(1, { instant: o.instant });
      if (!o.transient) writeJSON(LIB_KEY, true);
      if (TDW.App && TDW.App.fitPanes) TDW.App.fitPanes('library');
    }
    updateToggle();
    if (o.focusSearch) searchEl.focus();
  }

  function hide(opts) {
    const o = opts || {};
    if (isNarrow() || !open) return;
    open = false;
    root.classList.remove('lib-open');
    if ($('library').contains(document.activeElement)) TDW.Editor.focus();
    $('library').inert = true;
    libSpring.to(0, { instant: o.instant });
    if (!o.transient) writeJSON(LIB_KEY, false);
    updateToggle();
  }

  function updateToggle() {
    const b = $('btn-lib');
    b.setAttribute('aria-pressed', String(open));
    tip(b, open ? 'Hide the library' : 'Show the library', keys('⌘\\'));
  }

  /* ---------- Phone: the library is home; a draft is pushed over it ---------- */
  function setPush(v) {
    root.style.setProperty('--push', String(v));
  }
  function setView(v, animate, velocity) {
    view = v;
    root.dataset.view = v;
    writeJSON(VIEW_KEY, v);
    $('library').inert = isNarrow() && v === 'page';
    for (const id of ['page', 'toolbar', 'phone-bar']) { const n = $(id); if (n) n.inert = isNarrow() && v === 'library'; }
    if (!isNarrow()) { pushSpring.set(1); return; }
    pushSpring.to(v === 'page' ? 1 : 0, animate === false ? { instant: true } : { velocity: velocity || 0, damping: 1, response: 0.42 });
    if (v === 'library') { render(); if (TDW.App) TDW.App.setMode('write', { keepLibrary: true }); }
  }
  function pushPage(opts) { setView('page', !(opts && opts.instant)); }
  function popToLibrary(opts) { setView('library', !(opts && opts.instant), opts && opts.velocity); }

  // Swipe from the left edge to go back, following the finger.
  function wireEdgeSwipe() {
    let drag = null;
    document.addEventListener('pointerdown', (e) => {
      if (!isNarrow() || view !== 'page' || e.clientX > 22 || e.pointerType === 'mouse') return;
      if (document.querySelector('dialog[open]')) return;
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, moved: false, hist: [{ x: e.clientX, t: e.timeStamp }] };
    }, true);
    document.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!drag.moved) {
        if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
        if (dx < 10) return;
        drag.moved = true;
        root.classList.add('is-swiping');
      }
      pushSpring.set(Math.max(0, Math.min(1, 1 - dx / window.innerWidth)));
      drag.hist.push({ x: e.clientX, t: e.timeStamp });
      if (drag.hist.length > 6) drag.hist.shift();
      e.preventDefault();
    }, { capture: true, passive: false });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag;
      drag = null;
      root.classList.remove('is-swiping');
      if (!d.moved) return;
      const a = d.hist[0], b = d.hist[d.hist.length - 1];
      const v = b.t > a.t ? (b.x - a.x) / (b.t - a.t) * 1000 : 0; // px/s, right is positive
      const w = window.innerWidth;
      const projected = (1 - pushSpring.value) * w + (v / 1000) * 0.998 / 0.002 * 0.25;
      const vel = -v / w; // in push units per second
      if (v > 300 || (v > -300 && projected > w * 0.5)) popToLibrary({ velocity: vel });
      else { view = 'page'; pushSpring.to(1, { velocity: vel }); }
    };
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
  }

  function relayout() {
    if (isNarrow()) {
      root.style.setProperty('--lib', '0');
      libSpring.set(0);
      $('library').inert = view === 'page';
      setView(view, false);
    } else {
      pushSpring.set(1);
      for (const id of ['page', 'toolbar', 'phone-bar']) { const n = $(id); if (n) n.inert = false; }
      $('library').inert = !open;
      libSpring.set(open ? 1 : 0);
      root.classList.toggle('lib-open', open);
    }
    updateToggle();
  }

  /* ---------- Keyboard: arrows move through the rows ---------- */
  function onListKey(e) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = [...listEl.querySelectorAll('.lib-group-items:not([hidden]) .lib-row, .lib-group-head')];
    const i = rows.indexOf(document.activeElement);
    if (i < 0) return;
    e.preventDefault();
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
    next.focus();
  }

  function init() {
    listEl = $('lib-list');
    searchEl = $('lib-search');
    folded = new Set(readJSON(FOLD_KEY, []));
    $('lib-new').append(icon('compose'));
    $('lib-new-phone').append(icon('compose'));
    $('btn-settings').append(icon('gear'));
    $('lib-settings-phone').append(icon('gear'));
    $('btn-lib').append(icon('library'));
    document.querySelector('.lib-search-icon').append(icon('search'));
    document.querySelector('.tb-back-icon').append(icon('chevLeft'));
    tip($('lib-new'), 'New draft');
    tip($('btn-settings'), 'Settings', keys('⌘,'));
    const compose = () => { app().newDraft(''); if (isNarrow()) pushPage(); TDW.Editor.focus(); };
    $('lib-new').addEventListener('click', compose);
    $('lib-new-phone').addEventListener('click', compose);
    $('btn-settings').addEventListener('click', () => app().openSettings());
    $('lib-settings-phone').addEventListener('click', () => app().openSettings());
    $('sync-status').addEventListener('click', syncDetails);
    $('btn-lib').addEventListener('click', () => (open ? hide() : show()));
    $('btn-back').addEventListener('click', () => popToLibrary());
    searchEl.addEventListener('input', () => { query = searchEl.value.trim(); render(); });
    searchEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { if (searchEl.value) { e.preventDefault(); e.stopPropagation(); searchEl.value = ''; query = ''; render(); } else TDW.Editor.focus(); }
      if (e.key === 'ArrowDown') { const r = listEl.querySelector('.lib-row'); if (r) { e.preventDefault(); r.focus(); } }
      if (e.key === 'Enter') { const r = listEl.querySelector('.lib-row'); if (r) { e.preventDefault(); r.click(); } }
    });
    listEl.addEventListener('keydown', onListKey);
    open = readJSON(LIB_KEY, true) !== false;
    libSpring = spring({ value: open ? 1 : 0, response: 0.36, damping: 1, onUpdate: setLibValue });
    pushSpring = spring({ value: 1, response: 0.42, damping: 1, onUpdate: setPush });
    view = readJSON(VIEW_KEY, 'page') === 'library' ? 'library' : 'page';
    setLibValue(open ? 1 : 0);
    root.classList.toggle('lib-open', open);
    relayout();
    TDW.UI.narrowQuery.addEventListener('change', relayout);
    wireEdgeSwipe();
    setInterval(() => { if (!document.hidden) render(); }, 60000); // "3 min ago" stays true
  }

  TDW.Library = {
    init, render, renderSync, renderDraftTab, show, hide, deleteDraft, editProp, propNames, stageProp,
    toggle: () => (isNarrow() ? popToLibrary() : open ? hide() : show()),
    isOpen: () => (isNarrow() ? view === 'library' : open),
    pushPage, popToLibrary, view: () => view
  };
})();
