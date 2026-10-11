// v1.17.0: finished divisions leave the ring running order; divisions grouped & sorted; officials list folds away;
// judges' scores move to the next judge and then to Save
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); p.on('pageerror', e => errors.push(e.message));
  await p.route(/fonts\./, r => r.abort());
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  await p.click('.tab:has-text("Divisions")'); await p.click('button:has-text("Draw all ready")'); await p.click('#confirm button:has-text("Draw")'); await p.waitForTimeout(800);
  // --- finish one Shobu Ippon division by Ippon after Ippon
  await p.click('.tab:has-text("Brackets")'); await p.waitForTimeout(300);
  const o = await p.$$eval('#br-div option', x => x.map(y => [y.value, y.textContent]));
  const target = o.find(x => /Senior Women Individual Kumite/.test(x[1])) || o.find(x => /Senior.*Kumite/.test(x[1]));
  await p.selectOption('#br-div', target[0]); await p.waitForTimeout(200);
  for (let k = 0; k < 20; k++) {
    const m = await p.$('.bm.ready.click'); if (!m) break;
    await m.click(); await p.waitForTimeout(200);
    if (await p.$('#match-root button[data-act="score"]')) await p.click('#match-root button[data-act="score"]');
    await p.waitForSelector('.corner.a button[data-t="ippon"]'); await p.click('.corner.a button[data-t="ippon"]'); await p.waitForTimeout(150);
    await p.click('#save-result'); await p.waitForTimeout(250);
    if (!(await p.$eval('#modal', x => x.hidden))) await p.keyboard.press('Escape');
    await p.waitForTimeout(150);
  }
  const name = target[1].trim();
  // --- Divisions tab: groups in order, finished division under "Finished"
  await p.click('.tab:has-text("Divisions")'); await p.waitForTimeout(300);
  const rows = await p.$$eval('table.mcards tbody tr', trs => trs.map(t => t.classList.contains('grp-row') ? '#' + t.textContent.trim() : (t.querySelector('.name') || {}).textContent));
  const heads = rows.filter(x => x && x.startsWith('#')).map(x => x.slice(1).split(' ·')[0]);
  ok('group order: Not finished → Finished → No entrants', JSON.stringify(heads) === JSON.stringify(['Not finished', 'Finished', 'No entrants'].filter(h => heads.includes(h))) && heads[0] === 'Not finished' && heads.includes('Finished'));
  const fi = rows.findIndex(x => x === '#' + rows.find(y => y && y.startsWith('#Finished')).slice(1));
  ok('finished division listed under Finished', rows.indexOf(name) > fi);
  const g0 = rows.slice(1, rows.findIndex((x, i) => i > 0 && x && x.startsWith('#')));
  const kyuStart = g0.findIndex(x => /kyu|Kyu|Beginner|Intermediate|Advanced/.test(x || ''));
  ok('black-belt divisions before kyu divisions', kyuStart === -1 || g0.slice(kyuStart).every(x => !/Black Belt/.test(x || '')));
  const ages = await p.$$eval('table.mcards tbody tr:not(.grp-row)', trs => trs.map(t => [(t.querySelector('.name') || {}).textContent, (t.querySelector('.dojo') || {}).textContent]));
  const bbAges = ages.slice(0, g0.length).filter(a => /Black Belt/.test(a[0])).map(a => +((a[1].match(/Age (\d+)/) || [])[1] || 0));
  ok('black-belt divisions youngest age group first', bbAges.every((v, i) => i === 0 || v >= bbAges[i - 1] || v === 0));
  await p.screenshot({ path: 'test/shots/v117-divisions.png', fullPage: true });
  // --- Rings: finished division out of running order
  await p.click('.tab:has-text("Rings")'); await p.waitForTimeout(300);
  ok('finished division not in the running order', !(await p.$$eval('.rdivs .rdiv .name', x => x.map(y => y.textContent))).includes(name));
  ok('finished division listed under Finished', /Finished/.test(await p.textContent('details.rdone summary')) && (await p.$$eval('details.rdone button', x => x.map(y => y.textContent))).some(t => t.includes(name)));
  await p.screenshot({ path: 'test/shots/v117-rings.png', fullPage: true });
  // --- Kata pool score: officials list folds away; scores advance
  await p.click('.tab:has-text("Mat")'); await p.waitForTimeout(300);
  await p.click('button[data-act="kp-score"] >> nth=0'); await p.waitForSelector('#kp-s0');
  const sels = await p.$$eval('details.officials select', x => x.map(y => y.id));
  ok('officials list open at first', await p.$eval('details.officials', d => d.open));
  for (let i = 0; i < sels.length; i++) {
    const v = await p.$eval('#' + sels[i], s => [...s.options].find(o => o.value).value);
    await p.selectOption('#' + sels[i], v); await p.waitForTimeout(120);
    if (i === 0) ok('after a pick, the next position gets focus', await p.evaluate(id => document.activeElement && document.activeElement.id === id, sels[1]));
  }
  ok('all seated → officials list folds away', !(await p.$eval('details.officials', d => d.open)));
  ok('…and focus moves on to the kata name', await p.evaluate(() => document.activeElement && document.activeElement.id === 'kp-kata'));
  await p.fill('#kp-kata', 'Jion');
  await p.focus('#kp-s0'); await p.keyboard.type('7.5'); await p.waitForTimeout(80);
  ok('7.5 typed → next judge focused', await p.evaluate(() => document.activeElement.id === 'kp-s1'));
  await p.keyboard.type('10'); await p.waitForTimeout(80);
  ok('10 typed → next judge focused', await p.evaluate(() => document.activeElement.id === 'kp-s2'));
  await p.keyboard.type('8'); await p.keyboard.press('Enter'); await p.waitForTimeout(80);
  ok('Enter also moves on', await p.evaluate(() => document.activeElement.id === 'kp-s3'));
  const J = (await p.$$('input[data-input="kp-j"]')).length;
  for (let i = 3; i < J; i++) { await p.keyboard.type('7.8'); await p.waitForTimeout(60); }
  await p.waitForTimeout(200);
  ok('after the last judge → Save score focused and highlighted', await p.evaluate(() => document.activeElement.id === 'kp-save' && document.activeElement.classList.contains('nudge')));
  await p.screenshot({ path: 'test/shots/v117-kp.png' });
  await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  ok('Enter on Save stores the score', await p.$eval('#modal', m => m.hidden) || /Recorded score/.test(await p.textContent('#modal')));
  // --- phone: one tap on a kata pool competitor opens the score card; a picked official closes the picker
  const { devices } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
  const ctx = await b.newContext({ ...devices['iPhone 13'] }); const m = await ctx.newPage(); m.on('pageerror', e => errors.push(e.message)); await m.route(/fonts\./, r => r.abort());
  await m.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await m.tap('button:has-text("Create demo tournament")'); await m.tap('button[data-kind="local"]'); await m.waitForSelector('text=Director checklist', { timeout: 60000 });
  await m.tap('.bn:has-text("Divisions")'); await m.waitForTimeout(300); await m.tap('button:has-text("Draw all ready")'); await m.tap('#confirm button:has-text("Draw")'); await m.waitForTimeout(800);
  await m.tap('.bn[data-act="more-tabs"]'); await m.waitForTimeout(250); await m.tap('.menu-item:has-text("Brackets")'); await m.waitForTimeout(300);
  const mo = await m.$$eval('#br-div option', x => x.map(y => [y.value, y.textContent]));
  await m.selectOption('#br-div', mo.find(x => /Senior Men Individual Kata/.test(x[1]))[0]); await m.waitForTimeout(300);
  ok('phone: kata pool competitor is a real button', !!(await m.$('tr.click[data-act="kp-score"] button.kp-who')));
  ok('phone: tap targets skip double-tap zoom', (await m.$eval('tr.click[data-act="kp-score"]', e => getComputedStyle(e).touchAction)) === 'manipulation');
  await m.tap('tr.click[data-act="kp-score"] >> nth=0 >> button.kp-who'); await m.waitForTimeout(400);
  ok('phone: one tap opens the score card', !(await m.$eval('#modal', x => x.hidden)) && !!(await m.$('#kp-s0')));
  const s0 = await m.$$eval('details.officials select', x => x.map(y => y.id));
  await m.selectOption('#' + s0[0], await m.$eval('#' + s0[0], s => [...s.options].find(o => o.value).value)); await m.waitForTimeout(150);
  ok('phone: after picking an official no list stays open (nothing focused)', await m.evaluate(() => !document.activeElement || document.activeElement.tagName !== 'SELECT'));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
