/* ===== v1.9: per-event access for several tournament directors ===== */
/* App admin (page owner / Firebase admin) approves tournament directors ("organizers") who may create events.
   Each event keeps directorIds (creator + people they add) and managerIds (ring managers, kept in sync).
   Everyone signed in sees the list of events; only an event's directors and ring managers (and app admins) open it,
   except while it is live (read-only). Others can request access; the event's directors approve or decline. */

function homeEventCard(e) {
  const r = eventRoleOf(e), open = canOpenEvent(e), req = (S.myReqs || {})[e.id];
  const dirNames = evDirectors(e).map(personName).filter(n => n && n !== 'Team member');
  const badge = r === 'director' ? '<span class="chip ok">Director</span>' : r === 'manager' ? '<span class="chip">Ring manager</span>' : e.live ? '<span class="chip aka">● Live</span>' : '<span class="chip plain">🔒 No access</span>';
  const body = `<div class="row"><span class="chip ${e.kind === 'tournament' ? 'aka' : ''}">${esc(KT.EVENT_KINDS[e.kind] || e.kind)}</span>${e.kind === 'tournament' && e.level ? `<span class="chip plain">${esc(e.level)}</span>` : ''}${e.demo ? '<span class="chip warn">Demo</span>' : ''}${e.archived ? '<span class="chip plain">🔒 Archived</span>' : ''}${isLocal() ? '' : badge}</div>
      <h3>${esc(e.name)}</h3>
      <div class="date">${fmtDate(e.startDate)}${e.endDate && e.endDate !== e.startDate ? ' – ' + fmtDate(e.endDate) : ''}</div>
      ${e.location ? `<div class="small muted">${esc(e.location)}</div>` : ''}
      ${!isLocal() && evDirectors(e).length ? `<div class="tiny muted">Director${evDirectors(e).length > 1 ? 's' : ''}: ${esc(dirNames.join(', ') || plural(evDirectors(e).length, 'person', 'people'))}</div>` : ''}`;
  if (open) return `<button class="card ev-card" data-act="open-event" data-id="${esc(e.id)}">${body}</button>`;
  return `<div class="card ev-card locked">${body}<div class="row" style="margin-top:8px">${!S.myId || !S.canEditor && S.store && S.store.mode === 'cloud'
    ? '<span class="tiny muted">Ask the director to share this event with you.</span>'
    : req ? '<span class="chip">Request sent</span>' : `<button class="sm primary" data-act="req-access" data-id="${esc(e.id)}">Request access</button>`}</div></div>`;
}
async function requestAccess(eid) {
  const rec = { at: new Date().toISOString(), label: S.myName || personName(S.myId) || '', email: S.myEmail || '' };
  if (await guard(() => S.store.set(P.doc(eid, 'requests', S.myId), rec), 'Request sent to the event’s directors')) {
    S.myReqs = Object.assign({}, S.myReqs, { [eid]: true }); try { localStorage.setItem('kt-reqs', JSON.stringify(S.myReqs)); } catch (e) { /* ignore */ }
    render();
  }
}
function loadMyReqs() { try { S.myReqs = JSON.parse(localStorage.getItem('kt-reqs') || '{}') || {}; } catch (e) { S.myReqs = {}; } }

/* ---------- People tab: access requests for this event ---------- */
function requestsHTML() {
  const reqs = Object.entries(S.d.requests || {});
  if (!reqs.length) return '';
  return `<div class="card stack" style="margin-bottom:14px"><div class="row between"><h3>Access requests</h3><span class="chip warn">${reqs.length}</span></div><div class="jlist">${reqs.map(([id, q]) => `<div class="jrow2"><span style="min-width:0"><b>${esc(personName(id) !== 'Team member' ? personName(id) : (q.label || 'Someone'))}</b><span class="dojo">${esc(q.email || '')} · ${esc(timeAgo(q.at))}</span></span>
    <select id="rq-${esc(id)}" class="rmove" data-change="req-approve" data-id="${esc(id)}" aria-label="Approve as">${opt('', 'Approve as…', '')}${opt('__dir', 'Director of this event', '')}${DC.rings.map(r => opt(r.id, 'Ring manager · ' + r.name, '')).join('')}</select>
    <button class="sm danger" data-act="req-decline" data-id="${esc(id)}">Decline</button></div>`).join('')}</div>
    <p class="tiny muted">${S.store && S.store.mode === 'cloud' ? 'On claude.ai the person also needs the page shared with them as Editor.' : ''}</p></div>`;
}
async function approveRequest(id, how) {
  if (how === '__dir') await setDirector(id, true); else await setPersonRing(id, how);
  await guard(() => S.store.del(P.doc(S.evId, 'requests', id)));
}

/* ---------- home: become a tournament director ---------- */
function orgRequestCardHTML() {
  if (isLocal() || S.pub || !S.myId || canCreateEvents() || (S.store && S.store.mode === 'cloud' && !S.canEditor)) return '';
  const sent = (S.orgReqs || {})[S.myId] || (S.myReqs || {}).__org;
  return `<div class="card stack" style="margin-bottom:14px"><h3>Run your own tournament</h3><p class="small muted">Approved tournament directors can create their own events. Other directors can’t open your events unless you add them.</p>
    <div>${sent ? '<span class="chip">Request sent — waiting for the app admin</span>' : '<button class="primary" data-act="org-request">Request to become a tournament director</button>'}</div></div>`;
}
async function requestOrganizer() {
  const rec = { at: new Date().toISOString(), label: S.myName || '', email: S.myEmail || '' };
  if (await guard(() => S.store.set('orgRequests/' + S.myId, rec), 'Request sent to the app admin')) {
    S.myReqs = Object.assign({}, S.myReqs, { __org: true }); try { localStorage.setItem('kt-reqs', JSON.stringify(S.myReqs)); } catch (e) { /* ignore */ }
    render();
  }
}

/* ---------- home: app admin ---------- */
function organizerIds() {
  if (FB.on) return Object.keys(S.fbRoles || {}).filter(id => (S.fbRoles[id] || {}).role === 'organizer');
  return ((S.access && S.access.directors) || []).slice();
}
function adminIds() {
  if (FB.on) return Object.keys(S.fbRoles || {}).filter(id => ['director', 'admin'].includes((S.fbRoles[id] || {}).role));
  return [...new Set([S.ownerId, ...((S.access && S.access.admins) || [])].filter(Boolean))];
}
function adminCardHTML() {
  if (isLocal() || S.pub || !isAdmin()) return '';
  const orgs = organizerIds(), admins = adminIds(), reqs = Object.entries(S.orgReqs || {});
  const known = rosterIdsGlobal().filter(id => !orgs.includes(id) && !admins.includes(id));
  refreshProfiles([...orgs, ...admins, ...known, ...reqs.map(r => r[0])]);
  const nm = id => personName(id) !== 'Team member' ? personName(id) : (((S.orgReqs || {})[id] || {}).label || 'Team member');
  return `<details class="card admin-card" open><summary><b>App admin</b> <span class="small muted">· tournament directors who may create events</span>${reqs.length ? ` <span class="chip warn">${reqs.length} request${reqs.length > 1 ? 's' : ''}</span>` : ''}</summary>
    <div class="grid2" style="margin-top:10px">
      <div class="stack"><div class="label">Requests</div>${reqs.map(([id, q]) => `<div class="jrow2"><span style="min-width:0"><b>${esc(nm(id))}</b><span class="dojo">${esc(q.email || '')} ${esc(timeAgo(q.at))}</span></span><button class="sm go" data-act="org-approve" data-id="${esc(id)}">Approve</button><button class="sm danger" data-act="org-decline" data-id="${esc(id)}">Decline</button></div>`).join('') || '<span class="small muted">No pending requests.</span>'}
        <div class="label" style="margin-top:8px">Approved tournament directors</div>${orgs.map(id => `<div class="jrow2"><span>${esc(nm(id))}</span><span></span><button class="sm danger" data-act="org-remove" data-id="${esc(id)}">Remove</button></div>`).join('') || '<span class="small muted">None yet.</span>'}
        ${known.length ? `<select id="org-add" data-change="org-add" aria-label="Approve someone as tournament director">${opt('', 'Approve someone who has opened the app…', '')}${known.map(id => opt(id, nm(id), '')).join('')}</select>` : ''}</div>
      <div class="stack"><div class="label">App admins (every event)</div>${admins.map(id => `<div class="jrow2"><span>${esc(nm(id))}</span><span></span>${id === S.ownerId || id === S.myId ? `<span class="chip plain">${id === S.ownerId ? 'Owner' : 'You'}</span>` : `<button class="sm danger" data-act="admin-remove" data-id="${esc(id)}">Remove</button>`}</div>`).join('')}
        <p class="tiny muted">App admins can open and manage every event. Tournament directors open only the events they created or were added to.</p></div></div>
    ${accessByEventHTML()}${accessByDirectorHTML()}</details>`;
}
/* ---------- app admin: who directs which event (add / remove) ---------- */
function allEventsSorted() { return Object.values(S.events).sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || ''))); }
function directorChoices(ev) {
  const cur = new Set(evDirectors(ev));
  return [...new Set([...organizerIds(), ...rosterIdsGlobal(), ...Object.values(S.events).flatMap(evDirectors)])].filter(id => id && !cur.has(id));
}
function accessByEventHTML() {
  const evs = allEventsSorted(); if (!evs.length) return '';
  refreshProfiles([...new Set(evs.flatMap(evDirectors))]);
  return `<div class="label" style="margin-top:14px">Directors by event</div>
    <div class="tw"><table class="acc"><thead><tr><th>Event</th><th>Directors</th><th></th></tr></thead><tbody>${evs.map(e => {
      const ds = evDirectors(e), ch = directorChoices(e);
      return `<tr><td><b>${esc(e.name)}</b><div class="tiny muted">${fmtDate(e.startDate)}${e.live ? ' · ● Live' : ''}</div></td>
        <td><div class="pill-list">${ds.map(id => `<span class="chip plain acc-chip">${esc(personName(id))}<button class="ghost x" data-act="evdir-remove" data-ev="${esc(e.id)}" data-id="${esc(id)}" aria-label="Remove ${esc(personName(id))} from ${esc(e.name)}">✕</button></span>`).join('') || '<span class="tiny muted">No director — only app admins</span>'}</div></td>
        <td>${ch.length ? `<select id="evdir-${esc(e.id)}" data-change="evdir-add" data-ev="${esc(e.id)}" aria-label="Add a director to ${esc(e.name)}">${opt('', 'Add director…', '')}${ch.map(id => opt(id, personName(id), '')).join('')}</select>` : ''}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}
function accessByDirectorHTML() {
  const evs = allEventsSorted(), map = {};
  for (const e of evs) for (const id of evDirectors(e)) (map[id] = map[id] || []).push(e);
  for (const id of organizerIds()) map[id] = map[id] || [];
  const ids = Object.keys(map).sort((a, b) => personName(a).localeCompare(personName(b)));
  if (!ids.length) return '';
  return `<div class="label" style="margin-top:14px">Events by director</div>
    <div class="tw"><table class="acc"><thead><tr><th>Director</th><th>Can open and manage</th></tr></thead><tbody>${ids.map(id => `<tr><td><b>${esc(personName(id))}</b>${organizerIds().includes(id) ? '<div class="tiny muted">Approved tournament director</div>' : ''}</td>
      <td>${map[id].map(e => `<span class="chip">${esc(e.name)}</span>`).join(' ') || '<span class="tiny muted">No events yet</span>'}</td></tr>`).join('')}</tbody></table></div>`;
}
async function setEventDirector(eid, id, on) {
  const e = S.events[eid]; if (!e) return;
  const cur = evDirectors(e), next = on ? [...new Set(cur.concat(id))] : cur.filter(x => x !== id);
  if (!on && !next.length && !(await confirmBox(`${e.name} will have no director — only app admins can open it. Continue?`, 'Remove', true))) return;
  await guard(() => S.store.update(P.event(eid), { directorIds: next }), on ? `${personName(id)} added as director of ${e.name}` : `${personName(id)} removed from ${e.name}`);
}
function rosterIdsGlobal() { return [...new Set([...Object.keys(S.people || {}), ...Object.keys(S.orgReqs || {})])].filter(Boolean); }
async function setOrganizer(id, on) {
  if (FB.on) await guard(() => on ? FB.fs.doc('roles/' + id).set({ role: 'organizer', at: new Date().toISOString() }) : FB.fs.doc('roles/' + id).delete(), on ? 'Approved as tournament director' : 'Removed');
  else {
    const cur = (S.access && S.access.directors) || [];
    await guard(() => S.store.set('meta/access', Object.assign({}, S.access || {}, { directors: on ? [...new Set(cur.concat(id))] : cur.filter(x => x !== id) })), on ? 'Approved as tournament director' : 'Removed');
  }
  if (on) await guard(() => S.store.del('orgRequests/' + id));
}
async function setAdmin(id, on) {
  if (FB.on) { await guard(() => on ? FB.fs.doc('roles/' + id).set({ role: 'admin', at: new Date().toISOString() }) : FB.fs.doc('roles/' + id).delete()); return; }
  const cur = (S.access && S.access.admins) || [];
  await guard(() => S.store.set('meta/access', Object.assign({}, S.access || {}, { admins: on ? [...new Set(cur.concat(id))] : cur.filter(x => x !== id) })));
}
