// v1.19.0: Shobu Ippon — clock reaching zero: tie → Kettei-sen (clock reset, waits for Start, scores kept);
// Kettei-sen time out with no score → Hantei; lead at time up → winner; big Start/Stop highlighted as the next action
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); p.on('pageerror', e => errors.push(e.message));
  await p.clock.install();
  await p.route(/fonts\./, r => r.abort());
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  const tick = async ms => { await p.clock.runFor(ms); await p.waitForTimeout(60); };
  await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="local"]');
  for (let i = 0; i < 40 && !(await p.$('text=Director checklist')); i++) await tick(500);
  await p.click('.tab:has-text("Divisions")'); await tick(200); await p.click('button:has-text("Draw all ready")'); await tick(100); await p.click('#confirm button:has-text("Draw")'); await tick(1500);
  await p.click('.tab:has-text("Brackets")'); await tick(300);
  const o = await p.$$eval('#br-div option', x => x.map(y => [y.value, y.textContent]));
  const openMatch = async () => { await p.selectOption('#br-div', o.find(x => /Senior Men Individual Kumite/.test(x[1]))[0]); await tick(300); await p.click('.bm.ready.click >> nth=0'); await tick(300); if (await p.$('#match-root button[data-act="score"]')) { await p.click('#match-root button[data-act="score"]'); await tick(300); } };
  await openMatch();
  ok('big Start button is the highlighted next action', await p.$eval('#clock-btn', b => b.classList.contains('clock-go') && b.classList.contains('next') && b.offsetHeight >= 60));
  ok('hint tells to press Start at Hajime', /Hajime/.test(await p.textContent('.next-hint')));
  // tie 4–4 then time runs out
  await p.click('.corner.a button[data-t="waza"]'); await tick(150); await p.click('.corner.b button[data-t="waza"]'); await tick(150);
  await p.click('#clock-btn'); await tick(200);
  ok('running: button turns into a red Stop', await p.$eval('#clock-btn', b => b.textContent === 'Stop' && b.classList.contains('stop')));
  await tick(91000); await tick(500);
  ok('time up on a tie → Kettei-sen automatically', /Kettei-sen/.test(await p.textContent('#score-root .phase')));
  ok('clock reset to 1:30', (await p.textContent('#clock')).trim() === '1:30');
  ok('clock stopped, waiting for Start (highlighted)', await p.$eval('#clock-btn', b => b.textContent === 'Start' && b.classList.contains('next')));
  ok('scores kept on the board (4–4)', (await p.textContent('.corner.a .big')).trim() === '4' && (await p.textContent('.corner.b .big')).trim() === '4');
  await p.screenshot({ path: 'test/shots/timeup-kettei.png' });
  // Kettei-sen runs out with no score → Hantei
  await p.click('#clock-btn'); await tick(200); await tick(91000); await tick(500);
  ok('Kettei-sen time out with no score → Hantei', /Hantei/.test(await p.textContent('#score-root .phase')));
  ok('Hantei buttons highlighted, Start gone', !!(await p.$('.board.await-hantei .corner button[data-t="hantei"]')) && !(await p.$('#clock-btn')));
  await p.screenshot({ path: 'test/shots/timeup-hantei.png' });
  await p.click('.corner.a button[data-t="hantei"]'); await tick(200);
  ok('Hantei decides the winner', /Winner · Aka/.test(await p.textContent('.win-banner')));
  await p.click('#save-result'); await tick(400);
  if (!(await p.$eval('#modal', m => m.hidden))) await p.keyboard.press('Escape'); await tick(200);
  // next match: lead at time up → winner on points
  await openMatch();
  await p.click('.corner.a button[data-t="waza"]'); await tick(150);
  await p.click('#clock-btn'); await tick(200); await tick(91000); await tick(500);
  ok('lead at time up → winner on points', /Winner · Aka/.test(await p.textContent('.win-banner').catch(() => '')) && /Points/.test(await p.textContent('#score-root .phase')));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
