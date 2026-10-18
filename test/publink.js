// v1.25.0: public link + QR code before the start: waiting page (no data) → live automatically on Go live →
// "turned off" on End live → link off on Stop sharing; QR PNG download
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const signIn = async (pg) => { for (let k = 0; k < 4; k++) { await pg.waitForSelector('button[data-act="fb-signin"], .bar button[data-act="fb-signout"]', { timeout: 15000 }); if (await pg.$('.bar button[data-act="fb-signout"]')) return; await pg.waitForTimeout(400); await pg.click('button[data-act="fb-signin"]').catch(() => {}); await pg.waitForTimeout(1500); } };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); await ctx.route(/fonts\.|gstatic/, r => r.abort());
  const mock = fs.readFileSync('test/fbmock.js', 'utf8'), file = 'file://' + path.resolve('dist/karate-event-tracker.html');
  const mk = async (u, url) => { const p = await ctx.newPage(); await p.addInitScript(`sessionStorage.setItem('nextuid','${u}');` + mock); p.on('pageerror', e => errors.push(u + ': ' + e.message)); await p.goto(url || file); return p; };
  const d = await mk('u_dir'); await signIn(d); await d.click('text=Become director'); await d.waitForSelector('text=Manage access', { timeout: 10000 });
  await d.click('button:has-text("Create demo tournament") >> nth=0'); await d.click('button[data-kind="local"]'); await d.waitForSelector('text=Director checklist', { timeout: 60000 });
  ok('share card offers link & QR before the start', !!(await d.$('button[data-act="share-on"]')) && /before the tournament/.test(await d.textContent('.share-card')));
  await d.click('button[data-act="share-on"]'); await d.waitForTimeout(600);
  ok('link + QR code shown, state “Waiting for the start”', !!(await d.$('#share-url')) && !!(await d.$('#share-qr svg path')) && /Waiting for the start/.test(await d.textContent('#share-state')));
  const [dl] = await Promise.all([d.waitForEvent('download'), d.click('button[data-act="share-qr-png"]')]);
  ok('QR code downloads as PNG', /-QR\.png$/.test(dl.suggestedFilename()));
  await dl.saveAs('test/shots/qr.png');
  const link = await d.$eval('#share-url', i => i.value);
  await d.screenshot({ path: 'test/shots/publink-card.png' });
  // spectator opens the link before the start
  const v = await mk('', link); await v.waitForTimeout(1500);
  ok('before the start: waiting page with event details', !!(await v.$('#pub-wait')) && /hasn’t started yet/.test(await v.textContent('#pub-wait')) && /Riverside/.test(await v.textContent('#pub-wait')));
  ok('…no tabs / results', !(await v.$('.tab, .bn, .ring-card')));
  const leak = await v.evaluate(async () => { try { const evs = JSON.parse(localStorage.getItem('fbmock')); const id = Object.keys(evs).find(k => /^events\/[^/]+$/.test(k)).split('/')[1]; await firebase.firestore().collection('events/' + id + '/competitors').get(); return 'read'; } catch (e) { return e.code; } });
  ok('…event data closed to the public until live (rules)', leak === 'permission-denied');
  await v.screenshot({ path: 'test/shots/publink-wait.png' });
  // go live → the open page switches by itself
  await d.click('button[data-act="live-go"][data-force="1"]'); await d.click('#confirm button:has-text("Go live anyway")'); await d.waitForTimeout(800);
  ok('same link after Go live', (await d.$eval('#share-url', i => i.value)) === link && /Live/.test(await d.textContent('#share-state')));
  await v.waitForTimeout(1500);
  ok('spectator page turned live automatically', !(await v.$('#pub-wait')) && !!(await v.$('.tab, .bn')));
  // end live → page says turned off; link stays
  await d.click('button[data-act="live-end"]'); await d.click('#confirm button:has-text("End live")'); await d.waitForTimeout(800);
  await v.waitForTimeout(1500);
  ok('End live → public page says live was turned off', /turned off by the tournament director/.test(await v.textContent('#main')) && !(await v.$('.tab, .bn')));
  ok('…link kept for the next Go live', (await d.$eval('#share-url', i => i.value)) === link && /Live ended/.test(await d.textContent('#share-state')));
  // stop sharing → link off
  await d.click('button[data-act="share-off"]'); await d.click('#confirm button:has-text("Stop sharing")'); await d.waitForTimeout(800);
  await v.waitForTimeout(1500);
  ok('Stop sharing → link no longer works', /no longer shared|not available|not valid/.test(await v.textContent('#main')));
  // stronger borders around people on the home page
  await d.click('.bar button.brand'); await d.waitForTimeout(400);
  const bw = await d.$eval('.admin-card .jrow2.pr', e => getComputedStyle(e).borderTopWidth);
  ok('App admin: each person in a bordered box', bw === '2px');
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
