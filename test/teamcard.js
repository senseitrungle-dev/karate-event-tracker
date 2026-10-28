// v1.47.0: teams tab fits a phone; team member list sorts by country / region / club / name and shows the team a competitor is already on
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  for (const [kind, width] of [['international', 390], ['national', 360], ['local', 1280]]) {
    const ctx = await b.newContext({ viewport: { width, height: 844 }, hasTouch: width < 700 }); await ctx.route(/fonts\./, r => r.abort());
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
    const W = t => p.waitForTimeout(t || 150);
    await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
    await p.click('button:has-text("Create demo tournament")'); await p.click(`button[data-kind="${kind}"]`); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
    if (width < 700) { await p.click('.bn:has-text("More")'); await W(300); await p.click('#modal .menu-item[data-v="teams"]'); } else await p.click('.tab:has-text("Teams")');
    await W(400);
    const fit = await p.evaluate(() => ({ page: document.documentElement.scrollWidth <= innerWidth + 1, cards: [...document.querySelectorAll('#main .card')].every(c => c.scrollWidth <= c.clientWidth + 1),
      rows: [...document.querySelectorAll('.team-row')].every(r => r.getBoundingClientRect().right <= innerWidth + 1) }));
    ok(`${kind} @${width}: teams cards fit the width (${JSON.stringify(fit)})`, fit.page && fit.cards && fit.rows);
    ok(`${kind} @${width}: one stacked row per team with members`, (await p.$$('.team-row')).length >= 3 && (await p.$$('.team-row .team-mem')).length === (await p.$$('.team-row')).length);
    if (width < 700) await p.screenshot({ path: `test/shots/teamcard-${kind}.png`, fullPage: true });
    // team editor: default sort by the event's group; another team's name shown
    const ET = kind === 'local' ? 'ENBU' : 'TKATA';   // the local demo has a single team kata team; its Enbu has several pairs
    await p.click(`.card:has(button[data-et="${ET}"]) .team-row >> nth=0`); await W(400);
    const def = await p.$eval('#t-msort', s => s.value);
    ok(`${kind}: member list sorted by the event's group by default (${def})`, def === ({ international: 'country', national: 'region', local: 'club' })[kind]);
    const heads = await p.$$eval('#t-mems .ent-grp', x => x.map(y => y.textContent.trim()));
    ok(`${kind}: group headings in order (${heads.join(', ')})`, heads.length >= 2 && heads.every((h, i) => i === 0 || /^No /.test(h) || h.toLowerCase().localeCompare(heads[i - 1].toLowerCase()) >= 0));
    const on = await p.$$eval('#t-mems .tm-on', x => x.map(y => y.textContent.trim()));
    ok(`${kind}: competitors on another team show its name (${on[0] || ''})`, on.length >= 1 && on.every(t => /^On (Senior Women [A-Z]|Enbu Pair \d)/.test(t)));
    // change sort: ticks stay
    const ticked = await p.$$eval('#t-mems input:checked', x => x.map(y => y.value).sort().join());
    for (const m of ['name', 'club', 'region', 'country']) {
      await p.selectOption('#t-msort', m); await W(150);
      const t2 = await p.$$eval('#t-mems input:checked', x => x.map(y => y.value).sort().join());
      if (t2 !== ticked) ok(`${kind}: ticks kept after sorting by ${m}`, false);
    }
    ok(`${kind}: ticks kept after re-sorting`, true);
    await p.selectOption('#t-msort', 'name'); await W(150);
    const nm = await p.$$eval('#t-mems .tm-row b', x => x.map(y => y.textContent.toLowerCase()));
    ok(`${kind}: name A→Z, no headings`, (await p.$$('#t-mems .ent-grp')).length === 0 && nm.every((n, i) => i === 0 || nm[i - 1].localeCompare(n) <= 0));
    const mfit = await p.evaluate(() => { const m = document.querySelector('#modal .sheet-b'); return m.scrollWidth <= m.clientWidth + 1; });
    ok(`${kind} @${width}: team editor fits the width`, mfit);
    if (width < 700) await p.screenshot({ path: `test/shots/teamform-${kind}.png` });
    // the choice is remembered for this event on this device
    await p.click('#modal button[data-act="modal-close"] >> nth=0'); await W();
    await p.click(`.card:has(button[data-et="${ET}"]) .team-row >> nth=1`); await W(300);
    ok(`${kind}: sort choice remembered`, (await p.$eval('#t-msort', s => s.value)) === 'name');
    await ctx.close();
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
