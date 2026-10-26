// v1.43.0: previous round kata + average beside the competitor (score card, mat card); kata bracket: current round first, then earlier rounds newest → oldest
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\./, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  const W = t => p.waitForTimeout(t || 150);
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 30000 });
  await p.click('.tab:has-text("Divisions")'); await p.click('button:has-text("Draw all ready")'); await p.click('#confirm button:has-text("Draw")'); await W(800);
  await p.click('.tab:has-text("Brackets")'); await W();
  const did = await p.$$eval('#br-div option', x => (x.find(o => /Senior Women Individual Kata/.test(o.textContent)) || {}).value);
  ok('found the senior women kata division', !!did);
  await p.selectOption('#br-div', did); await W(200);
  const score = async (kata, base) => {
    await p.fill('#kp-kata', kata);
    const J = await p.$$eval('input[data-input="kp-j"]', x => x.map(y => y.id));
    for (let k = 0; k < J.length; k++) await p.fill('#' + J[k], (base + (k % 3) * 0.1).toFixed(1));
    if (await p.$eval('#kp-save', x => x.disabled)) console.log('  save disabled:', await p.textContent('#kp-err'), await p.textContent('#modal .corner'));
    await p.click('#kp-save', { timeout: 3000 }); await W(300);
    if (await p.$('#modal:not([hidden]) #kp-save')) await p.click('#modal button.ghost[data-act="modal-close"]');
    await W();
  };
  // score round 1 (the semifinal of 5) from the bracket: every entrant performs Bassai Dai
  for (let g = 0; g < 10; g++) {
    if (/^Final/.test(await p.textContent('.stage-h >> nth=0'))) break;
    const row = await p.$('table.kp >> nth=0 >> tr[data-act="kp-score"]:not(:has(td.n b:text-matches("\\\\d")))');
    if (!row) break;
    await row.click(); await W(200);
    if (!(await p.$('#kp-kata'))) break;
    await score('Bassai Dai', 6.5 + g * 0.3);
  }
  await W(300);
  const heads = await p.$$eval('.stage-h', x => x.map(y => y.textContent.trim()));
  console.log('  sections:', heads.join(' | '));
  ok('bracket: current round (Final) first, then the semifinal', /^Final · current round/.test(heads[0]) && /^Semifinal/.test(heads[1]));
  // final score card: previous round kata + average beside the name
  const fr = await p.$('table.kp >> nth=0 >> tr[data-act="kp-score"]'); await fr.click(); await W(250);
  const prev = (await p.textContent('#modal .corner .prev-kata')) || '';
  ok(`score card shows previous round kata and average (${prev.trim()})`, /Semifinal/.test(prev) && /Bassai Dai/.test(prev) && /\d\.\d{3}/.test(prev));
  // put it on the mat and check the mat card
  await p.click('#modal button[data-act="kp-call"]'); await W(300);
  await p.click('#modal button.ghost[data-act="modal-close"]'); await W();
  await p.click('.tab:has-text("Mat")'); await W(300);
  const now = await p.$$eval('.ring-card .now', x => x.map(y => y.closest('.ring-card').querySelector('.prev-kata') ? y.closest('.ring-card').querySelector('.prev-kata').textContent : ''));
  ok('mat card: competitor on the mat shows previous round kata and average', now.some(t => /Semifinal/.test(t) && /Bassai Dai/.test(t)));
  await p.screenshot({ path: 'test/shots/prevkata-mat.png' });
  // a first-round performer has no previous round
  await p.click('.tab:has-text("Brackets")'); await W();
  const other = await p.$$eval('#br-div option', x => (x.find(o => /Senior Men Individual Kata/.test(o.textContent)) || {}).value);
  await p.selectOption('#br-div', other); await W(200);
  ok('first-round bracket: current round shown first', /^Elimination round 1 · current round/.test(await p.textContent('.stage-h >> nth=0')));
  await p.click('table.kp >> nth=0 >> tr[data-act="kp-score"] >> nth=0'); await W(250);
  ok('first-round score card: no previous kata line', !(await p.$('#modal .corner .prev-kata')));
  await p.click('#modal button.ghost[data-act="modal-close"]'); await W();
  // phone width: mat card fits
  await p.setViewportSize({ width: 390, height: 844 }); await p.click('.bn:has-text("Mat")'); await W(300);
  ok('phone: no horizontal scroll on the Mat tab', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const card = await p.$('.ring-card:has(.prev-kata)'); if (card) await card.screenshot({ path: 'test/shots/prevkata-phone.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
