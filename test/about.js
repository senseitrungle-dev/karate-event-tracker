// v1.16.0: tap the logo → About popup (name, version, status, signed-in user, role); Close removes it
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const url = 'file://' + path.resolve('dist/karate-event-tracker.html');
  const ver = require('../package.json').version;
  // local mode, desktop
  let p = await b.newPage({ viewport: { width: 1280, height: 900 } }); p.on('pageerror', e => errors.push(e.message)); await p.route(/fonts\./, r => r.abort());
  await p.goto(url);
  await p.click('.bar .logo-btn'); await p.waitForSelector('#about-root .about-grid');
  ok('popup shows app name', /Karate Event Tracker/.test(await p.textContent('#about-root')));
  ok('popup shows version', (await p.textContent('#about-version')).trim() === 'v' + ver);
  ok('local: status Local mode', /Local mode/.test(await p.textContent('#about-status')));
  ok('local: user explained', /local mode has no accounts/.test(await p.textContent('#about-user')));
  await p.click('button:has-text("Create demo tournament")').catch(() => {});
  await p.click('#modal button[data-act="modal-close"].primary'); await p.waitForTimeout(150);
  ok('Close removes the popup', await p.$eval('#modal', m => m.hidden));
  await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  await p.click('.bar .logo-btn'); await p.waitForSelector('#about-role');
  ok('in an event: role shows Director in that event', /Director/.test(await p.textContent('#about-role')) && /Riverside/.test(await p.textContent('#about-role')));
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  ok('Escape also closes', await p.$eval('#modal', m => m.hidden));
  await p.click('.bar button.brand'); await p.waitForTimeout(200);
  ok('tapping the name still goes Home', !!(await p.$('text=Create demo tournament')));
  await p.close();
  // phone
  p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); p.on('pageerror', e => errors.push(e.message)); await p.route(/fonts\./, r => r.abort());
  await p.goto(url); await p.tap('.bar .logo-btn'); await p.waitForSelector('#about-root .about-grid');
  const box = await p.$eval('#modal .sheet', e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth }; });
  ok('phone: popup fits the screen', box.l >= 0 && box.r <= box.w + 0.5);
  await p.screenshot({ path: 'test/shots/about-phone.png' });
  await p.close();
  // Firebase: signed-out sign-in screen, then signed in
  const mock = fs.readFileSync('test/fbmock.js', 'utf8');
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\.|gstatic/, r => r.abort());
  p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.addInitScript(`sessionStorage.setItem('nextuid','u_boss');` + mock); await p.goto(url);
  await p.waitForSelector('button[data-act="fb-signin"]');
  await p.click('.bar .logo-btn'); await p.waitForSelector('#about-user');
  ok('sign-in screen: Not signed in', /Not signed in/.test(await p.textContent('#about-user')));
  await p.click('#modal button.primary[data-act="modal-close"]');
  for (let k = 0; k < 4 && !(await p.$('.bar button[data-act="fb-signout"]')); k++) { await p.click('button[data-act="fb-signin"]').catch(() => {}); await p.waitForTimeout(1500); }
  await p.click('text=Become director'); await p.waitForSelector('text=Manage access', { timeout: 10000 });
  await p.click('.bar .logo-btn'); await p.waitForSelector('#about-user');
  ok('signed in: name and email', /User u_boss/.test(await p.textContent('#about-user')) && /u_boss@x\.test/.test(await p.textContent('#about-user')));
  ok('signed in: Online', /Online/.test(await p.textContent('#about-status')));
  ok('signed in: App admin role', /App admin/.test(await p.textContent('#about-role')));
  ok('signed in: Sign out offered', !!(await p.$('#modal button[data-act="fb-signout"]')));
  await p.screenshot({ path: 'test/shots/about-firebase.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
