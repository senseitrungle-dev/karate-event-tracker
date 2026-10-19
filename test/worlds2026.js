// v1.29.0: WTKF World Championship 2026 rule set (Information Package) → divisions, birth-year ages, quotas, team sizes, judge level
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\./, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament") >> nth=0'); await p.click('button[data-kind="international"]'); await p.waitForSelector('text=Director checklist', { timeout: 90000 });
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('kt-local-v1') || '{}'));
  const evId = Object.keys(await db()).find(k => /^events\/[^/]+$/.test(k)).split('/')[1];
  const divs = async () => Object.entries(await db()).filter(([k]) => k.startsWith(`events/${evId}/divisions/`)).map(([k, v]) => Object.assign({ id: k.split('/').pop() }, v));
  await p.click('.tab:has-text("Divisions")'); await p.waitForTimeout(200);
  await p.click('button[data-act="div-preset"]'); await p.waitForTimeout(200);
  const txt = await p.textContent('#modal');
  ok('rule-set pop-up explains the package rules', /34 divisions/.test(txt) && /31 Dec 2026/.test(txt) && /Ko-go/.test(txt) && /3 athletes per individual category/.test(txt) && /minimum judge level 4/.test(txt));
  await p.screenshot({ path: 'test/shots/worlds-preset.png' });
  await p.click('#modal button[type="submit"]'); await p.waitForTimeout(2500);
  const ds = await divs(), ev = (await db())[`events/${evId}`];
  ok('exactly the 34 rule-set divisions (others removed)', ds.length === 34 && ds.every(d => d.preset === 'wtkf-worlds-2026'));
  ok('event: International, ages on 31 Dec 2026, judge level 4', ev.level === 'International' && ev.ageAsOf === '2026-12-31' && ev.judgeMin === '4');
  const find = (g, et, gen) => ds.find(d => d.group === g && d.eventType === et && d.gender === gen);
  ok('age groups 14–15 / 16–17 / 18–20 / 21+ / 14–17 / 18+', find('Cadet', 'IKATA', 'F').maxAge === 15 && find('Junior', 'IKATA', 'F').minAge === 16 && find('Junior', 'IKATA', 'F').maxAge === 17 && find('Youth', 'IKATA', 'F').minAge === 18 && find('Senior', 'IKATA', 'M').minAge === 21 && find('Cadet & Junior', 'TKATA', 'F').maxAge === 17 && find('Youth & Senior', 'TKUMITE', 'M').maxAge == null);
  ok('Ko-go for Cadet/Junior kumite & fuku-go, Jiyu (Shobu) for Youth/Senior', find('Cadet', 'IKUMITE', 'M').scoring.style === 'kogo' && find('Junior', 'FUKUGO', 'F').scoring.style === 'kogo' && find('Youth', 'IKUMITE', 'M').scoring.style === 'shobu' && find('Senior', 'FUKUGO', 'M').scoring.style === 'shobu');
  ok('team sizes: C&J Enbu 3, Y&S Enbu 2, Team Kumite 3–4, Sync Kata 3', find('Cadet & Junior', 'ENBU', 'X').teamSize.join() === '3,3' && find('Youth & Senior', 'ENBU', 'M').teamSize.join() === '2,2' && find('Youth & Senior', 'TKUMITE', 'F').teamSize.join() === '3,4' && find('Cadet & Junior', 'TKATA', 'M').teamSize.join() === '3,3');
  ok('only Men’s + Mixed Enbu, no Women’s Enbu; no cadet/junior Team Kumite', !find('Cadet & Junior', 'ENBU', 'F') && !find('Youth & Senior', 'ENBU', 'F') && !ds.some(d => d.eventType === 'TKUMITE' && d.group === 'Cadet & Junior'));
  ok('black belts only, quota 3 / team quota 1', ds.every(d => d.minRank === 'd1') && find('Senior', 'IKATA', 'M').quota === 3 && find('Youth & Senior', 'TKATA', 'M').quota === 1);
  // Poland federation sheet → birth-year ages
  await p.click('.tab:has-text("Competitors")'); await p.click('button:has-text("Import CSV")'); await p.setInputFiles('#imp-file', 'test/fixtures/wtkf-federation-sheet.csv'); await p.waitForTimeout(400);
  await p.click('button[data-act="imp-run"]'); await p.waitForTimeout(2500);
  const placed = await p.evaluate(() => { const out = {}; /* read through the Divisions page text later */ return out; });
  await p.click('.tab:has-text("Divisions")'); await p.waitForTimeout(300);
  const divOf = async (first, last, et) => p.evaluate(([f, l, e]) => { const d = JSON.parse(localStorage.getItem('kt-local-v1')); return null; }, [first, last, et]);
  // open competitor record to see the matched division
  const matched = async name => { await p.click('.tab:has-text("Competitors")'); await p.fill('input.search', name); await p.waitForTimeout(250); const t = await p.textContent('#main'); return t; };
  let t = await matched('Lukasik');
  t = await matched('Janusz');
  await p.click('.tab:has-text("Competitors")'); await p.fill('input.search', ''); await p.waitForTimeout(200);
  const rows = await p.$$eval('tbody tr', r => r.map(x => x.textContent.replace(/\s+/g, ' ')));
  const row = n => rows.find(r => r.includes(n)) || '';
  console.log('  ', row('Janusz, Wiktor').slice(0, 160)); console.log('  ', row('Bis, Wiktor').slice(0, 160));
  const autoDiv = async (who, et, rowTxt) => { await p.click('.tab:has-text("Competitors")'); await p.fill('input.search', who); await p.waitForTimeout(250); await p.click(`tbody tr.click:has-text("${rowTxt || who}") >> nth=0`); await p.waitForTimeout(250);
    const v = await p.$eval(`#ov-${et}`, s => s.options[0].text).catch(() => ''); await p.click('button[data-act="modal-close"] >> nth=0'); await p.fill('input.search', ''); await p.waitForTimeout(100); return v; };
  const a1 = await autoDiv('Janusz', 'IKUMITE', 'Janusz, Wiktor'); console.log('   Janusz:', a1);
  ok('Wiktor Janusz (born Dec 2005, 20 on the day) → Senior by birth year', /Senior Men Individual Kumite/.test(a1) && row('Janusz, Wiktor').includes('· 21'));
  ok('Wiktor Bis (born 2006) → Youth', /Youth Men Individual Kumite/.test(await autoDiv('Bis', 'IKUMITE')));
  ok('Simona (born 2012) → Cadet; Lena Kisiel (2010) → Junior', /Cadet Women Individual Kata/.test(await autoDiv('Simona', 'IKATA')) && /Junior Women Individual Kata/.test(await autoDiv('Lena', 'IKATA', 'Kisiel, Lena')));
  // quota: 4 Testland cadet women in kata
  await p.click('button:has-text("Import CSV")');
  await p.fill('#imp-text', 'first_name,last_name,gender,dob,rank,country,events\n' + [1, 2, 3, 4].map(i => `Ana${i},Test,F,2012-03-0${i},Shodan,Testland,Individual Kata`).join('\n') + '\n' + [1, 2, 3].map(i => `Tom${i},Test,M,2011-03-0${i},Shodan,Testland,Enbu`).join('\n') + '\nKyu,Kid,F,2012-01-01,1st Kyu,Testland,Individual Kata');
  await p.click('button[data-act="imp-run"]'); await p.waitForTimeout(1500);
  await p.click('.tab:has-text("Divisions")'); await p.waitForTimeout(300);
  ok('over-quota country flagged on the division', /Over quota · Testland 4\/3/.test(await p.textContent('#main')));
  await p.click('.tab:has-text("Dashboard")'); await p.waitForTimeout(300);
  console.log('  checklist:', ((await p.textContent('#main')).match(/Quotas and team sizes.{0,300}/) || [''])[0]);
  ok('go-live checklist lists quota problems', /Quotas and team sizes/.test(await p.textContent('#main')) && /has \d+ athletes — limit 3/.test(await p.textContent('#main')));
  await p.click('.tab:has-text("Competitors")'); await p.fill('input.search', 'Kid'); await p.waitForTimeout(250);
  ok('kyu athlete has no division (Shodan or higher only)', /No division|Unplaced|not placed/i.test(await p.textContent('#main')));
  // team size by division: Cadet & Junior Men’s Enbu needs 3
  await p.click('.tab:has-text("Teams")'); await p.waitForTimeout(200);
  await p.click('button[data-act="team-new"][data-et="ENBU"]'); await p.waitForTimeout(200);
  await p.fill('#t-name', 'Testland Enbu');
  const boxes = await p.$$('#f-team input[name="memberIds"]');
  const labels = await p.$$eval('#f-team label.check', l => l.map(x => x.textContent));
  const tom = labels.map((l, i) => /Tom\d/.test(l) ? i : -1).filter(i => i >= 0);
  await boxes[tom[0]].check(); await boxes[tom[1]].check();
  await p.click('#modal button[type="submit"]'); await p.waitForTimeout(400);
  ok('2-member team refused for Cadet & Junior Enbu (needs 3)', /needs? 3 members/.test(await p.textContent('.toast')) && !!(await p.$('#f-team')));
  await boxes[tom[2]].check(); await p.click('#modal button[type="submit"]'); await p.waitForTimeout(500);
  ok('3-member team accepted', !(await p.$('#f-team')));
  // judges: level 3 not enough here
  await p.click('.tab:has-text("Judges")'); await p.waitForTimeout(300);
  ok('judge chips use level 4 minimum', /Level 4\+ needed/.test(await p.innerHTML('#main')));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
