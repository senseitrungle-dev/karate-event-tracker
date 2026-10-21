// v1.40.0: mat card — ring name on each readiness card, not ready by default, ring manager checklist before "Ring is ready"
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  for (const width of [1280, 390]) {
    const ctx = await b.newContext({ viewport: { width, height: 900 } }); await ctx.route(/fonts\./, r => r.abort());
    const d = await ctx.newPage(); d.on('pageerror', e => errors.push(e.message));
    await d.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
    await d.click('button:has-text("Create demo tournament")'); await d.click('button[data-kind="local"]'); await d.waitForSelector('text=Director checklist', { timeout: 30000 });
    await d.click(width < 700 ? '.bn:has-text("Mat")' : '.tab:has-text("Mat")'); await d.waitForTimeout(200);
    const names = await d.$$eval('.ready-box .ready-ring', x => x.map(y => y.textContent));
    const rings = await d.$$eval('.ring-card h3', x => x.map(y => y.textContent));
    ok(`${width}: each readiness card is labelled with its ring name`, names.length === 2 && names.every(n => rings.includes(n)));
    ok(`${width}: every ring starts Not ready`, (await d.$$eval('.ready-box .chip', x => x.map(y => y.textContent))).every(t => t === 'Not ready') && (await d.$$('.ring-card .mat-status:text("Not ready")')).length === 2);
    const box = '.ready-box[data-ring]';
    const rid = await d.$eval(box, x => x.dataset.ring), B = `.ready-box[data-ring="${rid}"]`;
    const n = (await d.$$(`${B} input[data-change="ring-check"]`)).length;
    ok(`${width}: checklist shown (${n} items)`, n >= 5);
    ok(`${width}: Ring is ready disabled before the checklist`, await d.$eval(`${B} button[data-act="ring-ready"]`, x => x.disabled));
    const cnt = () => d.$$eval(`${B} input[data-change="ring-check"]:checked`, x => x.length);
    const tick = async () => { const c = await cnt(); await d.click(`${B} input[data-change="ring-check"]:not(:checked)`); await d.waitForFunction(([sel, c]) => document.querySelectorAll(sel).length > c, [`${B} input[data-change="ring-check"]:checked`, c]); };
    for (let k = 0; k < n - 1; k++) await tick();
    ok(`${width}: still disabled with one item left`, await d.$eval(`${B} button[data-act="ring-ready"]`, x => x.disabled) && /\d\/\d/.test(await d.textContent(`${B} .ready-checks`)));
    await tick(); await d.waitForTimeout(100);
    ok(`${width}: checklist complete but still Not ready until tapped`, (await d.textContent(`${B} .chip`)) === 'Not ready' && !(await d.$eval(`${B} button[data-act="ring-ready"]`, x => x.disabled)));
    await d.click(`${B} button[data-act="ring-ready"]`); await d.waitForTimeout(150);
    ok(`${width}: tap → Ready on the readiness card and the mat card`, (await d.textContent(`${B} .chip`)) === 'Ready' && (await d.textContent(`.ring-card[data-ring="${rid}"] .mat-status`)) === 'Ready');
    ok(`${width}: other ring still Not ready`, (await d.$$('.ring-card .mat-status:text("Not ready")')).length === 1);
    await d.click(`${B} input[data-change="ring-check"]:checked`); await d.waitForTimeout(150);
    ok(`${width}: unticking an item makes the ring Not ready again`, (await d.textContent(`${B} .chip`)) === 'Not ready' && await d.$eval(`${B} button[data-act="ring-ready"]`, x => x.disabled));
    ok(`${width}: no horizontal scroll`, await d.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await d.screenshot({ path: `test/shots/matready-${width}.png`, fullPage: true });
    await ctx.close();
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
