const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  for (const [name, vp, scheme] of [['dark-desk', { width: 1200, height: 860 }, 'dark'], ['light-phone', { width: 390, height: 844 }, 'light']]) {
    const ctx = await b.newContext({ viewport: vp, colorScheme: scheme });
    const p = await ctx.newPage();
    await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
    await p.click('button:has-text("Create demo tournament") >> nth=0'); await p.click('button[data-kind="local"]');
    await p.waitForSelector('.tab', { timeout: 30000 }); await p.waitForTimeout(500);
    await p.click('.tab:has-text("Divisions")'); await p.click('button:has-text("Draw all ready")'); await p.click('#confirm button:has-text("Draw")'); await p.waitForTimeout(900);
    await p.click('.tab:has-text("Mat")'); await p.waitForTimeout(200);
    await p.selectOption('#mat-ring', { label: 'Ring 2' }); await p.waitForTimeout(200);
    await p.click('button[data-act="score"] >> nth=0'); await p.waitForTimeout(200);
    await p.click('.corner.a button[data-t="waza"]'); await p.click('.corner.b button[data-t="keikoku"]');
    await p.screenshot({ path: `test/shots/${name}-kumite.png` });
    await p.click('button[data-act="modal-close"] >> nth=0');
    await p.click('.tab:has-text("Brackets")'); await p.waitForTimeout(200);
    await p.screenshot({ path: `test/shots/${name}-bracket.png` });
    await ctx.close();
  }
  await b.close();
})();
