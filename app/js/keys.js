/* Keyboard shortcuts: one list of what each does and which keys run it, and one listener that
   runs them. Any of them can be changed (the shortcuts sheet, F12); a change is saved with the
   settings, so it follows the account.

   A combo is written the Mac way: ⌘ ⌃ ⌥ ⇧ then the key ("⌘⇧J", "⌃N", "F12", "⌘⌥4"). On other
   keyboards ⌘ means Ctrl, and a shortcut that needs both ⌘ and ⌃ gets a `pc` combo of its own.
   Keys are matched by their place on the keyboard (event.code), so ⌥ on a Mac, which types
   symbols, still works. */
(function () {
  'use strict';
  const TDW = window.TDW = window.TDW || {};
  const APPLE = /Mac|iPhone|iPad|iPod/.test(((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '') + ' ' + (navigator.userAgent || ''));

  // id, group, label, mac, pc (when it differs), where: 'page' (not while a dialog is open),
  // 'any', or 'editor' (only while the caret is in the page).
  const LIST = [
    ['review', 'The page', 'Review on or off', '⌘E'],
    ['palette', 'The page', 'Commands', '⌘K', null, 'any'],
    ['drafts', 'The page', 'Drafts', '⌘O'],
    ['newDraft', 'The page', 'New draft', '⌘⌥N'],
    ['settings', 'The page', 'Settings', '⌘,'],
    ['save', 'The page', 'Save now', '⌘S', null, 'any'],
    ['shortcuts', 'The page', 'Shortcuts', 'F12', '⌘⇧/', 'any'],

    ['bold', 'Text', 'Bold', '⌘B', null, 'editor'],
    ['italic', 'Text', 'Italic', '⌘I', null, 'editor'],
    ['underline', 'Text', 'Underline', '⌘U', null, 'editor'],
    ['strike', 'Text', 'Strikethrough', '⌘⇧S', null, 'editor'],
    ['code', 'Text', 'Code', '', '', 'editor'],
    ['highlight', 'Text', 'Highlight in the last color', '⌘⇧H'],

    ['text', 'Blocks', 'Text', '⌘⌥0', null, 'editor'],
    ['h1', 'Blocks', 'Heading 1', '⌘⌥1', null, 'editor'],
    ['h2', 'Blocks', 'Heading 2', '⌘⌥2', null, 'editor'],
    ['h3', 'Blocks', 'Heading 3', '⌘⌥3', null, 'editor'],
    ['todo', 'Blocks', 'To-do list', '⌘⌥4', null, 'editor'],
    ['bullets', 'Blocks', 'Bulleted list', '⌘⌥5', null, 'editor'],
    ['numbers', 'Blocks', 'Numbered list', '⌘⌥6', null, 'editor'],
    ['toggle', 'Blocks', 'Toggle list', '⌘⌥7', null, 'editor'],
    ['duplicate', 'Blocks', 'Duplicate', '⌘D', null, 'editor'],
    ['moveUp', 'Blocks', 'Move up', '⌘⇧↑', null, 'editor'],
    ['moveDown', 'Blocks', 'Move down', '⌘⇧↓', null, 'editor'],

    ['askAI', 'Notes and AI', 'Ask AI', '⌘⇧J'],
    ['note', 'Notes and AI', 'Add a note', '⌃N', '⌘⇧M'],
    ['alts', 'Notes and AI', 'Alternatives', '⌃⇧A', '⌘⌥A'],
    ['aiAlts', 'Notes and AI', 'Alternatives from AI', '⌃⇧J', '⌘⌥J'],

    ['ghost', 'The desk', 'Ghost it', '⌘G'],
    ['stash', 'The desk', 'Stash in Overflow', '⌃⇧X', '⌘⌥X'],
    ['overflow', 'The desk', 'Overflow', '⌃⇧O', '⌘⌥O', 'any'],
    ['lab', 'The desk', 'The Lab', '⌃⇧L', '⌘⌥L'],
    ['roll', 'The desk', 'Roll a challenge', '⌃⇧R', '⌘⌥R'],
    ['postX', 'The desk', 'Post', '⌃⇧P', '⌘⌥P']
  ].map(([id, group, label, mac, pc, where]) => ({ id, group, label, mac, pc: pc || mac, where: where || 'page' }));

  const NAMES = {
    Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", BracketLeft: '[', BracketRight: ']', Backslash: '\\', Minus: '-', Equal: '=', Backquote: '`',
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: '↩', Space: 'Space', Backspace: '⌫', Delete: '⌦', Tab: '⇥', Escape: 'esc'
  };
  const CODES = Object.fromEntries(Object.entries(NAMES).map(([code, ch]) => [ch, code]));

  // "⌘⇧J" → "mod+shift+KeyJ": the form events are compared in.
  function parse(combo) {
    const s = String(combo || '');
    let rest = s.replace(/[⌘⌃⌥⇧]/g, '');
    if (!rest) return '';
    const code = CODES[rest] || (/^[A-Za-z]$/.test(rest) ? 'Key' + rest.toUpperCase() : /^\d$/.test(rest) ? 'Digit' + rest : rest);
    let mod = s.includes('⌘'), ctrl = s.includes('⌃');
    if (!APPLE && ctrl) { mod = true; ctrl = false; } // one Ctrl key does both jobs
    return (mod ? 'mod+' : '') + (ctrl ? 'ctrl+' : '') + (s.includes('⌥') ? 'alt+' : '') + (s.includes('⇧') ? 'shift+' : '') + code;
  }

  const MODIFIER = /^(Shift|Control|Alt|Meta|OS)(Left|Right)?$/;
  function eventSig(e) {
    if (!e.code || MODIFIER.test(e.code)) return '';
    const mod = APPLE ? e.metaKey : e.ctrlKey || e.metaKey;
    const ctrl = APPLE ? e.ctrlKey : false;
    return (mod ? 'mod+' : '') + (ctrl ? 'ctrl+' : '') + (e.altKey ? 'alt+' : '') + (e.shiftKey ? 'shift+' : '') + e.code;
  }

  // What was pressed, written the Mac way, for saving a new shortcut. '' if it can't be one:
  // a bare letter would stop you typing it.
  function comboOf(e) {
    if (!e.code || MODIFIER.test(e.code)) return '';
    const named = /^F\d{1,2}$/.test(e.code);
    const mod = APPLE ? e.metaKey : e.ctrlKey || e.metaKey;
    const ctrl = APPLE && e.ctrlKey;
    if (!mod && !ctrl && !(e.altKey && e.shiftKey) && !named) return '';
    const key = NAMES[e.code] || (e.code.startsWith('Key') ? e.code.slice(3) : e.code.startsWith('Digit') ? e.code.slice(5) : e.code.startsWith('Numpad') ? '' : e.code);
    if (!key) return '';
    return (mod ? '⌘' : '') + (ctrl ? '⌃' : '') + (e.altKey ? '⌥' : '') + (e.shiftKey ? '⇧' : '') + key;
  }

  let custom = {};          // id → combo ('' = no shortcut)
  let table = new Map();    // signature → id
  let paused = false;
  const handlers = {};
  const listeners = [];

  const byId = (id) => LIST.find((a) => a.id === id) || null;
  const defaultOf = (a) => (APPLE ? a.mac : a.pc);
  const comboFor = (id) => { const a = byId(id); if (!a) return ''; return Object.prototype.hasOwnProperty.call(custom, id) ? custom[id] : defaultOf(a); };

  function rebuild() {
    table = new Map();
    for (const a of LIST) { const sig = parse(comboFor(a.id)); if (sig && !table.has(sig)) table.set(sig, a.id); }
    for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } }
  }

  // The shortcut as this keyboard says it: "⌘⇧J" or "Ctrl+Shift+J". '' when it has none.
  function show(id) {
    const c = comboFor(id);
    if (!c || APPLE) return c;
    return c.replace(/⌘|⌃/g, 'Ctrl+').replace(/⌥/g, 'Alt+').replace(/⇧/g, 'Shift+').replace(/(Ctrl\+)+/, 'Ctrl+');
  }
  // A control's name with its shortcut, for the tip that shows on hover.
  const tip = (label, id) => { const k = show(id); return k ? label + '  ' + k : label; };

  function onKeyDown(e) {
    if (paused || e.isComposing || e.repeat && !/^Arrow/.test(e.code)) return;
    const id = table.get(eventSig(e));
    if (!id) return;
    const a = byId(id);
    const fn = handlers[id];
    if (!fn) return;
    const modal = document.querySelector('dialog[open]:modal');
    if (a.where !== 'any' && modal) return;
    if (a.where === 'editor' && document.activeElement !== (TDW.Editor && TDW.Editor.rootEl())) return;
    if (fn(e) === false) return; // not this time: the key goes on to the page
    e.preventDefault();
    e.stopPropagation();
  }

  TDW.Keys = {
    LIST, APPLE,
    init(saved) {
      this.load(saved);
      window.addEventListener('keydown', onKeyDown, true);
    },
    load(saved) {
      custom = {};
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
        for (const a of LIST) if (typeof saved[a.id] === 'string' && saved[a.id] !== defaultOf(a)) custom[a.id] = saved[a.id];
      }
      rebuild();
    },
    on(id, fn) { handlers[id] = fn; },
    onChange(fn) { listeners.push(fn); },
    combo: comboFor, show, tip, comboOf,
    isDefault: (id) => !Object.prototype.hasOwnProperty.call(custom, id),
    custom: () => Object.assign({}, custom),
    // The action another combo already belongs to, if any.
    ownerOf(combo, except) { const sig = parse(combo); for (const a of LIST) if (a.id !== except && sig && parse(comboFor(a.id)) === sig) return a; return null; },
    // Set a shortcut ('' removes it, null puts the default back). Whoever had the combo loses it.
    set(id, combo) {
      const a = byId(id);
      if (!a) return;
      if (combo == null || combo === defaultOf(a)) delete custom[id]; else custom[id] = combo;
      if (combo) { const other = this.ownerOf(combo, id); if (other) custom[other.id] = ''; }
      rebuild();
    },
    reset() { custom = {}; rebuild(); },
    pause(on) { paused = !!on; },
    matches(e, id) { const sig = eventSig(e); return !!sig && parse(comboFor(id)) === sig; },
    _parse: parse
  };
})();
