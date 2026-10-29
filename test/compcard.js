// v1.54.0: competitor card shows the team (and division) and the division actually assigned; export has a column per event with the assignment
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ viewport: { width: 390, height: 900 }, acceptDownloads: true }); await ctx.route(/fonts\./, r => r.abort());
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
  const W = t => p.waitForTimeout(t || 150);
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament")'); await p.click('button[data-kind="national"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  await p.click('.bn:has-text("More")'); await W(250); await p.click('#modal .menu-item[data-v="competitors"]'); await W(400);
  await p.selectOption('#comp-s', 'name'); await W(250);
  // a competitor on a Team Kata team (senior women)
  const row = await p.$('#main tr[data-act="comp-edit"]:has(.ev-div:text-matches("^Senior Women [A-Z] · "))');
  ok('found a competitor on a team', !!row);
  const listTeam = await row.$eval('.ev-div:text-matches("^Senior Women")', x => x.textContent.trim());
  await row.click(); await W(400);
  const teamBtn = await p.$('#f-comp button.assigned[data-act="team-edit"]');
  const t = teamBtn ? (await teamBtn.textContent()).replace('›', '').trim() : '';
  ok(`card shows the team and its division (${t})`, t === listTeam);
  const ins = await p.$$eval('#f-comp .assigned-line', x => x.map(y => y.textContent.trim()));
  ok(`card shows the division each individual event is in (${ins.join(' | ')})`, ins.length >= 2 && ins.every(s => /^In: (Black Belt|Kyu) .*Individual (Kata|Kumite)$/.test(s)));
  await teamBtn.click(); await W(350);
  ok('tapping the team opens the team', !!(await p.$('#f-team')) && (await p.$eval('#t-name', i => i.value)) === listTeam.split(' · ')[0]);
  await p.click('#modal button[data-act="modal-close"] >> nth=0'); await W();
  // a competitor entered in team kata but on no team
  const lone = await p.$('#main tr[data-act="comp-edit"]:has(.ev-div:text("Team Kata · no team yet"))');
  if (lone) { await lone.click(); await W(350); ok('card says "Not on a team yet"', /Not on a team yet/.test(await p.textContent('#f-comp'))); await p.click('#modal button[data-act="modal-close"] >> nth=0'); await W(); }
  ok('card fits the phone', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  // export
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('button[data-act="export-comps"]')]);
  const csv = require('fs').readFileSync(await dl.path(), 'utf8').replace(/^﻿/, '');
  const lines = csv.split(/\r?\n/), head = lines[0].split(',');
  ok(`export keeps "events" and adds a column per event (${head.slice(17).join(' | ')})`, head[17] === 'events' && head.includes('Individual Kata') && head.includes('Team Kata') && head.includes('Individual Kumite'));
  const ik = head.indexOf('Individual Kata'), tk = head.indexOf('Team Kata');
  ok('export: individual kata column has the division name', lines.slice(1).some(l => /Black Belt (Senior|Youth|Junior|Cadet) (Men|Women) Individual Kata/.test(l)));
  ok('export: team kata column has "team · division"', /Senior Women [A-Z] · Black Belt Senior Women Team Kata/.test(csv));
  ok('export: the events column still uses event names (re-import)', /Individual Kata; Individual Kumite/.test(csv));
  void ik; void tk;
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
