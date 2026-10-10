/* ===== views ===== */
let rq = false;
function render() { if (rq) return; rq = true; setTimeout(() => { rq = false; if (S.dragging) { S.renderPending = true; return; } doRender(); }, 0); }
function doRender() {
  derive();
  const ae = document.activeElement, aid = ae && ae.id && !$('#modal').contains(ae) ? ae.id : null;
  const sel = aid && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
  $('#bar').innerHTML = barHTML();
  const bar = $('#bar'); document.documentElement.style.setProperty('--barh', bar.offsetHeight + 'px');
  $('#tabs').innerHTML = tabsHTML();
  $('#tabs').hidden = !S.evId;
  $('#bnav').innerHTML = S.evId ? bnavHTML() : '';
  $('#bnav').hidden = !S.evId;
  document.body.classList.toggle('has-bnav', !!S.evId);
  if (S.lastTab !== S.ui.tab) { S.lastTab = S.ui.tab; const t = $('.tab[aria-selected="true"]'); if (t && t.scrollIntoView) try { t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* ignore */ } }
  $('#main').innerHTML = mainHTML();
  if (aid) { const el = document.getElementById(aid); if (el) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignore */ } } }
  if (S.modal && S.modal.refresh) S.modal.refresh();
  const ids = new Set(); DC.rings.forEach(r => (r.managerIds || []).forEach(i => ids.add(i))); const ev = curEvent(); if (ev) (ev.staffIds || []).forEach(i => ids.add(i)); if (isDirector()) Object.keys(S.people || {}).forEach(i => ids.add(i));
  if (ids.size) refreshProfiles([...ids]);
}
function barHTML() {
  const ev = curEvent(), r = role();
  if (FB.needSignIn) return `<div class="bar-in"><span class="brand">${logoHTML()}<span><b>Karate Event Tracker</b><small>v${KT.VERSION}</small></span></span></div>`;
  const mode = !S.store ? `<span class="chip"><span class="dot"></span>Connecting…</span>` : isLocal()
    ? `<span class="chip" title="Data stays in this browser only">Local mode</span>` : `<span class="chip" title="Connected to the shared database — changes sync instantly"><span class="dot" style="color:#6fcf97"></span>Online</span>`;
  const liveChip = ev && ev.live ? `<span class="chip aka" title="This event is live">● LIVE</span>` : '';
  let roleCtl = `<span class="chip">${ev ? ROLE_LABEL[r] : isAdmin() ? 'App admin' : S.isOrganizer ? 'Tournament director' : S.myId ? 'Signed in' : ROLE_LABEL[r]}</span>`;
  if (S.pub) return `<div class="bar-in"><span class="brand">${logoHTML()}<span><b>${ev ? esc(ev.name) : 'Karate Event Tracker'}</b><small>${ev ? 'Live results' : 'v' + KT.VERSION}</small></span></span><span class="spacer"></span>${liveChip}</div>`;
  if (isLocal()) {
    roleCtl = `<select id="sim-role" aria-label="View as" data-change="sim-role">${opt('director', 'View as Director', r)}${opt('manager', 'View as Ring manager', r)}${opt('viewer', 'View as Spectator', r)}</select>`;
    if (r === 'manager' && ev) roleCtl += `<select id="sim-ring" aria-label="Manager of ring" data-change="sim-ring">${opt('', 'Pick ring…', S.ui.simRing)}${DC.rings.map(x => opt(x.id, x.name, S.ui.simRing)).join('')}</select>`;
  }
  return `<div class="bar-in">
    ${ev ? `<button class="back-btn" data-act="home" aria-label="All events">${icon('back')}</button>` : ''}
    <button class="brand" data-act="home" aria-label="All events">${logoHTML()}<span><b>Karate Event Tracker</b><small>${ev ? esc(ev.name) : 'v' + KT.VERSION}</small></span></button>
    <span class="spacer"></span>${liveChip}${mode}${roleCtl}${fbBarBits()}</div>`;
}
function tabsFor() {
  const ev = curEvent(); if (!ev) return [];
  const r = role();
  if (ev.kind === 'tournament') {
    const L = { overview: 'Dashboard', competitors: 'Competitors', teams: 'Teams', divisions: 'Divisions', rings: 'Rings', judges: 'Judges', people: 'People', mat: 'Mat', brackets: 'Brackets', results: 'Results', follow: 'Follow' };
    // order = importance for the role; the first four go on the phone tab bar
    const order = r === 'director' ? ['overview', 'rings', 'divisions', 'mat', 'brackets', 'results', 'competitors', 'teams', 'judges', 'people', 'follow']
      : r === 'manager' ? ['mat', 'brackets', 'follow', 'results', 'overview', 'competitors']
      : ['overview', 'follow', 'rings', 'divisions', 'brackets', 'results', 'competitors']; // spectators: Dashboard, Follow, Rings, Divisions
    return order.map(k => [k, L[k]]);
  }
  const t = [['overview', 'Dashboard'], ['competitors', 'Participants'], ['sessions', 'Sessions'], ['attendance', 'Attendance']];
  if (r === 'director') t.push(['staff', 'Staff']);
  return t;
}
/* ---------- native-style bottom navigation (phones) ---------- */
const ICON = {
  people: '<circle cx="9" cy="8" r="3"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><path d="M17 8v6M14 11h6"/>',
  overview: '<path d="M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z"/>',
  competitors: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.4.1 4.2 1.6 4.8 4.8"/>',
  teams: '<circle cx="12" cy="7" r="2.8"/><circle cx="5.5" cy="10" r="2.2"/><circle cx="18.5" cy="10" r="2.2"/><path d="M7.5 19c.5-3 2.3-4.6 4.5-4.6s4 1.6 4.5 4.6M2 18c.3-2 1.5-3.2 3.3-3.4M22 18c-.3-2-1.5-3.2-3.3-3.4"/>',
  divisions: '<path d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5"/>',
  rings: '<rect x="3.5" y="3.5" width="17" height="17" rx="2"/><rect x="8" y="8" width="8" height="8" rx="1"/>',
  mat: '<circle cx="12" cy="12" r="8.5"/><path d="M10 8.5l5 3.5-5 3.5z"/>',
  brackets: '<path d="M3 5h5v4h4M3 15h5v4H3M8 9v6M12 12h5M17 7v10M17 12h4"/>',
  results: '<circle cx="12" cy="14" r="5.5"/><path d="M8.5 9.5L6 3h4l2 4 2-4h4l-2.5 6.5"/><path d="M12 11.8l.9 1.8 2 .3-1.4 1.4.3 2-1.8-1-1.8 1 .3-2-1.4-1.4 2-.3z"/>',
  sessions: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  attendance: '<rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 12l3 3 5-6"/>',
  staff: '<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9.5" cy="11" r="2.2"/><path d="M6.5 16c.5-1.7 1.6-2.6 3-2.6s2.5.9 3 2.6M14 10h4M14 13h3"/>',
  judges: '<path d="M4 20h16M6 20V9l6-5 6 5v11"/><path d="M9 13h6M9 16h6"/>',
  follow: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  more: '<circle cx="5.5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18.5" cy="12" r="1.6"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
const icon = (k, cls) => `<svg class="ico ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${ICON[k] || ''}</svg>`;
function bnavHTML() {
  const t = tabsFor();
  let main = t, rest = [];
  if (t.length > 5) { main = t.slice(0, 4); rest = t.slice(4); }
  const inRest = rest.some(([k]) => k === S.ui.tab);
  return `<div class="bnav-in" role="tablist">${main.map(([k, l]) => `<button class="bn" role="tab" aria-selected="${S.ui.tab === k}" data-act="tab" data-v="${k}">${icon(k)}<span>${l}</span></button>`).join('')}
    ${rest.length ? `<button class="bn" aria-selected="${inRest}" data-act="more-tabs" aria-haspopup="dialog">${icon('more')}<span>${inRest ? esc(rest.find(([k]) => k === S.ui.tab)[1]) : 'More'}</span></button>` : ''}</div>`;
}
function moreSheet() {
  const rest = tabsFor().slice(4);
  openModal(sheet('More', `<div class="menu">${rest.map(([k, l]) => `<button class="menu-item ${S.ui.tab === k ? 'on' : ''}" data-act="tab" data-v="${k}" data-close="1">${icon(k)}<span>${l}</span><span class="chev">›</span></button>`).join('')}
    ${S.pub ? '' : `<button class="menu-item" data-act="home" data-close="1">${icon('back')}<span>All events</span><span class="chev">›</span></button>`}</div>`), { nofocus: true });
}
const fab = (act, label) => isDirector() ? `<button class="fab" data-act="${act}" aria-label="${esc(label)}">${icon('plus')}<span>${esc(label)}</span></button>` : '';
function tabsHTML() {
  const t = tabsFor();
  if (t.length && !t.some(x => x[0] === S.ui.tab)) S.ui.tab = t[0][0];
  const autoKey = S.evId + '|' + myRingIds().join(',');
  if (role() === 'manager' && S.ui.ringAuto !== autoKey && myRingIds().length === 1) { S.ui.ringAuto = autoKey; if (!S.ui.ring) S.ui.ring = myRingIds()[0]; }
  return `<div class="tabs-in" role="tablist">${t.map(([k, l]) => `<button class="tab" role="tab" aria-selected="${S.ui.tab === k}" data-act="tab" data-v="${k}">${l}</button>`).join('')}</div>`;
}
function mainHTML() {
  if (FB.needSignIn) return fbSignInHTML();
  if (!S.store) return `<div class="empty"><div class="mark-lg"></div><p>Connecting to the event database…</p></div>`;
  if (S.pub && !S.evId) return publicMissingHTML();
  if (!S.evId) return homeHTML();
  const ev = curEvent();
  if (!ev) return `<div class="empty"><p>This event is no longer available.</p><button data-act="home">All events</button></div>`;
  const dirV = isDirector();
  const v = { overview: overviewHTML, competitors: competitorsHTML, teams: teamsHTML, divisions: dirV ? divisionsHTML : viewerDivisionsHTML, rings: dirV ? ringsHTML : viewerRingsHTML, people: dirV ? peopleHTML : overviewHTML, judges: judgesHTML, follow: followHTML, mat: matHTML,
    brackets: bracketsHTML, results: resultsHTML, sessions: sessionsHTML, attendance: attendanceHTML, staff: staffHTML }[S.ui.tab] || overviewHTML;
  return v();
}

/* ---------- home ---------- */
function homeHTML() {
  const evs = Object.values(S.events).sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  const dir = canCreateEvents();
  const head = `<div class="section-h"><div><div class="label">Events</div><h1>Tournaments, camps &amp; clinics</h1></div>
    <div class="row">${dir ? `<button data-act="demo">Create demo tournament</button><button class="primary" data-act="event-new">New event</button>` : ''}</div></div>`;
  const fbx = fbHomeBits() + adminCardHTML() + logoPickerHTML() + codeCardHTML() + orgRequestCardHTML();
  if (!S.loadedEvents) return head + fbx + `<div class="card empty"><p>Loading events…</p></div>`;
  if (!evs.length) return head + fbx + `<div class="card empty"><div class="mark-lg"></div><h2>No events yet</h2>
    <p class="muted" style="max-width:52ch">${dir ? 'Create your first tournament or training camp. A demo tournament with fictional competitors is available to explore how divisions, brackets and scoring work.' : 'No tournament has been created yet.'}</p>
    ${dir ? `<div class="row"><button data-act="demo">Create demo tournament</button><button class="primary" data-act="event-new">New event</button></div>` : ''}</div>`;
  const archived = evs.filter(e => e.archived), active = evs.filter(e => !e.archived);
  const mine = active.filter(e => canOpenEvent(e)), other = active.filter(e => !canOpenEvent(e));
  if (!isLocal()) refreshProfiles([...new Set(evs.flatMap(evDirectors))]);
  const grid = list => `<div class="grid3">${list.map(homeEventCard).join('')}</div>`;
  return (dir ? `<button class="fab" data-act="event-new" aria-label="New event">${icon('plus')}<span>New event</span></button>` : '') + head + fbx
    + (mine.length ? grid(mine) : '<div class="card small muted">You have no events yet.</div>')
    + (other.length ? `<div class="section-h" style="margin-top:18px"><div><div class="label">Other events</div><p class="small muted" style="margin:4px 0 0">Run by other directors. Ask for access to help run one.</p></div></div>${grid(other)}` : '')
    + (archived.length ? `<details class="archive-list" ${S.ui.showArchive ? 'open' : ''}><summary data-act="toggle-archive"><span class="label">Archive</span> <span class="chip plain">${archived.length}</span> <span class="tiny muted">Completed events with approved results</span></summary>${grid(archived)}</details>` : '');
}
/* ---------- overview ---------- */
function eventHeader(extra) {
  const ev = curEvent();
  return lockedBannerHTML() + `<div class="section-h"><div><div class="label">${esc(KT.EVENT_KINDS[ev.kind])}${ev.level && ev.kind === 'tournament' ? ' · ' + esc(ev.level) : ''}${ev.locked ? ' <span class="chip plain" style="margin-left:6px">🔒 Archived</span>' : ev.live ? ' <span class="chip aka" style="margin-left:6px">● Live</span>' : ev.endedAt ? ' <span class="chip plain" style="margin-left:6px">Finished</span>' : ''}</div>
    <h1>${esc(ev.name)}</h1><div class="small muted">${fmtDate(ev.startDate)}${ev.endDate && ev.endDate !== ev.startDate ? ' – ' + fmtDate(ev.endDate) : ''}${ev.location ? ' · ' + esc(ev.location) : ''}</div></div>
    <div class="row">${extra || ''}${isDirector() ? `<button data-act="event-edit">Event settings</button>` : ''}</div></div>`;
}
function overviewHTML() {
  const ev = curEvent();
  if (ev.kind !== 'tournament') return campOverviewHTML();
  const comps = DC.comps, active = comps.filter(c => c.status !== 'withdrawn');
  const checked = active.filter(c => c.checkedIn).length;
  const divs = DC.divs;
  let drawn = 0, fought = 0, playable = 0, complete = 0;
  const warn = [];
  for (const d of divs) {
    const bs = bracketState(d.id);
    if (bs.drawn) { drawn++; fought += bs.fought; playable += bs.playable; if (bs.complete) complete++; if (bs.changed && !bs.complete) warn.push(`<b>${esc(d.name)}</b>: entrants changed since the draw.`); }
  }
  const dir = isDirector();
  if (dir) {
    const un = DC.assign.unplaced;
    if (un.length) warn.push(`${plural(un.length, 'entry', 'entries')} match no division. <button class="sm" data-act="tab" data-v="competitors" data-filter="unplaced">Review</button>`);
    const inc = active.filter(c => KT.validateCompetitor(c, DC.asOf).length).length;
    if (inc) warn.push(`${plural(inc, 'registration')} missing required information. <button class="sm" data-act="tab" data-v="competitors" data-filter="incomplete">Review</button>`);
    const lone = divs.filter(d => divEntrants(d.id).length === 1).length;
    if (lone) warn.push(`${plural(lone, 'division')} with a single entrant (automatic gold, or merge).`);
    const noRing = divs.filter(d => divEntrants(d.id).length >= 2 && !S.d.rings[d.ringId]).length;
    if (noRing) warn.push(`${plural(noRing, 'division')} with entrants but no ring.`);
    const live = divs.filter(d => divEntrants(d.id).length >= 2);
    const busy = new Set(live.flatMap(d => [d.ringId, ...Object.values(d.segRings || {})]).filter(r => S.d.rings[r]));
    const noJ = [...busy].filter(r => !ringJudges(r).length);
    if (Object.keys(S.d.judges).length && noJ.length) warn.push(`No judges on ${esc(noJ.map(ringName).join(', '))}. <button class="sm" data-act="tab" data-v="judges">Judges</button>`);
    const unJ = judgesList().filter(j => !S.d.rings[j.ringId]).length;
    if (unJ && busy.size) warn.push(`${plural(unJ, 'judge')} not assigned to a ring. <button class="sm" data-act="tab" data-v="judges">Judges</button>`);
    const need = KT.judgeNeed(ev.level), low = judgesList().filter(j => S.d.rings[j.ringId] && (+j.kataLevel || 0) < need && (+j.kumiteLevel || 0) < need).length;
    if (low) warn.push(`${plural(low, 'judge')} on a ring below the level ${need} credential for ${esc(ev.level)} events.`);
  }
  const steps = dir ? `<div class="card"><h3>Director checklist</h3><ol class="small" style="margin:8px 0 0;padding-left:20px;display:grid;gap:4px">
      <li>${divs.length ? '✓' : ''} Create divisions — standard black-belt set plus your kyu groups (<a href="#" data-act="tab" data-v="divisions">Divisions</a>)</li>
      <li>${comps.length ? '✓' : ''} Register competitors and check them in (<a href="#" data-act="tab" data-v="competitors">Competitors</a>)</li>
      <li>${DC.teams.length ? '✓' : ''} Form Team Kata, Team Kumite and Enbu teams (<a href="#" data-act="tab" data-v="teams">Teams</a>)</li>
      <li>${DC.rings.length ? '✓' : ''} Set up rings, assign managers and divisions (<a href="#" data-act="tab" data-v="rings">Rings</a>)</li>
      <li>${Object.keys(S.d.judges).length ? '✓' : ''} Add judges and assign each to a ring (<a href="#" data-act="tab" data-v="judges">Judges</a>)</li>
      <li>${drawn ? '✓' : ''} Draw brackets (<a href="#" data-act="tab" data-v="divisions">Divisions</a>)</li>
      <li>${fought ? '✓' : ''} Run matches on the mat and present awards (<a href="#" data-act="tab" data-v="mat">Mat</a>, <a href="#" data-act="tab" data-v="results">Results</a>)</li></ol></div>` : '';
  const go = (tab, alt) => tabsFor().some(([k]) => k === tab) ? tab : alt;
  return eventHeader() + `<div class="stats">
      ${statBtn(go('competitors', 'competitors'), 'Competitors', `<b>${active.length}</b><div class="small muted">${checked} checked in</div><div class="meter"><i style="width:${active.length ? checked / active.length * 100 : 0}%"></i></div>`)}
      ${statBtn(go('divisions', 'brackets'), 'Divisions', `<b>${divs.length}</b><div class="small muted">${drawn} drawn · ${complete} finished</div>`)}
      ${statBtn('mat', 'Matches', `<b>${fought}<span class="muted" style="font-size:1rem">/${playable}</span></b><div class="meter"><i style="width:${playable ? fought / playable * 100 : 0}%"></i></div>`)}
      ${statBtn(go('rings', 'mat'), 'Rings', `<b>${DC.rings.length}</b><div class="small muted">${DC.teams.length} teams entered</div>`)}</div>
    ${warn.length ? `<div class="stack">${warn.map(w => `<div class="notice warn">${w}</div>`).join('')}</div>` : ''}
    ${liveCardHTML()}${archiveCardHTML()}${codeCardHTML()}
    <div class="grid2">${steps}<div class="stack"><div class="section-h"><h2>On the mat</h2></div>${ringBoardHTML(DC.rings)}</div></div>`;
}

/* ---------- competitors ---------- */
function competitorsHTML() {
  const ev = curEvent(), dir = isDirector(), tour = ev.kind === 'tournament';
  const q = S.ui.q.toLowerCase(), f = S.ui.filter;
  const unplaced = new Set(DC.assign.unplaced.filter(u => u.kind === 'competitor').map(u => u.id));
  const placedIn = {};
  for (const did in DC.assign.byDiv) for (const id of DC.assign.byDiv[did]) (placedIn[id] = placedIn[id] || []).push(did);
  let list = DC.comps.slice().sort((a, b) => String(a.lastName).localeCompare(String(b.lastName)) || String(a.firstName).localeCompare(String(b.firstName)));
  if (q) list = list.filter(c => `${c.firstName} ${c.lastName} ${c.dojo} ${c.country || ''} ${c.state || ''}`.toLowerCase().includes(q));
  if (f === 'out') list = list.filter(c => !c.checkedIn && c.status !== 'withdrawn');
  if (f === 'in') list = list.filter(c => c.checkedIn);
  if (f === 'incomplete') list = list.filter(c => KT.validateCompetitor(c, DC.asOf).length);
  if (f === 'unplaced') list = list.filter(c => unplaced.has(c.id));
  if (f === 'withdrawn') list = list.filter(c => c.status === 'withdrawn');
  const word = tour ? 'competitor' : 'participant';
  const tools = `<div class="row"><input id="comp-q" class="search" type="search" placeholder="Search name, dojo…" value="${esc(S.ui.q)}" data-input="q" aria-label="Search">
    <select id="comp-f" data-change="filter" aria-label="Filter">${opt('all', 'All', f)}${opt('out', 'Not checked in', f)}${opt('in', 'Checked in', f)}${dir ? opt('incomplete', 'Missing information', f) : ''}${tour && dir ? opt('unplaced', 'No division match', f) : ''}${opt('withdrawn', 'Withdrawn', f)}</select></div>`;
  const acts = dir ? `<button data-act="import-open">Import CSV</button><button data-act="export-comps">Export CSV</button><button class="primary" data-act="comp-new">Add ${word}</button>` : '';
  if (!DC.comps.length) return eventHeader() + `<div class="card empty"><div class="mark-lg"></div><h2>No ${word}s registered</h2><p class="muted">${dir ? `Add ${word}s one at a time or import a spreadsheet (CSV).` : 'Registrations will appear here.'}</p>${dir ? `<div class="row">${acts}</div>` : ''}</div>`;
  const rows = list.map(c => {
    const age = KT.ageOf(c, DC.asOf), miss = dir ? KT.validateCompetitor(c, DC.asOf) : [];
    const evs = tour ? (c.events || []).map(et => {
      const T = KT.EVENT_TYPES[et]; if (!T) return '';
      if (T.team) { const tm = DC.teams.find(t => t.eventType === et && (t.memberIds || []).includes(c.id)); return `<span class="chip plain" title="${esc(tm ? tm.name : 'Not on a team yet')}">${esc(T.short)}${tm ? '' : ' ?'}</span>`; }
      const did = (placedIn[c.id] || []).find(d => DC.divBy[d] && DC.divBy[d].eventType === et);
      return `<span class="chip ${did ? 'plain' : 'bad'}" title="${esc(did ? DC.divBy[did].name : 'No matching division')}">${esc(T.short)}</span>`;
    }).join(' ') : '';
    return `<tr class="${dir ? 'click' : ''}" ${dir ? `data-act="comp-edit" data-id="${esc(c.id)}"` : ''}>
      <td><div class="name">${esc(c.lastName)}, ${esc(c.firstName)}</div><div class="dojo">${esc(c.dojo || '')}${c.state || c.country ? ' · ' + esc([c.state, c.country].filter(Boolean).join(', ')) : ''}</div></td>
      <td>${esc(c.gender === 'F' ? 'W' : c.gender === 'M' ? 'M' : '')}${age != null ? ` · <span class="num">${age}</span>` : ''}</td>
      <td>${esc(KT.rankLabel(c.rank))}</td>
      ${tour ? `<td><div class="pill-list">${evs}</div></td>` : ''}
      <td>${c.status === 'withdrawn' ? '<span class="chip bad">Withdrawn</span>' : dir ? `<button class="sm ${c.checkedIn ? '' : 'ghost'}" data-act="checkin" data-id="${esc(c.id)}" aria-pressed="${!!c.checkedIn}">${c.checkedIn ? '✓ Checked in' : 'Check in'}</button>` : (c.checkedIn ? '<span class="chip ok">Checked in</span>' : '<span class="chip plain">Not checked in</span>')}
        ${miss.length ? `<span class="chip warn" title="Missing: ${esc(miss.join(', '))}">Incomplete</span>` : ''}</td></tr>`;
  }).join('');
  return fab('comp-new', tour ? 'Add competitor' : 'Add participant') + eventHeader() + `<div class="section-h">${tools}<div class="row actions">${acts}</div></div>
    <div class="card flush"><div class="tw"><table class="mcards"><thead><tr><th>Name</th><th>Sex · Age</th><th>Rank</th>${tour ? '<th>Events</th>' : ''}<th>Status</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5" class="muted">No ${word}s match this filter.</td></tr>`}</tbody></table></div></div>
    <p class="small muted">${plural(list.length, word)} shown · ages as of ${fmtDate(DC.asOf)}.${dir ? ' Contact details, dates of birth and emergency contacts are visible to directors only.' : ''}</p>`;
}

/* ---------- teams ---------- */
function teamsHTML() {
  const ev = curEvent();
  const types = (ev.eventTypes || KT.EVENT_ORDER).filter(t => KT.EVENT_TYPES[t].team);
  const unplaced = new Set(DC.assign.unplaced.filter(u => u.kind === 'team').map(u => u.id));
  const placed = {}; for (const did in DC.assign.byDiv) for (const id of DC.assign.byDiv[did]) placed[id] = did;
  const secs = types.map(et => {
    const T = KT.EVENT_TYPES[et], list = DC.teams.filter(t => t.eventType === et).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    const need = DC.comps.filter(c => (c.events || []).includes(et) && c.status !== 'withdrawn' && !DC.teams.some(t => t.eventType === et && (t.memberIds || []).includes(c.id)));
    return `<div class="card flush"><div class="card-h"><div><h3>${esc(T.label)}</h3><div class="small muted">${T.size[0] === T.size[1] ? T.size[0] : T.size[0] + '–' + T.size[1]} members · ${T.genders.map(g => KT.GENDERS[g]).join(' / ')}</div></div>
      <button class="sm" data-act="team-new" data-et="${et}">New team</button></div>
      ${need.length ? `<div class="notice info" style="margin:10px 16px 0">${plural(need.length, 'competitor')} entered ${esc(T.short)} without a team: ${need.slice(0, 6).map(c => esc(c.firstName + ' ' + c.lastName)).join(', ')}${need.length > 6 ? '…' : ''}</div>` : ''}
      <div class="tw"><table><tbody>${list.map(t => {
        const mem = (t.memberIds || []).map(id => DC.compBy[id]).filter(Boolean);
        return `<tr class="click" data-act="team-edit" data-id="${esc(t.id)}"><td><div class="name">${esc(t.name)}</div><div class="dojo">${esc(t.dojo || '')}</div></td>
        <td class="small">${mem.map(m => esc(m.firstName + ' ' + m.lastName)).join(', ') || '<span class="muted">No members</span>'}</td>
        <td>${unplaced.has(t.id) ? '<span class="chip bad">No division</span>' : placed[t.id] ? `<span class="small">${esc(DC.divBy[placed[t.id]].name)}</span>` : ''}${t.status === 'withdrawn' ? ' <span class="chip bad">Withdrawn</span>' : ''}</td></tr>`;
      }).join('') || `<tr><td class="muted">No teams yet.</td></tr>`}</tbody></table></div></div>`;
  }).join('');
  return eventHeader() + (types.length ? `<div class="stack">${secs}</div>` : `<div class="card empty"><p>This tournament offers no team events. Turn them on in Event settings.</p></div>`);
}

/* ---------- divisions ---------- */
function divisionsHTML() {
  const ev = curEvent();
  const f = S.ui.divFilter;
  const list = DC.divs.filter(d => !f || d.eventType === f);
  const acts = `<button data-act="div-std">Add black-belt divisions</button><button data-act="div-kyu">Add kyu divisions</button><button data-act="div-new">New division</button>
    <button class="primary" data-act="draw-all">Draw all ready</button>`;
  if (!DC.divs.length) return eventHeader() + `<div class="card empty"><div class="mark-lg"></div><h2>No divisions yet</h2>
    <p class="muted" style="max-width:56ch">Start with the standard black-belt age groups — Senior 21+, Youth 19–20, Junior 16–18, Cadet 14–15 — for every event you offer, then define kyu divisions by rank and age.</p><div class="row">${acts}</div></div>`;
  const rows = list.map(d => {
    const n = divEntrants(d.id).length, bs = bracketState(d.id), ring = S.d.rings[d.ringId];
    const st = !bs.drawn ? (n >= 2 ? '<span class="chip plain">Ready to draw</span>' : n === 1 ? '<span class="chip warn">1 entrant</span>' : '<span class="chip plain">Empty</span>')
      : bs.complete ? '<span class="chip ok">Finished</span>' : `<span class="chip">${bs.fought}/${bs.playable} ${bs.kp ? 'performances' : 'matches'}</span>${bs.changed ? ' <span class="chip warn">Entrants changed</span>' : ''}`;
    return `<tr><td><button class="ghost sm" style="padding:0;min-height:0;text-align:left;justify-content:flex-start" data-act="div-panel" data-id="${esc(d.id)}"><span class="name">${esc(d.name)}</span></button>
        <div class="dojo">${d.belt === 'kyu' ? esc(KT.rankLabel(d.minRank) + ' – ' + KT.rankLabel(d.maxRank)) + ' · ' : ''}${ageRange(d)}</div></td>
      <td class="small">${esc(KT.FORMATS[d.format] || d.format)}<div class="dojo">${esc(scoringLabel(d))}</div></td>
      <td class="small">${ring ? esc(ring.name) : '<span class="muted">—</span>'}</td>
      <td class="n">${n}</td><td>${st}</td>
      <td style="white-space:nowrap">${bs.drawn ? `<button class="sm" data-act="view-bracket" data-id="${esc(d.id)}">Bracket</button>` : n >= 1 ? `<button class="sm" data-act="draw" data-id="${esc(d.id)}">Draw</button>` : ''}</td></tr>`;
  }).join('');
  return eventHeader() + `<div class="section-h"><select id="div-f" data-change="divFilter" aria-label="Event filter" style="max-width:240px">${opt('', 'All events', f)}${(ev.eventTypes || KT.EVENT_ORDER).map(t => opt(t, KT.EVENT_TYPES[t].label, f)).join('')}</select><div class="row actions">${acts}</div></div>
    <div class="card flush"><div class="tw"><table class="mcards"><thead><tr><th>Division</th><th>Format</th><th>Ring</th><th class="n">Entrants</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
}
function ageRange(d) {
  const lo = d.minAge === '' || d.minAge == null ? null : d.minAge, hi = d.maxAge === '' || d.maxAge == null ? null : d.maxAge;
  if (lo == null && hi == null) return 'All ages';
  if (hi == null) return `Age ${lo}+`;
  if (lo == null) return `Age ≤${hi}`;
  return lo === hi ? `Age ${lo}` : `Age ${lo}–${hi}`;
}

/* ---------- rings ---------- */
function ringsHTML() {
  const cards = DC.rings.map(r => {
    const divs = DC.divs.filter(d => d.ringId === r.id && divEntrants(d.id).length).sort((a, b) => (a.ringOrder || 0) - (b.ringOrder || 0));
    const free = DC.divs.filter(d => !S.d.rings[d.ringId] && divEntrants(d.id).length);
    const others = DC.rings.filter(x => x.id !== r.id);
    const guest = guestItems(r.id);
    return `<div class="card stack"><div class="row between"><h3>${esc(r.name)}</h3><div class="row"><button class="sm" data-act="ring-edit" data-id="${esc(r.id)}">Rename</button></div></div>
      <div><div class="label">Managers</div><div class="pill-list" style="margin-top:6px">${(r.managerIds || []).map(id => `${personChip(id)}<button class="sm ghost" data-act="ring-unmanage" data-id="${esc(r.id)}" data-uid="${esc(id)}" aria-label="Remove manager">✕</button>`).join('') || '<span class="small muted">No manager assigned — only directors can score this ring.</span>'}</div>
      ${isLocal() ? '<p class="tiny muted" style="margin-top:6px">People can be assigned once the tracker is shared from claude.ai. In local mode, use “View as Ring manager” to preview their access.</p>' : `${(() => { const cand = rosterIds().filter(id => !(r.managerIds || []).includes(id)); return cand.length ? `<select id="ring-addmgr-${esc(r.id)}" data-change="ring-addmgr" data-ring="${esc(r.id)}" style="margin-top:8px" aria-label="Add a ring manager to ${esc(r.name)}">${opt('', 'Add a ring manager…', '')}${cand.map(id => opt(id, personName(id) + (managerRing(id) ? ` (from ${ringName(managerRing(id))})` : directorIds().includes(id) ? ' (director)' : ''), '')).join('')}</select>` : ''; })()}
        <div class="dd" style="margin-top:8px"><input id="mgr-q-${esc(r.id)}" type="search" placeholder="Search your organization by name or email…" data-input="mgr-search" data-ring="${esc(r.id)}" autocomplete="off"><div class="dd-list" id="mgr-dd-${esc(r.id)}" hidden></div></div>
        <p class="tiny muted" style="margin-top:4px">Not listed? Invite them by email on the <a href="#" data-act="tab" data-v="people">People</a> tab.</p>`}</div>
      <div><div class="row between"><div class="label">Judges</div><span class="tiny muted">${plural(ringJudges(r.id).length, 'judge')}</span></div><div class="pill-list" style="margin-top:6px">${ringJudgesSummary(r.id)}</div>
        ${Object.keys(S.d.judges).length ? `<select id="ring-addj-${esc(r.id)}" data-change="ring-addjudge" data-ring="${esc(r.id)}" style="margin-top:8px" aria-label="Add a judge to ${esc(r.name)}">${opt('', 'Add a judge to this ring…', '')}${judgesList().filter(j => j.ringId !== r.id).sort((a, b) => (S.d.rings[a.ringId] ? 1 : 0) - (S.d.rings[b.ringId] ? 1 : 0)).map(j => opt(j.id, j.name + (S.d.rings[j.ringId] ? ` (from ${ringName(j.ringId)})` : ' (unassigned)'), '')).join('')}</select>` : '<p class="tiny muted" style="margin-top:6px">Add judges on the Judges tab.</p>'}</div>
      ${ringReadyHTML(r)}
      <div><div class="row between"><div class="label">Divisions, in running order</div>${divs.length > 1 ? '<span class="tiny muted">Touch and hold a division to drag it</span>' : ''}</div>
      <div class="rdivs" data-ring="${esc(r.id)}">${divs.map((d, i) => `<div class="rdiv" data-id="${esc(d.id)}" data-tap="div-panel" tabindex="0" aria-label="${esc(d.name)}, position ${i + 1}. Hold to move; Alt+arrow keys also move.">
        <span class="grip" aria-hidden="true">⋮⋮</span><span class="rnum num">${i + 1}</span>
        <span class="rname"><span class="name">${esc(d.name)}</span><span class="dojo">${plural(divEntrants(d.id).length, 'entrant')}${bracketState(d.id).drawn ? ' · drawn' : ''}${awaySegs(d).map(([sg, rr]) => ` · ${esc(SEG_LABEL(sg))} → ${esc(ringName(rr))}`).join('')}</span></span>
        <select class="rmove" id="rmv-${esc(d.id)}" data-change="div-ring" data-id="${esc(d.id)}" aria-label="Move ${esc(d.name)} to ring">${opt('', 'Move…', '')}${others.map(x => opt(x.id, 'To ' + x.name, '')).join('')}${opt('__none', 'Remove from ring', '')}</select></div>`).join('') || '<span class="small muted">No divisions with competitors assigned.</span>'}</div>
      ${guest.length ? `<div class="label" style="margin-top:12px">Pools &amp; rounds from other rings' divisions</div><div class="rdivs">${guest.map(g => { const gd = DC.divBy[g.did]; return `<div class="rdiv guest"><span class="rnum num">↪</span><span class="rname"><span class="name">${esc(gd.name)} · ${esc(SEG_LABEL(g.seg))}</span><span class="dojo">From ${esc(ringName(gd.ringId))}</span></span>
        <select class="rmove" id="gmv-${esc(g.did)}-${esc(g.seg.replace(':', ''))}" data-change="seg-ring" data-did="${esc(g.did)}" data-seg="${esc(g.seg)}" aria-label="Move">${opt('', 'Move…', '')}${DC.rings.filter(x => x.id !== r.id).map(x => opt(x.id, 'To ' + x.name + (x.id === gd.ringId ? ' (back)' : ''), '')).join('')}</select></div>`; }).join('')}</div>` : ''}
      <div class="row" style="margin-top:8px"><button class="sm" data-act="ring-live" data-id="${esc(r.id)}">● Live view</button><span class="tiny muted">Tap a division to place its pools, rounds and judges.</span></div>
      ${divs.length ? `<label class="f" style="margin-top:8px"><span>Bracket format for this ring</span><select id="ring-fmt-${esc(r.id)}" data-change="ring-format" data-ring="${esc(r.id)}">${opt('', 'Set for all divisions…', '')}${Object.entries(KT.FORMATS).map(([k, l]) => opt(k, l, '')).join('')}</select></label>` : ''}
      ${free.length ? `<select id="ring-add-${esc(r.id)}" data-change="ring-adddiv" data-ring="${esc(r.id)}" style="margin-top:8px">${opt('', 'Assign a division…', '')}${free.map(d => opt(d.id, `${d.name} (${divEntrants(d.id).length})`, '')).join('')}</select>` : ''}</div></div>`;
  }).join('');
  return fab('ring-new', 'Add ring') + eventHeader(`<button class="primary" data-act="ring-new">Add ring</button>`) + (DC.rings.length ? `<div class="grid2">${cards}</div>` :
    `<div class="card empty"><div class="mark-lg"></div><h2>No rings yet</h2><p class="muted">Add a ring (court) for each competition area, then assign a manager and the divisions it will run.</p><button class="primary" data-act="ring-new">Add ring</button></div>`);
}

/* ---------- mat / ring board ---------- */
function ringQueue(rid) {
  const out = [];
  // native divisions in running order, then pools/rounds/matches of other divisions placed on this ring
  const divs = DC.divs.filter(d => S.d.brackets[d.id]).sort((a, b) => ((a.ringId === rid ? 0 : 1) - (b.ringId === rid ? 0 : 1)) || (a.ringOrder || 0) - (b.ringOrder || 0));
  for (const d of divs) {
    const br = S.d.brackets[d.id];
    if (br.format === 'KP') { for (const p of KT.kpQueue(br)) if (KT.ringOf(d, p.seg) === rid) out.push({ did: d.id, kp: p }); continue; }
    for (const m of KT.readyMatches(br, DC.res[d.id])) if (KT.ringOf(d, KT.segOf(br, m), m.id) === rid) out.push({ did: d.id, m, r: DC.res[d.id][m.id] });
  }
  return out;
}
function nowHTML(rs) {
  if (!rs || !rs.did || !S.d.brackets[rs.did]) return '';
  const dv = DC.divBy[rs.did], br = S.d.brackets[rs.did];
  if (rs.kp) {
    const q = br.format === 'KP' ? KT.kpQueue(br).find(x => x.key === rs.kp) : null;
    if (!q) return '';
    return `<div class="label">${esc(dv ? dv.name : '')} · ${esc(q.label)}</div>
      <div class="now" style="grid-template-columns:1fr auto"><div class="side"><span class="belt a" style="background:var(--ai);border-color:var(--ai)"></span><span style="min-width:0"><div class="name">${esc(entName(q.id))}</div><div class="dojo">${esc(entDojo(q.id))}${rs.kata ? ' · ' + esc(rs.kata) : ''}</div></span></div>
      <div class="sc num">${rs.score != null && rs.score !== '' ? esc(rs.score) : ''}</div></div>`;
  }
  const res = (DC.res[rs.did] || {})[rs.mid];
  if (!res || res.status !== 'ready') return '';
  return `<div class="label">${esc(dv ? dv.name : '')} · ${esc(KT.matchLabel(br.matches[rs.mid], br))}</div>
    <div class="now" data-act="match" data-did="${esc(rs.did)}" data-mid="${esc(rs.mid)}" role="button" tabindex="0" style="cursor:pointer"><div class="side"><span class="belt a"></span><span style="min-width:0"><div class="name">${esc(entName(res.a))}</div><div class="dojo">${esc(entDojo(res.a))}</div></span></div>
    <div class="sc num">${rs.score ? `${esc(rs.score.a)}–${esc(rs.score.b)}` : 'vs'}</div>
    <div class="side" style="justify-content:flex-end;text-align:right"><span style="min-width:0"><div class="name">${esc(entName(res.b))}</div><div class="dojo">${esc(entDojo(res.b))}</div></span><span class="belt b"></span></div></div>
    ${rs.phase ? `<div class="phase">${esc(rs.phase)}</div>` : ''}`;
}
function ringBoardHTML(rings, withActions) {
  if (!rings.length) return `<div class="card small muted">No rings set up yet.</div>`;
  return `<div class="grid2">${rings.map(r => {
    const rs = S.d.ringstate[r.id], q = ringQueue(r.id);
    const now = nowHTML(rs);
    const isNow = x => rs && x.did === rs.did && (x.kp ? rs.kp === x.kp.key : x.m.id === rs.mid);
    const next = q.filter(x => !isNow(x)).slice(0, withActions ? 12 : 3);
    const openBtn = withActions && now && (rs.kp ? canScoreKP(rs.did, rs.kp) : canScoreMatch(rs.did, rs.mid)) ? `<div class="row" style="margin-top:8px"><button class="go" ${rs.kp ? `data-act="kp-score" data-did="${esc(rs.did)}" data-key="${esc(rs.kp)}"` : `data-act="score" data-did="${esc(rs.did)}" data-mid="${esc(rs.mid)}"`}>Open scoresheet</button></div>` : '';
    return `<div class="card ring-card stack"><div class="row between"><h3>${esc(r.name)}</h3><span class="chip ${q.length ? '' : 'plain'}">${q.length} waiting</span></div>
      <div>${now || '<div class="small muted">Nothing on the mat.</div>'}${openBtn}</div>
      <div class="queue"><div class="label">Up next</div>${next.map(x => {
        const can = withActions && (x.kp ? canScoreKP(x.did, x.kp.key) : canScoreMatch(x.did, x.m.id));
        if (x.kp) return `<div class="q" style="grid-template-columns:1fr auto"><span class="side"><span class="belt a" style="background:var(--ai);border-color:var(--ai)"></span><span class="name">${esc(entName(x.kp.id))}</span></span>
          <span class="vs">${can ? `<button class="sm go" data-act="kp-score" data-did="${esc(x.did)}" data-key="${esc(x.kp.key)}">Score</button>` : 'kata'}</span></div>
          <div class="tiny muted" style="margin-top:-4px">${esc(DC.divBy[x.did].name)} · ${esc(x.kp.label)}</div>`;
        return `<div class="q" data-act="match" data-did="${esc(x.did)}" data-mid="${esc(x.m.id)}" role="button" tabindex="0"><span class="side"><span class="belt a"></span><span class="name">${esc(entName(x.r.a))}</span></span>
        <span class="vs">${can ? `<button class="sm go" data-act="score" data-did="${esc(x.did)}" data-mid="${esc(x.m.id)}">Score</button>` : 'vs'}</span>
        <span class="side" style="justify-content:flex-end"><span class="name">${esc(entName(x.r.b))}</span><span class="belt b"></span></span></div>
        <div class="tiny muted" style="margin-top:-4px">${esc(DC.divBy[x.did].name)} · ${esc(KT.matchLabel(x.m, S.d.brackets[x.did]))}${kindOf(DC.divBy[x.did]) === 'fukugo' ? ' · ' + (KT.fukugoPart(x.m, S.d.brackets[x.did]) === 'kitei' ? 'Ki-tei' : 'Kumite') : ''}</div>`;
      }).join('') || '<div class="small muted">Nothing waiting.</div>'}</div></div>`;
  }).join('')}</div>`;
}
function matHTML() {
  const mine = myRingIds();
  const r = role();
  let rings = DC.rings;
  const sel = S.ui.ring;
  if (sel) rings = rings.filter(x => x.id === sel);
  const note = r === 'manager' ? `<div class="notice info">You manage ${mine.length ? mine.map(id => esc((S.d.rings[id] || {}).name || '')).join(', ') : 'no ring yet'}. You can score matches for divisions assigned to your ring${mine.length === 1 ? '' : 's'}.</div>`
    : r === 'viewer' ? `<div class="notice info">Live view. Scores update as ring managers record them.</div>` : '';
  return eventHeader(`<select id="mat-ring" data-change="ring" aria-label="Ring" style="max-width:200px">${opt('', 'All rings', sel)}${DC.rings.map(x => opt(x.id, x.name + (mine.includes(x.id) && r === 'manager' ? ' (yours)' : ''), sel)).join('')}</select>`)
    + note + (role() !== 'viewer' && !(curEvent() || {}).live ? `<div class="grid2" style="margin-bottom:14px">${rings.map(ringReadyHTML).filter(Boolean).map(h => `<div class="card">${h}</div>`).join('')}</div>` : '') + ringBoardHTML(rings, true);
}

/* ---------- brackets ---------- */
function bracketsHTML() {
  const drawn = DC.divs.filter(d => S.d.brackets[d.id]);
  if (!S.ui.bracketDiv || !DC.divBy[S.ui.bracketDiv]) S.ui.bracketDiv = drawn.length ? drawn[0].id : '';
  const did = S.ui.bracketDiv;
  const picker = `<select id="br-div" data-change="bracketDiv" aria-label="Division" style="max-width:420px">${drawn.length ? '' : opt('', 'No brackets drawn yet', '')}${DC.rings.map(r => {
      const ds = drawn.filter(d => d.ringId === r.id); return ds.length ? `<optgroup label="${esc(r.name)}">${ds.map(d => opt(d.id, d.name, did)).join('')}</optgroup>` : '';
    }).join('')}${drawn.filter(d => !S.d.rings[d.ringId]).length ? `<optgroup label="No ring">${drawn.filter(d => !S.d.rings[d.ringId]).map(d => opt(d.id, d.name, did)).join('')}</optgroup>` : ''}</select>`;
  if (!did) return eventHeader() + `<div class="section-h">${picker}</div><div class="card empty"><div class="mark-lg"></div><h2>No brackets yet</h2><p class="muted">${isDirector() ? 'Draw brackets from the Divisions tab once competitors are registered.' : 'Brackets appear here once the director draws them.'}</p>${isDirector() ? '<button data-act="tab" data-v="divisions">Go to Divisions</button>' : ''}</div>`;
  const dv = DC.divBy[did], br = S.d.brackets[did];
  const bs = bracketState(did);
  const dirActs = isDirector() ? `<button class="sm" data-act="div-edit" data-id="${esc(did)}">Division settings</button>${!bs.results ? `<button class="sm" data-act="draw" data-id="${esc(did)}">Redraw</button>` : ''}` : '';
  return eventHeader() + `<div class="section-h">${picker}<div class="row">${dirActs}</div></div>
    <div class="row small muted">${esc(KT.FORMATS[br.format])} · ${esc(scoringLabel(dv))} · ${plural((br.entrants || []).length, 'entrant')}${S.d.rings[dv.ringId] ? ' · ' + esc(S.d.rings[dv.ringId].name) : ''}</div>
    ${bs.changed && !bs.complete ? `<div class="notice warn">Entrants changed since this bracket was drawn.${isDirector() && !bs.results ? ' Redraw to include them.' : ' Results already exist; late changes need a manual decision.'}</div>` : ''}
    ${podiumHTML(did)}${bracketViewHTML(did)}`;
}
function podiumHTML(did) {
  const pl = DC.pl[did]; if (!pl || !pl.gold) return pl && pl.tie ? `<div class="notice warn">Pool finished with a tie that the rules cannot break. ${isDirector() || canScoreDiv(did) ? `<button class="sm" data-act="tiebreak" data-did="${esc(did)}" data-pool="A">Set tiebreak order</button>` : 'Waiting for the director.'}</div>` : '';
  const line = (cls, lbl, id) => id ? `<div class="pl"><span class="medal ${cls}">${lbl}</span><span style="min-width:0"><div class="name">${esc(entName(id))}</div><div class="dojo">${esc(entDojo(id))}</div></span></div>` : '';
  return `<div class="card"><div class="row between"><h3>${pl.complete ? 'Final placings' : 'Placings so far'}</h3>${pl.complete ? '<span class="chip ok">Finished</span>' : ''}</div><div class="podium" style="margin-top:8px">${line('g', '1', pl.gold)}${line('s', '2', pl.silver)}${(pl.bronze || []).map(b => line('b', '3', b)).join('')}${pl.fourth ? `<div class="pl"><span class="medal" style="background:var(--ink-3)">4</span><span style="min-width:0"><div class="name">${esc(entName(pl.fourth))}</div><div class="dojo">${esc(entDojo(pl.fourth))}</div></span></div>` : ''}</div></div>`;
}
function bmHTML(did, m, res, live) {
  const r = res[m.id]; if (!r) return '';
  if (r.status === 'void' || r.status === 'skip') return `<div class="bm" style="opacity:.45"><div class="ln tbd"><span class="strip"></span><span class="name">${r.status === 'skip' ? 'Not needed' : 'No match'}</span><span></span></div></div>`;
  const scorer = canScoreMatch(did, m.id) && (r.status === 'ready' || r.status === 'done');
  const canS = r.status === 'ready' || r.status === 'done' || r.status === 'pending';
  const res1 = r.result || {};
  const ln = (side) => {
    const id = r[side], hint = side === 'a' ? r.hintA : r.hintB;
    const cls = !id ? 'tbd' : r.status === 'done' || r.status === 'bye' ? (r.winner === id ? 'win' : 'lose') : '';
    const sc = r.status === 'done' && res1.pts ? res1.pts[side] : '';
    return `<div class="ln ${side} ${cls}"><span class="strip"></span><span style="min-width:0"><div class="name">${id ? esc(entName(id)) : r.status === 'bye' ? 'Bye' : esc(hint || 'TBD')}</div>${id ? `<div class="dojo">${esc(entDojo(id))}</div>` : ''}</span><span class="sc">${sc === '' || sc == null ? '' : esc(sc)}</span></div>`;
  };
  return `<div class="bm ${r.status === 'ready' ? 'ready' : ''} ${live ? 'live' : ''} ${canS ? 'click' : ''}" ${canS ? `data-act="${scorer && r.status === 'ready' ? 'score' : 'match'}" data-did="${esc(did)}" data-mid="${esc(m.id)}" tabindex="0" role="button"` : ''}>${ln('a')}${ln('b')}
    <div class="meta"><span>${esc(m.id)}${kindOf(DC.divBy[did]) === 'fukugo' ? ' · ' + (KT.fukugoPart(m, S.d.brackets[did]) === 'kitei' ? 'Ki-tei' : 'Kumite') : ''}</span><span>${r.status === 'done' ? esc(res1.method || '') : r.status === 'bye' ? 'Bye' : r.status === 'ready' ? (live ? '● Live' : scorer ? 'Tap to score' : 'Ready') : ''}</span></div></div>`;
}
function bracketViewHTML(did) {
  const br = S.d.brackets[did], res = DC.res[did] || {};
  if (br.format === 'KP') return kpViewHTML(did);
  const ms = Object.values(br.matches || {});
  if (!ms.length) return `<div class="card small muted">Only one entrant — awarded automatically.</div>`;
  const live = Object.values(S.d.ringstate).find(x => x.did === did);
  const liveId = live ? live.mid : null;
  const cols = (stage, title, pool) => {
    const list = ms.filter(m => m.stage === stage && (pool === undefined || m.pool === pool));
    if (!list.length) return '';
    const rounds = [...new Set(list.map(m => m.round))].sort((a, b) => a - b);
    return `<div class="stage-h label">${title}</div><div class="bracket-wrap"><div class="bracket">${rounds.map(rd => {
      const rm = list.filter(m => m.round === rd).sort((a, b) => a.idx - b.idx);
      return `<div class="bcol"><div class="label">${esc(stage === 'L' ? (KT.matchLabel(rm[0], br).includes('3rd/4th') ? 'Final (3rd/4th)' : 'Round ' + rd) : KT.matchLabel(rm[0], br).replace(/^Pool \w+ · /, ''))}</div><div class="bcol-in">${rm.map(m => bmHTML(did, m, res, m.id === liveId)).join('')}</div></div>`;
    }).join('')}</div></div>`;
  };
  const one = id => `<div class="bcol">${bmHTML(did, br.matches[id], res, liveId === id)}</div>`;
  const elim = (pool, X) => {
    const de = br.format === 'DE' || br.format === 'DES';
    let h = cols('W', de ? (br.format === 'DES' ? 'Winners bracket · final decides 1st & 2nd' : 'Winners bracket') : 'Bracket', pool);
    if (br.matches[X + 'B']) h += `<div class="stage-h label">Bronze match</div>${one(X + 'B')}`;
    if (de && ms.some(m => m.stage === 'L' && m.pool === pool)) h += cols('L', br.format === 'DES' ? 'Repechage bracket · final decides 3rd & 4th' : 'Repechage (losers) bracket', pool);
    for (const id of [X + 'GF', X + 'GF2']) if (br.matches[id]) h += `<div class="stage-h label">${id.endsWith('GF2') ? 'Grand final reset' : 'Grand final'}</div>${one(id)}`;
    return h;
  };
  let html = '';
  const playoff = () => ms.some(m => m.stage === 'PO') ? `<div class="card"><div class="row between"><div class="small muted">Top 2 of each pool advance.</div>${roundsRingLine(did)}</div>${cols('PO', 'Playoff')}${br.matches['PO-B'] ? `<div class="stage-h label">Bronze match</div>${one('PO-B')}` : ''}</div>` : '';
  if (br.format === 'RR') {
    html += `<div class="grid2">${Object.keys(br.pools || {}).map(P => poolHTML(did, P, liveId)).join('')}</div>` + playoff();
  } else if (br.elimPools) {
    for (const P of Object.keys(br.pools)) {
      html += `<div class="card"><div class="row between"><h3>Pool ${esc(P)}</h3>${segRingChip(did, 'P:' + P)}</div><div class="small muted">${plural(br.pools[P].length, 'entrant')}</div>${elim(P, `E${P}-`) || '<p class="small muted">Single entrant — advances automatically.</p>'}</div>`;
    }
    html += playoff();
  } else {
    html += `<div class="card">${roundsRingLine(did) ? `<div class="row" style="justify-content:flex-end">${roundsRingLine(did)}</div>` : ''}${elim(undefined, '')}</div>`;
  }
  return html;
}
/** Ring a pool / round runs on (shown to everyone in the bracket view). */
/** Ring a pool / round runs on. Director: a selector to move it to another ring (pools run in parallel); everyone else: a label. */
function segRingChip(did, seg, label) {
  const dv = DC.divBy[did]; if (!dv) return '';
  const rid = KT.ringOf(dv, seg);
  if (isDirector() && seg && DC.rings.length > 1) {
    return `<label class="ring-sel" title="Ring that runs ${esc(label || SEG_LABEL(seg))}"><span>${label ? esc(label) + ' · ' : ''}Ring</span><select id="brg-${esc(did)}-${esc(seg.replace(':', ''))}" data-change="seg-ring" data-did="${esc(did)}" data-seg="${esc(seg)}" aria-label="Ring for ${esc(label || SEG_LABEL(seg))}">${DC.rings.map(x => opt(x.id, x.id === dv.ringId ? x.name + ' (main)' : x.name, rid)).join('')}</select></label>`;
  }
  return S.d.rings[rid] ? `<span class="chip ring-chip">${label ? esc(label) + ' · ' : ''}${esc(ringName(rid))}</span>` : '';
}
/** Semifinal / final rings (shown when they differ from the main ring; always selectable for the director). */
function roundsRingLine(did) {
  const dv = DC.divBy[did], br = S.d.brackets[did]; if (!dv || !br || !DC.rings.length) return '';
  const segs = KT.segList(br).map(x => x.seg); if (!segs.includes('SF')) return '';
  const sf = KT.ringOf(dv, 'SF'), f = KT.ringOf(dv, 'F');
  if (!(isDirector() && DC.rings.length > 1) && sf === dv.ringId && f === dv.ringId) return '';
  return `<span class="pill-list">${segRingChip(did, 'SF', 'Semifinal')}${segRingChip(did, 'F', 'Final')}</span>`;
}
function poolHTML(did, P, liveId) {
  const br = S.d.brackets[did], res = DC.res[did] || {};
  const st = KT.standings(br, P, id => res[id]);
  const ms = Object.values(br.matches).filter(m => m.stage === 'P' && m.pool === P).sort((a, b) => a.round - b.round || a.idx - b.idx);
  const adv = br.advance || 0;
  return `<div class="card stack"><div class="row between"><h3>Pool ${esc(P)}</h3>${segRingChip(did, 'P:' + P)}${st.complete ? (st.tie ? `<span class="chip warn">Tie</span>` : '<span class="chip ok">Complete</span>') : ''}</div>
    <div class="tw"><table><thead><tr><th>#</th><th>Entrant</th><th class="n">W</th><th class="n">L</th><th class="n">For</th><th class="n">Agst</th></tr></thead><tbody>
    ${st.rows.map((r, i) => `<tr><td class="num">${i + 1}${adv && i < adv && st.complete ? ' ▸' : ''}</td><td><div class="name">${esc(entName(r.id))}</div><div class="dojo">${esc(entDojo(r.id))}</div></td><td class="n">${r.w}</td><td class="n">${r.l}</td><td class="n">${r.pf}</td><td class="n">${r.pa}</td></tr>`).join('')}
    </tbody></table></div>
    ${st.tie && (isDirector() || canScoreDiv(did)) ? `<div class="notice warn">Tied on wins, head-to-head and points. <button class="sm" data-act="tiebreak" data-did="${esc(did)}" data-pool="${esc(P)}">Set order</button></div>` : ''}
    <div class="grid3" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">${ms.map(m => bmHTML(did, m, res, m.id === liveId)).join('')}</div></div>`;
}

/* ---------- results ---------- */
function resultsHTML() {
  const medals = [];
  const rows = DC.divs.filter(d => S.d.brackets[d.id] || divEntrants(d.id).length === 1).map(d => {
    const br = S.d.brackets[d.id];
    const pl = br ? DC.pl[d.id] : { complete: true, gold: divEntrants(d.id)[0], bronze: [] };
    if (pl.complete) {
      if (pl.gold) medals.push({ dojo: entDojo(pl.gold), place: 'gold' });
      if (pl.silver) medals.push({ dojo: entDojo(pl.silver), place: 'silver' });
      (pl.bronze || []).forEach(b => medals.push({ dojo: entDojo(b), place: 'bronze' }));
    }
    const cell = (id, cls, n) => id ? `<div class="pl"><span class="medal ${cls}">${n}</span><span style="min-width:0"><div class="name">${esc(entName(id))}</div><div class="dojo">${esc(entDojo(id))}</div></span></div>` : '';
    const canAward = br && (isDirector() || canScoreDiv(d.id));
    return `<div class="card stack"><div class="row between"><div style="min-width:0"><h3>${esc(d.name)}</h3><div class="small muted">${S.d.rings[d.ringId] ? esc(S.d.rings[d.ringId].name) : 'No ring'}</div></div>
      ${pl.complete ? (br && br.awarded ? '<span class="chip ok">Awarded</span>' : '<span class="chip">Final</span>') : pl.tie ? `<span class="chip warn">Tie to resolve</span>` : `<span class="chip plain">In progress</span>`}</div>
      ${pl.complete ? `<div class="podium">${cell(pl.gold, 'g', 1)}${cell(pl.silver, 's', 2)}${(pl.bronze || []).map(b => cell(b, 'b', 3)).join('')}</div>` : `<div class="small muted">${br ? `${bracketState(d.id).fought} of ${bracketState(d.id).playable} ${bracketState(d.id).kp ? 'performances scored' : 'matches fought'}.` : ''}</div>`}
      ${pl.complete && canAward ? `<label class="check"><input type="checkbox" id="aw-${esc(d.id)}" data-change="awarded" data-did="${esc(d.id)}" ${br.awarded ? 'checked' : ''}> Medals presented</label>` : ''}</div>`;
  });
  const table = KT.medalTable(medals);
  return eventHeader(`<button data-act="export-results">Export results CSV</button>`) + `<div class="grid2">
    <div class="card flush"><div class="card-h"><h3>Medal table by dojo</h3><span class="small muted">${plural(medals.length, 'medal')}</span></div><div class="tw"><table><thead><tr><th>Dojo</th><th class="n">Gold</th><th class="n">Silver</th><th class="n">Bronze</th></tr></thead><tbody>
    ${table.map(r => `<tr><td>${esc(r.dojo)}</td><td class="n">${r.gold}</td><td class="n">${r.silver}</td><td class="n">${r.bronze}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Medals appear as divisions finish.</td></tr>'}</tbody></table></div></div>
    ${rows.join('')}</div>`;
}

/* ---------- camps: overview, sessions, attendance, staff ---------- */
function campOverviewHTML() {
  const parts = DC.comps.filter(c => c.status !== 'withdrawn');
  const sess = Object.values(S.d.sessions).sort(sessSort);
  const att = sess.map(s => { const a = (S.d.attendance[s.id] || {}).present || {}; return parts.filter(p => a[p.id]).length; });
  const total = att.reduce((x, y) => x + y, 0), possible = sess.length * parts.length;
  return eventHeader() + `<div class="stats">
    ${statBtn('competitors', 'Participants', `<b>${parts.length}</b><div class="small muted">${parts.filter(p => p.feePaid).length} paid</div>`)}
    ${statBtn('sessions', 'Sessions', `<b>${sess.length}</b><div class="small muted">Schedule</div>`)}
    ${statBtn('attendance', 'Attendance', `<b>${possible ? Math.round(total / possible * 100) : 0}%</b><div class="meter"><i style="width:${possible ? total / possible * 100 : 0}%"></i></div>`)}</div>
    <div class="card flush"><div class="card-h"><h3>Schedule</h3>${isDirector() ? '<button class="sm" data-act="tab" data-v="sessions">Edit sessions</button>' : ''}</div><div class="tw"><table><tbody>
    ${sess.map((s, i) => `<tr><td class="num small">${fmtDate(s.date)}<div class="dojo">${esc(s.start || '')}${s.end ? '–' + esc(s.end) : ''}</div></td><td><div class="name">${esc(s.title)}</div><div class="dojo">${esc(s.instructor || '')}${s.location ? ' · ' + esc(s.location) : ''}</div></td><td class="n">${att[i]}/${parts.length}</td></tr>`).join('') || '<tr><td class="muted">No sessions scheduled yet.</td></tr>'}
    </tbody></table></div></div>`;
}
function sessSort(a, b) { return String(a.date || '').localeCompare(String(b.date || '')) || String(a.start || '').localeCompare(String(b.start || '')); }
function sessionsHTML() {
  const sess = Object.values(S.d.sessions).sort(sessSort), dir = isDirector();
  return fab('session-new', 'Add session') + eventHeader(dir ? '<button class="primary" data-act="session-new">Add session</button>' : '') + (sess.length ? `<div class="card flush"><div class="tw"><table><thead><tr><th>When</th><th>Session</th><th>Instructor</th><th>Location</th><th class="n">Capacity</th></tr></thead><tbody>
    ${sess.map(s => `<tr class="${dir ? 'click' : ''}" ${dir ? `data-act="session-edit" data-id="${esc(s.id)}"` : ''}><td class="num small">${fmtDate(s.date)}<div class="dojo">${esc(s.start || '')}${s.end ? '–' + esc(s.end) : ''}</div></td><td class="name">${esc(s.title)}</td><td>${esc(s.instructor || '')}</td><td>${esc(s.location || '')}</td><td class="n">${esc(s.capacity || '')}</td></tr>`).join('')}
    </tbody></table></div></div>` : `<div class="card empty"><div class="mark-lg"></div><h2>No sessions yet</h2><p class="muted">Add each class, seminar or grading on the schedule.</p>${dir ? '<button class="primary" data-act="session-new">Add session</button>' : ''}</div>`);
}
function attendanceHTML() {
  const sess = Object.values(S.d.sessions).sort(sessSort);
  if (!S.ui.session || !S.d.sessions[S.ui.session]) S.ui.session = sess.length ? sess[0].id : '';
  const sid = S.ui.session;
  if (!sid) return eventHeader() + `<div class="card empty"><p>Add sessions first, then take attendance here.</p></div>`;
  const parts = DC.comps.filter(c => c.status !== 'withdrawn').sort((a, b) => String(a.lastName).localeCompare(String(b.lastName)));
  const present = (S.d.attendance[sid] || {}).present || {};
  const can = !S.readOnly && isStaff();
  const n = parts.filter(p => present[p.id]).length;
  return eventHeader() + `<div class="section-h"><select id="att-s" data-change="session" aria-label="Session" style="max-width:360px">${sess.map(s => opt(s.id, `${fmtDate(s.date)} ${s.start || ''} · ${s.title}`, sid)).join('')}</select>
    <div class="row"><span class="chip">${n}/${parts.length} present</span>${can ? '<button data-act="att-all">Mark all present</button>' : ''}</div></div>
    ${!can ? '<div class="notice info">Only the director and assigned staff can take attendance.</div>' : ''}
    <div class="card flush"><div class="tw"><table><tbody>${parts.map(p => `<tr><td><div class="name">${esc(p.lastName)}, ${esc(p.firstName)}</div><div class="dojo">${esc(p.dojo || '')} · ${esc(KT.rankLabel(p.rank))}</div></td>
      <td style="text-align:right"><label class="check"><input type="checkbox" id="att-${esc(p.id)}" data-change="att" data-id="${esc(p.id)}" ${present[p.id] ? 'checked' : ''} ${can ? '' : 'disabled'}> Present</label></td></tr>`).join('') || '<tr><td class="muted">Register participants first.</td></tr>'}</tbody></table></div></div>`;
}
function staffHTML() {
  const ev = curEvent();
  return eventHeader() + `<div class="card stack"><h3>Camp staff</h3><p class="small muted">Staff can take attendance for every session. Directors can do everything.</p>
    <div class="pill-list">${(ev.staffIds || []).map(id => `${personChip(id)}<button class="sm ghost" data-act="staff-remove" data-uid="${esc(id)}" aria-label="Remove">✕</button>`).join('') || '<span class="small muted">No staff assigned.</span>'}</div>
    ${isLocal() ? '<p class="tiny muted">People can be assigned once the tracker is shared from claude.ai.</p>' : `<div class="dd"><input id="staff-q" type="search" placeholder="Add staff by name or email…" data-input="staff-search" autocomplete="off"><div class="dd-list" id="staff-dd" hidden></div></div>`}</div>`;
}

/* ---------- kata score pools view ---------- */
function kpTableHTML(did, title, rows, order, opts) {
  const br = S.d.brackets[did], J = br.judges || 6, can = (rows[0] || order[0]) ? canScoreKP(did, (rows[0] || {}).key || '') : false, k = J >= 5 ? J - 2 : J;
  const f = x => (x / k).toFixed(2);
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  const seq = opts.byRank ? rows : order.map(id => byId[id]);
  const sc = (r) => {
    const e = (br.scores || {})[r.key]; if (!e) return '';
    if (e.hansoku) return '<span class="chip bad">Han-soku</span>';
    const v = e.s.map(Number), hi = Math.max(...v), lo = Math.min(...v); let dh = J >= 5, dl = J >= 5;
    return v.map(x => { let cls = ''; if (dh && x === hi) { cls = 'dropped'; dh = false; } else if (dl && x === lo) { cls = 'dropped'; dl = false; } return `<span class="js ${cls}">${x.toFixed(1)}</span>`; }).join('');
  };
  return `<div class="card flush"><div class="card-h"><h3>${esc(title)}</h3>${opts.chip || ''}</div><div class="tw"><table class="kp"><thead><tr><th>#</th><th>${opts.byRank ? 'Place' : 'Order'}</th><th>Competitor</th><th>${br.kataRule ? 'Kata' : 'Notes'}</th><th>Judges</th>${opts.carry ? '<th class="n">Semifinal</th><th class="n">Final</th>' : ''}<th class="n">Score</th></tr></thead><tbody>
    ${seq.map((r, i) => `<tr class="${can || isDirector() ? 'click' : ''} ${r.advance ? 'adv' : ''}" ${can || isDirector() ? `data-act="kp-score" data-did="${esc(did)}" data-key="${esc(r.key)}"` : ''}>
      <td class="num">${i + 1}</td><td class="num">${r.rank ? (opts.medals && r.rank <= 3 ? `<span class="medal ${['g', 's', 'b'][r.rank - 1]}">${r.rank}</span>` : r.rank) : '—'}${r.advance ? ' <span class="chip ok" title="Advances">▸</span>' : ''}</td>
      <td><div class="name">${esc(entName(r.id))}</div><div class="dojo">${esc(entDojo(r.id))}</div></td>
      <td class="small">${esc(r.kata || '')}${r.appTotal != null ? `<div class="tiny muted">Kata ${f(r.kataOwn)} · Application ${f(r.appTotal)}</div>` : ''}${r.rpTotal != null ? `<div class="tiny muted">Kettei-sen ${f(r.rpTotal)}</div>` : ''}</td>
      <td class="jcell">${sc(r)}</td>
      ${opts.carry ? `<td class="n">${r.sheet ? f(r.carry) : ''}</td><td class="n">${r.sheet ? f(r.own) : ''}</td>` : ''}
      <td class="n"><b>${r.sheet ? f(r.total) : ''}</b></td></tr>`).join('')}</tbody></table></div>
    ${opts.needRp && opts.needRp.length ? `<div class="notice warn" style="margin:10px 16px">Tied even after adding back all six scores: ${opts.needRp.map(id => esc(entName(id))).join(', ')} — Kettei-sen${br.kataRule ? ' with a different kata' : ''}.</div>` : ''}</div>`;
}
function kpViewHTML(did) {
  const br = S.d.brackets[did], st = KT.kpState(br);
  let h = `<p class="small muted">WTKF kata system · pools of up to ${br.poolSize || 8} · ${br.judges || 6} judges score 0–10${(br.judges || 6) >= 5 ? ', highest and lowest dropped, average of the rest' : ''} · top 4 of each pool advance until 8 remain · the final 8 is the semifinal; its top 4 perform in the final · semifinal and final each need a different kata${br.application ? ' · final adds Application (Bunkai)' : ''} · final placing = semifinal + final score · ties: all six scores added back, then Kettei-sen.</p>`;
  if (roundsRingLine(did)) h += `<div class="row" style="justify-content:flex-end;margin-bottom:8px">${roundsRingLine(did)}</div>`;
  for (const rd of st.rounds) {
    h += `<div class="stage-h label">${esc(KT.kpRoundName(rd))}</div><div class="stack">`;
    for (const P of Object.keys(rd.pools)) {
      const p = rd.pools[P];
      const chip = (p.rows[0] ? segRingChip(did, KT.kpSegOfKey(br, p.rows[0].key)) : '') + (p.complete ? '<span class="chip ok">Complete</span>' : `<span class="chip plain">${p.rows.filter(r => r.sheet).length}/${p.rows.length} scored</span>`);
      h += kpTableHTML(did, `${Object.keys(rd.pools).length > 1 ? 'Pool ' + P : KT.kpRoundName(rd)}`, p.rows, p.order, { byRank: p.scoredAll, chip, needRp: p.needRp });
    }
    h += '</div>';
  }
  if (st.final) {
    const f = st.final;
    h += `<div class="stage-h label">Final</div>` + kpTableHTML(did, 'Final', f.rows, f.order, { byRank: f.rows.every(r => r.sheet), carry: f.carried, medals: f.complete,
      chip: segRingChip(did, 'F') + (f.complete ? '<span class="chip ok">Complete</span>' : `<span class="chip plain">${f.rows.filter(r => r.sheet).length}/${f.rows.length} scored</span>`), needRp: f.needRp });
  }
  return h;
}

function statBtn(tab, label, inner) {
  return `<button class="stat stat-btn" data-act="tab" data-v="${tab}" aria-label="${esc(label)} — open"><span class="label">${esc(label)}</span>${inner}<span class="stat-go" aria-hidden="true">›</span></button>`;
}
