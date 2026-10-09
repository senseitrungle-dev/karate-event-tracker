// v1.9.0: three demo tournaments (local clubs/dojos, national regions, world championship countries)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\./, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  for (const [kind, level, field] of [['local', 'Local', 'dojo'], ['national', 'National', 'regions'], ['international', 'International', 'countries']]) {
    if (await p.$('.bar button.brand')) await p.click('.bar button.brand');
    await p.click('button:has-text("Create demo tournament") >> nth=0'); await p.click(`button[data-kind="${kind}"]`);
    await p.waitForSelector('text=Director checklist', { timeout: 90000 }); await p.waitForTimeout(300);
    ok(`${kind}: ${level} event created`, new RegExp(level, 'i').test(await p.textContent('.section-h .label')));
    await p.click('.tab:has-text("Divisions")'); await p.click('button:has-text("Draw all ready")'); await p.click('#confirm button:has-text("Draw")'); await p.waitForTimeout(1500);
    await p.click('.tab:has-text("Judges")'); await p.waitForTimeout(200);
    const shownBy = await p.textContent('#main');
    ok(`${kind}: judges shown with their ${field === 'dojo' ? 'dojo' : field === 'regions' ? 'region' : 'country'}`, new RegExp(`judges shown with their ${field === 'dojo' ? 'dojo' : field === 'regions' ? 'region' : 'country'}`).test(shownBy));
    await p.click('.tab:has-text("Follow")'); await p.fill('#follow-q', kind === 'local' ? 'Dojo' : kind === 'national' ? 'Pacific' : 'Japan'); await p.waitForTimeout(200);
    const res = await p.textContent('#main');
    ok(`${kind}: follow finds ${field}`, kind === 'local' ? /Dojos \/ clubs/i.test(res) : kind === 'national' ? /Regions/i.test(res) && /Pacific/.test(res) : /Countries/i.test(res) && /Japan/.test(res));
    await p.click('.tab:has-text("Rings")'); await p.waitForTimeout(200);
    ok(`${kind}: ${kind === 'local' ? 2 : kind === 'national' ? 3 : 4} rings`, (await p.$$('.rdivs[data-ring]')).length === (kind === 'local' ? 2 : kind === 'national' ? 3 : 4));
    await p.click('.tab:has-text("Brackets")'); await p.waitForTimeout(200);
    await p.screenshot({ path: `test/shots/demo-${kind}.png` });
  }
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(300);
  await p.screenshot({ path: 'test/shots/demo-mobile-tabs.png' });
  ok('phone: no horizontal overflow', !(await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
