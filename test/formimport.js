// v1.59.0: import a Google / Numbers form export — DOB as M/D/YY, "Kata, Kumite", a Team Kata question column, waiver paragraph heading + "I agree"
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p.on('pageerror', e => errors.push(e.message));
  await p.route(/fonts\./, r => r.abort());
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.click('button:has-text("Create demo tournament") >> nth=0'); await p.click('button[data-kind="local"]'); await p.waitForSelector('text=Director checklist', { timeout: 60000 });
  const db = () => p.evaluate(() => JSON.parse(localStorage.getItem('kt-local-v1') || '{}'));
  const evId = Object.keys(await db()).find(k => /^events\/[^/]+$/.test(k)).split('/')[1];
  const comps = async () => { const d = await db(); return Object.entries(d).filter(([k]) => k.startsWith(`events/${evId}/competitors/`)).map(([k, v]) => Object.assign({}, v, d[`pv/${evId}/competitors/${k.split('/').pop()}`] || {})); };
  // the form's columns, with made-up people (same shapes as the Oct 31 UMN form responses)
  const waiverHead = '"Waiver\nBy filling out this form and in consideration of being allowed to participate in any way in the program, the undersigned acknowledges, appreciates, and agrees that:\n1. The risk of injury … is significant; and,\n2. I KNOWINGLY AND FREELY ASSUME ALL SUCH RISKS"';
  const csv = [
    `Timestamp,First Name,Last Name,Gender,Phone,Emergency Phone,DOB,Dojo,Email,Rank,Events,"Team Kata (Name, Member’s Names) (leave blank if not competing)","Kitei Kata (open ranks, single elimination)",${waiverHead}`,
    '10/20/2026 9:01:02,Ada,Testowa,Woman,555-0101,555-0201,5/12/06,Test Academy,ada@x.test,5th kyu (Purple),Kata,,,I agree',
    '10/20/2026 9:02:02,Bruno,Testik,Man,555-0102,555-0202,11/24/07,Test Academy,bruno@x.test,2nd kyu (Brown),"Kata, Kumite","Empinada backup; Brian, Thi, Isaac","Yes, I want to  have fun",I agree',
    '10/20/2026 9:03:02,Cleo,Testino,Woman ,555-0103,555-0203,9/3/87,Test Academy,cleo@x.test,Shodan,"Kata, Kumite",,,I agree.',
    '10/20/2026 9:04:02,Dan,Testson,Man,555-0104,555-0204,1/25/08,Test Academy,dan@x.test,White belt,Kata,,"Yes, I want to  have fun",',
  ].join('\n');
  const n0 = (await comps()).length;
  await p.click('.tab:has-text("Competitors")'); await p.click('button:has-text("Import CSV")');
  await p.fill('#imp-text', csv); await p.click('button[data-act="imp-preview"]'); await p.waitForTimeout(300);
  const t = (await p.textContent('#imp-preview')).replace(/\s+/g, ' ');
  console.log('  ', t.slice(0, 600));
  ok('columns found include Waiver (paragraph heading), Events and Team Kata (question heading)', /Waiver ← Waiver By filling out this form and in…/.test(t) && /Events/.test(t) && /Team Kata ← Team Kata \(Name/.test(t));
  ok('Kitei Kata column read as the Ki-tei Kata event (v1.60); Timestamp not used', /Ki-tei Kata ← Kitei Kata/.test(t) && /Not used.*Timestamp/.test(t) && !/Not used.*Kitei/.test(t));
  ok('dates read month-day-year (11/24/07 can only be month first)', /month-day-year|month first|MM/i.test(t));
  await p.click('button[data-act="imp-run"]'); await p.waitForTimeout(1500);
  const cs = (await comps()).filter(c => /^Test/.test(c.lastName)), by = Object.fromEntries(cs.map(c => [c.firstName, c]));
  ok(`4 imported (${cs.length})`, cs.length === 4 && (await comps()).length === n0 + 4);
  ok(`DOB M/D/YY → full dates (${['Ada', 'Bruno', 'Cleo', 'Dan'].map(n => by[n] && by[n].dob).join(', ')})`, by.Ada.dob === '2006-05-12' && by.Bruno.dob === '2007-11-24' && by.Cleo.dob === '1987-09-03' && by.Dan.dob === '2008-01-25');
  ok('individual events from "Kata, Kumite"', JSON.stringify(by.Ada.events) === '["IKATA"]' && by.Cleo.events.includes('IKATA') && by.Cleo.events.includes('IKUMITE'));
  ok('team event from the Team Kata column (Bruno only)', by.Bruno.events.includes('TKATA') && !by.Ada.events.includes('TKATA') && !by.Cleo.events.includes('TKATA'));
  ok('the team details kept in the director\'s notes', by.Bruno.notes === 'Team Kata: Empinada backup; Brian, Thi, Isaac' && !by.Ada.notes);
  ok('waiver "I agree" / "I agree." → signed; empty → not signed', by.Ada.waiver === true && by.Cleo.waiver === true && by.Dan.waiver === false);
  ok('Ki-tei Kata from "Yes, I want to  have fun" (Bruno, Dan only)', by.Bruno.events.includes('KITEI') && by.Dan.events.includes('KITEI') && !by.Ada.events.includes('KITEI') && !by.Cleo.events.includes('KITEI'));
  const offered = await p.evaluate(() => { const db = JSON.parse(localStorage.getItem('kt-local-v1') || '{}'); const k = Object.keys(db).find(x => /^events\/[^/]+$/.test(x) && db[x].demo); return db[k].eventTypes; });
  ok(`the import turned Ki-tei Kata on for the event (${offered.join(',')})`, offered.includes('KITEI'));
  await p.click('.tab:has-text("Divisions")'); await p.waitForTimeout(300);
  await p.click('button[data-act="div-kitei"]'); await p.waitForTimeout(800);
  const kdiv = await p.$$eval('#main tr button[data-act="div-panel"]', b => b.map(x => x.textContent.trim()).filter(t => /Ki-tei/.test(t)));
  ok(`Add Ki-tei divisions: ${kdiv.join(', ')}`, kdiv.includes('Open Rank Women Ki-tei Kata') && kdiv.includes('Open Rank Men Ki-tei Kata') && !(await p.$('button[data-act="div-kitei"]')));
  await p.click('.tab:has-text("Competitors")'); await p.waitForTimeout(300);
  const rows = await p.$$eval('#main tr[data-act="comp-edit"]', rs => rs.map(r => r.textContent.replace(/\s+/g, ' ')));
  ok('Bruno (2nd kyu) and Dan (white belt) placed in Open Rank Men Ki-tei Kata', rows.filter(r => /Testik|Testson/.test(r)).every(r => /Open Rank Men Ki-tei Kata/.test(r)));
  ok('gender Woman / Man (with a trailing space) and ranks read', by.Cleo.gender === 'F' && by.Bruno.gender === 'M' && by.Ada.rank === 'k5' && by.Cleo.rank === 'd1' && by.Dan.rank === 'k10');
  // v1.59.1: records left without a birth date by an earlier import (as v1.58 left them) are updated by a re-import, not duplicated
  {
    const p2 = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage(); p2.on('pageerror', e => errors.push(e.message)); await p2.route(/fonts\./, r => r.abort());
    await p2.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
    await p2.click('button.primary[data-act="event-new"]'); await p2.waitForTimeout(300);
    await p2.fill('#f-event input[name="name"]', 'Re-import'); await p2.fill('#f-event input[name="startDate"]', '2026-10-31');
    await p2.click('#modal button[type="submit"]'); await p2.waitForTimeout(800);
    await p2.click('.tab:has-text("Divisions")'); await p2.waitForTimeout(300); await p2.click('button[data-act="div-ncr"]'); await p2.waitForTimeout(400);
    await p2.click('#modal button[type="submit"]'); await p2.waitForTimeout(1500); await p2.click('#modal button[data-act="modal-close"]').catch(() => {});
    const imp = async text => { await p2.click('.tab:has-text("Competitors")'); await p2.click('button:has-text("Import CSV")'); await p2.fill('#imp-text', text);
      await p2.click('button[data-act="imp-preview"]'); await p2.waitForTimeout(400); const t = (await p2.textContent('#imp-preview')).replace(/\s+/g, ' ');
      await p2.click('button[data-act="imp-run"]'); await p2.waitForTimeout(1500); return t; };
    // the first import as v1.58 read it: no birth dates, "Kata, Kumite" not understood → Cynthia-like kata only, Elle-like no events
    await imp(['First Name,Last Name,Gender,Rank,Dojo,Events', 'Cyn,Testa,Woman,5th kyu (Purple),Test Academy,Kata', 'Ell,Testb,Woman,White belt,Test Academy,'].join('\n'));
    const all = () => p2.evaluate(() => { const db = JSON.parse(localStorage.getItem('kt-local-v1') || '{}'); return Object.entries(db).filter(([k, v]) => /^events\/[^/]+\/competitors\//.test(k) && /^Test/.test(v.lastName))
      .map(([k, v]) => Object.assign({ id: k.split('/').pop() }, v, Object.values(db).find(x => x && x.dob !== undefined && false) || {}, db[k.replace(/^events\/([^/]+)\/competitors\//, 'pv/$1/competitors/')] || {})); });
    let a = await all();
    ok('first import: no birth dates, Ell without events', a.length === 2 && a.every(c => !c.dob) && a.find(c => c.firstName === 'Ell').events.length === 0);
    let rows = await p2.$$eval('#main tr[data-act="comp-edit"]', rs => rs.map(r => r.textContent.replace(/\s+/g, ' ')));
    ok('so Cyn shows "Kata · no division"', rows.some(r => /Cyn/.test(r) && /Kata · no division/.test(r)));
    // re-import the full form export (v1.59.1)
    const t = await imp(['First Name,Last Name,Gender,DOB,Dojo,Rank,Events,"Kitei Kata (open ranks, single elimination)",Waiver', 'Cyn,Testa,Woman,5/12/06,Test Academy,5th kyu (Purple),Kata,,I agree', 'Ell,Testb,Woman,1/25/08,Test Academy,White belt,"Kata, Kumite","Yes, I want to  have fun",I agree'].join('\n'));
    ok('preview: 2 already registered without a birth date will be updated (+Kata, Kumite for Ell)', /2 competitors already registered without a birth date will be updated/.test(t) && /Ell Testb \+Kata, Kumite, Ki-tei/.test(t));
    a = await all();
    const cyn = a.find(c => c.firstName === 'Cyn'), ell = a.find(c => c.firstName === 'Ell');
    ok(`no duplicates (${a.length}); birth dates and waivers filled in`, a.length === 2 && cyn.dob === '2006-05-12' && ell.dob === '2008-01-25' && cyn.waiver && ell.waiver && cyn.age === 20 && ell.age === 18);
    ok('Ell now has Kata, Kumite and Ki-tei Kata', ell.events.includes('IKATA') && ell.events.includes('IKUMITE') && ell.events.includes('KITEI'));
    rows = await p2.$$eval('#main tr[data-act="comp-edit"]', rs => rs.map(r => r.textContent.replace(/\s+/g, ' ')));
    ok('both now placed: Cyn in Level 3 Adult Women Kata, Ell in Level 1 Adult Women Kata and Kumite', rows.some(r => /Cyn/.test(r) && /Level 3 Adult Women Individual Kata/.test(r)) && rows.some(r => /Ell/.test(r) && /Level 1 Adult Women Individual Kata/.test(r) && /Level 1 Adult Women Individual Kumite/.test(r)));
    // a third import of the same file: now really already registered → skipped
    const t3 = await imp(['First Name,Last Name,Gender,DOB,Dojo,Rank,Events,Waiver', 'Cyn,Testa,Woman,5/12/06,Test Academy,5th kyu (Purple),Kata,I agree', 'Ell,Testb,Woman,1/25/08,Test Academy,White belt,"Kata, Kumite",I agree'].join('\n')).catch(() => '');   // 1/25/08 decides month-first
    ok('importing again: both already registered — skipped, no duplicates', /already registered — skipped/.test(t3) && (await all()).length === 2);
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
