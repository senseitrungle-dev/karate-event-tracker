// v1.37.0: international events keep only the year of birth (GDPR data minimisation; WTKF birth-year ages)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const p = await b.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); p.on('pageerror', e => errors.push(e.message));
  await p.route(/fonts\./, r => r.abort());
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament") >> nth=0'); await p.click('button[data-kind="international"]'); await p.waitForSelector('text=Director checklist', { timeout: 90000 });
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('kt-local-v1') || '{}'));
  const evId = Object.keys(await db()).find(k => /^events\/[^/]+$/.test(k)).split('/')[1];
  const all = async () => { const d = await db(); return Object.entries(d).filter(([k]) => k.startsWith(`events/${evId}/competitors/`)).map(([k, v]) => { const id = k.split('/').pop(); return Object.assign({ id }, v, { pv: d[`pv/${evId}/competitors/${id}`] || {} }); }); };
  // existing full birth dates → offer to keep year only
  await p.click('.tab:has-text("Competitors")'); await p.waitForTimeout(300);
  ok('competitors list offers “Keep year only” for stored full dates', /full date of birth stored/.test(await p.textContent('#main')) && !!(await p.$('button[data-act="keep-year"]')));
  const before = Object.fromEntries((await all()).map(c => [c.id, c.age]));
  await p.click('button[data-act="keep-year"]'); await p.click('#confirm button:has-text("Keep year only")'); await p.waitForTimeout(2500);
  const cs = await all();
  ok('every stored date reduced to the year (day and month deleted)', cs.every(c => !c.pv.dob && /^\d{4}$/.test(c.pv.birthYear || '')));
  ok('notice gone', !/full date of birth stored/.test(await p.textContent('#main')));
  // import: dates of any shape → year only
  await p.click('button:has-text("Import CSV")');
  await p.fill('#imp-text', ['first_name,last_name,gender,dob,rank,country,events',
    'Ana,Nowak,F,27.07.2012,Shodan,Poland,Individual Kata',
    'Amy,Lee,F,07/27/2010,Shodan,USA,Individual Kata',
    'Eva,Kos,F,31.02.2008,Shodan,Slovenia,Individual Kata',
    'Ida,Bak,F,,Shodan,Poland,Individual Kata'].join('\n'));
  await p.click('button[data-act="imp-preview"]'); await p.waitForTimeout(250);
  const t = (await p.textContent('#imp-preview')).replace(/\s+/g, ' ');
  ok('preview: year-of-birth notice, no day/month order question', /year of birth only/.test(t) && !/Birth dates read as/.test(t));
  const born = await p.$$eval('#imp-preview table.imp-tbl tbody tr', r => r.map(x => x.cells[3].textContent.trim()));
  ok('Born column shows only the year (even 31.02.2008 → 2008)', born.join() === '2012,2010,2008,missing');
  await p.click('button[data-act="imp-run"]'); await p.waitForTimeout(1500);
  const ana = (await all()).find(c => c.firstName === 'Ana');
  ok('stored: birthYear 2012, no date; age 14 in 2026', ana && ana.pv.birthYear === '2012' && !ana.pv.dob && ana.age === 14);
  const ida = (await all()).find(c => c.firstName === 'Ida');
  ok('Ida (no date) imported without a year, marked Incomplete', ida && !ida.pv.birthYear && /Incomplete/.test(await p.textContent('tbody tr:has-text("Bak, Ida")')));
  await p.click('.tab:has-text("Competitors")'); await p.click('button:has-text("Import CSV")');
  await p.fill('#imp-text', 'first_name,last_name,gender,dob,rank,country,events\nJan,Nowak,M,2010,Shodan,Poland,Individual Kata\nJan,Nowak,M,2010,Shodan,Czechia,Individual Kata\nAna,Nowak,F,2012,Shodan,Poland,Individual Kata');
  await p.click('button[data-act="imp-preview"]'); await p.waitForTimeout(200);
  const t2 = (await p.textContent('#imp-preview')).replace(/\s+/g, ' ');
  ok('same name + year from two countries = two people; same country = already registered', /2 competitors ready/.test(t2) && /Ana Nowak: already registered/.test(t2));
  await p.click('button[data-act="modal-close"]');
  // competitor card: year field
  await p.click('.tab:has-text("Competitors")'); await p.click('button[data-act="comp-new"]:visible'); await p.waitForTimeout(200);
  ok('card asks for “Year of birth”, not a full date', !!(await p.$('#c-yob')) && !(await p.$('#c-dob')));
  await p.fill('#c-first', 'Zoe'); await p.fill('#c-last', 'Year'); await p.selectOption('#c-gender', 'F'); await p.selectOption('#c-rank', 'd1'); await p.fill('#c-dojo', 'Team X');
  await p.type('#c-yob', '2011'); await p.waitForTimeout(100);
  ok('typed 2011 → age 15 in 2026 (on 31 Dec)', /Born 2011 · age 15 in 2026/.test(await p.textContent('#c-yob-out')));
  await p.click('#modal button[type="submit"]'); await p.waitForTimeout(500);
  const zoe = (await all()).find(c => c.firstName === 'Zoe');
  ok('saved year only', zoe && zoe.pv.birthYear === '2011' && !zoe.pv.dob && zoe.age === 15);
  // export: birth_year column
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button[data-act="export-comps"]')]);
  const csv = require('fs').readFileSync(await dl.path(), 'utf8').replace(/^\ufeff/, '');
  ok('export downloads as a file (not a copy box)', /competitors\.csv$/.test(dl.suggestedFilename()) && !(await p.$('#export-text')));
  ok('export has birth_year, no dob', /^First,Last,gender,birth_year,age/.test(csv) && /Zoe,Year,F,2011,15/.test(csv));
  // a local (US) event keeps full dates
  await p.click('.bar button.brand'); await p.waitForTimeout(300);
  await p.click('button:has-text("Create demo tournament") >> nth=0'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  await p.click('.tab:has-text("Competitors")'); await p.click('button[data-act="comp-new"]:visible'); await p.waitForTimeout(200);
  ok('local event: full date of birth field as before, no “Keep year only”', !!(await p.$('#c-dob')) && !(await p.$('#c-yob')));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
