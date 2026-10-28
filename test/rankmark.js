// v1.45.0: in a drawn division a ranked (seeded) entrant's name shows " *N" wherever it is displayed
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
  await p.click('.tab:has-text("Divisions")'); await W(300);
  // rank two entrants of the senior men kumite division, then draw it
  const DIV = 'Junior Men Individual Kata';   // round robin of 4: every match is playable
  await p.click(`button[data-act="div-panel"]:has-text("${DIV}")`); await W(250);
  await p.click('#modal button[data-act="div-edit"]'); await W(300);
  const rows = await p.$$eval('#d-ents .ent-row', x => x.map(r => ({ id: r.dataset.id, name: r.querySelector('b').textContent.replace(' ›', '').trim() })));
  const [r1, r2] = [rows[0], rows[2]];
  ok('before the draw: no rank mark in the settings list', !rows.some(r => /\*\d/.test(r.name)));
  await p.fill(`#seed-${r1.id}`, '1'); await p.fill(`#seed-${r2.id}`, '2');
  await p.click('#modal button[data-act="draw"]'); await W(300);
  if (await p.$('#confirm:not([hidden]) button')) { await p.click('#confirm:not([hidden]) button.primary, #confirm:not([hidden]) button:has-text("Draw")'); await W(300); }
  await W(500);
  await p.click('.tab:has-text("Brackets")'); await W();
  const did = await p.$$eval('#br-div option', (x, n) => (x.find(o => o.textContent.includes(n)) || {}).value, DIV);
  await p.selectOption('#br-div', did); await W(300);
  const bt = await p.textContent('#main');
  ok('bracket: "*1" and "*2" after the ranked names', bt.includes(r1.name + ' *1') && bt.includes(r2.name + ' *2'));
  ok('bracket: unranked names have no mark', !bt.includes(rows[1].name + ' *'));
  // scoresheet of a match with a ranked entrant
  const bm = await p.$(`.bm[data-act="score"]:has-text("${r1.name} *1"), .bm[data-act="score"]:has-text("${r2.name} *2")`);
  ok('found a ready match with a ranked entrant', !!bm);
  if (bm) { await bm.click(); await W(300); ok('scoresheet shows the rank mark', /\*[12]/.test(await p.textContent('#modal .board')));
    await p.click('#modal button[data-act="call-mat"]'); await W(300); await p.click('#modal button.ghost[data-act="modal-close"]'); await W(); }
  // mat card queue / call panel
  await p.click('.tab:has-text("Mat")'); await W(300);
  const mt = await p.textContent('#main');
  ok('mat card (on the mat) shows the rank mark', /\*[12]/.test(await p.$$eval('.ring-card .now', x => x.map(y => y.textContent).join(' '))));
  void mt;
  // division panel and settings list
  await p.click('.tab:has-text("Divisions")'); await W(200);
  await p.click(`button[data-act="div-panel"]:has-text("${DIV}")`); await W(250);
  ok('division panel chips show the mark', (await p.textContent('#divp-root')).includes(r1.name + ' *1'));
  await p.click('#modal button[data-act="div-edit"]'); await W(300);
  ok('division settings list shows the mark', (await p.textContent('#d-ents')).includes(r1.name + ' *1'));
  await p.click('#modal button[data-act="modal-close"] >> nth=0'); await W();
  // the same person in another (undrawn-with-seed) division has no mark; the competitor list has none
  await p.click('.tab:has-text("Competitors")'); await W(300);
  ok('competitor list (no division) has no mark', !(await p.textContent('#main')).includes(' *1'));
  // other divisions: names without a seed there are unmarked
  await p.click('.tab:has-text("Divisions")'); await p.click('button:has-text("Draw all ready")'); await p.click('#confirm button:has-text("Draw")'); await W(800);
  await p.click('.tab:has-text("Brackets")'); await W();
  const kata = await p.$$eval('#br-div option', x => (x.find(o => /Senior Men Individual Kata/.test(o.textContent)) || {}).value);
  if (kata) { await p.selectOption('#br-div', kata); await W(300); ok('another drawn division: no marks (no seeds there)', !/\*\d/.test(await p.textContent('#main'))); }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
