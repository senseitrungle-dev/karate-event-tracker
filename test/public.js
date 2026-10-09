// v1.6.0: public spectator link per event (local mode + Firebase mock with read rules)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const signIn = async (pg) => { for (let k = 0; k < 4; k++) { await pg.waitForSelector('button[data-act="fb-signin"], .bar button[data-act="fb-signout"]', { timeout: 15000 }); if (await pg.$('.bar button[data-act="fb-signout"]')) return; await pg.waitForTimeout(400); await pg.click('button[data-act="fb-signin"]').catch(() => {}); await pg.waitForTimeout(1500); } };
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const file = 'file://' + path.resolve('dist/karate-event-tracker.html');
  /* ---------- local mode ---------- */
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route(/fonts\./, r => r.abort());
    const d = await ctx.newPage(); d.on('pageerror', e => errors.push('dir: ' + e.message));
    await d.goto(file);
    await d.click('button:has-text("Create demo tournament")'); await d.click('button[data-kind="local"]'); await d.waitForSelector('text=Director checklist', { timeout: 30000 });
    await d.click('button.brand'); await d.waitForTimeout(200);
    await d.click('button:has-text("Create demo tournament")'); await d.click('button[data-kind="local"]'); await d.waitForSelector('text=Director checklist', { timeout: 30000 });
    await d.click('.tab:has-text("Divisions")'); await d.click('button:has-text("Draw all ready")'); await d.click('#confirm button:has-text("Draw")'); await d.waitForTimeout(800);
    await d.click('.tab:has-text("Dashboard")'); await d.waitForTimeout(200);
    ok('go-live checklist on director dashboard', /Ready to go live\?/.test(await d.textContent('#main')));
    await d.click('button[data-act="live-go"][data-force="1"]'); await d.click('#confirm button:has-text("Go live anyway")'); await d.waitForTimeout(400);
    const link = await d.$eval('#share-url', i => i.value);
    ok('public link has a random token', /#watch=[0-9a-f]{32}$/.test(link));
    await d.screenshot({ path: 'test/shots/pub-share-card.png' });
    const v = await ctx.newPage(); v.on('pageerror', e => errors.push('pub: ' + e.message));
    await v.goto(link); await v.waitForTimeout(800);
    ok('public visitor lands in the event dashboard', /Riverside/.test(await v.textContent('#bar')) && (await v.$eval('.tab[aria-selected="true"]', t => t.textContent)) === 'Dashboard');
    const tabs = await v.$$eval('.tab', t => t.map(x => x.textContent));
    console.log('  public tabs:', tabs.join(','));
    ok('tab order Dashboard, Follow, Rings, Divisions', tabs.slice(0, 4).join(',') === 'Dashboard,Follow,Rings,Divisions');
    ok('no event list / back / role switch', !(await v.$('[data-act="home"]')) && !(await v.$('#sim-role')) && !(await v.$('.share-card')));
    ok('no scoring controls', !(await v.$('button[data-act="score"], [data-act="kp-score"]')));
    await v.click('.tab:has-text("Rings")'); await v.waitForTimeout(150);
    ok('spectator Rings view lists divisions per ring', (await v.$$('.vrow')).length > 0 && (await v.$$('.ring-card')).length === 2);
    await v.screenshot({ path: 'test/shots/pub-rings.png', fullPage: true });
    await v.click('.tab:has-text("Divisions")'); await v.waitForTimeout(150);
    const nDiv = (await v.$$('.vrow')).length; ok('spectator Divisions list', nDiv > 0);
    await v.click('.vrow >> nth=0'); await v.waitForTimeout(150);
    ok('division opens its bracket', (await v.$eval('.tab[aria-selected="true"]', t => t.textContent)) === 'Brackets');
    await v.click('.tab:has-text("Follow")'); await v.waitForTimeout(100);
    ok('follow tab works', !!(await v.$('#follow-q')));
    await v.setViewportSize({ width: 390, height: 844 }); await v.click('.bn:has-text("Dashboard")'); await v.waitForTimeout(150);
    const bn = await v.$$eval('.bn', x => x.map(y => y.textContent.trim()));
    ok('phone bar: Dashboard, Follow, Rings, Divisions', bn.slice(0, 4).join(',') === 'Dashboard,Follow,Rings,Divisions');
    await v.click('.bn[data-act="more-tabs"]'); await v.waitForTimeout(100);
    ok('More sheet has no All events', !(await v.$('.menu-item[data-act="home"]')));
    await v.screenshot({ path: 'test/shots/pub-mobile-more.png' });
    await v.click('button[data-act="modal-close"]');
    // bad token
    const x = await ctx.newPage(); await x.goto(file + '#watch=deadbeef'); await x.waitForTimeout(600);
    ok('invalid token shows not available, no events', /not available/.test(await x.textContent('#main')) && !(await x.$('.ev-card')));
    // stop sharing
    await d.click('button[data-act="live-end"]'); await d.click('#confirm button:has-text("End live")'); await d.waitForTimeout(600);
    await v.waitForTimeout(600);
    ok('End live cuts off the open public page', /no longer shared/.test(await v.textContent('#main')));
    await ctx.close();
  }
  /* ---------- Firebase mock: signed-out visitor, read rules ---------- */
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route(/fonts\.|gstatic/, r => r.abort());
    const mock = fs.readFileSync('test/fbmock.js', 'utf8');
    const mk = async (nextuid, url) => { const p = await ctx.newPage(); await p.addInitScript(`sessionStorage.setItem('nextuid','${nextuid}');` + mock); p.on('pageerror', e => errors.push('fb: ' + e.message)); await p.goto(url || file); return p; };
    const d = await mk('u_dir');
    await signIn(d); await d.waitForSelector('text=Become director', { timeout: 10000 }).catch(async e => { console.log('BODY', (await d.innerText('body')).slice(0, 400), errors); throw e; }); await d.click('text=Become director');
    await d.waitForSelector('text=Manage access', { timeout: 10000 });
    await d.click('button:has-text("Create demo tournament") >> nth=0'); await d.click('button[data-kind="local"]'); await d.waitForSelector('text=Director checklist', { timeout: 60000 });
    await d.click('button[data-act="live-go"][data-force="1"]'); await d.click('#confirm button:has-text("Go live anyway")'); await d.waitForTimeout(500);
    const link = await d.$eval('#share-url', i => i.value);
    const v = await mk('', link); await v.waitForTimeout(1200);
    ok('Firebase: signed-out visitor sees the shared event without sign-in', !(await v.$('text=Sign in with Google')) && /Riverside/.test(await v.textContent('#bar')));
    ok('Firebase: competitors visible', ((await v.$$eval('.stat b', x => x.map(y => y.textContent)))[0] || '0') !== '0');
    const leak = await v.evaluate(async () => { try { await firebase.firestore().collection('events').get(); return 'listed'; } catch (e) { return e.code; } });
    ok('Firebase: signed-out visitor cannot list events', leak === 'permission-denied');
    const pv = await v.evaluate(async () => { try { await firebase.firestore().collection('pv/x/competitors').get(); return 'read'; } catch (e) { return e.code; } });
    ok('Firebase: private details not readable', pv === 'permission-denied');
    await ctx.close();
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
