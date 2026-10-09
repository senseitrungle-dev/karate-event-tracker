// v1.5.0: pools on rings, judges pool & panels, officials (required at National), match view with live log, follow
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route(/fonts\./, r => r.abort());
  await page.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  const click = async sel => { await page.click(sel); await page.waitForTimeout(80); };
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  await click('button:has-text("Create demo tournament")'); await click('button[data-kind="local"]');
  await page.waitForSelector('text=Director checklist', { timeout: 20000 });
  // National level
  await click('button:has-text("Event settings") >> nth=0'); await page.selectOption('#ev-level', 'National'); await click('#modal button[type="submit"]'); await page.waitForTimeout(200);
  await click('.tab:has-text("Divisions")'); await click('button:has-text("Draw all ready")'); await click('#confirm button:has-text("Draw")'); await page.waitForTimeout(900);
  // Rings: tap division → panel; move Pool B to Ring 2
  await click('.tab:has-text("Rings")');
  await click('.rdiv:has-text("Senior Men Individual Kata")');
  ok('division panel opens on tap', !!(await page.$('#divp-root .seg-row')));
  const did = await page.$eval('#divp-root select[data-change="seg-ring"]', s => s.dataset.did);
  const ring2 = await page.$eval('#divp-root select[data-change="seg-ring"] >> nth=0', s => [...s.options].find(o => o.textContent === 'Ring 2').value);
  await page.selectOption(`#sgr-${did}-PB`, ring2); await page.waitForTimeout(250);
  ok('pool B shows Ring 2', (await page.$eval(`#sgr-${did}-PB`, s => s.value)) === ring2);
  ok('pool B row shows Ring 2 judges', /Judges:/.test(await page.$eval(`#sgr-${did}-PB`, el => el.closest('.seg-row').textContent)));
  await click('button[data-act="modal-close"] >> nth=0');
  await page.waitForTimeout(150);
  const guestTxt = await page.$$eval('.rdiv.guest', x => x.map(y => y.textContent).join('|'));
  ok('Ring 2 lists Pool B as a guest item', /Senior Men Individual Kata · Pool B/.test(guestTxt));
  await page.screenshot({ path: 'test/shots/v15-rings.png', fullPage: true });
  // bracket view shows the ring of each pool
  await click('.tab:has-text("Brackets")');
  { const o = await page.$$eval('#br-div option', o => o.map(x => [x.value, x.textContent])); await page.selectOption('#br-div', o.find(x => /Senior Men Individual Kata/.test(x[1]))[0]); await page.waitForTimeout(200); }
  const rc = await page.$$eval('select[data-change="seg-ring"][data-seg^="P:"]', x => x.map(y => y.selectedOptions[0].textContent));
  ok('bracket shows pool rings (Ring 1 and Ring 2)', rc.some(t => /Ring 2/.test(t)) && rc.some(t => /Ring 1/.test(t)));
  // director moves Pool C to Ring 2 straight from the bracket view
  const selC = await page.$('select[data-change="seg-ring"][data-seg="P:C"]');
  ok('director has a ring selector on each pool in bracket view', !!selC && (await page.$$('select[data-change="seg-ring"][data-seg^="P:"]')).length >= 3);
  await page.selectOption('select[data-change="seg-ring"][data-seg="P:C"]', ring2); await page.waitForTimeout(300);
  ok('Pool C now on Ring 2', (await page.$eval('select[data-change="seg-ring"][data-seg="P:C"]', s => s.value)) === ring2);
  ok('semifinal/final ring selectors shown', !!(await page.$('select[data-change="seg-ring"][data-seg="SF"]')) && !!(await page.$('select[data-change="seg-ring"][data-seg="F"]')));
  await page.screenshot({ path: 'test/shots/v15-bracket-rings.png', fullPage: false });
  await page.selectOption('select[data-change="seg-ring"][data-seg="P:C"]', { index: 0 }); await page.waitForTimeout(300);
  // Judges tab: judges by ring, unassigned list, move between rings
  await click('.tab:has-text("Judges")');
  const unBefore = await page.$$eval('.card:has(h3:text("Unassigned")) .jrow2', x => x.length);
  ok('demo has unassigned judges', unBefore > 0);
  const firstUn = await page.$eval('.card:has(h3:text("Unassigned")) .jrow2 select', s => s.dataset.id);
  await page.selectOption(`#jring-${firstUn}`, { label: 'To Ring 2' }); await page.waitForTimeout(250);
  ok('assigned judge leaves the Unassigned list', (await page.$$eval('.card:has(h3:text("Unassigned")) .jrow2', x => x.length)) === unBefore - 1);
  const r1 = await page.$eval('.card:has(h3:text("Ring 1")) .jrow2 select', s => s.dataset.id);
  await page.selectOption(`#jring-${r1}`, { label: 'To Ring 2' }); await page.waitForTimeout(250);
  ok('judge moved Ring 1 → Ring 2', await page.$eval('.card:has(h3:text("Ring 2"))', (c, id) => !!c.querySelector(`select[data-id="${id}"]`), r1));
  await page.screenshot({ path: 'test/shots/v15-judges.png', fullPage: true });
  // manager of Ring 2 sees Pool B performances only
  await page.selectOption('#sim-role', 'manager'); await page.waitForTimeout(150);
  await page.selectOption('#sim-ring', { label: 'Ring 2' }); await page.waitForTimeout(150);
  await click('.tab:has-text("Mat")');
  const r2 = await page.$$eval('.ring-card', cards => cards.filter(c => c.querySelector('h3').textContent === 'Ring 2').map(c => c.textContent).join(''));
  ok('Ring 2 queue counts the guest pool', /2[0-9] waiting|1[3-9] waiting/.test(r2));
  await click('.tab:has-text("Brackets")');
  const opts = await page.$$eval('#br-div option', o => o.map(x => [x.value, x.textContent]));
  await page.selectOption('#br-div', opts.find(o => /Senior Men Individual Kata/.test(o[1]))[0]); await page.waitForTimeout(200);
  const clickable = await page.$$eval('.card', cs => cs.filter(c => /^Pool/.test((c.querySelector('h3') || {}).textContent || '')).map(c => c.querySelector('h3').textContent + ':' + c.querySelectorAll('tr.click').length));
  console.log('  KP pools clickable for Ring 2 manager:', clickable.join(' '));
  ok('only Pool B rows are scoreable', clickable.every(x => /Pool B/.test(x) ? !/:0$/.test(x) : /:0$/.test(x)));
  const kpBtn = await page.$('tr.click[data-act="kp-score"]');
  await kpBtn.click(); await page.waitForTimeout(200);
  await page.fill('#kp-kata', 'Bassai Dai');
  for (const id of await page.$$eval('input[data-input="kp-j"]', x => x.map(y => y.id))) await page.fill('#' + id, '8.2');
  ok('save blocked until officials assigned (National)', await page.$eval('#kp-save', x => x.disabled));
  ok('officials error shown', /officials/.test(await page.textContent('#kp-err')));
  const kpPos = await page.$$eval('select[data-change="official"]', x => x.map(y => y.id));
  const firstPick = await page.$eval('#' + kpPos[0], s => [...s.options].find(o => o.value).value);
  ok('Pool B officials offer Ring 2 judges first', /Ring 2 judges/.test(await page.$eval('#' + kpPos[0], s => s.querySelector('optgroup') ? s.querySelector('optgroup').label : '')));
  for (const id of kpPos) { const v = await page.$eval('#' + id, s => [...s.options].find(o => o.value && !o.selected).value); await page.selectOption('#' + id, v); await page.waitForTimeout(60); }
  const offered = await page.$eval('#' + kpPos[1], (s, v) => [...s.options].some(o => o.value === v), await page.$eval('#' + kpPos[0], s => s.value));
  ok('a seated judge is not offered for another position', !offered);
  const vals = await page.$$eval('select[data-change="official"]', x => x.map(y => y.value));
  ok('six different officials seated', new Set(vals).size === 6 && vals.every(Boolean));
  ok('save enabled after officials', !(await page.$eval('#kp-save', x => x.disabled)));
  ok('judge names under score columns', (await page.$$eval('.kprow .jn', x => x.filter(y => y.textContent.trim()).length)) >= 6);
  await page.screenshot({ path: 'test/shots/v15-kp-officials.png', fullPage: true });
  await click('#kp-save'); await page.waitForTimeout(250);
  // director: kumite officials incl. Kan-sa
  await page.selectOption('#sim-role', 'director'); await page.waitForTimeout(150);
  await click('.tab:has-text("Mat")');
  await page.selectOption('#mat-ring', { index: 0 }).catch(() => {});
  await page.waitForTimeout(100);
  let opened = false;
  for (const bt of await page.$$('button[data-act="score"]')) {
    await bt.click(); await page.waitForTimeout(150);
    if (await page.$('#score-root .corner button[data-t="waza"]')) { opened = true; break; }
    await click('button[data-act="modal-close"] >> nth=0');
  }
  ok('opened a kumite scoresheet', opened);
  const pos = await page.$$eval('#score-root select[data-change="official"]', x => x.map(y => y.dataset.pos));
  ok('kumite positions Shu-shin, 4 Fuku-shin, Kan-sa', pos.join(',') === 'shushin,f1,f2,f3,f4,kansa');
  await click('button[data-act="clock"]'); await page.waitForTimeout(250);
  ok('scoring buttons disabled while clock runs', await page.$eval('.corner.a button[data-t="waza"]', b => b.disabled) && await page.$eval('.corner.b button[data-t="tento"]', b => b.disabled));
  await click('button[data-act="clock"]'); await page.waitForTimeout(150);
  ok('scoring buttons enabled when clock stopped', !(await page.$eval('.corner.a button[data-t="waza"]', b => b.disabled)));
  await click('.corner.b button[data-t="tento"]');
  ok('Ten-to with time left = penalty match, no points', (await page.$eval('.corner.a .big', x => x.textContent.trim())) === '0' && /penalty match/.test(await page.textContent('#score-root .log')));
  await click('button[data-act="k-undo"]');
  await click('.corner.a button[data-t="ippon"]');
  ok('confirm disabled without officials', await page.$eval('button[data-act="save-result"]', x => x.disabled));
  const mid = await page.evaluate(() => null);
  await page.screenshot({ path: 'test/shots/v15-kumite-officials.png', fullPage: true });
  // close (draft kept, live state pushed) → open match view from the ring board
  await page.waitForTimeout(500);
  await click('button[data-act="modal-close"] >> nth=0');
  await page.waitForTimeout(200);
  const now = await page.$('.now[data-act="match"]');
  ok('on-mat match is tappable', !!now);
  if (now) { await now.click(); await page.waitForTimeout(200); }
  ok('match view shows live log', (await page.$$('#match-root .live-log li')).length > 0);
  ok('director can move match to another ring', !!(await page.$('#match-root select[data-change="match-ring"]')));
  await page.screenshot({ path: 'test/shots/v15-match-live.png', fullPage: true });
  await click('#match-root button[data-act="score"]');
  for (const s of await page.$$('#score-root select[data-change="official"]')) {
    const id = await s.getAttribute('id');
    const used = await page.$$eval('#score-root select[data-change="official"]', x => x.map(y => y.value));
    const v = await page.$eval('#' + id, (s, used) => [...s.options].find(o => o.value && !used.includes(o.value)).value, used);
    await page.selectOption('#' + id, v); await page.waitForTimeout(60);
  }
  ok('confirm enabled with officials', !(await page.$eval('button[data-act="save-result"]', x => x.disabled)));
  await click('button[data-act="save-result"]'); await page.waitForTimeout(250);
  // spectator: follow
  await page.selectOption('#sim-role', 'viewer'); await page.waitForTimeout(150);
  await click('.tab:has-text("Follow")');
  await page.fill('#follow-q', 'Iron'); await page.waitForTimeout(150);
  await click('.frow button.star >> nth=0');
  await page.fill('#follow-q', ''); await page.waitForTimeout(150);
  ok('followed dojo card shows members with status', (await page.$$('.fstat')).length > 0);
  await page.screenshot({ path: 'test/shots/v15-follow.png', fullPage: true });
  await click('.fstat >> nth=0');
  ok('tapping status opens match or bracket', !!(await page.$('#match-root')) || /Brackets/.test(await page.textContent('.tab[aria-selected="true"]')));
  if (await page.$('#match-root')) await click('button[data-act="modal-close"] >> nth=0');
  await click('.tab:has-text("Brackets")');
  { const o = await page.$$eval('#br-div option', o => o.map(x => [x.value, x.textContent])); await page.selectOption('#br-div', o.find(x => /Senior Men Individual Kumite/.test(x[1]))[0]); await page.waitForTimeout(200); }
  const bm = await page.$('.bm.click');
  if (bm) { await bm.click(); await page.waitForTimeout(150); }
  ok('spectator can open a match view', !!(await page.$('#match-root')));
  ok('spectator cannot score', !(await page.$('#match-root button[data-act="score"]')));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close();
  process.exit(errors.length ? 1 : 0);
})();
