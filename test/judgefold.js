// v1.49.0: judges sorted by country / region / dojo / name; competitors list groups fold and unfold
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  for (const width of [1280, 390]) {
    const ctx = await b.newContext({ viewport: { width, height: 900 } }); await ctx.route(/fonts\./, r => r.abort());
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
    const W = t => p.waitForTimeout(t || 150);
    const tab = async n => { if (width < 700) { const bn = await p.$(`.bn:has-text("${n}")`); if (bn) await bn.click(); else { await p.click('.bn >> nth=-1'); await W(250); await p.click(`#modal .menu-item:has-text("${n}")`); } } else await p.click(`.tab:has-text("${n}")`); await W(300); };
    await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
    await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="international"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
    // --- judges
    await tab('Judges');
    ok(`${width}: judges sort choice (default by name)`, (await p.$eval('#judge-sort', s => s.value)) === 'name');
    await p.selectOption('#judge-sort', 'country'); await W(250);
    const cards = await p.$$eval('#main .card:has(.jlist)', cs => cs.map(c => [...c.querySelectorAll('.jlist .ent-grp')].map(h => h.textContent.trim())));
    const okOrder = cards.every(h => h.every((x, i) => i === 0 || /^No /.test(x) || x.toLowerCase().localeCompare(h[i - 1].toLowerCase()) > 0));
    ok(`${width}: judges grouped by country in each card, in order (${(cards.find(h => h.length) || []).join(', ')})`, cards.some(h => h.length >= 2) && okOrder);
    const firstCard = await p.$$eval('#main .card:has(.jlist) >> nth=0', () => 0).catch(() => 0); void firstCard;
    // v1.50: country headings in the judge cards fold / unfold
    const jrows = () => p.$$eval('#main .jlist .jrow2', x => x.length);
    const jAll = await jrows(), gb = await p.$$eval('#main .jlist button[data-act="judge-grp"]', x => x.map(y => y.dataset.g));
    ok(`${width}: judge country headings are buttons (${gb.length})`, gb.length >= 3);
    await p.click(`#main button[data-act="judge-grp"][data-g="${gb[0]}"]`); await W(200);
    const j1 = await jrows();
    ok(`${width}: tapping a country folds its judges (${jAll} → ${j1})`, j1 < jAll && /▸/.test(await p.textContent(`#main button[data-act="judge-grp"][data-g="${gb[0]}"]`)));
    await p.click('button[data-act="judge-grp-all"][data-v="close"]'); await W(200);
    ok(`${width}: Collapse all hides every judge`, (await jrows()) === 0);
    await p.click(`#main button[data-act="judge-grp"][data-g="${gb[1]}"]`); await W(200);
    const j2 = await jrows();
    ok(`${width}: reopen one country`, j2 > 0 && j2 < jAll);
    await p.reload(); await W(900); if (await p.$('.ev-card')) { await p.click('.ev-card'); await W(400); }
    ok(`${width}: judge folds remembered after reload`, (await jrows()) === j2);
    await p.click('button[data-act="judge-grp-all"][data-v="open"]'); await W(200);
    ok(`${width}: Expand all shows every judge`, (await jrows()) === jAll);
    await p.selectOption('#judge-sort', 'name'); await W(250);
    const nm = await p.$$eval('#main .card:has(.jlist)', cs => cs.map(c => [...c.querySelectorAll('.jlist .jname .name')].map(n => n.textContent.trim().toLowerCase())));
    ok(`${width}: by name A→Z in each card, no headings`, (await p.$$('#main .jlist .ent-grp')).length === 0 && nm.every(l => l.every((x, i) => i === 0 || l[i - 1].localeCompare(x) <= 0)));
    await p.selectOption('#judge-sort', 'country'); await W(200);
    // --- competitors: fold / unfold country groups
    await tab('Competitors');
    await p.selectOption('#comp-s', 'country'); await W(300);
    const rowsN = () => p.$$eval('#main tr[data-act="comp-edit"]', x => x.length);
    const all = await rowsN(), heads = await p.$$eval('#main tr.grp-tog', x => x.map(y => y.dataset.g));
    ok(`${width}: country headings can be tapped (${heads.length})`, heads.length >= 5);
    await p.click(`#main tr.grp-tog[data-g="${heads[0]}"]`); await W(250);
    const one = await rowsN(), shut = await p.$eval(`#main tr.grp-tog[data-g="${heads[0]}"]`, r => r.getAttribute('aria-expanded') === 'false' && /▸/.test(r.textContent));
    ok(`${width}: tapping a country folds it (${all} → ${one} rows)`, shut && one < all && one > 0);
    await p.click('button[data-act="comp-grp-all"][data-v="close"]'); await W(250);
    ok(`${width}: Collapse all shows only the country headings`, (await rowsN()) === 0 && (await p.$$('#main tr.grp-tog')).length === heads.length);
    await p.click(`#main tr.grp-tog[data-g="${heads[2]}"]`); await W(250);
    const n2 = await rowsN();
    ok(`${width}: open one country`, n2 > 0 && n2 < all);
    await p.selectOption('#comp-s', 'region'); await W(250);
    ok(`${width}: another grouping keeps its own open / closed state`, (await p.$$('#main tr.grp-tog.shut')).length === 0);
    await p.selectOption('#comp-s', 'country'); await W(250);
    ok(`${width}: back to country: same folds`, (await rowsN()) === n2);
    // remembered on reload (this person's view)
    await p.reload(); await W(900); if (await p.$('.ev-card')) { await p.click('.ev-card'); await W(400); }
    ok(`${width}: folds and sort remembered after reload`, (await p.$eval('#comp-s', s => s.value)) === 'country' && (await rowsN()) === n2);
    await p.click('button[data-act="comp-grp-all"][data-v="open"]'); await W(250);
    ok(`${width}: Expand all`, (await rowsN()) === all);
    // keyboard: Enter on a heading folds it
    if (width === 1280) { await p.focus(`#main tr.grp-tog[data-g="${heads[1]}"]`); await p.keyboard.press('Enter'); await W(250); ok('keyboard Enter folds a country', (await rowsN()) < all); }
    ok(`${width}: no horizontal scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (width === 390) await p.screenshot({ path: 'test/shots/compfold.png' });
    await tab('Judges');
    ok(`${width}: judge sort remembered`, (await p.$eval('#judge-sort', s => s.value)) === 'country');
    await ctx.close();
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
