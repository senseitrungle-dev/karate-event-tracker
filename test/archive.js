// v1.11.0: approve results → lock (read-only) → archive (off the Home list) → reopen
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const file = 'file://' + path.resolve('dist/karate-event-tracker.html');
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\./, r => r.abort());
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
    await p.goto(file);
    await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
    ok('no archive card before the tournament starts', !(await p.$('button[data-act="ev-archive"]')));
    await p.click('.tab:has-text("Divisions")'); await p.click('button:has-text("Draw all ready")'); await p.click('#confirm button:has-text("Draw")'); await p.waitForTimeout(800);
    // score one match so the event has results
    await p.click('.tab:has-text("Mat")'); await p.click('button[data-act="score"] >> nth=0'); await p.waitForTimeout(200);
    if (await p.$('.corner.a button[data-t="ippon"]')) await p.click('.corner.a button[data-t="ippon"]'); else for (const i of [0, 1, 2]) await p.click(`button[data-act="flag"][data-i="${i}"][data-s="a"]`).catch(() => {});
    await p.click('button[data-act="save-result"]').catch(() => {}); await p.waitForTimeout(300);
    await p.click('.tab:has-text("Dashboard")'); await p.waitForTimeout(200);
    ok('archive card shows unfinished divisions', /not finished/.test(await p.textContent('.archive-card')));
    await p.click('button[data-act="ev-archive"]'); await p.click('#confirm button:has-text("Approve & archive")'); await p.waitForTimeout(500);
    ok('banner: official results, read-only', /Official results/.test(await p.textContent('#main')) && /read-only/.test(await p.textContent('.lock-banner')));
    ok('no editing controls (settings, draw, score)', !(await p.$('button[data-act="event-edit"]')) && !(await p.$('button[data-act="live-go"]')));
    await p.click('.tab:has-text("Brackets")'); await p.waitForTimeout(150);
    ok('no score buttons on Brackets', !(await p.$('button[data-act="score"], tr.click[data-act="kp-score"]')));
    await p.screenshot({ path: 'test/shots/archive-locked.png' });
    await p.click('.bar button.brand'); await p.waitForTimeout(200);
    ok('event gone from the main list', !(await p.$('.grid3:not(details .grid3) .ev-card')));
    ok('event listed under Archive', /Archive/.test(await p.textContent('#main')) && !!(await p.$('details.archive-list .ev-card')));
    await p.click('details.archive-list summary'); await p.waitForTimeout(100);
    await p.click('details.archive-list button.ev-card'); await p.waitForTimeout(300);
    await p.click('button[data-act="ev-reopen"]'); await p.click('#confirm button:has-text("Reopen")'); await p.waitForTimeout(400);
    ok('reopened: editable again', !!(await p.$('button[data-act="event-edit"]')) && !(await p.$('.lock-banner')));
    await p.click('.bar button.brand'); await p.waitForTimeout(200);
    ok('back on the main list', !!(await p.$('.grid3 .ev-card')) && !(await p.$('details.archive-list')));
    await ctx.close();
  }
  { // Firebase: database refuses writes to an archived event
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\.|gstatic/, r => r.abort());
    const mock = fs.readFileSync('test/fbmock.js', 'utf8');
    const p = await ctx.newPage(); await p.addInitScript(`sessionStorage.setItem('nextuid','u_dir');` + mock); p.on('pageerror', e => errors.push('fb: ' + e.message)); await p.goto(file);
    for (let k = 0; k < 4; k++) { await p.waitForSelector('button[data-act="fb-signin"], .bar button[data-act="fb-signout"]'); if (await p.$('.bar button[data-act="fb-signout"]')) break; await p.waitForTimeout(400); await p.click('button[data-act="fb-signin"]').catch(() => {}); await p.waitForTimeout(1500); }
    await p.click('text=Become director'); await p.waitForSelector('text=Manage access', { timeout: 10000 });
    await p.click('button:has-text("Create demo tournament") >> nth=0'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
    await p.click('.tab:has-text("Divisions")'); await p.click('button:has-text("Draw all ready")'); await p.click('#confirm button:has-text("Draw")'); await p.waitForTimeout(1200);
    await p.click('.tab:has-text("Dashboard")'); await p.click('button[data-act="ev-archive"]'); await p.click('#confirm button:has-text("Approve & archive")'); await p.waitForTimeout(600);
    const r = await p.evaluate(async () => { const fs = firebase.firestore(); const evs = await fs.collection('events').get(); const id = evs.docs[0].id; try { await fs.doc('events/' + id + '/competitors/x').set({ firstName: 'Late' }); return 'written'; } catch (e) { return e.code; } });
    ok('Firebase rules refuse changes to an archived event', r === 'permission-denied');
    await ctx.close();
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
