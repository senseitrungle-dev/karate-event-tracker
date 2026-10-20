// v1.34.0: import whatever columns are recognised, flag what is missing for later, preview everything first
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } }); p.on('pageerror', e => errors.push(e.message));
  await p.route(/fonts\./, r => r.abort());
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament") >> nth=0'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('kt-local-v1') || '{}'));
  const evId = Object.keys(await db()).find(k => /^events\/[^/]+$/.test(k)).split('/')[1];
  const comps = async () => { const d = await db(); return Object.entries(d).filter(([k]) => k.startsWith(`events/${evId}/competitors/`)).map(([k, v]) => Object.assign({}, v, d[`pv/${evId}/competitors/${k.split('/').pop()}`] || {})); };
  const n0 = (await comps()).length;
  await p.click('.tab:has-text("Competitors")'); await p.click('button:has-text("Import CSV")');
  // a typical local sign-up sheet: one name column, belt colours, no gender / birth date / waiver / events columns
  const csv = ['Name,Belt,Club,Parent Phone,T-shirt size',
    '"Lee, Amy",3rd kyu,Hoshi Dojo,555-0101,M',
    'Bob Ray,Yellow,Hoshi Dojo,,L',
    'Cara Diaz,,,555-0103,S',
    ',8th kyu,Hoshi Dojo,555-0104,M'].join('\n');
  await p.fill('#imp-text', csv); await p.click('button[data-act="imp-preview"]'); await p.waitForTimeout(200);
  const t = (await p.textContent('#imp-preview')).replace(/\s+/g, ' ');
  console.log('  ', t.slice(0, 420));
  ok('columns found: Name, Rank ← Belt, Dojo ← Club, Emergency phone ← Parent Phone', /Columns found \(4\)/.test(t) && /Rank ← Belt/.test(t) && /Dojo \/ club ← Club/.test(t) && /Emergency phone ← Parent Phone/.test(t));
  ok('missing columns listed for later: Gender, Date of birth, Emergency contact, Waiver, Events', ['Gender', 'Date of birth', 'Emergency contact', 'Waiver', 'Events'].every(c => new RegExp('Not in the file — enter later.*' + c).test(t)));
  ok('unrecognised column shown as not used', /Not used .*T-shirt size/.test(t));
  ok('3 named rows ready, all 3 with details to enter later; the row without a name reported', /3 competitors ready/.test(t) && /3 with details to enter later/.test(t) && /Row 5: no name — not imported/.test(t));
  const rows = await p.$$eval('#imp-preview table.imp-tbl tbody tr', r => r.map(x => [...x.cells].map(c => c.textContent.trim())));
  ok('“Last, First” and “First Last” both split', rows[0][1] === 'Lee, Amy' && rows[1][1] === 'Ray, Bob' && rows[2][1] === 'Diaz, Cara');
  ok('every value shown; gaps marked “missing”', rows[0][4] === '3rd Kyu' && rows[0][5] === 'Hoshi Dojo' && rows[0][2] === 'missing' && rows[2][5] === 'missing' && /555-0101/.test(rows[0][8]));
  ok('unrecognised value flagged with what was in the file', /Rank \(“Yellow” not recognised\)/.test(rows[1][10]));
  await p.waitForTimeout(500); await p.screenshot({ path: 'test/shots/lenient-preview.png' });
  ok('no date-order notice when the file has no dates', !/Birth dates read as/.test(t));
  await p.click('button[data-act="imp-run"]'); await p.waitForTimeout(1500);
  const cs = await comps(), amy = cs.find(c => c.firstName === 'Amy');
  ok('3 imported, with what the file had', cs.length === n0 + 3 && amy && amy.rank === 'k3' && amy.dojo === 'Hoshi Dojo' && amy.emergencyPhone === '555-0101' && !amy.gender && !amy.dob);
  ok('after import the list shows “Missing information”, each marked Incomplete', (await p.inputValue('#comp-f')) === 'incomplete' && (await p.$$('tbody tr:has-text("Incomplete")')).length >= 3 && /need details/.test(await p.textContent('.toast')));
  // no name column at all → nothing imported, clear message
  await p.click('button:has-text("Import CSV")'); await p.fill('#imp-text', 'Belt,Club\n3rd kyu,Hoshi'); await p.click('button[data-act="imp-preview"]'); await p.waitForTimeout(150);
  ok('file without a name column is refused with a clear message', /No name column found/.test(await p.textContent('#imp-preview')));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
