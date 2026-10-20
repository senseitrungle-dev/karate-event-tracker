// v1.35.0: typed birth year; entrants open their card from division settings; combine divisions under 3 entrants
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, locale: 'en-US' }); await ctx.route(/fonts\./, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament") >> nth=0'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('kt-local-v1') || '{}'));
  const evId = Object.keys(await db()).find(k => /^events\/[^/]+$/.test(k)).split('/')[1];
  const divs = async () => Object.entries(await db()).filter(([k]) => k.startsWith(`events/${evId}/divisions/`)).map(([k, v]) => Object.assign({ id: k.split('/').pop() }, v));
  const comp = async fn => { const d = await db(); const e = Object.entries(d).find(([k, v]) => k.startsWith(`events/${evId}/competitors/`) && v.firstName === fn); if (!e) return null; const id = e[0].split('/').pop(); return Object.assign({ id }, e[1], d[`pv/${evId}/competitors/${id}`] || {}); };
  // 1. typed birth date
  await p.click('.tab:has-text("Competitors")'); await p.click('button[data-act="comp-new"]:visible'); await p.waitForTimeout(200);
  ok('birth date is a text field with the format shown', (await p.getAttribute('#c-dob', 'type')) === 'text' && /MM\/DD\/YYYY/.test(await p.textContent('#f-comp')));
  await p.fill('#c-first', 'Cody').catch(() => {}); 
  const fill = async (sel, v) => { const el = await p.$(sel); if (el) await el.fill(v); };
  await fill('#c-first', 'Cody'); await fill('#c-last', 'Small'); await fill('#c-dojo', 'Test Dojo'); await p.selectOption('#c-gender', 'M').catch(() => {}); await p.selectOption('#c-rank', 'd1').catch(() => {});
  await p.type('#c-dob', '07/27/20'); await p.waitForTimeout(100);
  ok('while typing: asks for the 4-digit year', /Keep typing the year/.test(await p.textContent('#c-dob-out')));
  await p.type('#c-dob', '12'); await p.waitForTimeout(100);
  ok('typed 07/27/2012 → July 27, 2012 with age', /July 27, 2012/.test(await p.textContent('#c-dob-out')) && /age 14/.test(await p.textContent('#c-dob-out')));
  await p.fill('#c-dob', '31/02/2012'); await p.waitForTimeout(80);
  await p.check('#f-comp input[name="events"][value="IKATA"]').catch(() => {});
  await p.click('#modal button[type="submit"]'); await p.waitForTimeout(300);
  ok('impossible date refused with the format', /is not a date — type it as MM\/DD\/YYYY/.test(await p.textContent('.toast')) && !!(await p.$('#f-comp')));
  await p.fill('#c-dob', '07/27/2012'); await p.click('#modal button[type="submit"]'); await p.waitForTimeout(500);
  const cody = await comp('Cody');
  ok('saved as 2012-07-27', cody && cody.dob === '2012-07-27');
  // second cadet → Cadet Men Individual Kata has 2
  await p.click('button[data-act="comp-new"]:visible'); await p.waitForTimeout(200);
  await fill('#c-first', 'Dax'); await fill('#c-last', 'Small'); await fill('#c-dojo', 'Other Dojo'); await p.selectOption('#c-gender', 'M').catch(() => {}); await p.selectOption('#c-rank', 'd1').catch(() => {});
  await p.fill('#c-dob', '2011-03-04'); await p.check('#f-comp input[name="events"][value="IKATA"]').catch(() => {});
  await p.click('#modal button[type="submit"]'); await p.waitForTimeout(500);
  ok('YYYY-MM-DD also accepted', (await comp('Dax')).dob === '2011-03-04');
  // 2. small division: chip → combine
  await p.click('.tab:has-text("Divisions")'); await p.waitForTimeout(300);
  const ds = await divs(), cad = ds.find(d => d.name === 'Black Belt Cadet Men Individual Kata');
  const row = `tr:has(span.name:text-is("${cad.name}"))`;
  ok('Divisions list: “2 entrants · min 3 · Combine ›”', /2 entrants · min 3\s*Combine/.test(await p.textContent(row)));
  // division settings: names open the card; small-division notice
  await p.click(`${row} button[data-act="div-panel"]`); await p.waitForTimeout(250);
  ok('division panel lists entrants and the minimum-3 notice', /Entrants \(2\)/.test(await p.textContent('#divp-root')) && /needs at least 3/.test(await p.textContent('#divp-root')));
  await p.click('#divp-root button[data-act="ent-open"]:has-text("Small, Cody"), #divp-root button[data-act="ent-open"]:has-text("Cody")'); await p.waitForTimeout(250);
  ok('tapping a name opens the competitor card with the division choice', !!(await p.$('#f-comp')) && !!(await p.$('#ov-IKATA')) && /Cadet Men Individual Kata/.test(await p.$eval('#ov-IKATA', s => s.options[0].text)));
  await p.click('button[data-act="modal-close"]'); await p.waitForTimeout(150);
  await p.click(`${row} button[data-act="div-combine"]`); await p.waitForTimeout(250);
  const tgt = await p.$eval('#cmb-target', s => s.options[s.selectedIndex].text);
  console.log('   suggested:', tgt, '|', await p.textContent('#cmb-out'));
  ok('combine suggests the closest division (Junior Men Individual Kata)', /Junior Men Individual Kata/.test(tgt));
  await p.screenshot({ path: 'test/shots/combine.png' });
  await p.click('#modal button[type="submit"]'); await p.waitForTimeout(800);
  const ds2 = await divs(), jun = ds2.find(d => d.name === 'Black Belt Junior Men Individual Kata');
  ok('small division removed; target notes it combined', !ds2.some(d => d.id === cad.id) && (jun.combinedFrom || []).includes(cad.name));
  ok('both entrants now in the target (division set on their card)', (await comp('Cody')).divOverride.IKATA === jun.id && (await comp('Dax')).divOverride.IKATA === jun.id);
  ok('Divisions list shows “incl. …Cadet Men…”', /incl\. Black Belt Cadet Men Individual Kata/.test(await p.textContent(`tr:has(span.name:text-is("${jun.name}"))`)));
  // 3. division settings (form) → entrant name opens card
  await p.click(`tr:has(span.name:text-is("${jun.name}")) button[data-act="div-panel"]`); await p.waitForTimeout(200);
  await p.click('#divp-root button[data-act="div-edit"]'); await p.waitForTimeout(250);
  ok('division settings: entrant names are buttons', (await p.$$('#f-div button[data-act="ent-open"]')).length >= 3);
  await p.click('#f-div button[data-act="ent-open"]:has-text("Cody")'); await p.waitForTimeout(250);
  ok('…and open the competitor card', !!(await p.$('#f-comp')) && (await p.inputValue('#ov-IKATA')) === jun.id);
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
