# Margin

## The concept

A galley proof and an editor's two-ended pencil. The draft is one quiet sheet of cool white
paper that never moves: it doesn't slide, resize or change color when you start reviewing. Above
it runs a thin slug line, the spine, with the draft's title on the left and what the words have
cost so far on the right. When you ask for a review (⌘E) the editor arrives with her pencil: the
blue end brackets hard sentences in the left gutter, underlines wordy phrases and writes short
notes in the right margin beside their line; the red end keeps the money (the spend, spelling,
anything over a limit). Everything else in the app (drafts, formats, the Lab, Trim, challenges,
Overflow, settings, sharing) is one keystroke away in a command palette, and anything that needs
room to the side uses the same margin. There is no dock, no sidebar and no second mode.

## Tokens

### Color

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `--paper` | `#ffffff` | `#1c1e22` graphite paper | the page, the spine, sheets |
| `--canvas` | `#f4f6f9` | `#15171a` | recessed surfaces: settings sidebar, fields, hover |
| `--ink` | `#22252b` graphite | `#e4e6ea` chalk | text |
| `--ink-2` | `#5d636e` (6.0:1) | `#a8aeb8` (7.3:1) | secondary text |
| `--ink-3` | `#878d98` (3.3:1) | `#727985` | placeholders, disabled, decoration only |
| `--rule` | `#e3e7ee` | `#2d3036` | hairlines |
| `--rule-2` | `#cdd3dc` | `#3b3f46` | field borders, stronger rules |
| `--blue` | `#2a6ad1` (5.1:1) | `#82abff` (7.4:1) | blue pencil: review notes, AI, focus, selected |
| `--blue-mark` | `#3c8ff6` | `#5d95f4` | underlines, brackets, fills |
| `--blue-wash` | blue 9% on paper | blue 16% | selected rows, active chips |
| `--red` | `#c8380b` (4.9:1) | `#ff8a63` (6.9:1) | red pencil: the spend, spelling, over a limit |
| `--red-mark` | `#fb4712` | `#ff6a3d` | squiggles, strike-throughs in Trim |
| `--highlight` | `#f4f19c` | `#4b4a22` | selection, the phrase of the note you're on |

Periwinkle and teal from the seed are not used: two pencils and a highlighter are enough.
Notion's nine colors stay as they are for text the writer colors on purpose.

### Type

- **Page:** Source Serif 4 (Google Fonts, optical-size axis 8–60). A transitional proof face
  built for long reading; its optical sizes give headings a display cut and body text a sturdy
  text cut without picking two families. Cooler and crisper than Literata, which suits cool paper.
  20px on a computer, 18px on a phone, leading 1.6, paragraph gap 0.65em (13px).
  Option in Settings: Courier Prime, the old typewriter.
- **UI and margin notes:** `system-ui` (SF Pro on Apple, Segoe UI on Windows). Sizes and
  tracking follow the SF table: 11px +0.06px, 12px 0, 13px −0.08px, 15px −0.23px, 17px −0.4px,
  22px −0.5px, 28px −0.6px. Money and counts use tabular figures.
- **The running head:** the draft title in the spine is set in the page serif, italic, 15px, like
  the slug line on a galley. It is the only serif in the chrome.
- **Measure:** Basic 62ch, LinkedIn 52ch, X 43ch, Substack 70ch (of the page font).

### Spacing and radius (Fibonacci)

- Spacing steps: 2, 3, 5, 8, 13, 21, 34, 55, 89 px (`--s1`…`--s9`).
- Margin width 233px, gap from the text 55px, block handles 55px left of the text, page top 89px.
- Radius: 3 (marks), 5 (chips, keys), 8 (buttons, fields, rows), 13 (menus, popovers, cards),
  21 (phone sheets' top corners). Heights: 34 (compact buttons), 44 (touch targets, the spine).

### Motion

- One spring, critically damped (damping 1.0, response 0.32s), for the margin notes moving to
  their lines, sheets settling, popovers growing from their source. CSS transitions use the
  same curve sampled into `linear()`; gestures use a JS spring that starts from the on-screen
  value and inherits the finger's velocity.
- Bounce (damping 0.8) only when a sheet is flicked.
- The lens: marks cross-fade in 200ms; margin notes fade in and slide 8px from the right.
- Press: buttons scale to 0.97 on pointer-down.
- Reduced motion: only cross-fades. Reduced transparency: the spine and sheets go solid.
  More contrast: stronger rules, ink-3 becomes ink-2.

## Layout

### Computer (≥ 1080px)

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ The ten dollar rule ⌄   ● Draft 2                          $1,120 of $2,000  ●  ⋯  │ spine 44
│                                                                                     │
│                                                              Review  Notes  Overflow │ (only when
│                                                              Grade 6, easy to read   │  the margin
│               # The ten dollar rule                                                  │  is open)
│               Every word you type costs ten dollars.                                 │
│          ⌈    Most people write long sentences because      Hard to read             │
│          ⌊    they are afraid that short ones will…         21 words                 │
│               The report was written by a committee          Passive: was written    │
│               in order to utilize every possible word.       in order to  to         │
│               ‾‾‾‾‾‾‾‾‾‾‾      ‾‾‾‾‾‾‾                         utilize  use            │
│                                                                                     │
│         ⋮⋮ +  (block handle, on hover)                        ┌ Challenge card ┐    │ pinned at
│                                                               └────────────────┘    │ the margin foot
└─────────────────────────────────────────────────────────────────────────────────────┘
      55px gutter      text column (62ch)          55px     margin 233px
```

The text column is centered when the window has room for the margin on its right; otherwise it
sits left of center so the margin fits. Its position depends only on the window and the format,
never on whether the review is on.

### Phone (< 1080px; the same on a tablet in portrait)

```
┌──────────────────────────────┐
│ The ten dollar r… ⌄  $1,120 ⋯│ spine 44 + safe area
│                              │
│ # The ten dollar rule        │
│ Every word you type costs    │
│ ten dollars.                 │
│ Most people write long       │
│ sentences because they are   │
│ [Hard to read] [Passive]     │ ← pencil chips under their paragraph (review on)
│                              │
├──────────────────────────────┤
│            ───               │ bottom sheet: grabber, drag, flick
│ Passive: was written         │
│ Say who did what.            │
│ [Rewrite with AI]  Hide these│
└──────────────────────────────┘
```

## Where every feature lives now

| Feature | Old place | New place | How you reach it |
| --- | --- | --- | --- |
| Write / Edit | Write/Edit switch, ⌘E | Review is a lens on the same page | ⌘E, palette "Review", the spend's popover |
| Spend and budget | Edit panel register | Spine, right, in red pencil | always visible; click for words, characters, reading time, grade and budget presets |
| Readability grade | Edit panel | Spend popover; margin head while reviewing | click the spend, or Review |
| Fixes (spelling, hard, wordy, passive, adverbs, weakeners) | Highlights + panel list + tip popover | Pencil marks on the text, notes in the margin | Review; hover or click a note or a mark |
| Hide a kind of fix | Eye on each fix row | "Hide these" on a note; Settings → Writing lists all kinds | margin note, Settings |
| AI rewrite of a fix | Tip popover | The note's "Rewrite with AI"; results become alternatives | margin note |
| Check the message | Edit panel button | Palette, and the margin head while reviewing; answer in a margin card | ⌘K "message" |
| Drafts drawer and Notion properties | Left drawer | Drafts switcher under the title; the open draft's properties at its top | click the title, ⌘O, palette |
| New draft | Drawer button | Switcher, palette | ⌘⌥N, palette |
| Formats | Segmented control in the bar | Palette "Format" group | ⌘K "x", "linkedin" |
| No backspace | Switch in the bar | Palette toggle (shows On/Off) | ⌘K "backspace" |
| Full screen | Bar button | Palette | ⌘K "full" |
| Settings | Sliders icon, long modal | Palette, two-column sheet (push list on a phone) | ⌘, or palette |
| Shortcuts | Keyboard icon | Palette "Shortcuts", ⌃? | palette |
| Save .md / Open / Post to X | Three icons bottom left | Palette "Share" group | palette, ⌃⇧P |
| Live word count | Faint text top left | Spend popover and tooltip, palette footer | hover or click the spend |
| Lab checks | Dashed LAB button, popup | Palette "Review" group; marks plus margin notes with the reason; a margin card with Done | ⌘K "lab", ⌃⇧L |
| Trim | Lab popup row | Palette "Review" group; margin card "112 → 86 words, $260 saved" with Make the cuts / Walk through / Keep all | ⌘K "trim" |
| Challenges | Dashed CHALLENGE button, menu, picker | Palette "Challenge" group (roll, combo, today's, pick, difficulty); a pinned margin card with live checks | ⌘K "challenge" |
| Alternatives | Left panel, page dims | In the margin beside the line (a sheet on a phone); quick list under the text from the pager dots | ⌃⇧A, selection bar, palette |
| Overflow | Right panel, bottom-right link | Margin view "Overflow" | ⌃⇧O, switcher, palette |
| Stash to Overflow | Right-click, ⌃⇧X | Same, plus palette and selection bar's More | ⌃⇧X |
| Ghost it | Right-click, ⌃/ | Same, plus selection bar's More | ⌃/ |
| Notes and AI threads | Card beside text, right panel, pins | Margin view "Notes": each note beside its words; pins in the margin when closed | ⌃⇧M, selection bar, switcher |
| Colors | Bar "A", block menu, "/" | Selection bar's More → Color, block menu, "/" | unchanged |
| Block handle, "/" menu, block menu | Left of the text | Same place, quieter | hover |
| Selection bar | 12 controls | Ask AI, Alternatives, Note, Bold, Italic, Link, More | select text |
| Right-click menu | Menu with an empty check column | Same items, no check column | right-click |
| LinkedIn fold | Ticks in the text, labels to the right | Ticks in the text, red-pencil "…see more" notes in the margin | Review with LinkedIn |
| X threads | Post windows | Post windows, quieter | unchanged |
| Sync status | Text in the bar | A dot after the spend (menu with the status) | spine |
| Account, Gemini, Notion, sound, look | One long settings modal | Settings sheet sections: Writing, Look, Sound, Budget, Notion, AI, Account | palette |

## Pebbles fixed

- No popover covers the text it is about: every fix explains itself in the margin.
- Sentence problems are a bracket in the gutter, not a colored block over the words.
- Menus have no empty check column; a check shows only beside the chosen item.
- The selection bar has seven controls, not twelve; strikethrough, code, color and turn into
  move to its More menu.
- No dashed placeholder boxes, no floating counts, no keyboard icon, no dock.
- Toasts confirm what you just did (Saved, Deleted with Undo, Cut 26 words with Undo); the
  instructional first-run and X-thread toasts are gone.
- The disabled AI button is gone: without a key, an AI action says "Add a Gemini key" and
  opens the right settings section.
- The Lab is not called "The Lab guide…"; its checks are plain verbs in the palette.
- Alternatives explain themselves with key caps, not a middle-dot string.
- Settings opens on Writing, not on a sign-in form; Account is last.
- The drafts switcher fits its content; the current draft is marked with a blue tick, not a
  big teal pill.
- Dark mode is graphite with chalk ink and lightened pencils, and it follows the system.
- The first run is an empty page, one line of placeholder and the spine.

## Removed, and why

- **The Write/Edit switch:** review is a lens, so there's nothing to switch between.
- **The dock (save/open/X icons, LAB, CHALLENGE, Notes, Overflow links):** all in the palette.
- **The keyboard icon and the floating live count:** shortcuts and counts are in the palette
  and the spend's popover.
- **The Edit desk color and the card-on-desk look:** the page is the page.
- **Skins Ditto and Typewriter as looks:** there is one look with a light and a dark theme;
  Typewriter survives as a writing-font option. Old settings map: Night desk → Dark,
  "Night desk when dark" → System; Ditto and Typewriter → System with the serif page.
- **First-run and thread tip toasts.**
- **Per-row Notion property editing for every draft in the list:** only the open draft's
  properties are editable in the switcher (other rows show their stage).

## Review of the plan against the brief

- First draft had a blue primary button everywhere; that reads as generic SaaS blue. Primary
  buttons are graphite now; blue is reserved for the pencil's voice (notes, focus, chosen).
- First draft drew notes as bordered cards; that is the SaaS card kit. Notes are now bare text
  with a short pencil tick, like writing in a margin; only an opened note becomes a small
  sheet of paper, because it floats over the notes below it.
- Category labels as small caps over every margin section were the "eyebrow" tell; the margin
  head is sentence-case tabs and nothing else.
- Meta strings joined by middle dots (draft rows, counts) became separate, aligned spans.
- The spend was going to be a big number in a panel; it's a small red figure in the spine
  instead, always there, which matters more than size.
- A wordy-phrase fix shows as a proofreader would mark it: the old words struck in graphite,
  the new word in blue, instead of an arrow.
- Kept the boldness to one place, the margin and its two pencils; the spine, palette and
  sheets are quiet system UI.

## For the owner to decide

- ⌘K opens the command palette; with words selected it still links them.
- Typewriter (Courier Prime) is a writing-font option; the default page is Source Serif.
- Only the open draft's Notion properties are editable in the switcher.
- No backspace blocks deleting only while writing; reviewing can always delete (as before).
- New shortcuts: ⌘O drafts, ⌘⌥N new draft, ⌘, settings.
