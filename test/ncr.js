// v1.31.0: NCR kyu rules (North Central Region Tournament Rules for Kyu Ranks v3.3) → divisions, pools of 6, kata lists, Level 1–3 kumite sheets
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); p.on('pageerror', e => errors.push(e.message));
  await p.route(/fonts\./, r => r.abort());
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament") >> nth=0'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('kt-local-v1') || '{}'));
  const evId = Object.keys(await db()).find(k => /^events\/[^/]+$/.test(k)).split('/')[1];
  const divs = async () => Object.entries(await db()).filter(([k]) => k.startsWith(`events/${evId}/divisions/`)).map(([k, v]) => Object.assign({ id: k.split('/').pop() }, v));
  const before = await divs(), blackBefore = before.filter(d => d.belt === 'black').length;
  await p.click('.tab:has-text("Divisions")'); await p.click('button[data-act="div-ncr"]'); await p.waitForTimeout(200);
  const txt = await p.textContent('#modal');
  ok('NCR pop-up: 4 levels with ranks, allowed kata and kumite formats', /Level 1/.test(txt) && /White belt/.test(txt) && /Heian Shodan, Heian Nidan/.test(txt) && /Bassai Dai, Jion, Empi, Kanku Dai/.test(txt) && /WTKF Ko-go Kumite/.test(txt) && /Pools of up to 6/.test(txt));
  await p.screenshot({ path: 'test/shots/ncr-form.png' });
  await p.click('#modal button[type="submit"]'); await p.waitForTimeout(2500);
  const ds = await divs(), kyu = ds.filter(d => d.belt === 'kyu');
  ok('48 NCR kyu divisions; old kyu divisions replaced; black-belt divisions untouched', kyu.length === 48 && kyu.every(d => d.preset === 'ncr-kyu') && ds.filter(d => d.belt === 'black').length === blackBefore);
  const ringOrd = n => ds.find(d => d.name === n).ringOrder;
  ok('kata ahead of kumite in the running order', ringOrd('Kyu Level 1 Youth Women Individual Kata') < ringOrd('Kyu Level 1 Youth Women Individual Kumite'));
  // competitors: 7 white–8th kyu girls, 2 adult 5th-kyu men
  await p.click('.tab:has-text("Competitors")'); await p.click('button:has-text("Import CSV")');
  const girls = ['White belt', '9th kyu', '8th kyu', 'White', '9th kyu', '8th kyu', '9th kyu'].map((r, i) => `G${i},Girl,F,2014-0${i + 1}-01,${r},Dojo${i % 3},Individual Kata;Individual Kumite`);
  await p.fill('#imp-text', 'first_name,last_name,gender,dob,rank,dojo,events\n' + girls.join('\n') + '\nM1,Man,M,1990-01-01,5th kyu,DojoA,Individual Kumite\nM2,Man,M,1991-01-01,4th kyu,DojoB,Individual Kumite');
  await p.click('button[data-act="imp-preview"]'); await p.waitForTimeout(200);
  ok('“White belt” rank is understood', /9 competitors ready/.test(await p.textContent('#imp-preview')));
  await p.click('button[data-act="imp-run"]'); await p.waitForTimeout(1500);
  await p.click('.tab:has-text("Divisions")'); await p.waitForTimeout(200);
  const row = n => `tr:has(span.name:text-is("${n}"))`;
  const L1K = 'Kyu Level 1 Youth Women Individual Kata', L1U = 'Kyu Level 1 Youth Women Individual Kumite', L3U = 'Kyu Level 3 Adult Men Individual Kumite';
  for (const n of [L1K, L1U, L3U]) { await p.click(`${row(n)} button[data-act="draw"]`); await p.waitForTimeout(600); await p.click('.tab:has-text("Divisions")').catch(() => {}); await p.waitForTimeout(200); }
  const brs = Object.entries(await db()).filter(([k]) => k.includes('/brackets/'));
  const brOf = n => (brs.find(([k]) => k.endsWith(ds.find(d => d.name === n).id)) || [])[1];
  const bk = brOf(L1K);
  ok('7 entrants → round robin pools of 4 and 3 (up to 6 per pool)', bk && bk.format === 'RR' && Object.values(bk.pools).map(x => x.length).sort().join() === '3,4');
  // score a Level 1 kata match: allowed kata shown, flags decide
  const openMatch = async n => { await p.click('.tab:has-text("Brackets")'); await p.waitForTimeout(200); await p.selectOption('#br-div', ds.find(d => d.name === n).id); await p.waitForTimeout(300); await p.click('.bm.click >> nth=0'); await p.waitForTimeout(250); if (await p.$('#match-root button[data-act="score"]')) await p.click('#match-root button[data-act="score"]'); await p.waitForTimeout(250); };
  await openMatch(L1K);
  ok('kata sheet lists the allowed kata for Level 1', /Allowed kata:\s*Heian Shodan · Heian Nidan/.test(await p.textContent('#score-root')));
  const kSel = await p.$$('#score-root select[data-change="kata-pick"]');
  ok('kata picker offers only the level’s kata', kSel.length === 2 && (await kSel[0].$$eval('option', o => o.map(x => x.value).filter(Boolean))).join() === 'Heian Shodan,Heian Nidan');
  await kSel[0].selectOption('Heian Shodan'); await p.waitForTimeout(100); await (await p.$$('#score-root select[data-change="kata-pick"]'))[1].selectOption('Heian Nidan');
  ok('3 judges’ flags (NCR minimum)', (await p.$$('#score-root .jrow')).length === 3);
  await p.screenshot({ path: 'test/shots/ncr-kata.png' });
  await p.click('button[data-act="modal-close"]').catch(() => {}); await p.waitForTimeout(200);
  // Level 1 kumite
  await openMatch(L1U);
  const ph = () => p.textContent('#score-root .phase');
  ok('Level 1 kumite: exchange 1 of 4, Aka jodan tsuki called', /exchange 1 of 4/.test(await ph()) && /Aka jodan tsuki — hajime/.test(await p.textContent('#attack-side')));
  ok('kumite officials: Shu-shin + 2 Fuku-shin (no Kan-sa)', /0\/3/.test(await p.textContent('#score-root details.officials summary')) && !/Kan-sa/.test(await p.textContent('#score-root details.officials')));
  ok('no scoring buttons at Level 1 (only Han-soku)', !(await p.$('#score-root button[data-t="waza"]')) && !!(await p.$('#score-root .corner.a button[data-t="hansoku"]')));
  for (let i = 0; i < 2; i++) { await p.click('#score-root button[data-t="next"]'); await p.waitForTimeout(100); }
  ok('exchange 3: Shiro attacks', /Shiro jodan tsuki/.test(await p.textContent('#attack-side')) && !!(await p.$('.corner.b.off')));
  for (let i = 0; i < 2; i++) { await p.click('#score-root button[data-t="next"]'); await p.waitForTimeout(100); }
  ok('after 4 exchanges → Hantei by flags', /Hantei/.test(await ph()) && !!(await p.$('#score-root button[data-t="hantei"]')));
  await p.screenshot({ path: 'test/shots/ncr-l1-hantei.png' });
  await p.click('#score-root .corner.b button[data-t="hantei"]'); await p.waitForTimeout(200);
  ok('Hantei Shiro → result ready to confirm', !(await p.$eval('#save-result', x => x.disabled)) && /Shiro/.test(await ph()));
  await p.click('#save-result'); await p.waitForTimeout(500);
  await p.click('button[data-act="modal-close"]').catch(() => {}); await p.waitForTimeout(200);
  // Level 3 kumite
  await openMatch(L3U);
  ok('Level 3: 6 exchanges, punch exchange first', /exchange 1 of 6/.test(await ph()) && /Aka tsuki waza — hajime/.test(await p.textContent('#attack-side')));
  await p.click('#score-root .corner.a button[data-t="waza"]'); await p.waitForTimeout(100);
  ok('Waza-ari does not end the exchange (2 chances to score)', /exchange 1 of 6/.test(await ph()));
  for (let i = 0; i < 3; i++) { await p.click('#score-root button[data-t="next"]'); await p.waitForTimeout(80); }
  ok('Saki disabled for the attacker', await p.$eval('#score-root .corner.b button[data-t="saki"]', x => x.disabled));
  await p.click('#score-root .corner.a button[data-t="saki"]'); await p.waitForTimeout(100);   // Aka (defending) starts early
  for (let i = 0; i < 3; i++) { await p.click('#score-root button[data-t="next"]'); await p.waitForTimeout(80); }
  ok('Level 3: points decide (Aka 4 vs Shiro 2)', /Aka · Points/.test(await ph()));
  await p.screenshot({ path: 'test/shots/ncr-l3.png' });
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
