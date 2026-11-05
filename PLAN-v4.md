# Ten Dollar Words v2.0: the writing desk (features and logic)

This plan changes v1.6. `PLAN.md`, `PLAN-v2.md` and `PLAN-v3.md` still apply unless this file says otherwise. It covers **features and logic only**. The look (colors, fonts, layout, chrome placement) gets redesigned in a later session, so any UI described here is a working placeholder in the current skins, not a design.

The source is Jason Fried's demo of his own writing tool (two screen recordings, converted into `video-examples/`). Everything in that folder that matters is copied into this file. The folder is deleted when the work is done; it stays in git history at commit `0fe2dad` for the redesign session.

## Why: the philosophy we're copying

What the demo shows, stated as rules for this app:

1. **The writer writes. The tool never rewrites behind your back.** AI marks, suggests, and offers options. It never puts words on the page unless you pick them. Trim dims and doesn't rewrite. The Lab marks and doesn't fix. ("It's not rewriting anything for me. I don't want it to do that.")
2. **Nothing is destructive.** Not sure about a passage? Ghost it, don't delete it. Spare writing? Stash it, don't scroll it to the bottom. Alternatives keep the versions you didn't pick. Undo brings back anything, including AI suggestions and deleted alternatives.
3. **Judge in context.** Every option is read in its place in the sentence, and the sentence reflows as you go. AI suggestions use the sentence and paragraph around them, so they aren't a thesaurus.
4. **Provenance.** You always know what you wrote and what a machine wrote.
5. **Quiet by default.** Marks are subtle (a squiggle, a few dots). Panels open when asked and close with Esc.
6. **Opinionated, with fewer features.** Saying no counts as a feature (his joke about building "a feature that prevents me from posting on LinkedIn"). We add only what the demo shows, and we let these features take over jobs that older features do worse (section 9).
7. **Great software is fun.** Small touches: the "??" dance, a/an fixing itself, the pager dots.

## 1. The core: anchored annotations

Alternatives, ghosts, Lab marks and trim marks are all **ranges laid over the draft's text**. The text stays plain markdown, as now. Notion and the account see clean text.

```js
draft.alts = [{
  id, kind: 'word' | 'sentence' | 'paragraph',   // the title is its first line, so it's a sentence or paragraph
  start, end,                                     // markdown offsets of the version now on the page
  options: [{ text, by: 'me' | 'ai' }],           // options[0] is the original
  active                                          // index of the version now on the page
}];
draft.ghosts = [{ id, start, end }];
draft.overflow = '';                              // markdown, same line rules as the draft
```

- **Kept in step with edits.** The editor already shifts `fxMarks`, `sentMarks` and `wordMarks` on every change (`shift()` in `editor.js`). Alts and ghosts use the same path. Typing inside an alt span rewrites `options[active]` to match, so editing the word in the page and editing it in the panel are the same thing. If an edit deletes the whole span, the alt goes.
- **Undo.** Editor history records alts and ghosts with the text, so one ⌘Z undoes a swap, an AI fill, a ghost or a stash, both text and marks.
- **Saved** in `store.js` (normalize, with bounds checks) and carried by the account for Notion drafts, next to format/budget/message/nb (`account.js` `metaOf`). Cap: 200 alts per draft, 20 options per alt. Overflow counts toward the account's 700 KB document. It gets a soft cap of 50 KB per draft, with a toast.
- **Text changed in Notion.** When sync brings in new text, each alt is re-anchored: look for `options[active].text` near its old offset (paragraph first, then the whole draft). If it isn't found, the alt is dropped and its options are put into Overflow as one line ("struggle / tension / pressure"), so nothing is lost. Ghosts re-anchor the same way, or come from Notion directly (section 3).
- **Tests:** shifting through inserts, deletes and replaces at every boundary, undo/redo round trips, re-anchoring after remote edits, normalize on bad data.

## 2. Alternatives

### 2.1 In the page
- A span with alternatives gets a faint squiggly underline and, under its last characters, a **pager**: one tiny dot per option, the active one filled. Index 0 is the original, so a filled dot that isn't first tells you you're on a variation. A paragraph alt uses a thin vertical line in the left margin, with the dots stacked on it.
- **Cycling:** with the pointer over the span (or the caret inside it, so the keyboard works alone), ↑/↓ steps through options in place, and the text reflows. Plain ↑/↓ moves the caret as usual unless the pointer is hovering a span. With the caret inside, use **Alt+↑/↓**. ⌘/Ctrl+↑/↓ is taken by the OS.
- **a/an follows the swap.** If the word before the span is `a`/`an` (any case), fix it for the new option's first word. Use a vowel-sound rule plus an exceptions list (hour, honest, heir, one, once, unicorn, user, euro…, acronyms such as "an FAQ"/"a URL" by letter sound). This is one undo step with the swap. Tests cover it.

### 2.2 The alternatives panel (left)
- Opens from **Ctrl+Shift+A**, the context menu, or a click on an underlined span. Tabs: **Word | Sentence | Paragraph**. The default is the scope of the selection, or the word at the caret. Switching tabs re-targets to the sentence or paragraph around the caret. The rest of the page dims while it's open.
- Rows: a filled dot on the active option, a small square on yours, a robot on AI ones. The last row is always an empty entry.
- **Live preview:** ↑/↓ in the list swaps the page text as you move. Typing in a row updates the page as you type. **Return** adds the typed option and opens a fresh empty row. **Esc** closes and keeps whatever is on the page.
- **Delete:** Backspace on an empty row, or ⌘/Ctrl+Backspace on any row, removes that option. Undo brings it back. When only the original remains, the alt goes and so does the underline.
- **`??`** typed as an entry asks the AI for more (section 5). The row "does a little dance" (a pulsing ellipsis) while it waits.
- On a phone the panel is a bottom sheet. Tap an underlined span to open it. Swipe or tap rows to preview. There's no hover cycling.

## 3. Ghost it / Revive

- Select text, then right-click **Ghost it** (Ctrl+/). The text drops to about 10% opacity and stays in the document and editable. Right-click on ghosted text gives **Revive**. Ctrl+/ toggles.
- Ghosted text is **left out of** the word count, the $ spent, readability, spelling, the LinkedIn fold and X counts, copying for a platform, Save, and Post to X. It's the same as cut for every purpose except your eyes.
- **No backspace mode:** Ghost it still works when deleting is blocked. It fits that rule: you can't delete, but you can set aside.
- **Notion:** ghosted text goes to Notion as **gray-colored text**. `notion-map.js` already keeps color per character, so gray text coming back from Notion is read as a ghost. Ghosts then survive a round trip and show up in Notion. (Option: leave ghosted text out of Notion altogether. See open questions.)

## 4. Overflow (right panel)

- A per-draft scratch area for cut passages, notes, links, words you like, outlines. It uses the same editor rules (markdown-lite, one line per paragraph) in a second, simple instance.
- Toggle with a button (bottom right for now) or **Ctrl+Shift+O**.
- **Stash this in Overflow** (Ctrl+Shift+X, context menu): moves the selection out of the page and onto the top of Overflow. This is one undo step, and it works in No backspace mode, because the text isn't lost.
- **Use it:** put the caret on an Overflow paragraph and press **Ctrl+Return**, and it's inserted at the page's caret. Drag a paragraph into the page. Copy and paste works too. The panel footer says "ctrl+return or drag into the page to use".
- It doesn't count toward words or $, and it isn't spellchecked.
- Not sent to Notion by default (it isn't part of the post). The account carries it. See open questions.

## 5. AI alternatives

- **Context menu "AI alternatives for selection"** (Ctrl+Shift+G) and **`??`** in the panel both call a new `alternatives` feature in `ai.js`. Input: the span, its kind, the sentence, the paragraph, the title, and the options so far, so it doesn't repeat them. Output: 5 options (3 for paragraphs) that fit when swapped in, in the writer's voice, not synonyms out of context. Options go in with `by: 'ai'`. Undo removes them.
- Uses the existing Gemini client, model fallback, timeout, and mock (`ai-mock.js` gets an `alternatives` response for tests).
- **The existing AI rewrite tips feed alternatives.** Today the popover's Simplify, Active voice and Stronger word options replace text when you click one. Instead, they fill the sentence or word's alternatives (robot-marked) and open the panel, so you read each one in place and the original stays as option 0. That keeps rule 1.

## 6. The Lab

A **LAB** button (bottom center for now, plus Ctrl+Shift+L) opens a popup, "The Lab guide… what each idea does". Each item only **marks** text. Click a mark to see why. Marks clear when you edit that text, on Done, or on Esc.

| Item | How | Notes |
|---|---|---|
| Fix punctuation and typos | Local spellcheck plus AI for punctuation | Marks each spot. A click offers the fix, one at a time. It never batch-applies. |
| Mark the weakest sentences | AI | Up to 5, exact quotes plus a reason |
| Mark sentences that run long | Local (engine: hard / very hard) | Instant, no key needed |
| Mark convoluted sentences | AI | Exact quotes plus a reason |
| Mark words that don't fit the tone | AI | Words or phrases plus the tone they break |
| Mark hedges and filler | Local (qualifiers, wordy phrases, adverbs) plus AI | |

AI marks come back as exact quotes and are placed by matching (the same approach as today's `tighten`, which requires `find` to be unique). Quotes that can't be found are dropped.

### 6.1 Trim
Under the list: **Original · Slight trim ~10% · Tighten more ~20% · Even sharper ~30% · Cut in half ~50%**.
- Picking a level asks the AI for **deletions only**: exact quotes to remove, adding up to about that share of words, each leaving grammatical text. A cut must never need a rewrite to work. If it would, skip it. This replaces today's `tighten` prompt, which allowed replacements.
- Cuts show in the ghost look (a separate trim layer, so they don't mix with your own ghosts). A small card shows "Slight trim · 535 → 480 words · −10%" and "Faded words would go. Click one to keep it."
- **Click a faded cut** to keep it (it un-dims and the count updates).
- **Make the cuts:** deletes every remaining cut in one undo step (coin sound, as now).
- **Walk through:** steps cut by cut. The page scrolls to each one. **Return**/Y cuts, **Backspace**/N keeps (say "maybe not"), Esc stops.
- **Done** or **Original:** clears the marks and leaves the text unchanged. Each level's result is cached until the text changes, so switching back and forth is instant.
- Ghosted text isn't sent and isn't counted.

## 7. Small things from the demo

- **Live count:** "535 words 3116 chars", or "34 words 182 chars selected" while text is selected. It leaves out ghosts. Where it sits is up to the redesign. For now it goes in the top bar next to save status.
- **Context menu** (right-click on the page, or long-press on a phone), with shortcut hints: Alternatives for selection (Ctrl+Shift+A), AI alternatives for selection (Ctrl+Shift+G), Ghost it / Revive (Ctrl+/), Stash this in Overflow (Ctrl+Shift+X). It replaces the browser menu only on the editor. Cut, copy and paste stay in it.
- **Save / Open:** Save downloads the draft as `.md`, without ghosts; alternatives keep their active version. Open imports a `.md`/`.txt` as a new draft.
- **Post to X** (Ctrl+Shift+P): opens `x.com/intent/post?text=…` with the platform copy (Unicode bold and italics, no ghosts). For an X thread, it opens the first post and copies the rest, with a toast. No LinkedIn button, on purpose.
- **Shortcuts sheet:** the keyboard icon at the top right in the demo. It lists every shortcut (the same list as in Settings).
- **Shortcut keys:** **Ctrl** on every platform, as in the demo. Ctrl+Shift+A/G/X/P/L/O and Ctrl+/ don't clash with ⌘ shortcuts on a Mac. On Windows/Linux, check each against the browser (Ctrl+Shift+A is Chrome's tab search on some builds; fall back to Alt+Shift+A if it gets swallowed).

## 8. Edge cases to get right

- Alts inside X threads: a span can't cross a post divider. Stashing a whole post removes the post.
- An alt span and a ghost overlapping: ghosting a span that has alternatives ghosts whatever is on the page. Cycling a ghosted alt keeps it ghosted.
- Two alts can't overlap. Making an alt over an existing one re-targets to it. Nested kinds (a word alt inside a sentence alt) are allowed. Swapping the sentence drops the word alts inside it, and undo restores them.
- Formatting inside options (bold, links): options are markdown-lite, so bold survives.
- Opaque Notion blocks (`⟦image⟧`) can't take alts, ghosts or stashes.
- Two tabs: annotations ride along with the text through the existing open-draft rules.

## 9. What these replace (proposed cuts, per rule 6)

- **"Cut the cost"** (AI rewrites in a list) → **Trim** (dims, deletions only).
- **AI options that replace text in tips** → they feed **alternatives** (section 5).
- **The Edit-mode fix list** (spelling, hard sentences, wordy phrases, passive, adverbs, weakeners always highlighted) → these become **Lab items you turn on when you want them**, rather than highlights that are always on. Spelling stays always on.
- **Kept:** the $ budget (the app's identity), formats, Notion sync, accounts, sounds, skins, No backspace, Check the message (it judges and doesn't rewrite, so it moves into the Lab as its last item).
- Write vs Edit mode: alternatives, ghosts and Overflow work in **both** modes. The Lab and the $ register stay in Edit mode until the redesign decides whether two modes survive.

## 10. Order of work

Each step is committed and tested on its own. Steps 3 to 6 can run as parallel worktrees once step 1 lands, because they touch separate files.

1. **Annotations core:** data model, shift, undo, store, account, Notion re-anchoring, tests. (`editor.js`, `store.js`, `account.js`, `sync.js`)
2. **Alternatives without AI:** pager rendering, cycling, the panel, a/an, delete/undo, phone sheet. (new `alts.js`, `editor.js` render layer)
3. **Ghost and context menu:** gray in Notion, counts that leave ghosts out, copy/export without ghosts. (new `menu.js`, `engine.js` input, `formats.js`, `notion-map.js`)
4. **Overflow.** (new `overflow.js`)
5. **AI alternatives:** the `??` feature, tips feeding alternatives, the mock. (`ai.js`, `ai-mock.js`, `popover.js`)
6. **The Lab and Trim.** (new `lab.js`, `ai.js`, retire the fix list and Cut the cost in `panel.js`)
7. **Small things:** live count, save/open, post to X, shortcuts sheet. Then README, version 2.0.0, SW precache, full test run, drive it in the browser with Playwright, delete `video-examples/`, merge, deploy, and check the live version.

## Not doing (yet)
- The M↓ and three-dot icons at top center in the demo. They're never clicked, so what they do is unknown.
- The demo's look (dark navy, monospace, handwritten tabs). That's for the redesign session.
- Posting to LinkedIn.
