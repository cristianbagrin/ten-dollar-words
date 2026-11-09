# Ledger

## Concept
The money is the interface. The page sits on a desk of pale banknote paper beside a register
tape. In Write mode the tape is rolled up into the register: only the balance shows, in the
top-right corner where the masthead ends. Press Edit (⌘E) and the tape feeds out downward:
the balance large and engraved over one guilloché band, then one printed line per paragraph
(first words, words, cost), headings as section rules, subtotal, budget and balance, and under
them **Refunds available**: every fix priced in what it would save. Editing is earning refunds.
Everything the old app scattered over twelve places lives in two: the masthead (where you
are, what paper, which mode, share, settings) and the tape (money, fixes, tools, notes,
overflow, alternatives, challenges). The page never moves sideways.

## Tokens

### Color (light, "note")
| name | hex | role |
| --- | --- | --- |
| desk | `#eef5f3` | note paper: the window, the masthead material |
| page | `#fbfdfc` | the sheet you write on, the tape paper |
| ink | `#0e2a5c` | intaglio navy: figures, headings, UI text, primary buttons (13.7:1 on page) |
| text | `#1a2437` | body text at length (15.2:1) |
| slate | `#636a7d` | secondary text (5.2:1 on page, 4.9:1 on desk) |
| rule | `#8d94a7` | hairlines (used at 35–60 % mix), quiet marks |
| debit | `#7d3929` | oxblood: spend over budget, deletions, very hard sentences (8.3:1) |
| credit | `#0b6e78` | deep teal from `#09a3b3`: refunds, savings (5.9:1) |
| stamp | `#3c2636` | aubergine: the one stamp (over budget, challenge met) |
| ice | `#ddf8f8` → selection `rgba(9,163,179,.2)` | |
| focus | `#0b7c88` | 2px focus rings (4.5:1 on desk) |

Fix tints on the page: very hard `#f2dcd5` (oxblood wash), hard `#f4ecd2` (ochre security
tint), wordy `#d5eef0` (credit wash: a refund lives here), adverb `#e4e2f4` (rainbow-print
violet), passive `#e2ece0`, weakener: dotted navy underline, spelling: wavy oxblood underline.

### Color (dark, "night note")
desk `#0b1426`, page `#101b2e`, ink `#dcecee`, text `#d4dfe8`, slate `#93a0b8`, rule `#4a5a78`,
debit `#e58b73`, credit `#52c7d1`, stamp `#d9b3cc`. Tints become 20–30 % washes of the same hues.
Follows the system by default (Settings → Look → Automatic / Light / Dark).

### Type
| role | face | size / leading / tracking |
| --- | --- | --- |
| money figures | Bodoni Moda (opsz, lining + tabular figures) | balance 54/1 −0.02em; stub 26/1; ledger totals 20 |
| UI | Public Sans (tabular figures) | 13/1.4 body, 12/1.3 small, 15/1.3 headings, 20/1.2 dialog titles; +0.01em at 12 |
| tape line items | IBM Plex Mono (the one place for mono: it is a receipt) | 12.5/1.55 |
| page | Courier Prime 19/1.6 (default), Newsreader 21/1.5 (serif), Public Sans 18/1.6 (sans) | |

### Spacing, radius, elevation
- Spacing: 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64.
- Radius by size, not one value: marks 3, chips/tags 4, buttons/fields/menu rows 6, menus and
  slips 10, sheets and dialogs 14, the phone balance pill 999.
- Paper sits flat on the desk: hairline edges, no drop shadow. Floating things (menus,
  selection bar, sheets) get one shadow: `0 1px 0 rgba(14,42,92,.06), 0 12px 32px -12px rgba(14,42,92,.32)`.

### Motion
- Springs critically damped (damping 1, response 0.32 s) for everything that moves; the phone
  tape sheet uses damping 0.82 only when released with a flick (projected with Apple's
  deceleration 0.998, velocity handed off, rubber-banded past the ends).
- Paper feed: the tape unrolls top to bottom (clip-path, 420 ms); new line items slide down
  7 px and fade in.
- Money rolls: each digit of the balance is a strip that ticks to its new value (280 ms) only
  when the value changes. A cut prints a "+$10" credit beside the balance.
- Menus and the selection bar scale 0.97 → 1 from their trigger (160 ms); press feedback on
  pointer-down (scale 0.97).
- Reduced motion: every slide, unroll and roll becomes a 150 ms cross-fade or an instant change.

## Layout

Computer (1440 × 900):
```
┌────────────────────────────────────────────────────────────┬──────────────────────┐
│ ▤ Drafts  The ten dollar rule   Synced    Paper: Basic ▾  │ Balance        $880  │  56 px band
│                               [Write|Edit]  Share ▾   ⚙   │ ━━━━━━━━━━━━──────── │  (stub in Write)
├──────┬───────────────────────────────────────────┬────────┤ ░ guilloché ░ Grade 6 │  Edit: the tape
│ desk │  page (64ch Courier, 72 px margins)        │  desk  │ Receipt Notes Overflow│  unrolls below
│      │                                            │        │ Every word you… 20 $200│
│      │                                            │        │ …                     │
│      │                                            │        │ Subtotal 112   $1,120 │
│      │                                            │        │ Refunds available $70 │
│      │                                            │        │ in order to → to  $20 │
│      │                                            │        │ Audit  Trim  Challenge│
└──────┴───────────────────────────────────────────┴────────┴──────────────────────┘
```
The page is centred in the space left of the tape in both modes, so ⌘E never moves it.

Phone (390 × 844):
```
┌──────────────────────────────┐
│ ▤  ($880)      [Write|Edit] ⋯ ⚙│  permanent, translucent
│                              │
│  page, full width            │
│                              │
├──────────────────────────────┤  Edit: tape sheet, peek 64 px
│ ── Receipt  Grade 6  $70 ▴   │  drag/flick to half and full
└──────────────────────────────┘
```

## Where every feature lives now
| feature | old place | new place | how |
| --- | --- | --- | --- |
| Write / Edit | auto-hiding top bar | masthead, always | ⌘E, or click the balance |
| Spend, budget, balance | Edit panel only | tape header (Edit), stub (Write), phone pill | always visible |
| Budget change | link under amount | "of $2,000" in the tape header | presets + field, inline |
| Readability grade | panel section | tape header, quiet figure | |
| Fixes | panel rows + popover over the text | **Refunds available** in the tape; the detail expands in the tape | click a highlight or a refund line |
| Hide a kind of fix | eye per row | the refund detail's "Hide …"; Settings → Writing for all | |
| Paragraph costs | — | tape line items | click jumps to the paragraph; hover pairs line and paragraph |
| Format | segmented control in bar | masthead "Paper: Basic ▾" | phone: ⋯ menu |
| No backspace | switch in bar | Paper menu ("No backspace"), Settings → Writing | |
| Save .md, open, post to X | three dock icons | masthead Share ▾ | ⌃⇧P still posts |
| Full screen | bar button | removed (the browser has it) | |
| Shortcut list | keyboard icon | Settings → Keys, ⌃? | |
| Live word count | top-left text | tape Subtotal; a selection is priced in the header ("Selected 5 words, $50") | |
| Drafts | drawer | the ledger book: left sheet, rows by month with spend and stages | ▤ Drafts |
| Notion properties | chips in drawer | quiet tags on each ledger row (same menus) | |
| Settings | one long modal | sheet with sections Writing, Look, Sound, AI, Notion, Account, Keys | ⚙ |
| Lab | dashed LAB box + floating popover | tape tools: **Audit** (checks) | ⌃⇧L |
| Trim | Lab popover levels | tape tools: **Trim** priced in dollars ("Cut $220 · 20%") | |
| Check the message | panel button | Audit list, results as a slip in the tape | |
| Challenges | dashed box + floating card | tape tools **Challenge**; the running one is a slip clipped under the balance in both modes | |
| Overflow | right panel + text link | tape tab **Overflow** | ⌃⇧O, Stash |
| Notes, AI threads | floating card + right panel + text link | tape tab **Notes** (composer, threads) | ⌃⇧M, ⌃J, pins |
| Alternatives | left panel | a slip in the tape, each version priced | ⌃⇧A, A/B |
| Selection bar | 12 controls | Ask AI, Alternatives, Note, Bold, Italic, Link, More | |
| Sync status | bar text | after the title in the masthead | |

## Pebbles fixed
- No popover ever covers the text: fix details, Lab reasons, note cards and alternatives open in the tape.
- Fix rows lose the empty squares that read as to-dos; each refund shows its swatch and its price.
- Menus only draw a check column when an item can be checked.
- "The Lab guide…", dashed LAB/CHALLENGE boxes, middle-dot hints, the Courier placeholder in
  chrome and the italic tabs are gone.
- Teaching toasts removed (first-run "Press ⌘E", the X thread lecture). Toasts only confirm.
- First run: an empty page and "Balance $2,000"; nothing else asks for attention.
- The phone bar no longer covers the first line; the tape sheet pads the page so nothing hides under it; the keyboard lifts the sheet.
- Settings opens on Writing, not a sign-in form; Account is last.
- Over budget: the balance reads "Over by $150" in oxblood and one aubergine stamp appears; no toast.

## Removed, and why
- Full-screen button (browser has it). The auto-hiding bar (nothing said it existed).
- The live count at top left (the tape's subtotal and the selection price say it).
- The old skins as separate looks: Typewriter / Ditto / Night become Theme (light, dark,
  automatic) × Writing face (typewriter, serif, sans). `skin: night` maps to Dark,
  `autoNight` to Automatic, `ditto` to the serif face; Ledger writes the old keys too.

## Review of the plan against the brief
- First pass put the tape as a rounded white card floating beside a rounded page card with a
  soft shadow: the SaaS-card tell. Changed to flat paper on the desk with hairline edges, the
  tape full height from the top of the window, so it reads as a strip of register paper.
- I had a third "serrated receipt edge" motif; cut. The guilloché is the one ornament, used once.
- Tape section labels were going to be caps eyebrows ("REFUNDS AVAILABLE"); changed to
  sentence-case receipt lines with the total on the same line, which is information, not chrome.
- Refunds first drafted as cards with buttons; changed to single printed lines that expand,
  like an itemised receipt.
- Considered a command palette to hold tools (that is Margin's idea) and a three-pane inspector
  (Studio's); Ledger keeps one money column instead.
