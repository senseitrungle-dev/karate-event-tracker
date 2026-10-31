// v1.62.0: mat card queue grouped by division — a header per division, a clear break, "continues" / "Next division"
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } }); await ctx.route(/fonts\./, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  const W = t => p.waitForTimeout(t || 150);
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  await p.click('.tab:has-text("Divisions")'); await p.click('button:has-text("Draw all ready")'); await p.click('#confirm button:has-text("Draw")'); await W(800);
  await p.click('.tab:has-text("Mat")'); await W(300);
  const card = '.ring-card >> nth=1';   // Ring 2: kumite divisions
  const grps = () => p.$$eval('.ring-card >> nth=1 >> .q-grp', g => g.map(x => ({ did: x.dataset.did, name: x.querySelector('.q-div-name').textContent, tag: (x.querySelector('.q-tag') || {}).textContent || '', left: x.querySelector('.q-div-n').textContent, n: x.querySelectorAll('.q').length })));
  let g = await grps();
  console.log('  ', g.map(x => `${x.name} [${x.tag}] ${x.left} (${x.n})`).join(' | '));
  ok('queue grouped by division: one header per division, no division repeated', g.length >= 2 && new Set(g.map(x => x.did)).size === g.length);
  ok('each header says how many are left in that division', g.every(x => /^\d+ left$/.test(x.left) && +x.left.split(' ')[0] >= x.n));
  ok('nothing on the mat: the first division is "First up"', g[0].tag === 'First up' && g.slice(1).every(x => !x.tag));
  ok('the division name is in the header, not repeated on every match', !(await p.$$eval('.ring-card >> nth=1 >> .q-sub', s => s.some(x => /Kumite/.test(x.textContent) && /Black Belt/.test(x.textContent)))));
  const sep = await p.$eval('.ring-card >> nth=1 >> .q-grp', x => { const c = getComputedStyle(x); return [c.borderLeftWidth, c.borderTopWidth]; });
  ok(`strong break: a framed block per division (${sep.join(', ')})`, parseFloat(sep[0]) >= 3 && parseFloat(sep[1]) >= 1);
  // put the first match on the mat → its division "continues", the next one is "Next division"
  await p.click(`${card} >> .q-grp >> nth=0 >> button[data-act="score"] >> nth=0`); await W(400);
  await p.click('#modal button[data-act="call-mat"]'); await W(300); await p.click('#modal button.ghost[data-act="modal-close"]'); await W(300);
  g = await grps();
  console.log('  ', g.map(x => `${x.name} [${x.tag}] ${x.left}`).join(' | '));
  ok('division on the mat: "on the mat · continues"; the next one: "Next division"', /continues/.test(g[0].tag) && g[1] && g[1].tag === 'Next division');
  await p.screenshot({ path: 'test/shots/matgroups.png', clip: await p.$eval('.ring-card >> nth=1', e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: Math.min(r.height, 900) }; }) });
  await p.setViewportSize({ width: 390, height: 844 }); await W(300);
  ok('phone: no horizontal scroll', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
