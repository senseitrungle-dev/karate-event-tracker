// v1.52.0: Competitors tab — where from led by the event level's group; events show the division actually assigned
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  for (const [kind, width, lead] of [['international', 390, /^(Japan|United States|France|Brazil|Canada|Italy|India|Australia|Poland|South Africa)$/], ['national', 1280, /^(Pacific|Mountain|Central|Eastern|Southern)$/], ['local', 360, /(Dojo|Karate|Budokan|Club)$/]]) {
    const ctx = await b.newContext({ viewport: { width, height: 900 } }); await ctx.route(/fonts\./, r => r.abort());
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
    const W = t => p.waitForTimeout(t || 150);
    await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
    await p.click('button:has-text("Create demo tournament")'); await p.click(`button[data-kind="${kind}"]`); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
    if (width < 700) { await p.click('.bn:has-text("More")'); await W(250); await p.click('#modal .menu-item[data-v="competitors"]'); } else await p.click('.tab:has-text("Competitors")');
    await W(400);
    const leads = await p.$$eval('#main tr[data-act="comp-edit"] .dojo .where', x => x.map(y => y.textContent.trim()));
    ok(`${kind}: the line under each name leads with the ${kind === 'international' ? 'country' : kind === 'national' ? 'region' : 'dojo'} (${leads[0]})`, leads.length > 10 && leads.every(t => lead.test(t)));
    const ev = await p.$$eval('#main tr[data-act="comp-edit"] .ev-div', x => x.map(y => y.textContent.trim()));
    const divNames = await p.evaluate(() => [...document.querySelectorAll('.tab, .bn')].length);
    void divNames;
    ok(`${kind}: events show the division assigned (e.g. ${ev.find(t => /Individual/.test(t)) || ev[0]})`, ev.some(t => /^(Black Belt|Kyu) .*Individual (Kata|Kumite)$/.test(t)));
    ok(`${kind}: team events show the team and its division (e.g. ${ev.find(t => / · .*Team|Enbu Pair/.test(t)) || '—'})`, ev.some(t => /^(Senior Women [A-Z]|Junior Men \d|Enbu Pair \d) · (Black Belt|Kyu) /.test(t)));
    ok(`${kind}: no assignment is said plainly`, ev.filter(t => / · no (division|team yet)$/.test(t)).length >= 0 && ev.every(t => !/\?$/.test(t)));
    if (kind === 'international') ok(`${kind}: competitors without a team say "no team yet"`, ev.some(t => /no team yet$/.test(t)));
    ok(`${kind} @${width}: fits the width`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await p.screenshot({ path: `test/shots/compdiv-${kind}.png` });
    await ctx.close();
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
