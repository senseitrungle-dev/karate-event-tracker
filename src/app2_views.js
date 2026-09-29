/* ===== views ===== */
let rq = false;
function render() { if (rq) return; rq = true; setTimeout(() => { rq = false; doRender(); }, 0); }
function doRender() {
  derive();
  const ae = document.activeElement, aid = ae && ae.id && !$('#modal').contains(ae) ? ae.id : null;
  const sel = aid && ae.selectionStart != null ? [ae.selectionStart, ae.selectionEnd] : null;
  $('#bar').innerHTML = barHTML();
  const bar = $('#bar'); document.documentElement.style.setProperty('--barh', bar.offsetHeight + 'px');
  $('#tabs').innerHTML = tabsHTML();
  $('#tabs').hidden = !S.evId;
  if (S.lastTab !== S.ui.tab) { S.lastTab = S.ui.tab; const t = $('.tab[aria-selected="true"]'); if (t && t.scrollIntoView) try { t.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* ignore */ } }
  $('#main').innerHTML = mainHTML();
  if (aid) { const el = document.getElementById(aid); if (el) { el.focus(); if (sel && el.setSelectionRange) try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignore */ } } }
  if (S.modal && S.modal.refresh) S.modal.refresh();
  const ids = new Set(); DC.rings.forEach(r => (r.managerIds || []).forEach(i => ids.add(i))); const ev = curEvent(); if (ev) (ev.staffIds || []).forEach(i => ids.add(i));
  if (ids.size) refreshProfiles([...ids]);
}
function barHTML() {
  const ev = curEvent(), r = role();
  if (FB.needSignIn) return `<div class="bar-in"><span class="brand"><span class="mark"></span><span><b>Karate Event Tracker</b><small>v${KT.VERSION}</small></span></span></div>`;
  const mode = !S.store ? `<span class="chip"><span class="dot"></span>Connecting…</span>` : isLocal()
    ? `<span class="chip" title="Data stays in this browser only">Local mode</span>` : `<span class="chip" title="Shared live database"><span class="dot" style="color:#6fcf97"></span>Live</span>`;
  let roleCtl = `<span class="chip">${ROLE_LABEL[r]}</span>`;
  if (isLocal()) {
    roleCtl = `<select id="sim-role" aria-label="View as" data-change="sim-role">${opt('director', 'View as Director', r)}${opt('manager', 'View as Ring manager', r)}${opt('viewer', 'View as Spectator', r)}</select>`;
    if (r === 'manager' && ev) roleCtl += `<select id="sim-ring" aria-label="Manager of ring" data-change="sim-ring">${opt('', 'Pick ring…', S.ui.simRing)}${DC.rings.map(x => opt(x.id, x.name, S.ui.simRing)).join('')}</select>`;
  }
  return `<div class="bar-in">
    <button class="brand" data-act="home" aria-label="All events"><span class="mark"></span><span><b>Karate Event Tracker</b><small>${ev ? esc(ev.name) : 'v' + KT.VERSION}</small></span></button>
    <span class="spacer"></span>${mode}${roleCtl}${fbBarBits()}</div>`;
}
function tabsFor() {
  const ev = curEvent(); if (!ev) return [];
  const r = role();
  if (ev.kind === 'tournament') {
    const t = [['overview', 'Overview'], ['competitors', 'Competitors'], ['teams', 'Teams'], ['divisions', 'Divisions'], ['rings', 'Rings'], ['mat', 'Mat'], ['brackets', 'Brackets'], ['results', 'Results']];
    if (r === 'director') return t;
    return t.filter(([k]) => ['overview', 'competitors', 'mat', 'brackets', 'results'].includes(k));
  }
  const t = [['overview', 'Overview'], ['competitors', 'Participants'], ['sessions', 'Sessions'], ['attendance', 'Attendance']];
  if (r === 'director') t.push(['staff', 'Staff']);
  return t;
}
function tabsHTML() {
  const t = tabsFor();
  if (t.length && !t.some(x => x[0] === S.ui.tab)) S.ui.tab = t[0][0];
  return `<div class="tabs-in" role="tablist">${t.map(([k, l]) => `<button class="tab" role="tab" aria-selected="${S.ui.tab === k}" data-act="tab" data-v="${k}">${l}</button>`).join('')}</div>`;
}
function mainHTML() {
  if (FB.needSignIn) return fbSignInHTML();
  if (!S.store) return `<div class="empty"><div class="mark-lg"></div><p>Connecting to the event database…</p></div>`;
  if (!S.evId) return homeHTML();
  const ev = curEvent();
  if (!ev) return `<div class="empty"><p>This event is no longer available.</p><button data-act="home">All events</button></div>`;
  const v = { overview: overviewHTML, competitors: competitorsHTML, teams: teamsHTML, divisions: divisionsHTML, rings: ringsHTML, mat: matHTML,
    brackets: bracketsHTML, results: resultsHTML, sessions: sessionsHTML, attendance: attendanceHTML, staff: staffHTML }[S.ui.tab] || overviewHTML;
  return v();
}

/* ---------- home ---------- */
function homeHTML() {
  const evs = Object.values(S.events).sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')));
  const dir = isDirector();
  const head = `<div class="section-h"><div><div class="label">Events</div><h1>Tournaments, camps &amp; clinics</h1></div>
    <div class="row">${dir ? `<button data-act="demo">Create demo tournament</button><button class="primary" data-act="event-new">New event</button>` : ''}</div></div>`;
  const fbx = fbHomeBits();
  if (!S.loadedEvents) return head + fbx + `<div class="card empty"><p>Loading events…</p></div>`;
  if (!evs.length) return head + fbx + `<div class="card empty"><div class="mark-lg"></div><h2>No events yet</h2>
    <p class="muted" style="max-width:52ch">${dir ? 'Create your first tournament or training camp. A demo tournament with fictional competitors is available to explore how divisions, brackets and scoring work.' : 'The tournament director has not published any events yet.'}</p>
    ${dir ? `<div class="row"><button data-act="demo">Create demo tournament</button><button class="primary" data-act="event-new">New event</button></div>` : ''}</div>`;
  return head + fbx + `<div class="grid3">${evs.map(e => `<button class="card ev-card" data-act="open-event" data-id="${esc(e.id)}">
      <div class="row"><span class="chip ${e.kind === 'tournament' ? 'aka' : ''}">${esc(KT.EVENT_KINDS[e.kind] || e.kind)}</span>${e.kind === 'tournament' && e.level ? `<span class="chip plain">${esc(e.level)}</span>` : ''}${e.demo ? '<span class="chip warn">Demo</span>' : ''}</div>
      <h3>${esc(e.name)}</h3>
      <div class="date">${fmtDate(e.startDate)}${e.endDate && e.endDate !== e.startDate ? ' – ' + fmtDate(e.endDate) : ''}</div>
      ${e.location ? `<div class="small muted">${esc(e.location)}</div>` : ''}</button>`).join('')}</div>`;
}

/* ---------- overview ---------- */
function eventHeader(extra) {
  const ev = curEvent();
  return `<div class="section-h"><div><div class="label">${esc(KT.EVENT_KINDS[ev.kind])}${ev.level && ev.kind === 'tournament' ? ' · ' + esc(ev.level) : ''}</div>
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
  }
  const steps = dir ? `<div class="card"><h3>Director checklist</h3><ol class="small" style="margin:8px 0 0;padding-left:20px;display:grid;gap:4px">
      <li>${divs.length ? '✓' : ''} Create divisions — standard black-belt set plus your kyu groups (<a href="#" data-act="tab" data-v="divisions">Divisions</a>)</li>
      <li>${comps.length ? '✓' : ''} Register competitors and check them in (<a href="#" data-act="tab" data-v="competitors">Competitors</a>)</li>
      <li>${DC.teams.length ? '✓' : ''} Form Team Kata, Team Kumite and Enbu teams (<a href="#" data-act="tab" data-v="teams">Teams</a>)</li>
      <li>${DC.rings.length ? '✓' : ''} Set up rings, assign managers and divisions (<a href="#" data-act="tab" data-v="rings">Rings</a>)</li>
      <li>${drawn ? '✓' : ''} Draw brackets (<a href="#" data-act="tab" data-v="divisions">Divisions</a>)</li>
      <li>${fought ? '✓' : ''} Run matches on the mat and present awards (<a href="#" data-act="tab" data-v="mat">Mat</a>, <a href="#" data-act="tab" data-v="results">Results</a>)</li></ol></div>` : '';
  return eventHeader() + `<div class="stats">
      <div class="stat"><span class="label">Competitors</span><b>${active.length}</b><div class="small muted">${checked} checked in</div><div class="meter"><i style="width:${active.length ? checked / active.length * 100 : 0}%"></i></div></div>
      <div class="stat"><span class="label">Divisions</span><b>${divs.length}</b><div class="small muted">${drawn} drawn · ${complete} finished</div></div>
      <div class="stat"><span class="label">Matches</span><b>${fought}<span class="muted" style="font-size:1rem">/${playable}</span></b><div class="meter"><i style="width:${playable ? fought / playable * 100 : 0}%"></i></div></div>
      <div class="stat"><span class="label">Rings</span><b>${DC.rings.length}</b><div class="small muted">${DC.teams.length} teams entered</div></div></div>
    ${warn.length ? `<div class="stack">${warn.map(w => `<div class="notice warn">${w}</div>`).join('')}</div>` : ''}
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
  return eventHeader() + `<div class="section-h">${tools}<div class="row">${acts}</div></div>
    <div class="card flush"><div class="tw"><table><thead><tr><th>Name</th><th>Sex · Age</th><th>Rank</th>${tour ? '<th>Events</th>' : ''}<th>Status</th></tr></thead>
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
      : bs.complete ? '<span class="chip ok">Finished</span>' : `<span class="chip">${bs.fought}/${bs.playable} matches</span>${bs.changed ? ' <span class="chip warn">Entrants changed</span>' : ''}`;
    return `<tr><td><button class="ghost sm" style="padding:0;min-height:0;text-align:left;justify-content:flex-start" data-act="div-edit" data-id="${esc(d.id)}"><span class="name">${esc(d.name)}</span></button>
        <div class="dojo">${d.belt === 'kyu' ? esc(KT.rankLabel(d.minRank) + ' – ' + KT.rankLabel(d.maxRank)) + ' · ' : ''}${ageRange(d)}</div></td>
      <td class="small">${esc(KT.FORMATS[d.format] || d.format)}<div class="dojo">${esc(scoringLabel(d))}</div></td>
      <td class="small">${ring ? esc(ring.name) : '<span class="muted">—</span>'}</td>
      <td class="n">${n}</td><td>${st}</td>
      <td style="white-space:nowrap">${bs.drawn ? `<button class="sm" data-act="view-bracket" data-id="${esc(d.id)}">Bracket</button>` : n >= 1 ? `<button class="sm" data-act="draw" data-id="${esc(d.id)}">Draw</button>` : ''}</td></tr>`;
  }).join('');
  return eventHeader() + `<div class="section-h"><select id="div-f" data-change="divFilter" aria-label="Event filter" style="max-width:240px">${opt('', 'All events', f)}${(ev.eventTypes || KT.EVENT_ORDER).map(t => opt(t, KT.EVENT_TYPES[t].label, f)).join('')}</select><div class="row">${acts}</div></div>
    <div class="card flush"><div class="tw"><table><thead><tr><th>Division</th><th>Format</th><th>Ring</th><th class="n">Entrants</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
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
    const divs = DC.divs.filter(d => d.ringId === r.id).sort((a, b) => (a.ringOrder || 0) - (b.ringOrder || 0));
    const free = DC.divs.filter(d => !S.d.rings[d.ringId] && divEntrants(d.id).length);
    return `<div class="card stack"><div class="row between"><h3>${esc(r.name)}</h3><div class="row"><button class="sm" data-act="ring-edit" data-id="${esc(r.id)}">Rename</button></div></div>
      <div><div class="label">Managers</div><div class="pill-list" style="margin-top:6px">${(r.managerIds || []).map(id => `${personChip(id)}<button class="sm ghost" data-act="ring-unmanage" data-id="${esc(r.id)}" data-uid="${esc(id)}" aria-label="Remove manager">✕</button>`).join('') || '<span class="small muted">No manager assigned — only directors can score this ring.</span>'}</div>
      ${isLocal() ? '<p class="tiny muted" style="margin-top:6px">People can be assigned once the tracker is shared from claude.ai. In local mode, use “View as Ring manager” to preview their access.</p>' : `<div class="dd" style="margin-top:8px"><input id="mgr-q-${esc(r.id)}" type="search" placeholder="Add manager by name or email…" data-input="mgr-search" data-ring="${esc(r.id)}" autocomplete="off"><div class="dd-list" id="mgr-dd-${esc(r.id)}" hidden></div></div>`}</div>
      <div><div class="label">Divisions, in running order</div><div class="stack" style="gap:4px;margin-top:6px">${divs.map((d, i) => `<div class="row between small" style="gap:6px"><span style="min-width:0">${i + 1}. ${esc(d.name)} <span class="muted">(${divEntrants(d.id).length})</span></span>
        <span class="row" style="gap:4px"><button class="sm ghost" data-act="ring-move" data-id="${esc(d.id)}" data-dir="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button><button class="sm ghost" data-act="ring-move" data-id="${esc(d.id)}" data-dir="1" aria-label="Move down" ${i === divs.length - 1 ? 'disabled' : ''}>↓</button><button class="sm ghost" data-act="ring-undiv" data-id="${esc(d.id)}" aria-label="Remove from ring">✕</button></span></div>`).join('') || '<span class="small muted">No divisions assigned.</span>'}</div>
      ${divs.length ? `<label class="f" style="margin-top:8px"><span>Bracket format for this ring</span><select id="ring-fmt-${esc(r.id)}" data-change="ring-format" data-ring="${esc(r.id)}">${opt('', 'Set for all divisions…', '')}${Object.entries(KT.FORMATS).map(([k, l]) => opt(k, l, '')).join('')}</select></label>` : ''}
      ${free.length ? `<select id="ring-add-${esc(r.id)}" data-change="ring-adddiv" data-ring="${esc(r.id)}" style="margin-top:8px">${opt('', 'Assign a division…', '')}${free.map(d => opt(d.id, `${d.name} (${divEntrants(d.id).length})`, '')).join('')}</select>` : ''}</div></div>`;
  }).join('');
  return eventHeader(`<button class="primary" data-act="ring-new">Add ring</button>`) + (DC.rings.length ? `<div class="grid2">${cards}</div>` :
    `<div class="card empty"><div class="mark-lg"></div><h2>No rings yet</h2><p class="muted">Add a ring (court) for each competition area, then assign a manager and the divisions it will run.</p><button class="primary" data-act="ring-new">Add ring</button></div>`);
}

/* ---------- mat / ring board ---------- */
function ringQueue(rid) {
  const out = [];
  const divs = DC.divs.filter(d => d.ringId === rid).sort((a, b) => (a.ringOrder || 0) - (b.ringOrder || 0));
  for (const d of divs) { const br = S.d.brackets[d.id]; if (!br) continue; for (const m of KT.readyMatches(br, DC.res[d.id])) out.push({ did: d.id, m, r: DC.res[d.id][m.id] }); }
  return out;
}
function ringBoardHTML(rings, withActions) {
  if (!rings.length) return `<div class="card small muted">No rings set up yet.</div>`;
  return `<div class="grid2">${rings.map(r => {
    const rs = S.d.ringstate[r.id], q = ringQueue(r.id);
    let now = '<div class="small muted">Nothing on the mat.</div>';
    if (rs && rs.did && S.d.brackets[rs.did]) {
      const dv = DC.divBy[rs.did], res = (DC.res[rs.did] || {})[rs.mid];
      if (res && res.status === 'ready') {
        now = `<div class="label">${esc(dv ? dv.name : '')} · ${esc(KT.matchLabel(S.d.brackets[rs.did].matches[rs.mid], S.d.brackets[rs.did]))}</div>
        <div class="now"><div class="side"><span class="belt a"></span><span style="min-width:0"><div class="name">${esc(entName(res.a))}</div><div class="dojo">${esc(entDojo(res.a))}</div></span></div>
        <div class="sc num">${rs.score ? `${esc(rs.score.a)}–${esc(rs.score.b)}` : 'vs'}</div>
        <div class="side" style="justify-content:flex-end;text-align:right"><span style="min-width:0"><div class="name">${esc(entName(res.b))}</div><div class="dojo">${esc(entDojo(res.b))}</div></span><span class="belt b"></span></div></div>
        ${rs.phase ? `<div class="phase">${esc(rs.phase)}</div>` : ''}`;
      }
    }
    const next = q.filter(x => !(rs && x.did === rs.did && x.m.id === rs.mid)).slice(0, withActions ? 12 : 3);
    const canR = canScoreDiv(DC.divs.find(d => d.ringId === r.id)?.id) || isDirector();
    return `<div class="card ring-card stack"><div class="row between"><h3>${esc(r.name)}</h3><span class="chip ${q.length ? '' : 'plain'}">${plural(q.length, 'match', 'matches')} ready</span></div>
      <div>${now}${withActions && rs && rs.did && canScoreDiv(rs.did) && DC.res[rs.did] && DC.res[rs.did][rs.mid] && DC.res[rs.did][rs.mid].status === 'ready' ? `<div class="row" style="margin-top:8px"><button class="primary" data-act="score" data-did="${esc(rs.did)}" data-mid="${esc(rs.mid)}">Open scoresheet</button></div>` : ''}</div>
      <div class="queue"><div class="label">Up next</div>${next.map(x => `<div class="q"><span class="side"><span class="belt a"></span><span class="name">${esc(entName(x.r.a))}</span></span>
        <span class="vs">${withActions && canR && canScoreDiv(x.did) ? `<button class="sm" data-act="score" data-did="${esc(x.did)}" data-mid="${esc(x.m.id)}">Score</button>` : 'vs'}</span>
        <span class="side" style="justify-content:flex-end"><span class="name">${esc(entName(x.r.b))}</span><span class="belt b"></span></span></div>
        <div class="tiny muted" style="margin-top:-4px">${esc(DC.divBy[x.did].name)} · ${esc(KT.matchLabel(x.m, S.d.brackets[x.did]))}</div>`).join('') || '<div class="small muted">No matches waiting.</div>'}</div></div>`;
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
    + note + ringBoardHTML(rings, true);
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
  return `<div class="card"><div class="row between"><h3>${pl.complete ? 'Final placings' : 'Placings so far'}</h3>${pl.complete ? '<span class="chip ok">Finished</span>' : ''}</div><div class="podium" style="margin-top:8px">${line('g', '1', pl.gold)}${line('s', '2', pl.silver)}${(pl.bronze || []).map(b => line('b', '3', b)).join('')}</div></div>`;
}
function bmHTML(did, m, res, live) {
  const r = res[m.id]; if (!r) return '';
  if (r.status === 'void' || r.status === 'skip') return `<div class="bm" style="opacity:.45"><div class="ln tbd"><span class="strip"></span><span class="name">${r.status === 'skip' ? 'Not needed' : 'No match'}</span><span></span></div></div>`;
  const canS = canScoreDiv(did) && (r.status === 'ready' || r.status === 'done');
  const res1 = r.result || {};
  const ln = (side) => {
    const id = r[side], hint = side === 'a' ? r.hintA : r.hintB;
    const cls = !id ? 'tbd' : r.status === 'done' || r.status === 'bye' ? (r.winner === id ? 'win' : 'lose') : '';
    const sc = r.status === 'done' && res1.pts ? res1.pts[side] : '';
    return `<div class="ln ${side} ${cls}"><span class="strip"></span><span style="min-width:0"><div class="name">${id ? esc(entName(id)) : r.status === 'bye' ? 'Bye' : esc(hint || 'TBD')}</div>${id ? `<div class="dojo">${esc(entDojo(id))}</div>` : ''}</span><span class="sc">${sc === '' || sc == null ? '' : esc(sc)}</span></div>`;
  };
  return `<div class="bm ${r.status === 'ready' ? 'ready' : ''} ${live ? 'live' : ''} ${canS ? 'click' : ''}" ${canS ? `data-act="score" data-did="${esc(did)}" data-mid="${esc(m.id)}" tabindex="0" role="button"` : ''}>${ln('a')}${ln('b')}
    <div class="meta"><span>${esc(m.id)}</span><span>${r.status === 'done' ? esc(res1.method || '') : r.status === 'bye' ? 'Bye' : r.status === 'ready' ? (live ? 'On the mat' : 'Ready') : ''}</span></div></div>`;
}
function bracketViewHTML(did) {
  const br = S.d.brackets[did], res = DC.res[did] || {};
  const ms = Object.values(br.matches || {});
  if (!ms.length) return `<div class="card small muted">Only one entrant — awarded automatically.</div>`;
  const live = Object.values(S.d.ringstate).find(x => x.did === did);
  const liveId = live ? live.mid : null;
  const cols = (stage, title) => {
    const list = ms.filter(m => m.stage === stage || (stage === 'W' && m.stage === 'B' && false));
    if (!list.length) return '';
    const rounds = [...new Set(list.map(m => m.round))].sort((a, b) => a - b);
    return `<div class="stage-h label">${title}</div><div class="bracket-wrap"><div class="bracket">${rounds.map(rd => {
      const rm = list.filter(m => m.round === rd).sort((a, b) => a.idx - b.idx);
      return `<div class="bcol"><div class="label">${esc(stage === 'L' ? 'Round ' + rd : KT.matchLabel(rm[0], br))}</div><div class="bcol-in">${rm.map(m => bmHTML(did, m, res, m.id === liveId)).join('')}</div></div>`;
    }).join('')}</div></div>`;
  };
  let html = '';
  if (br.format === 'RR') {
    html += `<div class="grid2">${Object.keys(br.pools || {}).map(P => poolHTML(did, P, liveId)).join('')}</div>`;
    if (ms.some(m => m.stage === 'PO')) html += `<div class="card">${cols('PO', 'Playoff')}${ms.some(m => m.stage === 'B') ? `<div class="stage-h label">Bronze match</div><div class="bcol">${bmHTML(did, br.matches['PO-B'], res, liveId === 'PO-B')}</div>` : ''}</div>`;
  } else {
    html += `<div class="card">${cols('W', br.format === 'DE' ? 'Winners bracket' : 'Bracket')}${br.matches.B ? `<div class="stage-h label">Bronze match</div><div class="bcol">${bmHTML(did, br.matches.B, res, liveId === 'B')}</div>` : ''}</div>`;
    if (br.format === 'DE') {
      if (ms.some(m => m.stage === 'L')) html += `<div class="card">${cols('L', 'Repechage (losers) bracket')}</div>`;
      html += `<div class="card"><div class="stage-h label">Grand final</div><div class="bracket">${['GF', 'GF2'].filter(id => br.matches[id]).map(id => `<div class="bcol"><div class="label">${id === 'GF' ? 'Grand final' : 'Reset (if needed)'}</div>${bmHTML(did, br.matches[id], res, liveId === id)}</div>`).join('')}</div></div>`;
    }
  }
  return html;
}
function poolHTML(did, P, liveId) {
  const br = S.d.brackets[did], res = DC.res[did] || {};
  const st = KT.standings(br, P, id => res[id]);
  const ms = Object.values(br.matches).filter(m => m.stage === 'P' && m.pool === P).sort((a, b) => a.round - b.round || a.idx - b.idx);
  const adv = br.advance || 0;
  return `<div class="card stack"><div class="row between"><h3>Pool ${esc(P)}</h3>${st.complete ? (st.tie ? `<span class="chip warn">Tie</span>` : '<span class="chip ok">Complete</span>') : ''}</div>
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
      ${pl.complete ? `<div class="podium">${cell(pl.gold, 'g', 1)}${cell(pl.silver, 's', 2)}${(pl.bronze || []).map(b => cell(b, 'b', 3)).join('')}</div>` : `<div class="small muted">${br ? `${bracketState(d.id).fought} of ${bracketState(d.id).playable} matches fought.` : ''}</div>`}
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
    <div class="stat"><span class="label">Participants</span><b>${parts.length}</b><div class="small muted">${parts.filter(p => p.feePaid).length} paid</div></div>
    <div class="stat"><span class="label">Sessions</span><b>${sess.length}</b></div>
    <div class="stat"><span class="label">Attendance</span><b>${possible ? Math.round(total / possible * 100) : 0}%</b><div class="meter"><i style="width:${possible ? total / possible * 100 : 0}%"></i></div></div></div>
    <div class="card flush"><div class="card-h"><h3>Schedule</h3>${isDirector() ? '<button class="sm" data-act="tab" data-v="sessions">Edit sessions</button>' : ''}</div><div class="tw"><table><tbody>
    ${sess.map((s, i) => `<tr><td class="num small">${fmtDate(s.date)}<div class="dojo">${esc(s.start || '')}${s.end ? '–' + esc(s.end) : ''}</div></td><td><div class="name">${esc(s.title)}</div><div class="dojo">${esc(s.instructor || '')}${s.location ? ' · ' + esc(s.location) : ''}</div></td><td class="n">${att[i]}/${parts.length}</td></tr>`).join('') || '<tr><td class="muted">No sessions scheduled yet.</td></tr>'}
    </tbody></table></div></div>`;
}
function sessSort(a, b) { return String(a.date || '').localeCompare(String(b.date || '')) || String(a.start || '').localeCompare(String(b.start || '')); }
function sessionsHTML() {
  const sess = Object.values(S.d.sessions).sort(sessSort), dir = isDirector();
  return eventHeader(dir ? '<button class="primary" data-act="session-new">Add session</button>' : '') + (sess.length ? `<div class="card flush"><div class="tw"><table><thead><tr><th>When</th><th>Session</th><th>Instructor</th><th>Location</th><th class="n">Capacity</th></tr></thead><tbody>
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
