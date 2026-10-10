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
  for (const fmt of ['DE', 'DES']) t(fmt + ' n=' + n, () => {
    const br = KT.generateBracket({ id: 'x', format: fmt }, ents(n).map((e, i) => Object.assign(e, { seed: i + 1 })), rng(n + 3));
    assert.ok(!br.matches.GF2 && !br.matches['EA-GF2'], 'no reset match');
    const np = n >= 2 ? Math.ceil(n / 8) : 1;
    if (np > 1) { assert.equal(Object.keys(br.pools).length, np); assert.ok(Object.values(br.pools).every(p => p.length <= 8)); }
    const res = playAll(br); const pl = KT.placings(br, res);
    assert.ok(pl.complete, 'complete');
    assert.equal(pl.gold, 'c1');
    if (np === 1 && n >= 2) assert.equal(pl.silver, 'c2', 'silver got ' + pl.silver);
    if (np === 1 && n >= 3) assert.equal(pl.bronze[0], 'c3', 'bronze got ' + pl.bronze);
    if (np === 1 && fmt === 'DES' && n >= 4) assert.equal(pl.fourth, 'c4', 'fourth got ' + pl.fourth);
    if (np === 1 && fmt === 'DE' && n >= 3) {
      const losses = {};
      for (const r of Object.values(res)) if (r.status === 'done') losses[r.loser] = (losses[r.loser] || 0) + 1;
      for (let i = 3; i <= n; i++) assert.equal(losses['c' + i], 2, 'c' + i + ' losses');
    }
    if (np > 1) { // playoff entrants = top 2 of each pool
      const po = Object.values(res).filter((r, i) => Object.keys(res)[i].startsWith('PO-W1-'));
      const inPO = new Set(po.flatMap(r => [r.a, r.b]).filter(Boolean));
      assert.equal(inPO.size, Math.min(2 * np, n));
    }
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
t('DE pools: director pool count; 2 pools → semis A1 v B2, B1 v A2', () => {
  const br = KT.generateBracket({ id: 'x', format: 'DE', poolCount: 2 }, ents(8).map((e, i) => Object.assign(e, { seed: i + 1 })), rng(2));
  assert.deepEqual(Object.keys(br.pools), ['A', 'B']);
  const po = Object.values(br.matches).filter(m => m.stage === 'PO' && m.round === 1).map(m => [m.a.p + m.a.place, m.b.p + m.b.place].join(' v '));
  assert.deepEqual(po.sort(), ['A1 v B2', 'B1 v A2'].sort());
  const res = playAll(br); const pl = KT.placings(br, res);
  assert.ok(pl.complete); assert.equal(pl.gold, 'c1'); assert.equal(pl.bronze.length, 2);
  const one = KT.generateBracket({ id: 'y', format: 'DES', poolCount: 1 }, ents(12), rng(1));
  assert.ok(!one.pools);
  const many = KT.generateBracket({ id: 'z', format: 'DE', poolCount: 9 }, ents(6), rng(1));
  assert.equal(Object.keys(many.pools).length, 3); // clamped: each pool needs 2+
});
t('DES labels: winners final = Final, repechage final = 3rd/4th', () => {
  const br = KT.generateBracket({ id: 'x', format: 'DES' }, ents(8), rng(1));
  assert.equal(KT.matchLabel(br.matches['W3-0'], br), 'Final');
  assert.equal(KT.matchLabel(br.matches['L3-0'], br), 'Repechage final (3rd/4th)');
  assert.ok(!br.matches.GF && !br.matches['L4-0']);
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
t('WTKF kumite: ippon, awase-waza, points table, kettei-sen without carry-over, hantei', () => {
  assert.equal(KT.kumiteEval([{ s: 'a', t: 'ippon' }]).method, 'Ippon');
  const r2 = KT.kumiteEval([{ s: 'b', t: 'waza' }, { s: 'a', t: 'waza' }, { s: 'b', t: 'waza' }]);
  assert.equal(r2.winner, 'b'); assert.equal(r2.method, 'Awase-waza');
  // waza 4 + opponent keikoku 2 vs 0
  const r3 = KT.kumiteEval([{ s: 'a', t: 'waza' }, { s: 'b', t: 'keikoku' }, { t: 'timeup' }]);
  assert.equal(r3.winner, 'a'); assert.deepEqual(r3.score, { a: 6, b: 0 });
  // 2nd keikoku becomes chui: 4 not 2+2+... ; jo-gai 2, 2nd jo-gai = waza-ari to opponent
  let r = KT.kumiteEval([{ s: 'b', t: 'keikoku' }, { s: 'b', t: 'keikoku' }]); assert.equal(r.cur.a, 4);
  r = KT.kumiteEval([{ s: 'b', t: 'keikoku' }, { s: 'b', t: 'keikoku' }, { s: 'b', t: 'keikoku' }]); assert.equal(r.cur.a, 6);
  r = KT.kumiteEval([{ s: 'b', t: 'jogai' }]); assert.equal(r.cur.a, 2);
  r = KT.kumiteEval([{ s: 'b', t: 'jogai' }, { s: 'b', t: 'jogai' }]); assert.equal(r.cur.a, 4);
  // jogai waza-ari + waza-ari = awase-waza
  r = KT.kumiteEval([{ s: 'b', t: 'jogai' }, { s: 'b', t: 'jogai' }, { s: 'a', t: 'waza' }]); assert.equal(r.method, 'Awase-waza'); assert.equal(r.winner, 'a');
  r = KT.kumiteEval([{ s: 'a', t: 'tento' }, { t: 'timeup' }]); assert.equal(r.winner, 'b'); assert.deepEqual(r.score, { a: 0, b: 1 });
  // second chui flags hansoku for court judges, does not end
  r = KT.kumiteEval([{ s: 'b', t: 'chui' }, { s: 'b', t: 'chui' }]); assert.ok(!r.done); assert.deepEqual(r.hansokuDue, ['b']);
  // tie → kettei-sen, scores reset; first waza-ari wins
  r = KT.kumiteEval([{ s: 'a', t: 'waza' }, { s: 'b', t: 'waza' }, { t: 'timeup' }]); assert.equal(r.phase, 'kettei'); assert.deepEqual(r.cur, { a: 0, b: 0 });
  r = KT.kumiteEval([{ t: 'timeup' }, { s: 'b', t: 'keikoku' }, { s: 'a', t: 'waza' }]); assert.equal(r.winner, 'a'); assert.equal(r.method, 'Kettei-sen · Waza-ari');
  r = KT.kumiteEval([{ t: 'timeup' }, { s: 'b', t: 'keikoku' }]); assert.ok(!r.done); // penalty points do not decide kettei-sen
  r = KT.kumiteEval([{ t: 'timeup' }, { t: 'ketteiend' }]); assert.equal(r.phase, 'hantei');
  assert.equal(KT.kumiteEval([{ t: 'timeup' }, { t: 'ketteiend' }, { s: 'a', t: 'hantei' }]).winner, 'a');
  assert.equal(KT.kumiteEval([{ s: 'a', t: 'hansoku' }]).winner, 'b');
  assert.equal(KT.kumiteEval([{ t: 'timeup' }], { allowDraw: true }).method, 'Hiki-wake');
  assert.equal(KT.kumiteEval([{ s: 'b', t: 'waza' }], { ketteiOnly: true }).winner, 'b');
});
t('Ko-go kumite: 6 exchanges, penalties 2, kettei alternating', () => {
  const nx = n => Array.from({ length: n }, () => ({ t: 'next' }));
  let r = KT.kogoEval([]); assert.equal(r.exchange, 1); assert.equal(r.offense, 'a');
  r = KT.kogoEval(nx(3)); assert.equal(r.offense, 'b');
  r = KT.kogoEval([{ s: 'a', t: 'waza' }, { s: 'a', t: 'jikan' }, ...nx(6)]); // a 4, b 2
  assert.equal(r.winner, 'a'); assert.deepEqual(r.score, { a: 4, b: 2 });
  // no score from either → Kettei-sen, same as equal scores; first Waza-ari / Ippon wins
  r = KT.kogoEval([...nx(6)]); assert.equal(r.phase, 'kettei'); assert.equal(r.offense, 'a');
  r = KT.kogoEval([...nx(6), { s: 'b', t: 'waza' }]); assert.equal(r.winner, 'b'); assert.equal(r.method, 'Kettei-sen · Waza-ari');
  r = KT.kogoEval([...nx(6), { t: 'next' }, { s: 'a', t: 'ippon' }]); assert.equal(r.winner, 'a'); assert.equal(r.method, 'Kettei-sen · Ippon');
  // points from every exchange are added together
  r = KT.kogoEval([{ s: 'a', t: 'waza' }, { t: 'next' }, { s: 'b', t: 'waza' }, { t: 'next' }, { s: 'b', t: 'waza' }, ...nx(4)]);
  assert.equal(r.winner, 'b'); assert.deepEqual(r.score, { a: 4, b: 8 });
  // tied with points → kettei-sen (alternating), first waza-ari wins; kettei total; then judges
  const tied = [{ s: 'a', t: 'waza' }, { s: 'b', t: 'waza' }, ...nx(6)];
  r = KT.kogoEval(tied); assert.equal(r.phase, 'kettei'); assert.equal(r.offense, 'a');
  r = KT.kogoEval([...tied, { t: 'next' }]); assert.equal(r.offense, 'b');
  r = KT.kogoEval([...tied, { s: 'b', t: 'waza' }]); assert.equal(r.winner, 'b');
  r = KT.kogoEval([...tied, { s: 'a', t: 'saki' }, ...nx(6)]); assert.equal(r.winner, 'b');
  r = KT.kogoEval([...tied, ...nx(6)]); assert.equal(r.phase, 'hantei');
  assert.equal(KT.kogoEval([{ s: 'a', t: 'hansoku' }]).winner, 'b');
});
t('flags & scores', () => {
  assert.equal(KT.flagsEval(3, 5).winner, 'a');
  assert.equal(KT.flagsEval(1, 3).winner, 'b');
  assert.equal(KT.flagsEval(6, 5).done, false);
  assert.equal(KT.flagsEval(3, 6).done, false);
  const s = KT.scoreTotal([7.5, 8, 8.5, 9, 6, 8], 6);
  assert.equal(s.total, 32); assert.equal(s.avg, 8);
  assert.equal(KT.scoresEval([8, 8, 8, 8, 8], [8, 8, 8, 8, 7.9], 5).winner, 'a');
  const tie = KT.scoresEval([8, 8, 8], [8, 8, 8], 3);
  assert.ok(tie.tie && !tie.done);
  assert.equal(KT.scoresEval([8, 8, 8], [8, 8, 8], 3, 'b').winner, 'b');
});
t('WTKF team kumite: total score, hansoku/kiken team, representative', () => {
  const ip = s => ({ log: [{ s, t: 'ippon' }] });
  const tu = { log: [{ t: 'timeup' }] };
  let r = KT.teamKumiteEval([ip('a'), ip('a')], 3);
  assert.ok(!r.done); // all three rounds are fought
  r = KT.teamKumiteEval([ip('a'), ip('b'), { log: [{ s: 'b', t: 'waza' }, { t: 'timeup' }] }], 3);
  assert.equal(r.winner, 'b'); assert.deepEqual(r.pts, { a: 10, b: 14 });
  r = KT.teamKumiteEval([ip('a'), ip('b'), tu], 3);
  assert.ok(r.needDaihyo && !r.done);
  r = KT.teamKumiteEval([ip('a'), ip('b'), tu], 3, { log: [{ s: 'a', t: 'waza' }] });
  assert.equal(r.winner, 'a');
  r = KT.teamKumiteEval([ip('a'), { log: [{ s: 'a', t: 'hansoku' }] }], 3);
  assert.equal(r.winner, 'b'); assert.ok(/Han-soku \(team\)/.test(r.method));
});
t('fukugo alternates kumite / ki-tei; ki-tei by 5 flags', () => {
  const br = KT.generateBracket({ id: 'x', format: 'SE', bronze: 'match' }, ents(8), rng(1));
  assert.equal(KT.fukugoPart(br.matches['W3-0'], br), 'kumite');
  assert.equal(KT.fukugoPart(br.matches['W2-0'], br), 'kitei');
  assert.equal(KT.fukugoPart(br.matches['W1-0'], br), 'kumite');
  assert.equal(KT.fukugoPart(br.matches.B, br), 'kumite');
  assert.equal(KT.kiteiEval(['a', 'a', 'b', 'b', 'a'], 5).winner, 'a');
  assert.ok(!KT.kiteiEval(['a', 'a'], 5).done);
});
t('WTKF kata list (Kata Rules 1-3)', () => {
  assert.ok(KT.WTKF_KATA.length >= 26);
  for (const k of ['A-Nan-Kun (A-Nan-Ku)', 'Kuru-Run-Ha', 'Supa-Rin-Pan (Becchu-Rin, Hyaku-Hachi-Ho)', 'Wan-Kan', 'Sei-En-Chin']) assert.ok(KT.WTKF_KATA.includes(k), k);
});
t('WTKF defaults', () => {
  const d = KT.blackBeltDivisions(KT.EVENT_ORDER);
  const f = (et, g, grp) => d.find(x => x.eventType === et && x.gender === g && (!grp || x.group === grp));
  // kumite style by age/rank, not gender (director 2026-10-01)
  for (const g of ['M', 'F']) {
    assert.equal(f('IKUMITE', g, 'Senior').scoring.style, 'shobu'); assert.equal(f('IKUMITE', g, 'Youth').scoring.style, 'shobu');
    assert.equal(f('IKUMITE', g, 'Junior').scoring.style, 'kogo'); assert.equal(f('IKUMITE', g, 'Cadet').scoring.style, 'kogo');
  }
  assert.equal(f('TKUMITE', 'M', 'Cadet').scoring.style, 'kogo');
  const brown = KT.kyuDivisions({ label: 'Brown', minRank: 'k3', maxRank: 'k1', minAge: 30 }, ['IKUMITE']);
  assert.ok(brown.every(x => x.scoring.style === 'kogo'));
  const low = KT.kyuDivisions({ label: 'Green', minRank: 'k6', maxRank: 'k4', minAge: 10, maxAge: 12 }, ['IKUMITE']);
  assert.ok(low.every(x => x.scoring.style === 'shobu'));
  assert.equal(f('IKUMITE', 'M').reset, false);
  assert.equal(f('IKUMITE', 'M').scoring.boutTime, 90);
  assert.equal(f('ENBU', 'X').format, 'KP'); assert.equal(f('FUKUGO', 'M').format, 'SE');
  assert.equal(KT.EVENT_TYPES.ENBU.size[1], 2);
});
t('KP: kata change rule, kettei kata, hansoku, application, pool size 12', () => {
  const br = KT.generateBracket({ id: 'x', eventType: 'IKATA', format: 'KP', scoring: { judges: 6 } }, ents(6), rng(7));
  const ids = br.kpPools.A;
  ids.forEach((id, i) => { br.scores['R1_' + id] = { s: [8, 8, 8, 8, 8, 8 - i * 0.2], kata: 'Jion' }; });
  const st = KT.kpState(br); const fid = st.final.order[0];
  assert.ok(KT.kpKataCheck(br, 'R2_' + fid, 'jion'));
  assert.equal(KT.kpKataCheck(br, 'R2_' + fid, 'Kanku Dai'), '');
  assert.ok(KT.kpKataCheck(br, 'R1_' + ids[0] + '_rp', 'Jion'));
  // hansoku → 0, drops out
  br.scores['R1_' + ids[0]] = { hansoku: true, kata: 'Jion' };
  assert.ok(!KT.kpState(br).final.order.includes(ids[0]));
  const enbu = KT.generateBracket({ id: 'y', eventType: 'ENBU', format: 'KP' }, ents(3), rng(1));
  assert.equal(KT.kpKataCheck(enbu, 'R1_c1', ''), '');
  const tk = KT.generateBracket({ id: 'z', eventType: 'TKATA', format: 'KP', scoring: { judges: 6 } }, ents(2), rng(1));
  assert.ok(tk.application);
  tk.scores['R1_c1'] = { s: [8, 8, 8, 8, 8, 8], app: [7, 7, 7, 7, 7, 7], kata: 'A' };
  tk.scores['R1_c2'] = { s: [7, 7, 7, 7, 7, 7], app: [8, 8, 8, 8, 8, 8], kata: 'B' };
  let pl = KT.placings(tk); assert.equal(pl.gold, 'c2'); // equal total 60, higher application wins
  const big = KT.generateBracket({ id: 'w', eventType: 'IKATA', format: 'KP', poolSize: 12, scoring: { judges: 6 } }, ents(24), rng(1));
  assert.equal(Object.keys(big.kpPools).length, 2);
  kpPlayAll(big, id => 9.7 - parseInt(id.slice(1)) * 0.2);
  assert.deepEqual(KT.kpState(big).rounds.map(r => Object.keys(r.pools).length), [2, 1]);
  assert.equal(KT.placings(big).gold, 'c1');
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

// ---------- Kata score pools ----------
function kpPlayAll(br, strength, opts) {
  opts = opts || {};
  for (let g = 0; g < 400; g++) {
    const q = KT.kpQueue(br);
    if (!q.length) return;
    const p = q[0];
    if (p.again) throw new Error('unexpected repeat re-perform');
    const st = strength(p.id, p);
    br.scores[p.key] = { s: Array.from({ length: br.judges }, (_, j) => Math.min(10, +(st + (j % 3) * 0.1).toFixed(1))), kata: opts.kata ? opts.kata(p) : ('K' + p.round) };
  }
  throw new Error('KP did not terminate');
}
const kpStr = id => 9.7 - parseInt(id.slice(1)) * 0.2;
for (const n of [1, 3, 4, 5, 8, 9, 16, 17, 24, 25, 32]) {
  t('KP n=' + n, () => {
    const br = KT.generateBracket({ id: 'x', format: 'KP', scoring: { judges: 6 } }, ents(n), rng(n));
    if (n > 4) { const ps = Object.values(br.kpPools); assert.ok(ps.every(p => p.length <= 8)); assert.equal(ps.length, Math.ceil(n / 8)); }
    kpPlayAll(br, kpStr);
    const pl = KT.placings(br);
    assert.ok(pl.complete, 'complete');
    assert.equal(pl.gold, 'c1');
    if (n >= 3) { assert.equal(pl.silver, 'c2'); assert.equal(pl.bronze[0], 'c3'); }
    const st = KT.kpState(br);
    if (n > 8) assert.ok(st.rounds.length >= 2);
    if (n > 4) { assert.equal(st.rounds[st.rounds.length - 1].type, 'semi'); assert.ok(st.final.carried); }
    if (n > 4) assert.equal(st.final.rows.length, 4);
  });
}
t('KP rounds for 32: 4 pools -> 2 pools -> semi -> final', () => {
  const br = KT.generateBracket({ id: 'x', format: 'KP', scoring: { judges: 6 } }, ents(32), rng(4));
  kpPlayAll(br, kpStr);
  const st = KT.kpState(br);
  assert.deepEqual(st.rounds.map(r => Object.keys(r.pools).length), [4, 2, 1]);
  assert.deepEqual(st.rounds.map(r => r.type), ['pool', 'pool', 'semi']);
  assert.equal(st.final.n, 4);
});
t('KP 24 -> 3 pools -> 2 pools of 6 -> semi of 8', () => {
  const br = KT.generateBracket({ id: 'x', format: 'KP', scoring: { judges: 6 } }, ents(24), rng(5));
  kpPlayAll(br, kpStr);
  const st = KT.kpState(br);
  assert.deepEqual(st.rounds.map(r => Object.values(r.pools).map(p => p.rows.length)), [[8, 8, 8], [6, 6], [8]]);
});
t('KP scoring: 6 judges drop high & low; final adds semi score', () => {
  const br = KT.generateBracket({ id: 'x', format: 'KP', scoring: { judges: 6 } }, ents(5), rng(1));
  const ids = br.kpPools.A;
  ids.forEach((id, i) => { br.scores['R1_' + id] = { s: [8, 8, 8, 8, 9.5, 5 + i * 0.1], kata: 'Bassai' }; });
  let st = KT.kpState(br);
  const r0 = st.rounds[0].pools.A.rows.find(r => r.id === ids[0]);
  assert.equal(r0.own, 32); // drop 9.5 and 5.0
  assert.ok(st.final);
  const f = st.final.rows[0];
  br.scores['R2_' + f.id] = { s: [9, 9, 9, 9, 9, 9], kata: 'Kanku Dai' };
  st = KT.kpState(br);
  const fr = st.final.rows.find(r => r.id === f.id);
  assert.equal(fr.own, 36); assert.equal(fr.carry, 32); assert.equal(fr.total, 68);
});
t('KP tie at cut: all-scores then re-perform', () => {
  const br = KT.generateBracket({ id: 'x', format: 'KP', scoring: { judges: 6 } }, ents(6), rng(2));
  const ids = br.kpPools.A;
  const v = [9, 8.8, 8.6, 8.0, 8.0, 7];
  ids.forEach((id, i) => { br.scores['R1_' + id] = { s: [v[i], v[i], v[i], v[i], v[i], v[i]], kata: 'X' }; });
  let st = KT.kpState(br);
  assert.ok(!st.rounds[0].complete); assert.equal(st.rounds[0].needRp.length, 2);
  // same kept total but different dropped scores -> all-sum decides, no re-perform
  br.scores['R1_' + ids[3]] = { s: [8, 8, 8, 8, 9, 7.5], kata: 'X' }; // kept 32, all 48.5
  st = KT.kpState(br);
  assert.ok(st.rounds[0].complete, 'resolved by adding back dropped');
  // exact tie -> re-perform decides
  br.scores['R1_' + ids[3]] = { s: [8, 8, 8, 8, 8, 8], kata: 'X' };
  st = KT.kpState(br); assert.ok(!st.rounds[0].complete);
  const q = KT.kpQueue(br); assert.ok(q.every(x => x.rp)); assert.equal(q.length, 2);
  br.scores['R1_' + ids[4] + '_rp'] = { s: [9, 9, 9, 9, 9, 9], kata: 'Y' };
  br.scores['R1_' + ids[3] + '_rp'] = { s: [8, 8, 8, 8, 8, 8], kata: 'Y' };
  st = KT.kpState(br); assert.ok(st.rounds[0].complete);
  assert.ok(st.final.order.includes(ids[4]) && !st.final.order.includes(ids[3]));
});
t('KP edit guard', () => {
  const br = KT.generateBracket({ id: 'x', format: 'KP', scoring: { judges: 6 } }, ents(6), rng(3));
  kpPlayAll(br, kpStr);
  const k1 = Object.keys(br.scores).find(k => k.startsWith('R1_'));
  assert.ok(!KT.kpCanEdit(br, k1));
  const k2 = Object.keys(br.scores).find(k => k.startsWith('R2_'));
  assert.ok(KT.kpCanEdit(br, k2));
});
t('black belt kata divisions default to KP with 6 judges', () => {
  const d = KT.blackBeltDivisions(['IKATA', 'TKATA', 'IKUMITE']);
  assert.ok(d.filter(x => x.eventType !== 'IKUMITE').every(x => x.format === 'KP' && x.scoring.judges === 6));
  assert.ok(d.filter(x => x.eventType === 'IKUMITE').every(x => x.format === 'SE'));
});

/* ===== v1.5: segments, rings, judges, officials ===== */
t('segOf: SE final/semi/bronze', () => {
  const br = KT.generateBracket({ id: 'x', format: 'SE', bronze: 'match' }, ents(8), rng(1));
  const ms = Object.values(br.matches);
  const maxR = Math.max(...ms.filter(m => m.stage === 'W').map(m => m.round));
  assert.ok(ms.filter(m => m.stage === 'W' && m.round === maxR).every(m => KT.segOf(br, m) === 'F'));
  assert.ok(ms.filter(m => m.stage === 'W' && m.round === maxR - 1).every(m => KT.segOf(br, m) === 'SF'));
  assert.ok(ms.filter(m => m.stage === 'W' && m.round === 1).every(m => KT.segOf(br, m) === ''));
  assert.ok(ms.filter(m => m.stage === 'B').every(m => KT.segOf(br, m) === 'F'));
});
t('segOf: RR pools and DE elimination pools', () => {
  const rr = KT.generateBracket({ id: 'x', format: 'RR' }, ents(8), rng(2));
  const pm = Object.values(rr.matches).filter(m => m.stage === 'P');
  assert.ok(pm.length && pm.every(m => KT.segOf(rr, m) === 'P:' + m.pool));
  const de = KT.generateBracket({ id: 'y', format: 'DE' }, ents(14), rng(2));
  assert.ok(de.elimPools);
  const segs = new Set(Object.values(de.matches).map(m => KT.segOf(de, m)));
  assert.ok(segs.has('P:A') && segs.has('P:B') && segs.has('F'));
  const list = KT.segList(de).map(s => s.seg);
  assert.deepEqual(list, ['P:A', 'P:B', 'SF', 'F']);
});
t('ringOf: match > segment > division', () => {
  const dv = { ringId: 'r1', segRings: { 'P:B': 'r2', F: 'r3', 'M:X9': 'r4' } };
  assert.equal(KT.ringOf(dv, 'P:A'), 'r1');
  assert.equal(KT.ringOf(dv, 'P:B'), 'r2');
  assert.equal(KT.ringOf(dv, 'F', 'X1'), 'r3');
  assert.equal(KT.ringOf(dv, 'F', 'X9'), 'r4');
  assert.equal(KT.ringOf({ ringId: 'r1' }, ''), 'r1');
});
t('kpSegOfKey: pools, semifinal, final (no id prefix clash)', () => {
  const br = KT.generateBracket({ id: 'x', format: 'KP', scoring: { judges: 6 } }, ents(20), rng(5));
  const st = KT.kpState(br);
  const r1 = st.rounds[0];
  assert.ok(Object.keys(r1.pools).length >= 2);
  for (const P of Object.keys(r1.pools)) for (const id of r1.pools[P].order) assert.equal(KT.kpSegOfKey(br, `R1_${id}`), 'P:' + P);
  const q = KT.kpQueue(br); assert.ok(q.every(x => x.seg && x.seg.startsWith('P:')));
  const segs = KT.segList(br).map(s => s.seg);
  assert.ok(segs.includes('SF') && segs.includes('F') && segs.filter(s => s.startsWith('P:')).length === Object.keys(r1.pools).length);
  kpPlayAll(br, kpStr);
  const st2 = KT.kpState(br);
  const semi = st2.rounds.find(r => r.type === 'semi');
  if (semi) { const id = semi.pools[Object.keys(semi.pools)[0]].order[0]; assert.equal(KT.kpSegOfKey(br, `R${semi.n}_${id}`), 'SF'); }
  assert.equal(KT.kpSegOfKey(br, `R${st2.final.n}_${st2.final.rows[0].id}`), 'F');
});
t('judge eligibility by event level', () => {
  const j = { kataLevel: 2, kumiteLevel: 4 };
  assert.equal(KT.judgeNeed('National'), 3); assert.equal(KT.judgeNeed('International'), 3); assert.equal(KT.judgeNeed('Local'), 1); assert.equal(KT.judgeNeed('Regional'), 1);
  assert.ok(!KT.judgeEligible(j, 'kata', 'National'));
  assert.ok(KT.judgeEligible(j, 'kumite', 'National'));
  assert.ok(!KT.judgeEligible(j, 'fukugo', 'International'));
  assert.ok(KT.judgeEligible(j, 'kata', 'Regional'));
  const w = { country: 'Japan', region: 'Kanto', dojo: 'Hombu' };
  assert.equal(KT.judgeFrom(w, 'International'), 'Japan'); assert.equal(KT.judgeFrom(w, 'National'), 'Kanto'); assert.equal(KT.judgeFrom(w, 'Local'), 'Hombu');
});
t('officials positions and check', () => {
  const k = KT.officialPositions('kumite');
  assert.deepEqual(k.map(p => p.key), ['shushin', 'f1', 'f2', 'f3', 'f4', 'kansa']);
  const kata = KT.officialPositions('kata', 6);
  assert.equal(kata.length, 6); assert.equal(kata[0].label, 'Shu-shin');
  assert.equal(KT.officialsCheck(k, {}, 'Regional'), '');
  assert.ok(KT.officialsCheck(k, {}, 'National'));
  assert.ok(/two positions/.test(KT.officialsCheck(k, { shushin: 'a', f1: 'a' }, 'Local')));
  const full = { shushin: 'a', f1: 'b', f2: 'c', f3: 'd', f4: 'e', kansa: 'f' };
  assert.equal(KT.officialsCheck(k, full, 'International'), '');
});
t('Ten-to: executed penalty match scores nothing; unexecuted at time-up = 1 point (Art. 1-6-I, 1-7)', () => {
  let r = KT.kumiteEval([{ s: 'a', t: 'tento', exec: true }, { t: 'timeup' }]);
  assert.equal(r.phase, 'kettei'); assert.deepEqual(r.score, { a: 0, b: 0 });
  r = KT.kumiteEval([{ s: 'a', t: 'tento', exec: true }, { s: 'b', t: 'tento' }, { t: 'timeup' }]);
  assert.equal(r.winner, 'a'); assert.deepEqual(r.score, { a: 1, b: 0 });
});
t('Ko-go: a score or penalty ends the exchange (stand-alone match); Kettei-sen penalties only add points', () => {
  const W = (s, t) => ({ s, t, ae: 1 });
  let r = KT.kogoEval([W('a', 'waza')]);
  assert.equal(r.exchange, 2); assert.deepEqual(r.cur, { a: 4, b: 0 });
  r = KT.kogoEval([W('b', 'jogai'), W('a', 'jikan')]);           // Jo-gai ends exchange 1, Jikan ends exchange 2
  assert.equal(r.exchange, 3); assert.deepEqual(r.cur, { a: 2, b: 2 });
  r = KT.kogoEval([W('a', 'waza'), { t: 'next' }, { t: 'next' }, { t: 'next' }, { t: 'next' }, { t: 'next' }]);
  assert.equal(r.done, true); assert.equal(r.winner, 'a');
  // tie 0-0 → Kettei-sen; a Jo-gai there gives 2 points and ends that exchange, it does not win the bout
  const six = Array.from({ length: 6 }, () => ({ t: 'next' }));
  r = KT.kogoEval([...six, W('a', 'jogai')]);
  assert.equal(r.phase, 'kettei'); assert.equal(r.exchange, 2); assert.deepEqual(r.cur, { a: 0, b: 2 });
  r = KT.kogoEval([...six, W('a', 'jogai'), W('a', 'waza')]);
  assert.equal(r.done, true); assert.equal(r.winner, 'a'); assert.equal(r.method, 'Kettei-sen · Waza-ari');
  // old logs without the auto-end mark still work
  r = KT.kogoEval([{ s: 'a', t: 'waza' }, { t: 'next' }]); assert.equal(r.exchange, 2);
});

// ---- v1.13.0 seeding & group separation ----
t('seedClashes finds duplicate seeds', () => {
  assert.deepEqual(KT.seedClashes({ a: 1, b: 2, c: 3 }), {});
  assert.deepEqual(KT.seedClashes({ a: 1, b: 1, c: 2, d: 0 }), { 1: ['a', 'b'] });
  assert.deepEqual(KT.seedClashes(null), {});
});
const half = (i, size) => Math.floor(i / (size / 2)), quarter = (i, size) => Math.floor(i / (size / 4));
t('SE: same-group unseeded go to different halves (many draws)', () => {
  for (let s = 1; s <= 60; s++) {
    // 8 entrants, 2 countries × 2 + 4 singles → each pair in opposite halves
    const e = ['JP', 'JP', 'US', 'US', 'A', 'B', 'C', 'D'].map((g, i) => ({ id: 'c' + i, group: g }));
    const br = KT.generateBracket({ id: 'x', format: 'SE' }, e, rng(s));
    const res = KT.resolve(br), slot = {};
    for (let i = 0; i < 4; i++) { slot[res['W1-' + i].a] = 2 * i; slot[res['W1-' + i].b] = 2 * i + 1; }
    assert.notEqual(half(slot.c0, 8), half(slot.c1, 8), 'JP same half, draw ' + s);
    assert.notEqual(half(slot.c2, 8), half(slot.c3, 8), 'US same half, draw ' + s);
  }
});
t('SE: a group of 4 lands one per quarter', () => {
  for (let s = 1; s <= 40; s++) {
    const e = Array.from({ length: 16 }, (_, i) => ({ id: 'c' + i, group: i < 4 ? 'FR' : 'G' + i }));
    const slots = KT.placeSlots(e, 16, rng(s));
    const qs = slots.map((id, i) => id && +id.slice(1) < 4 ? quarter(i, 16) : -1).filter(q => q >= 0);
    assert.equal(new Set(qs).size, 4, 'draw ' + s + ': ' + qs);
  }
});
t('SE: seeds keep their positions and byes', () => {
  const e = Array.from({ length: 6 }, (_, i) => ({ id: 'c' + i, seed: i < 2 ? i + 1 : 0, group: 'X' }));
  const ordered = KT.orderEntrants(e, rng(4));
  const slots = KT.placeSlots(ordered, 8, rng(4));
  assert.deepEqual(KT.seedOrder(8), [1, 8, 4, 5, 2, 7, 3, 6]); assert.equal(slots[0], 'c0'); assert.equal(slots[1], null); assert.equal(slots[4], 'c1'); assert.equal(slots[5], null);
});
t('SE: unseeded placement is random', () => {
  const seen = new Set();
  for (let s = 1; s <= 20; s++) seen.add(KT.placeSlots(ents(8), 8, rng(s)).join(','));
  assert.ok(seen.size > 5);
});
t('RR pools: same group spread across pools', () => {
  for (let s = 1; s <= 30; s++) {
    const e = Array.from({ length: 12 }, (_, i) => ({ id: 'c' + i, group: ['R1', 'R2', 'R3'][i % 3] }));
    const br = KT.generateBracket({ id: 'x', format: 'RR' }, e, rng(s));
    const pools = Object.values(br.pools);
    assert.equal(pools.length, 3);
    for (const pl of pools) { assert.equal(pl.length, 4); const gs = pl.map(id => ['R1', 'R2', 'R3'][+id.slice(1) % 3]); assert.ok(new Set(gs).size >= 2); }
    // each group of 4 splits 2/1/1 at worst over 3 pools → no pool holds 3 of a group
    for (const g of ['R1', 'R2', 'R3']) for (const pl of pools) assert.ok(pl.filter(id => ['R1', 'R2', 'R3'][+id.slice(1) % 3] === g).length <= 2);
  }
});
t('KP pools: a dojo is split between pools', () => {
  for (let s = 1; s <= 20; s++) {
    const e = Array.from({ length: 16 }, (_, i) => ({ id: 'c' + i, group: i < 2 ? 'Hombu' : 'D' + i }));
    const br = KT.generateBracket({ id: 'x', format: 'KP', eventType: 'KATA', poolSize: 8 }, e, rng(s));
    const pools = Object.values(br.kpPools);
    assert.ok(pools.every(pl => pl.filter(id => +id.slice(1) < 2).length <= 1), 'draw ' + s);
  }
});
t('DE pools: groups split across elimination pools', () => {
  for (let s = 1; s <= 20; s++) {
    const e = Array.from({ length: 16 }, (_, i) => ({ id: 'c' + i, group: i < 4 ? 'KR' : i < 8 ? 'BR' : 'G' + i }));
    const br = KT.generateBracket({ id: 'x', format: 'DE', poolCount: 2 }, e, rng(s));
    for (const pl of Object.values(br.pools)) { assert.equal(pl.filter(id => +id.slice(1) < 4).length, 2); assert.equal(pl.filter(id => +id.slice(1) >= 4 && +id.slice(1) < 8).length, 2); }
  }
});
t('legacy dojo field still separates', () => {
  const e = ents(8, i => i < 2 ? 'Same' : 'D' + i);
  for (let s = 1; s <= 20; s++) { const sl = KT.placeSlots(e, 8, rng(s)); assert.notEqual(half(sl.indexOf('c1'), 8), half(sl.indexOf('c2'), 8)); }
});
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
