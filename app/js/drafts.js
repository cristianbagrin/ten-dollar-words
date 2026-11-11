/* Drafts: a sidebar on the left edge, the way Notion keeps its pages. It stays out of sight;
   resting the pointer on the left edge brings it over the page and it leaves when the pointer
   does. The title in the spine (or ⌘O) keeps it open: beside the page when there is room,
   over it when there isn't. On a phone the same list comes up as a sheet.

   The list is a view you shape: group it (by month, or by any Notion select), sort it, filter
   it, and choose which properties show. Every property on a row is a chip you click to change. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { el, icon, toast, money, plural, relTime, menu, closeMenu, keys, present, dismiss } = TDW.UI;
  const { Store, Sync } = TDW;
  const app = () => TDW.App;
  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  const CHIP_TYPES = new Set(['status', 'select', 'multi_select', 'date', 'checkbox', 'rich_text', 'number', 'url', 'email', 'phone_number']);
  const DEFAULT_SHOWN = new Set(['status', 'select', 'multi_select', 'date']);
  const PICK_TYPES = new Set(['status', 'select', 'multi_select']);
  const COLORS = { default: '#787774', gray: '#787774', brown: '#9f6b53', orange: '#d9730d', yellow: '#cb912f', green: '#448361', blue: '#337ea9', purple: '#9065b0', pink: '#c14c8a', red: '#d44c47' };
  const SYNC_TEXT = { syncing: 'Syncing with Notion', synced: 'Synced', offline: 'Offline. Changes wait here', error: 'Sync stopped', 'other-tab': 'Syncing in another tab' };
  const VIEW_KEY = 'tdw.draftsView';
  const PIN_KEY = 'tdw.draftsPinned';
  const PIN_MIN = 1360;      // narrower than this, an open sidebar lies over the page instead of beside it

  let side = null, sheet = null, body = null, listEl = null, findEl = null, barEl = null, chipsEl = null, footEl = null, syncBtn = null, pinBtn = null, nameEl = null;
  let state = null;          // null | 'peek' (leaves with the pointer) | 'held' (over the page until dismissed) | 'pinned' (beside the page)
  let query = '';
  let view = null;
  let enterTimer = 0, leaveTimer = 0, spinUntil = 0;

  /* ---------- The view: how the list is grouped, sorted and filtered ---------- */
  function loadView() {
    let v = {};
    try { v = JSON.parse(localStorage.getItem(VIEW_KEY) || '{}') || {}; } catch (_) { v = {}; }
    return {
      group: typeof v.group === 'string' ? v.group : 'month',
      sort: typeof v.sort === 'string' ? v.sort : 'edited',
      dir: v.dir === 'asc' ? 'asc' : 'desc',
      filters: v.filters && typeof v.filters === 'object' ? v.filters : {},
      props: Array.isArray(v.props) ? v.props : null,
      folded: Array.isArray(v.folded) ? v.folded : []
    };
  }
  function saveView() { try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch (_) { /* private mode */ } }

  const schema = () => { const c = Sync.config(); return (c && c.schema) || null; };
  const plainName = (t) => String(t || '').replace(/[\p{Extended_Pictographic}‍️]/gu, '').replace(/\s+/g, ' ').trim();
  function fields(test) {
    const c = Sync.config();
    const s = schema();
    if (!s) return [];
    const rank = (t) => ['status', 'select', 'multi_select', 'date'].indexOf(t) + 1 || 9;
    return Object.keys(s).filter((n) => n !== c.titleProp && CHIP_TYPES.has(s[n].type) && (!test || test(s[n])))
      .sort((x, y) => rank(s[x].type) - rank(s[y].type)).map((n) => Object.assign({ name: n }, s[n]));
  }
  const shownProps = () => fields().filter((f) => (view.props ? view.props.includes(f.name) : DEFAULT_SHOWN.has(f.type)));
  const propOf = (key) => (key.startsWith('prop:') ? key.slice(5) : null);
  const colorOf = (f, v) => COLORS[(f.colors && typeof v === 'string' && f.colors[v]) || 'default'] || COLORS.default;
  const isEmpty = (v) => v == null || v === '' || (Array.isArray(v) && !v.length);

  // If Notion's schema changed under a saved view, fall back to what still exists.
  function tidyView() {
    const s = schema() || {};
    const ok = (key, types) => { const p = propOf(key); return !p || (s[p] && (!types || types.has(s[p].type))); };
    if (!ok(view.group, new Set(['status', 'select']))) view.group = 'month';
    if (!ok(view.sort)) view.sort = 'edited';
    for (const n of Object.keys(view.filters)) if (!s[n] || !PICK_TYPES.has(s[n].type) || !view.filters[n].length) delete view.filters[n];
  }

  function dateOf(d) {
    const p = propOf(view.sort);
    const s = schema();
    if (p && s && s[p] && s[p].type === 'date') {
      const v = d.props && d.props[p];
      const t = v ? Date.parse(String(v).slice(0, 10) + 'T12:00:00') : NaN;
      return isNaN(t) ? null : t;
    }
    return view.sort === 'created' ? d.createdAt : d.updatedAt;
  }

  function compare(a, b) {
    const p = propOf(view.sort);
    const s = schema();
    let r = 0;
    if (view.sort === 'title') r = Store.displayTitle(a).localeCompare(Store.displayTitle(b), undefined, { sensitivity: 'base' });
    else if (view.sort === 'spend') r = Store.countWords(a.text) - Store.countWords(b.text);
    else if (p && s && s[p] && s[p].type !== 'date') {
      const f = s[p];
      const val = (d) => { const v = d.props ? d.props[p] : null; return Array.isArray(v) ? v[0] : v; };
      const va = val(a), vb = val(b);
      if (isEmpty(va) !== isEmpty(vb)) return isEmpty(va) ? 1 : -1;      // empty always last
      if (f.options) r = f.options.indexOf(va) - f.options.indexOf(vb);
      else if (f.type === 'number' || f.type === 'checkbox') r = Number(va) - Number(vb);
      else r = String(va || '').localeCompare(String(vb || ''));
    } else {
      const da = dateOf(a), db = dateOf(b);
      if ((da == null) !== (db == null)) return da == null ? 1 : -1;
      r = (da || 0) - (db || 0);
    }
    if (!r) r = a.updatedAt - b.updatedAt;
    return view.dir === 'asc' ? r : -r;
  }

  function passes(d) {
    if (query && !Store.displayTitle(d).toLowerCase().includes(query)) return false;
    for (const n of Object.keys(view.filters)) {
      const want = view.filters[n];
      const v = d.props ? d.props[n] : null;
      const has = Array.isArray(v) ? v.some((x) => want.includes(x)) : want.includes(v);
      if (!has) return false;
    }
    return true;
  }

  function groupsOf(list) {
    if (view.group === 'none') return [{ key: 'all', label: '', rows: list }];
    const map = new Map();
    const push = (key, label, order, color, d) => { if (!map.has(key)) map.set(key, { key, label, order, color, rows: [] }); map.get(key).rows.push(d); };
    const p = propOf(view.group);
    const s = schema();
    if (p && s && s[p]) {
      const f = Object.assign({ name: p }, s[p]);
      for (const d of list) {
        const v = d.props ? d.props[p] : null;
        if (isEmpty(v)) push('~', 'No ' + p.toLowerCase(), 1e9, null, d);
        else push(String(v), String(v), f.options ? f.options.indexOf(v) : 0, colorOf(f, v), d);
      }
      return [...map.values()].sort((a, b) => a.order - b.order);
    }
    const thisYear = new Date().getFullYear();
    for (const d of list) {
      const t = dateOf(d);
      if (t == null) { push('~', 'No date', -Infinity, null, d); continue; }
      const dt = new Date(t);
      const label = dt.toLocaleDateString('en-US', dt.getFullYear() === thisYear ? { month: 'long' } : { month: 'long', year: 'numeric' });
      push(dt.getFullYear() + '-' + dt.getMonth(), label, dt.getFullYear() * 12 + dt.getMonth(), null, d);
    }
    const dateSort = view.sort === 'created' || view.sort === 'edited' || (propOf(view.sort) && s && s[propOf(view.sort)] && s[propOf(view.sort)].type === 'date');
    const up = dateSort && view.dir === 'asc';
    return [...map.values()].sort((a, b) => (a.key === '~' ? 1 : b.key === '~' ? -1 : up ? a.order - b.order : b.order - a.order));
  }

  /* ---------- A property: a chip that opens the right editor ---------- */
  function showValue(f, v) {
    if (isEmpty(v)) return '';
    if (f.type === 'multi_select') return v.join(', ');
    if (f.type === 'date') {
      const t = Date.parse(String(v).slice(0, 10) + 'T12:00:00');
      return isNaN(t) ? String(v) : new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
    }
    if (f.type === 'checkbox') return v ? f.name : '';
    return String(v);
  }

  function editProp(anchor, d, name, after) {
    const s = schema();
    if (!s || !s[name]) return;
    const f = s[name];
    const v = d.props[name];
    const done = () => { render(); if (after) after(); };
    const set = (value) => { app().setProp(d, name, value); done(); };
    if (f.type === 'checkbox') { set(!v); return; }
    if (f.type === 'status' || f.type === 'select') {
      const items = [{ type: 'head', label: name }].concat((f.options || []).map((o) => ({ label: o, value: o, checked: o === v })));
      if (f.type === 'select' && v) items.push({ type: 'sep' }, { label: 'Clear', value: null });
      menu(anchor, items, (it) => set(it.value));
      return;
    }
    if (f.type === 'multi_select') {
      const chosen = new Set(Array.isArray(v) ? v : []);
      menu(anchor, [{ type: 'head', label: name }].concat((f.options || []).map((o) => ({ label: o, value: o, checked: chosen.has(o) }))), (it, btn) => {
        if (chosen.has(it.value)) chosen.delete(it.value); else chosen.add(it.value);
        btn.setAttribute('aria-checked', String(chosen.has(it.value)));
        app().setProp(d, name, [...chosen]);
        return true;
      }, null, done);
      return;
    }
    if (f.type === 'date') {
      const cal = TDW.UI.calendar({ value: v ? String(v).slice(0, 10) : '', onPick: (iso) => { app().setProp(d, name, iso || null); closeMenu(); done(); } });
      menu(anchor, [], () => false, cal);
      cal.focusDay();
      return;
    }
    const type = { number: 'number', url: 'url', email: 'email', phone_number: 'tel' }[f.type] || 'text';
    const input = el('input', { type, class: 'menu-input', 'aria-label': name, value: v == null ? '' : String(v) });
    const save = () => {
      const raw = input.value.trim();
      app().setProp(d, name, raw === '' ? null : f.type === 'number' ? Number(raw) : raw);
      closeMenu();
      done();
    };
    const form = el('form', { class: 'menu-form' }, el('label', { class: 'menu-form-label', text: name }), input,
      el('div', { class: 'row-end' },
        v != null && v !== '' ? el('button', { type: 'button', class: 'btn-quiet btn-sm', text: 'Clear', onclick: () => { input.value = ''; save(); } }) : null,
        el('button', { type: 'submit', class: 'btn btn-sm', text: 'Save' })));
    form.noValidate = true;
    form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    menu(anchor, [], () => false, form);
    input.focus();
  }

  function chip(d, f) {
    const v = d.props ? d.props[f.name] : null;
    const shown = showValue(f, v);
    const tint = PICK_TYPES.has(f.type) && shown ? colorOf(f, Array.isArray(v) ? v[0] : v) : null;
    const b = el('button', {
      type: 'button', class: 'chip' + (shown ? '' : ' is-empty') + (tint ? ' is-tint' : '') + ' t-' + f.type,
      style: tint ? '--c:' + tint : null, 'data-tip': shown ? f.name : null,
      'aria-label': f.name + ': ' + (shown || 'empty') + '. Change', dataset: { key: 'prop:' + d.id + ':' + f.name }
    }, f.type === 'status' && shown ? el('span', { class: 'chip-dot' }) : null,
    f.type === 'checkbox' && shown ? icon('check') : null,
    el('span', { class: 'chip-text', text: shown || f.name }));
    b.addEventListener('click', (e) => { e.stopPropagation(); editProp(b, d, f.name); });
    return b;
  }

  /* ---------- Drawing ---------- */
  const SORTS = [['edited', 'Edited'], ['created', 'Created'], ['title', 'Title'], ['spend', 'Spend']];
  const sortLabel = () => { const p = propOf(view.sort); return p || (SORTS.find(([k]) => k === view.sort) || SORTS[0])[1]; };
  const groupLabel = () => (view.group === 'month' ? 'Month' : view.group === 'none' ? 'No groups' : propOf(view.group));
  const filterCount = () => Object.values(view.filters).reduce((n, a) => n + a.length, 0);

  function viewButton(label, tip, onclick, extra) {
    const b = el('button', { type: 'button', class: 'dr-view', 'data-tip': tip, 'aria-haspopup': 'menu', onclick: () => onclick(b) }, el('span', { text: label }), extra || null);
    return b;
  }

  function drawBar() {
    const n = filterCount();
    barEl.replaceChildren(
      viewButton(groupLabel(), 'Group by', groupMenu),
      viewButton(sortLabel(), 'Sort by', sortMenu, el('span', { class: 'dr-dir' + (view.dir === 'asc' ? ' is-asc' : ''), 'aria-hidden': 'true' }, icon('arrowDown'))),
      schema() ? viewButton('Filter', 'Show only some drafts', filterMenu, n ? el('span', { class: 'dr-n', text: String(n) }) : null) : null,
      schema() ? el('button', { type: 'button', class: 'dr-view dr-view-icon', 'data-tip': 'Properties on each row', 'aria-label': 'Properties on each row', 'aria-haspopup': 'menu', onclick: (e) => propsMenu(e.currentTarget) }, icon('sliders')) : null);
    const chips = [];
    for (const name of Object.keys(view.filters)) {
      const f = Object.assign({ name }, (schema() || {})[name]);
      for (const v of view.filters[name]) {
        chips.push(el('button', { type: 'button', class: 'chip is-tint is-filter', style: '--c:' + colorOf(f, v), 'aria-label': 'Stop filtering by ' + v, 'data-tip': 'Showing ' + name + ': ' + v + '. Click to clear', onclick: () => { toggleFilter(name, v); render(); } },
          el('span', { class: 'chip-text', text: v }), icon('close')));
      }
    }
    chipsEl.replaceChildren(...chips);
    chipsEl.hidden = !chips.length;
  }

  function groupMenu(anchor) {
    const items = [{ type: 'head', label: 'Group by' }, { label: 'Month', value: 'month', checked: view.group === 'month' }];
    for (const f of fields((x) => x.type === 'status' || x.type === 'select')) items.push({ label: f.name, value: 'prop:' + f.name, checked: view.group === 'prop:' + f.name });
    items.push({ type: 'sep' }, { label: 'No groups', value: 'none', checked: view.group === 'none' });
    menu(anchor, items, (it) => { view.group = it.value; saveView(); render(); });
  }

  function sortMenu(anchor) {
    const note = (k) => (view.sort === k ? (view.dir === 'asc' ? 'ascending' : 'descending') : '');
    const items = [{ type: 'head', label: 'Sort by' }].concat(SORTS.map(([k, label]) => ({ label, value: k, checked: view.sort === k, note: note(k) })));
    const more = fields((x) => x.type !== 'multi_select' && x.type !== 'rich_text' && x.type !== 'url' && x.type !== 'email' && x.type !== 'phone_number');
    if (more.length) items.push({ type: 'sep' });
    for (const f of more) items.push({ label: f.name, value: 'prop:' + f.name, checked: view.sort === 'prop:' + f.name, note: note('prop:' + f.name) });
    menu(anchor, items, (it) => {
      // The same field again turns the order around.
      if (view.sort === it.value) view.dir = view.dir === 'asc' ? 'desc' : 'asc';
      else { view.sort = it.value; view.dir = it.value === 'title' || (propOf(it.value) && (schema()[propOf(it.value)] || {}).type !== 'date') ? 'asc' : 'desc'; }
      saveView();
      render();
    });
  }

  function toggleFilter(name, v) {
    const list = view.filters[name] || [];
    const k = list.indexOf(v);
    if (k < 0) list.push(v); else list.splice(k, 1);
    if (list.length) view.filters[name] = list; else delete view.filters[name];
    saveView();
  }

  function filterMenu(anchor) {
    const items = [];
    for (const f of fields((x) => PICK_TYPES.has(x.type))) {
      if (!(f.options || []).length) continue;
      if (items.length) items.push({ type: 'sep' });
      items.push({ type: 'head', label: f.name });
      for (const o of f.options) items.push({ label: o, value: o, prop: f.name, checked: (view.filters[f.name] || []).includes(o) });
    }
    if (!items.length) { toast('Nothing to filter by yet. Add a select or status property in Notion.'); return; }
    if (filterCount()) items.push({ type: 'sep' }, { label: 'Clear filters', value: null });
    menu(anchor, items, (it, btn) => {
      if (it.value === null) { view.filters = {}; saveView(); render(); return false; }
      toggleFilter(it.prop, it.value);
      btn.setAttribute('aria-checked', String((view.filters[it.prop] || []).includes(it.value)));
      render();
      return true;
    });
  }

  function propsMenu(anchor) {
    const all = fields();
    const on = new Set(shownProps().map((f) => f.name));
    menu(anchor, [{ type: 'head', label: 'Properties on each row' }].concat(all.map((f) => ({ label: f.name, value: f.name, checked: on.has(f.name) }))), (it, btn) => {
      if (on.has(it.value)) on.delete(it.value); else on.add(it.value);
      view.props = all.filter((f) => on.has(f.name)).map((f) => f.name);
      btn.setAttribute('aria-checked', String(on.has(it.value)));
      saveView();
      render();
      return true;
    });
  }

  function rowOf(d, cur, props) {
    const title = Store.displayTitle(d);
    const linked = !!(d.url && /^https?:\/\//.test(d.url));
    const fetched = !(d.notionId && !d.contentFetchedAt && !d.text);
    const words = Store.countWords(d.text);
    const is = cur && d.id === cur.id;
    const open = el('button', { type: 'button', class: 'dr-open', dataset: { key: 'open:' + d.id }, 'aria-current': is ? 'true' : null,
      title: 'Edited ' + relTime(d.updatedAt) + (fetched ? ', ' + words + ' ' + plural(words, 'word', 'words') + ', ' + money(words * 10) : '') },
    el('span', { class: 'dr-title', text: title }));
    open.addEventListener('click', (e) => { e.stopPropagation(); openDraft(d.id); });
    const li = el('li', { class: 'dr-row' + (is ? ' is-current' : '') },
      el('div', { class: 'dr-line' }, open,
        linked ? el('a', { class: 'dr-ext', href: d.url, target: '_blank', rel: 'noopener', 'aria-label': 'Open “' + title + '” in Notion', 'data-tip': 'Open in Notion', onclick: (e) => e.stopPropagation() }, icon('external')) : null,
        el('button', { type: 'button', class: 'dr-del', 'aria-label': 'Delete “' + title + '”', 'data-tip': 'Delete', dataset: { key: 'del:' + d.id }, onclick: (e) => { e.stopPropagation(); deleteDraft(d.id); } }, icon('trash'))),
      props.length && !d.localOnly && d.props ? el('div', { class: 'dr-props' }, props.map((f) => chip(d, f))) : null);
    li.addEventListener('click', () => openDraft(d.id));
    return li;
  }

  function render() {
    if (!listEl) return;
    tidyView();
    const cur = app().state.draft;
    const c = Sync.config();
    nameEl.textContent = c ? plainName(c.dbTitle) || 'Drafts' : 'Drafts';
    drawBar();
    const focusKey = document.activeElement && listEl.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    const top = listEl.scrollTop;
    const props = shownProps();
    const list = Store.listDrafts().filter(passes).sort(compare);
    const out = [];
    for (const g of groupsOf(list)) {
      const folded = view.folded.includes(view.group + '/' + g.key);
      if (g.label) {
        const h = el('button', { type: 'button', class: 'dr-group' + (folded ? ' is-folded' : ''), 'aria-expanded': String(!folded), dataset: { key: 'group:' + g.key } },
          g.color ? el('span', { class: 'chip-dot', style: 'background:' + g.color }) : null, el('span', { text: g.label }), icon('chevDown'));
        h.addEventListener('click', () => {
          const k = view.group + '/' + g.key;
          const i = view.folded.indexOf(k);
          if (i < 0) view.folded.push(k); else view.folded.splice(i, 1);
          saveView();
          render();
        });
        out.push(el('li', { class: 'dr-group-row' }, h));
      }
      if (!folded) for (const d of g.rows) out.push(rowOf(d, cur, props));
    }
    if (!list.length) {
      const filtered = !!query || filterCount() > 0;
      out.push(el('li', { class: 'dr-empty' }, filtered ? 'No draft matches. ' : 'No drafts yet. ',
        filtered ? el('button', { type: 'button', class: 'link', text: 'Show all', onclick: () => { query = ''; findEl.value = ''; view.filters = {}; saveView(); render(); } })
          : el('button', { type: 'button', class: 'link', text: 'Start one', onclick: newDraft })));
    }
    listEl.replaceChildren(...out);
    listEl.scrollTop = top;
    if (focusKey) { const again = listEl.querySelector('[data-key="' + CSS.escape(focusKey) + '"]'); if (again) again.focus({ preventScroll: true }); }
    footEl.hidden = !!c;
    renderSync();
  }

  function renderSync() {
    if (!syncBtn) return;
    const on = Sync.isConnected();
    syncBtn.hidden = !on;
    if (!on) return;
    const s = Sync.status();
    const st = Date.now() < spinUntil ? 'syncing' : s.state || 'synced';
    syncBtn.dataset.state = st;
    const when = s.at ? ' ' + relTime(s.at) : '';
    const tip = st === 'synced' ? 'Synced' + when + '. Click to sync now'
      : st === 'syncing' ? 'Syncing with Notion'
        : (SYNC_TEXT[st] || 'Notion') + (s.message && st === 'error' ? ': ' + s.message : '') + (s.at ? '. Last synced' + when : '') + '. Click to try again';
    syncBtn.dataset.tip = tip;
    syncBtn.setAttribute('aria-label', tip);
  }

  function syncNow() {
    spinUntil = Date.now() + 900;
    renderSync();
    setTimeout(renderSync, 950);
    if (Sync.syncNow) Sync.syncNow();
  }

  /* ---------- Actions ---------- */
  function openDraft(id) {
    if (sheet.open) dismiss(sheet);
    else if (state === 'peek' || state === 'held') setState(null);
    const cur = app().state.draft;
    if (!cur || cur.id !== id) app().openDraft(id);
    if (state !== 'pinned') TDW.Editor.focus();
  }

  function newDraft() {
    if (sheet.open) dismiss(sheet);
    else if (state === 'peek' || state === 'held') setState(null);
    app().newDraft('');
    app().setMode('write');
    TDW.Editor.focus();
  }

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
    toast('Deleted “' + Store.displayTitle(copy) + '”', {
      label: 'Undo',
      run: () => {
        Store.saveDraft(copy);
        Sync.restore(copy);
        if (wasOpen) app().openDraft(copy.id);
        render();
      }
    });
  }

  /* ---------- Showing and hiding ---------- */
  const canPin = () => window.innerWidth >= PIN_MIN;
  const narrow = () => TDW.UI.isNarrow();
  const remember = (on) => { try { localStorage.setItem(PIN_KEY, on ? '1' : ''); } catch (_) { /* private mode */ } };

  function setState(next) {
    clearTimeout(enterTimer);
    clearTimeout(leaveTimer);
    if (next === state) return;
    const was = state;
    state = next;
    if (next) { if (body.parentNode !== side) side.append(body); app().saveNow(); render(); }
    root.dataset.drafts = next || '';
    side.inert = !next;
    pinBtn.setAttribute('aria-pressed', String(next === 'pinned' || next === 'held'));
    pinBtn.dataset.tip = next === 'pinned' || next === 'held' ? 'Close the sidebar (' + keys('⌘O') + ')' : 'Keep the sidebar open (' + keys('⌘O') + ')';
    $('spine-title').setAttribute('aria-expanded', String(!!next));
    // The page slides over when the sidebar docks; the margin's fixed parts follow it.
    if ((was === 'pinned') !== (next === 'pinned') && TDW.Margin) {
      const t0 = performance.now();
      root.classList.add('drafts-moving');
      const follow = (now) => { TDW.Margin.measure(); if (now - t0 < 560) requestAnimationFrame(follow); else { root.classList.remove('drafts-moving'); TDW.Margin.onLayout(); } };
      requestAnimationFrame(follow);
    }
    if (!next && side.contains(document.activeElement)) TDW.Editor.focus();
  }

  function open(o) {
    if (narrow()) {
      if (body.parentNode !== sheet) sheet.append(body);
      app().saveNow();
      query = ''; findEl.value = '';
      render();
      present(sheet, { onDismiss: () => TDW.Editor.focus() });
      sheet.focus();
      return;
    }
    setState(canPin() ? 'pinned' : 'held');
    remember(true);
    if (!o || o.focus !== false) findEl.focus({ preventScroll: true });
  }

  function close() {
    if (sheet.open) { dismiss(sheet); return; }
    if (state === 'pinned' || state === 'held') remember(false);
    setState(null);
  }

  const isOpen = () => !!state || (!!sheet && sheet.open);
  const toggle = () => { if (sheet.open || state === 'pinned' || state === 'held') close(); else open(); };

  function build() {
    side = $('drafts');
    sheet = $('drafts-dialog');
    findEl = el('input', { type: 'search', class: 'dr-find-input', placeholder: 'Find a draft', 'aria-label': 'Find a draft', autocomplete: 'off', spellcheck: 'false' });
    findEl.addEventListener('input', () => { query = findEl.value.trim().toLowerCase(); render(); });
    findEl.addEventListener('keydown', (e) => {
      const f = listEl.querySelector('.dr-open');
      if (e.key === 'ArrowDown' && f) { e.preventDefault(); f.focus(); }
      if (e.key === 'Enter' && f) { e.preventDefault(); f.click(); }
    });
    listEl = el('ul', { class: 'dr-list', 'aria-label': 'Drafts' });
    listEl.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const rows = [...listEl.querySelectorAll('.dr-open, .dr-group')];
      const i = rows.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      if (e.key === 'ArrowUp' && i === 0) { findEl.focus(); return; }
      rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))].focus();
    });
    nameEl = el('h2', { id: 'drafts-title', class: 'dr-name', text: 'Drafts' });
    syncBtn = el('button', { type: 'button', class: 'dr-tool dr-sync tip-end', hidden: true, onclick: syncNow }, icon('sync'));
    syncBtn.addEventListener('pointerenter', renderSync);
    pinBtn = el('button', { type: 'button', class: 'dr-tool dr-pin tip-end', 'aria-pressed': 'false', 'aria-label': 'Keep the sidebar open', onclick: toggle }, icon('sidebar'));
    barEl = el('div', { class: 'dr-bar', role: 'group', 'aria-label': 'View' });
    chipsEl = el('div', { class: 'dr-filters', hidden: true });
    footEl = el('p', { class: 'dr-foot' }, 'Drafts live in this browser. ',
      el('button', { type: 'button', class: 'link', text: 'Connect Notion', onclick: () => { if (state !== 'pinned') close(); TDW.Dialogs.openSettings('notion'); } }));
    body = el('div', { class: 'dr' },
      el('div', { class: 'dr-head sheet-drag' }, nameEl, syncBtn,
        el('button', { type: 'button', class: 'dr-tool tip-end', 'aria-label': 'New draft', 'data-tip': 'New draft (' + keys('⌘⌥N') + ')', onclick: newDraft }, icon('plus')), pinBtn),
      el('div', { class: 'dr-find' }, icon('search'), findEl),
      barEl, chipsEl, listEl, footEl);
    sheet.append(el('div', { class: 'grabber', 'aria-hidden': 'true' }));
    side.append(body);
    side.inert = true;
  }

  function init() {
    view = loadView();
    build();
    // Rest on the left edge and the sidebar comes over; move away and it goes.
    const edge = $('drafts-edge');
    edge.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'touch' || state || narrow()) return;
      clearTimeout(enterTimer);
      enterTimer = setTimeout(() => setState('peek'), 70);
    });
    edge.addEventListener('pointerleave', () => clearTimeout(enterTimer));
    document.addEventListener('pointermove', (e) => {
      if (state !== 'peek') return;
      const r = side.getBoundingClientRect();
      const inside = e.clientX <= r.right + 20 && e.clientY >= r.top - 40;
      if (inside || TDW.UI.menuOpen() || (e.target.closest && e.target.closest('.menu'))) { clearTimeout(leaveTimer); leaveTimer = 0; return; }
      if (!leaveTimer) leaveTimer = setTimeout(() => { leaveTimer = 0; if (state === 'peek' && !TDW.UI.menuOpen()) setState(null); }, 260);
    }, { passive: true });
    document.addEventListener('pointerdown', (e) => {
      if (state !== 'held' && state !== 'peek') return;
      const t = e.target;
      if (t.closest && (t.closest('#drafts') || t.closest('.menu') || t.closest('#spine-title') || t.closest('.toast'))) return;
      setState(null);
    }, true);
    side.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || TDW.UI.menuOpen()) return;
      e.preventDefault();
      e.stopPropagation();
      if (query) { query = ''; findEl.value = ''; render(); return; }
      if (state === 'pinned') TDW.Editor.focus(); else close();
    });
    TDW.UI.narrowQuery.addEventListener('change', () => { if (narrow()) setState(null); else if (sheet.open) dismiss(sheet); });
    window.addEventListener('resize', () => {
      if (state === 'pinned' && !canPin()) setState('held');
      else if (state === 'held' && canPin()) setState('pinned');
    });
    let pinned = false;
    try { pinned = localStorage.getItem(PIN_KEY) === '1'; } catch (_) { pinned = false; }
    if (pinned && !narrow() && canPin()) setState('pinned');
  }

  TDW.Drafts = { init, open, close, toggle, isOpen, render, renderSync, newDraft, editProp };
})();
