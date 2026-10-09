// v1.10.0: import judges & credentials (CSV / TSV paste), update existing, warnings, ring assignment, copy from another event
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\./, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  await p.click('.bar button.brand');
  await p.click('button:has-text("Create demo tournament") >> nth=0'); await p.click('button[data-kind="international"]'); await p.waitForSelector('text=Director checklist', { timeout: 90000 });
  await p.click('.tab:has-text("Judges")'); await p.waitForTimeout(200);
  const before = await p.$$eval('.jrow2', x => x.length);
  await p.click('button[data-act="judge-import"]'); await p.waitForTimeout(150);
  const csv = ['Name,Country,Kata Level,Kumite Level,Ring,Notes',
    'Haruki Sato,Japan,7,7,Ring 3,promoted',          // existing → update
    'Ama Owusu,Ghana,L5,Level 4,Ring 2,',             // new, credential formats
    'Low Level,Kenya,2,2,,',                          // below level 3 → warning
    'No Country,,4,4,Ring 9,',                         // no country + unknown ring → warnings
    ',Peru,5,5,,',                                     // missing name → skipped
    'Bad Level,Chile,,,,'].join('\n');                 // no credentials → skipped
  await p.fill('#jimp-text', csv); await p.waitForTimeout(400);
  const prev = await p.textContent('#jimp-preview');
  ok('preview counts new / updates / skipped', /3 new judges/.test(prev) && /1 update/.test(prev) && /2 rows skipped/.test(prev));
  ok('below-level warning for International', /below level 3 for International/.test(prev));
  ok('missing country and unknown ring flagged', /no country/.test(prev) && /ring “Ring 9” not found/.test(prev));
  ok('“L5” / “Level 4” parsed', await p.$eval('#jimp-preview table', t => [...t.querySelectorAll('tr')].some(r => /Ama Owusu/.test(r.textContent) && /\b5\b/.test(r.cells[3].textContent) && /\b4\b/.test(r.cells[4].textContent))));
  await p.screenshot({ path: 'test/shots/judge-import.png' });
  await p.click('#jimp-run'); await p.waitForTimeout(600);
  const after = await p.$$eval('.jrow2', x => x.length);
  ok('3 judges added (Haruki updated, not duplicated)', after === before + 3);
  ok('Haruki Sato updated to level 7 and moved to Ring 3', await p.$eval('.card:has(h3:text("Ring 3"))', c => /Haruki Sato/.test(c.textContent) && /Kata L7/.test(c.textContent)));
  ok('Ama Owusu assigned to Ring 2', await p.$eval('.card:has(h3:text("Ring 2"))', c => /Ama Owusu/.test(c.textContent)));
  // TSV paste (copied from a spreadsheet) with a single level column
  await p.click('button[data-act="judge-import"]'); await p.fill('#jimp-text', 'name\tcountry\tlevel\nTab Person\tNorway\t6'); await p.waitForTimeout(400);
  ok('tab-separated paste with single level column', /1 new judge/.test(await p.textContent('#jimp-preview')));
  await p.click('#jimp-run'); await p.waitForTimeout(400);
  ok('single level applies to kata and kumite', await p.$eval('.card:has(h3:text("Unassigned"))', c => /Tab Person/.test(c.textContent) && /Kata L6/.test(c.textContent) && /Kumite L6/.test(c.textContent)));
  // copy from the other (local) event
  await p.click('button[data-act="judge-import"]'); await p.click('details:has-text("copy the judges pool") summary'); await p.click('button[data-act="jimp-copy"]'); await p.waitForTimeout(500);
  ok('copy from another event loads its judges for review', /new judge|update/.test(await p.textContent('#jimp-preview')) && (await p.$eval('#jimp-text', t => t.value.split('\n').length)) > 5);
  await p.click('button[data-act="modal-close"] >> nth=0');
  ok('export button present', !!(await p.$('button[data-act="judge-export"]')));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
