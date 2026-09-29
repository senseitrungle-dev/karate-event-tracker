/* ===== actions, subscriptions, init ===== */
function subscribeEvents() {
  S.store.watch('events', o => { S.events = o; S.loadedEvents = true; if (S.lastEv && !S.evId && o[S.lastEv]) { const id = S.lastEv; S.lastEv = null; openEvent(id); } render(); }, dbErr);
}
function dbErr(e) { console.warn('db', e); if (e && e.code === 'revoked') { S.readOnly = true; toast('Access changed. Reload the page to continue.', true); } }
function openEvent(id) {
  S.unsub.forEach(u => { try { u(); } catch (e) { /* ignore */ } }); S.unsub = [];
  S.evId = id; S.d = { competitors: {}, pv: {}, teams: {}, divisions: {}, rings: {}, sessions: {}, brackets: {}, attendance: {}, ringstate: {} };
  S.ui.tab = 'overview'; S.ui.bracketDiv = ''; S.ui.ring = ''; S.ui.session = ''; S.ui.q = ''; S.ui.filter = 'all';
  saveUIPrefs();
  if (!id) { render(); return; }
  const w = (col, key) => S.unsub.push(S.store.watch(col, o => { S.d[key] = o; render(); }, dbErr));
  ['competitors', 'teams', 'divisions', 'rings', 'sessions'].forEach(c => w(P.col(id, c), c));
  ['brackets', 'attendance', 'ringstate'].forEach(c => w(P.liveCol(id, c), c));
  if (isLocal() || S.isDirector) w(P.pvCol(id), 'pv');
  window.scrollTo(0, 0);
  render();
}

async function drawDivision(did) {
  const dv = DC.divBy[did]; if (!dv) return;
  const bs = bracketState(did);
  if (bs.results) { toast('This bracket already has results. Clear them before redrawing.', true); return; }
  const ents = divEntrants(did);
  if (!ents.length) { toast('No entrants in this division.', true); return; }
  if (bs.drawn && !(await confirmBox(`Redraw ${dv.name}? The current draw is replaced.`, 'Redraw'))) return;
  const list = ents.map(id => ({ id, seed: (dv.seeds || {})[id] || 0, dojo: entDojo(id) }));
  const br = KT.generateBracket(dv, list);
  const ok = await guard(() => S.store.set(P.live(S.evId, 'brackets', did), br), `Drew ${dv.name}`);
  if (ok) { S.ui.bracketDiv = did; }
}
async function drawAll() {
  const ready = DC.divs.filter(d => !S.d.brackets[d.id] && divEntrants(d.id).length >= 1);
  if (!ready.length) { toast('Every division with entrants is already drawn.'); return; }
  if (!(await confirmBox(`Draw ${plural(ready.length, 'division')} now?`, 'Draw'))) return;
  for (const d of ready) {
    const list = divEntrants(d.id).map(id => ({ id, seed: (d.seeds || {})[id] || 0, dojo: entDojo(id) }));
    if (!(await guard(() => S.store.set(P.live(S.evId, 'brackets', d.id), KT.generateBracket(d, list))))) return;
  }
  toast(`Drew ${plural(ready.length, 'division')}`);
}
async function deleteEvent(id) {
  const ev = S.events[id];
  if (!(await confirmBox(`Delete “${ev.name}” and everything in it? This cannot be undone.`, 'Delete event', true))) return;
  const paths = [];
  for (const c of ['competitors', 'teams', 'divisions', 'rings', 'sessions']) Object.keys(S.d[c]).forEach(x => paths.push(P.doc(id, c, x)));
  Object.keys(S.d.pv).forEach(x => paths.push(P.pv(id, x)));
  for (const c of ['brackets', 'attendance', 'ringstate']) Object.keys(S.d[c]).forEach(x => paths.push(P.live(id, c, x)));
  closeModal();
  for (const p of paths) await guard(() => S.store.del(p));
  await guard(() => S.store.del(P.event(id)), 'Event deleted');
  openEvent(null);
}

async function createDemo() {
  const id = uid();
  const start = todayISO();
  const ev = { name: 'Riverside Invitational (demo)', kind: 'tournament', level: 'Regional', startDate: start, endDate: start, location: 'Demo Sports Hall', host: 'Demo Karate Association',
    eventTypes: KT.EVENT_ORDER.slice(), defaultFormat: 'SE', bronze: 'two', demo: true, staffIds: [], createdAt: new Date().toISOString() };
  toast('Creating demo tournament…');
  if (!(await guard(() => S.store.set(P.event(id), ev)))) return;
  const y = +start.slice(0, 4);
  const dojos = ['North Wind Dojo', 'Cedar Hill Karate', 'Lakeside Budokan', 'Iron Pine Club'];
  const first = { M: ['Alden', 'Bram', 'Caspian', 'Dorian', 'Emeric', 'Faris', 'Gideon', 'Hollis', 'Ivo', 'Jonah', 'Kellan', 'Lorcan'], F: ['Ada', 'Brielle', 'Celeste', 'Delphine', 'Elowen', 'Fenna', 'Greer', 'Hazel', 'Isolde', 'Juno'] };
  const last = ['Ashby', 'Brandt', 'Corwin', 'Dale', 'Everly', 'Fairbanks', 'Garrow', 'Hale', 'Ingram', 'Joss', 'Kerr', 'Lowell', 'Marsh', 'Nye', 'Oakes', 'Pryor'];
  const comps = [];
  let n = 0;
  const mk = (g, age, rank, events) => { const c = { id: uid() + n, g, age, rank, events }; n++; comps.push(c); return c; };
  for (let i = 0; i < 8; i++) mk('M', 24 + i * 3, 'd' + (1 + (i % 4)), ['IKATA', 'IKUMITE', 'FUKUGO']);
  for (let i = 0; i < 5; i++) mk('F', 22 + i * 4, 'd' + (1 + (i % 3)), ['IKATA', 'IKUMITE', 'TKATA']);
  for (let i = 0; i < 4; i++) mk('M', 16 + (i % 3), 'd1', ['IKATA', 'IKUMITE', 'TKUMITE']);
  for (let i = 0; i < 5; i++) mk('F', 30 + i, 'k' + (1 + (i % 3)), ['IKATA', 'ENBU']);
  const fm = { M: 0, F: 0 };
  const divs = KT.blackBeltDivisions(KT.EVENT_ORDER).concat(KT.kyuDivisions({ label: 'Adult', minRank: 'k5', maxRank: 'k1', minAge: 18, maxAge: null }, ['IKATA', 'ENBU']));
  const rings = [{ id: uid() + 'r1', name: 'Ring 1', order: 1, managerIds: [] }, { id: uid() + 'r2', name: 'Ring 2', order: 2, managerIds: [] }];
  for (const r of rings) await guard(() => S.store.set(P.doc(id, 'rings', r.id), r));
  const ringFor = d => (d.eventType === 'IKATA' || d.eventType === 'TKATA' || d.eventType === 'ENBU') ? rings[0].id : rings[1].id;
  let order = 0;
  for (const d of divs) { d.ringId = ringFor(d); d.ringOrder = order++; d.bronze = 'two'; if (d.eventType === 'IKUMITE' && d.group === 'Senior') d.format = 'DE'; if (d.eventType === 'IKATA' && d.group === 'Junior') d.format = 'RR'; await guard(() => S.store.set(P.doc(id, 'divisions', uid() + order), d)); }
  for (const c of comps) {
    const f = first[c.g][fm[c.g]++ % first[c.g].length], l = last[(n = (n * 7 + 3) % last.length)];
    const dob = `${y - c.age}-0${1 + (c.age % 8)}-1${c.age % 9}`;
    c.first = f; c.last = l; c.dojo = dojos[comps.indexOf(c) % dojos.length];
    await guard(async () => {
      await S.store.set(P.doc(id, 'competitors', c.id), { firstName: f, lastName: l, gender: c.g, rank: c.rank, dojo: c.dojo, state: 'Demo', country: 'Example', waiver: true, feePaid: true, checkedIn: true, status: 'active', events: c.events, divOverride: {}, age: KT.ageOn(dob, start), createdAt: new Date().toISOString() });
      await S.store.set(P.pv(id, c.id), { dob, email: '', phone: '', emergencyName: 'Demo contact', emergencyPhone: '000-000-0000', feeAmount: '', notes: 'Fictional demo record' });
    });
  }
  const women = comps.filter(c => c.events.includes('TKATA')), juniors = comps.filter(c => c.events.includes('TKUMITE')), enbu = comps.filter(c => c.events.includes('ENBU'));
  const teams = [
    { name: 'Senior Women A', eventType: 'TKATA', memberIds: women.slice(0, 3).map(c => c.id) },
    { name: 'Junior Men', eventType: 'TKUMITE', memberIds: juniors.slice(0, 3).map(c => c.id) },
    { name: 'Enbu Pair 1', eventType: 'ENBU', memberIds: enbu.slice(0, 2).map(c => c.id) },
    { name: 'Enbu Pair 2', eventType: 'ENBU', memberIds: enbu.slice(2, 4).map(c => c.id) },
  ];
  for (const t of teams) await guard(() => S.store.set(P.doc(id, 'teams', uid()), Object.assign({ dojo: '', divisionId: '', status: 'active', gender: 'F' }, t, { gender: t.eventType === 'TKUMITE' ? 'M' : 'F' })));
  openEvent(id);
  toast('Demo tournament ready. Draw brackets from the Divisions tab.');
}

/* ---------- event wiring ---------- */
const ACT = {
  home: () => { closeModal(); openEvent(null); },
  'open-event': el => openEvent(el.dataset.id),
  tab: (el, e) => { if (e) e.preventDefault(); S.ui.tab = el.dataset.v; if (el.dataset.filter) S.ui.filter = el.dataset.filter; window.scrollTo(0, 0); render(); },
  'modal-close': () => closeModal(),
  'modal-scrim': (el, e) => { if (e.target === el) closeModal(); },
  'confirm-yes': () => confirmDone(true), 'confirm-no': () => confirmDone(false),
  'copy-export': () => { const t = $('#export-text'); try { navigator.clipboard.writeText(t.value).then(() => toast('Copied'), () => { t.select(); }); } catch (e) { t.select(); } },
  'event-new': () => eventForm(null),
  'event-edit': () => eventForm(S.evId),
  'event-delete': () => deleteEvent(S.evId),
  demo: () => createDemo(),
  'fb-signin': () => fbSignIn(), 'fb-signout': () => fbSignOut(), 'fb-claim': () => fbClaimDirector(), 'fb-access': () => accessForm(),
  'comp-new': () => compForm(null),
  'comp-edit': el => compForm(el.dataset.id),
  'comp-delete': async () => {
    const id = $('#f-comp').dataset.id, c = DC.compBy[id];
    if (!(await confirmBox(`Delete ${c.firstName} ${c.lastName}? Consider marking them withdrawn instead if they already competed.`, 'Delete', true))) return;
    closeModal(); await guard(async () => { await S.store.del(P.doc(S.evId, 'competitors', id)); await S.store.del(P.pv(S.evId, id)); }, 'Deleted');
  },
  checkin: (el, e) => { e.stopPropagation(); const c = DC.compBy[el.dataset.id]; guard(() => S.store.update(P.doc(S.evId, 'competitors', c.id), { checkedIn: !c.checkedIn })); },
  'import-open': () => importForm(),
  'imp-preview': () => { const { recs, errors } = importRows($('#imp-text').value); $('#imp-preview').innerHTML = `${plural(recs.length, 'competitor')} ready to import.${errors.length ? '<br>' + errors.slice(0, 8).map(esc).join('<br>') + (errors.length > 8 ? '<br>…' : '') : ''}`; },
  'imp-run': () => runImport(),
  'export-comps': () => {
    const dir = isDirector();
    const rows = [['first_name', 'last_name', 'gender', 'dob', 'age', 'rank', 'dojo', 'state', 'country', 'email', 'phone', 'emergency_name', 'emergency_phone', 'waiver', 'paid', 'checked_in', 'status', 'events']];
    for (const c of DC.comps) rows.push([c.firstName, c.lastName, c.gender, dir ? c.dob : '', KT.ageOf(c, DC.asOf), KT.rankLabel(c.rank), c.dojo, c.state, c.country, dir ? c.email : '', dir ? c.phone : '', dir ? c.emergencyName : '', dir ? c.emergencyPhone : '', c.waiver ? 'yes' : 'no', c.feePaid ? 'yes' : 'no', c.checkedIn ? 'yes' : 'no', c.status, (c.events || []).map(e => KT.EVENT_TYPES[e] ? KT.EVENT_TYPES[e].label : e).join('; ')]);
    saveFile(`${curEvent().name} - competitors.csv`, KT.toCSV(rows));
  },
  'export-results': () => {
    const rows = [['division', 'place', 'name', 'dojo']];
    for (const d of DC.divs) {
      const br = S.d.brackets[d.id]; const pl = br ? DC.pl[d.id] : (divEntrants(d.id).length === 1 ? { complete: true, gold: divEntrants(d.id)[0], bronze: [] } : null);
      if (!pl || !pl.complete) continue;
      if (pl.gold) rows.push([d.name, 1, entName(pl.gold), entDojo(pl.gold)]);
      if (pl.silver) rows.push([d.name, 2, entName(pl.silver), entDojo(pl.silver)]);
      (pl.bronze || []).forEach(b => rows.push([d.name, 3, entName(b), entDojo(b)]));
    }
    saveFile(`${curEvent().name} - results.csv`, KT.toCSV(rows));
  },
  'team-new': el => teamForm(null, el.dataset.et),
  'team-edit': el => teamForm(el.dataset.id),
  'team-delete': async () => { const id = $('#f-team').dataset.id; if (!(await confirmBox('Delete this team?', 'Delete', true))) return; closeModal(); guard(() => S.store.del(P.doc(S.evId, 'teams', id)), 'Team deleted'); },
  'div-std': () => stdDivForm(false),
  'div-kyu': () => stdDivForm(true),
  'div-new': () => divForm(null),
  'div-edit': el => divForm(el.dataset.id),
  'div-delete': async () => {
    const id = $('#f-div').dataset.id; const bs = bracketState(id);
    if (!(await confirmBox(bs.drawn ? 'Delete this division and its bracket and results?' : 'Delete this division?', 'Delete', true))) return;
    closeModal(); await guard(async () => { if (bs.drawn) await S.store.del(P.live(S.evId, 'brackets', id)); await S.store.del(P.doc(S.evId, 'divisions', id)); }, 'Division deleted');
  },
  'bracket-clear': async () => {
    const id = $('#f-div').dataset.id; const bs = bracketState(id);
    if (!(await confirmBox(bs.results ? 'Clear this bracket and ALL recorded results?' : 'Clear this bracket?', 'Clear bracket', true))) return;
    await guard(() => S.store.del(P.live(S.evId, 'brackets', id)), 'Bracket cleared'); closeModal();
  },
  draw: async el => {
    const form = $('#f-div');
    if (form && form.dataset.id === el.dataset.id) { const id = await saveDiv(form, true); if (!id) return; setTimeout(() => drawDivision(id), 50); return; }
    drawDivision(el.dataset.id);
  },
  'draw-all': () => drawAll(),
  'view-bracket': el => { S.ui.bracketDiv = el.dataset.id; S.ui.tab = 'brackets'; render(); },
  'ring-new': () => ringForm(null),
  'ring-edit': el => ringForm(el.dataset.id),
  'ring-delete': async () => {
    const id = $('#f-ring').dataset.id;
    if (!(await confirmBox('Delete this ring? Its divisions become unassigned.', 'Delete', true))) return;
    closeModal();
    for (const d of DC.divs.filter(x => x.ringId === id)) await guard(() => S.store.update(P.doc(S.evId, 'divisions', d.id), { ringId: '' }));
    guard(() => S.store.del(P.doc(S.evId, 'rings', id)), 'Ring deleted');
  },
  'ring-move': async el => {
    const d = DC.divBy[el.dataset.id]; const list = DC.divs.filter(x => x.ringId === d.ringId).sort((a, b) => (a.ringOrder || 0) - (b.ringOrder || 0));
    const i = list.indexOf(d), j = i + (+el.dataset.dir); if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (let k = 0; k < list.length; k++) if ((list[k].ringOrder || 0) !== k) await guard(() => S.store.update(P.doc(S.evId, 'divisions', list[k].id), { ringOrder: k }));
  },
  'ring-undiv': el => guard(() => S.store.update(P.doc(S.evId, 'divisions', el.dataset.id), { ringId: '' })),
  'ring-manage': el => { const r = S.d.rings[el.dataset.ring]; const ids = [...new Set((r.managerIds || []).concat(el.dataset.uid))]; $$('.dd-list').forEach(x => { x.hidden = true; }); guard(() => S.store.update(P.doc(S.evId, 'rings', r.id), { managerIds: ids }), 'Manager added'); },
  'ring-unmanage': el => { const r = S.d.rings[el.dataset.id]; guard(() => S.store.update(P.doc(S.evId, 'rings', r.id), { managerIds: (r.managerIds || []).filter(x => x !== el.dataset.uid) })); },
  'staff-add': el => { const ev = curEvent(); $$('.dd-list').forEach(x => { x.hidden = true; }); guard(() => S.store.update(P.event(ev.id), { staffIds: [...new Set((ev.staffIds || []).concat(el.dataset.uid))] }), 'Staff added'); },
  'staff-remove': el => { const ev = curEvent(); guard(() => S.store.update(P.event(ev.id), { staffIds: (ev.staffIds || []).filter(x => x !== el.dataset.uid) })); },
  'session-new': () => sessionForm(null),
  'session-edit': el => sessionForm(el.dataset.id),
  'session-delete': async () => { const id = $('#f-sess').dataset.id; if (!(await confirmBox('Delete this session and its attendance?', 'Delete', true))) return; closeModal(); await guard(async () => { await S.store.del(P.doc(S.evId, 'sessions', id)); await S.store.del(P.live(S.evId, 'attendance', id)); }, 'Session deleted'); },
  'att-all': async () => { const sid = S.ui.session, present = {}; DC.comps.filter(c => c.status !== 'withdrawn').forEach(c => { present[c.id] = true; }); await writeAttendance(sid, present); },
  tiebreak: el => tiebreakForm(el.dataset.did, el.dataset.pool),
  'tb-move': el => { const i = +el.dataset.i, j = i + (+el.dataset.dir); [S.tbOrder[i], S.tbOrder[j]] = [S.tbOrder[j], S.tbOrder[i]]; $('#tb-body').innerHTML = S.tbDraw(); },
  'tb-save': async () => { const M = S.modal; const ok = await guard(() => S.store.update(P.live(S.evId, 'brackets', M.did), { tiebreak: { [M.P]: S.tbOrder.slice() } }), 'Order saved'); if (ok) closeModal(); },
  /* scoring */
  score: el => openScore(el.dataset.did, el.dataset.mid),
  flag: el => { const d = loadDraft(S.modal.key), f = el.dataset.f; d[f] = d[f] || []; const i = +el.dataset.i; d[f][i] = d[f][i] === el.dataset.s ? null : el.dataset.s; draftChanged(); },
  kiken: el => { const d = loadDraft(S.modal.key); d.kiken = d.kiken === el.dataset.s ? null : el.dataset.s; draftChanged(); },
  'k-ev': el => {
    const M = S.modal, d = loadDraft(M.key), dv = DC.divBy[M.did], sc = scoringOf(dv);
    const log = logAt(d, el.dataset.p);
    const ev = { t: el.dataset.t }; if (el.dataset.s) ev.s = el.dataset.s;
    const before = KT.kumiteEval(log, { kettei: sc.ketteiTime > 0, allowDraw: el.dataset.p.startsWith('bouts') }).phase;
    log.push(ev);
    const after = KT.kumiteEval(log, { kettei: sc.ketteiTime > 0, allowDraw: el.dataset.p.startsWith('bouts') });
    if (before !== 'kettei' && after.phase === 'kettei') setClock(sc.ketteiTime);
    if (after.done) stopClock();
    draftChanged();
  },
  'k-undo': el => { const M = S.modal, d = loadDraft(M.key); logAt(d, el.dataset.p).pop(); draftChanged(); },
  clock: () => toggleClock(),
  'clock-reset': el => { const M = S.modal, d = loadDraft(M.key), sc = scoringOf(DC.divBy[M.did]); const ph = KT.kumiteEval(logAt(d, el.dataset.p), { kettei: sc.ketteiTime > 0 }).phase; setClock(ph === 'kettei' ? sc.ketteiTime : sc.boutTime); },
  'bout-sel': el => { S.boutSel = +el.dataset.i; const sc = scoringOf(DC.divBy[S.modal.did]); setClock(sc.boutTime); renderScore(true); },
  'fk-hantei': el => { const d = loadDraft(S.modal.key); d.hantei = el.dataset.s; draftChanged(); },
  'reset-draft': async () => { if (!(await confirmBox('Clear everything entered on this scoresheet?', 'Clear'))) return; const M = S.modal; dropDraft(M.key); S.boutSel = 0; setClock(scoringOf(DC.divBy[M.did]).boutTime); renderScore(true); pushLive(); },
  'call-mat': () => { pushLive(); toast('Called to the mat'); },
  'save-result': () => saveResult(),
  'undo-result': async () => {
    const M = S.modal; const br = S.d.brackets[M.did];
    if (!KT.canEdit(br, M.mid, DC.res[M.did])) return;
    if (!(await confirmBox('Undo this result? The match returns to “ready”.', 'Undo result', true))) return;
    const ok = await guard(() => S.store.update(P.live(S.evId, 'brackets', M.did), { results: { [M.mid]: null } }), 'Result undone');
    if (ok) closeModal();
  },
};
const CHANGE = {
  'sim-role': el => { S.ui.simRole = el.value; saveUIPrefs(); closeModal(); render(); },
  'sim-ring': el => { S.ui.simRing = el.value; saveUIPrefs(); render(); },
  filter: el => { S.ui.filter = el.value; render(); },
  divFilter: el => { S.ui.divFilter = el.value; render(); },
  ring: el => { S.ui.ring = el.value; render(); },
  bracketDiv: el => { S.ui.bracketDiv = el.value; render(); },
  session: el => { S.ui.session = el.value; render(); },
  'ev-kind': el => { $$('.ev-t').forEach(x => { x.hidden = el.value !== 'tournament'; }); },
  'div-et': el => { const g = $('#d-g'); const cur = g.value; g.innerHTML = KT.EVENT_TYPES[el.value].genders.map(x => opt(x, KT.GENDERS[x], cur)).join(''); },
  'ring-adddiv': el => { if (!el.value) return; const rid = el.dataset.ring; const n = DC.divs.filter(d => d.ringId === rid).length; guard(() => S.store.update(P.doc(S.evId, 'divisions', el.value), { ringId: rid, ringOrder: n })); },
  'ring-format': async el => {
    const f = el.value; if (!f) return;
    const list = DC.divs.filter(d => d.ringId === el.dataset.ring);
    let n = 0, skipped = 0;
    for (const d of list) { if (bracketState(d.id).drawn) { skipped++; continue; } if (d.format !== f) { await guard(() => S.store.update(P.doc(S.evId, 'divisions', d.id), { format: f })); n++; } }
    toast(`${KT.FORMATS[f]} set on ${plural(n, 'division')}${skipped ? ` · ${skipped} already drawn (redraw to change)` : ''}`);
  },
  'fb-role': el => guard(() => el.checked ? FB.fs.doc('roles/' + el.dataset.uid).set({ role: 'director', at: new Date().toISOString() }) : FB.fs.doc('roles/' + el.dataset.uid).delete(), 'Access updated'),
  awarded: el => guard(() => S.store.update(P.live(S.evId, 'brackets', el.dataset.did), { awarded: el.checked })),
  att: el => writeAttendance(S.ui.session, { [el.dataset.id]: el.checked }),
  'imp-file': el => { const f = el.files && el.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { $('#imp-text').value = rd.result; ACT['imp-preview'](); }; rd.readAsText(f); },
  kscore: el => { const d = loadDraft(S.modal.key), k = el.dataset.s === 'a' ? 'sa' : 'sb'; d[k] = d[k] || []; const v = el.value.replace(',', '.'); d[k][+el.dataset.i] = v === '' ? '' : v; draftChanged(); },
  'bout-member': el => { const d = loadDraft(S.modal.key); const i = el.dataset.i; let b; if (i === 'd') { d.daihyo = d.daihyo || { log: [] }; b = d.daihyo; } else { d.bouts = d.bouts || []; d.bouts[+i] = d.bouts[+i] || { log: [] }; b = d.bouts[+i]; } b[el.dataset.s === 'a' ? 'ma' : 'mb'] = el.value; draftChanged(); },
};
async function writeAttendance(sid, present) {
  const path = P.live(S.evId, 'attendance', sid);
  if (S.d.attendance[sid]) await guard(() => S.store.update(path, { present }));
  else await guard(() => S.store.set(path, { present }));
}
let searchT = null;
const INPUT = {
  q: el => { S.ui.q = el.value; render(); },
  'mgr-search': el => personSearch(el, $('#mgr-dd-' + el.dataset.ring), id => `data-act="ring-manage" data-ring="${esc(el.dataset.ring)}" data-uid="${esc(id)}"`),
  'staff-search': el => personSearch(el, $('#staff-dd'), id => `data-act="staff-add" data-uid="${esc(id)}"`),
};
function personSearch(input, dd, attrs) {
  if (!S.user) return;
  clearTimeout(searchT);
  searchT = setTimeout(async () => {
    const hits = await S.user.search(input.value);
    hits.forEach(h => { S.profiles[h.id] = h; });
    dd.innerHTML = hits.length ? hits.map(h => `<button type="button" ${attrs(h.id)}><img src="${esc(h.avatarUrl)}" alt="" width="20" height="20" style="border-radius:50%"> ${esc(h.name)}${h.email ? ` <span class="muted small">${esc(h.email)}</span>` : ''}</button>`).join('')
      : `<div class="small muted" style="padding:10px">No people found. They need access to this page first — share it with them from claude.ai, then search again.</div>`;
    dd.hidden = false;
  }, 120);
}

function wire() {
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!e.target.closest('.dd')) $$('.dd-list').forEach(x => { x.hidden = true; });
    if (!el) return;
    const fn = ACT[el.dataset.act]; if (!fn) return;
    if (el.tagName === 'A') e.preventDefault();
    fn(el, e);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { if (!$('#confirm').hidden) confirmDone(false); else if (!$('#modal').hidden) closeModal(); }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.bm[role="button"]')) { e.preventDefault(); e.target.click(); }
  });
  document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el && CHANGE[el.dataset.change]) CHANGE[el.dataset.change](el, e); });
  document.addEventListener('input', e => { const el = e.target.closest('[data-input]'); if (el && INPUT[el.dataset.input]) INPUT[el.dataset.input](el, e); });
  document.addEventListener('focusin', e => { const el = e.target.closest('[data-input$="-search"]'); if (el && INPUT[el.dataset.input]) INPUT[el.dataset.input](el, e); });
  document.addEventListener('submit', async e => {
    const f = e.target.closest('[data-form]'); if (!f) return; e.preventDefault();
    const k = f.dataset.form;
    if (k === 'event') {
      const v = fd(f), id = f.dataset.id || uid(), old = S.events[f.dataset.id] || {};
      if (!v.name || !v.startDate) { toast('Name and start date are required.', true); return; }
      if (v.kind === 'tournament' && !(v.eventTypes || []).length) { toast('Pick at least one event.', true); return; }
      const ev = Object.assign({}, old, v, { id: undefined, staffIds: old.staffIds || [], createdAt: old.createdAt || new Date().toISOString() }); delete ev.id;
      const ok = await guard(() => S.store.set(P.event(id), ev), f.dataset.id ? 'Event saved' : 'Event created');
      if (!ok) return;
      closeModal();
      if (!f.dataset.id) openEvent(id);
      else {
        const asOf = v.ageAsOf || v.startDate, oldAsOf = old.ageAsOf || old.startDate;
        if (asOf !== oldAsOf) for (const c of DC.comps) if (c.dob) await guard(() => S.store.update(P.doc(id, 'competitors', c.id), { age: KT.ageOn(c.dob, asOf) }));
      }
    }
    else if (k === 'comp') saveComp(f);
    else if (k === 'team') saveTeam(f);
    else if (k === 'div') saveDiv(f);
    else if (k === 'std') saveStd(f, false);
    else if (k === 'kyu') saveStd(f, true);
    else if (k === 'ring') {
      const v = fd(f); if (!v.name) return;
      const id = f.dataset.id; const ok = await guard(() => id ? S.store.update(P.doc(S.evId, 'rings', id), { name: v.name }) : S.store.set(P.doc(S.evId, 'rings', uid()), { name: v.name, order: DC.rings.length + 1, managerIds: [] }), 'Ring saved');
      if (ok) closeModal();
    }
    else if (k === 'session') {
      const v = fd(f); if (!v.title || !v.date) { toast('Title and date are required.', true); return; }
      const ok = await guard(() => S.store.set(P.doc(S.evId, 'sessions', f.dataset.id || uid()), v), 'Session saved'); if (ok) closeModal();
    }
  });
}

async function init() {
  readUIPrefs();
  wire();
  render();
  if (window.KT_FIREBASE_CONFIG && window.firebase) {
    try { if (!(await initFirebase(window.KT_FIREBASE_CONFIG))) return; }
    catch (e) { console.error(e); S.store = LocalStore(); toast('Could not reach Firebase. Working in local mode.', true); }
    subscribeEvents(); render(); return;
  }
  let db = null, user = null;
  const cl = window.claude && typeof window.claude.use === 'function' ? window.claude : null;
  if (cl) {
    try { [db, user] = await Promise.all([cl.use('db'), cl.use('user')]); } catch (e) { db = null; }
    cl.use('downloads').then(x => { S.downloads = x; }).catch(() => {});
  }
  if (db) {
    S.store = CloudStore(db); S.user = user;
    if (user) {
      try {
        const [me, canEd, canW] = await Promise.all([user.me(), user.canEdit(), user.can('data.write')]);
        S.myId = me.id; S.isDirector = !!canEd; S.canWrite = canW;
        if (canW === false && !canEd) S.readOnly = true;
      } catch (e) { /* reads never reject */ }
    }
  } else {
    S.store = LocalStore();
  }
  subscribeEvents();
  render();
}
