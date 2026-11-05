# Example 1: full demo walkthrough (6:04)

Timestamps are seconds into `example-1.mov` (m:ss). Frames are in `frames/`, small-UI crops in `detail-crops/`. The full speech is in `transcript.md`. For any gap, check `../contact-sheets/s1_*.jpg` (every 3 s).

The screen is a dark, minimal writing editor showing an essay. The speaker narrates over it.

## 0:00 Context
![X post](frames/0000s-x-post-context.jpg)
The recording opens on an X page (search "jason fried") with the demo video embedded in a post. By 0:03 the video goes full screen and the editor fills the screen.

## 0:06 The base editor
![clean editor](frames/0006s-clean-editor.jpg)
Narrow centered column, monospace text, bold underlined headline, near-empty chrome. Tiny icons at the bottom corners and a "LAB" button bottom center. Nothing else on screen.

## 0:00-0:21 Alternatives on the headline
![headline alternative](frames/0015s-headline-alternative-active.jpg)
Text that has alternate versions shows a small squiggly underline and a few dots at the end. Mouse over it and use the arrow keys to flip through the versions in place. The headline cycles "The Obvious, the Easy, and the Possible" / "The Three Possibilities" / "The Clear, the Easy, the Achievable". He says he will keep one of them "because that's what I prefer at the moment", and by 0:21 the original headline is back.

## 0:21-0:38 Word-level alternatives, in context
![underline on word](frames/0030s-word-underline-hover.jpg)
![inline cycle](frames/0033s-inline-cycle-difficulty.jpg)
The word "tension" has the same underline. Cycling swaps it for pressure, uncertainty, difficulty, struggle directly in the sentence ("I wrote these alternatives"). The sentence reflows around each choice.

## 0:38-0:57 Side panel and adding your own
![word alternatives panel](frames/0048s-word-alternatives-panel.jpg)
![side panel crop](detail-crops/side-panel-0048s.jpg)
A keyboard shortcut (not named) or a click on the word opens a panel on the left. Tabs across the top: **Word | Sentence | Paragraph**. The list shows tension, pressure, uncertainty, difficulty, struggle, friction, tough stuff. Left of each entry is a marker: filled blue dot (the entry currently on the page), small square (written by him, including the original), robot icon (written by AI). The rest of the document dims while the panel is open. A hint at the bottom of the panel says return adds, esc closes.
![custom alternative](frames/0054s-custom-alternative-added.jpg)
He types "challenge" as a new entry. The word in the text changes to match as he types ("Much of the challenge in product development...").

## 0:57-1:20 Previewing and the "not original" marker
![variation marker](frames/0066s-variation-dot-marker.jpg)
Arrowing up and down the list previews each option in the sentence ("I can get a feel for how they read and how they feel for real"). He leaves "struggle" in place. He points out that "the dot in the middle is highlighted. It's very subtle" and that tells him he is on a variation, not the original word. In the frame, the row of tiny dots under "struggle" has its filled dot in the middle of the row (a pager for which alternative is active). The headline and the sentence and "paperclip" below carry the same kind of dot row, and the paragraph at the bottom left has a vertical margin line with dots. When you close the panel, the document returns to normal.

## 1:20-1:36 Automatic a/an
![a/an](frames/0093s-a-an-agreement-eraser.jpg)
Second example: "paperclip" with alternates thumbtack and eraser. The article changes with the word: "like a thumbtack" becomes "like an eraser". "It automatically detects that and takes care of that for me."

## 1:36-1:44 Paragraph level
![paragraph selected](frames/0096s-paragraph-selected.jpg)
![paragraph alternative](frames/0099s-paragraph-alternative-shown.jpg)
Same behavior for a whole paragraph. The highlighted paragraph is swapped between written variants ("I can go through a variety of different variations on a paragraph").

## 1:46-2:17 Ghost it and revive
![ghost menu](frames/0132s-ghosted-text.jpg)
Why: he wants to see a paragraph without a section but does not want to delete it. Select text, right-click, "Ghost it". The selection fades to roughly 10% but stays readable. "I can see what the paragraph feels like without it." To restore: right-click and "revive". The faded block is visible in the frame above as the barely visible lines in the middle paragraph.

## 2:26-3:03 AI alternatives with provenance
![AI alternatives](frames/0159s-ai-alternatives-bot-points.jpg)
![undo AI](frames/0177s-undo-ai-alternatives.jpg)
He prefers to write his own, but select a word, right-click, "AI alternatives for selection" and the side panel fills with more options for "calls": judgments, decisions, trade-offs, choices, bets. His entries have a small marker and the AI ones have a robot icon ("a bot point, as I'm calling it") so he can see where each suggestion came from. He undoes them and the underline disappears because no alternates remain.

## 3:03-3:54 Overflow panel
![overflow open](frames/0201s-overflow-panel-open.jpg)
![overflow crop](detail-crops/overflow-panel-0207s.jpg)
Purpose: keep extra writing nearby without cluttering the document. A button at bottom right opens a panel on the right titled **Overflow**. It holds loose paragraphs and a link. The footer hint reads "ctrl+return or drag into the page to use". He used to paste spare text at the bottom of the document and says this is "much better".
![stash menu](frames/0210s-stash-in-overflow-menu.jpg)
He selects a paragraph, right-clicks, and chooses "Stash this in Overflow". It lands in the right panel.

## 3:54-4:12 Toolbar: save, open, post to X (no LinkedIn)
![icons before](frames/0240s-toolbar-icons-before.jpg)
![icons after](frames/0249s-toolbar-no-linkedin.jpg)
![icon crop](detail-crops/bottom-left-icons-0249s.jpg)
Bottom left holds save, open (folder), post to X (hover tooltip "Ctrl+Shift+P") and a LinkedIn icon. He starts to mention LinkedIn, jokes that he built a feature that prevents him from posting there, and the LinkedIn icon is gone in the next frame, leaving three icons.

## 4:15-4:55 The Lab
![lab opens](frames/0264s-lab-popup-opens.jpg)
![lab guide](frames/0276s-lab-guide-list.jpg)
![lab crop](detail-crops/lab-guide-and-trim-bar-0276s.jpg)
The "LAB" button ("a temporary name") opens a popup titled "The Lab guide... what each idea does". It lists AI actions that only mark text: Fix punctuation and typos; Mark the weakest sentences; Mark sentences that run long; Mark convoluted sentences; Mark words that don't fit the tone; Mark hedges and filler. Example he gives: you write plain and straightforward, then use complicated language somewhere. The tool flags that word without changing it.
Under the list is a row of five buttons: **Original, Slight trim (~10%), Tighten more (~20%), Even sharper (~30%), Cut in half (~50%)**.

## 4:54-5:28 Trim
![trim reading](frames/0294s-slight-trim-reading.jpg)
![trim dimmed](frames/0303s-trim-dimmed-cuts.jpg)
![trim popup crop](detail-crops/trim-actions-popup-0303s.jpg)
Pick Slight trim. The AI scans the whole document and then dims the words and phrases it thinks could go, using the same faded look as Ghost it. It does not rewrite. A small card says "Slight trim", the word count change (about 535 to 480 words, -10%), and "Faded words would go. Click one to keep it." Buttons: **Make the cuts**, **Walk through**, **Done**. "Walk through" steps through each cut; he can also say "maybe not".
![trim result](frames/0318s-trim-result-shorter.jpg)
After Tighten more it is "about 20% shorter". He notes he can also cut it in half, "which sometimes I'll do."

## 5:28-6:00 Summary and the context menu
![context menu](detail-crops/context-menu-0355s.jpg)
He recaps: alternatives for words, sentences, paragraphs; AI suggestions if wanted; an overflow sidebar for extra writing, notes, words he likes, or an outline; the Lab; and ghosting. The right-click menu is shown at 5:55: Alternatives for selection (Ctrl+Shift+A), AI alternatives for selection (Ctrl+Shift+G), Ghost it (Ctrl+/), Stash this in Overflow (Ctrl+Shift+X).
![end state](frames/0357s-ghost-applied-end.jpg)
End state: a selected sentence has just been ghosted. His closing line: "that is basically everything I've ever wanted in a writing tool."
