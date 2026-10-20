// v1.28.0: birth-date order per file — day-month-year (Europe) vs month-day-year (USA)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-GB' }); await ctx.route(/fonts\./, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament") >> nth=0'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 30000 });
  const loc = await p.evaluate(() => document.querySelector('#main').textContent.match(/Riverside[^·\n]*/)?.[0]);
  console.log('  demo location:', loc);
  await p.click('.tab:has-text("Competitors")'); await p.click('button:has-text("Import CSV")'); await p.waitForTimeout(150);
  const H = 'first_name,last_name,gender,dob,rank,country\n';
  const run = async (csv, choice = 'auto') => { await p.selectOption('#imp-dates', choice); await p.fill('#imp-text', csv); await p.click('button[data-act="imp-preview"]'); await p.waitForTimeout(150);
    return { text: (await p.textContent('#imp-preview')).replace(/\s+/g, ' '), born: await p.$$eval('#imp-preview tbody tr', r => r.map(x => x.cells[3].textContent)) }; };
  let r = await run(H + 'Ana,Nowak,F,27.07.2012,1 dan,\nJan,Kos,M,05.03.2010,1 dan,');
  ok('27.07.2012 proves day-first → 05.03.2010 = 5 March', /day-month-year/.test(r.text) && r.born[0] === '27 Jul 2012' && r.born[1] === '5 Mar 2010');
  r = await run(H + 'Amy,Lee,F,07/27/2012,1st Kyu,\nBob,Ray,M,05/03/2010,1st Kyu,');
  ok('07/27/2012 proves month-first → 05/03/2010 = May 3', /month-day-year/.test(r.text) && r.born[0] === '27 Jul 2012' && r.born[1] === '3 May 2010');
  r = await run(H + 'Amy,Lee,F,05/03/2010,1st Kyu,USA\nBob,Ray,M,04/02/2011,1st Kyu,United States');
  ok('ambiguous + country USA → month-first', /country USA/.test(r.text) && r.born[0] === '3 May 2010' && r.born[1] === '2 Apr 2011');
  r = await run(H + 'Ana,Nowak,F,05/03/2010,1 dan,Poland');
  ok('ambiguous + slashes + Poland → still day-first (separator ignored)', /day-month-year/.test(r.text) && r.born[0] === '5 Mar 2010');
  r = await run(H + 'Ana,Nowak,F,05.03.2010,1 dan,Poland', 'MDY');
  ok('director override: month-day-year', /chosen by you/.test(r.text) && r.born[0] === '3 May 2010');
  r = await run(H + 'Ana,Nowak,F,27072012,1 dan,Poland\nIza,Bak,F,2012-07-27,1 dan,Poland');
  ok('8 digits ddmmyyyy and year-first both read', r.born[0] === '27 Jul 2012' && r.born[1] === '27 Jul 2012');
  r = await run(H + 'Ana,Nowak,F,27.07.2012,1 dan,\nAmy,Lee,F,07.27.2012,1 dan,');
  ok('mixed orders in one file → warning; the row that doesn’t fit is imported without a birth date and flagged', /mixes both orders/.test(r.text) && r.born[0] === '27 Jul 2012' && /missing/.test(r.born[1]) && /Date of birth \(“07\.27\.2012” is not a date/.test(r.text));
  r = await run(H + 'Ana,Nowak,F,31.02.2012,1 dan,Poland');
  ok('impossible date not used — imported, birth date flagged to enter later', /1 competitor ready/.test(r.text) && /“31\.02\.2012” is not a date/.test(r.text) && /missing/.test(r.born[0]));
  r = await run(H + 'Amy,Lee,F,05/03/2010,1st Kyu,');
  console.log('  no country:', r.text.match(/Birth dates read as[^.]*\.[^.]*\./)?.[0]);
  ok('no deciding date/country → follows the event location', /the event is (in|outside) the USA|day first assumed|US dates/.test(r.text));
  await p.click('button[data-act="modal-close"]');
  // federation sheet: day-first proven by its own dates
  await p.click('button:has-text("Import CSV")'); await p.setInputFiles('#imp-file', 'test/fixtures/wtkf-federation-sheet.csv'); await p.waitForTimeout(400);
  ok('federation sheet → day-month-year', /day-month-year \(Europe/.test(await p.textContent('#imp-preview')));
  await p.screenshot({ path: 'test/shots/dates.png' });
  { // a director whose device is set to US English: undecided files read month-first
    const c2 = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' }); await c2.route(/fonts\./, r => r.abort());
    const q = await c2.newPage(); q.on('pageerror', e => errors.push(e.message));
    await q.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
    await q.click('button:has-text("Create demo tournament") >> nth=0'); await q.click('button[data-kind="local"]'); await q.waitForSelector('text=Director checklist', { timeout: 30000 });
    await q.click('.tab:has-text("Competitors")'); await q.click('button:has-text("Import CSV")'); await q.waitForTimeout(150);
    await q.fill('#imp-text', H + 'Amy,Lee,F,05/03/2010,1st Kyu,'); await q.click('button[data-act="imp-preview"]'); await q.waitForTimeout(150);
    ok('US device + nothing deciding → month-day-year', /your device uses US dates/.test(await q.textContent('#imp-preview')));
    await c2.close();
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
