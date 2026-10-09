// v1.13.0: division pop-up → Bracket tab; unique seeds; group separation; clock Stop on a slow mouse click
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); p.on('pageerror', e => errors.push(e.message));
  await p.route(/fonts\./, r => r.abort());
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  await p.click('.tab:has-text("Divisions")'); await p.click('button:has-text("Draw all ready")'); await p.click('#confirm button:has-text("Draw")'); await p.waitForTimeout(800);
  // 1. division pop-up → Bracket
  await p.click('button[data-act="div-panel"] >> nth=0'); await p.waitForSelector('#divp-root');
  const did = await p.getAttribute('#divp-root button[data-act="view-bracket"]', 'data-id');
  await p.click('#divp-root button[data-act="view-bracket"]'); await p.waitForTimeout(250);
  ok('pop-up closes', await p.$eval('#modal', m => m.hidden));
  ok('Brackets tab active', /Brackets/.test(await p.textContent('.tab.on, .tab[aria-selected="true"], .tab.active').catch(() => '')) || !!(await p.$('#br-div')));
  ok('that division is selected', (await p.$eval('#br-div', s => s.value)) === did);
  // 2. duplicate seeds
  await p.click('.tab:has-text("Divisions")'); await p.click('button[data-act="div-panel"] >> nth=0'); await p.click('#divp-root button[data-act="div-edit"]'); await p.waitForSelector('#f-div');
  const seeds = await p.$$('#f-div input[data-input="seed"]');
  await seeds[0].fill('1'); await seeds[1].fill('1'); await p.waitForTimeout(100);
  ok('clash message shows', await p.$eval('#seed-msg', m => !m.hidden && /Seed 1 is given to/.test(m.textContent)));
  ok('both inputs marked', (await p.$$('#f-div input.clash')).length === 2);
  await p.click('#modal button[type="submit"]'); await p.waitForTimeout(250);
  ok('save is blocked', !(await p.$eval('#modal', m => m.hidden)));
  await seeds[1].fill('2'); await p.waitForTimeout(100);
  ok('message clears once unique', await p.$eval('#seed-msg', m => m.hidden));
  await p.click('#modal button[type="submit"]'); await p.waitForTimeout(300);
  ok('unique seeds save', await p.$eval('#modal', m => m.hidden));
  // 3. Shobu Ippon clock: slow mouse press/release on Stop
  await p.click('.tab:has-text("Brackets")'); await p.waitForTimeout(200);
  const o = await p.$$eval('#br-div option', x => x.map(y => [y.value, y.textContent]));
  const shobu = o.find(x => /Kumite/.test(x[1]) && !/Junior|Team/.test(x[1])) || o.find(x => /Kumite/.test(x[1]));
  await p.selectOption('#br-div', shobu[0]); await p.waitForTimeout(200);
  await p.click('.bm.click >> nth=0'); await p.waitForTimeout(200);
  if (await p.$('#match-root button[data-act="score"]')) await p.click('#match-root button[data-act="score"]');
  await p.waitForSelector('#clock-btn');
  const slowClick = async () => { const bb = await (await p.$('#clock-btn')).boundingBox(); await p.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2); await p.mouse.down(); await p.waitForTimeout(450); await p.mouse.up(); await p.waitForTimeout(250); };
  await slowClick();
  ok('Start on a slow click', (await p.textContent('#clock-btn')) === 'Stop');
  ok('scoring disabled while running', await p.$eval('.corner.a button[data-act="k-ev"]', x => x.disabled));
  await p.waitForTimeout(1200);
  await slowClick();
  ok('Stop on a slow click (press spans clock repaints)', (await p.textContent('#clock-btn')) === 'Start');
  const t1 = await p.textContent('#clock'); await p.waitForTimeout(1300);
  ok('clock really stopped', t1 === await p.textContent('#clock'));
  ok('scoring enabled when stopped', !(await p.$eval('.corner.a button[data-act="k-ev"]', x => x.disabled)));
  await p.click('#clock-btn'); await p.waitForTimeout(150);
  ok('a quick click toggles exactly once', (await p.textContent('#clock-btn')) === 'Stop');
  await p.focus('#clock-btn'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  ok('keyboard still works', (await p.textContent('#clock-btn')) === 'Start');
  await p.screenshot({ path: 'test/shots/v113-clock.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
