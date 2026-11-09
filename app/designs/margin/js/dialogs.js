/* The drafts switcher (under the title in the spine) and Settings (a two-column sheet; a push
   list on a phone). */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { el, icon, toast, money, plural, relTime, segmented, toggle, menu, closeMenu, device, keys, present, dismiss } = TDW.UI;
  const { Store, Sync, Account } = TDW;
  const app = () => TDW.App;
  const $ = (id) => document.getElementById(id);

  const SOUNDS = [['typewriter', 'Typewriter'], ['soft', 'Soft keys'], ['off', 'Off']];
  const STEPS = [
    'Create an internal integration and copy its secret.',
    'In Notion, open the database, then ••• › Connections, and add it.',
    'Paste the secret and the database link here.'
  ];
  const CHIP_TYPES = new Set(['status', 'select', 'multi_select', 'date', 'checkbox', 'rich_text', 'number', 'url', 'email', 'phone_number']);
  const COLORS = { gray: '#787774', brown: '#9f6b53', orange: '#d9730d', yellow: '#cb912f', green: '#448361', blue: '#337ea9', purple: '#9065b0', pink: '#c14c8a', red: '#d44c47' };
  const KINDS = [['spelling', 'Spelling'], ['veryHard', 'Very hard sentences'], ['hard', 'Hard sentences'], ['complex', 'Wordy phrases'], ['passive', 'Passive voice'], ['adverb', 'Adverbs'], ['qualifier', 'Weakeners']];

  let draftsDlg = null, settingsDlg = null, listEl = null, findEl = null, curEl = null, footEl = null;
  let query = '';
  let aiStatus = { text: '', error: false };
  let accountRefresh = null;
  let section = 'writing';

  /* ---------- Drafts switcher ---------- */
  function buildDrafts() {
    findEl = el('input', { type: 'search', placeholder: 'Find a draft', 'aria-label': 'Find a draft', autocomplete: 'off', spellcheck: 'false' });
    findEl.addEventListener('input', () => { query = findEl.value.trim().toLowerCase(); renderList(); });
    findEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { const f = listEl.querySelector('.sw-open'); if (f) { e.preventDefault(); f.focus(); } }
      if (e.key === 'Enter') { const f = listEl.querySelector('.sw-open'); if (f) { e.preventDefault(); f.click(); } }
    });
    listEl = el('ul', { class: 'sw-list', 'aria-label': 'Drafts' });
    listEl.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      const rows = [...listEl.querySelectorAll('.sw-open')];
      const i = rows.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      if (e.key === 'ArrowUp' && i === 0) { findEl.focus(); return; }
      const n = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)))];
      n.focus();
    });
    curEl = el('section', { class: 'sw-current', 'aria-label': 'This draft' });
    footEl = el('p', { class: 'sw-foot' });
    draftsDlg.append(
      el('div', { class: 'grabber', 'aria-hidden': 'true' }),
      el('h2', { id: 'drafts-title', class: 'sr-only', text: 'Drafts' }),
      el('div', { class: 'sw-top sheet-drag' },
        el('div', { class: 'sw-find' }, icon('search'), findEl),
        el('button', { type: 'button', class: 'btn btn-sm', onclick: newDraft, title: 'New draft (' + keys('⌘⌥N') + ')' }, icon('plus'), 'New draft')),
      curEl, listEl, footEl);
  }

  const stageName = (c) => { if (!c || !c.schema) return null; const n = Object.keys(c.schema); return n.find((k) => c.schema[k].type === 'status') || n.find((k) => c.schema[k].type === 'select') || null; };

  function metaOf(d) {
    const fetched = !(d.notionId && !d.contentFetchedAt && !d.text);
    const words = Store.countWords(d.text);
    const out = [el('span', { text: relTime(d.updatedAt) })];
    if (fetched) out.push(el('span', { text: words + ' ' + plural(words, 'word', 'words') }), el('span', { text: money(words * 10) }));
    return out;
  }

  function renderDraftList() {
    if (!listEl) return;
    const cur = app().state.draft;
    const c = Sync.config();
    // This draft: its title (a link to Notion), its counts, and its Notion properties.
    if (cur) {
      const title = Store.displayTitle(cur);
      const linked = !!(cur.url && /^https?:\/\//.test(cur.url));
      curEl.replaceChildren(
        el('div', { class: 'sw-cur-title' }, linked ? el('a', { href: cur.url, target: '_blank', rel: 'noopener', title: 'Open in Notion', text: title }) : el('span', { text: title })),
        el('div', { class: 'sw-cur-meta' }, metaOf(cur), linked ? el('a', { href: cur.url, target: '_blank', rel: 'noopener', class: 'link', text: 'Open in Notion' }) : null),
        propGrid(cur));
    }
    const focusKey = document.activeElement && listEl.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    const sn = stageName(c);
    const rows = Store.listDrafts().filter((d) => !cur || d.id !== cur.id)
      .filter((d) => !query || Store.displayTitle(d).toLowerCase().includes(query))
      .map((d) => {
        const title = Store.displayTitle(d);
        const v = sn && d.props && d.props[sn];
        const color = v && c.schema[sn].colors ? c.schema[sn].colors[v] : null;
        const meta = metaOf(d);
        if (v && typeof v === 'string') meta.unshift(el('span', { class: 'stage' }, el('span', { class: 'stage-dot', style: 'background:' + (COLORS[color] || COLORS.gray) }), v));
        return el('li', { class: 'sw-row' },
          el('button', { type: 'button', class: 'sw-open', dataset: { key: 'open:' + d.id }, 'aria-label': 'Open “' + title + '”', onclick: () => { dismiss(draftsDlg); app().openDraft(d.id); } },
            el('span', { class: 'sw-title', text: title }), el('span', { class: 'sw-meta' }, meta)),
          el('button', { type: 'button', class: 'btn-icon sw-del', 'aria-label': 'Delete “' + title + '”', title: 'Delete', dataset: { key: 'del:' + d.id }, onclick: () => deleteDraft(d.id) }, icon('trash')));
      });
    if (!rows.length) rows.push(el('li', { class: 'sw-empty', text: query ? 'No draft has “' + query + '” in its title.' : 'No other drafts yet.' }));
    listEl.replaceChildren(...rows);
    if (focusKey) { const again = listEl.querySelector('[data-key="' + CSS.escape(focusKey) + '"]'); if (again) again.focus({ preventScroll: true }); }
    footEl.replaceChildren(c ? 'Synced with ' + c.dbTitle + '.' : 'Drafts live in this browser. ',
      c ? null : el('button', { type: 'button', class: 'link', text: 'Connect Notion', onclick: () => { dismiss(draftsDlg); openSettings('notion'); } }));
  }
  const renderList = renderDraftList;

  /* ---------- Notion properties of the open draft ---------- */
  function propGrid(d) {
    const c = Sync.config();
    if (!c || d.localOnly || !c.schema) return null;
    const rank = (t) => ['status', 'select', 'multi_select', 'date'].indexOf(t) + 1 || 9;
    const names = Object.keys(c.schema).filter((n) => n !== c.titleProp && CHIP_TYPES.has(c.schema[n].type))
      .sort((x, y) => rank(c.schema[x].type) - rank(c.schema[y].type));
    if (!names.length) return null;
    return el('div', { class: 'props' }, names.flatMap((n) => [el('span', { class: 'prop-name', text: n }), propVal(d, n, c.schema[n])]));
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

  function propVal(d, name, s) {
    const v = d.props[name];
    const shown = showValue(s, v);
    const color = s.colors && typeof v === 'string' ? s.colors[v] : null;
    const b = el('button', { type: 'button', class: 'prop-val' + (shown ? '' : ' is-empty'), 'aria-label': name + ': ' + (shown || 'empty'), dataset: { key: 'prop:' + d.id + ':' + name } },
      color ? el('span', { class: 'prop-dot', style: 'background:' + (COLORS[color] || COLORS.gray) }) : null, shown || 'Empty');
    const set = (value) => { app().setProp(d, name, value); renderDraftList(); };
    b.addEventListener('click', () => {
      if (s.type === 'checkbox') { set(!v); return; }
      if (s.type === 'status' || s.type === 'select') {
        const items = (s.options || []).map((o) => ({ label: o, value: o, checked: o === v }));
        if (s.type === 'select' && v) items.push({ type: 'sep' }, { label: 'Clear', value: null });
        menu(b, items, (it) => set(it.value));
        return;
      }
      if (s.type === 'multi_select') {
        const chosen = new Set(Array.isArray(v) ? v : []);
        menu(b, (s.options || []).map((o) => ({ label: o, value: o, checked: chosen.has(o) })), (it, btn) => {
          if (chosen.has(it.value)) chosen.delete(it.value); else chosen.add(it.value);
          btn.setAttribute('aria-checked', String(chosen.has(it.value)));
          app().setProp(d, name, [...chosen]);
          return true;
        }, null, renderDraftList);
        return;
      }
      openFieldMenu(b, d, name, s, v);
    });
    return b;
  }

  function openFieldMenu(chip, d, name, s, v) {
    if (s.type === 'date') {
      const cal = TDW.UI.calendar({ value: v ? String(v).slice(0, 10) : '', onPick: (iso) => { app().setProp(d, name, iso || null); closeMenu(); renderDraftList(); } });
      menu(chip, [], () => false, cal);
      cal.focusDay();
      return;
    }
    const type = { number: 'number', url: 'url', email: 'email', phone_number: 'tel' }[s.type] || 'text';
    const input = el('input', { type, class: 'menu-input', 'aria-label': name, value: v == null ? '' : String(v) });
    const save = () => {
      const raw = input.value.trim();
      app().setProp(d, name, raw === '' ? null : s.type === 'number' ? Number(raw) : raw);
      closeMenu();
      renderDraftList();
    };
    const form = el('form', { class: 'menu-form' }, el('label', { class: 'menu-form-label', text: name }), input,
      el('div', { class: 'row-end' },
        v != null && v !== '' ? el('button', { type: 'button', class: 'btn-quiet btn-sm', text: 'Clear', onclick: () => { input.value = ''; save(); } }) : null,
        el('button', { type: 'submit', class: 'btn btn-sm', text: 'Save' })));
    form.noValidate = true;
    form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
    menu(chip, [], () => false, form);
    input.focus();
  }

  function newDraft() {
    if (draftsDlg.open) dismiss(draftsDlg);
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
    renderDraftList();
    toast('Deleted “' + Store.displayTitle(copy) + '”', {
      label: 'Undo',
      run: () => {
        Store.saveDraft(copy);
        Sync.restore(copy);
        if (wasOpen) app().openDraft(copy.id);
        if (draftsDlg.open) renderDraftList();
      }
    });
  }

  function openDrafts() {
    app().saveNow();
    query = '';
    findEl.value = '';
    renderDraftList();
    present(draftsDlg, { anchor: $('spine-title'), onDismiss: () => TDW.Editor.focus() });
    if (!TDW.UI.isNarrow()) findEl.focus({ preventScroll: true });
    else draftsDlg.focus();
  }

  /* ---------- Settings ---------- */
  const SECTIONS = [
    ['writing', 'Writing', 'pencil'], ['look', 'Look', 'contrast'], ['sound', 'Sound', 'sound'], ['budget', 'Budget', 'dollar'],
    ['notion', 'Notion', 'sync'], ['ai', 'AI help', 'spark'], ['account', 'Account', 'user']
  ];
  const update = (patch) => app().updateSettings(patch);
  const rid = () => 'f-' + Math.random().toString(36).slice(2, 8);

  function row(label, control, hint, stack) {
    const id = control && control.id ? control.id : null;
    return el('div', { class: 'set-row' + (stack ? ' is-stack' : '') },
      el(id ? 'label' : 'div', { class: 'set-label', for: id }, el('span', { text: label }), hint ? el('span', { class: 'hint', text: hint }) : null),
      control);
  }
  function switchRow(label, checked, onChange, hint) {
    const sw = toggle({ checked, onChange, id: rid() });
    return row(label, sw, hint);
  }
  const group = (title, ...rows) => [title ? el('h4', { class: 'set-group-title', text: title }) : null, el('div', { class: 'set-group' }, rows.flat().filter(Boolean))];

  function writingSection(s) {
    const font = (value, name, desc, sample) => el('label', { class: 'font-card' },
      el('input', { type: 'radio', name: 'page-font', value, class: 'sr-only', checked: app().fontOf(s) === value, onchange: () => update({ pageFont: value }) }),
      el('span', { class: 'font-sample', style: 'font-family:' + sample, text: 'Ten dollar words' }),
      el('span', { class: 'font-name', text: name }), el('span', { class: 'font-desc', text: desc }));
    const size = el('input', { type: 'range', id: rid(), min: '-2', max: '4', step: '1', value: String(s.textSize || 0), 'aria-label': 'Text size', oninput: () => update({ textSize: Number(size.value) }) });
    const kinds = KINDS.map(([k, label]) => switchRow(label, s.highlights[k] !== false, (on) => { app().state.settings.highlights[k] = on; update({ highlights: app().state.settings.highlights }); }));
    return [
      ...group('The page',
        el('div', { class: 'set-row is-stack' }, el('div', { class: 'fonts', role: 'radiogroup', 'aria-label': 'Writing font' },
          font('serif', 'Source Serif', 'A book face for long reading.', 'var(--font-serif)'),
          font('typewriter', 'Typewriter', 'Courier Prime, like the old desk.', 'var(--font-type)'))),
        row('Text size', el('div', { class: 'range-row', style: 'width:180px' }, size)),
        switchRow("Keep the line you're typing in the middle", !!s.typewriterScroll, (on) => update({ typewriterScroll: on }), 'While you write, not while you review'),
        row('New drafts use', segmented({ label: 'New drafts use', value: TDW.Formats.get(s.defaultFormat).key, options: TDW.Formats.LIST.map((f) => ({ value: f.key, label: f.label })), onChange: (v) => update({ defaultFormat: v }) }), null, true)),
      ...group('Review',
        switchRow('Mark fixes when reviewing', s.fixHighlights !== false, (on) => update({ fixHighlights: on }), 'Off: the review shows the grade and the spend, and no pencil marks.'),
        s.fixHighlights !== false ? kinds : null),
      ...group('No backspace',
        switchRow('Turn it on when the stage says “no backspace”', !!s.noBackspace, (on) => update({ noBackspace: on }), 'The command palette can still turn it on or off for any draft.')),
      ...group('Your dictionary', el('div', { class: 'set-row is-stack' }, dictionaryField())),
      el('div', { class: 'set-actions' }, el('button', { type: 'button', class: 'btn-outline btn-sm', onclick: () => { dismiss(settingsDlg); setTimeout(() => TDW.Desk.toggleSheet(), 160); } }, icon('keyboard'), device.phone ? 'Typing shortcuts' : 'Keyboard shortcuts'))
    ];
  }

  function dictionaryField() {
    const box = el('div', { class: 'dict' });
    const render = () => {
      const words = app().state.settings.dictionary;
      box.replaceChildren(...(words.length
        ? words.map((w) => el('span', { class: 'dict-chip' }, w, el('button', { type: 'button', class: 'dict-x', 'aria-label': 'Remove ' + w, onclick: () => { app().removeWord(w); render(); } }, icon('close'))))
        : [el('p', { class: 'hint', text: 'Words you add from a spelling note show up here.' })]));
    };
    render();
    return box;
  }

  function lookSection(s) {
    return group(null,
      row('Theme', segmented({ label: 'Theme', value: app().themeSetting(s), options: [{ value: 'auto', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], onChange: (v) => update({ theme: v }) }),
        'System follows your device: light by day, graphite at night.'));
  }

  function soundSection(s) {
    const vol = el('input', { type: 'range', id: rid(), min: '0', max: '1', step: '0.05', value: String(s.volume), 'aria-label': 'Volume',
      oninput: () => TDW.Sound.setVolume(Number(vol.value)), onchange: () => update({ volume: Number(vol.value) }) });
    const test = () => { TDW.Sound.unlock(); ['key', 'key', 'space', 'key', 'enter'].forEach((k, i) => setTimeout(() => TDW.Sound.play(k), i * 90)); };
    return [...group(null,
      row('Typing sound', segmented({ label: 'Typing sound', value: s.sound, options: SOUNDS.map(([value, label]) => ({ value, label })), onChange: (v) => { update({ sound: v }); if (v !== 'off') test(); } })),
      row('Volume', el('div', { class: 'range-row', style: 'width:220px' }, vol, el('button', { type: 'button', class: 'btn-outline btn-sm', text: 'Test', onclick: test })))),
    device.phone && device.apple ? el('p', { class: 'set-note', text: 'Silent mode on your iPhone mutes these sounds.' }) : null];
  }

  function budgetSection(s) {
    const input = el('input', { type: 'number', id: rid(), min: '10', step: '10', inputmode: 'numeric', value: String(s.defaultBudget), 'aria-label': 'Default budget',
      onchange: () => { const n = Math.round(Number(input.value) / 10) * 10; if (n >= 10) update({ defaultBudget: n }); input.value = String(app().state.settings.defaultBudget); } });
    return [...group(null, row('Budget for new Basic drafts', el('span', { class: 'money-input', style: 'width:130px' }, el('span', { text: '$' }), input), 'LinkedIn starts at $2,000, X at $500, Substack at $8,000.')),
      el('p', { class: 'set-note', text: 'Each draft keeps its own budget: click the spend in the top right to change it.' })];
  }

  function notionSection() {
    const sec = el('div');
    const render = () => {
      const c = Sync.config();
      if (c) {
        const st = Sync.status();
        const off = el('button', { type: 'button', class: 'btn-outline btn-sm danger', text: 'Disconnect' });
        off.addEventListener('click', () => { Sync.disconnect(); render(); app().syncChanged(); });
        sec.replaceChildren(...group(null,
          row('Synced with ' + c.dbTitle, off, (st.at ? 'Last sync ' + relTime(st.at) + '. ' : '') + (Account.state().signedIn
            ? 'The secret is saved to your account, so your other devices have it too.'
            : 'The secret stays in this browser. Sign in under Account to have it everywhere.'))));
        return;
      }
      const secret = el('input', { type: 'password', id: rid(), autocomplete: 'off', spellcheck: 'false', placeholder: 'ntn_…' });
      const link = el('input', { type: 'text', id: rid(), autocomplete: 'off', spellcheck: 'false', inputmode: 'url', placeholder: 'https://www.notion.so/…' });
      const n = Store.listDrafts().filter((d) => !d.notionId && (d.text.trim() || d.title.trim())).length;
      let upload = true;
      const status = el('p', { class: 'set-status', 'aria-live': 'polite' });
      const go = el('button', { type: 'button', class: 'btn', text: 'Connect' });
      go.addEventListener('click', () => {
        go.disabled = true;
        status.classList.remove('is-error');
        status.textContent = 'Connecting…';
        Sync.connect(secret.value, link.value, { uploadLocal: n > 0 && upload }).then(() => { render(); app().syncChanged(); }, (e) => {
          status.textContent = (e && e.message) || 'Something went wrong.';
          status.classList.add('is-error');
          go.disabled = false;
        });
      });
      sec.replaceChildren(
        el('p', { class: 'set-note', style: 'margin-top:0' }, 'Keep every draft in a Notion database, both ways. ',
          el('a', { href: 'https://www.notion.so/profile/integrations', target: '_blank', rel: 'noopener', text: 'Create an integration' })),
        el('ol', { class: 'steps', style: 'margin-bottom:16px' }, STEPS.map((t) => el('li', { text: t }))),
        ...group(null,
          el('div', { class: 'set-row is-stack' }, el('div', { class: 'set-field' }, el('label', { for: secret.id, text: 'Integration secret' }), secret)),
          el('div', { class: 'set-row is-stack' }, el('div', { class: 'set-field' }, el('label', { for: link.id, text: 'Database link' }), link)),
          n > 0 ? switchRow('Also add my ' + n + ' ' + plural(n, 'draft', 'drafts') + ' from this device', true, (on) => { upload = on; }) : null),
        el('div', { class: 'set-actions' }, go, status));
    };
    render();
    return sec;
  }

  function aiSection() {
    const AI = TDW.AI;
    const keyInput = el('input', { type: 'password', id: rid(), autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Gemini API key' });
    const status = el('p', { class: 'set-status', 'aria-live': 'polite' });
    const modelSel = el('select', { id: rid(), 'aria-label': 'Model', style: 'width:220px' });
    const modelHint = el('span', { class: 'hint' });
    const modelRow = el('div', { class: 'set-row' }, el('label', { class: 'set-label', for: modelSel.id }, el('span', { text: 'Model' }), modelHint), modelSel);
    const removeBtn = el('button', { type: 'button', class: 'btn-quiet btn-sm danger', text: 'Remove key' });
    const testBtn = el('button', { type: 'button', class: 'btn', text: 'Save and test' });
    const short = (n) => String(n || '').replace(/^models\//, '');
    const showStatus = () => { status.textContent = aiStatus.text; status.classList.toggle('is-error', aiStatus.error); };
    const showKey = () => { const key = Store.getKey(); keyInput.value = ''; keyInput.placeholder = key ? 'Key saved ••••' + key.slice(-4) : 'Paste a Gemini API key'; };
    const fillModels = () => {
      const listing = AI.listing();
      const auto = Store.getModelMode() === 'auto';
      const current = Store.getModel();
      const best = AI.bestModel(listing) || current;
      const names = [...new Set([...AI.usableModels(listing), current].filter(Boolean))];
      modelSel.replaceChildren(el('option', { value: 'auto', text: 'Automatic' + (best ? ' (' + short(best) + ')' : '') }), ...names.map((n) => el('option', { value: n, text: short(n) })));
      modelSel.value = auto ? 'auto' : current;
      modelHint.textContent = auto ? 'Uses the newest Flash model and falls back when Google is busy.' : 'Pinned. The app still falls back if it fails.';
      const hasKey = !!Store.getKey();
      modelRow.hidden = !hasKey;
      removeBtn.hidden = !hasKey;
    };
    modelSel.addEventListener('change', () => {
      if (modelSel.value === 'auto') AI.useAuto(); else AI.useModel(modelSel.value);
      aiStatus = { text: 'Using ' + short(Store.getModel()) + '.', error: false };
      showStatus();
      fillModels();
    });
    testBtn.addEventListener('click', () => {
      testBtn.disabled = true;
      aiStatus = { text: 'Testing…', error: false };
      showStatus();
      AI.connect(keyInput.value).then((res) => {
        aiStatus = { text: 'Connected. Using ' + short(res.model) + (Account.state().signedIn ? '. The key is saved to your account.' : '. The key stays in this browser.'), error: false };
      }, (err) => {
        aiStatus = { text: err && err.detail ? 'Something went wrong: ' + err.detail : AI.errorMessage(err), error: true };
      }).then(() => { testBtn.disabled = false; showKey(); showStatus(); fillModels(); app().refreshPanel(); });
    });
    removeBtn.addEventListener('click', () => { AI.disconnect(); aiStatus = { text: '', error: false }; showKey(); showStatus(); fillModels(); app().refreshPanel(); });
    if (!aiStatus.text && Store.getKey() && Store.getModel()) aiStatus = { text: 'Connected. Using ' + short(Store.getModel()) + '.', error: false };
    showKey(); showStatus(); fillModels();
    return [
      el('p', { class: 'set-note', style: 'margin-top:0' },
        Account.state().signedIn ? 'Paste a Gemini API key once. Only Google uses it; your account keeps an encrypted copy for your other devices. ' : 'Paste a Gemini API key once. It stays in this browser and is only sent to Google. ',
        el('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener', text: 'Get a free key' })),
      ...group(null, el('div', { class: 'set-row is-stack' }, el('div', { class: 'key-row' }, keyInput, testBtn), status), modelRow),
      el('div', { class: 'set-actions' }, removeBtn),
      el('p', { class: 'set-note', style: 'margin-top:12px', text: "On Google's free tier, Google may use what you send to improve its products. Keep private client work out, or use a paid key." })
    ];
  }

  function accountSection() {
    const sec = el('div', { id: 'set-account' });
    const status = el('p', { class: 'set-status', 'aria-live': 'polite' });
    let mode = 'in', open = null, busy = false;
    const say = (text, error) => { status.textContent = text || ''; status.classList.toggle('is-error', !!error); };
    const input = (type, id, autocomplete, extra) => el('input', Object.assign({ type, id, name: id, autocomplete, spellcheck: 'false', autocapitalize: 'off' }, extra || {}));
    const field = (label, inp, hint) => el('div', { class: 'set-field' }, el('label', { for: inp.id, text: label }), inp, hint ? el('p', { class: 'hint', text: hint }) : null);
    async function run(btn, label, fn) {
      if (busy) return;
      busy = true; btn.disabled = true; say(label);
      try { await fn(); say(''); } catch (e) { say((e && e.message) || 'Something went wrong.', true); } finally { busy = false; btn.disabled = false; }
    }
    function syncLine() {
      const st = Account.state();
      if (st.status === 'syncing') return 'Saving…';
      if (st.status === 'offline') return "You're offline. Changes wait until you're back.";
      if (st.status === 'error') return st.message;
      return st.at ? 'Last synced ' + relTime(st.at) + '.' : '';
    }
    function signedOutView() {
      const email = input('email', 'acct-email', 'username', { inputmode: 'email', value: Account.lastEmail() });
      const pw = input('password', 'acct-password', mode === 'up' ? 'new-password' : 'current-password', { minlength: '8' });
      const go = el('button', { type: 'submit', class: 'btn', text: mode === 'up' ? 'Create account' : 'Sign in' });
      const form = el('form', { class: 'acct-form' }, field('Email', email),
        field('Password', pw, mode === 'up' ? "At least 8 characters. There's no way to reset it yet, so let your password manager save it." : ''), el('div', null, go));
      form.noValidate = true;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!email.value.trim()) { email.focus(); return; }
        if (!pw.value) { pw.focus(); return; }
        const up = mode === 'up';
        run(go, up ? 'Creating your account…' : 'Signing in…', async () => {
          if (up) await Account.signUp(email.value, pw.value); else await Account.signIn(email.value, pw.value);
          render(); refreshSettings(); TDW.App.syncChanged();
          toast(up ? 'Account created' : 'Signed in');
        });
      });
      const pick = segmented({ label: 'Account', value: mode, options: [{ value: 'in', label: 'Sign in' }, { value: 'up', label: 'Create account' }],
        onChange: (v) => { mode = v; say(''); render(); document.getElementById('acct-email').focus(); } });
      return [
        el('p', { class: 'set-note', style: 'margin-top:0', text: 'Sign in to have your Notion connection, Gemini key, settings and dictionary on every device you write on.' }),
        device.phone ? el('p', { class: 'set-note', style: 'margin-top:0', text: 'Easiest: connect Notion and Gemini on your computer, then sign in here.' }) : null,
        el('div', { style: 'margin-bottom:14px' }, pick), form];
    }
    function signedInView() {
      const st = Account.state();
      const out = el('button', { type: 'button', class: 'btn-outline btn-sm', text: 'Sign out' });
      out.addEventListener('click', () => run(out, 'Signing out…', async () => { await Account.signOut(); render(); refreshSettings(); TDW.App.syncChanged(); toast('Signed out'); }));
      const nodes = [
        ...group(null, row('Signed in as ' + st.email, out, 'Notion, Gemini, settings, dictionary and draft formats are saved to your account, encrypted with your password. ' + syncLine())),
        el('div', { class: 'set-actions' },
          el('button', { type: 'button', class: 'btn-quiet btn-sm', text: 'Change password', 'aria-expanded': String(open === 'password'), onclick: () => { open = open === 'password' ? null : 'password'; say(''); render(); } }),
          el('button', { type: 'button', class: 'btn-quiet btn-sm danger', text: 'Delete account', 'aria-expanded': String(open === 'delete'), onclick: () => { open = open === 'delete' ? null : 'delete'; say(''); render(); } })),
        el('p', { class: 'set-note', style: 'margin-top:8px', text: 'Signing out takes your keys and Notion connection out of this browser. Your drafts stay.' })
      ];
      const who = input('email', 'acct-user', 'username', { value: st.email, hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
      if (open === 'password') {
        const cur = input('password', 'acct-current', 'current-password');
        const next = input('password', 'acct-new', 'new-password', { minlength: '8' });
        const go = el('button', { type: 'submit', class: 'btn', text: 'Change password' });
        const form = el('form', { class: 'acct-form acct-sub' }, who, field('Current password', cur), field('New password', next, 'At least 8 characters. Your other devices will ask you to sign in again.'),
          el('div', { class: 'set-actions' }, go, el('button', { type: 'button', class: 'btn-quiet', text: 'Cancel', onclick: () => { open = null; say(''); render(); } })));
        form.noValidate = true;
        form.addEventListener('submit', (e) => { e.preventDefault(); run(go, 'Changing your password…', async () => { await Account.changePassword(cur.value, next.value); open = null; render(); toast('Password changed'); }); });
        nodes.push(form);
      } else if (open === 'delete') {
        const pw = input('password', 'acct-delete', 'current-password');
        const go = el('button', { type: 'submit', class: 'btn btn-danger', text: 'Delete my account' });
        const form = el('form', { class: 'acct-form acct-sub' }, who,
          el('p', { text: 'This deletes your account and everything it keeps. This browser keeps its keys and drafts, and Notion keeps your pages.' }), field('Password', pw),
          el('div', { class: 'set-actions' }, go, el('button', { type: 'button', class: 'btn-quiet', text: 'Cancel', onclick: () => { open = null; say(''); render(); } })));
        form.noValidate = true;
        form.addEventListener('submit', (e) => { e.preventDefault(); run(go, 'Deleting your account…', async () => { await Account.deleteAccount(pw.value); open = null; render(); toast('Account deleted'); }); });
        nodes.push(form);
      }
      return nodes;
    }
    let shown = null;
    function render() {
      shown = Account.state().signedIn;
      sec.replaceChildren(...(shown ? signedInView() : signedOutView()).filter(Boolean), status);
    }
    render();
    accountRefresh = () => {
      if (busy) return;
      if (Account.state().signedIn !== shown) render();
    };
    return sec;
  }

  function sectionNodes(k) {
    const s = app().state.settings;
    if (k === 'writing') return writingSection(s);
    if (k === 'look') return lookSection(s);
    if (k === 'sound') return soundSection(s);
    if (k === 'budget') return budgetSection(s);
    if (k === 'notion') return [notionSection()];
    if (k === 'ai') return aiSection();
    return [accountSection()];
  }

  function drawSettings(focusMain) {
    const nav = el('nav', { class: 'set-nav sheet-drag', 'aria-label': 'Settings sections' }, el('h2', { id: 'settings-title', text: 'Settings' }),
      SECTIONS.map(([k, label, ic]) => el('button', { type: 'button', class: 'set-nav-item', 'aria-current': String(k === section), dataset: { k },
        onclick: () => { section = k; drawSettings(true); settingsDlg.classList.add('is-pushed'); } }, icon(ic), el('span', { text: label }), el('span', { class: 'chev-r' }, icon('chevRight')))),
      el('p', { class: 'set-version', text: 'Version ' + app().APP_VERSION }));
    const label = SECTIONS.find((x) => x[0] === section)[1];
    const main = el('div', { class: 'set-main', role: 'region', 'aria-label': label },
      el('div', { class: 'set-main-head' },
        el('button', { type: 'button', class: 'btn-icon set-back', 'aria-label': 'All settings', onclick: () => { settingsDlg.classList.remove('is-pushed'); const b = settingsDlg.querySelector('.set-nav-item[aria-current="true"]'); if (b) b.focus(); } }, icon('chevLeft')),
        el('h3', { text: label, tabindex: '-1' })),
      sectionNodes(section).filter(Boolean));
    const close = el('button', { type: 'button', class: 'btn-icon set-close', 'aria-label': 'Close settings', onclick: () => dismiss(settingsDlg) }, icon('close'));
    settingsDlg.replaceChildren(el('div', { class: 'grabber', 'aria-hidden': 'true' }), nav, main, close);
    if (focusMain) main.querySelector('h3').focus({ preventScroll: true });
  }

  function refreshSettings() {
    if (!settingsDlg || !settingsDlg.open) return;
    const active = document.activeElement;
    if (active && settingsDlg.contains(active) && active.matches('input, textarea, select')) { if (accountRefresh) accountRefresh(); return; }
    const pushed = settingsDlg.classList.contains('is-pushed');
    drawSettings(false);
    settingsDlg.classList.toggle('is-pushed', pushed);
  }

  function openSettings(sec) {
    if (draftsDlg.open) dismiss(draftsDlg);
    section = SECTIONS.some((x) => x[0] === sec) ? sec : 'writing';
    drawSettings(false);
    settingsDlg.classList.toggle('is-pushed', !!sec && SECTIONS.some((x) => x[0] === sec));
    present(settingsDlg, { onDismiss: () => TDW.Editor.focus() });
    if (sec === 'ai') { const k = settingsDlg.querySelector('input[type="password"]'); if (k) k.focus({ preventScroll: true }); }
    else if (sec === 'account') { const f = document.getElementById('acct-email'); if (f) f.focus({ preventScroll: true }); }
    else { const b = settingsDlg.querySelector('.set-nav-item[aria-current="true"]'); if (b) b.focus({ preventScroll: true }); }
  }

  TDW.Dialogs = {
    init() {
      draftsDlg = $('drafts-dialog');
      settingsDlg = $('settings-dialog');
      buildDrafts();
      Account.onChange(() => { if (settingsDlg.open && accountRefresh) accountRefresh(); });
      document.addEventListener('keydown', (e) => {
        const mod = (e.metaKey || e.ctrlKey) && !e.shiftKey;
        if (mod && e.altKey && e.code === 'KeyN') { e.preventDefault(); newDraft(); }
        else if (mod && !e.altKey && e.key === ',') { e.preventDefault(); openSettings(); }
        else if (mod && !e.altKey && String(e.key).toLowerCase() === 'o') { e.preventDefault(); if (draftsDlg.open) dismiss(draftsDlg); else openDrafts(); }
      });
    },
    openDrafts, openSettings, refreshSettings, renderDraftList, newDraft,
    isDraftsOpen() { return !!draftsDlg && draftsDlg.open; }
  };
})();
