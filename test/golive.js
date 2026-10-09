// v1.8.0: Go live readiness checklist, ring readiness, judge check-in, Go live / End live
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\./, r => r.abort());
  const d = await ctx.newPage(); d.on('pageerror', e => errors.push(e.message));
  await d.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await d.click('button:has-text("Create demo tournament")'); await d.click('button[data-kind="local"]'); await d.waitForSelector('text=Director checklist', { timeout: 30000 });
  const items = async () => d.$$eval('ul.checks li', x => x.map(li => li.className + ':' + li.querySelector('b').textContent));
  let it = await items();
  ok('checklist shown before going live', it.length === 7);
  ok('no LIVE indicator before going live', !/LIVE/.test(await d.textContent('.bar')));
  ok('Go live disabled while not ready', await d.$eval('button[data-act="live-go"]:not([data-force])', btn => btn.disabled));
  ok('undrawn divisions flagged', it.some(x => /^no:Event set up/.test(x)));
  await d.click('.tab:has-text("Divisions")'); await d.click('button:has-text("Draw all ready")'); await d.click('#confirm button:has-text("Draw")'); await d.waitForTimeout(800);
  // judges check in
  await d.click('.tab:has-text("Judges")'); await d.waitForTimeout(150);
  for (let k = 0; k < 20; k++) { const btn = await d.$('.card:has(h3:text-matches("^Ring")) button[data-act="judge-in"][aria-pressed="false"]'); if (!btn) break; await btn.click(); await d.waitForTimeout(60); }
  ok('judges checked in on the Judges tab', (await d.$$('.card:has(h3:text-matches("^Ring")) button[data-act="judge-in"][aria-pressed="true"]')).length === 14);
  // rings ready on the Mat tab (helpers + ready)
  await d.click('.tab:has-text("Mat")'); await d.waitForTimeout(150);
  const hs = await d.$$eval('input[data-change="ring-helpers"]', x => x.map(y => y.id));
  ok('ring readiness boxes before the start', hs.length === 2);
  for (const id of hs) { await d.fill('#' + id, 'Sam (score), Lee (time)'); await d.dispatchEvent('#' + id, 'change'); await d.waitForTimeout(150); }
  for (let k = 0; k < 2; k++) { await d.click('button[data-act="ring-ready"]:has-text("Ring is ready")'); await d.waitForTimeout(200); }
  ok('both rings marked ready', (await d.$$('.ready-box.on')).length === 2);
  await d.screenshot({ path: 'test/shots/golive-mat.png' });
  await d.click('.tab:has-text("Dashboard")'); await d.waitForTimeout(200);
  it = await items(); console.log('  ' + it.join(' | '));
  ok('setup, competitors, judges, panels, readiness all ticked', ['Event set up', 'Every division is on a ring', 'All competitors', 'All judges', 'Each ring has a full', 'Rings, managers and helpers'].every(l => it.some(x => x.startsWith('ok:' + l))));
  ok('ring managers still missing (local mode has no accounts)', it.some(x => /^no:Every ring has a ring manager/.test(x)));
  await d.screenshot({ path: 'test/shots/golive-checklist.png', fullPage: true });
  await d.click('button[data-act="live-go"][data-force="1"]'); await d.click('#confirm button:has-text("Go live anyway")'); await d.waitForTimeout(400);
  ok('event is live', /Tournament is live/.test(await d.textContent('#main')));
  ok('LIVE indicator in the top bar once live', /● LIVE/.test(await d.textContent('.bar')));
  const link = await d.$eval('#share-url', i => i.value);
  ok('Copy link and Open public page buttons', !!(await d.$('button[data-act="share-copy"]')) && await d.$eval('#share-open', (a, l) => a.target === '_blank' && a.href === l, link));
  ok('readiness boxes hidden once live', !(await d.$('.ready-box')));
  await d.screenshot({ path: 'test/shots/golive-live.png' });
  const v = await ctx.newPage(); await v.goto(link); await v.waitForTimeout(700);
  ok('public page opens the event', /Riverside/.test(await v.textContent('#bar')));
  await d.click('button[data-act="live-end"]'); await d.click('#confirm button:has-text("End live")'); await d.waitForTimeout(500);
  ok('LIVE indicator off after End live', !/LIVE/.test(await d.textContent('.bar')));
  ok('End live returns to the checklist with end time', /Live ended/.test(await d.textContent('#main')));
  await v.waitForTimeout(500);
  ok('public page shut off', /no longer shared/.test(await v.textContent('#main')));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
