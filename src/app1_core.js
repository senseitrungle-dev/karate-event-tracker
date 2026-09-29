/* ===== core: helpers, stores, state, roles ===== */
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const todayISO = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const clone = o => JSON.parse(JSON.stringify(o));
const fmtDate = d => { if (!d) return ''; const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); };
const plural = (n, w, ws) => `${n} ${n === 1 ? w : (ws || w + 's')}`;
function deepMerge(t, p) {
  for (const k of Object.keys(p)) {
    const v = p[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) t[k] = deepMerge(Object.assign({}, t[k]), v);
    else t[k] = v && typeof v === 'object' ? clone(v) : v;
  }
  return t;
}

/* ---------- stores ---------- */
function LocalStore() {
  const KEY = 'kt-local-v1';
  let docs = {};
  const load = () => { try { docs = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { docs = {}; } };
  load();
  const listeners = new Set();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(docs)); } catch (e) { /* storage blocked: keep in memory */ } };
  const parent = p => p.split('/').slice(0, -1).join('/');
  let pending = false;
  const notify = () => { if (pending) return; pending = true; setTimeout(() => { pending = false; listeners.forEach(l => l.fire()); }, 0); };
  try { window.addEventListener('storage', e => { if (e.key === KEY) { load(); notify(); } }); } catch (e) { /* ignore */ }
  return {
    mode: 'local',
    watch(col, cb) {
      const l = { fire() { const o = {}; for (const p in docs) if (parent(p) === col) { const id = p.split('/').pop(); o[id] = Object.assign({}, clone(docs[p]), { id }); } cb(o); } };
      listeners.add(l); setTimeout(() => l.fire(), 0);
      return () => listeners.delete(l);
    },
    async set(p, d) { docs[p] = clone(d); save(); notify(); },
    async update(p, d) { if (!docs[p]) throw { code: 'invalid_argument', message: 'Document does not exist' }; docs[p] = deepMerge(Object.assign({}, docs[p]), d); save(); notify(); },
    async del(p) { delete docs[p]; save(); notify(); },
    async get(p) { return docs[p] ? clone(docs[p]) : null; },
  };
}
function CloudStore(db) {
  const chain = {};
  const run = (p, fn) => { const next = (chain[p] || Promise.resolve()).catch(() => {}).then(fn); chain[p] = next; return next; };
  const retry = async fn => {
    try { return await fn(); } catch (e) {
      if (e && e.code === 'unavailable') { await new Promise(r => setTimeout(r, 400 + Math.random() * 600)); return fn(); }
      throw e;
    }
  };
  return {
    mode: 'cloud',
    watch(col, cb, onErr) {
      return db.collection(col).onSnapshot(s => {
        const o = {}; s.docs.forEach(d => { o[d.id] = Object.assign({}, d.data(), { id: d.id }); }); cb(o);
      }, e => { if (onErr) onErr(e); });
    },
    set: (p, d) => run(p, () => retry(() => db.doc(p).set(d))),
    update: (p, d) => run(p, () => retry(() => db.doc(p).update(d))),
    del: p => run(p, () => retry(() => db.doc(p).delete())),
    async get(p) { const s = await db.doc(p).get(); return s.exists ? s.data() : null; },
  };
}

/* ---------- state ---------- */
const S = {
  store: null, user: null, downloads: null, myId: null, isDirector: false, canWrite: null, readOnly: false,
  events: {}, evId: null, loadedEvents: false,
  d: { competitors: {}, pv: {}, teams: {}, divisions: {}, rings: {}, sessions: {}, brackets: {}, attendance: {}, ringstate: {} },
  loaded: {}, unsub: [],
  ui: { tab: 'overview', q: '', filter: 'all', bracketDiv: '', ring: '', session: '', divFilter: '', simRole: 'director', simRing: '' },
  draft: {}, profiles: {},
};
function readUIPrefs() { try { const p = JSON.parse(localStorage.getItem('kt-ui') || '{}'); if (p.simRole) S.ui.simRole = p.simRole; if (p.simRing) S.ui.simRing = p.simRing; if (p.evId) S.lastEv = p.evId; } catch (e) { /* ignore */ } }
function saveUIPrefs() { try { localStorage.setItem('kt-ui', JSON.stringify({ simRole: S.ui.simRole, simRing: S.ui.simRing, evId: S.evId })); } catch (e) { /* ignore */ } }

const P = {
  event: e => `events/${e}`,
  col: (e, c) => `events/${e}/${c}`,
  doc: (e, c, id) => `events/${e}/${c}/${id}`,
  pvCol: e => `pv/${e}/competitors`,
  pv: (e, id) => `pv/${e}/competitors/${id}`,
  liveCol: (e, c) => `live/${e}/${c}`,
  live: (e, c, id) => `live/${e}/${c}/${id}`,
};

/* ---------- roles ---------- */
function isLocal() { return S.store && S.store.mode === 'local'; }
function role() {
  if (isLocal()) return S.ui.simRole;
  if (S.isDirector) return 'director';
  if (!S.myId) return 'viewer';
  if (myRingIds().length || isStaff()) return 'manager';
  return 'viewer';
}
function isDirector() { return role() === 'director'; }
function myRingIds() {
  if (isLocal()) {
    if (S.ui.simRole === 'director') return Object.keys(S.d.rings);
    return S.ui.simRole === 'manager' && S.ui.simRing ? [S.ui.simRing] : [];
  }
  if (S.isDirector) return Object.keys(S.d.rings);
  return Object.values(S.d.rings).filter(r => (r.managerIds || []).includes(S.myId)).map(r => r.id);
}
function isStaff() {
  const ev = curEvent(); if (!ev) return false;
  if (isLocal()) return S.ui.simRole !== 'viewer';
  return S.isDirector || (!!S.myId && (ev.staffIds || []).includes(S.myId));
}
function canScoreDiv(did) {
  if (S.readOnly) return false;
  if (isDirector()) return true;
  const dv = S.d.divisions[did];
  return !!dv && role() === 'manager' && myRingIds().includes(dv.ringId);
}
function curEvent() { return S.evId ? S.events[S.evId] : null; }
const ROLE_LABEL = { director: 'Director', manager: 'Ring manager', viewer: 'Spectator' };

/* ---------- derived data ---------- */
const GROUP_ORDER = { Senior: 0, Youth: 1, Junior: 2, Cadet: 3 };
function divSort(a, b) {
  return KT.EVENT_ORDER.indexOf(a.eventType) - KT.EVENT_ORDER.indexOf(b.eventType) || (a.belt === b.belt ? 0 : a.belt === 'black' ? -1 : 1)
    || (GROUP_ORDER[a.group] ?? 9) - (GROUP_ORDER[b.group] ?? 9) || String(a.group || '').localeCompare(String(b.group || '')) || String(a.gender).localeCompare(String(b.gender)) || String(a.name).localeCompare(String(b.name));
}
let DC = null; // derived cache per render
function derive() {
  const ev = curEvent();
  const asOf = ev ? (ev.ageAsOf || ev.startDate || todayISO()) : todayISO();
  const comps = Object.values(S.d.competitors).map(c => S.d.pv[c.id] ? Object.assign({}, c, S.d.pv[c.id], { id: c.id }) : c);
  const compBy = Object.fromEntries(comps.map(c => [c.id, c]));
  const teams = Object.values(S.d.teams);
  const teamBy = Object.fromEntries(teams.map(t => [t.id, t]));
  const divs = Object.values(S.d.divisions).sort(divSort);
  const divBy = Object.fromEntries(divs.map(d => [d.id, d]));
  const rings = Object.values(S.d.rings).sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name)));
  const assign = KT.assignEntrants(comps, teams, divs, asOf);
  const res = {}, pl = {};
  for (const did in S.d.brackets) {
    const br = S.d.brackets[did];
    try { res[did] = KT.resolve(br); pl[did] = KT.placings(br, res[did]); } catch (e) { res[did] = {}; pl[did] = { complete: false, bronze: [] }; console.error(e); }
  }
  DC = { ev, asOf, comps, compBy, teams, teamBy, divs, divBy, rings, assign, res, pl };
  return DC;
}
function entName(id) {
  if (!id) return '';
  const c = DC.compBy[id]; if (c) return `${c.lastName || ''}, ${c.firstName || ''}`.replace(/^, |, $/g, '');
  const t = DC.teamBy[id]; if (t) return t.name || 'Team';
  return 'Withdrawn entrant';
}
function entDojo(id) {
  const c = DC.compBy[id]; if (c) return c.dojo || '';
  const t = DC.teamBy[id]; if (!t) return '';
  if (t.dojo) return t.dojo;
  const ds = [...new Set((t.memberIds || []).map(m => DC.compBy[m] && DC.compBy[m].dojo).filter(Boolean))];
  return ds.length === 1 ? ds[0] : ds.length ? 'Combined team' : '';
}
function divEntrants(did) { return (DC.assign.byDiv[did] || []); }
function bracketState(did) {
  const br = S.d.brackets[did];
  if (!br) return { drawn: false };
  if (br.format === 'KP') {
    const pg = KT.kpProgress(br);
    const cur = divEntrants(did).slice().sort().join('|'), was = (br.entrants || []).slice().sort().join('|');
    return { drawn: true, kp: true, fought: pg.done, playable: pg.total, complete: DC.pl[did] && DC.pl[did].complete, changed: cur !== was, results: Object.values(br.scores || {}).some(Boolean) };
  }
  const res = DC.res[did] || {};
  const ids = Object.keys(br.matches || {});
  const fought = ids.filter(id => res[id] && res[id].status === 'done').length;
  const playable = ids.filter(id => res[id] && !['bye', 'void', 'skip'].includes(res[id].status)).length;
  const cur = divEntrants(did).slice().sort().join('|'), was = (br.entrants || []).slice().sort().join('|');
  return { drawn: true, fought, playable, complete: DC.pl[did] && DC.pl[did].complete, changed: cur !== was, results: Object.values(br.results || {}).some(Boolean) };
}
function kindOf(dv) { return (KT.EVENT_TYPES[dv.eventType] || {}).kind; }
function scoringOf(dv) { return Object.assign(KT.defaultScoring(dv.eventType, dv.gender), dv.scoring || {}); }
function scoringLabel(dv) {
  const s = scoringOf(dv), k = kindOf(dv);
  if (dv.format === 'KP') return `Score pools · ${s.judges} judges`;
  if (k === 'kata') return s.method === 'scores' ? `Scores · ${s.judges} judges` : `Flags · ${s.judges} judges`;
  if (k === 'kumite') return s.style === 'kogo' ? 'Ko-go Kumite · 6 exchanges' : `Shobu Ippon · ${fmtClock(s.boutTime)}`;
  if (k === 'teamkumite') return `${s.bouts} rounds · team total · ${fmtClock(s.boutTime)}`;
  if (k === 'fukugo') return `Kumite / Ki-tei alternating${s.style === 'kogo' ? ' (Ko-go)' : ''}`;
  return '';
}
function fmtClock(sec) { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
function parseRank(s) {
  if (!s) return '';
  s = String(s).trim().toLowerCase();
  if (/^[kd]\d{1,2}$/.test(s)) return s;
  const words = { shodan: 'd1', nidan: 'd2', sandan: 'd3', yondan: 'd4', godan: 'd5', rokudan: 'd6', nanadan: 'd7', hachidan: 'd8', kudan: 'd9', judan: 'd10' };
  if (words[s]) return words[s];
  const m = s.match(/(\d{1,2})\s*(st|nd|rd|th)?\s*(kyu|dan)/);
  if (m) return (m[3] === 'kyu' ? 'k' : 'd') + (+m[1]);
  return '';
}

/* ---------- UI primitives ---------- */
let toastT = null;
function toast(msg, bad) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.className = 'toast' + (bad ? ' bad' : ''); el.textContent = msg; el.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, bad ? 5200 : 2600);
}
function errMsg(e) {
  const c = e && e.code;
  if (c === 'invalid_argument') return 'You do not have permission to change this, or the data was not accepted.';
  if (c === 'quota_exceeded') return 'The database is full. Delete an old event to free space.';
  if (c === 'resource_exhausted') return 'Too many changes at once. Wait a moment and try again.';
  if (c === 'revoked') return 'Your access to this page changed. Reload to continue.';
  return (e && e.message) || 'Could not save. Check your connection and try again.';
}
async function guard(fn, okMsg) {
  try { const r = await fn(); if (okMsg) toast(okMsg); return r === undefined ? true : r; } catch (e) { console.error(e); toast(errMsg(e), true); return undefined; }
}
function openModal(html, opts) {
  const host = $('#modal');
  host.innerHTML = `<div class="scrim" data-act="modal-scrim"><div class="sheet ${opts && opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div></div>`;
  host.hidden = false;
  const f = host.querySelector('[autofocus]') || host.querySelector('input,select,textarea,button:not(.ghost)');
  if (f && !(opts && opts.nofocus)) setTimeout(() => f.focus(), 30);
}
function closeModal() { const host = $('#modal'); host.hidden = true; host.innerHTML = ''; S.modal = null; stopClock(); }
function sheet(title, body, foot, sub) {
  return `<div class="sheet-h"><div><h2>${title}</h2>${sub ? `<div class="small muted">${sub}</div>` : ''}</div><button class="ghost" data-act="modal-close" aria-label="Close">✕</button></div>
    <div class="sheet-b">${body}</div>${foot ? `<div class="sheet-f">${foot}</div>` : ''}`;
}
let confirmResolve = null;
function confirmBox(msg, ok, danger) {
  return new Promise(res => {
    confirmResolve = res;
    const host = $('#confirm');
    host.innerHTML = `<div class="scrim"><div class="sheet" role="alertdialog" aria-modal="true"><div class="sheet-b"><p>${esc(msg)}</p></div>
      <div class="sheet-f"><button data-act="confirm-no">Cancel</button><button class="${danger ? 'danger' : 'primary'}" data-act="confirm-yes" autofocus>${esc(ok || 'OK')}</button></div></div></div>`;
    host.hidden = false; setTimeout(() => { const b = host.querySelector('[data-act="confirm-yes"]'); if (b) b.focus(); }, 30);
  });
}
function confirmDone(v) { const host = $('#confirm'); host.hidden = true; host.innerHTML = ''; if (confirmResolve) { const r = confirmResolve; confirmResolve = null; r(v); } }
async function saveFile(filename, text) {
  if (S.downloads) {
    try { await S.downloads.save({ filename, data: text }); return; } catch (e) { if (e && e.code === 'declined') return; }
  }
  openModal(sheet('Copy export', `<p class="small muted">Downloads are not available here. Copy the text below into a file named ${esc(filename)}.</p><textarea id="export-text" rows="14" readonly>${esc(text)}</textarea>`,
    `<button data-act="copy-export">Copy</button><button class="primary" data-act="modal-close">Done</button>`));
}
function fd(form) {
  const o = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    if (el.type === 'checkbox') { if (el.dataset.multi) { o[el.name] = o[el.name] || []; if (el.checked) o[el.name].push(el.value); } else o[el.name] = el.checked; }
    else if (el.type === 'radio') { if (el.checked) o[el.name] = el.value; }
    else if (el.multiple) o[el.name] = Array.from(el.selectedOptions).map(x => x.value);
    else o[el.name] = el.value.trim();
  }
  return o;
}
const opt = (v, label, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(label)}</option>`;
const rankOptions = sel => `<option value="">Select rank…</option>` + KT.RANKS.map(r => opt(r.code, r.label, sel)).join('');
function personChip(id) {
  const p = S.profiles[id] || {};
  return `<span class="person">${p.avatarUrl ? `<img src="${esc(p.avatarUrl)}" alt="">` : ''}<span>${esc(p.name || 'Team member')}</span></span>`;
}
async function refreshProfiles(ids) {
  if (!S.user || !ids.length) return;
  const missing = ids.filter(id => !S.profiles[id]);
  try { const ps = await S.user.profiles(ids); let changed = false; for (const id of ids) { if (ps[id] && (!S.profiles[id] || S.profiles[id].name !== ps[id].name)) { S.profiles[id] = ps[id]; changed = true; } } if (changed && missing.length) render(); } catch (e) { /* never rejects */ }
}
