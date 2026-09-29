const KT = require('../src/logic.js');
const assert = require('assert');
let pass = 0, fail = 0;
function t(name, fn) { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '\n  ', e.message); } }
function rng(seed) { let s = seed; return () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; }; }
const ents = (n, dojoFn) => Array.from({ length: n }, (_, i) => ({ id: 'c' + (i + 1), dojo: dojoFn ? dojoFn(i) : 'D' + i }));

// play every ready match; winner chosen by fn (default lower id number = stronger)
function playAll(br, pick) {
  const strength = id => -parseInt(id.slice(1));
  for (let guard = 0; guard < 500; guard++) {
    const res = KT.resolve(br);
    const ready = KT.readyMatches(br, res);
    if (!ready.length) return res;
    const m = ready[0], r = res[m.id];
    const w = pick ? pick(r.a, r.b, m) : (strength(r.a) > strength(r.b) ? r.a : r.b);
    br.results[m.id] = { winnerId: w, method: 'test', pts: { a: w === r.a ? 8 : 0, b: w === r.b ? 8 : 0 } };
  }
  throw new Error('did not terminate');
}

t('age', () => {
  assert.equal(KT.ageOn('2005-10-01', '2026-09-30'), 20);
  assert.equal(KT.ageOn('2005-09-30', '2026-09-30'), 21);
});
t('seedOrder', () => {
  assert.deepEqual(KT.seedOrder(4), [1, 4, 2, 3]);
  assert.deepEqual(KT.seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]);
});
t('black belt divisions', () => {
  const d = KT.blackBeltDivisions(['IKATA', 'TKATA']);
  assert.equal(d.length, 2 * 4 + 3 * 4);
  assert.ok(d.some(x => x.name === 'Black Belt Senior Men Individual Kata'));
  assert.ok(d.some(x => x.name === 'Black Belt Cadet Mixed Team Kata'));
});
t('candidate division by age & rank', () => {
  const divs = KT.blackBeltDivisions(['IKATA']).map((d, i) => Object.assign(d, { id: 'd' + i }));
  divs.push(...KT.kyuDivisions({ label: 'Adult', minRank: 'k5', maxRank: 'k1', minAge: 18, maxAge: null }, ['IKATA']).map((d, i) => Object.assign(d, { id: 'k' + i })));
  const asOf = '2026-10-10';
  const c1 = { dob: '2008-01-01', gender: 'M', rank: 'd1' }; // 18 → Junior
  assert.equal(KT.candidateDivisions(c1, 'IKATA', divs, asOf)[0].group, 'Junior');
  const c2 = { dob: '1990-01-01', gender: 'F', rank: 'd3' };
  assert.equal(KT.candidateDivisions(c2, 'IKATA', divs, asOf)[0].group, 'Senior');
  const c3 = { dob: '1990-01-01', gender: 'F', rank: 'k3' };
  assert.equal(KT.candidateDivisions(c3, 'IKATA', divs, asOf)[0].group, 'Adult');
  const c4 = { dob: '2015-01-01', gender: 'F', rank: 'd1' }; // 11 black belt → none
  assert.equal(KT.candidateDivisions(c4, 'IKATA', divs, asOf).length, 0);
  const c5 = { dob: '1990-01-01', gender: 'F', rank: 'k8' }; // below k5
  assert.equal(KT.candidateDivisions(c5, 'IKATA', divs, asOf).length, 0);
});
t('assignEntrants with override and teams', () => {
  const divs = KT.blackBeltDivisions(['IKATA', 'TKATA']).map((d, i) => Object.assign(d, { id: 'd' + i }));
  const comps = [
    { id: 'a', dob: '1990-01-01', gender: 'M', rank: 'd2', events: ['IKATA', 'TKATA'] },
    { id: 'b', dob: '1991-01-01', gender: 'F', rank: 'd2', events: ['IKATA'] },
    { id: 'c', dob: '1992-01-01', gender: 'M', rank: 'd2', events: ['IKATA'], divOverride: { IKATA: 'd1' } },
  ];
  const teams = [{ id: 't1', eventType: 'TKATA', memberIds: ['a', 'b', 'c'] }];
  const { byDiv, unplaced } = KT.assignEntrants(comps, teams, divs, '2026-10-10');
  const senM = divs.find(d => d.eventType === 'IKATA' && d.gender === 'M' && d.group === 'Senior').id;
  assert.deepEqual(byDiv[senM], ['a']);
  assert.deepEqual(byDiv.d1, ['c']);
  const mixed = divs.find(d => d.eventType === 'TKATA' && d.gender === 'X' && d.group === 'Senior').id;
  assert.deepEqual(byDiv[mixed], ['t1']);
  assert.equal(unplaced.length, 0);
});

for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 13, 16, 17, 32]) {
  t('SE n=' + n, () => {
    const br = KT.generateBracket({ id: 'x', format: 'SE', bronze: 'two' }, ents(n), rng(n));
    const res = playAll(br);
    const pl = KT.placings(br, res);
    assert.ok(pl.complete, 'complete');
    assert.equal(pl.gold, 'c1');
    if (n >= 2) assert.equal(pl.silver && pl.silver !== 'c1', true);
    if (n >= 4) assert.equal(pl.bronze.length, 2);
    if (n === 3) assert.equal(pl.bronze.length, 1);
    const fights = Object.values(res).filter(r => r.status === 'done').length;
    assert.equal(fights, Math.max(0, n - 1));
  });
  t('SE bronze match n=' + n, () => {
    const br = KT.generateBracket({ id: 'x', format: 'SE', bronze: 'match' }, ents(n), rng(n + 7));
    const res = playAll(br); const pl = KT.placings(br, res);
    assert.ok(pl.complete); assert.equal(pl.gold, 'c1');
    if (n >= 4) { assert.equal(pl.bronze.length, 1); assert.ok(pl.fourth); }
  });
  t('DE n=' + n, () => {
    const br = KT.generateBracket({ id: 'x', format: 'DE', reset: true }, ents(n).map((e, i) => Object.assign(e, { seed: i + 1 })), rng(n + 3));
    const res = playAll(br); const pl = KT.placings(br, res);
    assert.ok(pl.complete, 'complete');
    assert.equal(pl.gold, 'c1');
    if (n >= 2) assert.equal(pl.silver, 'c2', 'silver should be 2nd strongest in DE, got ' + pl.silver);
    if (n >= 3) assert.equal(pl.bronze[0], 'c3', 'bronze should be c3, got ' + pl.bronze);
    // each entrant (except champion) loses exactly twice? champion undefeated -> losses <=1 for silver in no-reset path
    const losses = {};
    for (const r of Object.values(res)) if (r.status === 'done') losses[r.loser] = (losses[r.loser] || 0) + 1;
    for (let i = 3; i <= n; i++) assert.ok(losses['c' + i] === 2 || n < 3, 'c' + i + ' losses ' + losses['c' + i]);
  });
  t('DE reset path n=' + n, () => {
    if (n < 2) return;
    // LB side wins grand final once to force reset: pick b in GF
    const br = KT.generateBracket({ id: 'x', format: 'DE', reset: true }, ents(n), rng(n + 5));
    const strength = id => -parseInt(id.slice(1));
    const res = playAll(br, (a, b, m) => m.id === 'GF' ? b : (strength(a) > strength(b) ? a : b));
    const pl = KT.placings(br, res);
    assert.ok(pl.complete); assert.equal(res.GF2.status, 'done'); assert.equal(pl.gold, 'c1');
  });
  t('RR n=' + n, () => {
    const br = KT.generateBracket({ id: 'x', format: 'RR', bronze: 'two' }, ents(n), rng(n + 11));
    if (n >= 2) for (const P of Object.keys(br.pools)) assert.ok(br.pools[P].length <= 4 && br.pools[P].length >= 2, 'pool size');
    const res = playAll(br); const pl = KT.placings(br, res);
    assert.ok(pl.complete, 'complete'); assert.equal(pl.gold, 'c1');
    if (n >= 2 && n <= 4) assert.equal(pl.silver, 'c2');
  });
}
t('RR standings ordering & h2h', () => {
  const br = KT.generateBracket({ id: 'x', format: 'RR' }, ents(4), rng(1));
  const res = playAll(br);
  const P = Object.keys(br.pools)[0];
  const st = KT.standings(br, P, id => res[id]);
  assert.deepEqual(st.rows.map(r => r.id), ['c1', 'c2', 'c3', 'c4']);
  assert.deepEqual(st.rows.map(r => r.w), [3, 2, 1, 0]);
});
t('RR 3-way tie flagged, tiebreak resolves', () => {
  const br = KT.generateBracket({ id: 'x', format: 'RR' }, ents(3), rng(2));
  // cycle: c1>c2, c2>c3, c3>c1 with equal points
  const beats = { c1: 'c2', c2: 'c3', c3: 'c1' };
  const res = playAll(br, (a, b) => beats[a] === b ? a : b);
  let pl = KT.placings(br, res);
  assert.ok(pl.tie && !pl.complete);
  br.tiebreak = { A: ['c3', 'c1', 'c2'] };
  pl = KT.placings(br);
  assert.ok(pl.complete); assert.equal(pl.gold, 'c3');
});
t('dojo spread in SE first round', () => {
  const e = ents(8, i => i < 4 ? 'Same' : 'D' + i);
  const br = KT.generateBracket({ id: 'x', format: 'SE' }, e, rng(9));
  const dojo = Object.fromEntries(e.map(x => [x.id, x.dojo]));
  const res = KT.resolve(br);
  for (let i = 0; i < 4; i++) { const r = res['W1-' + i]; assert.notEqual(dojo[r.a], dojo[r.b], 'same dojo pair'); }
});
t('canEdit blocks after downstream', () => {
  const br = KT.generateBracket({ id: 'x', format: 'SE' }, ents(4), rng(3));
  let res = KT.resolve(br);
  br.results['W1-0'] = { winnerId: res['W1-0'].a }; br.results['W1-1'] = { winnerId: res['W1-1'].a };
  assert.ok(KT.canEdit(br, 'W1-0'));
  res = KT.resolve(br); br.results['W2-0'] = { winnerId: res['W2-0'].a };
  assert.ok(!KT.canEdit(br, 'W1-0'));
});
t('kumite ippon / awasete / points / kettei / hantei', () => {
  assert.equal(KT.kumiteEval([{ s: 'a', t: 'ippon' }]).method, 'Ippon');
  const r2 = KT.kumiteEval([{ s: 'b', t: 'waza' }, { s: 'a', t: 'waza' }, { s: 'b', t: 'waza' }]);
  assert.equal(r2.winner, 'b'); assert.equal(r2.method, 'Awasete Ippon');
  const r3 = KT.kumiteEval([{ s: 'a', t: 'waza' }, { s: 'a', t: 'keikoku' }, { t: 'timeup' }]);
  assert.equal(r3.winner, 'a'); assert.deepEqual(r3.score, { a: 4, b: 2 });
  const r4 = KT.kumiteEval([{ s: 'a', t: 'keikoku' }, { s: 'b', t: 'keikoku' }, { t: 'timeup' }]);
  assert.equal(r4.phase, 'kettei');
  const r5 = KT.kumiteEval([{ t: 'timeup' }, { s: 'b', t: 'waza' }]);
  assert.equal(r5.winner, 'b'); assert.equal(r5.method, 'Kettei-sen');
  const r6 = KT.kumiteEval([{ t: 'timeup' }, { t: 'ketteiend' }]);
  assert.equal(r6.phase, 'hantei');
  const r7 = KT.kumiteEval([{ t: 'timeup' }, { t: 'ketteiend' }, { s: 'a', t: 'hantei' }]);
  assert.equal(r7.winner, 'a');
  assert.equal(KT.kumiteEval([{ s: 'a', t: 'hansoku' }]).winner, 'b');
  assert.equal(KT.kumiteEval([{ s: 'b', t: 'chui' }, { s: 'b', t: 'chui' }]).winner, null); // penalties alone don't end bout
  assert.equal(KT.kumiteEval([{ t: 'timeup' }], { allowDraw: true }).method, 'Hikiwake (draw)');
});
t('flags & scores', () => {
  assert.equal(KT.flagsEval(3, 5).winner, 'a');
  assert.equal(KT.flagsEval(1, 3).winner, 'b');
  assert.equal(KT.flagsEval(6, 5).done, false);
  const s = KT.scoreTotal([7.5, 8, 8.5, 9, 6], 5);
  assert.equal(s.total, 24);
  assert.equal(KT.scoresEval([8, 8, 8, 8, 8], [8, 8, 8, 8, 7.9], 5).winner, 'a'); // equal total, all-sum decides
  const tie = KT.scoresEval([8, 8, 8], [8, 8, 8], 3);
  assert.ok(tie.tie && !tie.done);
  assert.equal(KT.scoresEval([8, 8, 8], [8, 8, 8], 3, 1).winner, 'b');
});
t('team kumite', () => {
  const win = s => ({ log: [{ s, t: 'ippon' }] });
  let r = KT.teamKumiteEval([win('a'), win('a')], 3);
  assert.ok(r.done); assert.equal(r.winner, 'a');
  r = KT.teamKumiteEval([win('a'), win('b'), { log: [{ t: 'timeup' }] }], 3);
  assert.ok(!r.done && r.needDaihyo);
  r = KT.teamKumiteEval([win('a'), win('b'), { log: [{ t: 'timeup' }] }], 3, win('b'));
  assert.equal(r.winner, 'b');
  r = KT.teamKumiteEval([win('a'), { log: [{ s: 'b', t: 'waza' }, { t: 'timeup' }] }, { log: [{ t: 'timeup' }] }], 3);
  assert.equal(r.winner, 'a'); // 1-1 bouts, points 8 vs 4 decide
});
t('fukugo', () => {
  assert.equal(KT.fukugoEval(4, 5, [{ s: 'a', t: 'ippon' }]).winner, 'a');
  const s = KT.fukugoEval(4, 5, [{ s: 'b', t: 'ippon' }]);
  assert.ok(s.split && !s.done);
  assert.equal(KT.fukugoEval(4, 5, [{ s: 'b', t: 'ippon' }], 'b').winner, 'b');
});
t('validate competitor', () => {
  assert.equal(KT.validateCompetitor({ firstName: 'A', lastName: 'B', gender: 'M', dob: '1990-01-01', rank: 'd1', dojo: 'X', emergencyName: 'Y', emergencyPhone: '1', waiver: true }, '2026-01-01').length, 0);
  assert.ok(KT.validateCompetitor({}, '2026-01-01').length >= 6);
});
t('medal table & csv', () => {
  const m = KT.medalTable([{ dojo: 'A', place: 'gold' }, { dojo: 'B', place: 'silver' }, { dojo: 'B', place: 'gold' }, { dojo: 'B', place: 'bronze' }]);
  assert.equal(m[0].dojo, 'B');
  assert.equal(KT.toCSV([['a,b', 'c"d']]), '"a,b","c""d"');
});
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
