// v1.17.3: Dashboard "On the mat" — tapping the kata competitor opens their score card (spectators: the bracket)
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
  await p.tap('button[data-act="kp-score"] >> nth=0'); await p.waitForSelector('#kp-s0');
  const who = (await p.textContent('#modal .sheet-h h2')).trim();
  await p.tap('button[data-act="kp-call"]'); await p.waitForTimeout(600);
  await p.tap('#modal button.ghost[data-act="modal-close"]'); await p.waitForTimeout(200);
  await p.tap('.bn:has-text("Dashboard")'); await p.waitForTimeout(400);
  const now = await p.$('.ring-card .now[data-act="kp-score"]');
  ok('On the mat shows the called kata competitor', !!now && (await now.textContent()).includes(who));
  await now.tap(); await p.waitForTimeout(400);
  ok('one tap opens that competitor’s score card', !!(await p.$('#kp-s0')) && (await p.textContent('#modal .sheet-h h2')).trim() === who);
  await p.tap('#modal button.ghost[data-act="modal-close"]'); await p.waitForTimeout(200);
  const nxt = await p.$('.ring-card .queue .q[data-act="kp-score"]');
  if (nxt) { await nxt.tap(); await p.waitForTimeout(400); ok('Up next kata competitor also opens a score card', !!(await p.$('#kp-s0'))); await p.tap('#modal button.ghost[data-act="modal-close"]'); await p.waitForTimeout(200); }
  // spectator view: tap goes to the division's bracket
  await p.selectOption('#sim-role', 'viewer'); await p.waitForTimeout(400);
  await p.tap('.bn:has-text("Dashboard")').catch(() => {}); await p.waitForTimeout(300);
  const vnow = await p.$('.ring-card .now[data-act="view-bracket"]');
  if (vnow) { await vnow.tap(); await p.waitForTimeout(400); ok('spectator: tap opens the bracket', !!(await p.$('#br-div, .kp, table.kp'))); }
  else ok('spectator sees On the mat (tap → bracket)', false);
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
