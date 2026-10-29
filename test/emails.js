// v1.23.0: emails shown next to names on the main screen (title bar, event cards, Directors by event, Events by director, chips)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const signIn = async (pg) => { for (let k = 0; k < 4; k++) { await pg.waitForSelector('button[data-act="fb-signin"], .bar button[data-act="fb-signout"]', { timeout: 15000 }); if (await pg.$('.bar button[data-act="fb-signout"]')) return; await pg.waitForTimeout(400); await pg.click('button[data-act="fb-signin"]').catch(() => {}); await pg.waitForTimeout(1500); } };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\.|gstatic/, r => r.abort());
  const mock = fs.readFileSync('test/fbmock.js', 'utf8');
  const mk = async (u) => { const p = await ctx.newPage(); await p.addInitScript(`sessionStorage.setItem('nextuid','${u}');` + mock); p.on('pageerror', e => errors.push(u + ': ' + e.message)); await p.goto('file://' + path.resolve('dist/karate-event-tracker.html')); await signIn(p); return p; };
  const A = await mk('u_admin');
  await A.click('text=Become director'); await A.waitForSelector('text=Manage access', { timeout: 10000 }); await A.waitForSelector('details.admin-card', { state: 'attached', timeout: 5000 }); await A.click('details.admin-card > summary'); await A.waitForTimeout(200);
  await A.click('button:has-text("Create demo tournament") >> nth=0'); await A.click('button[data-kind="local"]'); await A.waitForSelector('text=Director checklist', { timeout: 60000 });
  const D = await mk('u_dee'); await D.waitForTimeout(800);
  await A.reload(); await A.waitForTimeout(1200); if (await A.$('.bar button.brand')) { await A.click('.bar button.brand'); await A.waitForTimeout(300); }
  const sel = await A.$('select[data-change="evdir-add"]'); await sel.selectOption('u_dee'); await A.waitForTimeout(700);
  ok('title bar shows the signed-in email', /u_admin@x\.test/.test(await A.textContent('.bar')));
  ok('event card: directors with emails', /User u_admin \(u_admin@x\.test\), User u_dee \(u_dee@x\.test\)/.test(await A.textContent('.ev-card')));
  ok('Directors by event chips show emails', /u_dee@x\.test/.test(await A.textContent('table.acc')));
  ok('Events by director shows emails', (await A.$$eval('table.acc >> nth=1', () => 0).catch(() => 0)) === 0 && /User u_dee\s*u_dee@x\.test/.test((await A.$$eval('table.acc', t => t.map(x => x.textContent)))[1] || ''));
  ok('Approved / not assigned lists show emails', /u_dee@x\.test/.test(await A.textContent('.admin-card')));
  await A.screenshot({ path: 'test/shots/emails-home.png', fullPage: true });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
