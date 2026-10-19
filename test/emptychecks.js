// v1.30.1: an empty event must not pass the go-live checks (nothing to check ≠ done)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\./, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  // need local mode first: create a demo, go home, then a new empty tournament
  await p.click('button:has-text("Create demo tournament") >> nth=0'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 30000 });
  await p.click('.bar button.brand'); await p.waitForTimeout(300);
  await p.click('button[data-act="event-new"]:visible'); await p.waitForTimeout(200);
  await p.fill('#ev-name', 'Empty Cup'); await p.fill('#ev-start', '2026-11-20');
  await p.selectOption('#ev-kind', 'tournament').catch(() => {});
  await p.click('#modal button[type="submit"]'); await p.waitForTimeout(800);
  const items = await p.$$eval('ul.checks li', l => l.map(x => ({ cls: x.className, t: x.textContent.replace(/\s+/g, ' ').trim() })));
  items.forEach(i => console.log('   ', i.cls.padEnd(3), i.t));
  ok('checklist shown', items.length >= 6);
  ok('no item is ticked in an empty event', items.every(i => i.cls !== 'ok'));
  const t = n => (items.find(i => i.t.includes(n)) || {}).t || '';
  ok('full judging panel: not passed, says why', /No divisions with competitors yet/.test(t('full judging panel')));
  ok('ring manager: not passed', !/All rings staffed/.test(t('ring manager')));
  ok('rings ready: not passed', !/All rings confirmed ready/.test(t('helpers ready')));
  ok('judges / competitors explain what is missing', /No judges added yet/.test(t('judges checked in')) && /No competitors registered yet/.test(t('competitors checked in')));
  ok('Go live button disabled', await p.$eval('button[data-act="live-go"]:not([data-force])', x => x.disabled));
  await p.screenshot({ path: 'test/shots/emptychecks.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
