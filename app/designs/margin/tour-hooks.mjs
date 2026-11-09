// How the Margin direction reaches the tour's states, plus states only it has.
export const steps = {
  // Challenges live in the command palette.
  'D16-challenge-picker': async (page) => {
    await page.evaluate(() => TDW.Palette.open({ query: 'challenge' }));
    await page.waitForTimeout(500);
  },
  // The phone's review: tap a pencil dot at the end of a line.
  'P03-review-open': async (page) => {
    const chip = await page.$('.pdot:not([hidden])');
    if (!chip) throw new Error('no review dot');
    await chip.tap();
    await page.waitForTimeout(700);
  }
};

export const extra = [
  { name: 'D24-palette', run: async (page, t) => {
    await t.escape(page, 2);
    await page.evaluate(() => TDW.App.setMode('write'));
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    await page.waitForTimeout(500);
  } },
  { name: 'D25-note-open', run: async (page, t) => {
    await t.escape(page, 2);
    await page.evaluate(() => TDW.App.setMode('edit'));
    await page.waitForTimeout(500);
    const row = await page.$('.rn[data-key^="passive"] .rn-row') || await page.$('.rn .rn-row');
    if (!row) throw new Error('no margin note');
    await row.click();
    await page.waitForTimeout(500);
  } },
  { name: 'D26-trim-card', run: async (page, t) => {
    await t.escape(page, 2);
    await page.evaluate(() => TDW.Lab.trim(2));
    await page.waitForTimeout(2200);
  } },
  { name: 'D27-tally', run: async (page, t) => {
    await page.evaluate(() => TDW.Lab.done());
    await t.escape(page, 2);
    await page.click('#spine-spend');
    await page.waitForTimeout(500);
  } },
  { name: 'D21-dark-palette', dark: true, run: async (page) => {
    await page.evaluate(() => TDW.Palette.open());
    await page.waitForTimeout(500);
  } },
  { name: 'P07-palette', phone: true, run: async (page, t) => {
    await t.escape(page, 2);
    await page.tap('#spine-more');
    await page.waitForTimeout(700);
  } },
  { name: 'P08-notes-phone', phone: true, run: async (page, t) => {
    await page.evaluate(() => TDW.Palette.close());
    await page.waitForTimeout(400);
    await page.evaluate(() => TDW.Overflow.open());
    await page.waitForTimeout(700);
  } }
];
