# Video examples: writing-tool demo (read this first)

Two screen recordings of the same writing app being demoed, converted into text and stills so you can work without watching video. Chris wants these as **examples of features he wants in his own app**.

## What the videos are
- Screen recordings of an X (Twitter) video post playing full screen. The 0:00 frame of example 1 shows an X search for "jason fried", so the demo is most likely Jason Fried's (37signals) personal writing tool. The speaker is never named in the audio. This is an inference from the screen.
- Timestamps in all files are accurate to about plus or minus 2 seconds. Both are partial clips. Example 1 starts around 0:34 of a 6:55 video and ends around 6:32. Example 2 starts at 0:22 of a 1:26 video. Both open mid-sentence, so anything said before is missing.
- The footage has burned-in captions from the X player. They are not part of the app.
- The demo document is Jason Fried's essay "The Obvious, the Easy, and the Possible". The text is only a prop.

## Files
| File | What it is |
|---|---|
| `example-1/walkthrough.md` | The main document. Timestamped feature-by-feature description with the key frames embedded (6:04 clip) |
| `example-2/walkthrough.md` | Same for the short clip (1:05): typing your own alternatives, AI "??" suggestions, deleting |
| `example-1/transcript.md`, `example-2/transcript.md` | Full speech transcripts with timestamps |
| `example-1/frames/`, `example-2/frames/` | Key stills, named `<seconds>s-<what-it-shows>.jpg` (2400 px wide) |
| `example-1/detail-crops/` | Native-resolution crops of small UI (menus, panels, icons) that are unreadable in the full frames |
| `contact-sheets/` | Every 3 seconds of both videos as 3x3 grids with second labels (`s1_*` = example 1, `s2_*` = example 2). Use these to find a moment the key frames skip |
| `_to_delete/` | Stray files from my own extraction mistakes. Safe to delete |

The original `.mov` files sit one folder up. You should not need them.

## Feature inventory (what the demo shows)
All of this comes from the videos. Nothing is added by me and nothing is a spec, only observed behavior.

1. **Alternatives for words, sentences, paragraphs (and the title).** Any piece of text can carry alternate versions. Text that has alternates gets a subtle squiggly underline with a few dots at the end. Hover and use the arrow keys to cycle through them in place. A side panel (left) lists them under tabs Word / Sentence / Paragraph.
2. **Your own alternatives.** Open the panel by keyboard shortcut or by clicking the word, type a new entry in the list, press Return to add it, Esc to close. The text in the document updates live as you arrow through the list or type, so you read each option in context.
3. **Provenance markers and position dots.** In the side-panel list, a small square marks an entry he wrote, a robot icon marks an AI entry, and a filled blue dot marks the entry currently on the page. In the document, a text span with alternates has a row of tiny dots under (or after) it, like a carousel pager. The filled dot shows which alternative is active, so the "dot in the middle" he mentions is the pager showing you are on a middle variation, not the first. Paragraphs with alternates get a thin vertical line in the left margin with the same pager dots.
4. **AI alternatives, on demand.** Context menu item "AI alternatives for selection". Typing `??` as a new list entry also asks the AI for more. The AI uses the surrounding sentence and paragraph, so it is not a thesaurus. Undo removes AI suggestions. When no alternates remain, the underline disappears.
5. **Grammar follows the swap.** "a thumbtack" becomes "an eraser" automatically when the alternate starts with a vowel.
6. **Ghost it / revive.** Select text, right-click, "Ghost it". It drops to about 10% opacity but stays in the document, so you can judge the paragraph without it. Right-click, "revive" brings it back.
7. **Overflow panel.** A right-side panel for text you want to keep nearby but not in the document: cut passages, notes, links, outlines. Move selected text there with "Stash this in Overflow". Bring it back by copy and paste, drag, or Ctrl+Return. It replaces dumping spare paragraphs at the bottom of the document.
8. **Right-click menu** with four items and keyboard shortcuts (shown in `example-1/detail-crops/context-menu-0355s.jpg`): Alternatives for selection (Ctrl+Shift+A), AI alternatives for selection (Ctrl+Shift+G), Ghost it (Ctrl+/), Stash this in Overflow (Ctrl+Shift+X).
9. **The Lab (his temporary name).** A dashed "LAB" button bottom center opens a guide list of AI checks that only mark text and never rewrite it: fix punctuation and typos, mark weakest sentences, mark sentences that run long, mark convoluted sentences, mark words that don't fit the tone, mark hedges and filler.
10. **Trim levels.** Below the Lab list: Original, Slight trim (~10%), Tighten more (~20%), Even sharper (~30%), Cut in half (~50%). Choosing one makes the AI dim the passages it would cut, using the same ghost look. A small bar shows the word count change and the actions Make the cuts / Walk through / Done. Faded text can be clicked to keep it.
11. **Minimal chrome.** Top left: a faint live word and character count ("535 words 3116 chars"; becomes "34 words 182 chars selected" when text is selected). Top center: two small icons (a three-dot icon and an "M↓" markdown icon). Top right: a keyboard icon. Bottom left: save, open, post to X (tooltip "Ctrl+Shift+P") and, until he removes it on camera, a LinkedIn icon. Bottom center: the dashed LAB button. Bottom right: an "XYZ" icon that toggles Overflow. Hovering an icon shows a faint shortcut hint. The LinkedIn icon disappears around 4:05 as a joke ("a feature that prevents me from posting on LinkedIn").
12. **Look.** Dark navy background, one monospace face, a narrow centered text column, a bold headline with a thin underline, small handwritten-style tab labels (Word / Sentence / Paragraph) in the side panel.

## Things I could not determine from the footage
- What the two small icons at top center and the keyboard icon at top right do (never clicked; the M↓ one is probably a markdown toggle, which is a guess).
- Exact shortcut to open the side panel (he says "the keyboard equivalent" and does not say which).
- Word counts in the trim bar are partly hidden by a caption. Roughly 535 to 480 words for Slight trim.
- How the AI is called (model, key, latency). Nothing about the stack was shown.
