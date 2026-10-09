/* ===== actions, subscriptions, init ===== */
function subscribeEvents() {
  watchBranding();
  S.store.watch('events', o => { S.events = o; S.loadedEvents = true; if (S.lastEv && !S.evId && o[S.lastEv]) { const id = S.lastEv; S.lastEv = null; openEvent(id); } render(); }, dbErr);
  subscribePeople();
}
/* people, directors and invites (v1.7) */
function subscribePeople() {
  const quiet = () => {};
  if (FB.on) {
    S.store.watch('users', o => { S.people = o; for (const id in o) FB.cache[id] = o[id]; render(); }, quiet);
    S.store.watch('roles', o => { S.fbRoles = o; render(); }, quiet);
    if (S.isAdmin) S.store.watch('invites', o => { S.invites = o; render(); }, quiet);
    else if (S.store.watchWhere) S.store.watchWhere('invites', 'by', S.myId, o => { S.invites = o; render(); }, quiet);
    if (S.isAdmin) S.store.watch('orgRequests', o => { S.orgReqs = o; render(); }, quiet);
    else if (S.myEmail) S.store.get('invites/' + S.myEmail).then(i => { if (i) { S.invites = { [S.myEmail]: Object.assign({ id: S.myEmail }, i) }; applyMyInvites(); } }).catch(() => {});
    return;
  }
  S.store.watch('people', o => { S.people = o; render(); notePresence(); }, quiet);
  S.store.watchDoc('meta/access', a => {
    S.access = a || {};
    if (S.isOwnerFlag && S.myId && S.access.ownerId !== S.myId) S.store.set('meta/access', Object.assign({}, S.access, { ownerId: S.myId })).catch(() => {});
    S.ownerId = S.access.ownerId || (S.isOwnerFlag ? S.myId : '');
    recomputeDirector(); applyMyInvites(); render();
  }, quiet);
  if (S.canEditor || isLocal()) S.store.watch('invites', o => { S.invites = o; applyMyInvites(); render(); }, quiet);
  if (S.canEditor) S.store.watch('orgRequests', o => { S.orgReqs = o; render(); }, quiet);
}
function dbErr(e) { console.warn('db', e); if (e && e.code === 'revoked') { S.readOnly = true; toast('Access changed. Reload the page to continue.', true); } }
function openEvent(id) {
  if (id && S.events[id] && !canOpenEvent(S.events[id])) { toast('You don’t have access to this event. Use “Request access”.', true); return; }
  S.unsub.forEach(u => { try { u(); } catch (e) { /* ignore */ } }); S.unsub = [];
  S.evId = id; S.d = { competitors: {}, pv: {}, teams: {}, divisions: {}, rings: {}, sessions: {}, judges: {}, brackets: {}, attendance: {}, ringstate: {}, ringready: {}, requests: {} };
  S.ui.tab = ''; S.ui.fq = ''; S.ui.bracketDiv = ''; S.ui.ring = ''; S.ui.session = ''; S.ui.q = ''; S.ui.filter = 'all';
  saveUIPrefs();
  if (!id) { render(); return; }
  const w = (col, key) => S.unsub.push(S.store.watch(col, o => { S.d[key] = o; render(); }, dbErr));
  ['competitors', 'teams', 'divisions', 'rings', 'sessions', 'judges'].forEach(c => w(P.col(id, c), c));
  ['brackets', 'attendance', 'ringstate', 'ringready'].forEach(c => w(P.liveCol(id, c), c));
  if (!S.pub && (isLocal() || isEventDirector(S.events[id]))) { w(P.pvCol(id), 'pv'); w(P.col(id, 'requests'), 'requests'); setTimeout(scheduleSync, 1500); }
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
  const clash = KT.seedClashes(dv.seeds);
  if (Object.keys(clash).length) { toast(seedClashText(clash) + ' Fix the seeds in Settings first.', true); return; }
  const list = ents.map(id => ({ id, seed: (dv.seeds || {})[id] || 0, group: entGroup(id) }));
  const br = KT.generateBracket(dv, list);
  const ok = await guard(() => S.store.set(P.live(S.evId, 'brackets', did), br), `Drew ${dv.name}`);
  if (ok) { S.ui.bracketDiv = did; }
}
async function drawAll() {
  const ready = DC.divs.filter(d => !S.d.brackets[d.id] && divEntrants(d.id).length >= 1);
  if (!ready.length) { toast('Every division with entrants is already drawn.'); return; }
  if (!(await confirmBox(`Draw ${plural(ready.length, 'division')} now?`, 'Draw'))) return;
  for (const d of ready) {
    const clash = KT.seedClashes(d.seeds);
    if (Object.keys(clash).length) { toast(`${d.name}: ` + seedClashText(clash), true); return; }
    const list = divEntrants(d.id).map(id => ({ id, seed: (d.seeds || {})[id] || 0, group: entGroup(id) }));
    if (!(await guard(() => S.store.set(P.live(S.evId, 'brackets', d.id), KT.generateBracket(d, list))))) return;
  }
  toast(`Drew ${plural(ready.length, 'division')}`);
}
async function deleteEvent(id) {
  const ev = S.events[id];
  if (!(await confirmBox(`Delete “${ev.name}” and everything in it? This cannot be undone.`, 'Delete event', true))) return;
  const paths = [];
  for (const c of ['competitors', 'teams', 'divisions', 'rings', 'sessions', 'judges']) Object.keys(S.d[c]).forEach(x => paths.push(P.doc(id, c, x)));
  Object.keys(S.d.pv).forEach(x => paths.push(P.pv(id, x)));
  for (const c of ['brackets', 'attendance', 'ringstate', 'ringready']) Object.keys(S.d[c]).forEach(x => paths.push(P.live(id, c, x)));
  closeModal();
  for (const p of paths) await guard(() => S.store.del(p));
  await guard(() => S.store.del(P.event(id)), 'Event deleted');
  openEvent(null);
}

/* v1.9: three demo tournaments — Local (clubs/dojos), National (regions), World Championship (countries) */
const DEMOS = {
  local: { name: 'Riverside Invitational (demo)', level: 'Local', location: 'Riverside Community Sports Hall', host: 'Riverside Karate Club', rings: 2,
    groups: ['North Wind Dojo', 'Cedar Hill Karate', 'Lakeside Budokan', 'Iron Pine Club'], field: 'dojo', men: 18, women: 5, juniors: 4, kyu: 5, judgeLv: [1, 6] },
  national: { name: 'National Karate Championship (demo)', level: 'National', location: 'National Sports Centre', host: 'National Karate Federation', rings: 3,
    groups: ['Pacific', 'Mountain', 'Central', 'Eastern', 'Southern'], field: 'state', men: 24, women: 10, juniors: 6, kyu: 6, judgeLv: [2, 7],
    clubs: ['Shoreline Dojo', 'Summit Karate', 'Prairie Budokan', 'Harbor Dojo', 'Delta Karate Club', 'Granite Dojo', 'Bayview Karate', 'Canyon Budokan'] },
  international: { name: 'World Karate Championship (demo)', level: 'International', location: 'International Arena', host: 'World Traditional Karate Federation (fictional)', rings: 4,
    groups: ['Japan', 'United States', 'France', 'Brazil', 'Canada', 'Italy', 'India', 'Australia', 'Poland', 'South Africa'], field: 'country', men: 32, women: 12, juniors: 8, kyu: 6, judgeLv: [3, 7] },
};
function demoChooser() {
  const card = (k, t, d) => `<button class="card stack demo-pick" data-act="demo-make" data-kind="${k}"><b>${t}</b><span class="small muted">${d}</span></button>`;
  openModal(sheet('Create a demo tournament', `<p class="small muted">Fictional competitors, judges and teams to explore the tracker. You can delete a demo any time from Event settings.</p>
    <div class="stack">${card('local', 'Local tournament · clubs & dojos', 'Riverside Invitational — 4 dojos, 2 rings, ~30 competitors, judges listed by dojo.')}
    ${card('national', 'National championship · regions', '5 regions with their clubs, 3 rings, ~45 competitors, judges listed by region (credential level 3+ required).')}
    ${card('international', 'World championship · countries', '10 national teams, 4 rings, ~60 competitors, judges listed by country (level 3+).')}</div>`, '<button data-act="modal-close">Cancel</button>'), { nofocus: true });
}
async function createDemo(kind) {
  const C = DEMOS[kind] || DEMOS.local;
  closeModal();
  const id = uid();
  const start = todayISO();
  const ev = { name: C.name, kind: 'tournament', level: C.level, startDate: start, endDate: start, location: C.location, host: C.host,
    eventTypes: KT.EVENT_ORDER.slice(), defaultFormat: 'SE', bronze: 'two', demo: true, demoKind: kind, staffIds: [], createdAt: new Date().toISOString(),
    directorIds: S.myId ? [S.myId] : [], managerIds: [], createdBy: S.myId || '' };
  toast('Creating demo tournament…');
  if (!(await guard(() => S.store.set(P.event(id), ev)))) return;
  const y = +start.slice(0, 4);
  const first = { M: ['Alden', 'Bram', 'Caspian', 'Dorian', 'Emeric', 'Faris', 'Gideon', 'Hollis', 'Ivo', 'Jonah', 'Kellan', 'Lorcan', 'Mateo', 'Niko', 'Osric', 'Pavel'], F: ['Ada', 'Brielle', 'Celeste', 'Delphine', 'Elowen', 'Fenna', 'Greer', 'Hazel', 'Isolde', 'Juno', 'Keiko', 'Liora'] };
  const last = ['Ashby', 'Brandt', 'Corwin', 'Dale', 'Everly', 'Fairbanks', 'Garrow', 'Hale', 'Ingram', 'Joss', 'Kerr', 'Lowell', 'Marsh', 'Nye', 'Oakes', 'Pryor', 'Quill', 'Rowan', 'Sato', 'Tanaka'];
  const comps = [];
  let n = 0;
  const mk = (g, age, rank, events) => { const c = { id: uid() + n, g, age, rank, events }; n++; comps.push(c); return c; };
  for (let i = 0; i < C.men; i++) mk('M', 22 + (i * 2) % 30, 'd' + (1 + (i % 4)), i < 8 ? ['IKATA', 'IKUMITE', 'FUKUGO'] : i < Math.max(12, C.men - 6) ? ['IKATA', 'IKUMITE'] : ['IKATA']);
  for (let i = 0; i < C.women; i++) mk('F', 22 + (i * 4) % 24, 'd' + (1 + (i % 3)), ['IKATA', 'IKUMITE', 'TKATA']);
  for (let i = 0; i < C.juniors; i++) mk('M', 16 + (i % 3), 'd1', ['IKATA', 'IKUMITE', 'TKUMITE']);
  for (let i = 0; i < C.kyu; i++) mk('F', 30 + i, 'k' + (1 + (i % 3)), ['IKATA', 'ENBU']);
  const fm = { M: 0, F: 0 };
  const divs = KT.blackBeltDivisions(KT.EVENT_ORDER).concat(KT.kyuDivisions({ label: 'Adult', minRank: 'k5', maxRank: 'k1', minAge: 18, maxAge: null }, ['IKATA', 'ENBU']));
  const rings = Array.from({ length: C.rings }, (_, k) => ({ id: uid() + 'r' + (k + 1), name: 'Ring ' + (k + 1), order: k + 1, managerIds: [] }));
  for (const r of rings) await guard(() => S.store.set(P.doc(id, 'rings', r.id), r));
  const kata = d => d.eventType === 'IKATA' || d.eventType === 'TKATA' || d.eventType === 'ENBU';
  const ringFor = d => C.rings <= 2 ? (kata(d) ? rings[0].id : rings[1].id)
    : (d.eventType === 'IKATA' ? rings[0].id : d.eventType === 'IKUMITE' ? rings[1].id : rings[2].id);
  let order = 0;
  for (const d of divs) { d.ringId = ringFor(d); d.ringOrder = order++; d.bronze = 'two'; if (d.eventType === 'IKUMITE' && d.group === 'Senior') d.format = d.gender === 'F' ? 'DES' : 'DE'; if (d.eventType === 'IKATA' && d.group === 'Junior') d.format = 'RR'; await guard(() => S.store.set(P.doc(id, 'divisions', uid() + order), d)); }
  for (const c of comps) {
    const f = first[c.g][fm[c.g]++ % first[c.g].length], l = last[(n = (n * 7 + 3) % last.length)];
    const dob = `${y - c.age}-0${1 + (c.age % 8)}-1${c.age % 9}`;
    const gi = comps.indexOf(c) % C.groups.length, grp = C.groups[gi];
    const rec = { firstName: f, lastName: l, gender: c.g, rank: c.rank, dojo: '', state: '', country: '', waiver: true, feePaid: true, checkedIn: true, status: 'active', events: c.events, divOverride: {}, age: KT.ageOn(dob, start), createdAt: new Date().toISOString() };
    if (C.field === 'dojo') { rec.dojo = grp; rec.state = 'Riverside'; rec.country = 'Example'; }
    else if (C.field === 'state') { rec.state = grp; rec.dojo = C.clubs[comps.indexOf(c) % C.clubs.length]; rec.country = 'Example'; }
    else { rec.country = grp; rec.dojo = 'Team ' + grp; }
    c.dojo = rec.dojo;
    await guard(async () => {
      await S.store.set(P.doc(id, 'competitors', c.id), rec);
      await S.store.set(P.pv(id, c.id), { dob, email: '', phone: '', emergencyName: 'Demo contact', emergencyPhone: '000-000-0000', feeAmount: '', notes: 'Fictional demo record' });
    });
  }
  const women = comps.filter(c => c.events.includes('TKATA')), juniors = comps.filter(c => c.events.includes('TKUMITE')), enbu = comps.filter(c => c.events.includes('ENBU'));
  const teams = [];
  for (let t = 0; t + 3 <= women.length && t < 9; t += 3) teams.push({ name: `Senior Women ${String.fromCharCode(65 + t / 3)}`, eventType: 'TKATA', memberIds: women.slice(t, t + 3).map(c => c.id) });
  for (let t = 0; t + 3 <= juniors.length && t < 6; t += 3) teams.push({ name: `Junior Men ${t / 3 + 1}`, eventType: 'TKUMITE', memberIds: juniors.slice(t, t + 3).map(c => c.id) });
  for (let t = 0; t + 2 <= enbu.length && t < 6; t += 2) teams.push({ name: `Enbu Pair ${t / 2 + 1}`, eventType: 'ENBU', memberIds: enbu.slice(t, t + 2).map(c => c.id) });
  for (const t of teams) await guard(() => S.store.set(P.doc(id, 'teams', uid()), Object.assign({ dojo: '', divisionId: '', status: 'active' }, t, { gender: t.eventType === 'TKUMITE' ? 'M' : 'F' })));
  const jn = ['Haruki Sato', 'Mireille Laurent', 'Tomas Varga', 'Anika Rao', 'Callum Reid', 'Sofia Moreau', 'Elias Brandt', 'Noor Haddad', 'Pavel Novak', 'Ines Duarte', 'Kofi Mensah', 'Lena Fischer', 'Ravi Iyer', 'Ana Petrova', 'Diego Ruiz', 'Yuki Mori', 'Lucas Silva', 'Marta Kowalska', 'Thabo Nkosi', 'Chloe Martin', 'Giulia Rossi', 'Liam Walsh', 'Aiko Tanaka', 'Samir Patel', 'Emma Clarke', 'Jonas Berg', 'Rosa Diaz', 'Omar Haddad', 'Mei Lin', 'Peter Novak'];
  const perRing = 7, nJ = Math.min(jn.length, C.rings * perRing + 1), [lo, hi] = C.judgeLv;
  for (let i = 0; i < nJ; i++) {
    const ka = lo + ((i * 3) % (hi - lo + 1)), ku = lo + ((i * 5 + 1) % (hi - lo + 1));
    const g = C.groups[i % C.groups.length];
    await guard(() => S.store.set(P.doc(id, 'judges', uid() + 'j' + i), { name: jn[i], country: C.field === 'country' ? g : 'Example', region: C.field === 'state' ? g : '', dojo: C.field === 'dojo' ? g : C.field === 'state' ? C.clubs[i % C.clubs.length] : '', kataLevel: ka, kumiteLevel: ku, ringId: i < C.rings * perRing ? rings[i % C.rings].id : '', notes: 'Fictional demo judge' }));
  }
  openEvent(id);
  toast(`${C.name.replace(' (demo)', '')} ready. Draw brackets from the Divisions tab.`);
}

/* ---------- event wiring ---------- */
const ACT = {
  home: () => { closeModal(); if (S.pub) return; openEvent(null); },
  'live-go': el => goLive(!!el.dataset.force), 'live-end': () => endLive(),
  'ring-ready': el => setRingReady(el.dataset.ring, { ready: !(S.d.ringready[el.dataset.ring] || {}).ready }),
  'judge-in': (el, e) => { if (e) e.stopPropagation(); const j = S.d.judges[el.dataset.id]; if (j) guard(() => S.store.update(P.doc(S.evId, 'judges', j.id), { checkedIn: !j.checkedIn })); },
  'share-on': () => shareOn(), 'share-off': () => shareOff(), 'share-copy': () => shareCopy(),
  'open-event': el => openEvent(el.dataset.id),
  'more-tabs': () => moreSheet(),
  tab: (el, e) => { if (e) e.preventDefault(); if (el.dataset.close) closeModal(); S.ui.tab = el.dataset.v; if (el.dataset.filter) S.ui.filter = el.dataset.filter; window.scrollTo(0, 0); render(); },
  'modal-close': () => closeModal(),
  'modal-scrim': (el, e) => { if (e.target === el) closeModal(); },
  'confirm-yes': () => confirmDone(true), 'confirm-no': () => confirmDone(false),
  'copy-export': () => { const t = $('#export-text'); try { navigator.clipboard.writeText(t.value).then(() => toast('Copied'), () => { t.select(); }); } catch (e) { t.select(); } },
  'event-new': () => eventForm(null),
  'event-edit': () => eventForm(S.evId),
  'event-delete': () => deleteEvent(S.evId),
  demo: () => demoChooser(),
  'demo-make': el => createDemo(el.dataset.kind),
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
  'view-bracket': el => { S.ui.bracketDiv = el.dataset.id; S.ui.tab = 'brackets'; if (S.modal) closeModal(); render(); window.scrollTo(0, 0); },
  'ring-new': () => ringForm(null),
  'ring-edit': el => ringForm(el.dataset.id),
  'ring-delete': async () => {
    const id = $('#f-ring').dataset.id;
    if (!(await confirmBox('Delete this ring? Its divisions become unassigned.', 'Delete', true))) return;
    closeModal();
    for (const d of DC.divs.filter(x => x.ringId === id)) await guard(() => S.store.update(P.doc(S.evId, 'divisions', d.id), { ringId: '' }));
    for (const d of DC.divs) { const up = {}; for (const [seg, r] of Object.entries(d.segRings || {})) if (r === id) up[seg] = null; if (Object.keys(up).length) await guard(() => S.store.update(P.doc(S.evId, 'divisions', d.id), { segRings: up })); }
    for (const j of Object.values(S.d.judges).filter(x => x.ringId === id)) await guard(() => S.store.update(P.doc(S.evId, 'judges', j.id), { ringId: '' }));
    await guard(() => S.store.del(P.doc(S.evId, 'rings', id)), 'Ring deleted'); scheduleSync();
  },
  'ring-move': async el => {
    const d = DC.divBy[el.dataset.id]; const list = DC.divs.filter(x => x.ringId === d.ringId).sort((a, b) => (a.ringOrder || 0) - (b.ringOrder || 0));
    const i = list.indexOf(d), j = i + (+el.dataset.dir); if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    for (let k = 0; k < list.length; k++) if ((list[k].ringOrder || 0) !== k) await guard(() => S.store.update(P.doc(S.evId, 'divisions', list[k].id), { ringOrder: k }));
  },
  'ring-undiv': el => guard(() => S.store.update(P.doc(S.evId, 'divisions', el.dataset.id), { ringId: '' })).then(scheduleSync),
  'ring-manage': el => { const r = S.d.rings[el.dataset.ring]; const ids = [...new Set((r.managerIds || []).concat(el.dataset.uid))]; $$('.dd-list').forEach(x => { x.hidden = true; }); guard(() => S.store.update(P.doc(S.evId, 'rings', r.id), { managerIds: ids }), 'Manager added').then(scheduleSync); },
  'req-access': el => requestAccess(el.dataset.id),
  'req-decline': el => guard(() => S.store.del(P.doc(S.evId, 'requests', el.dataset.id)), 'Request declined'),
  'org-request': () => requestOrganizer(),
  'logo-set': el => setLogo(el.dataset.k),
  'logo-open': () => { S.ui.logoOpen = !S.ui.logoOpen; },
  'ev-archive': () => archiveEvent(),
  'ev-reopen': () => reopenEvent(),
  'toggle-archive': () => { S.ui.showArchive = !S.ui.showArchive; },
  'evdir-remove': async (el, e) => { if (e) e.stopPropagation(); const ev = S.events[el.dataset.ev]; if (ev && evDirectors(ev).length > 1 && !(await confirmBox(`Remove ${personName(el.dataset.id)} as director of ${ev.name}?`, 'Remove', true))) return; setEventDirector(el.dataset.ev, el.dataset.id, false); },
  'org-approve': el => setOrganizer(el.dataset.id, true),
  'org-decline': el => guard(() => S.store.del('orgRequests/' + el.dataset.id), 'Request declined'),
  'org-remove': async el => { if (await confirmBox(`Remove ${personName(el.dataset.id)} as tournament director? Their events stay; they can no longer create new ones.`, 'Remove', true)) setOrganizer(el.dataset.id, false); },
  'admin-remove': async el => { if (await confirmBox('Remove this app admin?', 'Remove', true)) setAdmin(el.dataset.id, false); },
  'dir-remove': async el => { if (!(await confirmBox(`Remove ${personName(el.dataset.id)} as director?`, 'Remove', true))) return; setDirector(el.dataset.id, false); },
  'invite-mail': el => { const i = S.invites[el.dataset.id]; if (i) inviteSheet(Object.assign({ id: el.dataset.id }, i)); },
  'invite-copy': () => copyInvite(),
  'invite-cancel': el => guard(() => S.store.del('invites/' + el.dataset.id), 'Invite cancelled'),
  'ring-unmanage': el => { const r = S.d.rings[el.dataset.id]; guard(() => S.store.update(P.doc(S.evId, 'rings', r.id), { managerIds: (r.managerIds || []).filter(x => x !== el.dataset.uid) })).then(scheduleSync); },
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
    if (CLOCK.running && el.dataset.t !== 'hansoku' && el.dataset.t !== 'kiken') { toast('Stop the clock (Yame) first.', true); return; }
    const ev = { t: el.dataset.t }; if (el.dataset.s) ev.s = el.dataset.s;
    // Shobu Ippon Ten-to: penalty match while time remains; 1 point only when time has expired
    if (ev.t === 'tento' && !(kumiteStyle(dv) === 'kogo' && el.dataset.p !== 'daihyo') && clockLeft() > 0) { ev.exec = true; toast(`Ten-to · ${ev.s === 'a' ? 'Aka' : 'Shiro'} Sagaru — penalty match (Tsuzukete, hajime)`); }
    const o = { kettei: sc.ketteiTime > 0, allowDraw: el.dataset.p.startsWith('bouts'), ketteiOnly: el.dataset.p === 'daihyo' };
    const E = kumiteStyle(dv) === 'kogo' && el.dataset.p !== 'daihyo' ? KT.kogoEval : KT.kumiteEval;
    // Ko-go: every exchange is a stand-alone match — a score or penalty ends it (the next exchange starts automatically)
    if (E === KT.kogoEval && ev.s && !['hansoku', 'kiken', 'hantei'].includes(ev.t)) ev.ae = 1;
    const before = E(log, o).phase;
    log.push(ev);
    const after = E(log, o);
    if (E === KT.kumiteEval && before !== 'kettei' && after.phase === 'kettei') setClock(sc.ketteiTime);
    if (after.done) stopClock();
    draftChanged();
  },
  'k-undo': el => { const M = S.modal, d = loadDraft(M.key); logAt(d, el.dataset.p).pop(); draftChanged(); },
  clock: () => toggleClock(),
  'clock-reset': el => { const M = S.modal, d = loadDraft(M.key), sc = scoringOf(DC.divBy[M.did]); const ph = KT.kumiteEval(logAt(d, el.dataset.p), { kettei: sc.ketteiTime > 0, ketteiOnly: el.dataset.p === 'daihyo' }).phase; setClock(ph === 'kettei' ? sc.ketteiTime : sc.boutTime); clockChanged(); },
  'tie-side': el => { const d = loadDraft(S.modal.key); d.tieSide = d.tieSide === el.dataset.s ? null : el.dataset.s; draftChanged(); },
  'bout-sel': el => { S.boutSel = +el.dataset.i; const sc = scoringOf(DC.divBy[S.modal.did]); setClock(+el.dataset.i >= sc.bouts ? sc.ketteiTime : sc.boutTime); renderScore(true); },
  'fk-hantei': el => { const d = loadDraft(S.modal.key); d.hantei = el.dataset.s; draftChanged(); },
  'reset-draft': async () => { if (!(await confirmBox('Clear everything entered on this scoresheet?', 'Clear'))) return; const M = S.modal; dropDraft(M.key); S.boutSel = 0; setClock(scoringOf(DC.divBy[M.did]).boutTime); renderScore(true); pushLive(); },
  'call-mat': () => { pushLive(); toast('Called to the mat'); },
  'save-result': () => saveResult(),
  'kp-score': el => openKP(el.dataset.did, el.dataset.key),
  'kp-save': () => kpSave(),
  'kp-call': () => { kpPushLive(false); toast('Called to the mat'); },
  'kp-clear': async () => {
    const M = S.modal; if (!(await confirmBox(`Clear this score for ${entName(M.ctx.id)}?`, 'Clear score', true))) return;
    const ok = await guard(() => S.store.update(P.live(S.evId, 'brackets', M.did), { scores: { [M.key]: null } }), 'Score cleared'); if (ok) { dropDraft(M.dkey); closeModal(); }
  },
  match: el => { if (el.closest('.modal') && S.modal && S.modal.type === 'match') return; openMatch(el.dataset.did, el.dataset.mid); },
  'div-panel': el => openDivPanel(el.dataset.id),
  'judge-new': () => judgeForm(null),
  'judge-import': () => judgeImportForm(),
  'judge-export': () => saveFile(`${curEvent().name} - judges.csv`, judgesCSV(judgesList())),
  'jimp-run': () => judgeImportRun(),
  'jimp-copy': () => judgeCopyFrom($('#jimp-from').value),
  'jimp-template': () => { const ev = curEvent(); $('#jimp-text').value = ev.level === 'International'
    ? 'name,country,kata_level,kumite_level,ring\nHaruki Sato,Japan,6,5,Ring 1\nMireille Laurent,France,5,6,Ring 2\nLucas Silva,Brazil,4,4,'
    : ev.level === 'National' ? 'name,region,dojo,kata_level,kumite_level,ring\nAnika Rao,Pacific,Shoreline Dojo,5,4,Ring 1\nTomas Varga,Central,Prairie Budokan,3,3,Ring 2'
    : 'name,dojo,level,ring\nCallum Reid,North Wind Dojo,2,Ring 1\nSofia Moreau,Cedar Hill Karate,3,Ring 2'; judgeImportPreview(); },
  'judge-edit': el => judgeForm(el.dataset.id),
  'judge-delete': async () => {
    const id = $('#f-judge').dataset.id; if (!(await confirmBox('Delete this judge from the pool?', 'Delete', true))) return;
    closeModal(); guard(() => S.store.del(P.doc(S.evId, 'judges', id)), 'Judge deleted');
  },
  follow: (el, e) => { if (e) e.stopPropagation(); toggleFollow(el.dataset.k, el.dataset.v); },
  'ring-live': el => { S.ui.ring = el.dataset.id; S.ui.tab = 'mat'; window.scrollTo(0, 0); render(); },
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
  'div-ring': async el => {
    const v = el.value; if (!v) return;
    const d = DC.divBy[el.dataset.id];
    const ringId = v === '__none' ? '' : v;
    const n = Math.max(-1, ...DC.divs.filter(x => x.ringId === ringId && x.id !== d.id).map(x => x.ringOrder || 0)) + 1;
    await guard(() => S.store.update(P.doc(S.evId, 'divisions', d.id), { ringId, ringOrder: n }), ringId ? `${d.name} moved to ${S.d.rings[ringId].name}` : `${d.name} removed from ring`);
    scheduleSync();
  },
  'div-ring2': async el => {
    const d = DC.divBy[el.dataset.did]; const ringId = el.value;
    const n = Math.max(-1, ...DC.divs.filter(x => x.ringId === ringId && x.id !== d.id).map(x => x.ringOrder || 0)) + 1;
    await guard(() => S.store.update(P.doc(S.evId, 'divisions', d.id), { ringId, ringOrder: n }), ringId ? `${d.name} → ${ringName(ringId)}` : `${d.name} removed from ring`);
    scheduleSync();
  },
  'seg-ring': el => setSegRing(el.dataset.did, el.dataset.seg, el.value),
  'match-ring': el => { const dv = DC.divBy[el.dataset.did], br = S.d.brackets[dv.id], m = br.matches[el.dataset.mid]; const def = KT.ringOf(dv, KT.segOf(br, m)); const v = el.value === def ? null : el.value;
    guard(() => S.store.update(P.doc(S.evId, 'divisions', dv.id), { segRings: { ['M:' + m.id]: v } }), `Match ${m.id} → ${ringName(el.value)}`).then(scheduleSync); },
  'ring-addjudge': el => { if (el.value) setJudgeRing(el.value, el.dataset.ring); },
  'req-approve': el => { if (el.value) approveRequest(el.dataset.id, el.value); },
  'evdir-add': el => { if (el.value) setEventDirector(el.dataset.ev, el.value, true); },
  'org-add': el => { if (el.value) setOrganizer(el.value, true); },
  'person-ring': el => { const v = el.value, id = el.dataset.id; if (!v) return; if (v === '__dir') setDirector(id, true); else setPersonRing(id, v === '__none' ? '' : v); },
  'ring-helpers': el => setRingReady(el.dataset.ring, { helpers: el.value.trim() }),
  'ring-addmgr': el => { if (el.value) setPersonRing(el.value, el.dataset.ring); },
  'inv-role': el => { const f = $('#inv-ring-f'); if (f) f.hidden = el.value !== 'manager'; },
  'judge-ring': el => { const v = el.value; if (!v) return; setJudgeRing(el.dataset.id, v === '__none' ? '' : v); },
  official: el => {
    const M = S.modal; if (!M) return;
    if (M.type === 'kp') {
      const d = loadDraft(M.dkey); d.officials = d.officials || {}; d.officials[el.dataset.pos] = el.value; saveDraft(M.dkey);
      const host = $('details.officials'); if (host) { const tmp = document.createElement('div'); tmp.innerHTML = officialsHTML(M.rid, 'kata', M.positions, d.officials, true); const nx = tmp.firstElementChild; nx.open = true; host.replaceWith(nx); const f = document.getElementById('off-' + el.dataset.pos); if (f) f.focus(); }
      kpPaint(); return;
    }
    if (M.type === 'score') { const d = loadDraft(M.key); d.officials = d.officials || {}; d.officials[el.dataset.pos] = el.value; draftChanged(); }
  },
  'ring-adddiv': el => { if (!el.value) return; const rid = el.dataset.ring; const n = DC.divs.filter(d => d.ringId === rid).length; guard(() => S.store.update(P.doc(S.evId, 'divisions', el.value), { ringId: rid, ringOrder: n })).then(scheduleSync); },
  'ring-format': async el => {
    const f = el.value; if (!f) return;
    const list = DC.divs.filter(d => d.ringId === el.dataset.ring);
    let n = 0, skipped = 0;
    for (const d of list) {
      if (bracketState(d.id).drawn) { skipped++; continue; }
      if (f === 'KP' && kindOf(d) !== 'kata') { skipped++; continue; }
      if (d.format !== f) { const up = { format: f }; if (f === 'KP') up.scoring = Object.assign({}, scoringOf(d), { method: 'scores', judges: Math.max(5, scoringOf(d).judges) }); await guard(() => S.store.update(P.doc(S.evId, 'divisions', d.id), up)); n++; }
    }
    toast(`${KT.FORMATS[f]} set on ${plural(n, 'division')}${skipped ? ` · ${skipped} skipped (already drawn${f === 'KP' ? ' or not kata' : ''})` : ''}`);
  },
  'fb-role': el => guard(() => el.checked ? FB.fs.doc('roles/' + el.dataset.uid).set({ role: 'director', at: new Date().toISOString() }) : FB.fs.doc('roles/' + el.dataset.uid).delete(), 'Access updated'),
  'kp-hansoku': el => { const d = loadDraft(S.modal.dkey); d.hansoku = el.checked; saveDraft(S.modal.dkey); kpPaint(); },
  awarded: el => guard(() => S.store.update(P.live(S.evId, 'brackets', el.dataset.did), { awarded: el.checked })),
  att: el => writeAttendance(S.ui.session, { [el.dataset.id]: el.checked }),
  'jimp-file': el => { const f = el.files && el.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { $('#jimp-text').value = String(rd.result || ''); judgeImportPreview(); }; rd.readAsText(f); },
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
  fq: el => { S.ui.fq = el.value; render(); },
  dq: el => { S.ui.dq = el.value; render(); },
  seed: el => seedMarks(el.form),
  'jimp-text': () => { clearTimeout(S.jimpT); S.jimpT = setTimeout(judgeImportPreview, 200); },
  'kp-j': el => { const d = loadDraft(S.modal.dkey), f = el.dataset.f || 's'; d[f] = d[f] || []; d[f][+el.dataset.i] = el.value; saveDraft(S.modal.dkey); kpPaint(); },
  'kp-kata': el => { const d = loadDraft(S.modal.dkey); d.kata = el.value; saveDraft(S.modal.dkey); kpPaint(); },
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

/* ---------- touch-and-hold drag to reorder divisions within a ring ---------- */
const HOLD_MS = 450;
function wireRingDrag() {
  let hold = null, drag = null;
  const cancelHold = () => { if (hold) { clearTimeout(hold.t); hold = null; } };
  const blockScroll = e => { if (drag) e.preventDefault(); };
  document.addEventListener('pointerdown', e => {
    const row = e.target.closest('.rdiv'); if (!row || e.target.closest('select') || !isDirector()) return;
    if (e.button != null && e.button !== 0) return;
    cancelHold();
    hold = { row, x: e.clientX, y: e.clientY, id: e.pointerId, t: setTimeout(() => startDrag(row, e.clientY), HOLD_MS) };
    row.classList.add('pressing');
  });
  function startDrag(row, y) {
    hold = null; row.classList.remove('pressing');
    const list = row.parentElement;
    drag = { row, list, startOrder: [...list.children].map(x => x.dataset.id), lastY: y };
    S.dragging = true;
    row.classList.add('dragging'); list.classList.add('sorting');
    document.addEventListener('touchmove', blockScroll, { passive: false });
    try { if (navigator.vibrate) navigator.vibrate(15); } catch (err) { /* ignore */ }
  }
  document.addEventListener('pointermove', e => {
    if (hold && (Math.abs(e.clientX - hold.x) > 8 || Math.abs(e.clientY - hold.y) > 8)) { hold.row.classList.remove('pressing'); cancelHold(); return; }
    if (!drag) return;
    e.preventDefault();
    const rows = [...drag.list.children].filter(x => x !== drag.row);
    let before = null;
    for (const r of rows) { const b = r.getBoundingClientRect(); if (e.clientY < b.top + b.height / 2) { before = r; break; } }
    if (before !== drag.row.nextElementSibling) drag.list.insertBefore(drag.row, before);
    [...drag.list.children].forEach((r, i) => { const n = r.querySelector('.rnum'); if (n) n.textContent = i + 1; });
  }, { passive: false });
  const end = async () => {
    if (hold) { hold.row.classList.remove('pressing'); cancelHold(); }
    if (!drag) return;
    const { row, list, startOrder } = drag; drag = null; S.justDragged = Date.now();
    document.removeEventListener('touchmove', blockScroll);
    row.classList.remove('dragging'); list.classList.remove('sorting');
    const order = [...list.children].map(x => x.dataset.id);
    S.dragging = false;
    if (order.join('|') !== startOrder.join('|')) await saveRingOrder(order);
    if (S.renderPending) { S.renderPending = false; } render();
  };
  document.addEventListener('pointerup', end);
  document.addEventListener('pointercancel', end);
  document.addEventListener('contextmenu', e => { if (e.target.closest('.rdiv')) e.preventDefault(); });
  // keyboard: Alt+↑ / Alt+↓ moves the focused division
  document.addEventListener('keydown', async e => {
    const row = e.target.closest && e.target.closest('.rdiv'); if (!row || !e.altKey || !isDirector()) return;
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const list = row.parentElement, ids = [...list.children].map(x => x.dataset.id), i = ids.indexOf(row.dataset.id), j = i + (e.key === 'ArrowUp' ? -1 : 1);
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await saveRingOrder(ids);
    setTimeout(() => { const el = document.querySelector(`.rdiv[data-id="${row.dataset.id}"]`); if (el) el.focus(); }, 60);
  });
}
async function saveRingOrder(ids) {
  let changed = 0;
  for (let k = 0; k < ids.length; k++) {
    const d = DC.divBy[ids[k]]; if (!d || (d.ringOrder || 0) === k) continue;
    changed++; await guard(() => S.store.update(P.doc(S.evId, 'divisions', d.id), { ringOrder: k }));
  }
  if (changed) toast('Running order saved');
}

function wire() {
  wireRingDrag();
  // timing buttons act on press, not on release: a mouse click whose press and release straddle a clock repaint can be
  // dropped by the browser (MacBook click vs. tap), and the timekeeper needs Stop to be instant anyway.
  document.addEventListener('pointerdown', e => {
    const el = e.target.closest('[data-press]'); if (!el || el.disabled || (e.button != null && e.button !== 0)) return;
    const fn = ACT[el.dataset.act]; if (!fn) return;
    e.preventDefault(); fn(el, e);
  });
  document.addEventListener('click', e => {
    if (e.detail > 0 && e.target.closest('[data-press]')) return;   // pointer clicks on press buttons were handled on pointerdown; keyboard (detail 0) still clicks
    const el = e.target.closest('[data-act]');
    if (!e.target.closest('.dd')) $$('.dd-list').forEach(x => { x.hidden = true; });
    if (!el) {
      const t = e.target.closest('[data-tap]');
      if (t && !e.target.closest('select,button,a,input') && !(S.justDragged && Date.now() - S.justDragged < 400) && ACT[t.dataset.tap]) ACT[t.dataset.tap](t, e);
      return;
    }
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
      const ev = Object.assign({}, old, v, { id: undefined, staffIds: old.staffIds || [], createdAt: old.createdAt || new Date().toISOString(),
        directorIds: old.directorIds || (S.myId ? [S.myId] : []), managerIds: old.managerIds || [], createdBy: old.createdBy || S.myId || '' }); delete ev.id;
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
    else if (k === 'judge') saveJudge(f);
    else if (k === 'invite') saveInvite(f);
    else if (k === 'code') redeemCode(fd(f).code);
    else if (k === 'session') {
      const v = fd(f); if (!v.title || !v.date) { toast('Title and date are required.', true); return; }
      const ok = await guard(() => S.store.set(P.doc(S.evId, 'sessions', f.dataset.id || uid()), v), 'Session saved'); if (ok) closeModal();
    }
  });
}

async function init() {
  readUIPrefs();
  parsePublic(); loadMyReqs();
  wire();
  render();
  if (window.KT_FIREBASE_CONFIG && window.firebase) {
    try { if (!(await initFirebase(window.KT_FIREBASE_CONFIG))) return; }
    catch (e) { console.error(e); S.store = LocalStore(); toast('Could not reach Firebase. Working in local mode.', true); }
    if (S.pub) { S.readOnly = true; startPublic(); } else subscribeEvents(); render(); return;
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
        const [me, canEd, canW, own] = await Promise.all([user.me(), user.canEdit(), user.can('data.write'), user.isOwner()]);
        // v1.7: director = the page's owner + people the owner makes directors; other editors are ring managers once assigned
        S.myId = me.id; S.isOwnerFlag = !!own; S.canEditor = !!canEd; S.isAdmin = !!own; S.isOrganizer = !!own; S.canWrite = canW; S.myEmail = String(me.email || '').toLowerCase(); S.myName = me.name || '';
        if (canW === false && !canEd) S.readOnly = true;
      } catch (e) { /* reads never reject */ }
    }
  } else {
    S.store = LocalStore();
  }
  if (S.pub) { S.readOnly = true; startPublic(); } else subscribeEvents();
  render();
}
