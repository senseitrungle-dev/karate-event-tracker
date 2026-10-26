// v1.41.0: mat card / scoresheet → bracket of the current division → back to the match; kata bracket shows kata + score beside each name
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
  const mat = async () => { await p.click('.tab:has-text("Mat")'); await W(); };
  await mat();
  // mat card → bracket → back
  const card = '.ring-card >> nth=1', rid = await p.$eval('.ring-card >> nth=1', x => x.dataset.ring);
  ok('mat card offers View bracket', !!(await p.$(`${card} >> button[data-act="mat-bracket"]`)));
  const want = await p.$eval(`${card} >> button[data-act="mat-bracket"]`, x => x.dataset.did);
  await p.click(`${card} >> button[data-act="mat-bracket"]`); await W(300);
  ok('bracket of that division opens', (await p.$eval('#br-div', s => s.value)) === want && !!(await p.$('.tab[aria-selected="true"]:has-text("Brackets")')));
  ok('Back bar names the ring', /Back to Ring/.test(await p.textContent('.back-bar >> nth=0')) && (await p.$$('.back-bar')).length === 2);
  await p.click('.back-bar >> nth=0 >> button[data-act="back-match"]'); await W(300);
  ok('back to the Mat tab', !!(await p.$('.tab[aria-selected="true"]:has-text("Mat")')) && !!(await p.$(`.ring-card[data-ring="${rid}"]`)));
  await p.click('.tab:has-text("Brackets")'); await W();
  ok('no Back bar when the Brackets tab is opened normally', !(await p.$('.back-bar')));
  await mat();
  // score one kata performance (KP) and one head-to-head kata match
  let kpDone = false, h2hDone = false, kpDid = '', h2hDid = '';
  const n = (await p.$$('button[data-act="score"], button[data-act="kp-score"]')).length;
  for (let i = 0; i < n && !(kpDone && h2hDone); i++) {
    const sel = `button[data-act="score"], button[data-act="kp-score"] >> nth=${i}`;
    const bt = await p.$(sel); if (!bt) break;
    const isKp = (await bt.getAttribute('data-act')) === 'kp-score', did = await bt.getAttribute('data-did');
    if (isKp && kpDone) continue;
    await bt.click(); await W(200);
    if (isKp) {
      await p.fill('#kp-kata', 'Bassai Dai');
      const J = await p.$$eval('input[data-input="kp-j"]', x => x.map(y => y.id));
      for (let k = 0; k < J.length; k++) await p.fill('#' + J[k], (7 + k * 0.1).toFixed(1));
      await p.click('#kp-save'); await W(300); kpDone = true; kpDid = did; await mat(); continue;
    }
    if (!h2hDone && await p.$('#kata-a') && await p.$('#score-root .jrow')) {
      await p.fill('#kata-a', 'Heian Godan'); await p.dispatchEvent('#kata-a', 'change'); await W();
      await p.fill('#kata-b', 'Jion'); await p.dispatchEvent('#kata-b', 'change'); await W();
      const j = await p.$$eval('#score-root .jrow', x => x.length);
      for (let k = 0; k < j; k++) { await p.click(`button[data-act="flag"][data-i="${k}"][data-s="${k === 0 ? 'b' : 'a'}"]`); await W(60); }
      const save = await p.$('button[data-act="save-result"]:not([disabled])');
      if (save) { await save.click(); await W(300); h2hDone = true; h2hDid = did; }
      await p.click('#modal button.ghost[data-act="modal-close"]').catch(() => {}); await mat(); continue;
    }
    await p.click('#modal button.ghost[data-act="modal-close"]').catch(() => {}); await W();
  }
  if (!h2hDone) {   // head-to-head kata (junior round robin / kyu) is further down the queue: open it from its bracket
    await p.click('.tab:has-text("Brackets")'); await W();
    const opts = await p.$$eval('#br-div option', x => x.map(o => ({ v: o.value, t: o.textContent })));
    for (const o of opts.filter(o => /Kata/.test(o.t) && !/Team|Enbu/.test(o.t))) {
      await p.selectOption('#br-div', o.v); await W(200);
      const bm = await p.$('.bm[data-act="score"]'); if (!bm) continue;
      await bm.click(); await W(200);
      if (await p.$('#kata-a')) {
        await p.fill('#kata-a', 'Heian Godan'); await p.dispatchEvent('#kata-a', 'change'); await W();
        await p.fill('#kata-b', 'Jion'); await p.dispatchEvent('#kata-b', 'change'); await W();
        if (await p.$('#score-root .jrow')) { const j = await p.$$eval('#score-root .jrow', x => x.length); for (let k = 0; k < j; k++) { await p.click(`button[data-act="flag"][data-i="${k}"][data-s="${k === 0 ? 'b' : 'a'}"]`); await W(60); } }
        else { const j = await p.$$eval('.srow input[data-s="a"]', x => x.length); for (let k = 0; k < j; k++) { await p.fill(`#sc-a-${k}`, '7.5'); await p.dispatchEvent(`#sc-a-${k}`, 'change'); await p.fill(`#sc-b-${k}`, '7.0'); await p.dispatchEvent(`#sc-b-${k}`, 'change'); } }
        const save = await p.$('button[data-act="save-result"]:not([disabled])');
        if (save) { await save.click(); await W(300); h2hDone = true; h2hDid = o.v; break; }
      }
      await p.click('#modal button.ghost[data-act="modal-close"]').catch(() => {}); await W();
    }
    await mat();
  }
  ok('scored a kata performance', kpDone);
  ok('scored a head-to-head kata match (kata typed for each side)', h2hDone);
  if (kpDone) {
    await p.click('.tab:has-text("Brackets")'); await p.selectOption('#br-div', kpDid); await W(300);
    const line = await p.$$eval('table.kp .kp-line', x => x.map(y => y.textContent.trim()));
    ok('kata bracket: kata and score next to the name', line.some(t => /Bassai Dai/.test(t) && /\d\.\d{3}/.test(t)));
    await p.screenshot({ path: 'test/shots/bracketback-kp.png', fullPage: true });
  }
  if (h2hDone) {
    await p.click('.tab:has-text("Brackets")'); await p.selectOption('#br-div', h2hDid); await W(300);
    const lns = await p.$$eval('.bm .ln', x => x.map(y => ({ k: (y.querySelector('.kata-used') || {}).textContent || '', s: y.querySelector('.sc').textContent })));
    ok('head-to-head kata bracket: kata used beside each name', lns.some(l => l.k === 'Heian Godan') && lns.some(l => l.k === 'Jion'));
    ok('head-to-head kata bracket: score (flags) beside each name', lns.filter(l => l.k).every(l => /^(\d+|\d+\.\d{3})$/.test(l.s)) && lns.filter(l => l.k).every(l => !/\./.test(l.s) || /\.\d{3}$/.test(l.s)));
    await p.screenshot({ path: 'test/shots/bracketback-h2h.png', fullPage: true });
  }
  // scoresheet → bracket → back to the same scoresheet
  await mat();
  const kpB = await p.$('button[data-act="kp-score"]');
  if (kpB) {
    const key = await kpB.getAttribute('data-key'); await kpB.click(); await W(200);
    await p.fill('#kp-kata', 'Kanku Dai');
    await p.click('#modal .sub-btn[data-act="sheet-bracket"]'); await W(300);
    ok('kata score card → its bracket, with Back to match', !(await p.$('#modal:not([hidden]) #kp-kata')) && /Back to match/.test(await p.textContent('.back-bar')));
    await p.click('.back-bar >> nth=0 >> button'); await W(300);
    ok('Back to match reopens the same score card (typed kata kept)', (await p.$eval('#kp-kata', x => x.value)) === 'Kanku Dai' && !!(await p.$('.tab[aria-selected="true"]:has-text("Mat")')));
    await p.click('#modal button.ghost[data-act="modal-close"]'); await W();
    void key;
  }
  // kumite scoresheet: the bout clock is paused and kept
  let kum = false;
  const m = (await p.$$('button[data-act="score"]')).length;
  for (let i = 0; i < m && !kum; i++) {
    await p.click(`button[data-act="score"] >> nth=${i}`); await W(200);
    if (await p.$('#clock-btn')) {
      const full = await p.textContent('#clock');
      await p.click('#clock-btn'); await W(2300);
      await p.click('#modal .sub-btn[data-act="sheet-bracket"]'); await W(300);
      await p.click('.back-bar >> nth=0 >> button'); await W(300);
      const t = await p.textContent('#clock'), btn = await p.textContent('#clock-btn');
      ok(`kumite clock kept and paused across the bracket (${full} → ${t})`, t !== full && /Start/.test(btn));
      kum = true;
    }
    await p.click('#modal button.ghost[data-act="modal-close"]').catch(() => {}); await W();
  }
  ok('found a kumite scoresheet', kum);
  // phone width
  await p.setViewportSize({ width: 390, height: 844 }); await W(300);
  await p.click('.bn:has-text("Mat")'); await W(300);
  await p.click('button[data-act="mat-bracket"] >> nth=0'); await W(300);
  ok('phone: bracket with Back bar, no horizontal page scroll', !!(await p.$('.back-bar')) && await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await p.screenshot({ path: 'test/shots/bracketback-phone.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
