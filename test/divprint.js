// v1.56.0 / v1.57.0: division printout per country / region / club (Polish federation layout), Letter or A4, at most 2 pages per group
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); await ctx.route(/fonts\./, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  const W = t => p.waitForTimeout(t || 150);
  // print() like Safari on iPhone / iPad: returns at once, the dialog reads the page later
  await p.addInitScript(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="international"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  await p.click('.tab:has-text("Divisions")'); await W(300);
  ok('Divisions tab: "Print by country" (international event)', !!(await p.$('button[data-act="print-open"]:has-text("Print by country")')));
  await p.click('button[data-act="print-open"]'); await W(500);
  ok('defaults: one sheet per country, all, Letter', (await p.$eval('#pr-by', s => s.value)) === 'country' && (await p.$eval('#pr-which', s => s.value)) === '' && (await p.$eval('#pr-paper', s => s.value)) === 'letter');
  const bars = await p.$$eval('#pr-preview .ppage .pbar', x => x.map(y => y.textContent));
  console.log('  ', bars.join(' / '));
  ok(`one sheet per country, A→Z, name in the top bar (${bars.length})`, bars.length === 10 && bars.every(t => t === t.toUpperCase()) && bars.every((t, i) => i === 0 || bars[i - 1].localeCompare(t) <= 0));
  const jp = await p.$('#pr-preview .ppage:has(.pbar:text("JAPAN"))');
  const ages = await jp.$$eval('.pbar2', x => x.map(y => y.textContent));
  ok(`age groups side by side in order (${ages.join(' | ')})`, ages[0] === 'Senior' && ages.indexOf('Junior') > 0 && (await jp.$eval('.pcols', g => getComputedStyle(g).gridTemplateColumns.split(' ').length)) === 2);
  const evs = await jp.$$eval('.page-col >> nth=0', () => 0).catch(() => 0); void evs;
  const sen = await jp.$$eval('.page-col', cs => [...cs[0].querySelectorAll('.psec th:first-child b')].map(x => x.textContent));
  ok(`Senior events in the sheet's order (${sen.join(', ')})`, sen.length >= 3 && sen.every((t, i) => i === 0 || ['kata ind.', 'fukugo', 'kumite ind.', 'kata team', 'enbu W/M', 'enbu M/M', 'enbu W/W', 'kumite team'].indexOf(t) > ['kata ind.', 'fukugo', 'kumite ind.', 'kata team', 'enbu W/M', 'enbu M/M', 'enbu W/W', 'kumite team'].indexOf(sen[i - 1])));
  const heads = await jp.$eval('.psec', t => [...t.querySelectorAll('th')].map(x => x.textContent.trim()));
  ok(`women | men columns (${heads.join(' | ')})`, /women/.test(heads[0]) && /men/.test(heads[1]));
  const nums = await jp.$eval('.psec', t => [...t.querySelectorAll('td.pnum')].map(x => x.textContent).filter(Boolean));
  ok(`names numbered 1, 2, 3… (${nums.join(',')})`, nums[0] === '1' && nums.includes('2'));
  const bg = await jp.$eval('.pbar', x => getComputedStyle(x).backgroundColor), sh = await jp.$eval('.psec th', x => getComputedStyle(x).backgroundColor);
  ok(`dark grey bars, light grey event headers (${bg}, ${sh})`, /97, 97, 97/.test(bg) && /217, 217, 217/.test(sh));
  // teams: members numbered; a mixed team once, with each member's country
  const teamSec = await p.$$eval('#pr-preview .psec', ts => ts.filter(t => /kata team|kumite team|enbu/.test(t.querySelector('th').textContent)).length);
  ok(`team events listed with their members (${teamSec} sections)`, teamSec >= 3);
  const froms = await p.$$eval('#pr-preview .pfrom', x => x.length);
  ok('mixed teams show each member\'s country', froms >= 2);
  // font fitted so every group fits on at most two pages
  const fs = await p.$$eval('#pr-preview .ppage', ps => ps.map(x => parseFloat(x.style.fontSize)));
  ok(`font size chosen per sheet (${[...new Set(fs)].join(', ')} px)`, fs.every(x => x >= 5.5 && x <= 13));
  // one country / per club
  await p.selectOption('#pr-which', 'Japan'); await W(250);
  ok('print one country', (await p.$$eval('#pr-preview .pbar', x => x.map(y => y.textContent))).join() === 'JAPAN');
  await p.selectOption('#pr-which', ''); await W(150);
  await p.selectOption('#pr-by', 'club'); await W(300);
  ok('one sheet per club', (await p.$$eval('#pr-preview .pbar', x => x.map(y => y.textContent))).every(t => /^TEAM /.test(t)));
  await p.selectOption('#pr-by', 'country'); await W(300);
  // print: pages stay after print() returns (iPhone / iPad), removed after the dialog
  for (const paper of ['letter', 'a4']) {
    await p.selectOption('#pr-paper', paper); await W(250);
    await p.click('#pr-go'); await W(2500);
    ok(`${paper}: print called and the pages are still there 2.5 s later`, (await p.evaluate(() => window.__printed)) >= 1 && !!(await p.$('#print-root .ppage')) && await p.evaluate(() => document.body.classList.contains('printing')));
    await p.emulateMedia({ media: 'print' });
    const pdf = await p.pdf({ path: `test/shots/divprint-${paper}.pdf`, preferCSSPageSize: true, printBackground: true });
    const nPages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    ok(`${paper}: PDF ${nPages} pages for 10 countries (at most 2 each)`, nPages >= 10 && nPages <= 20);
    const size = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*0 0 ([\d.]+) ([\d.]+)/);
    ok(`${paper}: page size ${size && size[1]}×${size && size[2]} pt`, size && (paper === 'a4' ? Math.abs(+size[1] - 595) < 3 && Math.abs(+size[2] - 842) < 3 : Math.abs(+size[1] - 612) < 3 && Math.abs(+size[2] - 792) < 3));
    await p.emulateMedia({ media: 'screen' });
    await p.evaluate(() => window.dispatchEvent(new Event('afterprint'))); await W(1100);
    ok(`${paper}: after the print dialog the app is back`, !(await p.$('#print-root')) && !(await p.evaluate(() => document.body.classList.contains('printing'))));
  }
  // the biggest single country on its own: at most 2 pages
  const big = await p.$$eval('#pr-preview .ppage', ps => { let m = null, h = 0; ps.forEach(x => { if (x.scrollHeight > h) { h = x.scrollHeight; m = x.querySelector('.pbar').textContent; } }); return m; });
  await p.selectOption('#pr-paper', 'letter'); await p.selectOption('#pr-which', big.replace(/\b\w/g, c => c).toLowerCase().replace(/(^|\s)\w/g, c => c.toUpperCase())); await W(300);
  await p.click('#pr-go'); await W(300); await p.emulateMedia({ media: 'print' });
  const one = await p.pdf({ path: 'test/shots/divprint-one.pdf', preferCSSPageSize: true, printBackground: true });
  const n1 = (one.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  ok(`largest country (${big}) prints on ${n1} page(s) (≤ 2)`, n1 >= 1 && n1 <= 2);
  await p.emulateMedia({ media: 'screen' }); await p.evaluate(() => window.dispatchEvent(new Event('afterprint'))); await W(1000);
  // v1.58: names on one line (no name cut off) and the PDF made in the app
  ok('every name fits on its line in the preview', await p.$$eval('#pr-preview .psec td', tds => tds.every(td => td.scrollWidth <= td.clientWidth + 1)));
  await p.selectOption('#pr-which', ''); await p.selectOption('#pr-paper', 'letter'); await W(300);
  await p.click('#pr-pdf'); await p.waitForSelector('#pr-out:not([hidden]) #pr-dl', { timeout: 30000 });
  ok('PDF ready message with the page count', /PDF ready/.test(await p.textContent('#pr-out')) && /\d+ pages?/.test(await p.textContent('#pr-out')));
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#pr-dl')]);
  const buf = require('fs').readFileSync(await dl.path()), txt = buf.toString('latin1');
  require('fs').copyFileSync(await dl.path(), 'test/shots/divprint-app.pdf');
  const pp = (txt.match(/\/Type \/Page /g) || []).length, imgs = (txt.match(/\/Subtype \/Image/g) || []).length;
  ok(`app PDF: valid file (${dl.suggestedFilename()}), ${pp} Letter pages, one image each`, txt.startsWith('%PDF-1.4') && /%%EOF\s*$/.test(txt) && /\.pdf$/.test(dl.suggestedFilename()) && pp >= 10 && pp <= 20 && imgs === pp && /MediaBox \[0 0 612\.00 792\.00\]/.test(txt));
  const xref = +txt.match(/startxref\n(\d+)/)[1];
  ok('app PDF: cross-reference table where it says', txt.slice(xref, xref + 4) === 'xref');
  // phone: the dialog fits and the preview is the real page scaled to the screen
  await p.setViewportSize({ width: 390, height: 844 }); await W(300);
  await p.selectOption('#pr-paper', 'a4'); await W(400);
  ok('phone: no horizontal page scroll with the print dialog', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  ok('phone: the preview is the real page scaled to the screen width', await p.$$eval('#pr-preview .pv-sheet', (sh) => { const pv = document.getElementById('pr-preview'); return sh.length > 0 && sh.every(x => x.getBoundingClientRect().width <= pv.clientWidth) && /scale\(0\.\d+\)/.test(sh[0].querySelector('.ppage').style.transform); }));
  await p.screenshot({ path: 'test/shots/divprint-phone.png' });
  // one group holding every division still fits on 2 pages: national demo by country (one country), and the World demo by region
  // (nobody has a region: all 58 competitors on one sheet, the font gets smaller)
  for (const [paper, kind, by] of [['letter', 'national', 'country'], ['a4', 'national', 'country'], ['letter', 'international', 'region'], ['a4', 'international', 'region']]) {
    const c2 = await b.newContext({ viewport: { width: 1280, height: 900 } }); await c2.route(/fonts\./, r => r.abort());
    const q = await c2.newPage(); q.on('pageerror', e => errors.push(e.message)); await q.addInitScript(() => { window.print = () => {}; });
    await q.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
    await q.click('button:has-text("Create demo tournament")'); await q.click(`button[data-kind="${kind}"]`); await q.waitForSelector('text=Director checklist', { timeout: 60000 });
    await q.click('.tab:has-text("Divisions")'); await q.waitForTimeout(300); await q.click('button[data-act="print-open"]'); await q.waitForTimeout(400);
    await q.selectOption('#pr-by', by); await q.waitForTimeout(300); await q.selectOption('#pr-paper', paper); await q.waitForTimeout(400);
    const secs = await q.$$eval('#pr-preview .psec', x => x.length), f = await q.$eval('#pr-preview .ppage', x => parseFloat(x.style.fontSize));
    await q.click('#pr-go'); await q.waitForTimeout(300); await q.emulateMedia({ media: 'print' });
    const pdf = await q.pdf({ path: `test/shots/divprint-all-${kind}-${paper}.pdf`, preferCSSPageSize: true, printBackground: true });
    const n = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    ok(`${kind} by ${by}, ${paper}: every division on one sheet (${secs} event tables, font ${f}px) fits on ${n} page(s) (≤ 2)`, secs >= 8 && n >= 1 && n <= 2);
    await c2.close();
  }
  // home-screen app on iPhone / iPad (standalone): Print makes the PDF to share instead of calling print()
  {
    const c3 = await b.newContext({ viewport: { width: 390, height: 844 } }); await c3.route(/fonts\./, r => r.abort());
    const q = await c3.newPage(); q.on('pageerror', e => errors.push(e.message));
    await q.addInitScript(() => { window.__printed = 0; window.print = () => { window.__printed++; }; Object.defineProperty(navigator, 'standalone', { get: () => true });
      navigator.canShare = () => true; navigator.share = async d => { window.__shared = d.files && d.files[0] && d.files[0].name; }; });
    await q.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
    await q.click('button:has-text("Create demo tournament")'); await q.click('button[data-kind="international"]'); await q.waitForSelector('text=Director checklist', { timeout: 60000 });
    await q.click('.bn:has-text("Divisions")'); await q.waitForTimeout(300); await q.click('button[data-act="print-open"]'); await q.waitForTimeout(400);
    await q.click('#pr-go'); await q.waitForSelector('#pr-out:not([hidden]) #pr-share', { timeout: 30000 });
    ok('home-screen app: Print makes a PDF instead (print() not called) and offers Share / Print', (await q.evaluate(() => window.__printed)) === 0);
    await q.click('#pr-share'); await q.waitForTimeout(300);
    ok('Share / Print hands the PDF file to the share sheet', /\.pdf$/.test(await q.evaluate(() => window.__shared || '')));
    await c3.close();
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
