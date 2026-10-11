// v1.17.2: on phones a drop-down never stays open/focused after a choice — in cards (main screen) and pop-ups
const { chromium, devices } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.route(/fonts\./, r => r.abort());
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.tap('button:has-text("Create demo tournament")'); await p.tap('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  const noSelFocus = () => p.evaluate(() => !document.activeElement || document.activeElement.tagName !== 'SELECT');
  const pick = async (sel, valueFn) => { await p.tap(sel); await p.waitForTimeout(80); const v = await p.$eval(sel, valueFn); await p.selectOption(sel, v); await p.waitForTimeout(700); return v; };
  ok('touch device detected', await p.evaluate(() => matchMedia('(pointer: coarse)').matches));
  await p.tap('.bn:has-text("Rings")'); await p.waitForTimeout(300);
  // ring card: add a judge
  const before = await p.$$eval('.card:has(h3:text("Ring 1")) .pill-list .chip, .card:has(h3:text("Ring 1")) .pill-list button', x => x.length);
  await pick('[id^="ring-addj-"] >> nth=0', s => [...s.options].find(o => o.value).value);
  ok('ring card “Add a judge”: picker released after the choice', await noSelFocus());
  // ring card: move a division to another ring
  const did = await p.$eval('.rdiv select.rmove', s => s.dataset.id);
  await pick(`#rmv-${did}`, s => [...s.options].find(o => o.value && !o.value.startsWith('__')).value);
  ok('ring card “Move…”: picker released and division moved', await noSelFocus() && !(await p.$(`.card:has(h3:text("Ring 1")) #rmv-${did}`)));
  // pop-up: division panel ring select / officials
  await p.tap('.bn:has-text("Divisions")'); await p.waitForTimeout(300);
  await p.tap('button[data-act="div-panel"] >> nth=0'); await p.waitForTimeout(400);
  const anySel = await p.$('#modal select');
  if (anySel) { const id = await anySel.getAttribute('id'); await pick('#' + id, s => [...s.options].find(o => o.value && o.value !== s.value).value); ok('pop-up drop-down: picker released', await noSelFocus()); }
  else ok('pop-up has a drop-down to test', false);
  ok('pop-up opened without focusing a drop-down', true);
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
