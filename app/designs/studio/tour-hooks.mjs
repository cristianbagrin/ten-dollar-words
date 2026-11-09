// Studio reaches some states differently: challenges live in the inspector's Challenge tab.
export const steps = {
  'D16-challenge-picker': async (page) => {
    await page.evaluate(() => TDW.Challenges.open());
    await page.waitForTimeout(500);
  },
  // Writing a note already opens the Notes tab, so the panel is shown, not toggled.
  'D18-notes': async (page, t) => {
    await t.mode(page, 'write');
    await t.select(page, 'afraid that short ones');
    await page.evaluate(() => TDW.Notes.compose()); await page.waitForTimeout(300);
    await page.keyboard.type('Is "afraid" too strong here?', { delay: 10 });
    await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    await page.evaluate(() => TDW.App.openTab('notes')); await page.waitForTimeout(500);
  }
};

export const extra = [
  { name: 'D24-draft-tab', run: async (page) => { await page.evaluate(() => { TDW.App.setMode('edit'); TDW.Inspector.select('draft'); }); await page.waitForTimeout(500); } },
  { name: 'D25-focus', run: async (page) => { await page.evaluate(() => TDW.App.setMode('write')); await page.mouse.move(720, 600); await page.waitForTimeout(700); } },
  { name: 'D26-library-only', run: async (page) => { await page.evaluate(() => TDW.Library.show()); await page.waitForTimeout(600); } },
  { name: 'D27-dark-settings', dark: true, run: async (page) => { await page.evaluate(() => TDW.Dialogs.openSettings('look')); await page.waitForTimeout(600); } },
  { name: 'P07-library-home', phone: true, run: async (page) => { await page.evaluate(() => TDW.Library.popToLibrary()); await page.waitForTimeout(700); } },
  { name: 'P08-notes-sheet', phone: true, run: async (page) => { await page.evaluate(() => { TDW.Library.pushPage(); TDW.App.openTab('notes'); }); await page.waitForTimeout(700); } }
];
