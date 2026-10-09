/* ===== v1.7: people — directors and ring managers (roster, assign like judges, invite by email) ===== */
/* Why a roster: claude.ai's people search only covers the owner's own organization, so people shared from outside
   (a personal plan's guests) never show up in it. Everyone who opens the tracker with edit access records their id in
   people/{id}; the director picks from that list. Invites: invites/{id} {email, role, eventId, ringId}; when the invited
   person opens the tracker and their email is known, the invite is applied to their account automatically. */

const ROLE_NAME = { director: 'Director of this event', manager: 'Ring manager' };
function personName(id) { const p = S.profiles[id] || {}; return p.name || (FB.on && FB.cache[id] && (FB.cache[id].name || FB.cache[id].email)) || ((S.people || {})[id] || {}).label || 'Team member'; }
function personEmail(id) { const p = S.profiles[id] || {}; return p.email || (FB.on && FB.cache[id] && FB.cache[id].email) || ''; }
/** Everyone known to the tracker: people who opened it with edit access (claude.ai) or signed in (Firebase), plus assigned ids. */
function rosterIds() {
  const ids = new Set(Object.keys(S.people || {}));
  DC.rings.forEach(r => (r.managerIds || []).forEach(i => ids.add(i)));
  directorIds().forEach(i => ids.add(i));
  if (S.myId) ids.add(S.myId);
  return [...ids];
}
/** Directors of the open event (its own list); app admins can always manage it too. */
function directorIds() { return evDirectors(curEvent()).slice(); }
function managerRing(id) { const r = DC.rings.find(x => (x.managerIds || []).includes(id)); return r ? r.id : ''; }

/* ---------- director: People tab ---------- */
function peopleHTML() {
  const ev = curEvent(), ids = rosterIds(); refreshProfiles(ids);
  const dirs = directorIds(), dset = new Set(dirs);
  const managed = new Set(DC.rings.flatMap(r => r.managerIds || []));
  const un = ids.filter(id => !dset.has(id) && !managed.has(id));
  const inv = Object.values(S.invites || {}).filter(i => i.role === 'director' || i.eventId === S.evId).sort((a, b) => String(a.email).localeCompare(String(b.email)));
  const row = (id, ctl) => `<div class="jrow2"><span class="jname" style="display:flex;flex-direction:column;min-width:0">${personChip(id)}${personEmail(id) ? `<span class="dojo">${esc(personEmail(id))}</span>` : ''}</span><span></span>${ctl}</div>`;
  const ringSel = (id, label) => `<select id="pr-${esc(id)}" class="rmove" data-change="person-ring" data-id="${esc(id)}" aria-label="Ring for ${esc(personName(id))}">${opt('', label, '')}${DC.rings.filter(r => !(r.managerIds || []).includes(id)).map(r => opt(r.id, 'Ring manager · ' + r.name, '')).join('')}${managerRing(id) ? opt('__none', 'Remove from ring', '') : ''}${!dset.has(id) ? opt('__dir', 'Make director', '') : ''}</select>`;
  const dirRow = id => row(id, id === S.myId && !isAdmin() && dirs.length < 2 ? '<span class="chip plain">You</span>' : `<button class="sm danger" data-act="dir-remove" data-id="${esc(id)}">Remove</button>`);
  const ringCards = DC.rings.map(r => `<div class="card stack"><div class="row between"><h3>${esc(r.name)}</h3><span class="chip ${(r.managerIds || []).length ? '' : 'plain'}">${plural((r.managerIds || []).length, 'manager')}</span></div>
    <div class="jlist">${(r.managerIds || []).map(id => row(id, ringSel(id, 'Move…'))).join('') || '<span class="small muted">No ring manager yet.</span>'}</div></div>`).join('');
  const where = FB.on ? 'signed in to this site' : 'opened this tracker with edit access';
  return eventHeader() + requestsHTML() + `<div class="card stack"><div class="row between"><h3>Invite by email</h3></div>
      <form id="f-invite" data-form="invite" class="fgrid">
        <label class="f span"><span>Email</span><input name="email" id="inv-email" type="email" required placeholder="name@example.com" autocomplete="off"></label>
        <label class="f"><span>Role</span><select name="role" id="inv-role" data-change="inv-role">${opt('manager', 'Ring manager', 'manager')}${opt('director', 'Director of this event', 'manager')}</select></label>
        <label class="f" id="inv-ring-f"><span>Ring</span><select name="ringId" id="inv-ring">${DC.rings.map(r => opt(r.id, r.name, '')).join('')}</select></label>
        ${!FB.on ? `<label class="f span"><span>Link to this tracker (copy it from the browser address bar on claude.ai)</span><input name="appUrl" id="inv-url" value="${esc((S.access && S.access.appUrl) || '')}" placeholder="https://claude.ai/…"></label>` : ''}
        <div class="span row"><button class="primary" type="submit">Create invite</button></div></form>
      <p class="tiny muted">${FB.on ? 'They sign in with Google using this email; the role is applied automatically when they first sign in.' : 'After creating the invite you can open it in Gmail, Outlook or your mail app, or copy it. claude.ai only lets people in whom you share the page with, so also add this email in the page’s <b>Share</b> menu as an <b>Editor</b> (ring managers need edit access to record scores). When they open the tracker they enter the invitation code from the email and get their role; you can also assign them yourself under “Not assigned” once they have opened it.'}</p>
      ${inv.length ? `<div class="label" style="margin-top:6px">Waiting for them to open it</div><div class="jlist">${inv.map(i => `<div class="jrow2"><span style="min-width:0"><b>${esc(i.email)}</b><span class="dojo">${esc(ROLE_NAME[i.role] || i.role)}${i.role === 'manager' ? ' · ' + esc(ringName(i.ringId)) : ''}${i.code ? ' · code <b>' + esc(i.code) + '</b>' : ''}</span></span><button class="sm" data-act="invite-mail" data-id="${esc(i.id)}">Send / copy</button><button class="sm danger" data-act="invite-cancel" data-id="${esc(i.id)}">Cancel</button></div>`).join('')}</div>` : ''}</div>
    <div class="grid2" style="margin-top:14px"><div class="card stack"><div class="row between"><h3>Directors of this event</h3><span class="chip">${dirs.length}</span></div><div class="jlist">${dirs.map(dirRow).join('') || '<span class="small muted">Only app admins.</span>'}</div><p class="tiny muted">Directors have full control of this event only. App admins can also open every event.</p></div>
      <div class="card stack"><div class="row between"><h3>Not assigned</h3><span class="chip ${un.length ? 'warn' : 'ok'}">${un.length}</span></div><div class="jlist">${un.map(id => row(id, ringSel(id, 'Assign…'))).join('') || `<span class="small muted">Everyone who has ${where} has a role.</span>`}</div>
        <p class="tiny muted">People appear here after they have ${where}${FB.on ? '' : ' (share the page with them as Editor first)'}.</p></div>
      ${ringCards}</div>`;
}
async function setPersonRing(id, rid) {
  for (const r of DC.rings) if ((r.managerIds || []).includes(id) && r.id !== rid) await guard(() => S.store.update(P.doc(S.evId, 'rings', r.id), { managerIds: (r.managerIds || []).filter(x => x !== id) }));
  if (rid) { const r = S.d.rings[rid]; await guard(() => S.store.update(P.doc(S.evId, 'rings', rid), { managerIds: [...new Set((r.managerIds || []).concat(id))] }), `${personName(id)} → ring manager of ${r.name}`); }
  else toast(`${personName(id)} removed from ring`);
  scheduleSync();
}
/** Director of THIS event (v1.9: per event, not app-wide). */
async function setDirector(id, on) {
  const ev = curEvent(); if (!ev) return;
  const cur = evDirectors(ev), next = on ? [...new Set(cur.concat(id))] : cur.filter(x => x !== id);
  if (!on && !next.length && !isAdmin()) { toast('An event needs at least one director.', true); return; }
  await guard(() => S.store.update(P.event(ev.id), { directorIds: next }), on ? `${personName(id)} is now a director of this event` : 'Director removed from this event');
}

/* ---------- invites ---------- */
function inviteMailto(i) { const m = inviteParts(i); return `mailto:${encodeURIComponent(m.to)}?subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`; }
function inviteParts(i) {
  const ev = S.events[i.eventId] || curEvent() || {};
  const url = FB.on ? location.origin + location.pathname : (i.appUrl || (S.access && S.access.appUrl) || '');
  const what = i.role === 'director' ? `a director of ${ev.name || 'our tournament'}` : `ring manager of ${ringName(i.ringId)} at ${ev.name || 'our tournament'}`;
  const steps = FB.on
    ? [`1. Open ${url || 'the tracker site'}`, `2. Sign in with Google using this email address (${i.email}).`, `3. You’ll be set up as ${what} automatically.`]
    : [`1. If you don’t have a Claude account yet, create a free one at https://claude.ai using this email address (${i.email}).`,
       `2. Open the tracker: ${url || '(link to follow)'}`,
       `3. If it says you don’t have access, click “Request access” — I’ll approve it.`,
       `4. In the tracker, enter your invitation code ${i.code || ''} on the Dashboard (“Have an invitation code?”) and you’ll be set up as ${what}.`];
  const subject = `Invitation: ${i.role === 'director' ? 'Director' : 'Ring manager'} — ${ev.name || 'Karate Event Tracker'}`;
  const body = [`Hello,`, ``, `You’re invited to help run ${ev.name || 'our karate tournament'} as ${what}.`, ``, ...steps, ``, `Thank you!`].join('\n');
  return { to: i.email, subject, body };
}
/* The claude.ai page runs in a sandboxed frame that may not be allowed to open the mail app by itself, so the
   invitation is shown in a sheet: copy it, or open it in the mail app / Gmail / Outlook with a deliberate tap. */
function inviteSheet(i) {
  const m = inviteParts(i), mailto = inviteMailto(i);
  const gmail = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(m.to)}&su=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
  const outlook = `https://outlook.live.com/mail/0/deeplink/compose?to=${encodeURIComponent(m.to)}&subject=${encodeURIComponent(m.subject)}&body=${encodeURIComponent(m.body)}`;
  S.inviteText = `To: ${m.to}\nSubject: ${m.subject}\n\n${m.body}`;
  openModal(sheet('Send the invitation', `<p class="small">The invite is saved${i.code ? ` (code <b>${esc(i.code)}</b>)` : ''}. Send this email to <b>${esc(m.to)}</b> — open it in your email, or copy it and paste it into any email or text message.</p>
    <div class="row" style="flex-wrap:wrap;gap:8px"><a class="btn go" id="inv-gmail" href="${esc(gmail)}" target="_blank" rel="noopener">Open in Gmail</a><a class="btn" id="inv-outlook" href="${esc(outlook)}" target="_blank" rel="noopener">Outlook</a><a class="btn" id="inv-mailto" href="${esc(mailto)}" target="_blank" rel="noopener">Mail app</a><button class="sm primary" data-act="invite-copy">Copy invitation</button></div>
    <label class="f"><span>Subject</span><input readonly id="inv-subj" value="${esc(m.subject)}" onclick="this.select()"></label>
    <label class="f"><span>Message</span><textarea readonly id="inv-body" rows="11" onclick="this.select()">${esc(m.body)}</textarea></label>
    ${FB.on ? '' : '<p class="tiny muted">Also add this email in the page’s <b>Share</b> menu as an <b>Editor</b>, with the page not shared as “Anyone with the link”, so they can open it and record scores.</p>'}`,
    '<button class="primary" data-act="modal-close">Done</button>'));
}
function copyInvite() {
  const t = S.inviteText || '';
  const fallback = () => { const b = $('#inv-body'); if (b) { b.focus(); b.select(); } toast('Select the message and copy it (Ctrl+C / ⌘C)'); };
  try { navigator.clipboard.writeText(t).then(() => toast('Invitation copied — paste it into an email'), fallback); } catch (e) { fallback(); }
}
function openMail(href) { const a = document.createElement('a'); a.href = href; a.rel = 'noopener'; document.body.appendChild(a); try { a.click(); } catch (e) { /* ignore */ } a.remove(); }
async function saveInvite(form) {
  const v = fd(form), email = String(v.email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast('Enter a valid email address.', true); return; }
  if (v.role === 'manager' && !S.d.rings[v.ringId]) { toast('Create a ring first.', true); return; }
  const i = { email, role: v.role, eventId: S.evId, ringId: v.role === 'manager' ? v.ringId : '', at: new Date().toISOString(), by: S.myId || '' };
  if (!FB.on) i.code = inviteCode(); // claude.ai never tells the page a guest's email, so the invitee enters this code
  if (!FB.on && v.appUrl) { i.appUrl = v.appUrl; if (!S.access || S.access.appUrl !== v.appUrl) await guard(() => S.store.set('meta/access', Object.assign({}, S.access || {}, { appUrl: v.appUrl }))); }
  const id = FB.on ? email : uid();
  if (!(await guard(() => S.store.set('invites/' + id, i), `Invite created for ${email}`))) return;
  form.reset();
  inviteSheet(Object.assign({ id }, i));
}
function inviteCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = '';
  try { const r = crypto.getRandomValues(new Uint8Array(6)); for (const b of r) c += A[b % A.length]; } catch (e) { for (let k = 0; k < 6; k++) c += A[Math.floor(Math.random() * A.length)]; }
  return c;
}
/** Apply invites addressed to the signed-in person (their own email), once. */
async function applyMyInvites() {
  if (S.invApplied || !S.myId || !S.myEmail || S.pub) return;
  const mine = Object.values(S.invites || {}).filter(i => String(i.email).toLowerCase() === S.myEmail);
  if (!mine.length) return;
  S.invApplied = true;
  await applyInvites(mine);
}
/** claude.ai: the invitee types the code from their email. */
async function redeemCode(code) {
  code = String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const i = Object.values(S.invites || {}).find(x => x.code && x.code === code);
  if (!i) { toast('That code doesn’t match an open invitation. Check the email, or ask the director.', true); return; }
  await applyInvites([i]);
  render();
}
/** Dashboard card for editors who have no role yet (claude.ai). */
function codeCardHTML() {
  if (FB.on || isLocal() || S.pub || !S.canEditor || isAdmin() || (S.evId && (isDirector() || myRingIds().length))) return '';
  return `<div class="card stack"><h3>Have an invitation code?</h3><p class="small muted">Enter the code from the director’s email to be set up as a ring manager or director.</p>
    <form id="f-code" data-form="code" class="row"><input name="code" id="inv-code" placeholder="e.g. K7M2QX" autocomplete="off" style="max-width:180px;text-transform:uppercase"><button class="primary" type="submit">Join</button></form></div>`;
}
async function applyInvites(list) {
  for (const i of list) {
    try {
      if (i.role === 'director' && i.eventId) {
        const ev = await S.store.get(P.event(i.eventId));
        if (ev) await S.store.update(P.event(i.eventId), { directorIds: [...new Set((ev.directorIds || []).concat(S.myId))] });
      } else if (i.eventId && i.ringId) {
        // join the event first (so its data becomes readable), then the ring
        const ev = await S.store.get(P.event(i.eventId));
        if (ev && !(ev.managerIds || []).includes(S.myId)) await S.store.update(P.event(i.eventId), { managerIds: [...new Set((ev.managerIds || []).concat(S.myId))] });
        const r = await S.store.get(P.doc(i.eventId, 'rings', i.ringId));
        if (r) await S.store.update(P.doc(i.eventId, 'rings', i.ringId), { managerIds: [...new Set((r.managerIds || []).concat(S.myId))] });
      }
      await S.store.del('invites/' + i.id);
      toast(`Welcome — you’re ${i.role === 'director' ? 'a director' : 'ring manager of ' + ((S.d.rings[i.ringId] || {}).name || 'your ring')}`);
      if (i.role === 'director' && FB.on) setTimeout(() => location.reload(), 900);
    } catch (e) { console.warn('invite', e); }
  }
}
/** Record that this person opened the tracker with edit access (claude.ai), so directors can pick them. */
async function notePresence() {
  if (FB.on || isLocal() || !S.myId || S.pub || !S.canEditor) return;
  const p = (S.people || {})[S.myId];
  if (p && p.seenAt && p.label === (S.myName || '') && Date.now() - new Date(p.seenAt).getTime() < 6 * 3600e3) return;
  // label = the name they show themselves, used only when claude.ai won't name an outside guest to the director
  try { await S.store.set('people/' + S.myId, { seenAt: new Date().toISOString(), label: S.myName || '' }); } catch (e) { /* view-only: not listed */ }
}
function recomputeDirector() {
  if (FB.on || isLocal()) return;
  const was = [S.isAdmin, S.isOrganizer].join();
  S.isAdmin = !!S.isOwnerFlag || ((S.access && S.access.admins) || []).includes(S.myId);
  S.isOrganizer = S.isAdmin || ((S.access && S.access.directors) || []).includes(S.myId);
  if (was !== [S.isAdmin, S.isOrganizer].join()) render();
}
