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
  const orgs = organizerIds().filter(id => !isBlocked(id)), admins = adminIds(), mgrs = appManagerIds(), un = unassignedIds(), bl = blockedMap(), reqs = Object.entries(S.orgReqs || {});
  refreshProfiles([...orgs, ...admins, ...mgrs, ...un, ...Object.keys(bl), ...reqs.map(r => r[0])]);
  const reqRow = ([id, q]) => isBlocked(id)
    ? `<div class="jrow2 pr">${whoHTML(id, 'Access was removed — asks to be let back in')}<div class="pctl"><button class="sm go" data-act="acc-restore" data-id="${esc(id)}">Restore access</button><button class="sm danger" data-act="org-decline" data-id="${esc(id)}">Decline</button></div></div>`
    : `<div class="jrow2 pr">${whoHTML(id, 'Wants to run tournaments · ' + timeAgo(q.at))}<div class="pctl"><button class="sm go" data-act="org-approve" data-id="${esc(id)}">Approve as director</button><button class="sm danger" data-act="org-decline" data-id="${esc(id)}">Decline</button></div></div>`;
  return `<details class="card admin-card" open><summary><b>App admin</b> <span class="small muted">· who can use the app, and in which events</span>${reqs.length ? ` <span class="chip warn">${reqs.length} request${reqs.length > 1 ? 's' : ''}</span>` : ''}</summary>
    <div class="grid2" style="margin-top:10px">
      <div class="stack">
        <div class="label">Requests</div>${reqs.map(reqRow).join('') || '<span class="small muted">No pending requests.</span>'}
        <div class="label" style="margin-top:8px">Approved tournament directors · ${orgs.length}</div>
        <div class="jlist" id="acc-directors">${orgs.map(id => `<div class="jrow2 pr" data-uid="${esc(id)}">${whoHTML(id, 'Can create events', true)}<div class="pctl">${addToEventCtl(id, 'director')}<button class="sm danger" data-act="acc-unassign" data-id="${esc(id)}" data-was="director">Remove</button></div></div>`).join('') || '<span class="small muted">None yet.</span>'}</div>
        <div class="label" style="margin-top:8px">Ring managers · ${mgrs.length}</div>
        <div class="jlist" id="acc-managers">${mgrs.map(id => `<div class="jrow2 pr" data-uid="${esc(id)}">${whoHTML(id, '', true)}<div class="pctl">${addToEventCtl(id, 'manager')}<button class="sm danger" data-act="acc-unassign" data-id="${esc(id)}" data-was="manager">Remove</button></div></div>`).join('') || '<span class="small muted">None yet — invite ring managers below, or a director adds people on an event’s People tab.</span>'}</div>
      </div>
      <div class="stack">
        <div class="label">Not assigned · ${un.length}</div>
        <div class="jlist" id="acc-unassigned">${un.map(id => `<div class="jrow2 pr" data-uid="${esc(id)}">${whoHTML(id, 'Signed in · no role')}<div class="pctl"><button class="sm go" data-act="acc-make" data-id="${esc(id)}" data-role="director">Make director</button><button class="sm" data-act="acc-make" data-id="${esc(id)}" data-role="manager">Make ring manager</button><button class="sm danger" data-act="acc-revoke" data-id="${esc(id)}" title="Revoke access to the app">✕ Remove access</button></div></div>`).join('') || '<span class="small muted">Everyone who has signed in has a role.</span>'}</div>
        <p class="tiny muted">People removed as director or ring manager land here. <b>✕ Remove access</b> takes away their access to the app until they ask again (they see a “Request access” button).</p>
        <div class="label" style="margin-top:8px">Access removed · ${Object.keys(bl).length}</div>
        <div class="jlist" id="acc-removed">${Object.entries(bl).map(([id, b]) => `<div class="jrow2 pr" data-uid="${esc(id)}">${whoHTML(id, 'Removed ' + (b.at ? fmtDate(String(b.at).slice(0, 10)) : ''), false, b)}<div class="pctl"><button class="sm" data-act="acc-restore" data-id="${esc(id)}">Restore</button></div></div>`).join('') || '<span class="small muted">Nobody.</span>'}</div>
        ${!FB.on ? '<p class="tiny muted">On claude.ai, also remove them from the page’s <b>Share</b> menu — the app hides everything from them, but claude.ai decides who can open the page.</p>' : ''}
        <div class="label" style="margin-top:8px">App admins (every event)</div>${admins.map(id => `<div class="jrow2 pr">${whoHTML(id, '')}<div class="pctl">${id === S.ownerId || id === S.myId ? `<span class="chip plain">${id === S.ownerId ? 'Owner' : 'You'}</span>` : `<button class="sm danger" data-act="admin-remove" data-id="${esc(id)}">Remove</button>`}</div></div>`).join('')}
        <p class="tiny muted">App admins can open and manage every event. Tournament directors open only the events they created or were added to.</p></div></div>
    ${appInviteHTML()}${accessByEventHTML()}${accessByDirectorHTML()}</details>`;
}
/* ---------- v1.21: people at app level — names with emails; unassign; revoke / restore access ---------- */
function userEmail(id) { const b = blockedMap()[id] || {}; return personEmail(id) || ((S.people || {})[id] || {}).email || ((S.orgReqs || {})[id] || {}).email || b.email || ''; }
function userName(id) { const n = personName(id); return n !== 'Team member' ? n : (((S.orgReqs || {})[id] || {}).label || (blockedMap()[id] || {}).name || userEmail(id) || 'Team member'); }
/** name + email (+ a note, + the events they are in) */
function whoHTML(id, note, withEvents, rec) {
  const e = userEmail(id) || (rec && rec.email) || '';
  const evs = withEvents ? Object.values(S.events).filter(x => evDirectors(x).includes(id) || (x.managerIds || []).includes(id) || (x.staffIds || []).includes(id)) : [];
  return `<span class="jname" style="display:flex;flex-direction:column;min-width:0"><span class="who-line"><b>${esc(userName(id))}</b>${e ? ` <span class="who-mail">${esc(e)}</span>` : ''}</span>${note ? `<span class="dojo">${esc(note)}</span>` : ''}${evs.length ? `<span class="pill-list" style="margin-top:4px">${evs.map(x => `<span class="chip ${evDirectors(x).includes(id) ? '' : 'plain'}">${esc(x.name)} · ${evDirectors(x).includes(id) ? 'Director' : 'Ring manager'}</span>`).join(' ')}</span>` : ''}</span>`;
}
function addToEventCtl(id, role) {
  const evs = allEventsSorted().filter(e => !e.locked); if (!evs.length) return '';
  return `<select id="ae-ev-${esc(id)}" aria-label="Event for ${esc(userName(id))}">${evs.map(e => opt(e.id, e.name, '')).join('')}</select><select id="ae-role-${esc(id)}" aria-label="Role">${opt('manager', 'as Ring manager', role)}${opt('director', 'as Director', role)}</select><button class="sm go" data-act="app-add-event" data-id="${esc(id)}">Add to event</button>`;
}
function accessDoc() { return S.access || {}; }
function blockedMap() { return FB.on ? (S.blockedUsers || {}) : Object.fromEntries((accessDoc().blocked || []).map(b => [b.id, b])); }
function isBlocked(id) { return !!blockedMap()[id]; }
/** Ring managers known to the app: invited as ring manager, made one by the admin, or managing in any event — unless unassigned. */
function appManagerIds() {
  const un = new Set(accessDoc().unassigned || []), adm = new Set(adminIds()), org = new Set(organizerIds());
  const ids = new Set([...(accessDoc().managers || []), ...Object.entries(S.people || {}).filter(([, p]) => p && p.invitedAs === 'manager').map(([k]) => k),
    ...Object.values(S.events).flatMap(e => [...(e.managerIds || []), ...(e.staffIds || [])])]);
  return [...ids].filter(id => id && !un.has(id) && !adm.has(id) && !org.has(id) && !isBlocked(id)).sort((a, b) => userName(a).localeCompare(userName(b)));
}
function unassignedIds() {
  const taken = new Set([...adminIds(), ...organizerIds(), ...appManagerIds(), ...Object.keys(S.orgReqs || {})]);
  return [...new Set([...Object.keys(S.people || {}), ...(accessDoc().unassigned || [])])].filter(id => id && !taken.has(id) && !isBlocked(id) && id !== S.myId).sort((a, b) => userName(a).localeCompare(userName(b)));
}
async function saveAccess(patch) { const next = Object.assign({}, accessDoc(), patch); S.access = next; return guard(() => S.store.set('meta/access', next)); }
/** One-shot read of a collection through the store's watch. */
function colOnce(col) { return new Promise(res => { let off = null, done = false; try { off = S.store.watch(col, o => { if (done) return; done = true; res(o || {}); setTimeout(() => { try { if (typeof off === 'function') off(); } catch (e) { /* ignore */ } }, 0); }, () => { if (!done) { done = true; res({}); } }); } catch (e) { res({}); } }); }
/** Take someone out of events: directors only ('director'), or every role ('all' — director, ring manager, staff, rings). */
async function stripFromEvents(id, what) {
  for (const e of Object.values(S.events)) {
    const up = {};
    if ((e.directorIds || []).includes(id)) up.directorIds = e.directorIds.filter(x => x !== id);
    if (what === 'all') {
      if ((e.managerIds || []).includes(id)) up.managerIds = e.managerIds.filter(x => x !== id);
      if ((e.staffIds || []).includes(id)) up.staffIds = e.staffIds.filter(x => x !== id);
      if (up.managerIds) {
        const rings = await colOnce(P.col(e.id, 'rings'));
        for (const [rid, r] of Object.entries(rings)) if ((r.managerIds || []).includes(id)) await guard(() => S.store.update(P.doc(e.id, 'rings', rid), { managerIds: r.managerIds.filter(x => x !== id) }));
      }
    }
    if (Object.keys(up).length) await guard(() => S.store.update(P.event(e.id), up));
  }
}
/** Remove as tournament director / ring manager → "Not assigned". */
async function unassignUser(id, was) {
  const who = userName(id);
  const msg = was === 'director' ? `Remove ${who} as tournament director? They can no longer create events and are removed as director from every event (their events stay).` : `Remove ${who} as ring manager? They are taken out of every event and ring.`;
  if (!(await confirmBox(msg + ' They move to “Not assigned”.', 'Remove', true))) return;
  if (was === 'director') { if (organizerIds().includes(id)) await setOrganizer(id, false); await stripFromEvents(id, 'director'); }
  else await stripFromEvents(id, 'all');
  const a = accessDoc();
  await saveAccess({ unassigned: [...new Set((a.unassigned || []).concat(id))], managers: (a.managers || []).filter(x => x !== id) });
  toast(`${who} moved to Not assigned`); render();
}
/** From "Not assigned": make tournament director or ring manager. */
async function makeRole(id, role) {
  const a = accessDoc(), base = { unassigned: (a.unassigned || []).filter(x => x !== id) };
  if (role === 'director') { await saveAccess(base); await setOrganizer(id, true); toast(`${userName(id)} is a tournament director`); }
  else { await saveAccess(Object.assign(base, { managers: [...new Set((a.managers || []).concat(id))] })); toast(`${userName(id)} is a ring manager — add them to an event`); }
  render();
}
/** Revoke app access (until they ask again). */
async function revokeUser(id) {
  const who = userName(id), email = userEmail(id);
  if (!(await confirmBox(`Remove ${who}${email ? ' (' + email + ')' : ''}’s access to the app? They are taken out of every event and see only a “Request access” button until you restore them.`, 'Remove access', true))) return;
  await stripFromEvents(id, 'all');
  const rec = { id, name: who, email, at: new Date().toISOString(), by: S.myId || '' };
  const a = accessDoc();
  if (FB.on) {
    if ((S.fbRoles || {})[id]) await guard(() => FB.fs.doc('roles/' + id).delete());
    await guard(() => S.store.set('blocked/' + id, rec));
    S.blockedUsers = Object.assign({}, S.blockedUsers, { [id]: rec });
    await saveAccess({ unassigned: (a.unassigned || []).filter(x => x !== id), managers: (a.managers || []).filter(x => x !== id) });
  } else {
    await saveAccess({ blocked: (a.blocked || []).filter(b => b.id !== id).concat(rec), unassigned: (a.unassigned || []).filter(x => x !== id), managers: (a.managers || []).filter(x => x !== id), directors: (a.directors || []).filter(x => x !== id), admins: (a.admins || []).filter(x => x !== id) });
  }
  toast(`${who}’s access removed`); render();
}
/** Let someone back in (after they asked, or from the Access removed list) → "Not assigned". */
async function restoreUser(id) {
  const a = accessDoc();
  if (FB.on) { await guard(() => S.store.del('blocked/' + id)); if (S.blockedUsers) { S.blockedUsers = Object.assign({}, S.blockedUsers); delete S.blockedUsers[id]; } await saveAccess({ unassigned: [...new Set((a.unassigned || []).concat(id))] }); }
  else await saveAccess({ blocked: (a.blocked || []).filter(b => b.id !== id), unassigned: [...new Set((a.unassigned || []).concat(id))] });
  try { await S.store.del('orgRequests/' + id); } catch (e) { /* none */ }
  toast(`${userName(id)} can use the app again — give them a role`); render();
}
/** What a person whose access was removed sees. */
function blockedHTML() {
  const sent = (S.myReqs || {}).__org;
  return `<div class="card empty" style="margin-top:40px" id="blocked-card"><div class="mark-lg"></div><h2>Your access was removed</h2>
    <p class="muted" style="max-width:52ch">The app admin removed your access to the Karate Event Tracker. You can ask to be let back in.</p>
    ${sent ? '<span class="chip">Request sent — waiting for the app admin</span>' : '<button class="primary" data-act="org-request">Request access</button>'}</div>`;
}
/* ---------- v1.20: invite people to the app by email, then add them to events ---------- */
function appInviteHTML() {
  const pend = Object.entries(S.invites || {}).filter(([, i]) => i && i.scope === 'app').sort((a, b) => String(a[1].email).localeCompare(String(b[1].email)));
  const evs = allEventsSorted().filter(e => !e.locked);
  const roleName = r => r === 'organizer' || r === 'director' ? 'Tournament director' : 'Ring manager';
  const where = id => evs.filter(e => evDirectors(e).includes(id) || (e.managerIds || []).includes(id) || (e.staffIds || []).includes(id))
    .map(e => `<span class="chip ${evDirectors(e).includes(id) ? '' : 'plain'}">${esc(e.name)} · ${evDirectors(e).includes(id) ? 'Director' : 'Ring manager'}</span>`).join(' ');
  return `<div class="label" style="margin-top:14px">Invite people to the app</div>
    <form id="f-app-invite" data-form="app-invite" class="fgrid" style="margin-top:6px">
      <label class="f span"><span>Email</span><input name="email" id="ai-email" type="email" required placeholder="name@example.com" autocomplete="off"></label>
      <label class="f"><span>Invite as</span><select name="role" id="ai-role">${opt('organizer', 'Tournament director (can create events)', 'organizer')}${opt('member', 'Ring manager (added to events by a director)', 'organizer')}</select></label>
      <div class="row" style="align-items:flex-end"><button class="primary" type="submit">Create invite</button></div></form>
    <p class="tiny muted">${FB.on ? 'They sign in with this email — Google for Gmail/Google accounts, any other address with email + a password they set via “First time? Set a password”; the invitation is accepted on their first sign-in.' : 'They enter the invitation code from the email to accept. Also add their email in the page’s Share menu as an Editor.'} Once accepted they appear above as tournament director or ring manager — add them to an event there, or a director adds them on the event’s People tab.</p>
    ${pend.length ? `<div class="label" style="margin-top:8px">Waiting to be accepted</div><div class="jlist">${pend.map(([k, i]) => `<div class="jrow2"><span style="min-width:0"><b>${esc(i.email)}</b><span class="dojo">${roleName(i.role)}${i.code ? ' · code <b>' + esc(i.code) + '</b>' : ''} · ${esc(timeAgo(i.at))}</span></span><button class="sm" data-act="invite-mail" data-id="${esc(k)}">Send / copy</button><button class="sm danger" data-act="invite-cancel" data-id="${esc(k)}">Cancel</button></div>`).join('')}</div>` : ''}
`;
}
/** Admin adds an accepted person to an event: director → directorIds; ring manager → event staff (the event's director picks the ring). */
async function addToEvent(id, eid, role) {
  const e = S.events[eid]; if (!e || !id) return;
  if (role === 'director') { await setEventDirector(eid, id, true); return; }
  await guard(() => S.store.update(P.event(eid), { staffIds: [...new Set((e.staffIds || []).concat(id))] }), `${personName(id)} added to ${e.name} — the director assigns the ring on the People tab`);
  if ((accessDoc().unassigned || []).includes(id)) await saveAccess({ unassigned: accessDoc().unassigned.filter(x => x !== id) });
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
  if (on) { await guard(() => S.store.del('orgRequests/' + id)); if ((accessDoc().unassigned || []).includes(id)) await saveAccess({ unassigned: accessDoc().unassigned.filter(x => x !== id) }); }
}
async function setAdmin(id, on) {
  if (FB.on) { await guard(() => on ? FB.fs.doc('roles/' + id).set({ role: 'admin', at: new Date().toISOString() }) : FB.fs.doc('roles/' + id).delete()); return; }
  const cur = (S.access && S.access.admins) || [];
  await guard(() => S.store.set('meta/access', Object.assign({}, S.access || {}, { admins: on ? [...new Set(cur.concat(id))] : cur.filter(x => x !== id) })));
}
