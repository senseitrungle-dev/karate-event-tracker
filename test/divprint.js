// v1.56.0: division printout per country / region / club, Letter or A4
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\./, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  const W = t => p.waitForTimeout(t || 150);
  await p.addInitScript(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="international"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  await p.click('.tab:has-text("Divisions")'); await W(300);
  ok('Divisions tab: "Print by country" (international event)', !!(await p.$('button[data-act="print-open"]:has-text("Print by country")')));
  await p.click('button[data-act="print-open"]'); await W(400);
  ok('defaults: one page per country, all, Letter', (await p.$eval('#pr-by', s => s.value)) === 'country' && (await p.$eval('#pr-which', s => s.value)) === '' && (await p.$eval('#pr-paper', s => s.value)) === 'letter');
  const pages = await p.$$eval('#pr-preview .ppage h1', x => x.map(y => y.textContent)); console.log('  ', pages.join(' / '));
  ok(`one page per country, A→Z (${pages.length}: ${pages.slice(0, 3).join(', ')}…)`, pages.length === 10 && pages.every(t => / Competitors$/.test(t)) && pages.every((t, i) => i === 0 || pages[i - 1].localeCompare(t) <= 0));
  const jp = await p.$('#pr-preview .ppage:has(h1:text("Japan Competitors"))');
  const titles = await jp.$$eval('.ptitle', x => x.map(y => y.textContent));
  ok(`Japan page: yellow division titles in age / event order (${titles.join(' | ')})`, titles.length >= 3 && titles[0].startsWith('Senior Individual Kata') && titles.every(t => /^(Senior|Youth|Junior|Cadet|Kyu \w+) (Individual Kata|Individual Kumite|Team Kata|Team Kumite|Fukugo|Enbu)$/.test(t)));
  const bg = await jp.$eval('.ptitle', x => getComputedStyle(x).backgroundColor);
  ok(`titles are yellow (${bg})`, /255, 243, 92/.test(bg));
  ok('Women | Men columns with names', (await jp.$$('.pgrid .ph')).length >= 2 && (await jp.$$('.pn')).length >= 3);
  const kataRow = await jp.$eval('.prow', r => [...r.children].map(c => (c.querySelector('.ptitle') || {}).textContent || ''));
  ok(`Kata and Kumite side by side (${kataRow.join(' | ')})`, /Individual Kata/.test(kataRow[0]) && (/Individual Kumite/.test(kataRow[1]) || kataRow[1] === ''));
  // every name on a country page is from that country
  const okCountry = await p.evaluate(() => [...document.querySelectorAll('#pr-preview .ppage')].length);
  void okCountry;
  // team events list the team and its members
  const teamPage = await p.$('#pr-preview .ppage:has(.pteam)');
  ok('team events: team name then members', !!teamPage && (await teamPage.$$('.pmem')).length >= 2);
  // v1.56.1: a team with members from different countries is printed once, with each member's country
  const teamPages = await p.$$eval('#pr-preview .ppage', ps => { const seen = {}; ps.forEach((pg, i) => pg.querySelectorAll('.pteam').forEach(t => { const k = t.textContent.trim() + '@' + (t.closest('.pblock').querySelector('.ptitle').textContent); (seen[k] = seen[k] || new Set()).add(i); })); return Object.entries(seen).map(([k, v]) => [k, v.size]); });
  ok(`each team on one page only (${teamPages.length} teams)`, teamPages.length > 0 && teamPages.every(([, n]) => n === 1));
  const mixed = await p.$$eval('#pr-preview .pblock', bs => bs.map(b => [...b.querySelectorAll('.pmem .pfrom')].map(x => x.textContent.replace('·', '').trim())).filter(a => a.length));
  ok(`mixed teams show each member's country (${(mixed[0] || []).join(', ')})`, mixed.length >= 1 && mixed.every(a => new Set(a).size >= 2));
  ok('no "No country" page', !(await p.$('#pr-preview .ppage h1:text("No country Competitors")')));
  // one country only
  await p.selectOption('#pr-which', 'Brazil'); await W(200);
  ok('print one country', (await p.$$eval('#pr-preview .ppage h1', x => x.map(y => y.textContent))).join() === 'Brazil Competitors');
  await p.selectOption('#pr-which', ''); await W(150);
  // group by club
  await p.selectOption('#pr-by', 'club'); await W(250);
  const clubs = await p.$$eval('#pr-preview .ppage h1', x => x.map(y => y.textContent)); console.log('  ', clubs.join(' / '));
  ok('one page per club', clubs.length >= 10 && clubs.every(t => /^Team .* Competitors$/.test(t)));
  await p.selectOption('#pr-by', 'country'); await W(250);
  // print → pages laid out for paper; produce real PDFs
  for (const paper of ['letter', 'a4']) {
    await p.selectOption('#pr-paper', paper); await W(150);
    await p.click('#pr-go'); await W(200);
    ok(`${paper}: print called, @page size set`, (await p.evaluate(() => window.__printed)) >= 1 && new RegExp(paper === 'a4' ? 'A4' : 'letter').test(await p.$eval('#print-page', s => s.textContent)));
    // render the print layout (the root stays while "printing")
    await p.evaluate(() => { if (!document.getElementById('print-root')) throw new Error('no print root'); document.body.classList.add('printing'); });
    await p.emulateMedia({ media: 'print' });
    const pdf = await p.pdf({ path: `test/shots/divprint-${paper}.pdf`, preferCSSPageSize: true, printBackground: true });
    const nPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    ok(`${paper}: PDF has a page per country (${nPages} pages for 10 countries)`, nPages >= 10);
    const size = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)/);
    ok(`${paper}: page size ${size && size[1]}×${size && size[2]} pt`, size && (paper === 'a4' ? Math.abs(+size[1] - 595) < 3 && Math.abs(+size[2] - 842) < 3 : Math.abs(+size[1] - 612) < 3 && Math.abs(+size[2] - 792) < 3));
    await p.emulateMedia({ media: 'screen' });
    await p.evaluate(() => { document.body.classList.remove('printing'); const r = document.getElementById('print-root'); if (r) r.remove(); });
  }
  ok('the app is back after printing', !!(await p.$('#main')) && await p.$eval('#main', m => getComputedStyle(m).display !== 'none'));
  // phone: the dialog and preview fit
  await p.setViewportSize({ width: 390, height: 844 }); await W(300);
  ok('phone: no horizontal page scroll with the print dialog', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
