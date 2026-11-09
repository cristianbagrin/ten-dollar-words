# PLAN v5: the redesign, three directions

The brief: redo the whole design language. It looks and feels bad, and the UX is bad. Nothing
is fixed. Build three directions, have independent graders score them, iterate until each
consistently scores 8/10 or better, then pick one and delete the others.

## 1. What's wrong now (audit of 2.1.0)

Screenshots of every state were taken before any change.

### Mountains (structure and flow)
1. **No spatial model.** Things live in about twelve places: a count top-left, a keyboard icon
   top-right, a top bar with nine controls, save/open/X icons bottom-left, dashed LAB and
   CHALLENGE boxes bottom-center, Notes and Overflow text links bottom-right, Alternatives in a
   left panel, Overflow in a right panel, the Edit panel on the right, a challenge card
   bottom-left, the Lab popover in the middle, toasts bottom-center. You can't predict where
   anything is.
2. **Two modes that feel like two apps.** Write is a blank page with a hidden bar; Edit is a
   khaki desk, a card and a panel. Switching moves the column about 170px sideways and changes
   its width.
3. **The bar hides in Write mode,** so on a computer nothing says it exists; on a phone a faded
   Write/Edit pill floats over the page.
4. **The money, the app's whole idea, only shows in Edit mode,** as a number in a sidebar.
5. **Every feature invented its own look:** dashed caps buttons, italic tabs (Alternatives), a
   Courier placeholder in UI chrome (Overflow), teal pills, khaki. There's no component language.
6. **Phone layout collides:** the dock sits on the text and on the Edit sheet, the sheet's
   summary overlaps its icons, the bar covers the first line, toasts cover text.
7. **Toasts as teaching:** long instructional toasts ("Each window is one post. Ctrl+Enter
   starts…") cover the page and vanish before they're read.

### Pebbles (details)
- Fix rows show empty squares that read as unchecked to-dos; one is missing its swatch.
- A tip popover covers the very text it's about; its disabled AI button looks pastel-enabled.
- The selection bar has twelve controls, including "A/B", "Text ▾" and "</>".
- The right-click menu has an empty check column; the Lab popover is titled "The Lab guide…".
- Alternatives' hint is a middle-dot string ("return adds · esc closes · ?? asks the AI").
- "No backspace" (a niche switch) and a full-screen button take prime space in the bar.
- The live count collides with the Edit sheet; the sheet's top is cut off under the bar.
- Night desk: fold labels clip, the challenge card fades over the page, the toast inverts.
- Settings is one long modal that opens on a sign-in form; skin cards are heavy.
- The Drafts drawer is mostly empty space with a big teal pill.
- The Edit desk color (#d6d2b8) reads dull.
- LAB and CHALLENGE are literally placeholders ("until the redesign").

## 2. The three directions

Each direction is a full, working copy of the app in `app/designs/<name>/`, so it can be tried
on the real site at `/designs/<name>/` with your real drafts (same origin, same storage). Each
was seeded with a random string so the look isn't the default one. Data and logic modules
(store, sync, Notion, account, vault, engine, marks, formats, inline, spell, AI, challenge
rules) stay byte-identical; the directions change markup, styles and the UI modules.

### A. Margin: one page and an editor's blue pencil
- **One mode.** Write and Edit become one page. Review is a lens (⌘E) that brings in the
  marks and a margin of notes without moving the text a pixel.
- **One spine.** A slim bar that never hides: the draft's title (opens the drafts switcher),
  the running spend ($ of budget, red when over), and one ⋯. Everything else (format, no
  backspace, Lab, Trim, challenges, Overflow, notes, save, open, post, settings, shortcuts)
  lives in a command palette (⌘K, or tap ⋯). The dock goes.
- **Notes in the margin, not popovers.** Fixes are margin notes beside their line, like an
  editor's pencil. Sentence problems get a bracket in the gutter, phrases a pencil underline,
  not pastel blocks. Alternatives open in place under the sentence.
- **Phone:** margin notes become small chips after their paragraph; the palette is a sheet.
- **Look:** cool white paper, graphite ink, blue pencil (#2a6ad1) and red pencil (#c8380b),
  a pale yellow highlighter for selection. Spacing on a Fibonacci scale. System UI font
  (SF on Apple) with a book serif for the page. Springs, no bounce.

### B. Ledger: the money is the interface
- **A register tape beside the page** prints each paragraph as a line item (words, cost),
  then subtotal, budget and balance. In Write mode it shrinks to a single figure: the
  balance, so you feel the money while you write. Click a line to jump to its paragraph.
- **Fixes are refunds.** Each fix shows what it saves where it can be measured ("in order to"
  → "to" saves $20); the tape totals the refunds available.
- **Drafts are a ledger book:** dated rows with spend against budget and Notion stages.
  Challenges read as a slip on the tape with live checks; Trim is expressed in dollars.
- **Look:** banknote paper (pale mint), navy intaglio ink, oxblood for spend and over-budget,
  slate for secondary. One guilloché motif on the tape header. Engraved figures for money.

### C. Studio: a familiar writing studio
- **Three panes, each with one job.** Left: the library (drafts grouped by Notion stage,
  search, new draft, sync). Middle: the page with a real toolbar (title, format, spend,
  export). Right: an inspector with tabs (Review, Lab, Challenge, Overflow, Notes). Every
  feature has one home and stays there.
- **Focus** (Write mode) folds both side panes away; ⌘\ and ⌘⌥I toggle each.
- **No floating popovers over text:** clicking a mark selects its fix in the inspector.
- **Phone:** the library is the home screen, a draft opens like an iOS detail view, and the
  inspector is a bottom sheet with the same tabs.
- **Look:** sage-tinted chrome, white page, emerald (#036e44) for actions, plum (#731650) for
  money, salmon washes for hard sentences. Theme (light, dark, system) is separate from the
  writing font (typewriter, serif, sans, mono).

## 3. How each direction is built and graded

1. **Infrastructure (done first):** the three copies, `tools/design-tour.mjs` (screenshots of
   about 30 fixed states on a computer and a phone, with a fake Notion so drafts have real
   stages), and `--port` on the fake Notion so tours can run side by side.
2. **Build (one designer agent per direction, in parallel, each in its own git worktree and
   its own folder):** design plan first, then implementation, then its own screenshot review.
3. **Grade (fresh agents that never see the design reasoning):** two per direction per round,
   one for visual craft and identity, one for UX and interaction. Each gets the product
   description, the rubric, the screenshots and the running app to try for itself, and
   returns a score out of 10 with ranked, specific problems.
4. **Iterate:** the designer fixes what the graders found, and fresh graders score again.
   A direction is done when **two rounds in a row have every grader at 8 or above**
   (at most five rounds; if one can't get there, I say so and what's still weak).
5. **Compare:** one page with the three directions side by side (same states), their scores,
   what each removes or changes, and how to try each. Then you pick.
6. **After the pick:** the chosen folder becomes `app/`, the others are deleted, the README and
   version are updated, tests pass, and it ships.

### Rubric (graders)
Each scored 1–10, plus an overall:
- **Hierarchy and clarity:** the writing is the most important thing; the spend and feedback
  read at a glance.
- **Visual craft:** type scale, tracking and measure; color harmony and contrast; spacing
  rhythm; alignment; one consistent component language; icons.
- **Identity:** distinctive and coherent for "a writing app where every word costs $10"; none
  of the template tells (cream-and-terracotta, SaaS cards, caps eyebrows, middle-dot meta
  strings, gratuitous gradients).
- **Flows:** wayfinding, discoverability, steps, interruptions (popups, toasts), feedback,
  forgiveness.
- **Interaction feel:** responds on press, interruptible, spatially consistent.
- **Phone.**
- **Accessibility:** contrast, focus, target sizes, reduced motion.

Calibration: the current app (2.1.0) is the baseline its owner calls horrible. 8 means a
polished product a design-literate writer would be glad to use daily. 10 is iA Writer or
Ulysses at their best.

## 4. Rules for every direction
- Every feature stays reachable (it may be demoted, renamed only if clearer, or merged).
  UI elements, hints, popups and redundant controls may be removed. Removals are listed for
  your decision.
- Phone is first class. Light by default; a readable dark theme that follows the system.
- Respect reduce motion, reduce transparency and increase contrast.
- Keep the APIs tests and the console use (`TDW.App.setMode`, `insertSample`, `setFormat`,
  `updateSettings`, `TDW.Dialogs.openDrafts/openSettings`, `TDW.Alts.open`,
  `TDW.Overflow.open`, `TDW.Lab.open`, `TDW.Challenges.start`, `TDW.Notes.togglePanel`,
  `TDW.Desk.toggleSheet`); in a direction without a concept, the call opens its replacement.
- Old settings values (skins) map sensibly onto each direction's own themes.
- No console errors; the app's tests still pass.
