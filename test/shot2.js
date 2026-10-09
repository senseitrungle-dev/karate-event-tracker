const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  for (const [name, vp] of [['desk', { width: 1200, height: 860 }], ['phone', { width: 390, height: 844 }]]) {
    const p = await (await b.newContext({ viewport: vp })).newPage();
    await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
    await p.click('button:has-text("Create demo tournament") >> nth=0'); await p.click('button[data-kind="local"]');
    await p.waitForSelector('.tab', { timeout: 30000 }); await p.waitForTimeout(500);
    await p.click('.tab:has-text("Divisions")'); await p.click('button:has-text("Draw all ready")'); await p.click('#confirm button:has-text("Draw")'); await p.waitForTimeout(900);
    await p.click('.tab:has-text("Brackets")'); await p.waitForTimeout(200);
    const opts = await p.$$eval('#br-div option', o => o.map(x => [x.value, x.textContent]));
    const w = opts.find(o => /Senior Women Individual Kumite/.test(o[1]));
    await p.selectOption('#br-div', w[0]); await p.waitForTimeout(200);
    await p.click('.bm.ready >> nth=0'); await p.waitForTimeout(200);
    await p.click('.corner.a button[data-t="waza"]');
    await p.screenshot({ path: `test/shots/kogo-${name}.png` });
    await p.click('button[data-act="modal-close"] >> nth=0');
    const m = opts.find(o => /Senior Men Individual Kumite/.test(o[1]));
    await p.selectOption('#br-div', m[0]); await p.waitForTimeout(200);
    await p.click('.bm.ready >> nth=0'); await p.waitForTimeout(200);
    await p.click('.corner.b button[data-t="jogai"]');
    await p.screenshot({ path: `test/shots/shobu-${name}.png` });
    await p.close();
  }
  await b.close();
})();
