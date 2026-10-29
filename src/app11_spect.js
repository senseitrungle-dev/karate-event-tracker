/* ===== v1.50: spectator feed — compact summary documents, website cache, pause switch ===== */
/* Spectators (public link visitors, and signed-in people who are not on the event's team) no longer read the event's
   collections one document per competitor. The staff's own app keeps a compact copy for them:
     pubsnap/{e}/parts/{col}~{n}  { col, d: {id: doc} }   competitors, teams, divisions, rings, sessions, judges, attendance
     pubsnap/{e}                  { v: {key: version} }   one version per part ("p~<part>") and per bracket ("b~<division>")
   Brackets (live/{e}/brackets) and ring boards (live/{e}/ringstate) are read as they are.
   Two ways to deliver it (event setting `pubFeed`):
     'cdn' (default)  the page polls /api/live (Vercel function behind the CDN cache) every 10 s; Firestore reads stay the
                      same however many spectators watch. Falls back to 'direct' where the function is not available.
     'direct'         live listeners on the summary documents (instant; reads grow with the number of spectators).
   `pubPaused` (director) closes the spectators' data at once (rules) while the event's team keeps working. */
const PUB_COLS = { competitors: 8, teams: 2, divisions: 2, rings: 1, sessions: 1, judges: 2, attendance: 1 };
const PUB_POLL = 10000;
P.pub = e => `pubsnap/${e}`;
P.pubParts = e => `pubsnap/${e}/parts`;
P.pubPart = (e, part) => `pubsnap/${e}/parts/${part}`;
const PUB = { dirty: new Set(), timer: null, busy: false };

function pubHash(s) { let h = 0x811c9dc5; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h; }
const pubPartOf = (col, id) => `${col}~${pubHash(id) % PUB_COLS[col]}`;
const pubVer = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
/** What spectators get of a document: everything the public page shows (private details live in pv/ and never get here). */
function pubProject(col, doc) {
  const o = clone(doc); delete o.id;
  if (col === 'judges') { delete o.email; delete o.notes; delete o.phone; }
  return o;
}
/** Stable text of a value (sorted keys) — to compare what is published with what should be. */
function pubStable(v) {
  if (Array.isArray(v)) return '[' + v.map(pubStable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + pubStable(v[k])).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

/** Which way this person gets the event's data: '' = the event's own collections (team, local mode, claude.ai). */
function spectatorFeed(ev) {
  if (!S.store || S.store.mode === 'cloud' || !ev) return '';
  if (S.pub) return S.pub.mode || 'direct';
  if (FB.on && !eventRoleOf(ev)) return 'direct';
  return '';
}
/** Subscribe to the spectators' copy (direct mode). Returns the unsubscribe functions. */
function feedWatch(id) {
  const offs = [];
  offs.push(S.store.watch(P.pubParts(id), parts => {
    const out = {}; for (const c in PUB_COLS) out[c] = {};
    for (const pt of Object.values(parts || {})) { if (!pt || !PUB_COLS[pt.col]) continue; for (const k in pt.d || {}) if (pt.d[k]) out[pt.col][k] = Object.assign({}, pt.d[k], { id: k }); }
    Object.assign(S.d, out); render();
  }, dbErr));
  for (const c of ['brackets', 'ringstate']) offs.push(S.store.watch(P.liveCol(id, c), o => { S.d[c] = o; render(); }, dbErr));
  return offs;
}

/* ---------- staff side: keep the spectators' copy up to date ---------- */
/** Publishing applies while the event is shared (public link on), not archived, and the store can patch fields. */
const pubTeam = ev => isLocal() ? S.ui.simRole !== 'viewer' : !!eventRoleOf(ev);
function pubActive(ev) { ev = ev || curEvent(); return !!(ev && ev.public && !ev.locked && S.store && S.store.patch && S.store.mode !== 'cloud' && pubTeam(ev) && !S.pub); }
/** Every write this person makes is noted; changed documents are published a moment later (after the local copy has it). */
function pubInstall() {
  const st = S.store; if (!st || st.__pub || st.mode === 'cloud') return;
  st.__pub = true;
  for (const m of ['set', 'update', 'del']) {
    const f = st[m];
    st[m] = function (p) { const r = f.apply(st, arguments); Promise.resolve(r).then(() => pubNote(p), () => {}); return r; };
  }
}
function pubNote(p) {
  const m = /^(events|live)\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(String(p || ''));
  if (!m || m[2] !== S.evId || PUB.skip || !pubActive()) return;
  const col = m[3], id = m[4];
  if (m[1] === 'live' && col === 'brackets') PUB.dirty.add('b~' + id);
  else if (PUB_COLS[col] && (m[1] === 'live') === (col === 'attendance')) PUB.dirty.add(col + '|' + id);
  else return;
  clearTimeout(PUB.timer); PUB.timer = setTimeout(pubFlush, 700);
}
const pubMayWrite = col => col === 'attendance' || isLocal() || isEventDirector();
async function pubFlush() {
  if (PUB.busy) { clearTimeout(PUB.timer); PUB.timer = setTimeout(pubFlush, 400); return; }
  const e = S.evId, keys = [...PUB.dirty]; PUB.dirty.clear();
  if (!e || !keys.length || !pubActive()) return;
  PUB.busy = true;
  try {
    const parts = {}, man = {};
    for (const k of keys) {
      if (k.startsWith('b~')) { man[k] = S.d.brackets[k.slice(2)] ? pubVer() : null; continue; }
      const [col, id] = k.split('|'); if (!pubMayWrite(col)) continue;
      const pt = pubPartOf(col, id), cur = (S.d[col] || {})[id];
      (parts[pt] || (parts[pt] = { col, kv: {} })).kv[id] = cur ? pubProject(col, cur) : null;
    }
    for (const pt in parts) { await S.store.patch(P.pubPart(e, pt), 'd', parts[pt].kv, { col: parts[pt].col }); man['p~' + pt] = pubVer(); }
    if (Object.keys(man).length) await S.store.patch(P.pub(e), 'v', man);
  } catch (err) { console.warn('[pub] could not update the spectators’ copy', err); }
  finally { PUB.busy = false; }
}
/** Director: bring the spectators' copy fully in line with the event (on opening a shared event, sharing, Go live, Refresh).
    `all` gives every part and bracket a new version (after a time unshared, when changes were not published). */
async function pubSync(all, quiet) {
  const e = S.evId, ev = curEvent();
  if (!e || !ev || !ev.public || ev.locked || !isEventDirector(ev) || !S.store.patch || S.store.mode === 'cloud' || S.pub) return false;
  const have = await colOnce(P.pubParts(e));
  let man = {}; try { man = (await S.store.get(P.pub(e))) || {}; } catch (err) { man = {}; }
  const mv = man.v || {}, want = {}, upd = {};
  for (const col in PUB_COLS) for (let n = 0; n < PUB_COLS[col]; n++) want[`${col}~${n}`] = { col, d: {} };
  for (const col in PUB_COLS) for (const id in S.d[col] || {}) want[pubPartOf(col, id)].d[id] = pubProject(col, S.d[col][id]);
  let wrote = 0;
  try {
    for (const pt in want) {
      const old = ((have[pt] || {}).d) || {}, kv = {};
      for (const id in want[pt].d) if (pubStable(want[pt].d[id]) !== pubStable(old[id])) kv[id] = want[pt].d[id];
      for (const id in old) if (!(id in want[pt].d)) kv[id] = null;
      const empty = !Object.keys(want[pt].d).length && !have[pt];
      if (Object.keys(kv).length) { await S.store.patch(P.pubPart(e, pt), 'd', kv, { col: want[pt].col }); wrote++; }
      if (Object.keys(kv).length || all || (!mv['p~' + pt] && !empty)) upd['p~' + pt] = pubVer();
    }
    for (const did in S.d.brackets) if (all || !mv['b~' + did]) upd['b~' + did] = pubVer();
    for (const k in mv) if (k.startsWith('b~') && !S.d.brackets[k.slice(2)]) upd[k] = null;
    if (Object.keys(upd).length) await S.store.patch(P.pub(e), 'v', upd);
    if (!quiet) toast('Spectators’ data refreshed');
    return true;
  } catch (err) { console.warn('[pub] sync failed', err); if (!quiet) toast('Could not refresh the spectators’ data: ' + ((err && err.message) || err), true); return false; }
}
function pubSyncLater() { clearTimeout(PUB.syncT); PUB.syncT = setTimeout(() => pubSync(false, true), 2500); }

/* ---------- spectator side: website cache (/api/live) ---------- */
const PUB_API = '/api/live';
function cdnUsable() { try { return /^https?:$/.test(location.protocol); } catch (e) { return false; } }
async function cdnGet(q) {
  const r = await fetch(PUB_API + '?' + q, { headers: { accept: 'application/json' } });
  if (!r.ok && r.status !== 403) throw new Error('http ' + r.status);
  const j = await r.json();
  if (!j || typeof j !== 'object' || !('ok' in j)) throw new Error('not the live feed');
  return j;
}
/** Public page, website-cache mode: one small request every 10 s; only changed parts / brackets are fetched (and those are cached for good). */
async function cdnStart() {
  S.pub.mode = 'cdn'; S.pub.have = {}; S.pub.part = {};
  const tick = async () => {
    if (!S.pub || S.pub.mode !== 'cdn') return;
    let b = null;
    try { b = await cdnGet('t=' + encodeURIComponent(S.pub.token)); S.pub.cdnOk = true; }
    catch (e) { if (!S.pub.cdnOk) { S.pub.mode = 'direct'; startPublicDirect(); return; } }   // no function on this site: read the database directly (later failures: keep the last data, try again)
    if (b) await cdnApply(b).catch(e => console.warn('[cdn]', e));
    const hidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
    const every = window.__ktPollMs || PUB_POLL;
    S.pub.timer = setTimeout(tick, hidden ? every * 6 : every);
  };
  await tick();
}
function cdnStop() { if (S.pub) { clearTimeout(S.pub.timer); S.pub.mode = 'direct'; } }
async function cdnApply(b) {
  const id = b.eventId, ev = b.ev;
  if (b.branding) S.branding = b.branding;
  const closeEv = () => { if (S.evId) { S.unsub.forEach(u => { try { u(); } catch (e) { /* ignore */ } }); S.unsub = []; S.evId = null; } };
  if (!b.ok || !ev || !ev.public || ev.shareToken !== S.pub.token) { S.events = {}; S.pub.error = b.state === 'paused' ? '' : 'This event is no longer shared publicly.'; S.pub.wait = null; S.pub.paused = b.state === 'paused' ? Object.assign({}, ev || {}, { id }) : null; closeEv(); S.loadedEvents = true; render(); return; }
  S.pub.evId = id; S.pub.error = ''; S.pub.paused = null;
  if (ev.pubFeed === 'direct') { cdnStop(); startPublicDirect(); return; }   // the director asked for instant updates
  if (!ev.live) { S.events = { [id]: Object.assign({}, ev, { id }) }; S.pub.wait = Object.assign({}, ev, { id }); closeEv(); S.loadedEvents = true; render(); return; }
  if (ev.pubPaused) { S.events = { [id]: Object.assign({}, ev, { id }) }; S.pub.wait = null; S.pub.paused = S.events[id]; closeEv(); S.loadedEvents = true; render(); return; }
  S.pub.wait = null;
  S.events = { [id]: Object.assign({}, ev, { id }) };
  if (S.evId !== id) { S.pub.have = {}; S.pub.part = {}; openEvent(id); }
  const v = b.v || {}, have = S.pub.have, want = Object.keys(v).filter(k => have[k] !== v[k]);
  const gone = Object.keys(have).filter(k => !(k in v));
  for (let i = 0; i < want.length; i += 6) {
    const got = await Promise.all(want.slice(i, i + 6).map(k => cdnGet(`t=${encodeURIComponent(S.pub.token)}&k=${encodeURIComponent(k)}&v=${encodeURIComponent(v[k])}`).then(r => [k, r], () => [k, null])));
    for (const [k, r] of got) if (r && r.ok) { cdnPut(k, r.d); have[k] = v[k]; }
  }
  for (const k of gone) { cdnPut(k, null); delete have[k]; }
  S.d.ringstate = b.rs || {};
  S.loadedEvents = true; render();
}
function cdnPut(k, d) {
  if (k.startsWith('b~')) { const did = k.slice(2); if (d) S.d.brackets[did] = Object.assign({}, d, { id: did }); else delete S.d.brackets[did]; S.d.brackets = Object.assign({}, S.d.brackets); return; }
  const pt = k.slice(2), col = pt.split('~')[0]; if (!PUB_COLS[col]) return;
  const before = S.pub.part[pt] || [], o = Object.assign({}, S.d[col]);
  for (const id of before) delete o[id];
  const ids = Object.keys((d && d.d) || {});
  for (const id of ids) if (d.d[id]) o[id] = Object.assign({}, d.d[id], { id });
  S.pub.part[pt] = ids; S.d[col] = o;
}

/* ---------- paused page (#4) ---------- */
function pausedHTML(ev) {
  ev = ev || {};
  return `<div class="card empty pub-wait" style="margin-top:32px" id="pub-paused"><div class="pub-logo">${logoHTML()}</div>
    <h1>${esc(ev.name || 'Tournament')}</h1>
    <p class="notice" style="display:block"><b>Live results are paused for a moment.</b> The tournament director paused the public results. Keep this page open — it comes back by itself.</p>
    <p class="tiny muted">Karate Event Tracker · no sign-in needed</p></div>`;
}
/** Director, while live: how spectators get the data, pause / resume, refresh. */
function spectatorCtlHTML(ev) {
  if (!ev || !ev.public || !S.store || S.store.mode === 'cloud') return '';
  const paused = !!ev.pubPaused, feed = ev.pubFeed === 'direct' ? 'direct' : 'cdn';
  return `<div class="spect-ctl stack" id="spect-ctl" style="gap:8px;border-top:1px solid var(--line);padding-top:10px">
    <div class="row between"><b>Spectators</b>${paused ? '<span class="chip warn" id="spect-state">Paused</span>' : '<span class="chip ok" id="spect-state">Seeing live results</span>'}</div>
    <label class="f"><span>Spectator updates</span><select id="pub-feed" data-change="pub-feed">
      <option value="cdn" ${feed === 'cdn' ? 'selected' : ''}>Website cache — every 10 s (best for big crowds)</option>
      <option value="direct" ${feed === 'direct' ? 'selected' : ''}>Direct from the database — instant (small events)</option></select></label>
    <p class="tiny muted">${feed === 'cdn' ? 'Spectators’ pages ask the website every 10 seconds; the website asks the database at most once per 10 seconds for everyone, so database use stays the same however many people watch.' : 'Each spectator’s page listens to the database itself: instant, but database use grows with every spectator.'} Directors, ring managers and staff always work straight on the database.</p>
    <div class="row" style="flex-wrap:wrap;gap:6px">${paused ? '<button class="sm go" data-act="pub-resume">Resume spectators</button>' : '<button class="sm danger" data-act="pub-pause">Pause spectators</button>'}<button class="sm" data-act="pub-refresh">Refresh spectators’ data</button></div>
    <p class="tiny muted">${paused ? 'Spectators see “Live results are paused” and read nothing from the database. Scoring is not affected.' : 'Pause cuts the public page off the database at once (e.g. if the database is overloaded) — the event’s team keeps working.'}</p></div>`;
}
async function pubPause(on) {
  const ev = curEvent(); if (!ev) return;
  await guard(() => S.store.update(P.event(ev.id), on ? { pubPaused: true, pausedAt: new Date().toISOString() } : { pubPaused: false }), on ? 'Spectators paused — the event’s team keeps working' : 'Spectators see live results again');
}
async function pubSetFeed(v) {
  const ev = curEvent(); if (!ev) return;
  await guard(() => S.store.update(P.event(ev.id), { pubFeed: v === 'direct' ? 'direct' : 'cdn' }), v === 'direct' ? 'Spectators get instant updates from the database' : 'Spectators get updates through the website cache');
}

/* ---------- follow a division ---------- */
function divFollowCardHTML(did) {
  const dv = DC.divBy[did]; if (!dv) return '';
  const br = S.d.brackets[did], bs = bracketState(did), n = divEntrants(did).length;
  const rings = [...new Set([dv.ringId, ...KT.segList(br).map(s => KT.ringOf(dv, s.seg))].filter(r => S.d.rings[r]))];
  let body = '';
  if (!br) body = `<div class="tiny muted">${plural(n, 'entrant')} · not drawn yet</div>`;
  else if (bs.complete) {
    const pl = DC.pl[did] || {}, row = (m, cls, id) => id ? `<div class="row" style="gap:8px"><span class="medal ${cls}" style="width:22px;height:22px">${m}</span><span class="name">${esc(entName(id, did))}</span></div>` : '';
    body = `<div class="stack" style="gap:4px">${row(1, 'g', pl.gold)}${row(2, 's', pl.silver)}${(pl.bronze || []).map(b => row(3, 'b', b)).join('')}</div>`;
  } else {
    const now = rings.map(r => [r, S.d.ringstate[r]]).filter(([, rs]) => rs && rs.did === did);
    const next = rings.flatMap(r => ringQueue(r).filter(x => x.did === did && !now.some(([, rs]) => x.kp ? rs.kp === x.kp.key : rs.mid === (x.m && x.m.id))).map(x => ({ r, x }))).slice(0, 3);
    const nowH = now.map(([r, rs]) => `<div class="fstat" ${rs.kp ? `data-act="view-bracket" data-id="${esc(did)}"` : `data-act="match" data-did="${esc(did)}" data-mid="${esc(rs.mid)}"`} role="button" tabindex="0"><span class="tiny muted">${esc(ringName(r))}</span><span class="chip aka">On the mat now</span></div>`).join('');
    const nextH = next.map(({ r, x }) => `<div class="fstat compact" ${x.kp ? `data-act="view-bracket" data-id="${esc(did)}"` : `data-act="match" data-did="${esc(did)}" data-mid="${esc(x.m.id)}"`} role="button" tabindex="0"><span class="tiny muted">${esc(ringName(r))} · ${esc(x.kp ? x.kp.label : KT.matchLabel(x.m, br))}</span><span class="chip">${x.kp ? esc(entName(x.kp.id, did)) : `${esc(entName(x.r.a, did))} vs ${esc(entName(x.r.b, did))}`}</span></div>`).join('');
    body = `${nowH}${nextH ? `<div class="label" style="margin-top:4px">Up next</div>${nextH}` : ''}${!nowH && !nextH ? '<div class="tiny muted">Waiting for the next round</div>' : ''}`;
  }
  return `<div class="card stack follow-div" data-did="${esc(did)}"><div class="row between"><div class="row" style="gap:6px;min-width:0">${star('divs', did)}<div style="min-width:0"><h3>${esc(dv.name)}</h3><div class="dojo">${plural(n, 'entrant')}${rings.length ? ' · ' + esc(rings.map(ringName).join(', ')) : ''}</div></div></div>${divStatusChip(did)}</div>
    ${body}<div><button class="sm" data-act="view-bracket" data-id="${esc(did)}">Bracket ›</button></div></div>`;
}
