# Studio: a well-made writing studio

## The concept

A study at 4:50 pm: sage walls, a green leather desk, a plum spine on the shelf. Ten Dollar
Words becomes the familiar three-pane tool a writer already knows from Mail, Notes, Ulysses or
Xcode, done with care: the **Library** on the left (what you're writing), the **Page** in the
middle (the writing), the **Inspector** on the right (what to do about it). Every feature has
exactly one home and stays there. Nothing floats over the text: a click on a highlight selects
that fix in the inspector, the alternatives list is an inspector view, a note is opened in the
Notes tab. Panes are separated by tone (sage chrome, white page) and hairlines, never by
cards and shadows.

The boldness is spent in one place: **the money rule**. The hairline under the toolbar, the
line that separates the chrome from the page, is the budget meter. It fills with plum from
left to right as you spend; over budget it runs the full width and thickens. It is visible in
every state, Focus included, so the app's one idea (every word costs $10) is never hidden,
and it is the only saturated color on a calm screen.

Write and Edit become **Focus** and **Studio**. Focus folds both side panes away and leaves the
page, a faint toolbar and the money rule. Studio opens the inspector on Review with the fix
highlights on. The page column keeps its width and glides to the center of whatever space it
has; it never jumps.

## Tokens

### Color (light, the default)
| Token | Hex | Role |
|---|---|---|
| `--chrome` | `#eef1e8` | Library and inspector (sage, calmed from the seed's #a0b96d) |
| `--chrome-2` | `#e3e8dc` | Pressed and hovered rows on the chrome, the search field |
| `--page` | `#ffffff` | The page, menus, the settings content |
| `--ink` | `#1d231d` | Text (16:1 on page, 14:1 on chrome) |
| `--ink-2` | `#555c4f` | Secondary text, olive-gray (6.9:1 page, 6.1:1 chrome) |
| `--ink-3` | `#676e60` | Placeholders and tertiary text (5.3:1 page, 4.6:1 chrome) |
| `--line` | `#d9ddd2` | Hairlines between panes and sections |
| `--emerald` | `#036e44` | Actions, focus rings, the caret, selection in lists (6.3:1) |
| `--plum` | `#731650` | Money: the rule, the spend, over budget (10.7:1) |
| `--blue` | `#3a66cc` | Weakener underline, the block drop line (the seed's #4476e6, darkened to 5.3:1) |
| `--selection` | `#a9cbd0` at 55% | Text selection (the seed's pale blue-gray) |

Fix washes come from one family (the seed's salmon, olive, plum, sage and blue-gray), not
rainbow pastels:
| Kind | Light | How it shows |
|---|---|---|
| Very hard sentence | `#f6c4ca` salmon | wash |
| Hard sentence | `#ece5c3` olive straw | wash |
| Wordy phrase | `#ecd8e4` plum tint | wash |
| Passive voice | `#d8e4c9` sage | wash |
| Adverb | `#d3e3e5` blue-gray | wash |
| Weakener | `--blue` | dotted underline |
| Spelling | `#c23b4a` | wavy underline |

### Color (dark: "deep olive-black chrome, warm-gray page")
| Token | Hex |
|---|---|
| `--chrome` | `#1a1d17` |
| `--chrome-2` | `#24281f` |
| `--page` | `#262521` |
| `--ink` | `#ebe9e1` (12.6:1 on page) |
| `--ink-2` | `#b4b6aa` (7.5:1) |
| `--ink-3` | `#8d9083` (4.7:1) |
| `--line` | `#34372f` |
| `--emerald` | `#5ec79a` (7.4:1; buttons are emerald with near-black text) |
| `--plum` | `#e48fc2` (6.6:1) |
| `--blue` | `#7fa2f0` |
Washes become the same hues at 26 to 34% over the page.

### Type
- **UI: Instrument Sans** (variable, wdth 75–100, wght 400–700). A crisp grotesk with a
  little character in the `t`, `y` and `g`, and real tabular figures with a narrow comma, so
  `$1,120` lines up in columns without the gappy commas Schibsted Grotesk's tabular set has
  (tried, rejected). Not Inter, not a system face.
- **The page** (Settings → Theme & font → Writing font): **Serif = Literata** (the default; it
  was drawn for long reading on screens), **Typewriter = Courier Prime**, **Sans = Instrument
  Sans**, **Mono = Atkinson Hyperlegible Mono**. Traditional Chinese falls back to Cactus
  Classical Serif / Noto Serif TC / Noto Sans TC as before.

| Role | Size / line | Weight | Tracking |
|---|---|---|---|
| Caption (meta, counts, tab labels on phone) | 11 / 14 | 500 | +0.01em |
| Small (secondary labels) | 12 / 16 | 500 | 0 |
| UI base (computer) | 13 / 18 | 400–500 | 0 |
| Section title in panes | 13 / 18 | 600 | 0 |
| Settings section title | 20 / 24 | 650 | −0.01em |
| Spend figure (Review) | 28 / 32, wdth 90 | 650 | −0.02em |
| Phone body | 16 / 22 | 400 | 0 |
| Phone large title ("Drafts") | 32 / 38 | 700 | −0.025em |
| Page, serif | 19px / 1.62 | 400 | 0 |
| Page, typewriter | 18px / 1.6 | 400 | 0 |

### Spacing, radius, elevation
- Spacing on a 4/8 grid: 4, 8, 12, 16, 20, 24, 32, 48.
- Radius by size, not one value for everything: 3 (marks, swatches), 6 (rows, buttons,
  fields, chips), 8 (menus, the selection bar, popovers), 12 (dialogs, the phone sheet).
- Elevation only on things that float: menus and the selection bar (one shadow), dialogs and
  the phone sheet (a deeper one). Panes have none.

### Motion
- One spring for panes: critically damped (damping 1.0), response 0.36 s, interruptible (it
  always starts from the value on screen and keeps its velocity when retargeted). The library
  and the inspector slide; the page column re-centers in the same frame loop.
- Phone push and pop: the page slides in from the right over the library (which shifts left
  30% and dims), damping 1.0, response 0.4. Swipe from the left edge pops, tracking the finger
  1:1 and finishing with the release velocity.
- Phone sheet: drag, flick (projected with Apple's deceleration), rubber-band past the ends;
  damping 0.86 after a flick, 1.0 after a tap.
- Inspector tabs cross-fade (140 ms). Menus and the selection bar scale from their anchor
  (0.97 → 1, 160 ms). Buttons respond on press (scale 0.97).
- Reduced motion: no slides or springs; panes, sheet, menus and pushes cross-fade (150 ms).

## Layout

### Computer (Studio, 1440 × 900)
```
┌─ Library 264 ────┬─ Toolbar 48 ───────────────────────────────────────┬─ Inspector 336 ───┐
│ [Search    ] [✎] │ [▤] The ten dollar rule   112 words $1,120 / $2,000 │ Review Lab Chall… │
│                  │                           Basic▾  ✎  Share  [◫]     │───────────────────│
│ ▾ Idea         3 │━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━──────────────────────│ Spent             │
│   Desk photo post│  ← the money rule: plum up to 56% of the budget     │ $1,120  of $2,000 │
│   $0      Sep 20 │                                                     │ Words Chars Read  │
│ ▾ Draft 2      1 │        The ten dollar rule                          │───────────────────│
│   Why I write …  │        Every word you type costs ten dollars.       │ Readability G 6   │
│ ▾ Not started  1 │        That sounds harsh, but it is really the      │───────────────────│
│ ▸ This device  2 │        fastest way to learn to cut.                 │ Fixes             │
│                  │                                                     │ ▬ Very hard    1 ◉│
│                  │        (white page, column centered in the space)   │ ▬ Hard         1 ◉│
│──────────────────│                                                     │ ┌ "was written" ┐ │
│ ● Synced     [⚙] │                                                     │ └ Rewrite w/ AI ┘ │
└──────────────────┴─────────────────────────────────────────────────────┴───────────────────┘
```
Focus (⌘E): both panes fold away; the toolbar fades to 35% until the pointer comes near it;
the money rule stays.
```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│ [▤] The ten dollar rule                          $1,120 / $2,000  Basic▾ ✎ Share [◫]  35% │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━──────────────────────────────────│
│                         The ten dollar rule                                               │
│                         Every word you type costs ten dollars…                            │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```
Alignment: text and lists left-aligned; numbers (counts, money, dates) right-aligned in their
own column with tabular figures. The page column is centered in the space between the panes.

### Phone (390 × 844)
```
Library (home)                Page (pushed)                 Inspector (sheet, half)
┌────────────────────────┐    ┌────────────────────────┐    ┌────────────────────────┐
│ [⚙]               [✎]  │    │ ‹ Drafts  $1,120  [✎]  │    │ ‹ Drafts  $1,120  [✎]  │
│ Drafts                 │    │━━━━━━━━━━━━────────────│    │━━━━━━━━━━━━────────────│
│ [Search              ] │    │ The ten dollar rule    │    │ The ten dollar rule    │
│ Idea                 3 │    │ Every word you type    │    │ Every word you type…   │
│ ┌────────────────────┐ │    │ costs ten dollars…     │    ├──────── ═══ ───────────┤
│ │ Desk photo post    │ │    │                        │    │ Review Lab Challenge … │
│ │ $0          Sep 20 │ │    │                        │    │ Spent  $1,120 of 2,000 │
│ └────────────────────┘ │    │                        │    │ Fixes                  │
│ Draft 2              1 │    │                        │    │ ▬ Very hard        1   │
│ …                      │    ├────────────────────────┤    │ ▬ Hard             1   │
│ Synced with Write posts│    │ Basic   Review   Share │    │                        │
└────────────────────────┘    └────────────────────────┘    └────────────────────────┘
```
The bottom toolbar rides on top of the keyboard; the page's bottom padding always clears the
toolbar, the keyboard and the sheet, so nothing sits on the text.

## Where every feature lives now

| Feature | Old place | New place | How you reach it |
|---|---|---|---|
| Drafts list | Drafts drawer (top-left "Drafts") | Library pane, grouped by Notion Stage | Always there in Studio; ⌘\ ; phone: home screen |
| Search drafts | (none) | Library search field | Click it, or ⌘⇧F |
| New draft | Drawer button | Library compose button (✎) | Click; phone: compose in the nav bar |
| Notion properties (Stage, Pillar, Date…) | Chips under every row | Inspector → Draft tab; row menu (⋯ / right-click) | Click a value to change it |
| Open in Notion | Click a title | Draft tab and row menu | "Open in Notion" |
| Delete a draft | Trash on hover | Row menu and Draft tab | "Delete draft" (toast with Undo) |
| Sync status | Top bar text | Library footer | Click for details (last sync) |
| Settings | Sliders icon | Library footer (gear) | Preferences window; phone: pushed list |
| Write / Edit | Segmented toggle top-right | Focus / Studio | ⌘E; Focus = both panes closed |
| Library / inspector | (none) | Toolbar toggles at each end | ⌘\ and ⌘⌥I |
| Spend and budget | Edit panel only | Toolbar chip + the money rule (always); Review tab | Click the chip for the budget menu |
| Word / character count | Top-left faint text | Toolbar, before the chip; selection count there too | Always visible in Studio |
| Format (Basic, LinkedIn, X, Substack) | Segmented in the bar | Toolbar pop-up button | Click; phone: bottom toolbar |
| No backspace | Switch in the bar | Pen toggle in the toolbar | Click; it pulses when backspace is blocked |
| Full screen | Button in the bar | Removed | The browser's or OS's own |
| Grade, fixes, eye toggles | Edit panel | Review tab | Inspector → Review |
| Tip on a highlight | Popover over the text | The fix, expanded under its row in Review | Click a highlight, or a fix row; ‹ › steps |
| Check the message (AI) | Edit panel | Review tab, "AI" section | Button; results replace the section |
| The Lab (checks) | Dashed LAB button → popover | Lab tab | Inspector → Lab, ⌃⇧L |
| Trim | Lab popover row | Lab tab, Trim control; the result card is in the tab | Lab → Trim |
| Lab mark explanation | Tooltip over the text | Lab tab, "Selected mark" | Click a Lab mark |
| Challenges (menu, picker, card, streak) | Dashed CHALLENGE button, card bottom-left | Challenge tab; a challenge chip in the toolbar while one runs | Inspector → Challenge; the chip |
| Overflow | Bottom-right link → right panel | Overflow tab | ⌃⇧O, tab |
| Stash to Overflow | Right-click, ⌃⇧X | Same, plus the selection bar's More | Confirming toast with "Show" |
| Notes list | Bottom-right "Notes" → panel | Notes tab | ⌃⇧M with nothing selected, tab |
| A note / AI thread | Card floating beside the text | Notes tab, the note expanded | Click noted words or the margin pin |
| Compose a note / Ask AI | Card by the selection | Notes tab composer, quote on top | Bar's Note / Ask AI, ⌃⇧M, ⌃J |
| Alternatives | Left panel, page dimmed | Inspector → Alternatives view (a contextual tab) | Bar's Alternatives, ⌃⇧A, dots under the text |
| Ghost it, Stash, Color, Turn into, Strike, Code | Selection bar (12 controls) | Selection bar's More menu | Bar → More, right-click |
| Ask AI, Alternatives, Note, Bold, Italic, Link | Selection bar | Selection bar (trimmed to these + More) | Select text |
| Block handle, block menu, "/" menu | Margin, menus | Same places, quieter | Hover the margin, "/" |
| Save .md, Open file, Post to X | Icons bottom-left | Toolbar → Share | Share menu; ⌃⇧P posts |
| Copy for the platform | ⌘C only | Share → "Copy for LinkedIn" (follows the format) | Share menu |
| Keyboard shortcuts | Keyboard icon top-right | Settings → Writing → Keyboard shortcuts; ⌃? | A sheet with every shortcut |
| Theme | Skins (Typewriter, Ditto, Night desk) + auto night | Theme: Light, Dark, Match system | Settings → Theme & font |
| Writing font | Part of the skin | Writing font: Serif, Typewriter, Sans, Mono | Settings → Theme & font |
| Typing sound, volume | Settings | Settings → Sound | |
| Gemini key, model | Settings | Settings → AI | |
| Notion connect | Settings | Settings → Notion | |
| Account | Settings (first section) | Settings → Account (last) | |
| Dictionary | Settings → Writing | Settings → Writing | |
| Default budget, new draft format | Settings | Settings → Writing | |

Old stored settings map without a crash: `skin: typewriter` → Typewriter font + Light,
`ditto` → Serif + Light, `night` → Mono + Dark; `autoNight: true` → Match system. A browser
with no stored settings starts on Serif + Match system (light on a light system).

## Pebbles fixed
(Filled in as they're done; see the end of this file.)

## Removed, and why
(Filled in as they're done; see the end of this file.)

## Review of the plan against the brief
(See the end of this file.)
