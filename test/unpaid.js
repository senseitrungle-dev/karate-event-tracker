// v1.63.0: Competitors filter "Not paid" (directors) — fee not marked paid, withdrawn left out
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.on('pageerror', e => errors.push(e.message)); await p.route(/fonts\./, r => r.abort());
  const W = t => p.waitForTimeout(t || 150);
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  // two competitors not paid, one of them withdrawn
  const names = await p.evaluate(() => { const db = JSON.parse(localStorage.getItem('kt-local-v1')); const ks = Object.keys(db).filter(k => /^events\/[^/]+\/competitors\//.test(k)).slice(0, 2);
    db[ks[0]].feePaid = false; db[ks[1]].feePaid = false; db[ks[1]].status = 'withdrawn'; localStorage.setItem('kt-local-v1', JSON.stringify(db)); return ks.map(k => db[k].lastName + ', ' + db[k].firstName); });
  await p.reload(); await W(900); if (await p.$('.ev-card')) { await p.click('.ev-card'); await W(400); }
  await p.click('.tab:has-text("Competitors")'); await W(300);
  const opts = await p.$$eval('#comp-f option', o => o.map(x => x.textContent));
  ok(`filter list has "Not paid" after "Checked in" (${opts.join(', ')})`, opts.indexOf('Not paid') === opts.indexOf('Checked in') + 1);
  await p.selectOption('#comp-s', 'name'); await p.selectOption('#comp-f', 'unpaid'); await W(300);
  const rows = await p.$$eval('#main tr[data-act="comp-edit"] .name', x => x.map(y => y.textContent.trim()));
  ok(`only the unpaid competitor who is not withdrawn (${rows.join(' | ')})`, rows.length === 1 && rows[0].startsWith(names[0]));
  ok('the count line says 1 shown', /^1 competitor shown/.test(await p.textContent('#main .small.muted:has-text("shown")')));
  await p.reload(); await W(900); if (await p.$('.ev-card')) { await p.click('.ev-card'); await W(400); }
  await p.click('.tab:has-text("Competitors")'); await W(300);
  ok('the filter is remembered (this person\'s view)', (await p.$eval('#comp-f', s => s.value)) === 'unpaid');
  // a ring manager / spectator does not see the payment filter
  await p.selectOption('#sim-role', 'viewer'); await W(300);
  await p.click('.tab:has-text("Competitors")').catch(() => {}); await W(300);
  ok('spectators do not get "Not paid", and their list is not filtered by it', !(await p.$$eval('#comp-f option', o => o.some(x => x.value === 'unpaid')).catch(() => false)) && (await p.$$('#main tr .name')).length > 5);
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
