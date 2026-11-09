/* Settings: a preferences window with its sections on the left (Writing first, Account last)
   and the chosen section on the right. On a phone the sections are a list and each one is
   pushed. TDW.Dialogs.openDrafts shows the library (there's no Drafts drawer any more). */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const { el, icon, toast, relTime, plural, segmented, toggle, device, keys, isNarrow } = TDW.UI;
  const { Store, Sync, Account } = TDW;
  const app = () => TDW.App;

  const SECTIONS = [
    ['writing', 'Writing'],
    ['look', 'Theme & font'],
    ['sound', 'Sound'],
    ['ai', 'AI'],
    ['notion', 'Notion'],
    ['account', 'Account']
  ];
  const FONTS = [
    ['serif', 'Serif', 'Literata'],
    ['typewriter', 'Typewriter', 'Courier Prime'],
    ['sans', 'Sans', 'Instrument Sans'],
    ['mono', 'Mono', 'Atkinson Mono']
  ];
  const THEMES = [['light', 'Light'], ['dark', 'Dark'], ['system', 'Match system']];
  const SOUNDS = [['typewriter', 'Typewriter'], ['soft', 'Soft keys'], ['off', 'Off']];
  const STEPS = [
    'Create an internal integration and copy its secret.',
    'In Notion, open your posts database, then ••• and Connections, and add the integration.',
    'Paste the secret and the database link here.'
  ];

  let dlg = null;
  let section = 'writing';
  let navEl = null, bodyEl = null, titleEl = null;
  let aiStatus = { text: '', error: false };
  let accountRefresh = null;

  const update = (patch) => app().updateSettings(patch);
  const settings = () => app().state.settings;

  /* ---------- Building blocks: a row is a label (and a line of help) with its control ---------- */
  function row(label, control, help, opts) {
    const id = control && control.id;
    return el('div', { class: 'pref-row' + (opts && opts.stack ? ' is-stacked' : '') },
      el('div', { class: 'pref-text' },
        id ? el('label', { for: id, class: 'pref-label', text: label }) : el('span', { class: 'pref-label', text: label }),
        help ? el('p', { class: 'pref-help', text: help }) : null),
      el('div', { class: 'pref-control' }, control));
  }
  function switchRow(label, checked, onChange, help) {
    const id = 'sw-' + Math.random().toString(36).slice(2, 8);
    return row(label, toggle({ checked, onChange, id }), help);
  }
  const group = (title, ...kids) => el('section', { class: 'pref-group' }, title ? el('h3', { class: 'pref-group-title', text: title }) : null, ...kids);
  const status = () => el('p', { class: 'pref-status', 'aria-live': 'polite' });

  /* ---------- Writing ---------- */
  function dictionaryField() {
    const box = el('div', { class: 'dict' });
    const render = () => {
      const words = settings().dictionary;
      box.replaceChildren(...(words.length
        ? words.map((w) => el('span', { class: 'dict-chip' }, w,
          el('button', { type: 'button', class: 'dict-x', 'aria-label': 'Remove ' + w, onclick: () => { app().removeWord(w); render(); } }, icon('close'))))
        : [el('p', { class: 'pref-help', text: 'Words you add from a spelling fix show up here.' })]));
    };
    render();
    return box;
  }

  function writingSection() {
    const s = settings();
    const budget = el('input', {
      type: 'number', id: 'set-budget', min: '10', step: '10', inputmode: 'numeric', class: 'money-field', value: String(s.defaultBudget),
      onchange: () => {
        const n = Math.round(Number(budget.value) / 10) * 10;
        if (n >= 10) update({ defaultBudget: n });
        budget.value = String(settings().defaultBudget);
      }
    });
    const fmt = segmented({
      label: 'New drafts use', value: TDW.Formats.get(s.defaultFormat).key,
      options: TDW.Formats.LIST.map((f) => ({ value: f.key, label: f.label })),
      onChange: (v) => update({ defaultFormat: v })
    });
    const shortcuts = device.phone
      ? el('p', { class: 'pref-help', text: 'Formatting as you type: # and a space makes a heading, - a bullet, 1. a numbered list, [] a checkbox, > a quote, --- a divider (in X, a new post). Two stars around words make them bold, one makes them italic.' })
      : el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Show all shortcuts', onclick: () => TDW.Desk.toggleSheet() });
    return [
      group(null,
        switchRow('Keep the line you’re typing in the middle', !!s.typewriterScroll, (on) => update({ typewriterScroll: on }), 'In Focus, the page scrolls so your line stays at eye level.'),
        switchRow('Highlight fixes while reviewing', s.fixHighlights !== false, (on) => { update({ fixHighlights: on }); app().refresh(); }, 'Spelling, hard sentences, wordy phrases and the rest. The eye on each fix hides just that kind.'),
        switchRow('No backspace when the stage says so', !!s.noBackspace, (on) => update({ noBackspace: on }), 'A Notion stage named “no backspace” turns the pen off for that draft. The pen in the toolbar overrides it.')),
      group('New drafts',
        row('Format', fmt),
        row('Budget for Basic drafts', el('span', { class: 'money-input' }, el('span', { text: '$', 'aria-hidden': 'true' }), budget), 'LinkedIn, X and Substack drafts start with a budget that fits them.')),
      group('Dictionary', dictionaryField()),
      group(device.phone ? 'Typing shortcuts' : 'Keyboard', device.phone ? shortcuts : row('Every shortcut on one page', shortcuts, TDW.UI.ctrlKeys('Ctrl+?') + ' opens it from anywhere.'))
    ];
  }

  /* ---------- Theme & font ---------- */
  function lookSection() {
    const s = settings();
    const theme = segmented({ label: 'Theme', value: s.theme, options: THEMES.map(([v, l]) => ({ value: v, label: l })), onChange: (v) => update({ theme: v }) });
    const fonts = el('div', { class: 'font-picks', role: 'radiogroup', 'aria-label': 'Writing font' },
      FONTS.map(([v, name, face]) => el('label', { class: 'font-pick', dataset: { font: v } },
        el('input', { type: 'radio', name: 'font', value: v, class: 'sr-only', checked: s.font === v, onchange: () => update({ font: v }) }),
        el('span', { class: 'font-sample', 'aria-hidden': 'true', text: 'Every word' }),
        el('span', { class: 'font-name', text: name }),
        el('span', { class: 'font-face', text: face }))));
    const size = el('input', { type: 'range', id: 'set-size', min: '-2', max: '4', step: '1', value: String(s.textSize), oninput: () => update({ textSize: Number(size.value) }) });
    return [
      group(null, row('Theme', theme, 'Match system follows your device into dark mode and back.')),
      group('Writing font', fonts),
      group(null, row('Text size', el('div', { class: 'range-row' }, el('span', { class: 'range-a is-small', text: 'A', 'aria-hidden': 'true' }), size, el('span', { class: 'range-a', text: 'A', 'aria-hidden': 'true' }))))
    ];
  }

  /* ---------- Sound ---------- */
  function soundSection() {
    const s = settings();
    const test = () => { TDW.Sound.unlock(); ['key', 'key', 'space', 'key', 'enter'].forEach((k, i) => setTimeout(() => TDW.Sound.play(k), i * 90)); };
    const vol = el('input', { type: 'range', id: 'set-volume', min: '0', max: '1', step: '0.05', value: String(s.volume), oninput: () => TDW.Sound.setVolume(Number(vol.value)), onchange: () => update({ volume: Number(vol.value) }) });
    return [group(null,
      row('Typing sound', segmented({ label: 'Typing sound', value: s.sound, options: SOUNDS.map(([v, l]) => ({ value: v, label: l })), onChange: (v) => { update({ sound: v }); if (v !== 'off') test(); } })),
      row('Volume', el('div', { class: 'range-row' }, vol, el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Test', onclick: test }))),
      device.phone && device.apple ? el('p', { class: 'pref-help', text: 'Silent mode on your iPhone mutes these sounds.' }) : null)];
  }

  /* ---------- AI ---------- */
  function aiSection() {
    const AI = TDW.AI;
    const keyInput = el('input', { type: 'password', id: 'set-key', class: 'field', autocomplete: 'off', spellcheck: 'false' });
    const st = status();
    const modelSel = el('select', { id: 'set-model', class: 'field' });
    const modelHint = el('p', { class: 'pref-help' });
    const modelRow = row('Model', modelSel);
    const removeBtn = el('button', { type: 'button', class: 'btn btn-quiet btn-sm is-danger', text: 'Remove key' });
    const testBtn = el('button', { type: 'button', class: 'btn btn-sm', text: 'Save and test' });
    const short = (n) => String(n || '').replace(/^models\//, '');
    const showStatus = () => { st.textContent = aiStatus.text; st.classList.toggle('is-error', aiStatus.error); };
    const showKey = () => { const key = Store.getKey(); keyInput.value = ''; keyInput.placeholder = key ? 'Saved key ending ' + key.slice(-4) : 'Paste a Gemini API key'; };
    const fillModels = () => {
      const listing = AI.listing();
      const auto = Store.getModelMode() === 'auto';
      const current = Store.getModel();
      const best = AI.bestModel(listing) || current;
      const names = [...new Set([...AI.usableModels(listing), current].filter(Boolean))];
      modelSel.replaceChildren(el('option', { value: 'auto', text: 'Automatic' + (best ? ' (' + short(best) + ')' : '') }), ...names.map((n) => el('option', { value: n, text: short(n) })));
      modelSel.value = auto ? 'auto' : current;
      modelHint.textContent = auto ? 'Recommended. Uses the newest Flash model, checks for a newer one each week, and falls back when Google is busy.' : 'Pinned. If it fails, the app still falls back to other models for that request.';
      const hasKey = !!Store.getKey();
      modelRow.hidden = !hasKey;
      modelHint.hidden = !hasKey;
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
      el('p', { class: 'pref-lead' },
        Account.state().signedIn ? 'Paste a Gemini API key once. Only Google gets to use it; your account keeps an encrypted copy for your other devices. ' : 'Paste a Gemini API key once. It stays in this browser and is only sent to Google. ',
        el('a', { href: 'https://aistudio.google.com/apikey', target: '_blank', rel: 'noopener', text: 'Get a free key at Google AI Studio' })),
      group(null,
        row('API key', el('div', { class: 'key-row' }, keyInput, testBtn), null, { stack: true }),
        st, modelRow, modelHint, el('div', null, removeBtn)),
      el('p', { class: 'pref-help', text: 'On Google’s free tier, Google may use what you send to improve its products. Keep private client work out, or use a paid key.' })
    ];
  }

  /* ---------- Notion ---------- */
  function notionSection() {
    const sec = el('div', { class: 'pref-stack' });
    const render = () => {
      const c = Sync.config();
      if (c) {
        const st = Sync.status();
        const off = el('button', { type: 'button', class: 'btn btn-outline btn-sm is-danger', text: 'Disconnect' });
        off.addEventListener('click', () => { Sync.disconnect(); render(); app().syncChanged(); });
        sec.replaceChildren(group(null,
          row('Database', el('span', { class: 'pref-value', text: c.dbTitle })),
          row('Last sync', el('span', { class: 'pref-value', text: st.at ? relTime(st.at) : 'Not yet' })),
          el('p', { class: 'pref-help', text: Account.state().signedIn ? 'The secret is saved to your account, so your other devices have it too.' : 'The secret stays in this browser. Sign in under Account to have it on your other devices.' }),
          el('div', null, off)));
        return;
      }
      const secret = el('input', { type: 'password', id: 'set-notion-secret', class: 'field', autocomplete: 'off', spellcheck: 'false', placeholder: 'ntn_…' });
      const link = el('input', { type: 'text', id: 'set-notion-link', class: 'field', autocomplete: 'off', spellcheck: 'false', inputmode: 'url', placeholder: 'https://www.notion.so/…' });
      const n = Store.listDrafts().filter((d) => !d.notionId && (d.text.trim() || d.title.trim())).length;
      let upload = true;
      const st = status();
      const go = el('button', { type: 'button', class: 'btn', text: 'Connect' });
      go.addEventListener('click', () => {
        go.disabled = true;
        st.classList.remove('is-error');
        st.textContent = 'Connecting…';
        Sync.connect(secret.value, link.value, { uploadLocal: n > 0 && upload }).then(() => { render(); app().syncChanged(); }, (e) => {
          st.textContent = (e && e.message) || 'Something went wrong.';
          st.classList.add('is-error');
          go.disabled = false;
        });
      });
      sec.replaceChildren(
        el('p', { class: 'pref-lead' }, 'Keep every draft in a Notion database, both ways: text, title, stage and the rest. ',
          el('a', { href: 'https://www.notion.so/profile/integrations', target: '_blank', rel: 'noopener', text: 'Create an integration' })),
        el('ol', { class: 'steps' }, STEPS.map((t) => el('li', { text: t }))),
        group(null,
          row('Integration secret', secret, null, { stack: true }),
          row('Database link', link, null, { stack: true }),
          n > 0 ? switchRow('Also add my ' + n + ' ' + plural(n, 'draft', 'drafts') + ' from this device', true, (on) => { upload = on; }) : null,
          el('div', { class: 'row-start' }, go), st));
    };
    render();
    return [sec];
  }

  /* ---------- Account ---------- */
  function accountSection() {
    const sec = el('div', { class: 'pref-stack' });
    const st = status();
    let mode = 'in';
    let open = null;
    let busy = false;
    const say = (text, error) => { st.textContent = text || ''; st.classList.toggle('is-error', !!error); };
    const input = (type, id, autocomplete, extra) => el('input', Object.assign({ type, id, name: id, class: 'field', autocomplete, spellcheck: 'false', autocapitalize: 'off' }, extra || {}));
    const field = (label, inp, hint) => row(label, inp, hint, { stack: true });

    async function run(btn, label, fn) {
      if (busy) return;
      busy = true;
      btn.disabled = true;
      say(label);
      try { await fn(); say(''); } catch (e) { say((e && e.message) || 'Something went wrong.', true); } finally { busy = false; btn.disabled = false; }
    }
    function syncLine() {
      const s = Account.state();
      if (s.status === 'syncing') return 'Saving…';
      if (s.status === 'offline') return 'You’re offline. Changes wait until you’re back.';
      if (s.status === 'error') return s.message;
      return s.at ? 'Last synced ' + relTime(s.at).toLowerCase() + '.' : '';
    }
    function signedOut() {
      const email = input('email', 'acct-email', 'username', { inputmode: 'email', value: Account.lastEmail() });
      const pw = input('password', 'acct-password', mode === 'up' ? 'new-password' : 'current-password', { minlength: '8' });
      const go = el('button', { type: 'submit', class: 'btn', text: mode === 'up' ? 'Create account' : 'Sign in' });
      const form = el('form', { class: 'pref-form' }, field('Email', email),
        field('Password', pw, mode === 'up' ? 'At least 8 characters. There’s no way to reset it yet, so let your password manager save it.' : ''), el('div', null, go));
      form.noValidate = true;
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!email.value.trim()) { email.focus(); return; }
        if (!pw.value) { pw.focus(); return; }
        const up = mode === 'up';
        run(go, up ? 'Creating your account…' : 'Signing in…', async () => {
          if (up) await Account.signUp(email.value, pw.value); else await Account.signIn(email.value, pw.value);
          render(); refreshSettings(); app().syncChanged();
          toast(up ? 'Account created' : 'Signed in');
        });
      });
      const pick = segmented({ label: 'Account', value: mode, options: [{ value: 'in', label: 'Sign in' }, { value: 'up', label: 'Create account' }],
        onChange: (v) => { mode = v; say(''); render(); document.getElementById('acct-email').focus(); } });
      return [
        el('p', { class: 'pref-lead', text: 'Sign in to have your Notion connection, Gemini key, settings and dictionary on every device you write on. Everything is encrypted with your password before it leaves this browser.' }),
        device.phone ? el('p', { class: 'pref-help', text: 'Easiest: connect Notion and Gemini on your computer, then sign in here.' }) : null,
        pick, form
      ];
    }
    function signedIn() {
      const s = Account.state();
      const out = el('button', { type: 'button', class: 'btn btn-outline btn-sm', text: 'Sign out' });
      out.addEventListener('click', () => run(out, 'Signing out…', async () => { await Account.signOut(); render(); refreshSettings(); app().syncChanged(); toast('Signed out'); }));
      const nodes = [
        group(null,
          row('Signed in as', el('span', { class: 'pref-value', text: s.email })),
          el('p', { class: 'pref-help' }, 'Your Notion connection, Gemini key, settings, dictionary and draft formats are saved to your account, encrypted with your password. ', el('span', { class: 'acct-sync', text: syncLine() })),
          el('div', { class: 'row-start' }, out,
            el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: 'Change password', 'aria-expanded': String(open === 'password'), onclick: () => { open = open === 'password' ? null : 'password'; say(''); render(); } }),
            el('button', { type: 'button', class: 'btn btn-quiet btn-sm is-danger', text: 'Delete account', 'aria-expanded': String(open === 'delete'), onclick: () => { open = open === 'delete' ? null : 'delete'; say(''); render(); } })),
          el('p', { class: 'pref-help', text: 'Signing out takes your keys and Notion connection out of this browser. Your drafts stay.' }))
      ];
      const who = input('email', 'acct-user', 'username', { value: s.email, hidden: true, tabindex: '-1', 'aria-hidden': 'true' });
      if (open === 'password') {
        const cur = input('password', 'acct-current', 'current-password');
        const next = input('password', 'acct-new', 'new-password', { minlength: '8' });
        const go = el('button', { type: 'submit', class: 'btn btn-sm', text: 'Change password' });
        const form = el('form', { class: 'pref-form pref-inset' }, who, field('Current password', cur), field('New password', next, 'At least 8 characters. Your other devices will ask you to sign in again.'),
          el('div', { class: 'row-start' }, go, el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: 'Cancel', onclick: () => { open = null; say(''); render(); } })));
        form.noValidate = true;
        form.addEventListener('submit', (e) => { e.preventDefault(); run(go, 'Changing your password…', async () => { await Account.changePassword(cur.value, next.value); open = null; render(); toast('Password changed'); }); });
        nodes.push(form);
      } else if (open === 'delete') {
        const pw = input('password', 'acct-delete', 'current-password');
        const go = el('button', { type: 'submit', class: 'btn btn-sm btn-danger', text: 'Delete my account' });
        const form = el('form', { class: 'pref-form pref-inset' }, who,
          el('p', { text: 'This deletes your account and everything it keeps. This browser keeps its keys and drafts, and Notion keeps your pages.' }),
          field('Password', pw), el('div', { class: 'row-start' }, go, el('button', { type: 'button', class: 'btn btn-quiet btn-sm', text: 'Cancel', onclick: () => { open = null; say(''); render(); } })));
        form.noValidate = true;
        form.addEventListener('submit', (e) => { e.preventDefault(); run(go, 'Deleting your account…', async () => { await Account.deleteAccount(pw.value); open = null; render(); toast('Account deleted'); }); });
        nodes.push(form);
      }
      return nodes;
    }
    let shown = null;
    function render() {
      shown = Account.state().signedIn;
      sec.replaceChildren(...(shown ? signedIn() : signedOut()).filter(Boolean), st);
    }
    render();
    accountRefresh = () => {
      if (busy) return;
      if (Account.state().signedIn !== shown) { render(); return; }
      const line = sec.querySelector('.acct-sync');
      if (line) line.textContent = syncLine();
    };
    return [sec, el('p', { class: 'pref-foot', text: 'Ten Dollar Words, version ' + app().APP_VERSION })];
  }

  const BUILD = { writing: writingSection, look: lookSection, sound: soundSection, ai: aiSection, notion: notionSection, account: accountSection };

  /* ---------- The window ---------- */
  function build() {
    titleEl = el('h2', { id: 'settings-title', class: 'prefs-title', tabindex: '-1' });
    navEl = el('nav', { class: 'prefs-nav', 'aria-label': 'Settings sections' });
    bodyEl = el('div', { class: 'prefs-body' });
    const close = el('button', { type: 'button', class: 'icon-btn prefs-close', 'aria-label': 'Close settings', onclick: closeSettings }, icon('close'));
    const back = el('button', { type: 'button', class: 'prefs-back', onclick: () => showList() }, icon('chevLeft'), el('span', { text: 'Settings' }));
    dlg.append(
      el('div', { class: 'prefs-side' }, el('div', { class: 'prefs-side-head' }, el('span', { class: 'prefs-app', text: 'Settings' }),
        el('button', { type: 'button', class: 'prefs-done', text: 'Done', onclick: closeSettings })), navEl),
      el('div', { class: 'prefs-main' }, el('header', { class: 'prefs-head' }, back, titleEl, close), bodyEl));
    dlg.addEventListener('click', (e) => {
      if (e.target !== dlg) return;
      const r = dlg.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeSettings();
    });
    dlg.addEventListener('cancel', (e) => {
      e.preventDefault();
      if (TDW.UI.menuOpen()) return;
      if (isNarrow() && dlg.classList.contains('is-section')) showList(); else closeSettings();
    });
    dlg.addEventListener('close', () => { TDW.UI.closeMenu(); TDW.UI.rehostToast(); });
    navEl.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const i = SECTIONS.findIndex(([k]) => k === section);
      const next = SECTIONS[(i + (e.key === 'ArrowDown' ? 1 : -1) + SECTIONS.length) % SECTIONS.length][0];
      showSection(next);
      navEl.querySelector('[data-section="' + next + '"]').focus();
    });
  }

  function drawNav() {
    navEl.replaceChildren(...SECTIONS.map(([k, label]) => el('button', {
      type: 'button', class: 'prefs-nav-item', dataset: { section: k }, 'aria-current': k === section && !(isNarrow() && !dlg.classList.contains('is-section')) ? 'true' : null,
      onclick: () => showSection(k, true)
    }, el('span', { text: label }), el('span', { class: 'prefs-nav-note', text: navNote(k) }), el('span', { class: 'prefs-nav-chev', 'aria-hidden': 'true' }, icon('chevRight')))));
  }
  function navNote(k) {
    if (k === 'notion') { const c = Sync.config(); return c ? c.dbTitle : 'Off'; }
    if (k === 'ai') return TDW.AI.status() === 'none' ? 'Off' : 'Gemini';
    if (k === 'account') return Account.state().signedIn ? 'Signed in' : '';
    if (k === 'look') return ({ light: 'Light', dark: 'Dark', system: 'System' })[settings().theme] || '';
    if (k === 'sound') return ({ typewriter: 'Typewriter', soft: 'Soft', off: 'Off' })[settings().sound] || '';
    return '';
  }

  function showSection(k, focusBody) {
    section = BUILD[k] ? k : 'writing';
    accountRefresh = null;
    titleEl.textContent = SECTIONS.find(([x]) => x === section)[1];
    bodyEl.replaceChildren(...BUILD[section]().filter(Boolean));
    bodyEl.scrollTop = 0;
    dlg.classList.add('is-section');
    drawNav();
    if (focusBody && isNarrow()) titleEl.focus({ preventScroll: true });
  }
  function showList() {
    dlg.classList.remove('is-section');
    drawNav();
    const b = navEl.querySelector('[data-section="' + section + '"]');
    if (b) b.focus({ preventScroll: true });
  }

  function closeSettings() {
    if (!dlg.open || dlg.classList.contains('is-closing')) return;
    TDW.UI.closeMenu();
    if (TDW.UI.reducedMotion()) { dlg.close(); return; }
    dlg.classList.add('is-closing');
    setTimeout(() => { dlg.classList.remove('is-closing'); dlg.close(); }, 170);
  }

  function openSettings(which) {
    const k = which === 'look' || BUILD[which] ? which : null;
    if (!dlg.open) dlg.showModal();
    if (isNarrow() && !k) { showSection(section); showList(); }
    else showSection(k || section);
    if (which === 'ai') { const n = document.getElementById('set-key'); if (n) n.focus({ preventScroll: true }); }
    else if (which === 'account') { const n = document.getElementById('acct-email'); if (n) n.focus({ preventScroll: true }); }
    else if (!isNarrow()) titleEl.focus({ preventScroll: true });
  }

  // Something changed outside the window (another device, signing in): redraw the section unless you're typing in it.
  function refreshSettings() {
    if (!dlg || !dlg.open) return;
    const a = document.activeElement;
    if (a && bodyEl.contains(a) && a.matches('input, textarea, select')) { drawNav(); return; }
    showSection(section);
  }

  TDW.Dialogs = {
    init() {
      dlg = document.getElementById('settings-dialog');
      build();
      Account.onChange(() => { if (dlg.open && accountRefresh) accountRefresh(); });
    },
    openDrafts() { TDW.Library.show({ focusSearch: !isNarrow() }); },
    openSettings,
    closeSettings,
    refreshSettings,
    renderDraftList() { TDW.Library.render(); },
    isDraftsOpen() { return false; },
    isSettingsOpen: () => !!dlg && dlg.open
  };
})();
