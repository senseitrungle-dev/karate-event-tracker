// v1.65.0: ring managers check competitors in — and nothing else on the Competitors tab
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.on('pageerror', e => errors.push(e.message)); await p.route(/fonts\./, r => r.abort());
  const W = t => p.waitForTimeout(t || 200);
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  const id = await p.evaluate(() => { const db = JSON.parse(localStorage.getItem('kt-local-v1')); const k = Object.keys(db).find(x => /^events\/[^/]+\/competitors\//.test(x)); Object.assign(db[k], { checkedIn: false, waiver: false, feePaid: false }); localStorage.setItem('kt-local-v1', JSON.stringify(db)); return k.split('/').pop(); });
  const rec = () => p.evaluate(i => { const db = JSON.parse(localStorage.getItem('kt-local-v1')); const c = db[Object.keys(db).find(x => x.endsWith('/competitors/' + i))]; return c; }, id);
  await p.reload(); await W(900); if (await p.$('.ev-card')) { await p.click('.ev-card'); await W(400); }
  await p.selectOption('#sim-role', 'manager'); await W(400);
  const sr = await p.$('#sim-ring'); if (sr) { await p.selectOption('#sim-ring', { index: 1 }).catch(() => {}); await W(300); }
  await p.click('.tab:has-text("Competitors")'); await W(400);
  await p.selectOption('#comp-f', 'all').catch(() => {}); await W(200);
  const row = `#main tr:has(button[data-act="checkin"][data-id="${id}"])`;
  ok('ring manager: a Check in button on each competitor', (await p.$$('#main button[data-act="checkin"]')).length > 10 && !!(await p.$(row)));
  ok('Waiver and Paid buttons too (v1.66)', !!(await p.$(`${row} button[data-act="comp-waiver"]`)) && !!(await p.$(`${row} button[data-act="comp-paid"]`)));
  ok('rows do not open the competitor card', !(await p.$('#main tr[data-act="comp-edit"]')));
  ok('no Import / Export / Remove group / Add competitor', !(await p.$('#main button[data-act="import-open"], #main button[data-act="export-comps"], #main button[data-act="rm-group"], #main button[data-act="comp-new"]')));
  const fopts = await p.$$eval('#comp-f option', o => o.map(x => x.value));
  ok(`"Not paid" filter, but no "Missing information" / "No division match" (${fopts.join(',')})`, fopts.includes('unpaid') && !fopts.includes('incomplete') && !fopts.includes('unplaced'));
  ok('no Incomplete marks, no contact-details note', !(await p.$('#main .chip.warn:has-text("Incomplete")')) && !/visible to directors only/.test(await p.textContent('#main')));
  // waiver / paid toggles
  await p.click(`${row} button[data-act="comp-waiver"]`); await W(400);
  ok('tap Waiver → signed', (await rec()).waiver === true);
  await p.click(`${row} button[data-act="comp-waiver"]`); await W(400);
  ok('tap again → not signed', (await rec()).waiver === false);
  // check in someone not fully registered: the box confirms waiver and fee
  await p.click(`${row} button[data-act="checkin"]`); await W(400);
  ok('check in opens the waiver / fee box', !!(await p.$('#f-checkin')) && !/Missing information/.test(await p.textContent('#f-checkin')));
  await p.check('#ci-waiver'); await p.check('#ci-paid'); await p.click('#ci-go'); await W(500);
  let c = await rec();
  ok('Check in saves check-in, waiver and paid together', c.checkedIn === true && c.waiver === true && c.feePaid === true && !!c.checkedInAt && !(await p.$('#f-checkin')));
  ok('the row shows ✓ Checked in · ✓ Waiver · ✓ Paid', /✓ Checked in.*✓ Waiver.*✓ Paid/.test((await p.textContent(row)).replace(/\s+/g, ' ')));
  await p.click(`${row} button[data-act="checkin"]`); await W(400);
  ok('fully registered: one tap checks out again', (await rec()).checkedIn === false && !(await p.$('#f-checkin')));
  await p.click(`${row} button[data-act="comp-paid"]`); await W(400);
  await p.selectOption('#comp-f', 'unpaid'); await W(300);
  ok('"Not paid" filter shows the competitor just marked not paid', (await p.$$('#main button[data-act="checkin"]')).length >= 1 && !!(await p.$(row)));
  // a spectator has no check-in button
  await p.selectOption('#sim-role', 'viewer'); await W(400); await p.click('.tab:has-text("Competitors")').catch(() => {}); await W(300);
  ok('spectator: no Check in buttons', !(await p.$('#main button[data-act="checkin"]')));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
