// v1.15.0: winners stand out (score sheet, match view, brackets); Ko-go attacker shown in corner colours
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
  await p.click('.tab:has-text("Brackets")'); await p.waitForTimeout(300);
  const o = await p.$$eval('#br-div option', x => x.map(y => [y.value, y.textContent]));
  const openFirst = async re => { await p.selectOption('#br-div', o.find(x => re.test(x[1]))[0]); await p.waitForTimeout(200); await p.click('.bm.click >> nth=0'); await p.waitForTimeout(200); if (await p.$('#match-root button[data-act="score"]')) await p.click('#match-root button[data-act="score"]'); await p.waitForTimeout(200); };
  // --- Ko-go: attacker colours
  await openFirst(/Junior.*Kumite|Kumite.*Junior/);
  ok('Ko-go: “Aka attacks” in red', await p.$eval('#attack-side', e => e.classList.contains('a') && /Aka attacks/i.test(e.textContent)));
  ok('Ko-go: Aka corner tagged Attacking', /Attacking/.test(await p.textContent('.corner.a.off')));
  for (let i = 0; i < 3; i++) { await p.click('button[data-t="next"]'); await p.waitForTimeout(120); }
  ok('Ko-go: exchange 4 → “Shiro attacks” in white', await p.$eval('#attack-side', e => e.classList.contains('b') && /Shiro attacks/i.test(e.textContent)));
  ok('Ko-go: Shiro corner tagged Attacking', /Attacking/.test(await p.textContent('.corner.b.off')));
  await p.click('.corner.b button[data-t="waza"]'); await p.waitForTimeout(150);
  ok('Ko-go: log line for Shiro marked white', !!(await p.$('.log .lg.b')));
  const bgA = await p.$eval('#attack-side', e => getComputedStyle(e).backgroundColor);
  ok('Ko-go: Shiro attack banner is white', /255, 255, 255/.test(bgA));
  await p.screenshot({ path: 'test/shots/winner-kogo.png' });
  await p.click('button[data-act="modal-close"] >> nth=0').catch(() => {}); await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  // --- Shobu Ippon: Aka scores Ippon → winner
  await openFirst(/Kumite/);
  if (!(await p.$('.corner.a button[data-t="ippon"]'))) { await p.keyboard.press('Escape'); await openFirst(/Senior.*Kumite|Kumite.*Senior/); }
  await p.click('.corner.a button[data-t="ippon"]'); await p.waitForTimeout(200);
  ok('sheet: winner banner in Aka red', await p.$eval('.win-banner', e => e.classList.contains('a') && /Winner · Aka/.test(e.textContent)));
  ok('sheet: winning corner outlined, other dimmed', !!(await p.$('.corner.a.won')) && !!(await p.$('.corner.b.lost')));
  ok('sheet: ★ Winner badge on the winner', /Winner/.test(await p.textContent('.corner.a.won .win-badge')));
  await p.screenshot({ path: 'test/shots/winner-sheet.png' });
  const save = await p.$('button[data-act="save-result"]:not([disabled])');
  if (save) { await save.click(); await p.waitForTimeout(300); }
  ok('result saved', !!save);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  ok('bracket: winner line highlighted with ✓', !!(await p.$('.bm .ln.win .wmark')) && !!(await p.$('.bm .ln.lose')));
  const op = await p.$eval('.bm .ln.lose', e => +getComputedStyle(e).opacity);
  ok('bracket: loser line dimmed', op < 0.7);
  await p.screenshot({ path: 'test/shots/winner-bracket.png' });
  await p.click('.bm.click:has(.ln.win)'); await p.waitForTimeout(300);
  ok('match view: winner banner + outlined corner', !!(await p.$('#match-root .win-banner')) && !!(await p.$('#match-root .corner.won')));
  ok('match view: final score shown (not a stale live board)', (await p.textContent('#match-root .corner.won .big')).trim() === '10' && !(await p.$('#match-root .live-card')));
  await p.screenshot({ path: 'test/shots/winner-match.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
