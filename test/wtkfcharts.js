// v1.33.0: WTKF charts (Competition Drawings Exhibits A, E, F; Flow Chart Explanation) at National / International events
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const p = await b.newPage({ viewport: { width: 1400, height: 900 } }); p.on('pageerror', e => errors.push(e.message));
  await p.route(/fonts\./, r => r.abort());
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament") >> nth=0'); await p.click('button[data-kind="international"]'); await p.waitForSelector('text=Director checklist', { timeout: 90000 });
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('kt-local-v1') || '{}'));
  const evId = Object.keys(await db()).find(k => /^events\/[^/]+$/.test(k)).split('/')[1];
  const divs = async () => Object.entries(await db()).filter(([k]) => k.startsWith(`events/${evId}/divisions/`)).map(([k, v]) => Object.assign({ id: k.split('/').pop() }, v));
  const brs = async () => Object.fromEntries(Object.entries(await db()).filter(([k]) => k.includes('/brackets/')).map(([k, v]) => [k.split('/').pop(), v]));
  // make the kumite divisions single elimination (the WTKF charts are elimination charts)
  await p.evaluate(async () => {});
  await p.click('.tab:has-text("Divisions")'); await p.waitForTimeout(200);
  const ds0 = await divs();
  const sm = ds0.find(d => d.name === 'Black Belt Senior Men Individual Kumite');
  await p.evaluate(id => { const b = document.querySelector(`[data-act="div-panel"][data-id="${id}"]`); b && b.click(); }, sm.id); await p.waitForTimeout(250);
  await p.click('button[data-act="div-edit"]'); await p.waitForTimeout(250);
  await p.selectOption('#d-fmt', 'SE');
  ok('division settings: Draw chart option (automatic WTKF at International)', (await p.$$eval('#d-chart option', o => o.map(x => x.textContent))).some(t => /WTKF charts at National \/ International/.test(t)));
  ok('seeds hint explains champions placement', /1st A-1, 2nd B-1, 3rd B-2, 4th A-2/.test(await p.textContent('#modal')));
  // seed last year's 1st–4th
  const seedIn = await p.$$('#modal input[data-input="seed"]');
  for (let i = 0; i < 4; i++) await seedIn[i].fill(String(i + 1));
  await p.click('#modal button[type="submit"]'); await p.waitForTimeout(400);
  await p.click('button:has-text("Draw all ready")'); await p.click('#confirm button:has-text("Draw")'); await p.waitForTimeout(3000);
  const B = await brs(), ds = await divs();
  const smd = ds.find(d => d.id === sm.id), sb = B[sm.id];
  const n = sb.entrants.length, q = sb.size / 4;
  console.log('   senior men kumite:', n, 'entrants, chart of', sb.size);
  ok('kumite drawn on the WTKF chart', sb.wtkf === true && sb.format === 'SE');
  const first = Object.values(sb.matches).filter(m => m.stage === 'W' && m.round === 1).sort((a, b) => a.idx - b.idx);
  const slot = []; first.forEach(m => { slot.push(m.a && m.a.e || null, m.b && m.b.e || null); });
  const poolSizes = [0, 1, 2, 3].map(x => slot.slice(x * q, x * q + q).filter(Boolean).length);
  const exp = (await p.evaluate(nn => KT ? null : null, n)) || null;
  const want = [0, 1, 2, 3].map(() => Math.floor(n / 4)); for (let i = 0; i < n % 4; i++) want[[1, 3, 2, 0][i]]++;
  ok(`pool sizes A-1, A-2, B-1, B-2 = ${want.join(', ')}`, poolSizes.join() === want.join());
  const seedOf = Object.fromEntries(Object.entries(smd.seeds || {}).map(([id, s]) => [s, id]));
  ok('champions: 1st A-1, 2nd B-1, 3rd B-2, 4th A-2 (top of their pool)', [1, 2, 3, 4].every(s => slot.indexOf(seedOf[s]) === [0, 2, 3, 1][s - 1] * q));
  // view: A bracket left, final centre, B right, pool labels
  await p.click('.tab:has-text("Brackets")'); await p.waitForTimeout(200); await p.selectOption('#br-div', sm.id); await p.waitForTimeout(400);
  const labels = await p.$$eval('.wpool-l', x => x.map(y => y.textContent));
  ok('chart view: A-1 / A-2 pools left, B-1 / B-2 right, Final in the middle', labels.slice(0, 2).join() === 'A-1 pool,A-2 pool' && labels.includes('B-1 pool') && /Final/.test(await p.$eval('.wfinal .label', x => x.textContent)));
  const colLabels = await p.$$eval('.wchart > .wcol > .label', x => x.map(y => y.textContent));
  ok('columns mirror: First round … Semi-final | Final | Semi-final … First round', colLabels[0] === 'First round' && colLabels[colLabels.length - 1] === 'First round' && colLabels[(colLabels.length - 1) / 2] === 'Final');
  await p.screenshot({ path: 'test/shots/wtkf-chart.png', fullPage: false });
  // kata: charts of up to 12
  const kataD = ds.filter(d => d.format === 'KP' && B[d.id] && B[d.id].kpPools);
  const kd = kataD.sort((a, b) => B[b.id].entrants.length - B[a.id].entrants.length)[0];
  const kb = B[kd.id], kn = kb.entrants.length, charts = Object.values(kb.kpPools);
  const cc = kn <= 12 ? 1 : (() => { let c = 2; while (kn > 12 * c) c += 2; return c; })();
  console.log('   kata:', kd.name, kn, 'entrants →', charts.map(c => c.length).join('/'));
  ok('kata in WTKF charts: ≤ 12 each, 1/2/4/6 charts', kb.wtkf && charts.length === cc && charts.every(c => c.length <= 12));
  await p.selectOption('#br-div', kd.id); await p.waitForTimeout(300);
  ok('kata view names them Chart 1, Chart 2 …', cc === 1 || /Chart 1/.test(await p.textContent('#main')));
  // standard draw on request
  await p.click('.tab:has-text("Divisions")'); await p.waitForTimeout(200);
  const other = ds.find(d => d.format === 'SE' && d.id !== sm.id && B[d.id] && B[d.id].entrants.length >= 5);
  if (other) {
    await p.evaluate(id => { const b = document.querySelector(`[data-act="div-panel"][data-id="${id}"]`); b && b.click(); }, other.id); await p.waitForTimeout(250);
    await p.click('button[data-act="div-edit"]'); await p.waitForTimeout(250); await p.selectOption('#d-chart', 'standard');
    await p.click('#modal button[data-act="draw"]'); await p.waitForTimeout(300); if (await p.$('#confirm')) await p.click('#confirm button:has-text("Redraw")').catch(() => {}); await p.waitForTimeout(800);
    ok('“Standard draw” turns the WTKF chart off for that division', (await brs())[other.id].wtkf !== true);
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
