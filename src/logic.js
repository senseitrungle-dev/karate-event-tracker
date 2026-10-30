/* ============================================================
   Karate Event Tracker — core logic (pure, no DOM)
   Brackets, divisions, WTKF (2009) scoring. Portable to native.
   ============================================================ */
const KT = (function () {
  'use strict';
  const VERSION = '1.57.0';

  /* ---------- reference data ---------- */
  const EVENT_TYPES = {
    IKATA:   { label: 'Individual Kata',   short: 'Kata',       team: false, genders: ['M', 'F'],      kind: 'kata',       defMethod: 'flags' },
    IKUMITE: { label: 'Individual Kumite', short: 'Kumite',     team: false, genders: ['M', 'F'],      kind: 'kumite' },
    TKATA:   { label: 'Team Kata',         short: 'Team Kata',  team: true,  genders: ['M', 'F', 'X'], kind: 'kata',       defMethod: 'scores', size: [3, 3] },
    TKUMITE: { label: 'Team Kumite',       short: 'Team Kumite',team: true,  genders: ['M', 'F'],      kind: 'teamkumite', size: [3, 5] },
    FUKUGO:  { label: 'Fukugo',            short: 'Fukugo',     team: false, genders: ['M', 'F'],      kind: 'fukugo' },
    ENBU:    { label: 'Enbu',              short: 'Enbu',       team: true,  genders: ['M', 'F', 'X'], kind: 'kata',       defMethod: 'scores', size: [2, 2] },  // pair; a division can set its own size (WTKF 2026 Cadet & Junior Enbu = 3)
  };
  const EVENT_ORDER = ['IKATA', 'IKUMITE', 'TKATA', 'TKUMITE', 'FUKUGO', 'ENBU'];
  const GENDERS = { M: 'Men', F: 'Women', X: 'Mixed' };
  const FORMATS = { SE: 'Single elimination', RR: 'Round robin (pools)', DE: 'Double elimination', DES: 'Double elimination (simplified)', KP: 'Kata score pools (12 max per pool)' };
  const ELIM_POOL = 8;
  const KP_POOL = 8, KP_ADV = 4;
  /** WTKF Competition Rules 2009, Kata Rules Art. 1-3 (pp. 62–63): permitted kata (Dai/Sho and series listed separately). */
  const WTKF_KATA = ['A-Nan-Kun (A-Nan-Ku)', 'Bassai (Pasai) Dai', 'Bassai (Pasai) Sho', 'Chin-tei (Chinte)', 'En-pi (Wan-Shu)', 'Gan-Kaku (Chin-To)',
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
    return `${who}${grp} ${dv.open ? 'Open' : GENDERS[dv.gender] || ''} ${et ? et.label : ''}`.replace(/\s+/g, ' ').trim();
  }
  /** WTKF defaults: kumite 1:30 with 1:30 Kettei-sen; women's individual kumite (and fukugo kumite) = Ko-go. */
  function defaultScoring(eventType) {
    const et = EVENT_TYPES[eventType] || {};
    return { method: et.defMethod || 'flags', judges: 5, boutTime: 90, ketteiTime: 90, bouts: 3, style: 'shobu' };
  }
  const KUMITE_EVENTS = { IKUMITE: 1, TKUMITE: 1, FUKUGO: 1 };
  /** Default kumite style (director 2026-10-01): black belt Senior & Youth → regular (Shobu Ippon), Junior & Cadet (≤18) → Ko-go;
   *  kyu divisions limited to brown belts (3rd–1st kyu) → Ko-go; other kyu divisions → regular until the director chooses. Gender does not matter. */
  function defaultStyle(dv) {
    if (!dv || !KUMITE_EVENTS[dv.eventType]) return 'shobu';
    if (dv.belt === 'black') {
      if (dv.group === 'Junior' || dv.group === 'Cadet') return 'kogo';
      if (dv.maxAge != null && dv.maxAge !== '' && +dv.maxAge <= 18) return 'kogo';
      return 'shobu';
    }
    const lo = rankValue(dv.minRank), hi = rankValue(dv.maxRank);
    if (lo != null && hi != null && lo >= -3 && hi <= -1) return 'kogo';
    return 'shobu';
  }
  /** Default bracket format per event (WTKF): kata-type events use score pools; fukugo single elimination. */
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
        minRank: 'd1', maxRank: 'd10', format: fmt, scoring: defaultScoring(et), bronze: 'two', reset: false };
      dv.scoring.style = defaultStyle(dv);
      if (fmt === 'KP') dv.scoring = Object.assign(dv.scoring, { method: 'scores', judges: 6 });
      dv.name = divisionName(dv); out.push(dv);
    }
    return out;
  }
  /* ---------- v1.29: WTKF World Championship 2026 rule set (Information Package, Washington DC, 17–20 Nov 2026, §III, §V, §VII) ----------
     Ages by birth year (age on 31 Dec 2026): Cadet 14–15 (born 2011–12), Junior 16–17 (2009–10), Youth 18–20 (2006–08), Senior 21+ (2005 and before).
     Shodan or higher only. Quota per National Federation: 3 athletes per individual category, 1 team per team category.
     Cadet/Junior kumite & fuku-go = Ko-go Kumite; Youth/Senior = Jiyu Kumite (Shobu Ippon). Judges Class A(6) / B(5) / C(4). */
  const WTKF_WORLDS_2026 = {
    id: 'wtkf-worlds-2026', label: 'WTKF World Championship 2026', source: 'XXII WTKF Traditional Karate World Championship — Information Package (Washington DC, 17–20 Nov 2026)',
    level: 'International', ageAsOf: '2026-12-31', judgeMin: 4, quota: 3, teamQuota: 1,
    groups: { CAD: ['Cadet', 14, 15], JUN: ['Junior', 16, 17], YOU: ['Youth', 18, 20], SEN: ['Senior', 21, null], CJ: ['Cadet & Junior', 14, 17], YS: ['Youth & Senior', 18, null] },
    // [group, eventType, genders, team size]
    cats: [
      ...['CAD', 'JUN', 'YOU', 'SEN'].flatMap(g => [[g, 'IKATA', ['F', 'M']], [g, 'FUKUGO', ['F', 'M']], [g, 'IKUMITE', ['F', 'M']]]),
      ['CJ', 'TKATA', ['F', 'M'], [3, 3]], ['CJ', 'ENBU', ['M', 'X'], [3, 3]],
      ['YS', 'TKATA', ['M', 'F'], [3, 3]], ['YS', 'ENBU', ['M', 'X'], [2, 2]], ['YS', 'TKUMITE', ['M', 'F'], [3, 4]],
    ],
  };
  /* ---------- v1.31: Traditional Karate North Central Region (AAKF) — Tournament Rules for Kyu Rank Competitors v3.3 (Oct 2022) ----------
     Levels: 1 = white belt, 9th & 8th kyu · 2 = 7th & 6th · 3 = 5th & 4th · 4 = 3rd–1st. Events: Individual Kata, Individual Kumite, Team (synchronized) Kata, Enbu.
     Pools of up to 6, round robin or double elimination; kata first, then kumite. Kata head-to-head, flags, 3–5 judges, allowed kata per level.
     Team kata: score, highest total wins. Kumite: level-specific exchange formats (L1–L3), L4 = WTKF Ko-go. Youth ≤ 17 / Adult 18+ (as for black belts). */
  const NCR_LEVELS = [
    { n: 1, label: 'Level 1', ranks: ['k10', 'k8'], kata: ['Heian Shodan', 'Heian Nidan'], style: 'ncr1' },
    { n: 2, label: 'Level 2', ranks: ['k7', 'k6'], kata: ['Heian Sandan', 'Heian Yondan'], style: 'ncr2' },
    { n: 3, label: 'Level 3', ranks: ['k5', 'k4'], kata: ['Heian Godan', 'Tekki Shodan'], style: 'ncr3' },
    { n: 4, label: 'Level 4', ranks: ['k3', 'k1'], kata: ['Bassai Dai', 'Jion', 'Empi', 'Kanku Dai'], style: 'kogo' },
  ];
  const NCR_KYU = { id: 'ncr-kyu', label: 'NCR kyu rules (v3.3)', source: 'Traditional Karate North Central Region (AAKF) — Tournament Rules for Kyu Rank Competitors, v3.3, Oct 2022',
    levels: NCR_LEVELS, events: ['IKATA', 'IKUMITE', 'TKATA', 'ENBU'], ages: { youth: ['Youth', null, 17], adult: ['Adult', 18, null] }, poolSize: 6 };
  /** NCR kyu divisions. o: { byAge: true, byGender: true, format: 'RR'|'DE', judges: 3|5, events: [...] } */
  function ncrDivisions(o) {
    o = Object.assign({ byAge: true, byGender: true, format: 'RR', judges: 3, events: NCR_KYU.events }, o || {});
    const ages = o.byAge ? [NCR_KYU.ages.youth, NCR_KYU.ages.adult] : [['', null, null]], out = [];
    // levels: the event's own list (v1.32) or NCR v3.3
    const LV = (o.groups && o.groups.length ? o.groups : defaultKyuGroups()).map((g, i) => ({ n: i + 1, label: g.label, ranks: [g.minRank, g.maxRank], kata: g.kata || [], decide: g.decide || 'flags', exchanges: (g.exchanges || []).filter(Boolean), custom: !!(o.groups && o.groups.length) }));
    LV.forEach(L => ages.forEach(([ag, min, max], ai) => o.events.forEach((et, ei) => {
      const T = EVENT_TYPES[et], team = T.team;
      const genders = team || !o.byGender ? [null] : ['F', 'M'];
      genders.forEach((g, gi) => {
        const dv = { eventType: et, gender: g || 'X', open: !g, belt: 'kyu', group: [L.label, ag].filter(Boolean).join(' '), level: L.n, minAge: min, maxAge: max,
          minRank: L.ranks[0], maxRank: L.ranks[1], bronze: 'two', reset: false, preset: NCR_KYU.id, order: L.n * 1000 + ai * 100 + ei * 10 + gi };
        if (team) { dv.format = 'KP'; dv.scoring = Object.assign(defaultScoring(et), { method: 'scores', judges: o.judges }); dv.poolSize = 8; }
        else { dv.format = o.format; dv.rrPoolSize = NCR_KYU.poolSize; if (o.format === 'DE') dv.poolCount = 0; dv.scoring = Object.assign(defaultScoring(et), { method: 'flags', judges: o.judges }); }
        if (et === 'IKUMITE') {   // the level decides, not age/rank defaults
          if (L.decide === 'kogo') dv.scoring.style = 'kogo';
          else Object.assign(dv.scoring, { style: 'kyux', exchanges: L.exchanges.slice(), decide: L.decide === 'points' ? 'points' : 'flags' });
          dv.scoring.styleExplicit = true;
        }
        if (et === 'IKATA' || et === 'TKATA') dv.kataList = L.kata.slice();
        dv.name = divisionName(dv); out.push(dv);
      });
    })));
    return out;
  }
  /** NCR kumite Levels 1–3 (Level 4 = Ko-go). Exchanges per side, attacker first Aka then Shiro.
   *  L1/L2: no points — after the exchanges the Court Judges decide (hantei, flags); contact → Han-soku (L2: after a verbal warning).
   *  L3: Waza-ari only, Saki 2 / Chui 4 points to the opponent, points decide, tie → hantei. */
  const NCR_EX = {
    1: [['jodan', 'Jodan oi-tsuki', 'jodan tsuki'], ['chudan', 'Chudan oi-tsuki', 'chudan tsuki']],
    2: [['jodan', 'Jodan oi-tsuki', 'jodan tsuki'], ['chudan', 'Chudan oi-tsuki', 'chudan tsuki'], ['geri', 'Chudan mae-geri (back leg)', 'chudan mae-geri']],
    3: [['tsuki', 'Tsuki waza — one punch, jodan or chudan', 'tsuki waza'], ['geri', 'Geri waza — mae-geri or mawashi-geri, chudan', 'geri waza'], ['ippon', 'Ippon waza — any one punch or kick', 'ippon waza']],
  };
  /** Kyu kumite with a list of exchanges (each side attacks through the whole list: Aka first, then Shiro).
   *  cfg: { exchanges: ['Jodan oi-tsuki', …] or [[id, name, call], …], decide: 'flags' | 'points' }.
   *  flags: no points — after the exchanges the Court Judges decide (hantei); contact → warning / Han-soku.
   *  points: Waza-ari, Saki 2 / Chui 4 to the opponent; points decide, a tie → hantei. */
  function kyuEval(log, cfg) {
    const ex = (cfg.exchanges || []).map(e => Array.isArray(e) ? e : [String(e), String(e), String(e).toLowerCase()]).filter(e => e[1]);
    const L = Math.max(1, ex.length), N = L * 2, points = cfg.decide === 'points';
    let i = 1, done = false, winner = null, method = null, phase = 'regular';
    const sc = { a: 0, b: 0 }, warn = { a: 0, b: 0 };
    const end = (w, how) => { done = true; winner = w; method = how; };
    const pen = points ? { saki: 2, chui: 4 } : {};
    const finish = () => { if (points && sc.a !== sc.b) end(sc.a > sc.b ? 'a' : 'b', 'Points'); else phase = 'hantei'; };
    for (const e of log || []) {
      if (done) break;
      const s = e.s;
      if (e.t === 'next') { if (phase !== 'regular') continue; if (i < N) i++; else finish(); }
      else if (e.t === 'waza' && points && phase === 'regular') sc[s] += PTS.waza;
      else if (pen[e.t]) sc[OTHER[s]] += pen[e.t];
      else if (e.t === 'keikoku') warn[s]++;
      else if (e.t === 'hansoku') end(OTHER[s], cfg.level === 1 ? 'Han-soku (contact)' : 'Han-soku');
      else if (e.t === 'kiken') end(OTHER[s], 'Ki-ken');
      else if (e.t === 'hantei' && phase === 'hantei') end(s, 'Hantei (Court Judges’ flags)');
    }
    const k = (i - 1) % L, offense = i <= L ? 'a' : 'b', cur = ex[k] || ['', '—', '—'];
    return { done, winner, method, phase: done ? 'done' : phase, exchange: i, total: N, offense, tech: cur[1], call: `${offense === 'a' ? 'Aka' : 'Shiro'} ${cur[2]} — hajime`, cur: sc, score: sc, warn, level: cfg.level || 0, decide: points ? 'points' : 'flags' };
  }
  function ncrEval(log, level) { return kyuEval(log, { exchanges: NCR_EX[level] || NCR_EX[1], decide: level === 3 ? 'points' : 'flags', level }); }
  /** Default editable kyu levels for an event = NCR v3.3 (exchange lists as plain technique names). */
  function defaultKyuGroups() {
    return NCR_LEVELS.map(L => ({ id: 'L' + L.n, label: L.label, minRank: L.ranks[0], maxRank: L.ranks[1], kata: L.kata.slice(),
      decide: L.style === 'kogo' ? 'kogo' : L.n === 3 ? 'points' : 'flags', exchanges: L.style === 'kogo' ? [] : NCR_EX[L.n].map(e => e[1]) }));
  }
  /** Check an event's kyu level list: [] if fine, else messages. Also returns gaps (ranks not covered) separately. */
  function kyuGroupsCheck(groups) {
    const err = [], seen = {};
    (groups || []).forEach((g, i) => {
      const n = g.label || `Level ${i + 1}`, lo = rankValue(g.minRank), hi = rankValue(g.maxRank);
      if (!g.label) err.push(`Level ${i + 1} needs a name.`);
      if (lo == null || hi == null || lo > 0 || hi > 0) err.push(`${n}: choose kyu ranks.`);
      else if (lo > hi) err.push(`${n}: lowest rank is above highest rank.`);
      else for (let v = lo; v <= hi; v++) { if (seen[v]) err.push(`${n} and ${seen[v]} both include ${rankLabel('k' + -v)}.`); seen[v] = n; }
      if (g.decide !== 'kogo' && !(g.exchanges || []).filter(Boolean).length) err.push(`${n}: list at least one exchange (or choose WTKF Ko-go).`);
    });
    const gaps = []; for (let k = 10; k >= 1; k--) if (!seen[-k]) gaps.push('k' + k);
    return { errors: [...new Set(err)], gaps };
  }
  const NCR_STYLES = { ncr1: 1, ncr2: 2, ncr3: 3 };
  const PRESETS = { [WTKF_WORLDS_2026.id]: WTKF_WORLDS_2026 };
  PRESETS[NCR_KYU.id] = NCR_KYU;
  function presetDivisions(pr) {
    const out = [];
    pr.cats.forEach(([gk, et, genders, size], ci) => genders.forEach((g, gi) => {
      const [label, min, max] = pr.groups[gk], T = EVENT_TYPES[et];
      const dv = { eventType: et, gender: g, belt: 'black', group: label, minAge: min, maxAge: max, minRank: 'd1', maxRank: 'd10',
        format: defaultFormat(et, 'black', 'SE'), scoring: defaultScoring(et), bronze: 'two', reset: false, preset: pr.id, quota: T.team ? pr.teamQuota : pr.quota, order: ci * 10 + gi };
      if (size) dv.teamSize = size;
      dv.scoring.style = KUMITE_EVENTS[et] ? (max != null && max <= 17 ? 'kogo' : 'shobu') : 'shobu';
      if (dv.format === 'KP') dv.scoring = Object.assign(dv.scoring, { method: 'scores', judges: 6 });
      dv.name = divisionName(dv); out.push(dv);
    }));
    return out;
  }
  /** National-federation quota: groups (country / region / dojo key) with more entrants than the division allows. */
  function quotaIssues(dv, entrantIds, groupOf) {
    const max = +dv.quota || 0; if (!max) return [];
    const n = {}; for (const id of entrantIds || []) { const g = groupOf(id) || ''; if (g) n[g] = (n[g] || 0) + 1; }
    return Object.entries(n).filter(([, k]) => k > max).map(([group, k]) => ({ group, n: k, max }));
  }
  /** Team size allowed in a division (division setting wins over the event type). */
  function teamSizeFor(dv, eventType) { const s = dv && Array.isArray(dv.teamSize) ? dv.teamSize : (EVENT_TYPES[eventType || (dv && dv.eventType)] || {}).size; return s || [1, 99]; }
  /** Kyu divisions from a director template {label,minRank,maxRank,minAge,maxAge}. */
  function kyuDivisions(tpl, eventTypes, format) {
    const out = [];
    for (const et of eventTypes) for (const g of EVENT_TYPES[et].genders) {
      const dv = { eventType: et, gender: g, belt: 'kyu', group: tpl.label, minAge: tpl.minAge ?? null, maxAge: tpl.maxAge ?? null,
        minRank: tpl.minRank || 'k10', maxRank: tpl.maxRank || 'k1', format: defaultFormat(et, 'kyu', format), scoring: defaultScoring(et), bronze: 'two', reset: false };
      dv.scoring.style = defaultStyle(dv);
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
  /** v1.37: international events keep only the year of birth → age on 31 December of the event year (WTKF birth-year rule) */
  function ageFromYear(y, asOf) { const Y = +String(asOf || '').slice(0, 4); return +y > 1900 && Y ? Y - +y : null; }
  function ageOf(c, asOf) { return c.dob ? ageOn(c.dob, asOf) : c.birthYear ? ageFromYear(c.birthYear, asOf) : (c.age == null || c.age === '' ? null : +c.age); }
  function candidateDivisions(comp, eventType, divisions, asOf) {
    const age = ageOf(comp, asOf);
    return divisions.filter(dv => dv.eventType === eventType && (dv.gender === comp.gender || dv.open) && fitsDivision(dv, [age], [comp.rank]))
      .sort((x, y) => (x.open ? 1 : 0) - (y.open ? 1 : 0) || spanOf(x) - spanOf(y) || (x.order || 0) - (y.order || 0) || String(x.id).localeCompare(String(y.id)));
  }
  function teamGender(members) {
    const g = new Set(members.map(m => m.gender));
    return g.size === 1 ? [...g][0] : 'X';
  }
  function teamCandidates(team, members, divisions, asOf) {
    const g = teamGender(members);
    const ages = members.map(m => ageOf(m, asOf)), ranks = members.map(m => m.rank);
    return divisions.filter(dv => dv.eventType === team.eventType && (dv.gender === g || dv.open) && fitsDivision(dv, ages, ranks))
      .sort((x, y) => (x.open ? 1 : 0) - (y.open ? 1 : 0) || spanOf(x) - spanOf(y) || (x.order || 0) - (y.order || 0));
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
    if (!c.dob && !c.birthYear) p.push('Date of birth');
    else { const a = c.dob ? ageOn(c.dob, asOf) : ageFromYear(c.birthYear, asOf); if (a == null || a < 3 || a > 110) p.push('Valid date of birth'); }
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
  /** v1.56: division printout per country / region / club (the owner's "Division printout" sheet).
      divs: [{id, eventType, gender, belt, group}], placed: {divId: [entrantIds]}, groupOf(id) → group name (or several: a mixed team is on each).
      → [{ group, ages: [{ age, rows: [[block|null, block|null], …] }] }] — rows pair Kata | Kumite, Team Kata | Team Kumite, Fukugo | Enbu;
      block: { et, title, F: [ids], M: [ids], X: [ids], did: {F, M, X} } (X = mixed / open). Groups A→Z ("No …" last); only blocks with entrants. */
  const PRINT_PAIRS = [['IKATA', 'IKUMITE'], ['TKATA', 'TKUMITE'], ['FUKUGO', 'ENBU']];
  /** v1.57: event order within an age group on the printout (the Polish federation's sheet): kata, fukugo, kumite, team kata, enbu, team kumite. */
  const PRINT_ORDER = ['IKATA', 'FUKUGO', 'IKUMITE', 'TKATA', 'ENBU', 'TKUMITE'];
  function printGroups(divs, placed, groupOf) {
    const ageOrder = BLACK_AGE_GROUPS.map(g => g.label);
    const ageOf = d => (d.belt === 'kyu' ? 'Kyu ' : '') + (String(d.group || '').trim() || 'Open');
    const ageRank = a => { const i = ageOrder.indexOf(a); return i >= 0 ? i : 100; };
    const by = {};   // group → age → et → block
    for (const d of divs) for (const id of placed[d.id] || []) for (const g0 of [].concat(groupOf(id))) {
      const g = g0 || '', a = ageOf(d), sx = d.gender === 'F' || d.gender === 'W' ? 'F' : d.gender === 'M' ? 'M' : 'X';
      const A = ((by[g] = by[g] || {})[a] = by[g][a] || {});
      const b = (A[d.eventType] = A[d.eventType] || { et: d.eventType, title: a + ' ' + ((EVENT_TYPES[d.eventType] || {}).label || d.eventType), F: [], M: [], X: [], did: {} });
      b[sx].push(id); b.did[sx] = b.did[sx] || d.id;
    }
    const cmp = (x, y) => String(x).localeCompare(String(y), undefined, { sensitivity: 'base' });
    return Object.keys(by).sort((x, y) => (!x - !y) || cmp(x, y)).map(g => ({ group: g,
      ages: Object.keys(by[g]).sort((x, y) => ageRank(x) - ageRank(y) || cmp(x, y)).map(a => ({ age: a,
        rows: PRINT_PAIRS.map(([l, r]) => [by[g][a][l] || null, by[g][a][r] || null]).filter(([l, r]) => l || r),
        blocks: PRINT_ORDER.map(et => by[g][a][et]).filter(Boolean) })) }));
  }
  /** v1.44: list order of a division's entrants. list: [{id, last, first, group}];
      mode 'name' (last, first A→Z) · 'name-desc' (Z→A) · 'club' / 'region' / 'country' (by group A→Z, no group last, then name A→Z). */
  const ENT_SORTS = { name: 'Last, first name A→Z', 'name-desc': 'Last, first name Z→A', club: 'Club / dojo', region: 'Region', country: 'Country' };
  function sortEntrants(list, mode) {
    const cmp = (x, y) => String(x || '').localeCompare(String(y || ''), undefined, { sensitivity: 'base' });
    const byName = (a, b) => cmp(a.last, b.last) || cmp(a.first, b.first) || cmp(a.id, b.id);
    const out = list.slice();
    if (mode === 'name-desc') return out.sort((a, b) => byName(b, a));
    if (mode === 'club' || mode === 'region' || mode === 'country') return out.sort((a, b) => (!a.group - !b.group) || cmp(a.group, b.group) || byName(a, b));
    return out.sort(byName);
  }
  /** Kata performance order (v1.38): entrants without a rank (seed) go first in random order; ranked entrants follow from the lowest rank to the highest, so rank 1 performs last. */
  function kataOrder(pl, rnd) {
    const un = shuffle(pl.filter(e => !(+e.seed > 0)), rnd || Math.random);
    return un.concat(pl.filter(e => +e.seed > 0).sort((x, y) => y.seed - x.seed));
  }
  /** Separation group of an entrant: country (International), region (National) or dojo (Regional/Local). */
  const grp = e => (e && (e.group || e.dojo)) || '';
  /** Seed numbers used by more than one entrant: {seed: [ids]} (empty when every seed is unique). */
  function seedClashes(seeds) {
    const by = {};
    for (const [id, n] of Object.entries(seeds || {})) if (+n > 0) (by[+n] = by[+n] || []).push(id);
    const out = {}; for (const [n, ids] of Object.entries(by)) if (ids.length > 1) out[n] = ids;
    return out;
  }
  /* ---------- v1.33: WTKF charts (Competition Drawings: Exhibit E kumite / F fuku-go elimination chart; Exhibit A kata charts) ---------- */
  // Exhibit E: one elimination chart in four pools — A-1, A-2 (A bracket) and B-1, B-2 (B bracket); pool winners meet in the A / B
  // semi-finals, A and B winners in the final. Previous champions: 1st A-1, 2nd B-1, 3rd B-2, 4th A-2 (and they get byes first).
  const WTKF_POOLS = ['A-1', 'A-2', 'B-1', 'B-2'];
  const WTKF_SEED_POOL = { 1: 0, 2: 2, 3: 3, 4: 1 };
  const WTKF_EXTRA_ORDER = [1, 3, 2, 0];           // entrants beyond an even split go to A-2, B-2, B-1, then A-1 (byes go the other way)
  const bitrev = m => { const b = Math.log2(m) | 0; return Array.from({ length: m }, (_, i) => { let r = 0; for (let k = 0; k < b; k++) if (i & (1 << k)) r |= 1 << (b - 1 - k); return r; }); };
  /** Pool sizes for n entrants in the four Exhibit E pools. */
  function wtkfPoolSizes(n) { const base = Math.floor(n / 4), out = [base, base, base, base]; for (let i = 0; i < n % 4; i++) out[WTKF_EXTRA_ORDER[i]]++; return out; }
  /** Spread entrants over boxes with capacities: fixed ones first, then the biggest groups first, each to the box with the fewest of its group. */
  function spreadByGroup(fixed, rest, caps, rnd, sideOf) {
    const boxes = caps.map(() => []);
    fixed.forEach(([e, b]) => boxes[b].push(e));
    const cnt = {}; rest.forEach(e => { const g = grp(e); if (g) cnt[g] = (cnt[g] || 0) + 1; });
    const queue = shuffle(rest, rnd).sort((a, b) => (cnt[grp(b)] || 0) - (cnt[grp(a)] || 0));
    for (const e of queue) {
      const g = grp(e); let best = -1, bk = null;
      for (const b of shuffle(boxes.map((_, i) => i), rnd)) {
        if (boxes[b].length >= caps[b]) continue;
        const same = g ? boxes[b].filter(x => grp(x) === g).length : 0;
        const side = g && sideOf ? boxes.filter((bx, j) => sideOf(j) === sideOf(b)).reduce((t, bx) => t + bx.filter(x => grp(x) === g).length, 0) : 0;
        const key = [same, side, boxes[b].length / Math.max(1, caps[b])];
        if (!bk || key[0] < bk[0] || (key[0] === bk[0] && (key[1] < bk[1] || (key[1] === bk[1] && key[2] < bk[2])))) { bk = key; best = b; }
      }
      if (best < 0) best = boxes.findIndex((bx, i) => bx.length < caps[i]);
      boxes[best].push(e);
    }
    return boxes;
  }
  /** Exhibit E slot placement for an elimination bracket of `size` slots (null = bye). */
  function wtkfSlots(ordered, size, rnd) {
    rnd = rnd || Math.random;
    const n = ordered.length;
    if (n <= 2 || size < 4) return placeSlots(ordered, size, rnd);
    const q = size / 4, caps = wtkfPoolSizes(n);
    const top = ordered.filter(e => e.seed >= 1 && e.seed <= 4);
    const fixed = top.map(e => [e, WTKF_SEED_POOL[e.seed]]);
    fixed.forEach(([, b]) => { if (caps[b] < 1) caps[b] = 1; });
    // the caps must still add up to n when a seed forced a pool open
    let over = caps.reduce((a, b) => a + b, 0) - n;
    for (const b of [0, 2, 3, 1]) while (over > 0 && caps[b] > Math.max(1, fixed.filter(f => f[1] === b).length) && caps[b] > Math.floor(n / 4)) { caps[b]--; over--; }
    const pools = spreadByGroup(fixed, ordered.filter(e => !top.includes(e)), caps, rnd, b => (b < 2 ? 'A' : 'B'));
    const slots = Array(size).fill(null), k = Math.log2(size);
    pools.forEach((pl, b) => {
      const base = b * q;
      if (q === 1) { slots[base] = pl[0] || null; return; }
      const m = q / 2, byes = q - pl.length, order = bitrev(m);
      const byeM = new Set(order.slice(0, Math.max(0, byes)));
      const open = []; for (let j = 0; j < m; j++) { open.push(base + 2 * j); if (!byeM.has(j)) open.push(base + 2 * j + 1); }
      const seeded = pl.filter(e => top.includes(e)).sort((x, y) => x.seed - y.seed), others = pl.filter(e => !top.includes(e));
      seeded.forEach((e, i) => { const at = base + 2 * order[i]; slots[at] = e; open.splice(open.indexOf(at), 1); });   // previous champion: top of the pool, gets a bye first
      const costAt = (i, e) => { const g = grp(e); if (!g) return 0; let c = 0; slots.forEach((x, j) => { if (x && j !== i && grp(x) === g) c += pairCost(i, j, k); }); return c; };
      for (const e of shuffle(others, rnd).sort((x, y) => others.filter(o => grp(o) === grp(y)).length - others.filter(o => grp(o) === grp(x)).length)) {
        let best = -1, bc = Infinity;
        for (const i of shuffle(open.filter(i => !slots[i]), rnd)) { const c = costAt(i, e); if (c < bc) { bc = c; best = i; } }
        slots[best] = e;
      }
      const free = open.filter(i => slots[i] && !top.includes(slots[i]));
      for (let pass = 0, better = true; pass < 4 && better; pass++) {
        better = false;
        for (let x = 0; x < free.length; x++) for (let y = x + 1; y < free.length; y++) {
          const i = free[x], j = free[y], a = slots[i], c = slots[j];
          if (grp(a) === grp(c)) continue;
          const before = costAt(i, a) + costAt(j, c); slots[i] = c; slots[j] = a;
          if (costAt(i, c) + costAt(j, a) < before) better = true; else { slots[i] = a; slots[j] = c; }
        }
      }
    });
    return slots.map(e => (e ? e.id : null));
  }
  /** Exhibit A: number of kata charts (max 12 each; 1, 2, 4, 6, … — never 3). */
  function kataChartCount(n) { if (n <= 12) return 1; let c = 2; while (n > 12 * c) c += 2; return c; }
  /** Chart of a previous champion (performs at the bottom of it): 1 chart all; 2 charts 4th+1st | 3rd+2nd; 4+ charts 4th, 1st | 2nd, 3rd. */
  function kataSeedChart(seed, c) {
    if (c === 1) return 0;
    if (c === 2) return seed === 1 || seed === 4 ? 0 : 1;
    const h = c / 2; return { 4: 0, 1: 1, 2: h, 3: h + 1 }[seed];
  }
  function wtkfKataCharts(ordered, rnd) {
    rnd = rnd || Math.random;
    const n = ordered.length, c = kataChartCount(n), base = Math.floor(n / c), caps = Array(c).fill(base);
    for (let i = 0; i < n % c; i++) caps[c - 1 - i]++;                     // e.g. 29 → 7, 7, 7, 8
    const top = ordered.filter(e => e.seed >= 1 && e.seed <= 4);
    return spreadByGroup(top.map(e => [e, kataSeedChart(e.seed, c)]), ordered.filter(e => !top.includes(e)), caps, rnd, b => (b < c / 2 ? 0 : 1));
  }
  /** Round in which slots i and j of an elimination bracket would meet (1 = first round). */
  const meetRound = (i, j) => Math.floor(Math.log2(i ^ j)) + 1;
  /** How bad it is for two same-group entrants to sit in slots i and j: meeting earlier costs far more. */
  const pairCost = (i, j, k) => Math.pow(4, k - meetRound(i, j));
  /**
   * Place ordered entrants into bracket slots (null = bye). Seeded entrants keep their seed positions and byes go to the
   * top seeds; unseeded entrants are drawn at random but spread so that entrants of the same group (country / region /
   * dojo) land in different halves, then quarters, … wherever the numbers allow.
   */
  function placeSlots(ordered, size, rnd) {
    rnd = rnd || Math.random;
    const so = seedOrder(size), k = Math.log2(size) || 1;
    const nSeed = ordered.filter(e => e.seed).length;
    const slots = so.map(s => (s <= nSeed ? ordered[s - 1] : null));
    // open positions for unseeded entrants (seed numbers nSeed+1 … n; higher numbers are byes)
    const open = []; so.forEach((s, i) => { if (s > nSeed && s <= ordered.length) open.push(i); });
    const rest = ordered.slice(nSeed);
    // biggest groups first (ties at random) so they get the widest spread
    const cnt = {}; rest.forEach(e => { const g = grp(e); if (g) cnt[g] = (cnt[g] || 0) + 1; });
    const queue = shuffle(rest, rnd).sort((a, b) => (cnt[grp(b)] || 0) - (cnt[grp(a)] || 0));
    const costAt = (i, e) => { const g = grp(e); if (!g) return 0; let c = 0; slots.forEach((x, j) => { if (x && j !== i && grp(x) === g) c += pairCost(i, j, k); }); return c; };
    for (const e of queue) {
      let best = -1, bc = Infinity;
      for (const i of shuffle(open.filter(i => !slots[i]), rnd)) { const c = costAt(i, e); if (c < bc) { bc = c; best = i; } }
      slots[best] = e;
    }
    // improve: swap unseeded pairs while that lowers the total
    for (let pass = 0, better = true; pass < 4 && better; pass++) {
      better = false;
      for (let x = 0; x < open.length; x++) for (let y = x + 1; y < open.length; y++) {
        const i = open[x], j = open[y], a = slots[i], b = slots[j];
        if (!a || !b || grp(a) === grp(b)) continue;
        const before = costAt(i, a) + costAt(j, b);
        slots[i] = b; slots[j] = a;
        if (costAt(i, b) + costAt(j, a) < before) better = true; else { slots[i] = a; slots[j] = b; }
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
        const m = { id, stage: (opts && opts.stage) || (P ? 'PO' : 'W'), round: r, idx: i, rounds: k };
        if (opts && opts.pool) m.pool = opts.pool;
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

  /**
   * Double elimination without a reset match. opts: {prefix, pool, simplified}
   *  - DE:  winners bracket + repechage (losers) bracket + one grand final.
   *  - DES (simplified): winners final decides 1st/2nd, losers-bracket final decides 3rd/4th (no grand final).
   */
  function genDE(slots, opts) {
    opts = opts || {};
    const X = opts.prefix || '', pool = opts.pool, simp = !!opts.simplified;
    const size = slots.length, k = Math.log2(size);
    const matches = genSE(slots, X, { stage: 'W', pool });
    if (k <= 1) return matches;                    // 2 entrants: one match decides 1st/2nd
    const tag = m => { if (pool) m.pool = pool; return m; };
    const add = (id, m) => { matches[X + id] = tag(Object.assign({ id: X + id }, m)); };
    for (let i = 0; i < size / 4; i++) add(`L1-${i}`, { stage: 'L', round: 1, idx: i, a: L(`${X}W1-${2 * i}`), b: L(`${X}W1-${2 * i + 1}`) });
    for (let r = 1; r <= k - 1; r++) {
      const cnt = size >> (r + 1), rr = 2 * r;
      if (!(simp && r === k - 1)) {                // simplified: the winners-final loser takes 2nd, no drop into repechage
        for (let i = 0; i < cnt; i++) {
          const j = r % 2 === 1 ? cnt - 1 - i : i;
          add(`L${rr}-${i}`, { stage: 'L', round: rr, idx: i, a: W(`${X}L${rr - 1}-${i}`), b: L(`${X}W${r + 1}-${j}`) });
        }
      }
      if (r <= k - 2) {
        const c2 = size >> (r + 2), ro = 2 * r + 1;
        for (let i = 0; i < c2; i++) add(`L${ro}-${i}`, { stage: 'L', round: ro, idx: i, a: W(`${X}L${rr}-${2 * i}`), b: W(`${X}L${rr}-${2 * i + 1}`) });
      }
    }
    if (!simp) add('GF', { stage: 'GF', round: 1, idx: 0, a: W(`${X}W${k}-0`), b: W(`${X}L${2 * (k - 1)}-0`) });
    return matches;
  }
  /** Last repechage match id (losers-bracket final) for a pool prefix. */
  function lbFinal(br, X) {
    const ls = Object.values(br.matches).filter(m => m.stage === 'L' && m.id.startsWith(X + 'L'));
    if (!ls.length) return null;
    const mr = Math.max(...ls.map(m => m.round));
    return `${X}L${mr}-0`;
  }
  /** Single-elimination playoff for pool qualifiers (A1, B1, … then A2, B2, …), same-pool first-round meetings avoided. */
  function genPlayoff(poolNames, poolSizes, advance, bronze) {
    const qual = [];
    for (let place = 1; place <= advance; place++) poolNames.forEach((P, i) => { if (poolSizes[i] >= place) qual.push({ p: P, place }); });
    const size = nextPow2(qual.length);
    const so = seedOrder(size);
    const slots = so.map(s => qual[s - 1] || null);
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
    return genSE(slots, 'PO-', { bronze });
  }

  /**
   * Split ordered entrants into balanced pools (default at most 4). Seeded entrants are snaked across the pools; the
   * unseeded are drawn at random into the pool with the fewest of their group (country / region / dojo), so a group is
   * kept out of the same pool wherever possible.
   */
  function makePools(ordered, size, count, rnd) {
    rnd = rnd || Math.random;
    const n = ordered.length, np = count ? Math.max(1, Math.min(count, n)) : Math.max(1, Math.ceil(n / (size || 4)));
    const pools = Array.from({ length: np }, () => []), cap = Array(np).fill(0);
    ordered.forEach((e, i) => { const row = Math.floor(i / np), col = i % np; cap[row % 2 === 0 ? col : np - 1 - col]++; });
    const seeded = ordered.filter(e => e.seed), rest = ordered.filter(e => !e.seed);
    seeded.forEach((e, i) => { const row = Math.floor(i / np), col = i % np; pools[row % 2 === 0 ? col : np - 1 - col].push(e); });
    const cnt = {}; rest.forEach(e => { const g = grp(e); if (g) cnt[g] = (cnt[g] || 0) + 1; });
    const queue = shuffle(rest, rnd).sort((a, b) => (cnt[grp(b)] || 0) - (cnt[grp(a)] || 0));
    for (const e of queue) {
      const g = grp(e);
      let best = -1, bk = null;
      for (const p of shuffle(pools.map((_, i) => i), rnd)) {
        if (pools[p].length >= cap[p]) continue;
        const same = g ? pools[p].filter(x => grp(x) === g).length : 0;
        const key = [same, pools[p].length - cap[p]];          // fewest same-group, then the emptiest pool
        if (!bk || key[0] < bk[0] || (key[0] === bk[0] && key[1] < bk[1])) { bk = key; best = p; }
      }
      pools[best].push(e);
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
    const pools = makePools(ordered, (opts && opts.size) || 4, 0, opts && opts.rnd), matches = {}, poolMap = {};
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
      Object.assign(matches, genPlayoff(pools.map((_, i) => POOL_NAMES[i]), pools.map(p => p.length), advance, opts && opts.bronze));
    }
    return { pools: poolMap, matches, advance };
  }

  /**
   * Build a bracket document for a division.
   * entrants: [{id, seed?, dojo?}]
   */
  function generateBracket(division, entrants, rnd) {
    rnd = rnd || Math.random;
    const format = division.format || 'SE';
    const ordered = orderEntrants(entrants, rnd);
    const br = { divisionId: division.id, format, entrants: ordered.map(e => e.id), seeds: Object.fromEntries(entrants.filter(e => +e.seed > 0).map(e => [e.id, +e.seed])), bronze: division.bronze || 'two',
      reset: division.reset !== false, matches: {}, results: {}, pools: null, tiebreak: {}, createdAt: new Date().toISOString(), version: VERSION };
    if (format === 'KP') {
      br.judges = +((division.scoring || {}).judges) || 6;
      br.scores = {};
      br.poolSize = Math.min(12, Math.max(4, +division.poolSize || KP_POOL));
      br.kataRule = division.eventType !== 'ENBU';           // WTKF Kata 2-2-B (Enbu may repeat choreography)
      br.application = division.eventType === 'TKATA';      // Synchronized kata final adds Application (Bunkai)
      // seeded competitors perform last in their pool (Kata 1-6-B)
      // v1.38: performance order is the reverse of the ranking — unranked (unseeded) entrants first in random order, then ranked ones from the lowest rank to the highest (seed 1 performs last)
      const seedLast = pl => kataOrder(pl, rnd);
      if (ordered.length <= KP_ADV) br.kpFinal = seedLast(ordered).map(e => e.id);
      else if (division.wtkfCharts) {          // Exhibit A: charts of up to 12, 1/2/4/6 charts, champions at the bottom
        br.wtkf = true; br.poolSize = 12; br.kpPools = {};
        wtkfKataCharts(ordered, rnd).forEach((pl, i) => { br.kpPools[POOL_NAMES[i]] = seedLast(pl).map(e => e.id); });
      }
      else { const pools = ordered.length <= 12 ? [ordered] : makePools(ordered, br.poolSize, Math.max(2, Math.ceil(ordered.length / br.poolSize)), rnd); br.kpPools = {}; pools.forEach((pl, i) => { br.kpPools[POOL_NAMES[i]] = seedLast(pl).map(e => e.id); }); }
      return br;
    }
    if (ordered.length < 2) return br;
    if (format === 'RR') {
      const g = genRR(ordered, { advance: division.advance, bronze: br.bronze, rnd, size: Math.min(8, Math.max(3, +division.rrPoolSize || 4)) });
      br.pools = g.pools; br.matches = g.matches; br.advance = g.advance;
    } else if (format === 'DE' || format === 'DES') {
      br.reset = false;
      const simplified = format === 'DES';
      const n = ordered.length;
      // pools of up to 8 by default; the director may set the pool count (each pool needs 2+ entrants)
      let np = +division.poolCount > 0 ? +division.poolCount : Math.ceil(n / ELIM_POOL);
      np = Math.max(1, Math.min(np, Math.floor(n / 2)));
      if (np === 1) br.matches = genDE(placeSlots(ordered, nextPow2(n), rnd), { simplified });
      else {
        const pools = makePools(ordered, 0, np, rnd);
        br.pools = {}; br.matches = {}; br.advance = 2; br.elimPools = true;
        pools.forEach((pl, i) => {
          const P = POOL_NAMES[i];
          br.pools[P] = pl.map(e => e.id);
          Object.assign(br.matches, genDE(placeSlots(pl, nextPow2(pl.length), rnd), { prefix: `E${P}-`, pool: P, simplified }));
        });
        Object.assign(br.matches, genPlayoff(Object.keys(br.pools), pools.map(p => p.length), 2, br.bronze));
      }
    } else {
      const size = nextPow2(ordered.length);
      const wtkf = !!division.wtkfCharts && ordered.length >= 3;
      const slots = wtkf ? wtkfSlots(ordered, size, rnd) : placeSlots(ordered, size, rnd);
      br.matches = genSE(slots, '', { bronze: br.bronze });
      if (wtkf) { br.wtkf = true; br.size = size; }
    }
    return br;
  }


  /* ---------- Kata score pools (KP) ----------
     Pools of up to 8; every competitor performs once per round and is scored by N judges (0–10).
     With 5+ judges the highest and lowest score are dropped from the total.
     Top 4 of each pool advance; when a round has a single pool it is the semifinal and its top 4
     reach the final. Final: must use a different kata than in the semifinal (final elimination round); semifinal total is
     carried and added to the final total. v1.42: earlier rounds (and the semifinal) may repeat the previous round's kata. Ties: add back the dropped scores (sum of all), then re-perform. */
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
      // v1.39: a single pool of 9–12 is an elimination round whose top 8 go to the semifinal; a single pool of ≤8 is the semifinal (top 4 → final)
      const big = names.length === 1 && pools[names[0]].length > 8;
      const single = names.length === 1 && !big, cut = big ? 8 : KP_ADV;
      const rd = { n, type: single ? 'semi' : 'pool', pools: {}, complete: true, needRp: [] };
      const adv = [];
      for (const P of names) {
        const rows = pools[P].map(id => kpRow(br, n, id, null));
        const rk = kpRank(rows, cut, false);
        rd.pools[P] = { order: pools[P], rows: rk.rows, complete: rk.complete, needRp: rk.needRp, scoredAll: rk.scoredAll };
        rd.needRp.push(...rk.needRp.map(id => ({ id, pool: P })));
        if (!rk.complete) rd.complete = false;
        rk.rows.slice(0, cut).forEach((r, i) => { if (r.hansoku) return; r.advance = rk.complete; adv.push({ id: r.id, place: i, total: r.total, pool: P, seq: pools[P].indexOf(r.id) }); });
      }
      rounds.push(rd);
      if (!rd.complete) return { rounds, final: null, complete: false };
      if (single) { finalIds = adv.map(a => a.id); semiRows = Object.fromEntries(rd.pools[names[0]].rows.map(r => [r.id, r])); break; }
      // next round: re-pool advancers by placing (A1,B1,C1.. then A2,B2..) in snake order, <= 8 per pool
      adv.sort((a, b) => a.place - b.place || b.total - a.total);
      // continue with pools until only eight remain, then one final-elimination pool (Kata 1-6-A)
      let np = big || adv.length <= 8 ? 1 : Math.max(2, Math.ceil(adv.length / (br.poolSize || KP_POOL)));
      let next;
      if (!big && br.wtkf && (np = adv.length <= 8 ? 1 : kataChartCount(adv.length)) > 1 && names.length % np === 0) {
        // Exhibit A: neighbouring charts merge (1+2 | 3+4, or 1–3 | 4–6): top 4 of each → 8 or 12 → final elimination of 8 → final 4
        const per = names.length / np; next = Array.from({ length: np }, () => []);
        adv.forEach(a => next[Math.floor(names.indexOf(a.pool) / per)].push(a));
      } else {
        next = Array.from({ length: np }, () => []);
        adv.forEach((a, i) => { const row = Math.floor(i / np), col = i % np; next[row % 2 === 0 ? col : np - 1 - col].push(a); });
      }
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
      const seg = kpSegOfKey(br, kpKey(rd, order[0] || ''), st);
      for (const id of order) if (!by[id].sheet) out.push({ key: kpKey(rd, id), id, round: rd, pool: P, label, seg });
      for (const id of needRp) { const k = kpKey(rd, id, true); const again = !!(br.scores || {})[k]; out.push({ key: k, id, round: rd, pool: P, label: label + (again ? ' · Kettei-sen again' : ' · Kettei-sen'), rp: true, again, seg }); }
    };
    const last = st.rounds[st.rounds.length - 1];
    if (st.final) add(st.final.n, 'F', st.final.order, st.final.rows, st.final.needRp, 'Final');
    else if (last) for (const P of Object.keys(last.pools)) add(last.n, P, last.pools[P].order, last.pools[P].rows, last.pools[P].needRp, `${kpRoundName(last)} · Pool ${P}`);
    return out;
  }
  /** Ring segment of a kata-pool performance: first-round pools 'P:A'…, semifinal 'SF', final 'F', other rounds '' (division ring). */
  function kpSegOfKey(br, key, st) {
    const m = /^R(\d+)_/.exec(key || ''); if (!m) return '';
    const n = +m[1]; st = st || kpState(br);
    if (st.final && st.final.n === n) return 'F';
    const rd = st.rounds.find(r => r.n === n); if (!rd) return br.kpFinal ? 'F' : '';
    if (rd.type === 'semi') return 'SF';
    if (n === 1 && Object.keys(rd.pools).length > 1) { const id = /^R\d+_(.+?)(_rp)?$/.exec(key)[1]; const P = Object.keys(rd.pools).find(x => rd.pools[x].order.includes(id)); return P ? 'P:' + P : ''; }
    return '';
  }
  /** Ring segment of a bracket match: pool matches 'P:A'…, semifinal round 'SF', final round / bronze / grand final 'F', otherwise ''. */
  function segOf(br, m) {
    if (!m) return '';
    if (m.pool && (m.stage === 'P' || br.elimPools)) return 'P:' + m.pool;
    if (m.stage === 'B' || m.stage === 'GF') return 'F';
    if (m.stage === 'W' || m.stage === 'PO') {
      const k = m.rounds || Math.max(...Object.values(br.matches).filter(x => x.stage === m.stage && x.pool === m.pool).map(x => x.round));
      const left = k - m.round;
      if (left === 0) return br.format === 'DE' && m.stage === 'W' && !br.elimPools ? 'SF' : 'F';
      if (left === 1) return 'SF';
    }
    return '';
  }
  /** Segments of a drawn division the director can place on rings. */
  function segList(br) {
    if (!br) return [];
    const out = [];
    const pools = br.format === 'KP' ? (br.kpPools && Object.keys(br.kpPools).length > 1 ? Object.keys(br.kpPools) : []) : (br.pools && Object.keys(br.pools).length > 1 ? Object.keys(br.pools) : []);
    for (const P of pools) out.push({ seg: 'P:' + P, label: 'Pool ' + P });
    if (br.format === 'KP' || Object.keys(br.matches || {}).length > 1) { out.push({ seg: 'SF', label: 'Semifinal' }); out.push({ seg: 'F', label: 'Final' }); }
    return out;
  }
  /** Ring that runs a segment (or a single match) of a division. */
  function ringOf(dv, seg, mid) {
    const sr = (dv && dv.segRings) || {};
    return (mid && sr['M:' + mid]) || (seg && sr[seg]) || (dv && dv.ringId) || '';
  }
  /* ---------- judges ---------- */
  /** Credential needed (WTKF levels 1–7): levels 3–7 for National/International, 1–2 enough for Regional/Local. */
  function judgeNeed(eventLevel, min) { return +min || (eventLevel === 'National' || eventLevel === 'International' ? 3 : 1); }
  function judgeLevelFor(j, kind) {
    const ka = +j.kataLevel || 0, ku = +j.kumiteLevel || 0;
    if (kind === 'kata') return ka;
    if (kind === 'fukugo') return Math.min(ka, ku);
    return ku;
  }
  function judgeEligible(j, kind, eventLevel, min) { return judgeLevelFor(j, kind) >= judgeNeed(eventLevel, min); }
  /** Where a judge is from, by event level: International → country, National → region, Regional/Local → dojo. */
  function judgeFrom(j, eventLevel) {
    if (eventLevel === 'International') return j.country || '';
    if (eventLevel === 'National') return j.region || '';
    return j.dojo || '';
  }
  /** Officials' positions on a score sheet (WTKF): kata Shu-shin + Fuku-shin; kumite Shu-shin + 4 Fuku-shin + Kan-sa. */
  function officialPositions(kind, judges) {
    if (kind === 'kata' || kind === 'kitei') {
      const n = +judges || 5;
      return Array.from({ length: n }, (_, i) => ({ key: i === 0 ? 'shushin' : 'f' + i, label: i === 0 ? 'Shu-shin' : `Fuku-shin ${i}` }));
    }
    return [{ key: 'shushin', label: 'Shu-shin' }, { key: 'f1', label: 'Fuku-shin 1' }, { key: 'f2', label: 'Fuku-shin 2' }, { key: 'f3', label: 'Fuku-shin 3' }, { key: 'f4', label: 'Fuku-shin 4' }, { key: 'kansa', label: 'Kan-sa' }];
  }
  /** Officials check: required at National/International (all positions, no judge twice). Returns '' or an error. */
  function officialsCheck(positions, officials, eventLevel) {
    const o = officials || {};
    const used = positions.map(p => o[p.key]).filter(Boolean);
    if (new Set(used).size !== used.length) return 'A judge is assigned to two positions.';
    if (judgeNeed(eventLevel) >= 3 && used.length < positions.length) return `Assign all ${positions.length} officials (required at ${eventLevel} events).`;
    return '';
  }
  function kpRoundName(rd) { return rd.type === 'final' ? 'Final' : rd.type === 'semi' ? 'Semifinal' : `Elimination round ${rd.n}`; }
  /** A score may be changed while no later round has any score. */
  function kpCanEdit(br, key) {
    const m = /^R(\d+)_/.exec(key); if (!m) return false;
    const n = +m[1];
    return !Object.keys(br.scores || {}).some(k => { const x = /^R(\d+)_/.exec(k); return x && +x[1] > n && br.scores[k]; });
  }
  /** WTKF Kata 2-2-B / 2-5-C: final elimination and finals need a kata different from the previous round;
   *  a Kettei-sen (re-perform) needs a kata different from the one that tied. Returns an error text or ''. */
  function kpKataCheck(br, key, kata) {
    if (!br.kataRule) return '';
    const norm = x => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (!norm(kata)) return 'Enter the kata name.';
    const m = /^R(\d+)_(.+?)(_rp)?$/.exec(key); if (!m) return '';
    const n = +m[1], id = m[2], S = br.scores || {};
    if (m[3]) { const tied = S[kpKey(n, id)]; return tied && norm(tied.kata) === norm(kata) ? `Kettei-sen needs a different kata than ${tied.kata}.` : ''; }
    const st = kpState(br);
    // v1.42: only the final four must change kata from the final elimination round (semifinal), whose score is carried to the final
    if (!(st.final && st.final.n === n && st.final.carried)) return '';
    const prev = S[kpKey(n - 1, id)];
    if (prev && norm(prev.kata) === norm(kata)) return `The final needs a different kata than the final elimination round (${prev.kata}).`;
    return '';
  }
  /** v1.43: the competitor's previous performance before this one — the previous round (for a Kettei-sen: the tied performance).
      { n, label, kata, avg (score of that performance, 3 decimals), hansoku } or null. */
  function kpPrevious(br, key) {
    const m = /^R(\d+)_(.+?)(_rp)?$/.exec(key); if (!m) return null;
    const n = m[3] ? +m[1] : +m[1] - 1, id = m[2]; if (n < 1) return null;
    const J = br.judges || 6, sh = kpSheet((br.scores || {})[kpKey(n, id)], J); if (!sh) return null;
    const rd = kpState(br).rounds.find(r => r.n === n);
    const label = rd ? kpRoundName(rd) : n === (br.kpPools ? 0 : 1) ? 'Final' : 'Round ' + n;
    return { n, label, kata: sh.kata || '', hansoku: !!sh.hansoku, avg: sh.hansoku ? 0 : Math.round((sh.kataTotal != null ? sh.kataTotal : sh.total) / (J >= 5 ? J - 2 : J) * 1000) / 1000 };
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
      const st = br.elimPools ? elimPoolPlaces(br, P, get) : standings(br, P, get);
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

  /** Top two of an elimination pool (DE: grand final; DES or 2 entrants: winners final). */
  function elimPoolPlaces(br, P, getRes) {
    const X = `E${P}-`, ids = (br.pools && br.pools[P]) || [];
    if (ids.length === 1) return { complete: true, rows: [{ id: ids[0] }] };
    const ws = Object.values(br.matches).filter(m => m.stage === 'W' && m.pool === P);
    if (!ws.length) return { complete: false, rows: [] };
    const k = Math.max(...ws.map(m => m.round));
    const fid = br.matches[X + 'GF'] ? X + 'GF' : `${X}W${k}-0`;
    const r = getRes(fid);
    if (!r || !DONE[r.status]) return { complete: false, rows: [] };
    return { complete: true, rows: [{ id: r.winner }, { id: r.loser }].filter(x => x.id) };
  }
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
    const P = br.format === 'RR' || br.elimPools ? 'PO-' : '';
    if ((br.format === 'DE' || br.format === 'DES') && !br.elimPools) {
      const ws = Object.values(br.matches).filter(m => m.stage === 'W');
      const k = Math.max(...ws.map(m => m.round));
      const gf2 = fin('GF2'), gf = fin('GF');
      const last = gf2 && gf2.status === 'done' ? gf2 : br.matches.GF ? gf : fin(`W${k}-0`);
      if (last && (!br.matches.GF2 || gf2)) { out.gold = last.winner; out.silver = last.loser; }
      const lid = lbFinal(br, '');
      const lf = lid ? fin(lid) : null;
      if (br.format === 'DES') { if (lf && lf.winner) { out.bronze = [lf.winner]; out.fourth = lf.loser || null; } }
      else if (lf && lf.loser) out.bronze = [lf.loser];
    } else {
      const ks = Object.values(br.matches).filter(m => (P ? m.stage === 'PO' : m.stage === 'W'));
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
    // v1.39: the 3rd-place match (bronze / repechage final 3rd-4th) always runs before the championship (1st & 2nd)
    const all = Object.values(br.matches);
    const top = (st, pool) => Math.max(...all.filter(x => x.stage === st && (x.pool || '') === (pool || '')).map(x => x.round));
    const isTitle = m => m.stage === 'GF' || ((m.stage === 'PO' || (m.stage === 'W' && !(br.elimPools && m.pool))) && m.round === top(m.stage, m.pool));
    const third = all.filter(m => m.stage === 'B').map(m => m.id);
    if (br.format === 'DES' && !br.elimPools) { const l = lbFinal(br, ''); if (l) third.push(l); }
    const hold = third.some(id => res[id] && (res[id].status === 'pending' || res[id].status === 'ready'));
    return all.filter(m => res[m.id].status === 'ready' && !(hold && isTitle(m)))
      .sort((x, y) => (order[x.stage] - order[y.stage]) || (x.round - y.round) || String(x.pool || '').localeCompare(String(y.pool || '')) || (x.idx - y.idx) || (x.stage === 'L') - (y.stage === 'L'));
  }
  /** Can the result of this match be changed? Not if any downstream match that uses it already has a result. */
  function canEdit(br, matchId, res) {
    res = res || resolve(br);
    const m0 = br.matches[matchId];
    for (const m of Object.values(br.matches)) {
      const uses = (m.a && m.a.m === matchId) || (m.b && m.b.m === matchId) || m.reset === matchId ||
        (m0.pool && ((m.a && m.a.p === m0.pool) || (m.b && m.b.p === m0.pool)));
      if (uses && res[m.id] && (res[m.id].status === 'done')) return false;
    }
    return true;
  }
  function matchLabel(m, br) {
    if (!m) return '';
    if (m.stage === 'P') return `Pool ${m.pool} · Round ${m.round}`;
    const pp = m.pool && m.stage !== 'P' ? `Pool ${m.pool} · ` : '';
    if (m.stage === 'GF') return pp + (m.reset ? 'Grand final (reset)' : 'Grand final');
    if (m.stage === 'B') return 'Bronze match';
    if (m.stage === 'L') {
      if (br.format === 'DES') { const lid = lbFinal(br, m.pool ? `E${m.pool}-` : ''); if (lid === m.id) return pp + 'Repechage final (3rd/4th)'; }
      return pp + `Repechage R${m.round}`;
    }
    const k = m.rounds || Math.max(...Object.values(br.matches).filter(x => x.stage === m.stage).map(x => x.round));
    const pre = m.stage === 'PO' ? 'Playoff ' : pp;
    const left = k - m.round;
    if (left === 0) return pre + (m.stage === 'W' && br.format === 'DE' && Object.values(br.matches).some(x => x.stage === 'GF' && x.pool === m.pool) ? 'Winners final' : 'Final');
    if (left === 1) return pre + 'Semi-final';
    if (left === 2) return pre + 'Quarter-final';
    return `${pre}Round ${m.round}`;
  }

  /* ---------- WTKF scoring (Competition Rules 2009) ---------- */
  // Kumite scoring table at time-up (Kumite Art. 2-3-A-(4)); team table Art. 2-3-B (Ippon 10).
  const PTS = { ippon: 10, waza: 4, chui: 4, keikoku: 2, jogai: 2, tento: 1, kogoPen: 2 };
  const OTHER = { a: 'b', b: 'a' };
  const blank = () => ({ ippon: 0, waza: 0, jogai: 0, keikoku: 0, chui: 0, tento: 0, tentoX: 0 });
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
          // Ten-to (Art. 1-6-I, 1-7): a penalty match is executed — no points. Only when it cannot be executed because
          // time expired (fall at the end of the match) does the opponent receive 1 point. ev.exec marks an executed one.
          if (ev.t === 'tento' && ev.exec) { st[s].tentoX++; break; }
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
   * Ko-go Kumite (WTKF Ko-go Rules): six exchanges, Aka attacks 1–3, Shiro 4–6; each exchange independent.
   * Kettei-sen: six exchanges alternating from Aka; first Waza-ari/Ippon wins, else total, else Court Judges.
   * log items: {s, t:'waza'|'ippon'|'jikan'|'kakushi'|'saki'|'nigetai'|'keikoku'|'chui'|'jogai'|'tento'|'hansoku'|'kiken'|'hantei'} | {t:'next'}
   */
  function kogoEval(log, opts) {
    opts = opts || {};
    let phase = opts.ketteiOnly ? 'kettei' : 'regular', ex = 1, done = false, winner = null, method = null, regular = null;
    let sc = { a: 0, b: 0 };
    const end = (w, how) => { done = true; winner = w; method = how; };
    const pen = { jikan: 2, kakushi: 2, saki: 2, nigetai: 2, keikoku: 2, jogai: 2, chui: 4, tento: 1 };
    // Each Ko-go exchange is a stand-alone match: it is over at the first score or penalty (incl. Jikan after 10 s),
    // so a scored event marked `ae` (auto-end, v1.12.2) closes the exchange; "next" closes an exchange with no score.
    const advance = () => {
      if (phase === 'hantei') return;
      if (ex < 6) { ex++; return; }
      // six exchanges finished
      if (sc.a !== sc.b) { if (phase === 'regular') regular = Object.assign({}, sc); end(sc.a > sc.b ? 'a' : 'b', phase === 'kettei' ? 'Kettei-sen · Points' : 'Points'); return; }
      if (phase === 'regular') {
        regular = Object.assign({}, sc);
        if (opts.allowDraw) { done = true; method = 'Hiki-wake'; return; }
        // equal scores, including no score at all → Kettei-sen; first Waza-ari or Ippon wins
        phase = 'kettei'; ex = 1; sc = { a: 0, b: 0 };
      } else phase = 'hantei';
    };
    for (const ev of log || []) {
      if (done) break;
      const s = ev.s;
      if (ev.t === 'waza' || ev.t === 'ippon') {
        sc[s] += ev.t === 'ippon' ? PTS.ippon : PTS.waza;
        if (phase === 'kettei') { end(s, 'Kettei-sen · ' + (ev.t === 'ippon' ? 'Ippon' : 'Waza-ari')); break; }
        if (ev.ae) advance();
      } else if (pen[ev.t]) { sc[OTHER[s]] += pen[ev.t]; if (ev.ae) advance(); }
      else if (ev.t === 'hansoku') end(OTHER[s], 'Han-soku');
      else if (ev.t === 'kiken') end(OTHER[s], 'Ki-ken');
      else if (ev.t === 'hantei' && phase === 'hantei') end(s, 'Hantei (Court Judges)');
      else if (ev.t === 'next') advance();
    }
    const offense = phase === 'kettei' ? (ex % 2 === 1 ? 'a' : 'b') : (ex <= 3 ? 'a' : 'b');
    return { done, winner, method, phase: done ? 'done' : phase, exchange: ex, offense, cur: sc, score: regular && phase !== 'regular' ? regular : (done && regular ? regular : sc), kettei: phase !== 'regular' };
  }
  function flagsEval(aFlags, judges) {
    const j = +judges || 5, a = +aFlags;
    if (!(a >= 0 && a <= j) || a * 2 === j) return { done: false };
    return { done: true, winner: a > j / 2 ? 'a' : 'b', method: `Flags ${Math.max(a, j - a)}–${Math.min(a, j - a)}`, score: { a, b: j - a } };
  }
  /** Judges' scores: highest & lowest dropped (5+ judges); WTKF announces the average of the rest (Kata Art. 3-2-D). */
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
    const f = x => x.avg.toFixed(3);
    if (cmp !== 0) return { done: true, winner: cmp > 0 ? 'a' : 'b', method: `Score ${f(A)}–${f(B)}`, score: { a: A.avg, b: B.avg } };
    if (tieSide === 'a' || tieSide === 'b') return { done: true, winner: tieSide, method: `Tie ${f(A)} · Court Judges`, score: { a: A.avg, b: B.avg } };
    return { done: false, tie: true, score: { a: A.avg, b: B.avg } };
  }
  /** Team Kumite (WTKF Art. 2-3-B): 3 rounds, higher team total wins; tie → Kettei-sen by Representative.
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
  /** Fukugo (WTKF Fukugo Art. 1-3): single elimination alternating Kumite and Ki-tei.
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
  /** v1.40: ring manager's checklist before a ring (mat) can be marked ready. A ring is not ready until every item is ticked. */
  const RING_CHECKS = [
    { k: 'mat', label: 'Mat laid out, boundary and start lines marked, area clear' },
    { k: 'judges', label: 'Judges seated with flags (Aka red / Shiro white)' },
    { k: 'table', label: 'Scoreboard, timer and scoresheets working' },
    { k: 'helpers', label: 'Scorekeeper and timekeeper at the table' },
    { k: 'belts', label: 'Aka / Shiro belts at the ring' },
    { k: 'medical', label: 'First aid knows where this ring is' },
    { k: 'order', label: 'Running order and first call checked' },
  ];
  function ringChecksDone(checks) { const c = checks || {}; return RING_CHECKS.filter(x => c[x.k]).length; }
  function ringReadyOk(checks) { return ringChecksDone(checks) === RING_CHECKS.length; }

  function toCSV(rows) { return rows.map(r => r.map(csvEscape).join(',')).join('\n'); }

  return {
    VERSION, EVENT_TYPES, EVENT_ORDER, GENDERS, FORMATS, LEVELS, EVENT_KINDS, BLACK_AGE_GROUPS, RANKS, POOL_NAMES,
    ordinal, rankValue, rankLabel, isBlack, ageOn, ageOf, ageFromYear, divisionName, defaultScoring, blackBeltDivisions, kyuDivisions, WTKF_WORLDS_2026, PRESETS, NCR_KYU, NCR_LEVELS, ncrDivisions, ncrEval, kyuEval, wtkfSlots, wtkfPoolSizes, kataChartCount, kataSeedChart, wtkfKataCharts, WTKF_POOLS, defaultKyuGroups, kyuGroupsCheck, NCR_EX, NCR_STYLES, presetDivisions, quotaIssues, teamSizeFor,
    fitsDivision, candidateDivisions, teamGender, teamCandidates, assignEntrants, validateCompetitor,
    seedOrder, nextPow2, orderEntrants, PRINT_PAIRS, PRINT_ORDER, printGroups, ENT_SORTS, sortEntrants, kataOrder, kpState, kpPlacings, kpQueue, kpSegOfKey, segOf, segList, ringOf, judgeNeed, judgeLevelFor, judgeEligible, judgeFrom, officialPositions, officialsCheck, kpKataCheck, kpPrevious, defaultFormat, defaultStyle, WTKF_KATA, kpCanEdit, kpProgress, kpKey, kpRoundName, KP_POOL, KP_ADV, placeSlots, makePools, seedClashes, generateBracket, resolve, standings, placings, readyMatches, canEdit, matchLabel,
    kumiteEval, kogoEval, flagsEval, scoreTotal, scoresEval, teamKumiteEval, fukugoPart, kiteiEval, medalTable, toCSV, PTS, RING_CHECKS, ringChecksDone, ringReadyOk,
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = KT;
