// v1.64.0: Competitors — waiver signed and fee paid toggles beside Check in; checking in someone not fully registered confirms both
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  for (const width of [1280, 390]) {
    const p = await (await b.newContext({ viewport: { width, height: 900 } })).newPage(); p.on('pageerror', e => errors.push(e.message)); await p.route(/fonts\./, r => r.abort());
    const W = t => p.waitForTimeout(t || 200);
    await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
    await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
    // two competitors: A (no waiver, not paid, not checked in), B (fully registered, not checked in)
    const ids = await p.evaluate(() => { const db = JSON.parse(localStorage.getItem('kt-local-v1')); const ks = Object.keys(db).filter(k => /^events\/[^/]+\/competitors\//.test(k)).slice(0, 2);
      Object.assign(db[ks[0]], { waiver: false, feePaid: false, checkedIn: false }); Object.assign(db[ks[1]], { waiver: true, feePaid: true, checkedIn: false });
      localStorage.setItem('kt-local-v1', JSON.stringify(db)); return ks.map(k => k.split('/').pop()); });
    const rec = id => p.evaluate(i => { const db = JSON.parse(localStorage.getItem('kt-local-v1')); const k = Object.keys(db).find(x => x.endsWith('/competitors/' + i)); const c = db[k]; return { w: c.waiver, p: c.feePaid, ci: c.checkedIn }; }, id);
    await p.reload(); await W(900); if (await p.$('.ev-card')) { await p.click('.ev-card'); await W(400); }
    if (width < 700) { await p.click('.bn >> nth=-1'); await W(250); await p.click('#modal .menu-item[data-v="competitors"]'); } else await p.click('.tab:has-text("Competitors")');
    await W(300); await p.selectOption('#comp-s', 'name').catch(() => {}); await p.selectOption('#comp-f', 'all').catch(() => {}); await W(300);
    const A = `tr[data-act="comp-edit"][data-id="${ids[0]}"]`, B = `tr[data-act="comp-edit"][data-id="${ids[1]}"]`;
    const btns = await p.$$eval(`${A} .reg-btns button`, x => x.map(y => y.textContent.trim()));
    ok(`${width}: Check in · Waiver · Not paid beside each other (${btns.join(' | ')})`, btns.join('|') === 'Check in|Waiver|Not paid');
    // toggles
    await p.click(`${A} button[data-act="comp-waiver"]`); await W(300);
    ok(`${width}: tap Waiver → signed (✓ Waiver), the card does not open`, (await rec(ids[0])).w === true && /✓ Waiver/.test(await p.textContent(`${A} .reg-btns`)) && !(await p.$('#f-comp')));
    await p.click(`${A} button[data-act="comp-waiver"]`); await W(300);
    ok(`${width}: tap again → not signed`, (await rec(ids[0])).w === false);
    // check in A → the box asks for waiver and fee
    await p.click(`${A} button[data-act="checkin"]`); await W(300);
    ok(`${width}: checking in someone not fully registered opens the check-in box`, !!(await p.$('#f-checkin')) && !(await p.$eval('#ci-waiver', x => x.checked)) && !(await p.$eval('#ci-paid', x => x.checked)) && (await rec(ids[0])).ci === false);
    await p.check('#ci-waiver'); await p.check('#ci-paid'); await p.click('#ci-go'); await W(400);
    const a = await rec(ids[0]);
    ok(`${width}: Check in confirms waiver and fee at the same time`, a.ci && a.w && a.p && !(await p.$('#f-checkin')));
    ok(`${width}: the row shows ✓ Checked in · ✓ Waiver · ✓ Paid`, /✓ Checked in.*✓ Waiver.*✓ Paid/.test((await p.textContent(`${A} .reg-btns`)).replace(/\s+/g, ' ')));
    // B is fully registered → one tap
    await p.click(`${B} button[data-act="checkin"]`); await W(300);
    ok(`${width}: fully registered → checked in with one tap (no box)`, !(await p.$('#f-checkin')) && (await rec(ids[1])).ci === true);
    ok(`${width}: no horizontal scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (width < 700) await (await p.$(A)).screenshot({ path: 'test/shots/regstatus-row.png' });
    await p.context().close();
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
