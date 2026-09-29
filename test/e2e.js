const { chromium } = require('/home/claude/.npm-global/lib/node_modules/playwright');
const path = require('path');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text()) && !/ERR_/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  await page.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  const shot = n => page.screenshot({ path: `test/shots/${n}.png`, fullPage: false });
  const click = async sel => { await page.click(sel); await page.waitForTimeout(60); };
  await page.waitForSelector('text=No events yet');
  await shot('01-empty');
  // demo
  await click('button:has-text("Create demo tournament")');
  await page.waitForSelector('text=Director checklist', { timeout: 20000 });
  await page.waitForTimeout(300);
  await shot('02-overview');
  // divisions tab, draw all
  await click('.tab:has-text("Divisions")');
  await shot('03-divisions');
  await click('button:has-text("Draw all ready")');
  await click('#confirm button:has-text("Draw")');
  await page.waitForTimeout(800);
  const drawnCount = await page.$$eval('button:has-text("Bracket")', b => b.length);
  console.log('drawn divisions:', drawnCount);
  // Brackets tab
  await click('.tab:has-text("Brackets")');
  await page.waitForTimeout(200);
  await shot('04-bracket');
  // manager access before scoring
  await page.selectOption('#sim-role', 'manager'); await page.waitForTimeout(150);
  await page.selectOption('#sim-ring', { index: 2 }); await page.waitForTimeout(150);
  await click('.tab:has-text("Mat")');
  const r2 = await page.$$eval('button[data-act="score"]', b => b.map(x => x.closest('.ring-card').querySelector('h3').textContent));
  console.log('manager of Ring 2 can score in rings:', [...new Set(r2)].join(','), 'count', r2.length);
  await page.selectOption('#mat-ring', { index: 0 });
  await page.selectOption('#sim-role', 'director'); await page.waitForTimeout(150);
  // Score every ready match via Mat tab for all divisions
  let scored = 0;
  for (let guard = 0; guard < 150; guard++) {
    await click('.tab:has-text("Mat")');
    const btn = await page.$('button[data-act="score"]');
    if (!btn) break;
    await page.waitForTimeout(100); await page.click('button[data-act="score"] >> nth=0'); await page.waitForTimeout(80);
    // determine panel type
    const root = await page.$('#score-root');
    if (await root.$('.srow input')) {
      const n = await root.$$eval('.srow input[data-s="a"]', x => x.length);
      for (let i = 0; i < n; i++) { await page.fill(`#sc-a-${i}`, String(7 + (i % 3) * 0.5)); await page.dispatchEvent(`#sc-a-${i}`, 'change'); await page.fill(`#sc-b-${i}`, String(6.5 + (i % 2) * 0.5)); await page.dispatchEvent(`#sc-b-${i}`, 'change'); }
    } else if (await root.$('.board .corner') && await root.$('text=Team match')) {
      // team kumite: bout 1 Aka ippon, bout 2 Aka ippon
      for (let b = 0; b < 2; b++) { await click(`button[data-act="bout-sel"][data-i="${b}"]`); await click('.corner.a button[data-t="ippon"]'); }
    } else if (await root.$('text=Part 1')) {
      const j = await root.$$eval('.jrow', x => x.length);
      for (let i = 0; i < j; i++) await click(`button[data-act="flag"][data-f="flags"][data-i="${i}"][data-s="${i < 2 ? 'b' : 'a'}"]`);
      // kumite: shiro scores waza, time up -> split
      await click('.corner.b button[data-t="waza"]'); await click('button[data-t="timeup"]');
      if (await page.$('button[data-act="fk-hantei"]')) await click('button[data-act="fk-hantei"][data-s="a"]');
    } else if (await root.$('.corner button[data-t="waza"]')) {
      // kumite: aka waza, shiro keikoku, time up
      await click('.corner.a button[data-t="waza"]'); await click('.corner.b button[data-t="keikoku"]');
      await click('button[data-act="clock"]'); await page.waitForTimeout(300); await click('button[data-act="clock"]');
      await click('button[data-t="timeup"]');
    } else if (await root.$('.jrow')) {
      const j = await root.$$eval('.jrow', x => x.length);
      for (let i = 0; i < j; i++) await click(`button[data-act="flag"][data-i="${i}"][data-s="${i % 2 ? 'b' : 'a'}"]`);
    }
    if (scored === 0) await shot('05-scoresheet');
    const save = await page.$('button[data-act="save-result"]:not([disabled])');
    if (!save) { console.log('could not complete scoresheet'); await shot('err-sheet'); break; }
    await save.click(); await page.waitForTimeout(120);
    scored++;
  }
  console.log('matches scored:', scored);
  await click('.tab:has-text("Results")');
  await page.waitForTimeout(200);
  await shot('06-results');
  const fin = await page.$$eval('.chip', c => c.filter(x => /Final|Awarded/.test(x.textContent)).length);
  const prog = await page.$$eval('.chip', c => c.filter(x => /In progress/.test(x.textContent)).length);
  console.log('final divisions:', fin, 'in progress:', prog);
  // DE bracket view
  await click('.tab:has-text("Brackets")');
  const opts = await page.$$eval('#br-div option', o => o.map(x => [x.value, x.textContent]));
  const de = opts.find(o => /Senior Men Individual Kumite/.test(o[1]));
  if (de) { await page.selectOption('#br-div', de[0]); await page.waitForTimeout(150); await shot('07-de-bracket'); }
  const rr = opts.find(o => /Junior Men Individual Kata/.test(o[1]));
  if (rr) { await page.selectOption('#br-div', rr[0]); await page.waitForTimeout(150); await shot('08-rr'); }
  // tiebreak on RR
  if (rr) {
    await click('button[data-act="tiebreak"] >> nth=0');
    await click('button[data-act="tb-move"][data-i="3"][data-dir="-1"]');
    await click('button[data-act="tb-save"]'); await page.waitForTimeout(200);
    console.log('RR after tiebreak finished:', !!(await page.$('text=Final placings')));
  }
  // undo: open DE grand final (done) -> undo allowed? GF2 may exist
  if (de) {
    await page.selectOption('#br-div', de[0]); await page.waitForTimeout(150);
    const gf2done = await page.$('.bm.click[data-mid="GF2"]');
    const target = gf2done ? 'GF2' : 'GF';
    await click(`.bm[data-mid="${target}"]`);
    const undo = await page.$('button[data-act="undo-result"]');
    console.log('undo available on', target, !!undo);
    if (undo) { await undo.click(); await click('#confirm button:has-text("Undo result")'); await page.waitForTimeout(200); }
    console.log('DE placings after undo shows Placings so far:', !!(await page.$('text=Placings so far')));
    // early match should NOT be undoable
    await click('.bm[data-mid="W1-0"]');
    console.log('undo on W1-0 (expect false):', !!(await page.$('button[data-act="undo-result"]')));
    await click('button[data-act="modal-close"] >> nth=0');
  }
  // competitor form
  await click('.tab:has-text("Competitors")');
  await click('button:has-text("Add competitor")');
  await page.fill('#c-first', 'Test'); await page.fill('#c-last', 'Person'); await page.selectOption('#c-gender', 'F'); await page.fill('#c-dob', '2011-05-05'); await page.selectOption('#c-rank', 'd1'); await page.fill('#c-dojo', 'Test Dojo');
  await page.check('input[name="events"][value="IKATA"]');
  await shot('09-comp-form');
  await click('button[type="submit"][form="f-comp"]');
  await page.waitForTimeout(200);
  const unplacedChip = await page.$$eval('tr', rows => rows.filter(r => /Person, Test/.test(r.textContent)).map(r => r.innerHTML.includes('chip bad')));
  console.log('cadet? new 15yo black belt placed (expect true = unplaced since age ~15 → cadet exists):', unplacedChip);
  // CSV import
  await click('button:has-text("Import CSV")');
  await page.fill('#imp-text', 'first_name,last_name,gender,dob,rank,dojo,events,waiver\nAiko,Tanaka,F,2001-04-12,Shodan,Hoshi Dojo,Individual Kata;Individual Kumite,yes\nBad,Row,,,,,\n"Ng, Jr",Chen,M,3/7/1990,2nd Dan,"Dojo, East",Kumite,y');
  await click('button[data-act="imp-preview"]');
  console.log('import preview:', await page.textContent('#imp-preview'));
  await click('button[data-act="imp-run"]'); await page.waitForTimeout(400);
  const nrows = await page.$$eval('tbody tr', r => r.length);
  console.log('competitor rows:', nrows);
  // role switch to spectator
  await page.selectOption('#sim-role', 'viewer'); await page.waitForTimeout(150);
  const tabs = await page.$$eval('.tab', t => t.map(x => x.textContent));
  console.log('viewer tabs:', tabs.join(','));
  await page.selectOption('#sim-role', 'manager'); await page.waitForTimeout(150);
  await page.selectOption('#sim-ring', { index: 1 }); await page.waitForTimeout(150);
  await click('.tab:has-text("Mat")');
  await shot('10-manager-mat');
  const mgrScore = await page.$$eval('button[data-act="score"]', b => b.length);
  console.log('manager score buttons (ring 1 only):', mgrScore);
  await page.selectOption('#sim-role', 'director'); await page.waitForTimeout(150);
  // Camp
  await click('button.brand');
  await click('button:has-text("New event")');
  await page.fill('#ev-name', 'Autumn Gasshuku'); await page.selectOption('#ev-kind', 'camp');
  await click('button[type="submit"][form="f-event"]'); await page.waitForTimeout(200);
  await click('.tab:has-text("Sessions")'); await click('button:has-text("Add session")');
  await page.fill('#s-title', 'Kihon & Heian'); await page.fill('#s-start', '09:00');
  await click('button[type="submit"][form="f-sess"]'); await page.waitForTimeout(150);
  await click('.tab:has-text("Participants")'); await click('button:has-text("Add participant")');
  await page.fill('#c-first', 'Camp'); await page.fill('#c-last', 'Goer'); await page.selectOption('#c-rank', 'k4'); await page.fill('#c-dojo', 'X');
  await click('button[type="submit"][form="f-comp"]'); await page.waitForTimeout(150);
  await click('.tab:has-text("Attendance")');
  await click('button:has-text("Mark all present")'); await page.waitForTimeout(150);
  await click('.tab:has-text("Overview")');
  console.log('camp attendance:', await page.textContent('.stats'));
  await shot('11-camp');
  // mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await click('button.brand'); await page.waitForTimeout(100);
  await click('.ev-card:has-text("Riverside")'); await page.waitForTimeout(200);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  console.log('mobile horizontal overflow:', ov);
  await shot('12-mobile');
  await click('.tab:has-text("Brackets")'); await page.waitForTimeout(100);
  console.log('mobile overflow brackets:', await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1));
  await shot('13-mobile-bracket');
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
