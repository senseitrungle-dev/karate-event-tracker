// v1.44.0: division settings — list entrants by last, first name A→Z / Z→A, or by club / region / country
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  for (const width of [1280, 390]) {
    const ctx = await b.newContext({ viewport: { width, height: 900 } }); await ctx.route(/fonts\./, r => r.abort());
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
    const W = t => p.waitForTimeout(t || 150);
    await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
    await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="national"]'); await p.waitForSelector('text=Director checklist', { timeout: 30000 });
    await p.click(width < 700 ? '.bn:has-text("Divisions")' : '.tab:has-text("Divisions")'); await W(300);
    await p.click('button[data-act="div-panel"]:has-text("Senior Men Individual Kata")'); await W(300);
    ok(`${width}: division panel has the sort choice`, !!(await p.$('#dp-entsort')));
    await p.click('#modal button[data-act="div-edit"]'); await W(300);
    const names = () => p.$$eval('#d-ents .ent-row b', x => x.map(y => y.textContent.trim()));
    const key = n => n.toLowerCase();
    let n = await names();
    ok(`${width}: settings list entrants A→Z by last, first name (default)`, n.length > 5 && n.every((x, i) => i === 0 || key(n[i - 1]).localeCompare(key(x)) <= 0));
    // type a seed, then re-order: the typed seed must stay with its entrant
    const firstId = await p.$eval('#d-ents .ent-row', r => r.dataset.id);
    await p.fill(`#seed-${firstId}`, '3');
    await p.selectOption('#d-entsort', 'name-desc'); await W(200);
    n = await names();
    ok(`${width}: Z→A`, n.every((x, i) => i === 0 || key(n[i - 1]).localeCompare(key(x)) >= 0));
    ok(`${width}: typed seed kept after re-ordering`, (await p.$eval(`#seed-${firstId}`, i => i.value)) === '3' && (await p.$eval('#d-ents .ent-row:last-child', r => r.dataset.id)) === firstId);
    for (const [mode, re] of [['club', /Dojo|Karate|Budokan|Club/], ['region', /Pacific|Mountain|Central|Eastern|Southern/]]) {
      await p.selectOption('#d-entsort', mode); await W(200);
      const heads = await p.$$eval('#d-ents .ent-grp', x => x.map(y => y.textContent.trim()));
      const sorted = heads.every((x, i) => i === 0 || x.toLowerCase().localeCompare(heads[i - 1].toLowerCase()) >= 0 || /^No /.test(x));
      ok(`${width}: by ${mode} — group headings in order (${heads.join(', ')})`, heads.length >= 2 && heads.every(h => re.test(h) || /^No /.test(h)) && sorted && new Set(heads).size === heads.length);
    }
    await p.selectOption('#d-entsort', 'country'); await W(200);
    ok(`${width}: by country (national demo: one country)`, (await p.$$eval('#d-ents .ent-grp', x => x.length)) === 1);
    ok(`${width}: no horizontal scroll`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p.selectOption('#d-entsort', 'region'); await W(200);
    if (width === 1280) await p.screenshot({ path: 'test/shots/entsort-settings.png' });
    // the choice is remembered, and the division panel follows it
    await p.click('#modal button[data-act="modal-close"] >> nth=0'); await W(200);
    await p.click('button[data-act="div-panel"]:has-text("Senior Men Individual Kata")'); await W(300);
    ok(`${width}: panel uses the same order (region headings)`, (await p.$eval('#dp-entsort', s => s.value)) === 'region' && (await p.$$('#divp-root .ent-grp')).length >= 2);
    await p.selectOption('#dp-entsort', 'name'); await W(200);
    ok(`${width}: changing it in the panel re-renders the chips A→Z`, (await p.$$('#divp-root .ent-grp')).length === 0);
    await ctx.close();
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
