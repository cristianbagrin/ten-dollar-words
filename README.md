# Ten Dollar Words

A writing app where every word costs $10. Version 3 is the Margin design (`docs/DESIGN.md`): one quiet page that never moves, a thin bar over it (the spine) with the draft's title on the left and what the words have cost so far on the right, and a review (⌘E) that arrives like an editor's pencil: hard sentences bracketed in the left gutter, phrases underlined, and short notes in the right margin beside their line. Everything else (drafts aside, formats, the Lab, Trim, challenges, Overflow, settings, sharing) is in the command palette (⌘K, or the ⋯ in the spine). Optional AI help comes from Google Gemini, and drafts can sync both ways with a Notion database.

An account (Settings → Account) keeps your Notion connection, Gemini key, settings and dictionary, so every browser you sign in to is set up at once. On a phone the app speaks phone: taps instead of clicks and typing shortcuts instead of keyboard shortcuts.

It's plain HTML, CSS, and JavaScript with no build step. The one piece that runs on a server is the account, a Netlify Function in `netlify/`.

## Reviewing

- **⌘E** (or the palette's Review this draft) turns the review on and off. The text doesn't move a pixel.
- **What each paragraph costs** stands in the left gutter, in red pencil, and under it how much of that is extra: the words its notes would cut ("$20 extra"). Rest on the figure and those words and their notes light up.
- **Every note says what fixing it saves.** Wordy phrases, adverbs and weakeners are counted exactly ("in order to" → "to" saves $20). Long sentences and passive voice are estimated and shown with a ~: a hard sentence usually loses about a fifth of its words when it's tightened, a very hard one about a third, and active voice drops the helper verb (and "by" when the doer is named). Inside a long sentence the paragraph counts the sentence's estimate or the smaller fixes in it, whichever is bigger, not both. Opening a note explains its estimate.
- **× on a note** ignores that one note in that draft, with Undo. It comes back only if the sentence is rewritten; the palette brings all ignored notes back. "Hide weakeners" (and the like) in an opened note hides a whole kind.
- **The grade** at the head of the margin opens a ruler on hover: "written for an 11-year-old", the draft's mark on a scale from 1 to 16, a dot per paragraph (rest on one and its paragraph lights up), and a children's novel, everyday adult reading, a broadsheet and an academic paper for comparison.
- **Pencil or highlighter.** Marks are pencil by default: underlines and gutter brackets. Highlighter is a light, hand-drawn band in a color per kind. Switch in Settings → Look, the palette's Review marks, or the two small buttons at the head of the margin.
- **Drafts** is a sidebar like Notion's: rest the pointer on the left edge, or click the title (⌘O) to keep it open. Group, sort and filter it; click any property chip to change it.

On a phone, notes become chips under their paragraph, and a tap opens them in a sheet.

## The editor, like Notion

Version 2.1 makes the page work like Notion's: every line is a block you can grab, turn into something else, color, comment on, or ask the AI about.

- **Block handles.** Hover a block: a **+** and a grip (⋮⋮) appear in the left margin. **+** adds a block under it and opens the command menu (Alt+click adds one above). Drag the grip to move the block, or the selected blocks; a blue line shows where it lands. Click the grip for the block menu: Turn into, Color, Ask AI, Alternatives for this paragraph, Add a note, Duplicate, Move up, Move down, Delete.
- **The "/" menu.** Type **/** at the start of a block or after a space: Text, Heading 1–3, Bulleted list, Numbered list, To-do list, Quote, Divider, Ask AI, Alternatives, Note, and every color ("/red", "/yellow back"). Keep typing to filter, ↑/↓ to choose, Return or Tab to run, Esc to close. The empty line you're on says "Type '/' for commands".
- **The bar over a selection.** Select text and a bar appears above it: **✦ Ask AI**, **A/B** (alternatives), **Turn into**, bold, italic, strikethrough, code, link, **color** (A), **note**, and ⋯ for Ghost it, Stash and the rest. On a phone it sits under the selection, out of the way of the phone's own menu.
- **Keys.** ⌘⇧↑/↓ moves the block, ⌘D duplicates it, ⌘A selects the block (again for everything). `"` and a space starts a quote. A link pasted over selected text links it.
- **Backspace** at the start of a heading, list item, to-do or quote turns it back into text, on the first line too (Safari used to ignore it there), and with No backspace on, since nothing is deleted.

### Colors
Select text and pick a text color or a background from the bar's **A**, the block menu's Color (the whole block), or the "/" menu. **Ctrl+Shift+H** colors the selection with the last color you used, and again takes it off. They're Notion's colors, and they sync both ways: a color set in Notion shows here, and one set here shows in Notion. Gray text stays reserved for ghosts. Colors that were already in your Notion pages are kept: the app reads them once as highlights before it manages them.

### Notes for future you
Select some words and add a note: the bar's speech mark, **Ctrl+Shift+M**, right-click → Add a note, or "/note". The words get a yellow underline and a speech mark in the right margin; click either to open the note. Every note is a to-do you can tick off. If you delete the words, the note stays, pinned where they were. **Ctrl+Shift+M** with nothing selected (or the **Notes** button at the bottom right) opens the Notes panel: Open, Done or All, and a click takes you to the note. Notes stay out of Notion's text and out of the counts; signed in, your account carries them to your other devices.

### Talk to the AI about a passage
Select text and press **✦ Ask AI** (or **Ctrl+J**, or "/ai"). Type what you want, like a comment in a design tool: "other ways to say this", "make it punchier", "is this clear?", or tap one of the suggestions. The AI answers in a thread on that text, and when it suggests wording, its versions join the text's **alternatives**: click one in the thread to put it on the page, or flip through them in place with ↑/↓ (A/B, Jason Fried's way), and "Back to the original" returns. Reply to keep going. It never changes the page by itself, and the thread stays as a note you can come back to.

## The writing desk

Version 2 adds the ideas in Jason Fried's demo of his own writing tool (`docs/PLAN-v4.md`). The rule behind all of them: the tool marks, suggests and keeps things; it never rewrites your text unless you pick the words. Nothing you set aside is lost, and ⌘Z undoes all of it.

### Alternatives
Any word, sentence or paragraph (the title too) can carry other versions of itself.

- Select some text, or put the caret on a word, and press **Ctrl+Shift+A** (or right-click → Alternatives for selection). The panel opens on the left with **Word · Sentence · Paragraph** tabs; switching tabs moves to the sentence or paragraph around the same spot. The rest of the page dims.
- Type a new version in the empty row: the page changes as you type, so you read it in place. **Return** adds it, **Esc** closes and keeps what's on the page. **↑/↓** in the list tries each one in the sentence.
- A small square marks your versions, a robot the AI's, and a filled dot the one on the page.
- Type **??** as an entry (or right-click → AI alternatives for selection, **Ctrl+Shift+G**) and the AI adds more. It reads the sentence and paragraph around the text, so it's not a thesaurus. ⌘Z takes them back.
- **Backspace** on an empty row, or **⌘⌫** on any row, removes that version. When only the original is left, the underline goes.
- In the page, text with alternatives has a faint squiggle and a row of tiny dots under its end, one per version. The filled dot is the one showing; if it isn't the first, you're on a variation. A paragraph shows a thin line in the margin instead. Hover over it and press **↑/↓** to flip through the versions, or use **⌥↑/⌥↓** with the caret inside. Click the dots to open the list.
- **a/an** follows the swap: "a paperclip" becomes "an eraser" (and "an hour", "a unicorn", "an FAQ").
- The AI options in Edit-mode tips (simpler sentence, active voice, stronger word) now join the alternatives instead of replacing your text.
- Notion only gets the version on the page. Signed in, the account carries the rest to your other devices. If an edit in Notion removes the text an alternative was on, its versions go to Overflow as one line, so nothing is lost.

### Ghost it
Select text and press **Ctrl+/** (or right-click → Ghost it). It fades to about a tenth and stays in the draft, so you can see the paragraph without it. **Ctrl+/** again (or right-click → Revive) brings it back. Ghosted text doesn't count: not in the words, the dollars, the readability grade, the fold, X's count, copying for a platform, saving a file or posting. It works with No backspace on, since nothing is deleted. In Notion, ghosted text is gray, and gray text from Notion comes back ghosted.

### Overflow
A panel on the right for writing you want nearby but not in the draft: cut passages, notes, links, words you like, an outline. Open it with the button at the bottom right or **Ctrl+Shift+O**.

- **Stash this in Overflow** (**Ctrl+Shift+X**, or right-click) moves the selection, or the paragraph the caret is in, out of the page and onto the top of Overflow. It works with No backspace on, since nothing is lost, and ⌘Z brings it back.
- To use something from it, put the caret on a paragraph in Overflow and press **Ctrl+Return** to insert it at the page's caret, or drag a selection into the page.
- It doesn't count toward words or dollars and isn't spellchecked. Each draft has its own.
- In Notion it's one collapsed toggle titled "Overflow" at the bottom of the page, synced both ways. It's never part of the post's text.

### The Lab
The palette's Review group (**Ctrl+Shift+L**) lists checks that only mark text and never rewrite it: fix punctuation and typos (each mark offers its one fix when you click it), the weakest sentences, sentences that run long, convoluted sentences, words that don't fit the tone, hedges and filler, and Check the message. Each mark gets a note in the margin with the reason. Esc or Done clears the marks. Long sentences, hedges and spelling work without an AI key; the rest use Gemini.

**Trim:** Slight trim (~10%), Tighten more (~20%), Even sharper (~30%) or Cut in half (~50%). The AI dims what it would cut, and only cuts; it never rewrites. A card in the margin shows the word count before and after. Click a faded passage to keep it. **Make the cuts** removes the rest in one undo step, **Walk through** goes cut by cut (Return or Y cuts, Backspace or N keeps), and **Done** or **Original** leaves the text as it was. Trim replaces "Cut the cost".

Settings → Writing turns each kind of review note on or off.

### Writing challenges
The palette's Challenge group makes writing a game. **Roll** picks one, **Roll a combo** stacks two or three that fit together, **Pick** lists them all, and **Today's challenge** is the same all day. Easy, Medium and Hard change the numbers. A card pinned at the foot of the margin checks each rule live and stamps "Challenge met" when they all pass. Challenges never stop you typing; they only check.

- **Length and money:** exact change (land on the budget exactly), a six-word story, a 100-word drabble, tweet size, Half price (the budget halves and you cut to fit), Inflation (the budget drops $10 a minute).
- **Sentences:** short fuse, rhythm, a 1-word plus a short plus a long sentence, no two sentences starting the same, alphabet, questions first, two-sentence paragraphs, a hook in 8 words.
- **Words and grade:** grade 5, plain English, no adverbs, no weasel words, active voice only, E-Prime (no "to be"), one syllable, a lipogram, no sentence starting with "I", 3 random words, earning one rare ten-dollar word.
- **Time:** a sprint, 10 minutes with No backspace forced on, Don't stop (pause 5 seconds and your last sentence ghosts itself).
- **Adapted to your piece, with AI:** ban the obvious words, jargon jail, surprise words, an analogy from a rolled field, write toward a given last line, start in the middle, argue the other side first, explain it to a 10-year-old, a skeptic's question after each paragraph, show don't claim, one personal story, a contrarian title, a genre swap, five hooks judged blind, and write to one person. With an empty draft, it asks what the piece is about first.

A quiet streak counts the days in a row you met one. The challenge on a draft travels with it through the account; the streak and difficulty stay in this browser.

### The right-click menu
Right-click the page for Alternatives for selection, AI alternatives for selection, Ghost it / Revive, Stash this in Overflow, plus Cut, Copy and Paste. Shift+right-click gives the browser's own menu. On a touch screen, a small ⋯ button appears by the selection.

### Around the page
- The spine: the title (opens Drafts), the Notion stage, the spend against the budget (click it for words, characters, reading time and budget presets), and ⋯ for the palette. A dot after the spend shows only when sync needs you.
- The palette's Share group: **save** the draft as a Markdown file (ghosts left out, each alternative as it is on the page), **open** a `.md` or `.txt` file as a new draft, and **post to X** (**Ctrl+Shift+P**), which opens X's composer with the text the way X shows it. For a thread it opens the first post and copies the rest. There's no LinkedIn button, on purpose.
- The palette's Shortcuts (or **Ctrl+?**) lists every shortcut.
- The Ctrl shortcuts are Ctrl on a Mac too, so they don't clash with ⌘. Where a browser keeps Ctrl+Shift+A for itself, Alt+Shift+A and Alt+Shift+G work too. On Windows, strikethrough is Ctrl+Shift+S only, because Ctrl+Shift+X stashes.

## Run it locally

From this folder, run `node tools/dev-server.mjs` in Terminal, then open http://127.0.0.1:8765/. It serves the app and the account API; accounts live in memory until you stop it (add `--blobs some-folder` to keep them, after `npm install`).

`python3 -m http.server 8765 --directory app` still works for everything except accounts. (The Run button in `.claude/launch.json` can fail with "Operation not permitted", because macOS blocks the app's python3 from reading iCloud Drive. Use the Terminal command instead.)

Run the tests with `node --test tests/` from this folder. Run `npm install` once first to include the test against Netlify's local Blobs server; without it, that one test is skipped.

## Get a Gemini key

1. Go to https://aistudio.google.com/apikey and create a free key.
2. In the app, open Settings (the sliders icon), paste the key under "AI help (Gemini)", and press "Save and test". The app tries the newest Flash models and keeps the first one that answers.
3. Leave Model on **Automatic**. It uses the newest Flash model, checks once a week for a newer one, and falls back to backups when Google is busy (503) or retires a model (404): the Flash alias, the next best Flash models, then a Lite model. Pick a model from the list only if you want to pin one. The list hides models that can't write text (speech, image, robotics…).

The key is kept in this browser (localStorage) and is only ever used with Google. Signed out, you enter it once per browser and web address: it survives restarts and updates, and goes away only if you clear this site's data, remove the key in Settings, or (in Safari) leave the site unused for weeks. Signed in, your account keeps an encrypted copy, so any browser you sign in to has it. The same is true of the Notion secret. On the free tier, Google may use what you send to improve its products, so keep private client work out or use a paid key.

## Sync with Notion

1. Go to https://www.notion.so/profile/integrations, create an internal integration, and copy its secret (it starts with `ntn_`).
2. In Notion, open your posts database, click ••• → Connections, and add the integration.
3. In the app, open Settings → Notion sync, paste the secret and the database link, and press Connect.

Every page in the database shows up as a draft, and every draft with text becomes a page. Text, formatting, deletions, the title and the other properties sync both ways, about every 5 seconds while the app is open. Set Stage, Pillar, Date and the rest from the chips under each draft in the Drafts drawer. Options added in Notion show up within a minute. Text maps to Notion blocks line by line (see Formatting below). Blocks the app can't edit (images, callouts, tables…) show as a locked line like `⟦image⟧`; delete the whole line to delete the block. Mentions, colors and underlines you don't touch stay as they are.

A draft's title is its first sentence; that's what Notion's Name gets and what the Drafts drawer shows. A page that has only a title in Notion keeps it until it gets some text. In the Drafts drawer, click a draft's title to open its page in Notion, or anywhere else on the row to open it here.

If you edit the same paragraph here and in Notion at the same time, this app wins. Only one browser tab syncs at a time: the one you're looking at. The others say "Syncing in another tab" and send your edits through it. When you switch tabs or windows, syncing follows you as soon as the other tab has finished sending what it started.

An empty draft that never reached Notion is removed when you open or start another one, so the Drafts drawer doesn't fill up with "Untitled draft".

To use a different database, press Disconnect, then Connect with the new link (the same secret works if the new database is connected to the same integration). Drafts from the old database stay in the app as local copies but aren't copied into the new one; its pages stay in Notion. The app reads each database's properties when it connects, so any database with a title works; the chips follow whatever properties it has. Signed in, the switch reaches your other devices too.

## Accounts

Settings → Account → Create account, with an email and a password. Then sign in on any other browser (your phone, a second computer) and it's set up: the Notion secret and database, the Gemini key and model, every setting, your dictionary, and each Notion draft's format, budget, message and backspace switch, which Notion doesn't keep. Change something on one device and the others pick it up when you next bring the app to the front (or within 5 minutes). The drafts themselves travel through Notion, as before.

- **Private by design.** Your password never leaves the browser. It's turned into two keys there (PBKDF2, 600,000 rounds): one signs you in, and the server keeps only a scrypt hash of it; the other encrypts everything the account keeps (AES-GCM) and never leaves your devices. The server stores ciphertext it can't read, in Netlify Blobs.
- **No password reset yet.** Resetting would need email, and the server couldn't decrypt your data anyway, so let your password manager save the password. Changing it (Settings → Account) re-encrypts the account and signs your other devices out, which then sign in with the new one.
- **Signing out** takes your keys and Notion connection out of that browser. Drafts stay. **Deleting the account** removes it from the server; each browser keeps what it has.
- Sessions last a year from your last visit. Eight wrong passwords in a row lock the account for 15 minutes.
- On an iPhone, the app added to the Home Screen has its own storage, separate from Safari's, so sign in there too.

## On a phone

The app notices a phone, in the browser or from the Home Screen, and switches to phone words and controls:

- Settings lists typing shortcuts (`#`, `-`, `1.`, `[]`, `>`, `---`, `**bold**`) instead of keyboard shortcuts, and first-run tips say tap, not click or ⌘.
- X threads get a **+ New post** button under the last post (there's no ⌘↩ on a phone). Typing `---` on a new line also works, even after the iPhone turns `--` into a dash.
- Tap the dollar amount for the word count, characters and reading time (there's no hover).
- While reviewing, notes are chips under their paragraph; a tap opens them in a sheet at the bottom. Drag it up or flick it down.
- Tips and messages move above the on-screen keyboard.
- The account's Settings suggest setting up Notion and Gemini on a computer and signing in on the phone, which is quicker than copying keys on a small screen.
- Silent mode mutes the typing sounds on an iPhone; Settings says so.

## Look

Settings → Look picks Light, Dark or System, the page font (Source Serif, or Courier Prime for the old typewriter) and the review marks (pencil or highlighter). Old skins map over: Night desk becomes Dark, the rest System. The app also follows your system's reduce motion, reduce transparency and increase contrast settings.

## Budget

Click the spend in the spine to change the budget. The presets are words × $10 for common lengths: $500 (an X post), $1,000 (a short LinkedIn post), $2,000 (a typical LinkedIn post), $3,000 (a long post or a thread), $8,000 (a newsletter), $15,000 (a long essay).

## No backspace

**No backspace** (in the palette) blocks backspace, delete, cut and typing over a selection for the open draft while you write; reviewing can always delete. When a draft's Stage says "no backspace", the switch turns on by itself (turn that off in Settings → Writing), and a new Stage decides again.

## Formatting

Formatting works like Notion: you see bold words and headings, never the markup behind them.

- **As you type:** `# `, `## `, `### ` make headings; `- ` a bullet; `1. ` a numbered list; `[]` a checkbox (click the box to tick it); `> ` a quote; `---` a divider. `**bold**`, `*italic*`, `~strike~` and `` `code` `` turn into formatting when you close them. ⌘Z right after undoes the conversion.
- **Shortcuts (Ctrl on Windows):** ⌘B bold, ⌘I italic, ⌘⇧S strikethrough, ⌘⌥1, ⌘⌥2, ⌘⌥3 headings (again to undo), ⌘⌥0 plain text, ⌘⇧7 numbered list, ⌘⇧8 bullets, ⌘⇧9 checkbox, ⌘K link (works on a whole paragraph too).
- Enter continues a list; Enter on an empty item ends it. Backspace at the start of a heading or list item turns it back into text.
- Pasting from Notion, Google Docs or the web keeps headings, lists, bold, italics and links. Copying from Basic or Substack gives clean text plus rich text; from LinkedIn and X, see Formats.
- In Notion all of these are real formatting, both ways. Behind the scenes a draft is saved as markdown.

Each line is a paragraph, with space after it; a blank line makes a bigger gap.

## Formats

The palette's Format group (Basic, LinkedIn, X, Substack) only sets the line length, so line breaks land close to where they will when the post goes out: LinkedIn 52 characters, X 43, Substack 70 (exact with the Courier Prime page font). Each format has its own default budget, and Settings → Writing → "New drafts use" picks the format for new drafts. The format is saved with the draft but isn't sent to Notion; signed in, your account carries it to your other devices.

**Copying** gives you what the platform will show. From LinkedIn and X, markdown disappears and bold and italics become Unicode bold and italic letters (𝗯𝗼𝗹𝗱, 𝘪𝘵𝘢𝘭𝘪𝘤), since those sites have no formatting of their own; headings become bold lines. From Basic and Substack, the copy carries rich text too, so Substack keeps headings, bold and links.

- **LinkedIn (while reviewing):** ticks in the text show where "…see more" cuts in: a solid tick for a phone (about 140 characters or 3 lines) and a dashed one for a computer (about 210 characters or 3 lines), whichever comes first. The app lays the post out the way LinkedIn does, in the system font at the feed's width, so blank lines and line wraps count the way they will there. Text past 3,000 characters gets a faint red tint.
- **X threads:** every post sits in its own window, always, with its word count and X's own character count (links count 23, emoji 2, Unicode bold 2 per letter). ⌘↩ (Ctrl+↩) starts a new post at the caret. Backspace at the top of a post joins it to the one above, and an empty post just disappears. Click a post's number to select it, ready to copy. Anything past 280 is tinted while reviewing. In Notion, posts are separated by divider blocks.

Hover over the dollar amount for the word count, characters and reading time.

## Spelling

The review underlines unknown words in red pencil. Open its note for fixes, or "Add to dictionary" to stop flagging it; Settings → Writing lists the words you've added. Names in the middle of a sentence, acronyms, links, @handles and #hashtags are skipped. The word list is built from SCOWL (license in `app/dict/LICENSE-SCOWL.txt`); `tools/build-dict.mjs` rebuilds it.

## Files

```
./
  docs/DESIGN.md           the Margin design: tokens, layout, and where every feature lives
  docs/PLAN.md … PLAN-v5-redesign.md   the build plans and design decisions (PLAN-v4-challenges.md: the challenge list)
  README.md                this file
  netlify.toml             publishes app/ and the account function
  package.json             @netlify/blobs, for the account function
  netlify/
    functions/account.mjs  /api/account/*: picks the Blobs store and hands over to the lib
    lib/account-api.mjs    accounts: sign up and in, sessions, the lockout, the encrypted document
  tests/                   node tests (engine, formatting, formats, Notion mapping, spelling, the vault, the account API),
                           plus fake-notion.mjs, a local stand-in for the Notion API used for sync stress tests
  tools/build-dict.mjs     rebuilds app/dict/en-us.txt
  tools/dev-server.mjs     the app plus the account API on this computer
  tools/design-tour.mjs    screenshots of about 40 fixed states on a computer and a phone (tour-hooks.mjs: how it reaches them)
  app/                     the website (this is what gets deployed)
    index.html             page markup
    manifest.webmanifest   install-as-app settings
    sw.js                  service worker (offline use)
    _headers               Netlify security headers
    css/base.css           tokens (color, type, spacing, motion), light and dark, buttons, menus
    css/page.css           the page, the post formats, marks (pencil and highlighter), the gutter's costs
    css/margin.css         the margin: review notes, the grade ruler, cards
    css/surfaces.css       the spine, palette, drafts sidebar, sheets, Settings
    dict/                  the spelling word list and its license
    icons/                 app icons (SVG and PNG)
    js/data.js             word lists
    js/inline.js           markdown-lite: block markers and bold, italic, strike, code, links
    js/engine.js           readability engine (grade, sentences, highlights, spelling)
    js/spell.js            spellchecker and personal dictionary
    js/notion-map.js       Notion blocks to draft lines and back
    js/sound.js            typing sounds, synthesized in the browser
    js/store.js            drafts and settings in localStorage
    js/ai.js               Gemini client and prompts
    js/ai-mock.js          fake AI for tests (switched on from JS only)
    js/notion.js           Notion API client
    js/sync.js             two-way sync with Notion
    js/vault.js            the account's keys from your password, encryption, and merging two copies
    js/account.js          signing in, and keeping keys, settings and draft formats in step with the account
    js/editor.js           the editor: one line per paragraph, its own undo, X post windows, the fold
    js/ui.js               shared helpers: phone or computer, Mac or not, elements, toasts, money, icons, toggles, menus
    js/formats.js          post formats: what each platform shows, X counting, the LinkedIn fold
    js/spine.js            the bar over the page: title, stage, spend, sync, ⋯
    js/margin.js           the right margin: views (Review, Notes, Overflow), pinned cards, the phone sheet
    js/review.js           review notes, what fixes save (exact and estimated), the gutter's costs, the grade ruler
    js/palette.js          the command palette (⌘K)
    js/drafts.js           the drafts sidebar: grouping, sorting, filters, Notion property chips
    js/dialogs.js          Settings
    js/marks.js            alternatives, ghosts, colors and notes over the text: following edits, a/an, swapping (pure, tested)
    js/alts.js             the alternatives panel, cycling in place, AI alternatives
    js/menu.js             the right-click menu, Ghost it, Stash this in Overflow
    js/overflow.js         the Overflow panel
    js/lab.js              the Lab and Trim
    js/challenges.js       writing challenges: the catalog and its checks (pure, tested)
    js/challenge-ui.js     the challenge picker and card
    js/desk.js             save/open/post to X, the shortcut list
    js/blocks.js           Notion-style blocks: the handle, dragging, the block menu, the "/" menu
    js/bubble.js           the bar over a selection
    js/notes.js            colors, notes, the Notes panel, and AI threads on a passage
    js/app.js              state, events, startup (loads last)
```

## Ship an update

Bump `APP_VERSION` in `app/js/app.js`, `VERSION` in `app/sw.js`, and the `?v=` on every script and stylesheet in `index.html` together (for example `1.3.1`, `tdw-1.3.1`, `?v=1.3.1`). A new script also goes in the `PRECACHE` list in `sw.js`. The new service worker then replaces the old cache, and installed copies pick up the change. Deploy the whole folder, not just `app/`: Netlify installs `@netlify/blobs` and builds the account function from `netlify/` (see `netlify.toml`). The service worker never caches `/api/`.

## Later

Not built yet, on purpose:

- Password reset by email (it needs an email service, and would start the account over, since only your password can decrypt it).
- Sign in with a passkey (Face ID or Touch ID) instead of a password.
- Drafts that sync through the account for people who don't use Notion.
- More than one Notion database at a time (say, business and personal writing).
- Syncing drafts to a folder (Chrome's File System Access).
- Claude as an alternative AI provider.
- Focus mode that dims other sentences.
- The redesign: the look of everything above is a working placeholder.
- A receipt or print view.
- Custom budget presets.
- A grammar checker.
- More sound profiles.
