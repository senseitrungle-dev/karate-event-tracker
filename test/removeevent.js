// v1.14.0: a director removes a ring manager / another director from ONE event; their other events are unchanged
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
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('fbmock')));
  const open = async (p, id) => { await home(p); await p.evaluate(id => { const x = [...document.querySelectorAll('button.ev-card')].find(y => y.dataset.id === id); if (x) x.click(); }, id); await p.waitForTimeout(600); };
  const A = await mk('u_admin');
  await A.click('text=Become director'); await A.waitForSelector('text=Manage access', { timeout: 10000 });
  for (const k of ['local', 'national']) { await home(A); await A.click('button:has-text("Create demo tournament") >> nth=0'); await A.click(`button[data-kind="${k}"]`); await A.waitForSelector('text=Director checklist', { timeout: 60000 }); }
  const M = await mk('u_mgr'), D = await mk('u_dee');
  const evs = Object.entries(await db(A)).filter(([k]) => /^events\/[^/]+$/.test(k)).map(([k, v]) => ({ id: k.split('/')[1], v }));
  const e1 = evs.find(e => e.v.demoKind === 'local').id, e2 = evs.find(e => e.v.demoKind === 'national').id;
  // admin puts Mia on a ring and Dee as director in BOTH events
  for (const e of [e1, e2]) {
    await open(A, e); await A.click('.tab:has-text("People")'); await A.waitForTimeout(400);
    const rid = await A.$eval('#pr-u_mgr', s => [...s.options].find(o => o.value && !o.value.startsWith('__')).value);
    await A.selectOption('#pr-u_mgr', rid); await A.waitForTimeout(500);
    await A.selectOption('#pr-u_dee', '__dir'); await A.waitForTimeout(500);
  }
  await A.waitForTimeout(1500);
  let d = await db(A);
  ok('setup: Mia manager and Dee director in both events', [e1, e2].every(e => (d['events/' + e].managerIds || []).includes('u_mgr') && (d['events/' + e].directorIds || []).includes('u_dee')));
  // Dee (a director, not admin) removes Mia from event 1
  await open(D, e1); await D.click('.tab:has-text("People")'); await D.waitForTimeout(400);
  ok('Remove from event button on the ring manager', !!(await D.$('.card:has(h3:text("Ring")) button[data-act="event-remove"][data-id="u_mgr"]')));
  await D.click('button[data-act="event-remove"][data-id="u_mgr"]'); await D.waitForSelector('#confirm button:has-text("Remove from event")');
  ok('confirm says other events stay', /other events stays the same/.test(await D.textContent('#confirm')));
  await D.click('#confirm button:has-text("Remove from event")'); await D.waitForTimeout(1200);
  d = await db(D);
  ok('Mia gone from event 1 (event + every ring)', !(d['events/' + e1].managerIds || []).includes('u_mgr') && !Object.entries(d).some(([k, v]) => k.startsWith(`events/${e1}/rings/`) && (v.managerIds || []).includes('u_mgr')));
  ok('Mia still manager in event 2', (d['events/' + e2].managerIds || []).includes('u_mgr') && Object.entries(d).some(([k, v]) => k.startsWith(`events/${e2}/rings/`) && (v.managerIds || []).includes('u_mgr')));
  ok('division scorers of event 1 no longer list Mia', !Object.entries(d).some(([k, v]) => k.startsWith(`events/${e1}/divisions/`) && (v.scorerIds || []).includes('u_mgr')));
  await home(M);
  ok('Mia: event 1 locked, event 2 opens', !!(await M.$(`.ev-card.locked`)) && !!(await M.$(`button.ev-card[data-id="${e2}"]`)) && !(await M.$(`button.ev-card[data-id="${e1}"]`)));
  // admin removes Dee (a director) from event 1
  await open(A, e1); await A.click('.tab:has-text("People")'); await A.waitForTimeout(400);
  await A.click('.card:has(h3:text("Directors of this event")) button[data-act="event-remove"][data-id="u_dee"]'); await A.click('#confirm button:has-text("Remove from event")'); await A.waitForTimeout(1000);
  d = await db(A);
  ok('Dee no longer a director of event 1', !(d['events/' + e1].directorIds || []).includes('u_dee'));
  ok('Dee still a director of event 2', (d['events/' + e2].directorIds || []).includes('u_dee'));
  await home(D);
  ok('Dee: event 1 locked, event 2 opens', !(await D.$(`button.ev-card[data-id="${e1}"]`)) && !!(await D.$(`button.ev-card[data-id="${e2}"]`)));
  // the last director cannot remove themself
  await open(D, e2); await D.click('.tab:has-text("People")'); await D.waitForTimeout(300);
  const dirs = (await db(D))['events/' + e2].directorIds || [];
  console.log('  event 2 directors:', dirs.join(', '));
  await A.screenshot({ path: 'test/shots/remove-event.png', fullPage: true });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
