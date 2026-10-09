// v1.12.0: logo in the title bar, three options, picker
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\./, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html')); await p.waitForTimeout(400);
  ok('title bar shows the seal logo by default', !!(await p.$('.bar .brand .logo-seal svg path')));
  ok('logo has the 伝統空手道 label', /伝統空手道/.test(await p.$eval('.bar .logo svg', s => s.getAttribute('aria-label'))));
  await p.click('details.logo-pick summary'); await p.waitForTimeout(150);
  ok('picker offers 3 logos', (await p.$$('button[data-act="logo-set"]')).length === 3);
  await p.screenshot({ path: 'test/shots/logo-picker.png' });
  for (const k of ['horizon', 'rays', 'seal']) {
    await p.click(`button[data-act="logo-set"][data-k="${k}"]`); await p.waitForTimeout(250);
    ok(`switch to ${k}`, !!(await p.$(`.bar .brand .logo-${k}`)));
    await p.screenshot({ path: `test/shots/logo-bar-${k}.png`, clip: { x: 0, y: 0, width: 700, height: 60 } });
  }
  await p.reload(); await p.waitForTimeout(400);
  ok('choice persists after reload', !!(await p.$('.bar .brand .logo-seal')));
  await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  ok('logo shown inside an event', !!(await p.$('.bar .brand .logo svg')));
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  ok('phone: logo visible in the title bar', await p.$eval('.bar .brand .logo', e => e.getBoundingClientRect().width > 20 && e.getBoundingClientRect().height >= 28));
  ok('phone: no horizontal overflow', !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  await p.screenshot({ path: 'test/shots/logo-phone.png', clip: { x: 0, y: 0, width: 390, height: 120 } });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
