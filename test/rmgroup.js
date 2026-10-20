// v1.36.0: bulk remove competitors of one import / dojo-club-federation / region / country, then import again
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
  const comps = async () => Object.entries(await db()).filter(([k]) => k.startsWith(`events/${evId}/competitors/`)).map(([k, v]) => Object.assign({ id: k.split('/').pop() }, v));
  const n0 = (await comps()).length;
  // import the federation sheet (file) → tagged with the file name
  await p.click('.tab:has-text("Competitors")'); await p.click('button:has-text("Import CSV")');
  await p.setInputFiles('#imp-file', 'test/fixtures/wtkf-federation-sheet.csv'); await p.waitForTimeout(400);
  await p.click('button[data-act="imp-run"]'); await p.waitForTimeout(2000);
  let cs = await comps();
  ok('29 imported, tagged with the file name', cs.length === n0 + 29 && cs.filter(c => c.importName === 'wtkf-federation-sheet.csv').length === 29);
  // open Remove group — choose the import
  await p.click('button[data-act="rm-group"]'); await p.waitForTimeout(250);
  const opts = await p.$$eval('#rg-group optgroup', g => g.map(x => [x.label, [...x.querySelectorAll('option')].map(o => o.textContent)]));
  console.log('   groups:', JSON.stringify(opts.map(([l, o]) => [l, o.length])));
  ok('groups offered: an import, dojos / clubs / federation, regions, countries', opts.some(([l, o]) => l === 'From an import' && o.some(t => /wtkf-federation-sheet\.csv .*\(29\)/.test(t))) && opts.some(([l, o]) => l === 'Dojo / club / federation' && o.some(t => /Polish Traditional Karate Union \(29\)/.test(t))) && opts.some(([l]) => l === 'Country'));
  const impKey = await p.$eval('#rg-group', s => [...s.options].find(o => /wtkf-federation-sheet/.test(o.textContent)).value);
  await p.selectOption('#rg-group', impKey); await p.waitForTimeout(250);
  ok('the import’s 29 are listed and ticked', (await p.$$('#f-rmgroup input[name="rm"]:checked')).length === 29 && /29 competitors selected/.test(await p.textContent('#rg-n')));
  await p.uncheck('#f-rmgroup input[name="rm"] >> nth=0'); await p.waitForTimeout(100);
  ok('untick one → Remove 28', (await p.textContent('#rg-go')) === 'Remove 28');
  await p.screenshot({ path: 'test/shots/rmgroup.png' });
  await p.click('#rg-go'); await p.waitForTimeout(200);
  ok('asks to confirm', /Remove 28 competitors/.test(await p.textContent('#confirm')));
  await p.click('#confirm button:has-text("Remove 28")'); await p.waitForTimeout(1500);
  cs = await comps();
  ok('28 removed, the unticked one kept, private details gone too', cs.length === n0 + 1 && Object.keys(await db()).filter(k => k.startsWith(`pv/${evId}/competitors/`)).length === n0 + 1);
  // import the corrected file again → 28 come back, the kept one is “already registered”
  await p.click('button:has-text("Import CSV")'); await p.setInputFiles('#imp-file', 'test/fixtures/wtkf-federation-utf8.csv'); await p.waitForTimeout(400);
  const t = await p.textContent('#imp-preview');
  ok('re-import: 28 ready; the one kept is recognised (already registered, or its lost accents corrected)', /28 competitors ready/.test(t) && /already registered|1 name will be corrected/.test(t));
  await p.click('button[data-act="imp-run"]'); await p.waitForTimeout(2000);
  ok('back to 29 Polish athletes', (await comps()).filter(c => c.country === 'Poland').length === 29);
  // results lock + teams: demo dojo; give one member a kata score, then remove the dojo
  await p.click('.tab:has-text("Divisions")'); await p.click('button:has-text("Draw all ready")'); await p.click('#confirm button:has-text("Draw")'); await p.waitForTimeout(1500);
  const d = await db(), dojoComps = (await comps()).filter(c => c.dojo === 'Lakeside Budokan');
  const kpKey = Object.keys(d).find(k => k.includes('/brackets/') && d[k].format === 'KP' && d[k].kpPools && Object.values(d[k].kpPools).flat().some(id => dojoComps.some(c => c.id === id)));
  const scored = Object.values(d[kpKey].kpPools).flat().find(id => dojoComps.some(c => c.id === id));
  await p.evaluate(([k, id]) => { const x = JSON.parse(localStorage.getItem('kt-local-v1')); x[k].scores = Object.assign(x[k].scores || {}, { ['R1_' + id]: { s: ['7', '7', '7', '7', '7', '7'], kata: 'Jion' } }); localStorage.setItem('kt-local-v1', JSON.stringify(x)); }, [kpKey, scored]);
  await p.reload(); await p.waitForTimeout(1500);
  await p.click('.tab:has-text("Competitors")'); await p.click('button[data-act="rm-group"]'); await p.waitForTimeout(200);
  await p.selectOption('#rg-group', 'dojo:Lakeside Budokan'); await p.waitForTimeout(250);
  ok('a competitor with a recorded score is kept (locked)', /has results — kept/.test(await p.textContent('#f-rmgroup')) && await p.$eval(`#f-rmgroup input[value="${scored}"]`, i => i.disabled && !i.checked));
  ok('others show they are in a drawn bracket', /in a drawn bracket/.test(await p.textContent('#f-rmgroup')));
  const teamsBefore = Object.entries(await db()).filter(([k]) => k.startsWith(`events/${evId}/teams/`)).map(([k, v]) => v);
  await p.click('#rg-go'); await p.click('#confirm button.danger, #confirm button:has-text("Remove")'); await p.waitForTimeout(1500);
  const left = (await comps()).filter(c => c.dojo === 'Lakeside Budokan');
  ok('dojo removed except the one with a score', left.length === 1 && left[0].id === scored);
  const ids = new Set((await comps()).map(c => c.id));
  const teamsAfter = Object.entries(await db()).filter(([k]) => k.startsWith(`events/${evId}/teams/`)).map(([k, v]) => v);
  ok('teams no longer list removed competitors (empty teams deleted)', teamsAfter.every(t => (t.memberIds || []).every(m => ids.has(m)) && (t.memberIds || []).length) && teamsAfter.length <= teamsBefore.length);
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
