// v1.9.0: several tournament directors — app admin approves directors; each sees only their own events' data
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const signIn = async (pg) => { for (let k = 0; k < 4; k++) { await pg.waitForSelector('button[data-act="fb-signin"], .bar button[data-act="fb-signout"]', { timeout: 15000 }); if (await pg.$('.bar button[data-act="fb-signout"]')) return; await pg.waitForTimeout(400); await pg.click('button[data-act="fb-signin"]').catch(() => {}); await pg.waitForTimeout(1500); } };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\.|gstatic/, r => r.abort());
  const mock = fs.readFileSync('test/fbmock.js', 'utf8');
  const mk = async (u) => { const p = await ctx.newPage(); await p.addInitScript(`sessionStorage.setItem('nextuid','${u}');` + mock); p.on('pageerror', e => errors.push(u + ': ' + e.message)); await p.goto('file://' + path.resolve('dist/karate-event-tracker.html')); await signIn(p); return p; };
  const home = async p => { await p.reload(); await p.waitForTimeout(900); if (await p.$('.bar button.brand')) { await p.click('.bar button.brand'); await p.waitForTimeout(300); } };
  // A = app admin
  const A = await mk('u_admin');
  await A.click('text=Become director'); await A.waitForSelector('text=Manage access', { timeout: 10000 });
  await A.click('button:has-text("Create demo tournament") >> nth=0'); await A.click('button[data-kind="local"]'); await A.waitForSelector('text=Director checklist', { timeout: 60000 });
  // B and C sign in: no create button; they request to become tournament directors
  const B = await mk('u_bob'), C = await mk('u_cat');
  ok('B cannot create events yet', !(await B.$('button[data-act="event-new"]')));
  ok('B sees the admin’s event, locked', !!(await B.$('.ev-card.locked')));
  const leak = await B.evaluate(async () => { try { await firebase.firestore().collection('live/' + 'x' + '/brackets').get(); const evs = await firebase.firestore().collection('events').get(); const id = evs.docs[0].id; await firebase.firestore().collection('events/' + id + '/competitors').get(); return 'read'; } catch (e) { return e.code; } });
  ok('B cannot read the locked event’s competitors (database rules)', leak === 'permission-denied');
  await B.click('button[data-act="org-request"]'); await B.waitForTimeout(300);
  await C.click('button[data-act="org-request"]'); await C.waitForTimeout(300);
  await home(A);
  const reqN = (await A.$$('button[data-act="org-approve"]')).length;
  if (reqN !== 2) console.log('  dbg', await A.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('fbmock'))).filter(k => /org|roles/.test(k)).join(',')), JSON.stringify((await A.innerText('#main')).slice(0, 400)));
  ok('admin sees both requests', reqN === 2);
  await A.click('button[data-act="org-approve"] >> nth=0'); await A.waitForTimeout(300); await A.click('button[data-act="org-approve"] >> nth=0'); await A.waitForTimeout(300);
  await A.screenshot({ path: 'test/shots/access-admin.png', fullPage: true });
  // B creates an event
  await home(B);
  ok('approved B can create events', !!(await B.$('button[data-act="event-new"]')));
  await B.click('button:has-text("Create demo tournament") >> nth=0'); await B.click('button[data-kind="local"]'); await B.waitForSelector('text=Director checklist', { timeout: 60000 });
  ok('B is director of own event', /Director/.test(await B.textContent('.bar')));
  await home(B);
  ok('B: own event open, admin’s event locked', (await B.$$('button.ev-card')).length === 1 && (await B.$$('.ev-card.locked')).length === 1);
  // C sees B's event locked, requests access
  await home(C);
  ok('C sees two locked events', (await C.$$('.ev-card.locked')).length === 2);
  await C.click('button[data-act="req-access"] >> nth=0'); await C.waitForTimeout(300);
  ok('C request shows as sent', /Request sent/.test(await C.textContent('#main')));
  // whose event did C ask for? approve from that director's People tab
  const reqFor = await C.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('kt-reqs') || '{}')).filter(k => k !== '__org')[0]);
  const owner = await A.evaluate(id => (JSON.parse(localStorage.getItem('fbmock'))['events/' + id] || {}).createdBy, reqFor);
  const D = owner === 'u_bob' ? B : A;
  await home(D);
  await D.evaluate(id => { const b = [...document.querySelectorAll('button.ev-card')].find(x => x.dataset.id === id); if (b) b.click(); }, reqFor); await D.waitForTimeout(500);
  await D.click('.tab:has-text("People")'); await D.waitForTimeout(300);
  const hasReq = !!(await D.$('select[data-change="req-approve"]'));
  ok('event director sees the access request on People', hasReq);
  if (hasReq) { await D.selectOption('select[data-change="req-approve"]', '__dir'); await D.waitForTimeout(500); }
  await home(C);
  ok('C can now open that event', (await C.$$('button.ev-card')).length === 1);
  await C.click('button.ev-card'); await C.waitForTimeout(500);
  ok('C is director there', /Director/.test(await C.textContent('.bar')));
  // app admin overview: directors by event / events by director, add & remove
  await home(A);
  const tbl = await A.textContent('details.admin-card');
  ok('admin sees "Directors by event" and "Events by director"', /Directors by event/.test(tbl) && /Events by director/.test(tbl));
  const rowTxt = await A.$eval(`select[data-change="evdir-add"][data-ev="${reqFor}"]`, s => s.closest('tr').textContent);
  ok('the event lists C as a director', /u_cat/.test(rowTxt));
  await A.screenshot({ path: 'test/shots/access-admin-table.png', fullPage: true });
  await A.click(`button[data-act="evdir-remove"][data-ev="${reqFor}"][data-id="u_cat"]`); await A.waitForTimeout(150);
  if (await A.$('#confirm:not([hidden]) button:has-text("Remove")')) await A.click('#confirm button:has-text("Remove")');
  await A.waitForTimeout(500);
  await home(C);
  ok('after removal C can no longer open the event', (await C.$$('button.ev-card')).length === 0);
  await A.selectOption(`select[data-change="evdir-add"][data-ev="${reqFor}"]`, 'u_cat'); await A.waitForTimeout(500);
  await home(C);
  ok('admin re-adds C from the table', (await C.$$('button.ev-card')).length === 1);
  ok('event cards show their directors', /Directors?:/.test(await C.textContent('#main')));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
