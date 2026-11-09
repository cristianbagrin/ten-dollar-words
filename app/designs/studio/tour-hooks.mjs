// Studio reaches some states differently: challenges live in the inspector's Challenge tab.
export const steps = {
  'D16-challenge-picker': async (page) => {
    await page.evaluate(() => TDW.Challenges.open());
    await page.waitForTimeout(500);
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
