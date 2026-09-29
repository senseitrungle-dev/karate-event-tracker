const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
  const mock = fs.readFileSync('test/cloudmock.js', 'utf8');
  const url = 'file://' + path.resolve('dist/karate-event-tracker.html');
  const errors = [];
  const mk = async (role) => { const p = await ctx.newPage(); await p.addInitScript(`sessionStorage.setItem('mockRole','${role}');` + mock); p.on('pageerror', e => errors.push(role + ': ' + e.message)); p.on('console', m => { if (m.type() === 'error' && !/ERR_|fonts/.test(m.text())) errors.push(role + ' console: ' + m.text()); }); await p.goto(url); return p; };
  const dir = await mk('admin');
  await dir.waitForSelector('text=No events yet');
  console.log('director chip:', await dir.textContent('.bar'));
  await dir.click('button:has-text("Create demo tournament")');
  await dir.waitForSelector('text=Director checklist', { timeout: 30000 });
  // assign manager to Ring 1 via search
  await dir.click('.tab:has-text("Rings")');
  await dir.waitForTimeout(300); const inp = await dir.$('input[data-input="mgr-search"]');
  await inp.click(); await inp.type('Man'); await dir.waitForTimeout(400);
  await dir.click('.dd-list:not([hidden]) button:has-text("Manny")'); await dir.waitForTimeout(300);
  console.log('manager chip shown:', await dir.$$eval('.person', x => x.map(y => y.textContent).join('|')));
  await dir.click('.tab:has-text("Divisions")');
  await dir.click('button:has-text("Draw all ready")'); await dir.click('#confirm button:has-text("Draw")'); await dir.waitForTimeout(1500);
  const mgr = await mk('interact');
  await mgr.waitForTimeout(800); if (await mgr.$('.ev-card')) await mgr.click('.ev-card'); await mgr.waitForTimeout(400);
  console.log('manager role chip:', await mgr.textContent('.bar .chip:last-child'));
  console.log('manager tabs:', await mgr.$$eval('.tab', t => t.map(x => x.textContent).join(',')));
  await mgr.click('.tab:has-text("Competitors")'); await mgr.waitForTimeout(200);
  console.log('manager sees DOB/incomplete chips (expect 0):', await mgr.$$eval('.chip.warn', x => x.length));
  await mgr.click('.tab:has-text("Mat")'); await mgr.waitForTimeout(200);
  const rings = await mgr.$$eval('button[data-act="score"]', b => [...new Set(b.map(x => x.closest('.ring-card').querySelector('h3').textContent))]);
  console.log('manager scorable rings:', rings.join(','));
  // manager scores a kata flags match
  await mgr.click('button[data-act="score"] >> nth=0'); await mgr.waitForTimeout(150);
  await mgr.click('button[data-act="call-mat"]'); await mgr.waitForTimeout(600);
  // director sees it on the mat
  await dir.click('.tab:has-text("Mat")'); await dir.waitForTimeout(600);
  console.log('director sees on-mat phase/live:', (await dir.$$eval('.ring-card .now', x => x.length)));
  const j = await mgr.$$eval('.jrow', x => x.length);
  for (let i = 0; i < j; i++) await mgr.click(`button[data-act="flag"][data-i="${i}"][data-s="a"]`);
  await mgr.click('button[data-act="save-result"]'); await mgr.waitForTimeout(600);
  await dir.waitForTimeout(600);
  await dir.click('.tab:has-text("Brackets")'); await dir.waitForTimeout(300);
  console.log('director sees results count:', await dir.$$eval('.bm .meta', m => m.filter(x => /Flags/.test(x.textContent)).length));
  // manager tries a director-only write via console: should be rejected by rules
  const r = await mgr.evaluate(async () => { const db = await window.claude.use('db'); try { await db.doc('events/x').set({ a: 1 }); return 'written'; } catch (e) { return e.code; } });
  console.log('manager write to events/ →', r);
  // concurrency: director and manager score different matches simultaneously in different rings
  await dir.click('.tab:has-text("Mat")'); await mgr.click('.tab:has-text("Mat")'); await dir.waitForTimeout(300);
  await dir.selectOption('#mat-ring', { label: 'Ring 2' }); await dir.waitForTimeout(200);
  await dir.click('button[data-act="score"] >> nth=0'); await mgr.click('button[data-act="score"] >> nth=0'); await dir.waitForTimeout(200);
  const doKata = async p => { const n = await p.$$eval('.jrow', x => x.length); for (let i = 0; i < n; i++) await p.click(`button[data-act="flag"][data-i="${i}"][data-s="b"]`); };
  const doKumite = async p => { await p.click('.corner.a button[data-t="ippon"]'); };
  for (const p of [dir, mgr]) { if (await p.$('.jrow')) await doKata(p); else if (await p.$('.corner button[data-t="ippon"]')) await doKumite(p); }
  await Promise.all([dir.click('button[data-act="save-result"]'), mgr.click('button[data-act="save-result"]')]);
  await dir.waitForTimeout(800);
  const all = JSON.parse(await dir.evaluate(() => localStorage.getItem('mockdb')));
  const nres = Object.keys(all).filter(k => k.includes('/brackets/')).reduce((s, k) => s + Object.values(all[k].results || {}).filter(Boolean).length, 0);
  console.log('total results stored (expect 3):', nres);
  const viewer = await mk('view');
  await viewer.waitForTimeout(800); if (await viewer.$('.ev-card')) await viewer.click('.ev-card'); await viewer.waitForTimeout(300);
  console.log('viewer role:', await viewer.textContent('.bar .chip:last-child'), 'tabs:', await viewer.$$eval('.tab', t => t.length));
  await viewer.click('.tab:has-text("Brackets")'); await viewer.waitForTimeout(200);
  console.log('viewer clickable matches (expect 0):', await viewer.$$eval('.bm.click', x => x.length));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})();
