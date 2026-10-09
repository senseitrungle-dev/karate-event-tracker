const { chromium, devices } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  for (const scheme of ['light', 'dark']) {
    const ctx = await b.newContext(Object.assign({}, devices['iPhone 13'], { colorScheme: scheme }));
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
    await p.waitForTimeout(400);
    await p.screenshot({ path: `test/shots/m-${scheme}-0home.png` });
    await p.tap('button:has-text("Create demo tournament") >> nth=0'); await p.tap('button[data-kind="local"]');
    await p.waitForSelector('.bnav:not([hidden])', { timeout: 30000 }); await p.waitForTimeout(600);
    await p.screenshot({ path: `test/shots/m-${scheme}-1overview.png` });
    await p.tap('.bn[data-act="more-tabs"]'); await p.waitForTimeout(250);
    await p.screenshot({ path: `test/shots/m-${scheme}-2more.png` });
    await p.tap('.menu-item:has-text("Judges")'); await p.waitForTimeout(250);
    await p.screenshot({ path: `test/shots/m-${scheme}-2judges.png` });
    await p.tap('.bn:has-text("Divisions")'); await p.waitForTimeout(250);
    await p.tap('button:has-text("Draw all ready")'); await p.tap('#confirm button:has-text("Draw")'); await p.waitForTimeout(900);
    await p.screenshot({ path: `test/shots/m-${scheme}-3divisions.png` });
    await p.tap('.bn:has-text("Mat")'); await p.waitForTimeout(300);
    await p.screenshot({ path: `test/shots/m-${scheme}-4mat.png` });
    await p.tap('.bn:has-text("Rings")'); await p.waitForTimeout(300);
    await p.screenshot({ path: `test/shots/m-${scheme}-4rings.png`, fullPage: true });
    await p.tap('.rdiv >> nth=0'); await p.waitForTimeout(300);
    await p.screenshot({ path: `test/shots/m-${scheme}-4divpanel.png` });
    console.log(scheme, 'division panel opened:', !!(await p.$('#divp-root .seg-row')));
    await p.tap('button[data-act="modal-close"] >> nth=0'); await p.waitForTimeout(200);
    await p.tap('.bn[data-act="more-tabs"]'); await p.waitForTimeout(200); await p.tap('.menu-item:has-text("Brackets")'); await p.waitForTimeout(300);
    await p.screenshot({ path: `test/shots/m-${scheme}-5brackets.png` });
    await p.tap('.bn[data-act="more-tabs"]'); await p.waitForTimeout(200); await p.tap('.menu-item:has-text("Competitors")'); await p.waitForTimeout(300);
    await p.screenshot({ path: `test/shots/m-${scheme}-6comps.png` });
    const ov = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    console.log(scheme, 'overflow', ov, 'errors', errs.join('|') || 'none');
    await ctx.close();
  }
  await b.close();
})();
