// v1.46.0: teams sorted by division; duplicate an event; each person's view (sort/filter per card) kept on their own device
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\./, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  const W = t => p.waitForTimeout(t || 150);
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="national"]'); await p.waitForSelector('text=Director checklist', { timeout: 30000 });
  // --- teams by division
  await p.click('.tab:has-text("Teams")'); await W(300);
  const card = '.card:has(button[data-act="team-new"][data-et="TKATA"])';
  ok('teams card has a sort choice, by division by default', (await p.$eval(`${card} select[data-change="team-sort"]`, s => s.value)) === 'division');
  const heads = await p.$$eval(`${card} .team-grp`, x => x.map(y => y.textContent.trim()));
  ok(`teams grouped under division headings (${heads.join(' | ')})`, heads.length >= 1 && heads.every(h => /Kata|No division/.test(h)));
  await p.selectOption(`${card} select[data-change="team-sort"]`, 'name'); await W(200);
  const names = await p.$$eval(`${card} .team-row .name`, x => x.map(y => y.textContent.trim()));
  ok('by team name A→Z (no headings)', (await p.$$(`${card} .team-grp`)).length === 0 && names.every((n, i) => i === 0 || names[i - 1].localeCompare(n) <= 0));
  // --- per-user view: division order is no longer written to the event
  await p.click('.tab:has-text("Divisions")'); await W(300);
  await p.selectOption('#do-age', 'desc'); await W(200);
  const stored = await p.evaluate(() => { const k = Object.keys(localStorage).find(x => x.startsWith('kt-view-')); return k ? JSON.parse(localStorage.getItem(k)) : null; });
  ok('division order kept in this browser\'s own view (per event)', stored && stored.divOrder && stored.divOrder.age === 'desc' && stored.tab === 'divisions' && stored.teamSort && stored.teamSort.TKATA === 'name');
  const evDoc = await p.evaluate(() => { const db = JSON.parse(localStorage.getItem('kt-local-v1') || '{}'); const k = Object.keys(db).find(x => /^events\/[^/]+$/.test(x)); return k ? db[k] : null; });
  ok('the shared event is not changed by the sort choice', !!evDoc && !evDoc.divOrder);
  // another person = the same shared data without this person's saved views: they see the default order
  const mine = await p.evaluate(() => { const o = {}; for (const k of Object.keys(localStorage)) if (k.startsWith('kt-view-')) { o[k] = localStorage.getItem(k); localStorage.removeItem(k); } return o; });
  await p.evaluate(() => { const u = JSON.parse(localStorage.getItem('kt-ui') || '{}'); localStorage.setItem('kt-ui', JSON.stringify(u)); });
  await p.reload(); await W(900);
  if (await p.$('.ev-card')) { await p.click('.ev-card'); await W(400); }
  await p.click('.tab:has-text("Divisions")'); await W(300);
  ok('another user keeps their own (default) division order', (await p.$eval('#do-age', s => s.value)) === 'asc');
  await p.evaluate(m => { for (const [k, v] of Object.entries(m)) localStorage.setItem(k, v); }, mine);
  // reload: this person's view comes back (tab + sort)
  await p.reload(); await W(800);
  if (await p.$('.ev-card')) { await p.click('.ev-card'); await W(400); }
  ok('after reload: same tab and same sort', !!(await p.$('.tab[aria-selected="true"]:has-text("Divisions")')) && (await p.$eval('#do-age', s => s.value)) === 'desc');
  // --- duplicate the event
  await p.click('button[data-act="event-edit"]'); await W(250);
  await p.click('#modal button[data-act="event-dup"]'); await W(250);
  const info = await p.textContent('#f-dup');
  ok('duplicate dialog lists what is copied', /competitor/.test(info) && /judge/.test(info) && /division/.test(info));
  await p.fill('#dup-name', 'National Championship 2027'); await p.fill('#dup-start', '2027-06-05');
  await p.click('#dup-go'); await W(3000);
  const bar = await p.textContent('.bar');
  ok('the copy opens', /National Championship 2027/.test(bar));
  await p.click('.tab:has-text("Competitors")'); await W(300);
  const txt = await p.textContent('#main');
  ok('competitors copied, check-in reset', /competitors? shown/.test(txt) && !(await p.$('#main .chip.ok:text("Checked in")')));
  await p.click('.tab:has-text("Divisions")'); await W(300);
  ok('divisions copied, not drawn', (await p.$$('#main tr button[data-act="div-panel"]')).length > 5 && (await p.$$('#main button[data-act="view-bracket"]')).length === 0);
  await p.click('.tab:has-text("Judges")'); await W(300);
  ok('judges copied', (await p.$$('#main button[data-act="judge-in"]')).length > 5);
  await p.click('.tab:has-text("Rings")'); await W(300);
  ok('rings copied', (await p.$$('#main .card h3:text-matches("^Ring")')).length === 3);
  await p.click('.tab:has-text("Teams")'); await W(300);
  ok('teams copied', (await p.$$('#main .team-row')).length >= 2);
  const cnt = await p.evaluate(() => { const db = JSON.parse(localStorage.getItem('kt-local-v1') || '{}');
    const evs = Object.keys(db).filter(k => /^events\/[^/]+$/.test(k)).map(k => ({ id: k.split('/')[1], d: db[k] }));
    const c = (id, re) => Object.keys(db).filter(k => re(id).test(k)).length;
    return evs.map(e => ({ name: e.d.name, copiedFrom: e.d.copiedFrom || '', comps: c(e.id, i => new RegExp('^events/' + i + '/competitors/')), pv: c(e.id, i => new RegExp('^pv/' + i + '/competitors/')),
      judges: c(e.id, i => new RegExp('^events/' + i + '/judges/')), checked: Object.keys(db).filter(k => k.startsWith('events/' + e.id + '/competitors/') && db[k].checkedIn).length })); });
  console.log('  ', JSON.stringify(cnt));
  const [orig, copy] = [cnt.find(e => !e.copiedFrom), cnt.find(e => e.copiedFrom)];
  ok('copy has the same competitors, private details and judges', copy && orig && copy.comps === orig.comps && copy.pv === orig.pv && copy.pv > 0 && copy.judges === orig.judges);
  ok('original keeps its check-ins; copy starts with none', orig.checked > 0 && copy.checked === 0);
  // the original still exists, unchanged
  await p.click('.bar button[aria-label], .bar .back, .bar [data-act="home"]').catch(() => {}); await W(400);
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
