// v1.38: ring manager calls the next queued item, checks competitors in, then starts it
const { chromium, devices } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ ...devices['iPhone 13'] }); const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.route(/fonts\./, r => r.abort());
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.tap('button:has-text("Create demo tournament")'); await p.tap('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  await p.tap('.bn:has-text("Divisions")'); await p.waitForTimeout(300); await p.tap('button:has-text("Draw all ready")'); await p.tap('#confirm button:has-text("Draw")'); await p.waitForTimeout(800);
  await p.tap('.bn:has-text("Mat")'); await p.waitForTimeout(300);
  const card = '.ring-card >> nth=0';
  const callBtn = await p.$('.ring-card >> nth=0 >> button[data-act="ring-call"]');
  ok('ring card offers "Call to ring" for the next queued item', !!callBtn);
  const nextName = (await p.textContent('.ring-card >> nth=0 >> .callbox b')).trim();
  await callBtn.tap(); await p.waitForTimeout(400);
  const ann = (await p.textContent('.ring-card >> nth=0 >> .announce')).trim();
  ok('announcement names the ring and competitors', /now calling/.test(ann) && nextName.split(' vs ').every(n => ann.includes(n)));
  ok('announcement says who is on deck', /On deck:/.test(ann));
  ok('Start is locked until everyone is checked in', await p.$eval('.ring-card >> nth=0 >> button[data-act="ring-start"]', x => x.disabled));
  if (process.env.SHOT) { await p.$eval('.ring-card >> nth=0', e => e.scrollIntoView()).catch(() => {}); const el = await p.$('.callbox.called'); await el.scrollIntoViewIfNeeded(); await p.screenshot({ path: process.env.SHOT }); }
  await p.tap('.ring-card >> nth=0 >> button[data-act="ring-recall"]'); await p.waitForTimeout(300);
  ok('Call again counts the calls', /Called × 2/.test(await p.textContent('.ring-card >> nth=0 >> .callbox')));
  const boxes = await p.$$('.ring-card >> nth=0 >> input[data-change="call-present"]');
  for (let i = 0; i < boxes.length; i++) { await p.tap(`.ring-card >> nth=0 >> input[data-change="call-present"] >> nth=${i}`); await p.waitForTimeout(250); }
  ok('all present → Start unlocks', !(await p.$eval('.ring-card >> nth=0 >> button[data-act="ring-start"]', x => x.disabled)));
  // spectator sees the call
  await p.selectOption('#sim-role', 'viewer'); await p.waitForTimeout(300); await p.tap('.bn:has-text("Dashboard")').catch(() => {}); await p.waitForTimeout(300);
  ok('spectators see who is called to the ring', /Called/.test(await p.textContent('body')) && !!(await p.$('.called-line')));
  await p.selectOption('#sim-role', 'director'); await p.waitForTimeout(300); await p.tap('.bn:has-text("Mat")'); await p.waitForTimeout(300);
  await p.tap('.ring-card >> nth=0 >> button[data-act="ring-start"]'); await p.waitForTimeout(600);
  ok('Start opens the scoresheet / score card', !!(await p.$('#modal')) && !!(await p.$('#score-root, #kp-s0')));
  await p.tap('#modal button.ghost[data-act="modal-close"]').catch(() => {}); await p.waitForTimeout(300);
  const now = (await p.textContent('.ring-card >> nth=0 >> .now')) || '';
  ok('started item is now on the mat', nextName.split(' vs ').every(n => now.includes(n)));
  // call the next one while the mat is busy
  await p.tap('.ring-card >> nth=0 >> button[data-act="ring-call"]'); await p.waitForTimeout(400);
  const boxes2 = await p.$$('.ring-card >> nth=0 >> input[data-change="call-present"]');
  for (let i = 0; i < boxes2.length; i++) { await p.tap(`.ring-card >> nth=0 >> input[data-change="call-present"] >> nth=${i}`); await p.waitForTimeout(250); }
  ok('next can be called while the mat is busy, but not started', await p.$eval('.ring-card >> nth=0 >> button[data-act="ring-start"]', x => x.disabled) && /Finish the match on the mat first/.test(await p.textContent('.ring-card >> nth=0 >> .callbox')));
  const raw = await p.evaluate(() => localStorage.getItem('kt-local-v1') || '');
  ok('call is stored with the ring state', /ringstate[^]*"call":\{/.test(raw));
  await p.tap('.ring-card >> nth=0 >> button[data-act="ring-uncall"]'); await p.waitForTimeout(300);
  ok('Cancel call returns to "Call to ring"', !!(await p.$('.ring-card >> nth=0 >> button[data-act="ring-call"]')));
  const w = await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
  ok('fits the phone width', w);
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
