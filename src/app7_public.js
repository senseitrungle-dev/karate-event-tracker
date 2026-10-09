/* ===== v1.6: public spectator link per event ===== */
/* A director turns on a public link for one event. The link carries a random token (share/{token} → eventId).
   Opening it drops the visitor straight into that event's Dashboard as a spectator: no sign-in, no event list,
   no other events. Firestore rules let anyone read a shared event's data (never pv/ private details) and nothing else. */

function parsePublic() {
  let tok = '';
  try {
    const h = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    const q = new URLSearchParams(String(location.search || ''));
    tok = h.get('watch') || q.get('watch') || '';
  } catch (e) { tok = ''; }
  tok = tok.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  if (tok) S.pub = { token: tok, evId: '', error: '' };
}
const isPublicView = () => !!S.pub;
function newShareToken() {
  try { return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''); }
  catch (e) { return uid() + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2); }
}
/** Address of the public page for a token, or '' where this copy of the app cannot hand out an anonymous link. */
function publicLink(token) {
  if (!token || !S.store) return '';
  if (S.store.mode === 'cloud') return ''; // claude.ai: signed-out visitors get no data, and the page address is the claude.ai one
  let base = '';
  try { base = location.origin && location.origin !== 'null' ? location.origin + location.pathname : location.href.split('#')[0].split('?')[0]; } catch (e) { base = ''; }
  return base ? `${base}#watch=${token}` : '';
}
async function startPublic() {
  watchBranding();
  let sh = null;
  try { sh = await S.store.get('share/' + S.pub.token); } catch (e) { sh = null; }
  if (!sh || !sh.eventId) { S.pub.error = 'This link is not valid, or the event is no longer shared publicly.'; S.loadedEvents = true; render(); return; }
  S.pub.evId = sh.eventId;
  const id = sh.eventId;
  S.pubUnsub = S.store.watchDoc(P.event(id), d => {
    if (!d || !d.public || d.shareToken !== S.pub.token) { S.events = {}; S.pub.error = 'This event is no longer shared publicly.'; if (S.evId) { S.unsub.forEach(u => { try { u(); } catch (e) { /* ignore */ } }); S.unsub = []; S.evId = null; } }
    else { S.events = { [id]: Object.assign({}, d, { id }) }; S.pub.error = ''; if (S.evId !== id) openEvent(id); }
    S.loadedEvents = true; render();
  }, e => { S.pub.error = 'This event is not shared publicly.'; S.loadedEvents = true; render(); dbErr(e); });
}
function publicMissingHTML() {
  return `<div class="card empty" style="margin-top:40px"><div class="mark-lg"></div><h2>${S.pub.error ? 'Event not available' : 'Opening the event…'}</h2><p class="muted" style="max-width:48ch">${esc(S.pub.error || 'Loading the live results.')}</p></div>`;
}

/* ---------- director: share card on the Dashboard ---------- */
function shareCardHTML() {
  const ev = curEvent(); if (!ev || !isDirector() || isPublicView()) return '';
  const on = !!(ev.public && ev.shareToken), link = on ? publicLink(ev.shareToken) : '';
  let body;
  if (!on) body = `<p class="small muted">Give spectators a link to this event only: they open it straight into this event (Dashboard, Follow, Rings, Divisions, brackets and results) without signing in, and cannot see any other event. Private details (date of birth, contacts) are never shared.</p><div><button class="primary" data-act="share-on">Create public link</button></div>`;
  else if (link) body = `<div class="share-link"><input id="share-url" readonly value="${esc(link)}" aria-label="Public link" onclick="this.select()"><button class="sm primary" data-act="share-copy">Copy</button><a class="btn sm" href="${esc(link)}" target="_blank" rel="noopener">Open</a></div>
    <p class="tiny muted">Anyone with this link can watch this event without signing in. Stop sharing to turn the link off; a new link is created if you share again.</p><div><button class="sm danger" data-act="share-off">Stop sharing</button></div>`;
  else body = `<p class="small">Public sharing is on for this event, but this copy of the app cannot hand out a sign-in-free link: on claude.ai, visitors who aren't signed in get no data. Use the Vercel + Firebase site for public spectator links.</p><div><button class="sm danger" data-act="share-off">Stop sharing</button></div>`;
  return `<div class="card stack share-card"><div class="row between"><h3>Public spectator link</h3><span class="chip ${on ? 'ok' : 'plain'}">${on ? 'Shared' : 'Off'}</span></div>${body}</div>`;
}
async function shareOn() {
  const ev = curEvent(); if (!ev) return;
  const token = newShareToken();
  if (!(await guard(() => S.store.set('share/' + token, { eventId: ev.id, at: new Date().toISOString() })))) return;
  if (ev.shareToken && ev.shareToken !== token) await guard(() => S.store.del('share/' + ev.shareToken));
  await guard(() => S.store.update(P.event(ev.id), { public: true, shareToken: token }), 'Public link created');
}
async function shareOff() {
  const ev = curEvent(); if (!ev) return;
  if (!(await confirmBox('Stop sharing this event? The public link stops working.', 'Stop sharing', true))) return;
  await guard(() => S.store.update(P.event(ev.id), { public: false, shareToken: '' }), 'Public link turned off');
  if (ev.shareToken) await guard(() => S.store.del('share/' + ev.shareToken));
}
function shareCopy() {
  const t = $('#share-url'); if (!t) return;
  try { navigator.clipboard.writeText(t.value).then(() => toast('Link copied'), () => { t.select(); toast('Press Ctrl+C / ⌘C to copy'); }); } catch (e) { t.select(); }
}

/* ---------- spectator views: Rings and Divisions ---------- */
function viewerRingsHTML() {
  if (!DC.rings.length) return eventHeader() + '<div class="card small muted">No rings set up yet.</div>';
  const cards = DC.rings.map(r => {
    const items = [];
    for (const dv of DC.divs) {
      if (!divEntrants(dv.id).length) continue;
      const br = S.d.brackets[dv.id], segs = KT.segList(br);
      if (dv.ringId === r.id) {
        const away = segs.filter(s => KT.ringOf(dv, s.seg) !== r.id).map(s => `${SEG_LABEL(s.seg)} → ${ringName(KT.ringOf(dv, s.seg))}`);
        items.push({ o: dv.ringOrder || 0, h: `<div class="vrow" data-act="view-bracket" data-id="${esc(dv.id)}" role="button" tabindex="0"><span class="name">${esc(dv.name)}</span><span class="tiny muted">${plural(divEntrants(dv.id).length, 'entrant')}${away.length ? ' · ' + esc(away.join(' · ')) : ''}</span>${divStatusChip(dv.id)}</div>` });
      } else {
        const here = segs.filter(s => KT.ringOf(dv, s.seg) === r.id);
        if (here.length) items.push({ o: 1000 + (dv.ringOrder || 0), h: `<div class="vrow guest" data-act="view-bracket" data-id="${esc(dv.id)}" role="button" tabindex="0"><span class="name">${esc(dv.name)} · ${esc(here.map(s => s.label).join(', '))}</span><span class="tiny muted">Division based on ${esc(ringName(dv.ringId))}</span>${divStatusChip(dv.id)}</div>` });
      }
    }
    items.sort((a, b) => a.o - b.o);
    return `<div class="stack">${ringBoardHTML([r], false)}<div class="card flush"><div class="card-h"><h3>On ${esc(r.name)}</h3><span class="tiny muted">Tap a division for its bracket</span></div><div class="vlist">${items.map(x => x.h).join('') || '<div class="small muted" style="padding:12px 16px">No divisions yet.</div>'}</div></div></div>`;
  }).join('');
  return eventHeader() + `<div class="grid2">${cards}</div>`;
}
function divStatusChip(did) {
  const bs = bracketState(did);
  return !bs.drawn ? '<span class="chip plain">Not drawn</span>' : bs.complete ? '<span class="chip ok">Finished</span>' : `<span class="chip">${bs.fought}/${bs.playable}</span>`;
}
function viewerDivisionsHTML() {
  const q = (S.ui.dq || '').trim().toLowerCase();
  const divs = DC.divs.filter(d => divEntrants(d.id).length && (!q || d.name.toLowerCase().includes(q)));
  const rows = divs.map(dv => {
    const br = S.d.brackets[dv.id], segs = KT.segList(br).filter(s => s.seg.startsWith('P:'));
    const pools = segs.map(s => `<span class="chip ring-chip">${esc(s.label)} · ${esc(ringName(KT.ringOf(dv, s.seg)))}</span>`).join('');
    return `<div class="vrow" data-act="view-bracket" data-id="${esc(dv.id)}" role="button" tabindex="0"><span class="name">${esc(dv.name)}</span>
      <span class="tiny muted">${plural(divEntrants(dv.id).length, 'entrant')} · ${esc(KT.FORMATS[dv.format] || dv.format || '')}${S.d.rings[dv.ringId] ? ' · ' + esc(ringName(dv.ringId)) : ''}</span>
      ${pools ? `<span class="pill-list">${pools}</span>` : ''}${divStatusChip(dv.id)}</div>`;
  }).join('');
  return eventHeader() + `<div class="section-h"><input id="div-q" class="search" type="search" placeholder="Find a division…" value="${esc(S.ui.dq || '')}" data-input="dq" aria-label="Find a division"></div>
    <div class="card flush"><div class="vlist">${rows || '<div class="small muted" style="padding:12px 16px">No divisions with competitors yet.</div>'}</div></div>`;
}

/* ===== v1.8: Go live / End live ===== */
/* Before the tournament starts the director sees a readiness checklist (setup, competitors and judges checked in,
   rings with managers and helpers confirmed ready). "Go live" publishes the event (public spectator link on the
   Vercel + Firebase site) and marks it live; "End live" shuts the public link off when the tournament is complete. */
function ringsInUse() {
  const ids = new Set();
  for (const dv of DC.divs) { if (!divEntrants(dv.id).length) continue; [dv.ringId, ...Object.values(dv.segRings || {})].forEach(r => { if (S.d.rings[r]) ids.add(r); }); }
  return DC.rings.filter(r => ids.has(r.id));
}
/** Officials a ring needs at once: the largest panel among the divisions it runs (kata judges, or 6 for kumite). */
function ringNeed(rid) {
  let n = 0;
  for (const dv of DC.divs) {
    if (!divEntrants(dv.id).length) continue;
    const rings = new Set([dv.ringId, ...Object.values(dv.segRings || {})]); if (!rings.has(rid)) continue;
    const k = kindOf(dv); n = Math.max(n, k === 'kata' ? (scoringOf(dv).judges || 5) : k === 'fukugo' ? 6 : 6);
  }
  return n;
}
function liveChecks() {
  const out = [], add = (ok, label, detail, tab, hard) => out.push({ ok, label, detail, tab, hard: hard !== false });
  const withEnt = DC.divs.filter(d => divEntrants(d.id).length);
  const undrawn = withEnt.filter(d => !S.d.brackets[d.id]);
  add(withEnt.length > 0 && !undrawn.length, 'Event set up — every division with competitors is drawn', undrawn.length ? `${plural(undrawn.length, 'division')} not drawn yet` : `${plural(withEnt.length, 'division')} drawn`, 'divisions');
  const noRing = withEnt.filter(d => !S.d.rings[d.ringId]);
  add(DC.rings.length > 0 && !noRing.length, 'Every division is on a ring', noRing.length ? `${plural(noRing.length, 'division')} without a ring` : `${plural(ringsInUse().length, 'ring')} in use`, 'rings');
  const act = DC.comps.filter(c => c.status !== 'withdrawn'), notIn = act.filter(c => !c.checkedIn);
  add(act.length > 0 && !notIn.length, 'All competitors checked in', notIn.length ? `${notIn.length} of ${act.length} not checked in (mark no-shows as withdrawn)` : `${act.length} checked in`, 'competitors');
  const onRing = judgesList().filter(j => S.d.rings[j.ringId]), jOut = onRing.filter(j => !j.checkedIn);
  add(onRing.length > 0 && !jOut.length, 'All judges checked in', jOut.length ? `${jOut.length} of ${onRing.length} judges on rings not checked in` : `${onRing.length} judges checked in`, 'judges');
  const short = ringsInUse().filter(r => ringJudges(r.id).filter(j => j.checkedIn).length < ringNeed(r.id));
  add(!short.length, 'Each ring has a full judging panel', short.length ? short.map(r => `${r.name}: ${ringJudges(r.id).filter(j => j.checkedIn).length}/${ringNeed(r.id)}`).join(' · ') : 'Enough checked-in judges on every ring', 'judges', KT.judgeNeed(curEvent().level) >= 3);
  const noMgr = ringsInUse().filter(r => !(r.managerIds || []).length);
  add(!noMgr.length, 'Every ring has a ring manager', noMgr.length ? noMgr.map(r => r.name).join(', ') + ' without a manager' : 'All rings staffed', 'rings');
  const notReady = ringsInUse().filter(r => !(S.d.ringready[r.id] || {}).ready);
  add(!notReady.length, 'Rings, managers and helpers ready', notReady.length ? notReady.map(r => r.name).join(', ') + ' not confirmed ready' : 'All rings confirmed ready', 'mat');
  return out;
}
function liveCardHTML() {
  const ev = curEvent(); if (!ev || !isDirector() || isPublicView() || ev.kind !== 'tournament') return '';
  if (ev.live) {
    const link = ev.public && ev.shareToken ? publicLink(ev.shareToken) : '';
    const bs = DC.divs.filter(d => S.d.brackets[d.id]).map(d => bracketState(d.id)), done = bs.length && bs.every(b => b.complete);
    return `<div class="card stack live-card2"><div class="row between"><h3>Tournament is live</h3><span class="chip aka">● Live${ev.liveAt ? ' since ' + esc(new Date(ev.liveAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })) : ''}</span></div>
      ${link ? `<div class="share-link"><input id="share-url" readonly value="${esc(link)}" aria-label="Public link" onclick="this.select()"><button class="sm primary" data-act="share-copy">Copy link</button><a class="btn go" id="share-open" href="${esc(link)}" target="_blank" rel="noopener">Open public page</a></div>
        <p class="tiny muted">Spectators open this link without signing in and see only this event.</p>`
        : `<p class="small muted">${S.store && S.store.mode === 'cloud' ? 'On claude.ai the event is live for the people you shared the page with. A public link for spectators without an account is created when you go live on the Vercel + Firebase site.' : 'Public link unavailable here.'}</p>`}
      <div class="row"><span class="small ${done ? '' : 'muted'}" style="margin-right:auto">${done ? 'Every division is finished.' : 'End live when the tournament is complete.'}</span><button class="${done ? 'danger primary' : 'danger'}" data-act="live-end">End live</button></div></div>`;
  }
  const checks = liveChecks(), hardOk = checks.every(c => c.ok || !c.hard);
  return `<div class="card stack"><div class="row between"><h3>Ready to go live?</h3><span class="chip ${hardOk ? 'ok' : 'warn'}">${checks.filter(c => c.ok).length}/${checks.length}</span></div>
    <ul class="checks">${checks.map(c => `<li class="${c.ok ? 'ok' : c.hard ? 'no' : 'adv'}"><span class="ck">${c.ok ? '✓' : c.hard ? '✗' : '!'}</span><span><b>${esc(c.label)}</b><span class="tiny muted">${esc(c.detail)}</span></span>${c.ok ? '' : `<button class="sm" data-act="tab" data-v="${c.tab}">Open</button>`}</li>`).join('')}</ul>
    <div class="row"><button class="go" data-act="live-go" ${hardOk ? '' : 'disabled'}>Go live</button>${hardOk ? '' : '<button class="sm ghost" data-act="live-go" data-force="1">Go live anyway…</button>'}
    <span class="tiny muted">${S.store && S.store.mode === 'cloud' ? 'Public spectator links need the Vercel + Firebase site.' : 'Going live publishes a link spectators can open without signing in.'}</span></div>
    ${ev.endedAt ? `<p class="tiny muted">Live ended ${esc(new Date(ev.endedAt).toLocaleString())}.</p>` : ''}</div>`;
}
async function goLive(force) {
  const ev = curEvent(); if (!ev) return;
  const open = liveChecks().filter(c => !c.ok && c.hard);
  if (open.length && !(force && (await confirmBox(`Not everything is ready:\n• ${open.map(c => c.label).join('\n• ')}\nGo live anyway?`, 'Go live anyway')))) return;
  if (!force && !(await confirmBox('Go live now? Spectators can follow the tournament as it happens.', 'Go live'))) return;
  const up = { live: true, liveAt: new Date().toISOString(), endedAt: '' };
  if (S.store.mode !== 'cloud') {
    const token = ev.shareToken || newShareToken();
    if (!ev.shareToken && !(await guard(() => S.store.set('share/' + token, { eventId: ev.id, at: up.liveAt })))) return;
    Object.assign(up, { public: true, shareToken: token });
  }
  await guard(() => S.store.update(P.event(ev.id), up), 'The tournament is live');
}
async function endLive() {
  const ev = curEvent(); if (!ev) return;
  const bs = DC.divs.filter(d => S.d.brackets[d.id]).map(d => bracketState(d.id)), done = bs.length && bs.every(b => b.complete);
  if (!(await confirmBox(done ? 'End live? The public link stops working; results stay in the tracker.' : 'Some divisions are not finished. End live anyway? The public link stops working.', 'End live', true))) return;
  await guard(() => S.store.update(P.event(ev.id), { live: false, public: false, shareToken: '', endedAt: new Date().toISOString() }), 'Live ended');
  if (ev.shareToken) await guard(() => S.store.del('share/' + ev.shareToken));
}
/* ---------- ring readiness (ring manager or director) ---------- */
function ringReadyHTML(r) {
  const ev = curEvent(); if (!ev || ev.live || isPublicView()) return '';
  const can = isDirector() || (role() === 'manager' && myRingIds().includes(r.id)); if (!can) return '';
  const rr = S.d.ringready[r.id] || {};
  const nJ = ringJudges(r.id).filter(j => j.checkedIn).length, need = ringNeed(r.id);
  return `<div class="ready-box ${rr.ready ? 'on' : ''}"><div class="row between"><b>Before the start</b>${rr.ready ? '<span class="chip ok">Ready</span>' : '<span class="chip warn">Not ready</span>'}</div>
    <div class="tiny muted">Judges checked in ${nJ}/${need || '—'} · Manager ${(r.managerIds || []).length ? '✓' : '—'}</div>
    <label class="f"><span>Helpers (scorekeeper, timekeeper…)</span><input id="helpers-${esc(r.id)}" data-change="ring-helpers" data-ring="${esc(r.id)}" value="${esc(rr.helpers || '')}" placeholder="Names"></label>
    <button class="sm ${rr.ready ? '' : 'go'}" data-act="ring-ready" data-ring="${esc(r.id)}">${rr.ready ? 'Mark not ready' : 'Ring is ready'}</button></div>`;
}
async function setRingReady(rid, patch) {
  const cur = S.d.ringready[rid] || {};
  await guard(() => S.store.set(P.live(S.evId, 'ringready', rid), Object.assign({}, cur, patch, { at: new Date().toISOString(), by: S.myId || '' })));
}

/* ===== v1.11: approve results, lock and archive ===== */
/* When the tournament is complete the event director approves the results: the event is locked (read-only for
   everyone, enforced by Firestore rules on the Vercel site) and moved to the archive, out of the Home list.
   An event director or app admin can reopen it if a correction is needed. */
function eventComplete() {
  const bs = DC.divs.filter(d => S.d.brackets[d.id]).map(d => bracketState(d.id));
  const undrawn = DC.divs.filter(d => divEntrants(d.id).length >= 2 && !S.d.brackets[d.id]).length;
  return { done: bs.length > 0 && bs.every(b => b.complete) && !undrawn, unfinished: bs.filter(b => !b.complete).length + undrawn };
}
function archiveCardHTML() {
  const ev = curEvent(); if (!ev || isPublicView() || ev.locked || !isEventDirector(ev)) return '';
  if (ev.kind === 'tournament' && ev.live) return '';
  const c = ev.kind === 'tournament' ? eventComplete() : { done: true, unfinished: 0 };
  const started = Object.keys(S.d.brackets).length > 0 || ev.kind !== 'tournament';
  if (!started && !ev.endedAt) return '';
  return `<div class="card stack archive-card"><div class="row between"><h3>${c.done ? 'Tournament complete' : 'Finish the event'}</h3>${c.done ? '<span class="chip ok">All divisions finished</span>' : `<span class="chip warn">${plural(c.unfinished, 'division')} not finished</span>`}</div>
    <p class="small muted">Approving the results makes them official, locks the event against any further changes and moves it to the archive (it no longer appears on the Home list). You can reopen it later if a correction is needed.</p>
    <div class="row"><button class="${c.done ? 'go' : ''}" data-act="ev-archive">Approve results &amp; archive</button><button class="sm" data-act="tab" data-v="results">Review results</button></div></div>`;
}
async function archiveEvent() {
  const ev = curEvent(); if (!ev) return;
  const c = ev.kind === 'tournament' ? eventComplete() : { done: true, unfinished: 0 };
  const msg = c.done ? `Approve the results of “${ev.name}”? The event becomes read-only and moves to the archive.`
    : `${plural(c.unfinished, 'division')} still unfinished. Approve the results anyway? The event becomes read-only and moves to the archive.`;
  if (!(await confirmBox(msg, 'Approve & archive', !c.done))) return;
  const up = { locked: true, archived: true, approvedAt: new Date().toISOString(), approvedBy: S.myId || '', live: false, public: false };
  if (ev.shareToken) { await guard(() => S.store.del('share/' + ev.shareToken)); up.shareToken = ''; }
  if (ev.live) up.endedAt = up.approvedAt;
  if (await guard(() => S.store.update(P.event(ev.id), up), 'Results approved · event archived')) render();
}
async function reopenEvent() {
  const ev = curEvent(); if (!ev) return;
  if (!(await confirmBox(`Reopen “${ev.name}”? The results are no longer marked approved and the event can be changed again.`, 'Reopen'))) return;
  await guard(() => S.store.update(P.event(ev.id), { locked: false, archived: false, reopenedAt: new Date().toISOString(), reopenedBy: S.myId || '' }), 'Event reopened');
}
function lockedBannerHTML() {
  const ev = curEvent(); if (!ev || !ev.locked || isPublicView()) return '';
  const who = ev.approvedBy ? personName(ev.approvedBy) : '';
  return `<div class="notice lock-banner"><span>🔒 <b>Official results</b> — approved ${ev.approvedAt ? esc(new Date(ev.approvedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })) : ''}${who && who !== 'Team member' ? ' by ' + esc(who) : ''}. This event is archived and read-only.</span>
    ${isEventDirector(ev) ? '<button class="sm" data-act="ev-reopen">Reopen</button>' : ''}</div>`;
}
