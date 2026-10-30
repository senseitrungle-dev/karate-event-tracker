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
  ok('Kitei Kata and Timestamp are shown as not used', /Not used.*Kitei Kata/.test(t) && /Not used.*Timestamp/.test(t));
  ok('dates read month-day-year (11/24/07 can only be month first)', /month-day-year|month first|MM/i.test(t));
  await p.click('button[data-act="imp-run"]'); await p.waitForTimeout(1500);
  const cs = (await comps()).filter(c => /^Test/.test(c.lastName)), by = Object.fromEntries(cs.map(c => [c.firstName, c]));
  ok(`4 imported (${cs.length})`, cs.length === 4 && (await comps()).length === n0 + 4);
  ok(`DOB M/D/YY → full dates (${['Ada', 'Bruno', 'Cleo', 'Dan'].map(n => by[n] && by[n].dob).join(', ')})`, by.Ada.dob === '2006-05-12' && by.Bruno.dob === '2007-11-24' && by.Cleo.dob === '1987-09-03' && by.Dan.dob === '2008-01-25');
  ok('individual events from "Kata, Kumite"', JSON.stringify(by.Ada.events) === '["IKATA"]' && by.Cleo.events.includes('IKATA') && by.Cleo.events.includes('IKUMITE'));
  ok('team event from the Team Kata column (Bruno only)', by.Bruno.events.includes('TKATA') && !by.Ada.events.includes('TKATA') && !by.Cleo.events.includes('TKATA'));
  ok('the team details kept in the director\'s notes', by.Bruno.notes === 'Team Kata: Empinada backup; Brian, Thi, Isaac' && !by.Ada.notes);
  ok('waiver "I agree" / "I agree." → signed; empty → not signed', by.Ada.waiver === true && by.Cleo.waiver === true && by.Dan.waiver === false);
  ok('gender Woman / Man (with a trailing space) and ranks read', by.Cleo.gender === 'F' && by.Bruno.gender === 'M' && by.Ada.rank === 'k5' && by.Cleo.rank === 'd1' && by.Dan.rank === 'k10');
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
