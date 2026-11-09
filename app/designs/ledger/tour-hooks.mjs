// Ledger reaches a few states differently: Trim lives on the receipt (priced in dollars), not in
// the Audit list, so D15 closes the audit and presses the receipt's "−$… 20%" button.
export const steps = {
  'D15-trim': async (page, t) => {
    await page.evaluate(() => TDW.Lab.close());
    await page.waitForTimeout(200);
    await page.click('#trim-row .lab-level[data-level="2"]');
    await page.waitForTimeout(2200);
  }
};

export const extra = [
  { name: 'D24-refund-detail', run: async (page, t) => {
    await page.evaluate(() => TDW.App.setBudget(2000));
    await t.mode(page, 'edit');
    await page.click('.refund-line');
    await page.waitForTimeout(500);
  } },
  { name: 'D25-paper-menu', run: async (page) => {
    await page.keyboard.press('Escape');
    await page.click('#btn-paper');
    await page.waitForTimeout(400);
  } },
  { name: 'D26-write-challenge', run: async (page, t) => {
    await page.keyboard.press('Escape');
    await page.evaluate(() => TDW.Challenges.start(['A1']));
    await t.mode(page, 'write');
    await page.waitForTimeout(500);
  } },
  { name: 'P07-phone-sheet-full', phone: true, run: async (page, t) => {
    await t.mode(page, 'edit');
    await page.evaluate(() => TDW.Tape.setDetent('full'));
    await page.waitForTimeout(700);
  } }
];
