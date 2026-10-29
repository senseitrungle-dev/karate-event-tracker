// v1.20.0: app admin invites people to the app by email (tournament director / ring manager); after they accept,
// the admin adds them to events; they sign in and see those events; invited directors can create events
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const signIn = async (pg) => { for (let k = 0; k < 4; k++) { await pg.waitForSelector('button[data-act="fb-signin"], .bar button[data-act="fb-signout"]', { timeout: 15000 }); if (await pg.$('.bar button[data-act="fb-signout"]')) return; await pg.waitForTimeout(400); await pg.click('button[data-act="fb-signin"]').catch(() => {}); await pg.waitForTimeout(1500); } };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\.|gstatic/, r => r.abort());
  const mock = fs.readFileSync('test/fbmock.js', 'utf8');
  const mk = async (u) => { const p = await ctx.newPage(); await p.addInitScript(`sessionStorage.setItem('nextuid','${u}');` + mock); p.on('pageerror', e => errors.push(u + ': ' + e.message)); await p.goto('file://' + path.resolve('dist/karate-event-tracker.html')); await signIn(p); return p; };
  const home = async p => { await p.reload(); await p.waitForTimeout(1000); if (await p.$('.bar button.brand')) { await p.click('.bar button.brand'); await p.waitForTimeout(300); } };
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('fbmock')));
  const A = await mk('u_admin');
  await A.click('text=Become director'); await A.waitForSelector('text=Manage access', { timeout: 10000 }); await A.waitForSelector('details.admin-card', { state: 'attached', timeout: 5000 }); await A.click('details.admin-card > summary'); await A.waitForTimeout(200);
  await A.click('button:has-text("Create demo tournament") >> nth=0'); await A.click('button[data-kind="local"]'); await A.waitForSelector('text=Director checklist', { timeout: 60000 });
  const eid = Object.keys(await db(A)).find(k => /^events\/[^/]+$/.test(k)).split('/')[1];
  await home(A);
  // invite two people from the App admin card
  ok('App admin card has the invite form', !!(await A.$('#f-app-invite')));
  for (const [email, role] of [['u_dee@x.test', 'organizer'], ['u_mia@x.test', 'member']]) {
    await A.fill('#ai-email', email); await A.selectOption('#ai-role', role); await A.click('#f-app-invite button[type="submit"]'); await A.waitForTimeout(500);
    ok(`invitation sheet for ${email}`, /Karate Event Tracker as/.test(await A.inputValue('#inv-body')) && /Tournament director|Ring manager/.test(await A.inputValue('#inv-subj')));
    await A.click('#modal button.primary[data-act="modal-close"]'); await A.waitForTimeout(200);
  }
  await A.waitForTimeout(400);
  ok('both invitations waiting', /u_dee@x\.test/.test(await A.textContent('.admin-card')) && /u_mia@x\.test/.test(await A.textContent('.admin-card')));
  // a non-admin cannot create an app-level invite (rules)
  // invitees sign in → accepted
  const D = await mk('u_dee'); await D.waitForTimeout(1800); await home(D);
  let d = await db(A);
  ok('director invite accepted → may create events', (d['roles/u_dee'] || {}).role === 'organizer' && !!(await D.$('button[data-act="event-new"]')));
  ok('…invitation removed', !d['invites/u_dee@x.test']);
  const M = await mk('u_mia'); await M.waitForTimeout(1800); await home(M);
  d = await db(A);
  ok('ring manager invite accepted (recorded, no create rights)', (d['users/u_mia'] || {}).invitedAs === 'manager' && !(await M.$('button[data-act="event-new"]')) && !d['invites/u_mia@x.test']);
  ok('before being added, Mia cannot open the event', !(await M.$(`button.ev-card[data-id="${eid}"]`)));
  const rogue = await M.evaluate(async () => { try { await firebase.firestore().doc('invites/x@y.z').set({ email: 'x@y.z', scope: 'app', role: 'organizer' }); return 'written'; } catch (e) { return e.code; } });
  ok('non-admin cannot create an app invitation', rogue === 'permission-denied');
  // admin adds them to the event
  await home(A);
  ok('admin sees them as director / ring manager', /u_dee/.test(await A.textContent('#acc-directors')) && /u_mia/.test(await A.textContent('#acc-managers')));
  await A.selectOption('#ae-ev-u_mia', eid); await A.selectOption('#ae-role-u_mia', 'manager'); await A.click('button[data-act="app-add-event"][data-id="u_mia"]'); await A.waitForTimeout(500);
  await A.selectOption('#ae-ev-u_dee', eid); await A.selectOption('#ae-role-u_dee', 'director'); await A.click('button[data-act="app-add-event"][data-id="u_dee"]'); await A.waitForTimeout(500);
  d = await db(A);
  ok('Mia added to the event (ring to be picked)', (d['events/' + eid].staffIds || []).includes('u_mia'));
  ok('Dee added as director', (d['events/' + eid].directorIds || []).includes('u_dee'));
  await A.screenshot({ path: 'test/shots/appinvite-admin.png', fullPage: true });
  // they sign in and see the event
  await home(M);
  ok('Mia now sees and can open the event', !!(await M.$(`button.ev-card[data-id="${eid}"]`)));
  await M.click(`button.ev-card[data-id="${eid}"]`); await M.waitForTimeout(600);
  ok('…as ring manager', /Ring manager/.test(await M.textContent('.bar')));
  await home(D); await D.click(`button.ev-card[data-id="${eid}"]`); await D.waitForTimeout(600);
  ok('Dee opens it as Director', /Director/.test(await D.textContent('.bar')) && !!(await D.$('.tab:has-text("People")')));
  await D.click('.tab:has-text("People")'); await D.waitForTimeout(400);
  ok('event People tab: Mia marked “Added · pick a ring”', /Added · pick a ring/.test(await D.textContent('#main')));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
