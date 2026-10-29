// v1.48.0: competitors list sort (name A→Z / Z→A, country / region / club); division settings grey out settings the format does not use
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  for (const width of [1280, 390]) {
    const ctx = await b.newContext({ viewport: { width, height: 900 } }); await ctx.route(/fonts\./, r => r.abort());
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
    const W = t => p.waitForTimeout(t || 150);
    const tab = async n => { if (width < 700) { const bn = await p.$(`.bn:has-text("${n}")`); if (bn) await bn.click(); else { await p.click('.bn:has-text("More")'); await W(250); await p.click(`#modal .menu-item:has-text("${n}")`); } } else await p.click(`.tab:has-text("${n}")`); await W(300); };
    await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
    await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="national"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
    await tab('Competitors');
    const names = () => p.$$eval('#main table.mcards tr[data-act="comp-edit"] .name', x => x.map(y => y.textContent.trim().toLowerCase()));
    let n = await names();
    ok(`${width}: competitors A→Z by default`, n.length > 20 && n.every((x, i) => i === 0 || n[i - 1].localeCompare(x) <= 0));
    await p.selectOption('#comp-s', 'name-desc'); await W(250); n = await names();
    ok(`${width}: Z→A`, n.every((x, i) => i === 0 || n[i - 1].localeCompare(x) >= 0));
    for (const [m, re] of [['region', /^(Central|Eastern|Mountain|Pacific|Southern) · \d+$/], ['club', /(Dojo|Karate|Budokan|Club) · \d+$/], ['country', /^Example · \d+$/]]) {
      await p.selectOption('#comp-s', m); await W(250);
      const h = await p.$$eval('#main tr.grp-row', x => x.map(y => y.textContent.trim()));
      const total = h.reduce((s, t) => s + +t.split(' · ').pop(), 0);
      ok(`${width}: by ${m} — headings in order with counts (${h.slice(0, 3).join(' | ')}…)`, h.length >= 1 && h.every(t => re.test(t)) && total === (await names()).length && h.every((t, i) => i === 0 || t.toLowerCase().localeCompare(h[i - 1].toLowerCase()) >= 0));
    }
    await p.selectOption('#comp-s', 'region'); await W(200);
    await p.selectOption('#comp-f', 'in'); await W(250);
    ok(`${width}: sort and filter together`, (await p.$$('#main tr.grp-row')).length >= 2);
    ok(`${width}: no horizontal scroll on Competitors`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    // --- division settings: settings of other formats are greyed out
    await tab('Divisions');
    await p.click('button[data-act="div-panel"]:has-text("Senior Men Individual Kumite")'); await W(250);
    await p.click('#modal button[data-act="div-edit"]'); await W(300);
    const state = () => p.$$eval('#f-div [data-fmts]', x => Object.fromEntries(x.map(l => [l.querySelector('select, input').id, l.classList.contains('na') && l.querySelector('select, input').disabled])));
    const want = { SE: ['d-pools', 'd-rrsize', 'd-adv'], RR: ['d-chart', 'd-pools'], DE: ['d-chart', 'd-rrsize', 'd-adv'] };
    for (const f of ['SE', 'RR', 'DE']) {
      await p.selectOption('#d-fmt', f); await W(150);
      const st = await state(), off = Object.keys(st).filter(k => st[k]).sort();
      ok(`${width}: ${f} greys out ${off.join(', ')}`, JSON.stringify(off) === JSON.stringify(want[f].slice().sort()));
    }
    ok(`${width}: greyed settings say why`, /Not used by Double elimination/.test(await p.textContent('#f-div')));
    // values of greyed settings are kept and saved
    await p.selectOption('#d-fmt', 'RR'); await W(100); await p.selectOption('#d-rrsize', '6'); await p.selectOption('#d-fmt', 'SE'); await W(100);
    await p.click('#modal button.primary:has-text("Save")'); await W(400);
    await p.click('button[data-act="div-panel"]:has-text("Senior Men Individual Kumite")'); await W(250);
    await p.click('#modal button[data-act="div-edit"]'); await W(300);
    ok(`${width}: SE saved; the greyed round-robin pool size is kept (6)`, (await p.$eval('#d-fmt', s => s.value)) === 'SE' && (await p.$eval('#d-rrsize', s => s.value)) === '6' && await p.$eval('#d-rrsize', s => s.disabled));
    await p.click('#modal button[data-act="modal-close"] >> nth=0'); await W();
    // kata: kata pools greys out the head-to-head settings
    await p.click('button[data-act="div-panel"]:has-text("Senior Men Individual Kata")'); await W(250);
    await p.click('#modal button[data-act="div-edit"]'); await W(300);
    const st = await state(), off = Object.keys(st).filter(k => st[k]).sort();
    ok(`${width}: kata score pools greys out ${off.join(', ')}`, JSON.stringify(off) === JSON.stringify(['d-adv', 'd-bronze', 'd-method', 'd-pools', 'd-rrsize']) && !st['d-pool'] && !st['d-chart']);
    if (width === 390) await p.screenshot({ path: 'test/shots/fmt-greyed.png', fullPage: false });
    ok(`${width}: division settings fit`, await p.evaluate(() => { const m = document.querySelector('#modal .sheet-b'); return m.scrollWidth <= m.clientWidth + 1; }));
    await ctx.close();
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
