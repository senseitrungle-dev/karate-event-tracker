// v1.27.0: judge import reads the JUDGES/COACHES section of the WTKF National Federation registration sheet
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\./, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament") >> nth=0'); await p.click('button[data-kind="international"]'); await p.waitForSelector('text=Director checklist', { timeout: 90000 });
  await p.click('.tab:has-text("Judges")'); await p.waitForTimeout(200);
  const judges = () => p.evaluate(() => { const d = JSON.parse(localStorage.getItem('kt-local-v1') || '{}'); return Object.entries(d).filter(([k]) => /^events\/[^/]+\/judges\//.test(k)).map(([k, v]) => Object.assign({ id: k.split('/').pop() }, v)); });
  const n0 = (await judges()).length;
  const open = async f => { await p.click('button[data-act="judge-import"]'); await p.waitForTimeout(150); await p.setInputFiles('#jimp-file', f); await p.waitForTimeout(500); return p.textContent('#jimp-preview'); };
  let pv = await open('test/fixtures/wtkf-federation-sheet.csv');
  console.log('  ', pv.replace(/\s+/g, ' ').slice(0, 420));
  ok('federation sheet recognised (judges/coaches section, Poland, federation)', /WTKF National Federation sheet/.test(pv) && /Poland/.test(pv) && /Polish Traditional Karate Union/.test(pv));
  const names = await p.$$eval('#jimp-preview tbody tr', r => r.map(x => x.cells[2].textContent));
  ok('only the 2 judges/coaches — no athletes, no photographer, no empty slots', names.length === 2 && names.includes('Anna Kulczy?ska') && names.includes('Agnieszka Sajdutka'));
  ok('no levels on the sheet → warning per row', (pv.match(/no judge level on the sheet/g) || []).length === 2);
  ok('lost accents flagged', /accents lost/.test(pv));
  ok('Import button counts ticked rows', (await p.textContent('#jimp-run')) === 'Import 2');
  await p.uncheck('.jimp-pick >> nth=1'); await p.waitForTimeout(100);
  ok('untick a coach → Import 1', (await p.textContent('#jimp-run')) === 'Import 1');
  await p.screenshot({ path: 'test/shots/fedjudges-preview.png' });
  await p.click('#jimp-run'); await p.waitForTimeout(600);
  let js = await judges(); const anna = js.find(j => /Kulczy/.test(j.name));
  ok('only the ticked judge imported', js.length === n0 + 1 && !!anna && !js.some(j => /Sajdutka/.test(j.name)));
  ok('country, federation, rank in notes, level not set', anna && anna.country === 'Poland' && anna.dojo === 'Polish Traditional Karate Union' && /Rank 6 dan/.test(anna.notes) && !anna.kataLevel && !anna.kumiteLevel);
  ok('Judges tab shows Kata L– / Kumite L– (not qualified yet)', /Kata L–/.test(await p.textContent('#main')));
  // judge form: level "Not set" instead of silently Level 1
  await p.evaluate(id => { const b = document.querySelector(`[data-act="judge-edit"][data-id="${id}"]`); if (b) b.click(); }, anna.id); await p.waitForTimeout(200);
  if (await p.$('#j-kataLevel')) { ok('edit form shows “Not set”', /Not set/.test(await p.$eval('#j-kataLevel', s => s.options[s.selectedIndex].text))); await p.selectOption('#j-kataLevel', '5'); await p.selectOption('#j-kumiteLevel', '4'); await p.click('button[type="submit"][form="f-judge"]'); await p.waitForTimeout(400); }
  else console.log('  (no judge-edit button found; set levels directly)'), await p.evaluate(() => {});
  // the corrected (Windows-1250) sheet: same person, name fixed, levels kept
  pv = await open('test/fixtures/wtkf-federation-cp1250.csv');
  js = await judges();
  ok('preview says the name will be corrected', /name corrected from “Anna Kulczy\?ska”/.test(pv));
  await p.click('#jimp-run'); await p.waitForTimeout(600);
  const js2 = await judges(), anna2 = js2.find(j => j.id === anna.id);
  ok('re-import: no duplicate, Sajdutka added', js2.length === n0 + 2);
  console.log('   anna after:', JSON.stringify(anna2));
  ok('name corrected to Anna Kulczyńska', anna2 && anna2.name === 'Anna Kulczyńska');
  ok('levels set by the director are kept on re-import', anna2 && (+anna2.kataLevel === 5 || !(await p.$('#j-kataLevel'))));
  // competitor import still reads athletes from the same file
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
