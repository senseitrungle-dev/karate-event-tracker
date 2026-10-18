// v1.21.0: app admin lists show emails; Remove → "Not assigned"; ✕ Remove access → "Access removed" (blocked until
// they request again); Restore → Not assigned; Make director / ring manager
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const signIn = async (pg) => { for (let k = 0; k < 4; k++) { await pg.waitForSelector('button[data-act="fb-signin"], .bar button[data-act="fb-signout"], #blocked-card', { timeout: 15000 }); if (await pg.$('.bar button[data-act="fb-signout"], #blocked-card')) return; await pg.waitForTimeout(400); await pg.click('button[data-act="fb-signin"]').catch(() => {}); await pg.waitForTimeout(1500); } };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\.|gstatic/, r => r.abort());
  const mock = fs.readFileSync('test/fbmock.js', 'utf8');
  const mk = async (u) => { const p = await ctx.newPage(); await p.addInitScript(`sessionStorage.setItem('nextuid','${u}');` + mock); p.on('pageerror', e => errors.push(u + ': ' + e.message)); await p.goto('file://' + path.resolve('dist/karate-event-tracker.html')); await signIn(p); return p; };
  const home = async p => { await p.reload(); await p.waitForTimeout(1100); if (await p.$('.bar button.brand')) { await p.click('.bar button.brand'); await p.waitForTimeout(300); } };
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('fbmock')));
  const yes = async p => { await p.click('#confirm button.danger, #confirm [data-act="confirm-yes"]'); await p.waitForTimeout(900); };
  const A = await mk('u_admin');
  await A.click('text=Become director'); await A.waitForSelector('text=Manage access', { timeout: 10000 });
  await A.click('button:has-text("Create demo tournament") >> nth=0'); await A.click('button[data-kind="local"]'); await A.waitForSelector('text=Director checklist', { timeout: 60000 });
  const eid = Object.keys(await db(A)).find(k => /^events\/[^/]+$/.test(k)).split('/')[1];
  await home(A);
  for (const [email, role] of [['u_dee@x.test', 'organizer'], ['u_mia@x.test', 'member']]) { await A.fill('#ai-email', email); await A.selectOption('#ai-role', role); await A.click('#f-app-invite button[type="submit"]'); await A.waitForTimeout(400); await A.click('#modal button.primary[data-act="modal-close"]'); await A.waitForTimeout(200); }
  const D = await mk('u_dee'); await D.waitForTimeout(1500); const M = await mk('u_mia'); await M.waitForTimeout(1500);
  await home(A);
  ok('approved director shown with email', /User u_dee\s*u_dee@x\.test/.test(await A.textContent('#acc-directors')));
  ok('ring manager shown with email', /User u_mia\s*u_mia@x\.test/.test(await A.textContent('#acc-managers')));
  await A.selectOption('#ae-ev-u_dee', eid); await A.selectOption('#ae-role-u_dee', 'director'); await A.click('button[data-act="app-add-event"][data-id="u_dee"]'); await A.waitForTimeout(500);
  await A.selectOption('#ae-ev-u_mia', eid); await A.click('button[data-act="app-add-event"][data-id="u_mia"]'); await A.waitForTimeout(500);
  // Remove → Not assigned
  await A.click('#acc-directors button[data-act="acc-unassign"][data-id="u_dee"]'); await yes(A);
  let d = await db(A);
  ok('removed director → Not assigned (with email)', /User u_dee\s*u_dee@x\.test/.test(await A.textContent('#acc-unassigned')) && !/u_dee/.test(await A.textContent('#acc-directors')));
  ok('…no longer tournament director nor event director', !d['roles/u_dee'] && !(d['events/' + eid].directorIds || []).includes('u_dee'));
  await A.click('#acc-managers button[data-act="acc-unassign"][data-id="u_mia"]'); await yes(A);
  d = await db(A);
  ok('removed ring manager → Not assigned, out of the event', /u_mia@x\.test/.test(await A.textContent('#acc-unassigned')) && !(d['events/' + eid].staffIds || []).includes('u_mia'));
  // ✕ Remove access → Access removed
  await A.click('#acc-unassigned button[data-act="acc-revoke"][data-id="u_mia"]'); await yes(A);
  ok('revoked → Access removed list with name and email', /User u_mia\s*u_mia@x\.test/.test(await A.textContent('#acc-removed')) && !/u_mia/.test(await A.textContent('#acc-unassigned')));
  await M.reload(); await M.waitForTimeout(1500);
  ok('revoked user sees “Your access was removed” + Request access', !!(await M.$('#blocked-card')) && !!(await M.$('#blocked-card button[data-act="org-request"]')));
  const leak = await M.evaluate(async () => { try { await firebase.firestore().collection('events').get(); return 'read'; } catch (e) { return e.code; } });
  ok('revoked user cannot read events (rules)', leak === 'permission-denied');
  await M.click('#blocked-card button[data-act="org-request"]'); await M.waitForTimeout(600);
  ok('request sent', /Request sent/.test(await M.textContent('#blocked-card')));
  await home(A);
  ok('admin sees “asks to be let back in”', /let back in/.test(await A.textContent('.admin-card')));
  await A.click('button[data-act="acc-restore"][data-id="u_mia"] >> nth=0'); await A.waitForTimeout(900);
  ok('restored → Not assigned again, Access removed empty', /u_mia@x\.test/.test(await A.textContent('#acc-unassigned')) && !/u_mia/.test(await A.textContent('#acc-removed')));
  await home(M);
  ok('restored user signs in normally', !(await M.$('#blocked-card')) && !!(await M.$('.bar button[data-act="fb-signout"]')));
  await A.click('#acc-unassigned button[data-act="acc-make"][data-id="u_mia"][data-role="manager"]'); await A.waitForTimeout(700);
  ok('Make ring manager → back in Ring managers', /u_mia@x\.test/.test(await A.textContent('#acc-managers')));
  await A.click('#acc-unassigned button[data-act="acc-make"][data-id="u_dee"][data-role="director"]'); await A.waitForTimeout(700);
  d = await db(A);
  ok('Make director → tournament director again', (d['roles/u_dee'] || {}).role === 'organizer' && /u_dee@x\.test/.test(await A.textContent('#acc-directors')));
  await A.screenshot({ path: 'test/shots/appaccess.png', fullPage: true });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
