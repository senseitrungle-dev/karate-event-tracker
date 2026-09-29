/* ============================================================
   Karate Event Tracker — core logic (pure, no DOM)
   Brackets, divisions, WTKF-style scoring. Portable to native.
   ============================================================ */
const KT = (function () {
  'use strict';
  const VERSION = '1.0.0';

  /* ---------- reference data ---------- */
  const EVENT_TYPES = {
    IKATA:   { label: 'Individual Kata',   short: 'Kata',       team: false, genders: ['M', 'F'],      kind: 'kata',       defMethod: 'flags' },
    IKUMITE: { label: 'Individual Kumite', short: 'Kumite',     team: false, genders: ['M', 'F'],      kind: 'kumite' },
    TKATA:   { label: 'Team Kata',         short: 'Team Kata',  team: true,  genders: ['M', 'F', 'X'], kind: 'kata',       defMethod: 'scores', size: [3, 3] },
    TKUMITE: { label: 'Team Kumite',       short: 'Team Kumite',team: true,  genders: ['M', 'F'],      kind: 'teamkumite', size: [3, 5] },
    FUKUGO:  { label: 'Fukugo',            short: 'Fukugo',     team: false, genders: ['M', 'F'],      kind: 'fukugo' },
    ENBU:    { label: 'Enbu',              short: 'Enbu',       team: true,  genders: ['M', 'F', 'X'], kind: 'kata',       defMethod: 'scores', size: [2, 4] },
  };
  const EVENT_ORDER = ['IKATA', 'IKUMITE', 'TKATA', 'TKUMITE', 'FUKUGO', 'ENBU'];
  const GENDERS = { M: 'Men', F: 'Women', X: 'Mixed' };
  const FORMATS = { SE: 'Single elimination', RR: 'Round robin (pools of 4)', DE: 'Double elimination' };
  const LEVELS = ['Local', 'Regional', 'National', 'International'];
  const EVENT_KINDS = { tournament: 'Tournament', camp: 'Training camp', other: 'Other event' };
  const BLACK_AGE_GROUPS = [
    { id: 'SEN', label: 'Senior', min: 21, max: null },
    { id: 'YOU', label: 'Youth',  min: 19, max: 20 },
    { id: 'JUN', label: 'Junior', min: 16, max: 18 },
    { id: 'CAD', label: 'Cadet',  min: 14, max: 15 },
  ];
  const RANKS = [];
  for (let k = 10; k >= 1; k--) RANKS.push({ code: 'k' + k, label: ordinal(k) + ' Kyu', value: -k });
  for (let d = 1; d <= 10; d++) RANKS.push({ code: 'd' + d, label: ordinal(d) + ' Dan', value: d });
  const RANK_BY = Object.fromEntries(RANKS.map(r => [r.code, r]));

  function ordinal(n) { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
  function rankValue(code) { return RANK_BY[code] ? RANK_BY[code].value : null; }
  function rankLabel(code) { return RANK_BY[code] ? RANK_BY[code].label : '—'; }
  function isBlack(code) { const v = rankValue(code); return v != null && v > 0; }

  /** Age in whole years on a date (YYYY-MM-DD strings). */
  function ageOn(dob, onDate) {
    if (!dob || !onDate) return null;
    const [y, m, d] = dob.split('-').map(Number), [Y, M, D] = onDate.split('-').map(Number);
    if (!y || !Y) return null;
    let a = Y - y;
    if (M < m || (M === m && D < d)) a--;
    return a;
  }

  /* ---------- divisions ---------- */
  function divisionName(dv) {
    const et = EVENT_TYPES[dv.eventType];
    const who = dv.belt === 'black' ? 'Black Belt' : 'Kyu';
    const grp = dv.group ? ' ' + dv.group : '';
    return `${who}${grp} ${GENDERS[dv.gender] || ''} ${et ? et.label : ''}`.replace(/\s+/g, ' ').trim();
  }
  function defaultScoring(eventType) {
    const et = EVENT_TYPES[eventType];
    return { method: et.defMethod || 'flags', judges: 5, boutTime: 120, ketteiTime: 30, bouts: 3 };
  }
  /** Standard black-belt divisions for the chosen event types. */
  function blackBeltDivisions(eventTypes, format) {
    const out = [];
    for (const et of eventTypes) for (const g of EVENT_TYPES[et].genders) for (const ag of BLACK_AGE_GROUPS) {
      const dv = { eventType: et, gender: g, belt: 'black', group: ag.label, minAge: ag.min, maxAge: ag.max,
        minRank: 'd1', maxRank: 'd10', format: format || 'SE', scoring: defaultScoring(et), bronze: 'two', reset: true };
      dv.name = divisionName(dv); out.push(dv);
    }
    return out;
  }
  /** Kyu divisions from a director template {label,minRank,maxRank,minAge,maxAge}. */
  function kyuDivisions(tpl, eventTypes, format) {
    const out = [];
    for (const et of eventTypes) for (const g of EVENT_TYPES[et].genders) {
      const dv = { eventType: et, gender: g, belt: 'kyu', group: tpl.label, minAge: tpl.minAge ?? null, maxAge: tpl.maxAge ?? null,
        minRank: tpl.minRank || 'k10', maxRank: tpl.maxRank || 'k1', format: format || 'SE', scoring: defaultScoring(et), bronze: 'two', reset: true };
      dv.name = divisionName(dv); out.push(dv);
    }
    return out;
  }
  function fitsDivision(dv, ages, ranks) {
    // ages/ranks: arrays (one per person)
    for (const a of ages) {
      if (a == null) return false;
      if (dv.minAge != null && dv.minAge !== '' && a < +dv.minAge) return false;
      if (dv.maxAge != null && dv.maxAge !== '' && a > +dv.maxAge) return false;
    }
    const lo = rankValue(dv.minRank), hi = rankValue(dv.maxRank);
    for (const r of ranks) {
      const v = rankValue(r); if (v == null) return false;
      if (dv.belt === 'black' && v < 1) return false;
      if (dv.belt === 'kyu' && v > 0) return false;
      if (lo != null && v < lo) return false;
      if (hi != null && v > hi) return false;
    }
    return true;
  }
  function spanOf(dv) { const lo = dv.minAge == null || dv.minAge === '' ? 0 : +dv.minAge, hi = dv.maxAge == null || dv.maxAge === '' ? 120 : +dv.maxAge; return hi - lo; }
  /** Candidate divisions for a competitor in one event type, most specific first. */
  function ageOf(c, asOf) { return c.dob ? ageOn(c.dob, asOf) : (c.age == null || c.age === '' ? null : +c.age); }
  function candidateDivisions(comp, eventType, divisions, asOf) {
    const age = ageOf(comp, asOf);
    return divisions.filter(dv => dv.eventType === eventType && dv.gender === comp.gender && fitsDivision(dv, [age], [comp.rank]))
      .sort((x, y) => spanOf(x) - spanOf(y) || (x.order || 0) - (y.order || 0) || String(x.id).localeCompare(String(y.id)));
  }
  function teamGender(members) {
    const g = new Set(members.map(m => m.gender));
    return g.size === 1 ? [...g][0] : 'X';
  }
  function teamCandidates(team, members, divisions, asOf) {
    const g = teamGender(members);
    const ages = members.map(m => ageOf(m, asOf)), ranks = members.map(m => m.rank);
    return divisions.filter(dv => dv.eventType === team.eventType && dv.gender === g && fitsDivision(dv, ages, ranks))
      .sort((x, y) => spanOf(x) - spanOf(y) || (x.order || 0) - (y.order || 0));
  }
  /** Resolve the division each entrant lands in. Returns {divId: [entrantIds]} plus unplaced list. */
  function assignEntrants(competitors, teams, divisions, asOf) {
    const byDiv = {}, unplaced = [];
    const divIds = new Set(divisions.map(d => d.id));
    for (const dv of divisions) byDiv[dv.id] = [];
    for (const c of competitors) {
      if (c.status === 'withdrawn') continue;
      for (const et of (c.events || [])) {
        if (EVENT_TYPES[et] && EVENT_TYPES[et].team) continue;
        const ov = c.divOverride && c.divOverride[et];
        let did = ov && divIds.has(ov) ? ov : null;
        if (!did) { const cand = candidateDivisions(c, et, divisions, asOf); did = cand.length ? cand[0].id : null; }
        if (did) byDiv[did].push(c.id); else unplaced.push({ id: c.id, eventType: et, kind: 'competitor' });
      }
    }
    const compBy = Object.fromEntries(competitors.map(c => [c.id, c]));
    for (const t of teams || []) {
      if (t.status === 'withdrawn') continue;
      let did = t.divisionId && divIds.has(t.divisionId) ? t.divisionId : null;
      if (!did) {
        const mem = (t.memberIds || []).map(id => compBy[id]).filter(Boolean);
        const cand = mem.length ? teamCandidates(t, mem, divisions, asOf) : [];
        did = cand.length ? cand[0].id : null;
      }
      if (did) byDiv[did].push(t.id); else unplaced.push({ id: t.id, eventType: t.eventType, kind: 'team' });
    }
    return { byDiv, unplaced };
  }
  /** Required-info check for a competitor record. Returns list of problems. */
  function validateCompetitor(c, asOf) {
    const p = [];
    if (!c.firstName || !c.lastName) p.push('Full name');
    if (!c.gender || !['M', 'F'].includes(c.gender)) p.push('Gender');
    if (!c.dob) p.push('Date of birth');
    else { const a = ageOn(c.dob, asOf); if (a == null || a < 3 || a > 110) p.push('Valid date of birth'); }
    if (!RANK_BY[c.rank]) p.push('Rank');
    if (!c.dojo) p.push('Dojo / club');
    if (!c.emergencyName || !c.emergencyPhone) p.push('Emergency contact');
    if (!c.waiver) p.push('Signed waiver');
    return p;
  }

  /* ---------- seeding ---------- */
  function seedOrder(n) {
    let order = [1];
    while (order.length < n) { const m = order.length * 2; order = order.flatMap(s => [s, m + 1 - s]); }
    return order;
  }
  function nextPow2(n) { let p = 1; while (p < n) p *= 2; return p; }
  function shuffle(arr, rnd) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  /** Order entrants: seeded first (by seed), rest shuffled. entrants: [{id, seed, dojo}] */
  function orderEntrants(entrants, rnd) {
    const seeded = entrants.filter(e => e.seed).sort((a, b) => a.seed - b.seed);
    const rest = shuffle(entrants.filter(e => !e.seed), rnd || Math.random);
    return seeded.concat(rest);
  }
  /** Place ordered entrants into bracket slots (null = bye), then spread same-dojo first-round pairs. */
  function placeSlots(ordered, size) {
    const so = seedOrder(size);
    const slots = so.map(s => ordered[s - 1] || null);
    // dojo spread: swap unseeded entrants to break same-dojo first-round pairs
    const conflict = (i) => { const a = slots[i - (i % 2)], b = slots[i - (i % 2) + 1]; return a && b && a.dojo && a.dojo === b.dojo; };
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < size; i += 2) {
        if (!conflict(i)) continue;
        const victim = slots[i + 1] && !slots[i + 1].seed ? i + 1 : (slots[i] && !slots[i].seed ? i : -1);
        if (victim < 0) continue;
        for (let j = 0; j < size; j++) {
          if ((j >> 1) === (i >> 1) || !slots[j] || slots[j].seed) continue;
          const tmp = slots[j]; slots[j] = slots[victim]; slots[victim] = tmp;
          if (!conflict(i) && !conflict(j)) break;
          slots[victim] = slots[j]; slots[j] = tmp; // undo
        }
      }
    }
    return slots.map(e => (e ? e.id : null));
  }

  /* ---------- bracket generation ---------- */
  const E = (id) => ({ e: id });
  const W = (m) => ({ m, t: 'W' });
  const L = (m) => ({ m, t: 'L' });

  function genSE(slots, prefix, opts) {
    const matches = {}, size = slots.length, k = Math.log2(size);
    const P = prefix || '';
    for (let r = 1; r <= k; r++) {
      const cnt = size >> r;
      for (let i = 0; i < cnt; i++) {
        const id = `${P}W${r}-${i}`;
        const m = { id, stage: P ? 'PO' : 'W', round: r, idx: i, rounds: k };
        if (r === 1) { m.a = slots[2 * i] && slots[2 * i].p ? slots[2 * i] : E(slots[2 * i]); m.b = slots[2 * i + 1] && slots[2 * i + 1].p ? slots[2 * i + 1] : E(slots[2 * i + 1]); }
        else { m.a = W(`${P}W${r - 1}-${2 * i}`); m.b = W(`${P}W${r - 1}-${2 * i + 1}`); }
        matches[id] = m;
      }
    }
    if (opts && opts.bronze === 'match' && k >= 2) {
      const id = `${P}B`;
      matches[id] = { id, stage: 'B', round: k, idx: 1, a: L(`${P}W${k - 1}-0`), b: L(`${P}W${k - 1}-1`) };
    }
    return matches;
  }

  function genDE(slots, opts) {
    const size = slots.length, k = Math.log2(size);
    const matches = genSE(slots, '', {});
    if (k === 0) return matches;
    if (k === 1) {
      matches.GF = { id: 'GF', stage: 'GF', round: 1, idx: 0, a: W('W1-0'), b: L('W1-0') };
    } else {
      const lastL = 2 * (k - 1);
      for (let i = 0; i < size / 4; i++) matches[`L1-${i}`] = { id: `L1-${i}`, stage: 'L', round: 1, idx: i, a: L(`W1-${2 * i}`), b: L(`W1-${2 * i + 1}`) };
      for (let r = 1; r <= k - 1; r++) {
        const cnt = size >> (r + 1), rr = 2 * r;
        for (let i = 0; i < cnt; i++) {
          const j = r % 2 === 1 ? cnt - 1 - i : i;
          matches[`L${rr}-${i}`] = { id: `L${rr}-${i}`, stage: 'L', round: rr, idx: i, a: W(`L${rr - 1}-${i}`), b: L(`W${r + 1}-${j}`) };
        }
        if (r <= k - 2) {
          const c2 = size >> (r + 2), ro = 2 * r + 1;
          for (let i = 0; i < c2; i++) matches[`L${ro}-${i}`] = { id: `L${ro}-${i}`, stage: 'L', round: ro, idx: i, a: W(`L${rr}-${2 * i}`), b: W(`L${rr}-${2 * i + 1}`) };
        }
      }
      matches.GF = { id: 'GF', stage: 'GF', round: 1, idx: 0, a: W(`W${k}-0`), b: W(`L${lastL}-0`) };
    }
    if (!opts || opts.reset !== false) matches.GF2 = { id: 'GF2', stage: 'GF', round: 2, idx: 0, reset: 'GF' };
    return matches;
  }

  /** Split ordered entrants into balanced pools of at most 4 (snake order). */
  function makePools(ordered) {
    const n = ordered.length, np = Math.max(1, Math.ceil(n / 4));
    const pools = Array.from({ length: np }, () => []);
    ordered.forEach((e, i) => { const row = Math.floor(i / np), col = i % np; pools[row % 2 === 0 ? col : np - 1 - col].push(e); });
    // dojo spread across pools: swap unseeded same-dojo members with another pool
    for (let p = 0; p < np; p++) {
      const seen = {};
      for (let i = 0; i < pools[p].length; i++) {
        const e = pools[p][i]; if (!e.dojo) continue;
        if (seen[e.dojo] && !e.seed) {
          outer: for (let q = 0; q < np; q++) {
            if (q === p) continue;
            for (let j = 0; j < pools[q].length; j++) {
              const f = pools[q][j];
              if (f.seed || f.dojo === e.dojo) continue;
              if (pools[p].some((x, xi) => xi !== i && x.dojo === f.dojo)) continue;
              if (pools[q].some((x, xj) => xj !== j && x.dojo === e.dojo)) continue;
              pools[p][i] = f; pools[q][j] = e; break outer;
            }
          }
        }
        seen[pools[p][i].dojo] = true;
      }
    }
    return pools;
  }
  const POOL_NAMES = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  function roundRobinPairs(n) {
    const ids = Array.from({ length: n }, (_, i) => i);
    if (n % 2) ids.push(null);
    const m = ids.length, rounds = [];
    let arr = ids.slice();
    for (let r = 0; r < m - 1; r++) {
      const pairs = [];
      for (let i = 0; i < m / 2; i++) { const a = arr[i], b = arr[m - 1 - i]; if (a != null && b != null) pairs.push([a, b]); }
      rounds.push(pairs);
      arr = [arr[0], arr[m - 1], ...arr.slice(1, m - 1)];
    }
    return rounds;
  }
  function genRR(ordered, opts) {
    const pools = makePools(ordered), matches = {}, poolMap = {};
    pools.forEach((pl, p) => {
      const P = POOL_NAMES[p];
      poolMap[P] = pl.map(e => e.id);
      roundRobinPairs(pl.length).forEach((pairs, r) => pairs.forEach(([x, y], i) => {
        const id = `P${P}-${r + 1}-${i}`;
        matches[id] = { id, stage: 'P', pool: P, round: r + 1, idx: i, a: E(pl[x].id), b: E(pl[y].id) };
      }));
    });
    let advance = 0;
    if (pools.length >= 2) {
      advance = opts && opts.advance ? opts.advance : (pools.length === 2 ? 2 : 1);
      const qual = [];
      for (let place = 1; place <= advance; place++) for (let p = 0; p < pools.length; p++) if (pools[p].length >= place) qual.push({ p: POOL_NAMES[p], place });
      const size = nextPow2(qual.length);
      const so = seedOrder(size);
      const slots = so.map(s => qual[s - 1] || null);
      // avoid same-pool first-round meeting (only possible when advance>1)
      for (let i = 0; i < size; i += 2) {
        const a = slots[i], b = slots[i + 1];
        if (a && b && a.p === b.p) {
          for (let j = 0; j < size; j++) {
            if ((j >> 1) === (i >> 1) || !slots[j] || slots[j].place !== b.place) continue;
            const partner = slots[j ^ 1];
            if (slots[j].p !== a.p && (!partner || partner.p !== b.p)) { const t = slots[j]; slots[j] = b; slots[i + 1] = t; break; }
          }
        }
      }
      Object.assign(matches, genSE(slots, 'PO-', { bronze: opts && opts.bronze }));
    }
    return { pools: poolMap, matches, advance };
  }

  /**
   * Build a bracket document for a division.
   * entrants: [{id, seed?, dojo?}]
   */
  function generateBracket(division, entrants, rnd) {
    const format = division.format || 'SE';
    const ordered = orderEntrants(entrants, rnd);
    const br = { divisionId: division.id, format, entrants: ordered.map(e => e.id), bronze: division.bronze || 'two',
      reset: division.reset !== false, matches: {}, results: {}, pools: null, tiebreak: {}, createdAt: new Date().toISOString(), version: VERSION };
    if (ordered.length < 2) return br;
    if (format === 'RR') {
      const g = genRR(ordered, { advance: division.advance, bronze: br.bronze });
      br.pools = g.pools; br.matches = g.matches; br.advance = g.advance;
    } else {
      const size = nextPow2(ordered.length);
      const slots = placeSlots(ordered, size);
      br.matches = format === 'DE' ? genDE(slots, { reset: br.reset }) : genSE(slots, '', { bronze: br.bronze });
    }
    return br;
  }

  /* ---------- resolution ---------- */
  const DONE = { done: 1, bye: 1, void: 1, skip: 1 };
  function resolve(br) {
    const out = {}, M = br.matches || {}, R = br.results || {};
    const poolCache = {};
    const stack = new Set();
    function poolStanding(P) {
      if (poolCache[P]) return poolCache[P];
      const st = standings(br, P, get);
      poolCache[P] = st; return st;
    }
    function side(src) {
      if (!src) return { known: true, id: null };
      if ('e' in src) return { known: true, id: src.e };
      if (src.p) {
        const st = poolStanding(src.p);
        if (!st.complete) return { known: false, hint: `Pool ${src.p} #${src.place}` };
        const row = st.rows[src.place - 1];
        return { known: true, id: row ? row.id : null };
      }
      const r = get(src.m);
      if (!r || !DONE[r.status]) return { known: false, hint: `${src.t === 'W' ? 'Winner' : 'Loser'} ${src.m}` };
      return { known: true, id: src.t === 'W' ? r.winner : r.loser };
    }
    function get(id) {
      if (out[id]) return out[id];
      const m = M[id]; if (!m) return null;
      if (stack.has(id)) throw new Error('Cycle at ' + id);
      stack.add(id);
      let res;
      if (m.reset) {
        const g = get(m.reset);
        if (!g || !DONE[g.status]) res = { status: 'pending', a: null, b: null, hintA: 'Grand final', hintB: 'if needed' };
        else if (g.status === 'done' && g.winner === g.b && g.a && g.b) res = finish(id, g.a, g.b);
        else res = { status: 'skip', a: null, b: null, winner: g.winner, loser: g.loser };
      } else {
        const sa = side(m.a), sb = side(m.b);
        if (!sa.known || !sb.known) res = { status: 'pending', a: sa.known ? sa.id : null, b: sb.known ? sb.id : null, hintA: sa.hint, hintB: sb.hint };
        else if (sa.id && sb.id) res = finish(id, sa.id, sb.id);
        else if (sa.id || sb.id) res = { status: 'bye', a: sa.id, b: sb.id, winner: sa.id || sb.id, loser: null };
        else res = { status: 'void', a: null, b: null, winner: null, loser: null };
      }
      stack.delete(id);
      out[id] = res; return res;
    }
    function finish(id, a, b) {
      const r = R[id];
      if (r && (r.winnerId === a || r.winnerId === b)) return { status: 'done', a, b, winner: r.winnerId, loser: r.winnerId === a ? b : a, result: r };
      return { status: 'ready', a, b, stale: !!(r && r.winnerId) };
    }
    Object.keys(M).forEach(get);
    return out;
  }

  /** Pool standings. getRes: fn(matchId)->resolved */
  function standings(br, P, getRes) {
    const ids = (br.pools && br.pools[P]) || [];
    const rows = Object.fromEntries(ids.map(id => [id, { id, w: 0, l: 0, pf: 0, pa: 0, played: 0 }]));
    const pm = Object.values(br.matches).filter(m => m.stage === 'P' && m.pool === P);
    let complete = true; const h2h = {};
    for (const m of pm) {
      const r = getRes ? getRes(m.id) : null;
      if (!r || !DONE[r.status]) { complete = false; continue; }
      if (r.status !== 'done') continue;
      const res = r.result || {}, pts = res.pts || {};
      const A = rows[r.a], B = rows[r.b];
      if (!A || !B) continue;
      A.played++; B.played++;
      A.pf += +pts.a || 0; A.pa += +pts.b || 0; B.pf += +pts.b || 0; B.pa += +pts.a || 0;
      rows[r.winner].w++; rows[r.loser].l++;
      h2h[r.winner + '>' + r.loser] = true;
    }
    const tb = (br.tiebreak && br.tiebreak[P]) || [];
    const list = Object.values(rows);
    list.sort((x, y) => y.w - x.w);
    // resolve ties inside equal-win groups
    const outRows = []; let tie = false;
    for (let i = 0; i < list.length;) {
      let j = i; while (j < list.length && list[j].w === list[i].w) j++;
      let grp = list.slice(i, j);
      if (grp.length === 2 && (h2h[grp[1].id + '>' + grp[0].id] || h2h[grp[0].id + '>' + grp[1].id])) {
        if (h2h[grp[1].id + '>' + grp[0].id]) grp = [grp[1], grp[0]];
      } else if (grp.length > 1) {
        grp.sort((x, y) => (y.pf - y.pa) - (x.pf - x.pa) || y.pf - x.pf || tbIdx(tb, x.id) - tbIdx(tb, y.id));
        for (let q = 1; q < grp.length; q++) {
          const x = grp[q - 1], y = grp[q];
          if (x.pf - x.pa === y.pf - y.pa && x.pf === y.pf && tbIdx(tb, x.id) === tbIdx(tb, y.id)) { tie = true; x.tied = y.tied = true; }
        }
      }
      outRows.push(...grp); i = j;
    }
    return { rows: outRows, complete, tie: complete && tie };
  }
  function tbIdx(tb, id) { const i = tb.indexOf(id); return i < 0 ? 999 : i; }

  /** Final placings of a bracket: {complete, gold, silver, bronze:[], fourth} */
  function placings(br, res) {
    res = res || resolve(br);
    const n = (br.entrants || []).length;
    const out = { complete: false, gold: null, silver: null, bronze: [] };
    if (n === 0) return out;
    if (n === 1) { out.gold = br.entrants[0]; out.complete = true; return out; }
    const allDone = Object.keys(br.matches).every(id => DONE[res[id].status]);
    const fin = (id) => res[id] && DONE[res[id].status] ? res[id] : null;
    if (br.format === 'RR' && !br.matches['PO-W1-0']) {
      const P = Object.keys(br.pools)[0];
      const st = standings(br, P, id => res[id]);
      if (st.complete && !st.tie) {
        out.gold = st.rows[0] ? st.rows[0].id : null; out.silver = st.rows[1] ? st.rows[1].id : null;
        if (st.rows[2]) out.bronze = [st.rows[2].id];
        out.complete = true;
      }
      out.tie = st.tie;
      return out;
    }
    const P = br.format === 'RR' ? 'PO-' : '';
    if (br.format === 'DE') {
      const gf2 = fin('GF2'), gf = fin('GF');
      const last = gf2 && gf2.status === 'done' ? gf2 : gf;
      if (last && (!br.matches.GF2 || gf2)) {
        out.gold = last.winner; out.silver = last.loser;
        const lids = Object.keys(br.matches).filter(id => br.matches[id].stage === 'L');
        if (lids.length) {
          const maxR = Math.max(...lids.map(id => br.matches[id].round));
          const lf = fin(`L${maxR}-0`);
          if (lf && lf.loser) out.bronze = [lf.loser];
        }
      }
    } else {
      const ks = Object.values(br.matches).filter(m => (m.stage === 'W' || m.stage === 'PO'));
      const k = Math.max(...ks.map(m => m.round));
      const f = fin(`${P}W${k}-0`);
      if (f) { out.gold = f.winner; out.silver = f.loser; }
      if (br.bronze === 'match' && br.matches[`${P}B`]) {
        const b = fin(`${P}B`); if (b && b.winner) { out.bronze = [b.winner]; out.fourth = b.loser; }
      } else if (k >= 2) {
        for (const id of [`${P}W${k - 1}-0`, `${P}W${k - 1}-1`]) { const s = fin(id); if (s && s.loser) out.bronze.push(s.loser); }
      }
    }
    out.complete = allDone && !!out.gold;
    return out;
  }

  /** Matches that can be fought now, in call order. */
  function readyMatches(br, res) {
    res = res || resolve(br);
    const order = { P: 0, W: 1, L: 1, PO: 2, B: 3, GF: 4 };
    return Object.values(br.matches).filter(m => res[m.id].status === 'ready')
      .sort((x, y) => (order[x.stage] - order[y.stage]) || (x.round - y.round) || String(x.pool || '').localeCompare(String(y.pool || '')) || (x.idx - y.idx) || (x.stage === 'L') - (y.stage === 'L'));
  }
  /** Can the result of this match be changed? Not if any downstream match that uses it already has a result. */
  function canEdit(br, matchId, res) {
    res = res || resolve(br);
    const m0 = br.matches[matchId];
    for (const m of Object.values(br.matches)) {
      const uses = (m.a && m.a.m === matchId) || (m.b && m.b.m === matchId) || m.reset === matchId ||
        (m0.stage === 'P' && ((m.a && m.a.p === m0.pool) || (m.b && m.b.p === m0.pool)));
      if (uses && res[m.id] && (res[m.id].status === 'done')) return false;
    }
    return true;
  }
  function matchLabel(m, br) {
    if (!m) return '';
    if (m.stage === 'P') return `Pool ${m.pool} · Round ${m.round}`;
    if (m.stage === 'GF') return m.reset ? 'Grand final (reset)' : 'Grand final';
    if (m.stage === 'B') return 'Bronze match';
    if (m.stage === 'L') return `Repechage R${m.round}`;
    const k = m.rounds || Math.max(...Object.values(br.matches).filter(x => x.stage === m.stage).map(x => x.round));
    const pre = m.stage === 'PO' ? 'Playoff ' : '';
    const left = k - m.round;
    if (left === 0) return pre + (br.format === 'DE' ? 'Winners final' : 'Final');
    if (left === 1) return pre + 'Semi-final';
    if (left === 2) return pre + 'Quarter-final';
    return `${pre}Round ${m.round}`;
  }

  /* ---------- WTKF-style scoring ---------- */
  const PTS = { ippon: 8, waza: 4, keikoku: 2, chui: 4 };
  const OTHER = { a: 'b', b: 'a' };
  /**
   * Evaluate a kumite bout from its event log.
   * log: [{s:'a'|'b', t:'waza'|'ippon'|'keikoku'|'chui'|'hansoku'|'kiken'|'hantei'} | {t:'timeup'|'ketteiend'}]
   * opts: {allowDraw, kettei:boolean}
   */
  function kumiteEval(log, opts) {
    opts = opts || {};
    const st = { a: { ippon: 0, waza: 0, keikoku: 0, chui: 0 }, b: { ippon: 0, waza: 0, keikoku: 0, chui: 0 } };
    let phase = 'regular', done = false, winner = null, method = null;
    const tech = s => st[s].ippon * PTS.ippon + st[s].waza * PTS.waza;
    const pen = s => st[s].keikoku * PTS.keikoku + st[s].chui * PTS.chui;
    const score = s => tech(s) + pen(OTHER[s]);
    const end = (w, how) => { done = true; winner = w; method = how; };
    for (const ev of log || []) {
      if (done) break;
      const s = ev.s;
      switch (ev.t) {
        case 'waza': case 'ippon': case 'keikoku': case 'chui': {
          st[s][ev.t]++;
          const scorer = (ev.t === 'waza' || ev.t === 'ippon') ? s : OTHER[s];
          if (st[scorer].ippon >= 1) end(scorer, 'Ippon');
          else if (st[scorer].waza >= 2) end(scorer, 'Awasete Ippon');
          else if (phase === 'kettei') end(scorer, 'Kettei-sen');
          break;
        }
        case 'hansoku': end(OTHER[s], 'Hansoku'); break;
        case 'kiken': end(OTHER[s], 'Kiken'); break;
        case 'hantei': if (phase === 'hantei') end(s, 'Hantei'); break;
        case 'timeup':
          if (phase !== 'regular') break;
          if (score('a') !== score('b')) end(score('a') > score('b') ? 'a' : 'b', 'Points');
          else if (opts.allowDraw) { done = true; winner = null; method = 'Hikiwake (draw)'; }
          else if (opts.kettei !== false) phase = 'kettei';
          else if (pen('a') !== pen('b')) end(pen('a') < pen('b') ? 'a' : 'b', 'Fewer penalties');
          else phase = 'hantei';
          break;
        case 'ketteiend':
          if (phase !== 'kettei') break;
          if (pen('a') !== pen('b')) end(pen('a') < pen('b') ? 'a' : 'b', 'Fewer penalties');
          else phase = 'hantei';
          break;
      }
    }
    return { done, winner, method, phase: done ? 'done' : phase, score: { a: score('a'), b: score('b') }, st };
  }
  function flagsEval(aFlags, judges) {
    const j = +judges || 5, a = +aFlags;
    if (!(a >= 0 && a <= j) || j % 2 === 0) return { done: false };
    return { done: true, winner: a > j / 2 ? 'a' : 'b', method: `Flags ${Math.max(a, j - a)}–${Math.min(a, j - a)}`, score: { a, b: j - a } };
  }
  function scoreTotal(arr, judges) {
    const v = (arr || []).slice(0, judges).map(Number);
    if (v.length !== +judges || v.some(x => !(x >= 0 && x <= 10))) return null;
    const sorted = v.slice().sort((x, y) => x - y);
    const kept = +judges >= 5 ? sorted.slice(1, -1) : sorted;
    const total = Math.round(kept.reduce((s, x) => s + x, 0) * 100) / 100;
    const all = Math.round(v.reduce((s, x) => s + x, 0) * 100) / 100;
    return { total, all, hi: sorted[sorted.length - 1], lo: sorted[0] };
  }
  /** Compare two score sheets; tie → needs flags ('tieFlags' param as aFlags). */
  function scoresEval(aArr, bArr, judges, tieFlags) {
    const A = scoreTotal(aArr, judges), B = scoreTotal(bArr, judges);
    if (!A || !B) return { done: false };
    const cmp = (A.total - B.total) || (A.all - B.all) || (A.hi - B.hi) || (A.lo - B.lo);
    if (cmp !== 0) return { done: true, winner: cmp > 0 ? 'a' : 'b', method: `Score ${A.total.toFixed(1)}–${B.total.toFixed(1)}`, score: { a: A.total, b: B.total } };
    if (tieFlags != null && tieFlags !== '') {
      const f = flagsEval(tieFlags, judges);
      if (f.done) return { done: true, winner: f.winner, method: `Tie ${A.total.toFixed(1)}, ${f.method}`, score: { a: A.total, b: B.total } };
    }
    return { done: false, tie: true, score: { a: A.total, b: B.total } };
  }
  /** Team kumite: bouts [{log}], daihyo {log} */
  function teamKumiteEval(bouts, nBouts, daihyo) {
    let wa = 0, wb = 0, pa = 0, pb = 0, complete = 0;
    const per = [];
    for (let i = 0; i < nBouts; i++) {
      const r = kumiteEval((bouts[i] || {}).log, { allowDraw: true });
      per.push(r);
      if (r.done) { complete++; pa += r.score.a; pb += r.score.b; if (r.winner === 'a') wa++; else if (r.winner === 'b') wb++; }
    }
    const res = { per, wins: { a: wa, b: wb }, pts: { a: pa, b: pb }, done: false };
    // early decision: majority of bouts already won
    const need = Math.floor(nBouts / 2) + 1;
    if (wa >= need || wb >= need) return Object.assign(res, { done: true, winner: wa > wb ? 'a' : 'b', method: `Bouts ${Math.max(wa, wb)}–${Math.min(wa, wb)}` });
    if (complete < nBouts) return res;
    if (wa !== wb) return Object.assign(res, { done: true, winner: wa > wb ? 'a' : 'b', method: `Bouts ${Math.max(wa, wb)}–${Math.min(wa, wb)}` });
    if (pa !== pb) return Object.assign(res, { done: true, winner: pa > pb ? 'a' : 'b', method: `Bouts ${wa}–${wb}, points ${Math.max(pa, pb)}–${Math.min(pa, pb)}` });
    const d = kumiteEval((daihyo || {}).log, {});
    res.daihyo = d; res.needDaihyo = true;
    if (d.done) return Object.assign(res, { done: true, winner: d.winner, method: 'Daihyo-sen · ' + d.method });
    return res;
  }
  /** Fukugo: kata flags + kumite log; split → hantei side. */
  function fukugoEval(kataFlags, judges, kumiteLog, hanteiSide) {
    const k = flagsEval(kataFlags, judges), c = kumiteEval(kumiteLog, {});
    const res = { kata: k, kumite: c, done: false };
    if (!k.done || !c.done) return res;
    if (k.winner === c.winner) return Object.assign(res, { done: true, winner: k.winner, method: 'Won kata & kumite', score: { a: (k.winner === 'a' ? 2 : 0), b: (k.winner === 'b' ? 2 : 0) } });
    res.split = true;
    if (hanteiSide === 'a' || hanteiSide === 'b') return Object.assign(res, { done: true, winner: hanteiSide, method: 'Split · Hantei', score: { a: 1, b: 1 } });
    return res;
  }

  /* ---------- medals ---------- */
  function medalTable(list) {
    // list: [{dojo, place:'gold'|'silver'|'bronze'}]
    const t = {};
    for (const x of list) {
      const k = x.dojo || '—';
      t[k] = t[k] || { dojo: k, gold: 0, silver: 0, bronze: 0 };
      t[k][x.place]++;
    }
    return Object.values(t).sort((a, b) => b.gold - a.gold || b.silver - a.silver || b.bronze - a.bronze || a.dojo.localeCompare(b.dojo));
  }

  function csvEscape(v) { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }
  function toCSV(rows) { return rows.map(r => r.map(csvEscape).join(',')).join('\n'); }

  return {
    VERSION, EVENT_TYPES, EVENT_ORDER, GENDERS, FORMATS, LEVELS, EVENT_KINDS, BLACK_AGE_GROUPS, RANKS, POOL_NAMES,
    ordinal, rankValue, rankLabel, isBlack, ageOn, ageOf, divisionName, defaultScoring, blackBeltDivisions, kyuDivisions,
    fitsDivision, candidateDivisions, teamGender, teamCandidates, assignEntrants, validateCompetitor,
    seedOrder, nextPow2, orderEntrants, placeSlots, generateBracket, resolve, standings, placings, readyMatches, canEdit, matchLabel,
    kumiteEval, flagsEval, scoreTotal, scoresEval, teamKumiteEval, fukugoEval, medalTable, toCSV, PTS,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = KT;
