/* ============================================================
   Karate Event Tracker — core logic (pure, no DOM)
   Brackets, divisions, ITKF (2009) scoring. Portable to native.
   ============================================================ */
const KT = (function () {
  'use strict';
  const VERSION = '1.2.1';

  /* ---------- reference data ---------- */
  const EVENT_TYPES = {
    IKATA:   { label: 'Individual Kata',   short: 'Kata',       team: false, genders: ['M', 'F'],      kind: 'kata',       defMethod: 'flags' },
    IKUMITE: { label: 'Individual Kumite', short: 'Kumite',     team: false, genders: ['M', 'F'],      kind: 'kumite' },
    TKATA:   { label: 'Team Kata',         short: 'Team Kata',  team: true,  genders: ['M', 'F', 'X'], kind: 'kata',       defMethod: 'scores', size: [3, 3] },
    TKUMITE: { label: 'Team Kumite',       short: 'Team Kumite',team: true,  genders: ['M', 'F'],      kind: 'teamkumite', size: [3, 5] },
    FUKUGO:  { label: 'Fukugo',            short: 'Fukugo',     team: false, genders: ['M', 'F'],      kind: 'fukugo' },
    ENBU:    { label: 'Enbu',              short: 'Enbu',       team: true,  genders: ['M', 'F', 'X'], kind: 'kata',       defMethod: 'scores', size: [2, 2] },
  };
  const EVENT_ORDER = ['IKATA', 'IKUMITE', 'TKATA', 'TKUMITE', 'FUKUGO', 'ENBU'];
  const GENDERS = { M: 'Men', F: 'Women', X: 'Mixed' };
  const FORMATS = { SE: 'Single elimination', RR: 'Round robin (pools of 4)', DE: 'Double elimination', KP: 'Kata score pools (8 per pool)' };
  const KP_POOL = 8, KP_ADV = 4;
  /** ITKF Competition Rules 2009, Kata Rules Art. 1-3 (pp. 62–63): permitted kata (Dai/Sho and series listed separately). */
  const ITKF_KATA = ['A-Nan-Kun (A-Nan-Ku)', 'Bassai (Pasai) Dai', 'Bassai (Pasai) Sho', 'Chin-tei (Chinte)', 'En-pi (Wan-Shu)', 'Gan-Kaku (Chin-To)',
    'Gojyu-Shi-Ho (U-Sei-Shi) Dai', 'Gojyu-Shi-Ho (U-Sei-Shi) Sho', 'Han-Getsu (Sei-San)', 'Ji-In', 'Ji-On', 'Jitte', 'Kan-Ku (Ku-Chan-Ku) Dai', 'Kan-Ku (Ku-Chan-Ku) Sho',
    'Shi-Ho-Ku-Chan-Ku', 'Kan-Shiwa', 'Kuru-Run-Ha', 'Ni-Jyu-Shi-Ho (Ni-Sei-Shi)', 'Mei-Kyo', 'Roh-Hai Sho-Dan', 'Roh-Hai Ni-Dan', 'Roh-Hai San-Dan', 'Sai-Ha', 'San-Se-Ru',
    'Se-San', 'Sei-En-Chin', 'Sei-Pai', 'Shi-So-Chin', 'So-Chin', 'Supa-Rin-Pan (Becchu-Rin, Hyaku-Hachi-Ho)', 'Un-Su (Un-Shu)', 'Wan-Kan'];
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
  /** ITKF defaults: kumite 1:30 with 1:30 Kettei-sen; women's individual kumite (and fukugo kumite) = Ko-go. */
  function defaultScoring(eventType, gender) {
    const et = EVENT_TYPES[eventType] || {};
    const kogo = gender === 'F' && (eventType === 'IKUMITE' || eventType === 'FUKUGO');
    return { method: et.defMethod || 'flags', judges: 5, boutTime: 90, ketteiTime: 90, bouts: 3, style: kogo ? 'kogo' : 'shobu' };
  }
  /** Default bracket format per event (ITKF): kata-type events use score pools; fukugo single elimination. */
  function defaultFormat(eventType, belt, fallback) {
    if (eventType === 'FUKUGO') return 'SE';
    if (belt === 'black' && (eventType === 'IKATA' || eventType === 'TKATA' || eventType === 'ENBU')) return 'KP';
    if (fallback === 'KP' && EVENT_TYPES[eventType].kind !== 'kata') return 'SE';
    return fallback || 'SE';
  }
  /** Standard black-belt divisions for the chosen event types. */
  function blackBeltDivisions(eventTypes, format) {
    const out = [];
    for (const et of eventTypes) for (const g of EVENT_TYPES[et].genders) for (const ag of BLACK_AGE_GROUPS) {
      const fmt = defaultFormat(et, 'black', format);
      const dv = { eventType: et, gender: g, belt: 'black', group: ag.label, minAge: ag.min, maxAge: ag.max,
        minRank: 'd1', maxRank: 'd10', format: fmt, scoring: defaultScoring(et, g), bronze: 'two', reset: true };
      if (fmt === 'KP') dv.scoring = Object.assign(dv.scoring, { method: 'scores', judges: 6 });
      dv.name = divisionName(dv); out.push(dv);
    }
    return out;
  }
  /** Kyu divisions from a director template {label,minRank,maxRank,minAge,maxAge}. */
  function kyuDivisions(tpl, eventTypes, format) {
    const out = [];
    for (const et of eventTypes) for (const g of EVENT_TYPES[et].genders) {
      const dv = { eventType: et, gender: g, belt: 'kyu', group: tpl.label, minAge: tpl.minAge ?? null, maxAge: tpl.maxAge ?? null,
        minRank: tpl.minRank || 'k10', maxRank: tpl.maxRank || 'k1', format: defaultFormat(et, 'kyu', format), scoring: defaultScoring(et, g), bronze: 'two', reset: true };
      if (dv.format === 'KP') dv.scoring = Object.assign(dv.scoring, { method: 'scores', judges: 6 });
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
  function makePools(ordered, size) {
    const n = ordered.length, np = Math.max(1, Math.ceil(n / (size || 4)));
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
    if (format === 'KP') {
      br.judges = +((division.scoring || {}).judges) || 6;
      br.scores = {};
      br.poolSize = Math.min(12, Math.max(4, +division.poolSize || KP_POOL));
      br.kataRule = division.eventType !== 'ENBU';           // ITKF Kata 2-2-B (Enbu may repeat choreography)
      br.application = division.eventType === 'TKATA';      // Synchronized kata final adds Application (Bunkai)
      // seeded competitors perform last in their pool (Kata 1-6-B)
      const seedLast = pl => pl.filter(e => !e.seed).concat(pl.filter(e => e.seed).sort((x, y) => y.seed - x.seed));
      if (ordered.length <= KP_ADV) br.kpFinal = seedLast(ordered).map(e => e.id);
      else { const pools = makePools(ordered, br.poolSize); br.kpPools = {}; pools.forEach((pl, i) => { br.kpPools[POOL_NAMES[i]] = seedLast(pl).map(e => e.id); }); }
      return br;
    }
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


  /* ---------- Kata score pools (KP) ----------
     Pools of up to 8; every competitor performs once per round and is scored by N judges (0–10).
     With 5+ judges the highest and lowest score are dropped from the total.
     Top 4 of each pool advance; when a round has a single pool it is the semifinal and its top 4
     reach the final. Final: must use a different kata than in the semifinal; semifinal total is
     carried and added to the final total. Ties: add back the dropped scores (sum of all), then re-perform. */
  function kpSheet(entry, judges) {
    if (!entry) return null;
    if (entry.hansoku) return { kata: entry.kata || '', total: 0, all: 0, avg: 0, hansoku: true };
    if (!Array.isArray(entry.s)) return null;
    const t = scoreTotal(entry.s, judges);
    if (!t) return null;
    const out = Object.assign({ kata: entry.kata || '', kataTotal: t.total, kataAll: t.all }, t);
    if (Array.isArray(entry.app)) {
      const a = scoreTotal(entry.app, judges); if (!a) return null;
      out.appTotal = a.total; out.appAll = a.all;
      out.total = Math.round((t.total + a.total) * 100) / 100; out.all = Math.round((t.all + a.all) * 100) / 100;
    }
    return out;
  }
  const kpKey = (n, id, rp) => `R${n}_${id}${rp ? '_rp' : ''}`;
  // ties: (team kata final) higher Application, then its six scores; otherwise add back all six; then Kettei-sen
  function kpCmp(a, b) {
    const app = (a.appTotal != null && b.appTotal != null) ? ((b.appTotal - a.appTotal) || (b.appAll - a.appAll)) : 0;
    return (b.total - a.total) || app || (b.all - a.all) || ((b.rpTotal ?? -1) - (a.rpTotal ?? -1)) || ((b.rpAll ?? -1) - (a.rpAll ?? -1));
  }
  function kpSame(a, b) { return kpCmp(a, b) === 0; }
  /** rank a list of rows; cutAt = protected positions (ties across the cut or inside 1..cutAt need re-perform) */
  function kpRank(rows, cutAt, needAllPlaces) {
    const done = rows.every(r => r.sheet);
    const scored = rows.filter(r => r.sheet).sort(kpCmp);
    const unscored = rows.filter(r => !r.sheet);
    const out = scored.concat(unscored);
    let place = 0;
    out.forEach((r, i) => { if (!r.sheet) { r.rank = null; return; } if (i === 0 || !kpSame(out[i - 1], r)) place = i + 1; r.rank = place; });
    const needRp = [];
    if (done) {
      for (let i = 1; i < scored.length; i++) {
        const a = scored[i - 1], b = scored[i];
        if (!kpSame(a, b)) continue;
        const matters = needAllPlaces ? i < cutAt : (i === cutAt); // tie straddles the cut (positions cutAt and cutAt+1)
        if (matters) { for (const r of scored) if (kpSame(r, a) && !needRp.includes(r.id)) needRp.push(r.id); }
      }
    }
    return { rows: out, complete: done && !needRp.length, scoredAll: done, needRp };
  }
  function kpRow(br, n, id, carry) {
    const J = br.judges || 6, S = br.scores || {};
    const sheet = kpSheet(S[kpKey(n, id)], J), rp = kpSheet(S[kpKey(n, id, true)], J);
    const row = { id, key: kpKey(n, id), sheet, kata: sheet ? sheet.kata : '', hansoku: !!(sheet && sheet.hansoku) };
    if (!sheet) return row;
    if (sheet.appTotal != null) { row.appTotal = sheet.appTotal; row.appAll = sheet.appAll; row.kataOwn = sheet.kataTotal; }
    row.own = sheet.total; row.ownAll = sheet.all;
    row.carry = carry ? carry.total : 0; row.carryAll = carry ? carry.all : 0;
    row.total = Math.round((sheet.total + row.carry) * 100) / 100;
    row.all = Math.round((sheet.all + row.carryAll) * 100) / 100;
    if (rp) { row.rpTotal = rp.total; row.rpAll = rp.all; }
    return row;
  }
  /** Derive every round of a KP bracket from the stored R1 pools + scores. */
  function kpState(br) {
    const rounds = [];
    let pools = br.kpPools || null, n = 1, finalIds = br.kpFinal || null, semiRows = null;
    while (pools) {
      const names = Object.keys(pools);
      const single = names.length === 1;
      const rd = { n, type: single ? 'semi' : 'pool', pools: {}, complete: true, needRp: [] };
      const adv = [];
      for (const P of names) {
        const rows = pools[P].map(id => kpRow(br, n, id, null));
        const rk = kpRank(rows, KP_ADV, false);
        rd.pools[P] = { order: pools[P], rows: rk.rows, complete: rk.complete, needRp: rk.needRp, scoredAll: rk.scoredAll };
        rd.needRp.push(...rk.needRp.map(id => ({ id, pool: P })));
        if (!rk.complete) rd.complete = false;
        rk.rows.slice(0, KP_ADV).forEach((r, i) => { if (r.hansoku) return; r.advance = rk.complete; adv.push({ id: r.id, place: i, total: r.total, pool: P, seq: pools[P].indexOf(r.id) }); });
      }
      rounds.push(rd);
      if (!rd.complete) return { rounds, final: null, complete: false };
      if (single) { finalIds = adv.map(a => a.id); semiRows = Object.fromEntries(rd.pools[names[0]].rows.map(r => [r.id, r])); break; }
      // next round: re-pool advancers by placing (A1,B1,C1.. then A2,B2..) in snake order, <= 8 per pool
      adv.sort((a, b) => a.place - b.place || b.total - a.total);
      // continue with pools until only eight remain, then one final-elimination pool (Kata 1-6-A)
      const np = adv.length <= 8 ? 1 : Math.max(2, Math.ceil(adv.length / (br.poolSize || KP_POOL)));
      const next = Array.from({ length: np }, () => []);
      adv.forEach((a, i) => { const row = Math.floor(i / np), col = i % np; next[row % 2 === 0 ? col : np - 1 - col].push(a); });
      pools = {};
      // performance order: lowest score first; equal → lower pool letter; same pool → who competed earlier (Kata 1-6-A remark 2)
      next.forEach((pl, i) => { pools[POOL_NAMES[i]] = pl.slice().sort((x, y) => x.total - y.total || x.pool.localeCompare(y.pool) || x.seq - y.seq).map(a => a.id); });
      n++;
    }
    if (!finalIds) return { rounds, final: null, complete: false };
    const fr = br.kpPools ? n + 1 : 1;
    // final order: lowest carried score first
    const order = semiRows ? finalIds.slice().sort((a, b) => semiRows[a].total - semiRows[b].total || semiRows[a].all - semiRows[b].all) : finalIds.slice();
    const rows = order.map(id => kpRow(br, fr, id, semiRows ? { total: semiRows[id].own, all: semiRows[id].ownAll } : null));
    const rk = kpRank(rows, Math.min(4, rows.length), true);
    const final = { n: fr, type: 'final', order, rows: rk.rows, complete: rk.complete, needRp: rk.needRp, carried: !!semiRows,
      semiKata: semiRows ? Object.fromEntries(finalIds.map(id => [id, semiRows[id].kata])) : {} };
    return { rounds, final, complete: final.complete };
  }
  function kpPlacings(br) {
    const st = kpState(br), out = { complete: false, gold: null, silver: null, bronze: [], kp: true };
    const n = (br.entrants || []).length;
    if (n === 1) return Object.assign(out, { gold: br.entrants[0], complete: true });
    if (!st.final || !st.final.complete) return out;
    const r = st.final.rows;
    return Object.assign(out, { complete: true, gold: r[0] && r[0].id, silver: r[1] && r[1].id, bronze: r[2] ? [r[2].id] : [], fourth: r[3] && r[3].id });
  }
  /** Performances waiting to be scored (current round), in performance order. */
  function kpQueue(br) {
    const st = kpState(br), out = [];
    const add = (rd, P, order, rows, needRp, label) => {
      const by = Object.fromEntries(rows.map(r => [r.id, r]));
      for (const id of order) if (!by[id].sheet) out.push({ key: kpKey(rd, id), id, round: rd, pool: P, label });
      for (const id of needRp) { const k = kpKey(rd, id, true); const again = !!(br.scores || {})[k]; out.push({ key: k, id, round: rd, pool: P, label: label + (again ? ' · Kettei-sen again' : ' · Kettei-sen'), rp: true, again }); }
    };
    const last = st.rounds[st.rounds.length - 1];
    if (st.final) add(st.final.n, 'F', st.final.order, st.final.rows, st.final.needRp, 'Final');
    else if (last) for (const P of Object.keys(last.pools)) add(last.n, P, last.pools[P].order, last.pools[P].rows, last.pools[P].needRp, `${kpRoundName(last)} · Pool ${P}`);
    return out;
  }
  function kpRoundName(rd) { return rd.type === 'final' ? 'Final' : rd.type === 'semi' ? 'Final elimination' : `Elimination round ${rd.n}`; }
  /** A score may be changed while no later round has any score. */
  function kpCanEdit(br, key) {
    const m = /^R(\d+)_/.exec(key); if (!m) return false;
    const n = +m[1];
    return !Object.keys(br.scores || {}).some(k => { const x = /^R(\d+)_/.exec(k); return x && +x[1] > n && br.scores[k]; });
  }
  /** ITKF Kata 2-2-B / 2-5-C: final elimination and finals need a kata different from the previous round;
   *  a Kettei-sen (re-perform) needs a kata different from the one that tied. Returns an error text or ''. */
  function kpKataCheck(br, key, kata) {
    if (!br.kataRule) return '';
    const norm = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!norm(kata)) return 'Enter the kata name.';
    const m = /^R(\d+)_(.+?)(_rp)?$/.exec(key); if (!m) return '';
    const n = +m[1], id = m[2], S = br.scores || {};
    if (m[3]) { const tied = S[kpKey(n, id)]; return tied && norm(tied.kata) === norm(kata) ? `Kettei-sen needs a different kata than ${tied.kata}.` : ''; }
    const st = kpState(br);
    const isFinal = st.final && st.final.n === n;
    const rd = st.rounds.find(r => r.n === n);
    if (!isFinal && !(rd && rd.type === 'semi')) return '';
    const prev = S[kpKey(n - 1, id)];
    if (prev && norm(prev.kata) === norm(kata)) return `${isFinal ? 'The final' : 'The final elimination'} needs a different kata than the previous round (${prev.kata}).`;
    return '';
  }
  function kpProgress(br) {
    const st = kpState(br); let done = 0, total = 0;
    for (const rd of st.rounds) for (const P in rd.pools) { total += rd.pools[P].rows.length; done += rd.pools[P].rows.filter(r => r.sheet).length; }
    if (st.final) { total += st.final.rows.length; done += st.final.rows.filter(r => r.sheet).length; }
    return { done, total };
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
    if (br.format === 'KP') return kpPlacings(br);
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

  /* ---------- ITKF scoring (Competition Rules 2009) ---------- */
  // Kumite scoring table at time-up (Kumite Art. 2-3-A-(4)); team table Art. 2-3-B (Ippon 10).
  const PTS = { ippon: 10, waza: 4, chui: 4, keikoku: 2, jogai: 2, tento: 1, kogoPen: 2 };
  const OTHER = { a: 'b', b: 'a' };
  const blank = () => ({ ippon: 0, waza: 0, jogai: 0, keikoku: 0, chui: 0, tento: 0 });
  /** Points, awards and flags for one side from raw counts (own counts `m`, opponent counts `o`). */
  function tally(m, o) {
    const wazaAwarded = m.waza + Math.floor(o.jogai / 2);          // 2nd Jo-gai → opponent awarded Waza-ari (Art. 1-6-B)
    const chuiAgainst = o.chui + Math.floor(o.keikoku / 2);         // 2nd Kei-koku → Chui (Art. 1-8-A)
    const score = PTS.ippon * m.ippon + PTS.waza * wazaAwarded + PTS.jogai * (o.jogai % 2)
      + PTS.chui * chuiAgainst + PTS.keikoku * (o.keikoku % 2) + PTS.tento * o.tento;
    return { wazaAwarded, score, ippon: m.ippon };
  }
  /**
   * Evaluate an Ippon Shobu kumite bout from its event log.
   * log items: {s:'a'|'b', t:'waza'|'ippon'|'jogai'|'keikoku'|'chui'|'tento'|'hansoku'|'kiken'|'hantei'} | {t:'timeup'|'ketteiend'}
   * opts: {allowDraw (team rounds: Hiki-wake allowed), kettei:boolean (Kettei-sen enabled), ketteiOnly (representative bout)}
   */
  function kumiteEval(log, opts) {
    opts = opts || {};
    let phase = opts.ketteiOnly ? 'kettei' : 'regular', done = false, winner = null, method = null;
    let st = { a: blank(), b: blank() }, regular = null;
    const T = () => ({ a: tally(st.a, st.b), b: tally(st.b, st.a) });
    const end = (w, how) => { done = true; winner = w; method = how; };
    for (const ev of log || []) {
      if (done) break;
      const s = ev.s;
      switch (ev.t) {
        case 'waza': case 'ippon': case 'jogai': case 'keikoku': case 'chui': case 'tento': {
          st[s][ev.t]++;
          const t = T();
          for (const x of ['a', 'b']) {
            if (t[x].ippon >= 1) { end(x, phase === 'kettei' ? 'Kettei-sen · Ippon' : 'Ippon'); break; }
            if (t[x].wazaAwarded >= 2) { end(x, phase === 'kettei' ? 'Kettei-sen · Awase-waza' : 'Awase-waza'); break; }
            if (phase === 'kettei' && t[x].wazaAwarded >= 1) { end(x, 'Kettei-sen · Waza-ari'); break; }
          }
          break;
        }
        case 'hansoku': end(OTHER[s], 'Han-soku'); break;
        case 'kiken': end(OTHER[s], 'Ki-ken'); break;
        case 'hantei': if (phase === 'hantei') end(s, 'Hantei (Court Judges)'); break;
        case 'timeup': {
          if (phase !== 'regular') break;
          const t = T();
          regular = { a: t.a.score, b: t.b.score };
          if (t.a.score !== t.b.score) end(t.a.score > t.b.score ? 'a' : 'b', 'Points');
          else if (opts.allowDraw) { done = true; winner = null; method = 'Hiki-wake'; }
          else if (opts.kettei !== false) { phase = 'kettei'; st = { a: blank(), b: blank() }; }  // no carry-over
          else phase = 'hantei';
          break;
        }
        case 'ketteiend': if (phase === 'kettei') phase = 'hantei'; break;
      }
    }
    const t = T();
    const cur = { a: t.a.score, b: t.b.score };
    const warn = [];
    for (const x of ['a', 'b']) if (st[x].chui + Math.floor(st[x].keikoku / 2) >= 2 && !done) warn.push(x);
    return { done, winner, method, phase: done ? 'done' : phase, score: regular && phase !== 'regular' ? regular : cur, cur, st, kettei: phase !== 'regular' && !opts.ketteiOnly, hansokuDue: warn };
  }
  /**
   * Ko-go Kumite (ITKF Ko-go Rules): six exchanges, Aka attacks 1–3, Shiro 4–6; each exchange independent.
   * Kettei-sen: six exchanges alternating from Aka; first Waza-ari/Ippon wins, else total, else Court Judges.
   * log items: {s, t:'waza'|'ippon'|'jikan'|'kakushi'|'saki'|'nigetai'|'keikoku'|'chui'|'jogai'|'tento'|'hansoku'|'kiken'|'hantei'} | {t:'next'}
   */
  function kogoEval(log, opts) {
    opts = opts || {};
    let phase = opts.ketteiOnly ? 'kettei' : 'regular', ex = 1, done = false, winner = null, method = null, regular = null;
    let sc = { a: 0, b: 0 };
    const end = (w, how) => { done = true; winner = w; method = how; };
    const pen = { jikan: 2, kakushi: 2, saki: 2, nigetai: 2, keikoku: 2, jogai: 2, chui: 4, tento: 1 };
    for (const ev of log || []) {
      if (done) break;
      const s = ev.s;
      if (ev.t === 'waza' || ev.t === 'ippon') {
        sc[s] += ev.t === 'ippon' ? PTS.ippon : PTS.waza;
        if (phase === 'kettei') end(s, 'Kettei-sen · ' + (ev.t === 'ippon' ? 'Ippon' : 'Waza-ari'));
      } else if (pen[ev.t]) sc[OTHER[s]] += pen[ev.t];
      else if (ev.t === 'hansoku') end(OTHER[s], 'Han-soku');
      else if (ev.t === 'kiken') end(OTHER[s], 'Ki-ken');
      else if (ev.t === 'hantei' && phase === 'hantei') end(s, 'Hantei (Court Judges)');
      else if (ev.t === 'next') {
        if (phase === 'hantei') continue;
        if (ex < 6) { ex++; continue; }
        // six exchanges finished
        if (sc.a !== sc.b) { end(sc.a > sc.b ? 'a' : 'b', phase === 'kettei' ? 'Kettei-sen · Points' : 'Points'); if (phase === 'regular') regular = Object.assign({}, sc); continue; }
        if (phase === 'regular') {
          regular = Object.assign({}, sc);
          if (opts.allowDraw) { done = true; method = 'Hiki-wake'; continue; }
          // equal scores, including no score at all → Kettei-sen; first Waza-ari or Ippon wins
          phase = 'kettei'; ex = 1; sc = { a: 0, b: 0 };
        }
        else phase = 'hantei';
      }
    }
    const offense = phase === 'kettei' ? (ex % 2 === 1 ? 'a' : 'b') : (ex <= 3 ? 'a' : 'b');
    return { done, winner, method, phase: done ? 'done' : phase, exchange: ex, offense, cur: sc, score: regular && phase !== 'regular' ? regular : (done && regular ? regular : sc), kettei: phase !== 'regular' };
  }
  function flagsEval(aFlags, judges) {
    const j = +judges || 5, a = +aFlags;
    if (!(a >= 0 && a <= j) || a * 2 === j) return { done: false };
    return { done: true, winner: a > j / 2 ? 'a' : 'b', method: `Flags ${Math.max(a, j - a)}–${Math.min(a, j - a)}`, score: { a, b: j - a } };
  }
  /** Judges' scores: highest & lowest dropped (5+ judges); ITKF announces the average of the rest (Kata Art. 3-2-D). */
  function scoreTotal(arr, judges) {
    const v = (arr || []).slice(0, judges).map(Number);
    if (v.length !== +judges || v.some(x => !(x >= 0 && x <= 10))) return null;
    const sorted = v.slice().sort((x, y) => x - y);
    const kept = +judges >= 5 ? sorted.slice(1, -1) : sorted;
    const total = Math.round(kept.reduce((s, x) => s + x, 0) * 100) / 100;
    const all = Math.round(v.reduce((s, x) => s + x, 0) * 100) / 100;
    return { total, all, avg: Math.round(total / kept.length * 1000) / 1000, kept: kept.length, hi: sorted[sorted.length - 1], lo: sorted[0] };
  }
  /** Head-to-head score comparison; tie after adding back dropped scores → Court Judges decide (tieSide). */
  function scoresEval(aArr, bArr, judges, tieSide) {
    const A = scoreTotal(aArr, judges), B = scoreTotal(bArr, judges);
    if (!A || !B) return { done: false };
    const cmp = (A.total - B.total) || (A.all - B.all);
    const f = x => x.avg.toFixed(2);
    if (cmp !== 0) return { done: true, winner: cmp > 0 ? 'a' : 'b', method: `Score ${f(A)}–${f(B)}`, score: { a: A.avg, b: B.avg } };
    if (tieSide === 'a' || tieSide === 'b') return { done: true, winner: tieSide, method: `Tie ${f(A)} · Court Judges`, score: { a: A.avg, b: B.avg } };
    return { done: false, tie: true, score: { a: A.avg, b: B.avg } };
  }
  /** Team Kumite (ITKF Art. 2-3-B): 3 rounds, higher team total wins; tie → Kettei-sen by Representative.
   *  Any member Han-soku → team Han-soku; any member Ki-ken → team forfeit. */
  function teamKumiteEval(bouts, nBouts, daihyo, kogo) {
    const E = kogo ? kogoEval : kumiteEval;
    let pa = 0, pb = 0, complete = 0;
    const per = [];
    const res = { per, pts: { a: 0, b: 0 }, done: false };
    for (let i = 0; i < nBouts; i++) {
      const r = E((bouts[i] || {}).log, { allowDraw: true });
      per.push(r);
      if (r.done && (r.method === 'Han-soku' || r.method === 'Ki-ken')) {
        return Object.assign(res, { done: true, winner: r.winner, method: `${r.method} (team) · round ${i + 1}` });
      }
      const s = r.done ? r.score : r.cur;
      pa += s.a; pb += s.b;
      if (r.done) complete++;
    }
    res.pts = { a: pa, b: pb };
    if (complete < nBouts) return res;
    if (pa !== pb) return Object.assign(res, { done: true, winner: pa > pb ? 'a' : 'b', method: `Team score ${Math.max(pa, pb)}–${Math.min(pa, pb)}` });
    const d = kumiteEval((daihyo || {}).log, { ketteiOnly: true });
    res.daihyo = d; res.needDaihyo = true;
    if (d.done) return Object.assign(res, { done: true, winner: d.winner, method: 'Representative · ' + d.method });
    return res;
  }
  /** Fukugo (ITKF Fukugo Art. 1-3): single elimination alternating Kumite and Ki-tei.
   *  Final = Kumite, semi-final = Ki-tei, and so on back; third-place match = Kumite. */
  function fukugoPart(m, br) {
    if (!m) return 'kumite';
    if (m.stage === 'B') return 'kumite';
    const k = m.rounds || Math.max(...Object.values(br.matches).filter(x => x.stage === m.stage).map(x => x.round));
    return (k - m.round) % 2 === 0 ? 'kumite' : 'kitei';
  }
  /** Ki-tei: both perform the designated kata; 5 judges each raise Aka or Shiro (no tie). */
  function kiteiEval(flags, judges) {
    const j = +judges || 5, fl = flags || [];
    if (fl.filter(Boolean).length < j) return { done: false };
    const r = flagsEval(fl.filter(x => x === 'a').length, j);
    return r.done ? Object.assign(r, { method: 'Ki-tei · ' + r.method }) : r;
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
    seedOrder, nextPow2, orderEntrants, kpState, kpPlacings, kpQueue, kpKataCheck, defaultFormat, ITKF_KATA, kpCanEdit, kpProgress, kpKey, kpRoundName, KP_POOL, KP_ADV, placeSlots, generateBracket, resolve, standings, placings, readyMatches, canEdit, matchLabel,
    kumiteEval, kogoEval, flagsEval, scoreTotal, scoresEval, teamKumiteEval, fukugoPart, kiteiEval, medalTable, toCSV, PTS,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = KT;
