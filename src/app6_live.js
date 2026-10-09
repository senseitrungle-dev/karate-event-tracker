/* ===== v1.5: rings & segments, judges, officials, match view, follow ===== */

/* ---------- segments on rings ---------- */
const SEG_LABEL = seg => seg === 'SF' ? 'Semifinal' : seg === 'F' ? 'Final' : seg && seg.startsWith('P:') ? 'Pool ' + seg.slice(2) : seg && seg.startsWith('M:') ? 'Match ' + seg.slice(2) : 'Whole division';
function ringName(rid) { return (S.d.rings[rid] || {}).name || 'No ring'; }
/** Items a ring runs that belong to divisions based on another ring (pools / semifinal / final / single matches). */
function guestItems(rid) {
  const out = [];
  for (const dv of DC.divs) {
    for (const [seg, r] of Object.entries(dv.segRings || {})) {
      if (r === rid && r !== dv.ringId && divEntrants(dv.id).length) out.push({ did: dv.id, seg });
    }
  }
  return out;
}
/** Segments of a native division that were moved to other rings. */
function awaySegs(dv) { return Object.entries(dv.segRings || {}).filter(([, r]) => r && r !== dv.ringId); }
async function setSegRing(did, seg, ringId) {
  const dv = DC.divBy[did]; if (!dv) return;
  const val = !ringId || ringId === dv.ringId ? null : ringId;
  const ok = await guard(() => S.store.update(P.doc(S.evId, 'divisions', did), { segRings: { [seg]: val } }),
    `${dv.name} · ${SEG_LABEL(seg)} → ${ringName(val || dv.ringId)}`);
  if (ok) scheduleSync();
}
/* keep division.scorerIds = managers of every ring that runs part of the division (used by Firestore rules) */
let syncT = null;
function scheduleSync() { if (!isDirector() || !S.evId) return; clearTimeout(syncT); syncT = setTimeout(syncScorers, 700); }
async function syncScorers() {
  const ev = curEvent();
  if (ev) { // v1.9: who may open this event besides its directors
    const all = [...new Set(Object.values(S.d.rings).flatMap(r => r.managerIds || []))].sort();
    if ((ev.managerIds || []).slice().sort().join('|') !== all.join('|')) await guard(() => S.store.update(P.event(ev.id), { managerIds: all }));
  }
  for (const dv of Object.values(S.d.divisions)) {
    const rings = new Set([dv.ringId, ...Object.values(dv.segRings || {})].filter(Boolean));
    const ids = [...new Set([...rings].flatMap(r => (S.d.rings[r] || {}).managerIds || []))].sort();
    if ((dv.scorerIds || []).slice().sort().join('|') !== ids.join('|')) await guard(() => S.store.update(P.doc(S.evId, 'divisions', dv.id), { scorerIds: ids }));
  }
}

/* ---------- judges: each judge works on one ring until moved ---------- */
const judgesList = () => Object.values(S.d.judges).sort((a, b) => String(a.name).localeCompare(String(b.name)));
function judgeShort(id) { const j = S.d.judges[id]; if (!j) return ''; const p = String(j.name || '').trim().split(/\s+/); return p.length > 1 ? `${p[0][0]}. ${p[p.length - 1]}` : p[0] || ''; }
function judgeChips(j, kind) {
  const ev = curEvent(), need = KT.judgeNeed(ev.level);
  const c = (lbl, lv) => `<span class="chip ${lv >= need ? 'plain' : 'bad'}" title="${lv >= need ? '' : `Level ${need}+ needed for ${esc(ev.level)} events`}">${lbl} L${lv || '–'}</span>`;
  return `${c('Kata', +j.kataLevel || 0)}${c('Kumite', +j.kumiteLevel || 0)}${kind && !KT.judgeEligible(j, kind, ev.level) ? '<span class="chip bad">Not qualified for this level</span>' : ''}`;
}
/** Judges working on a ring (a pool / round placed on that ring uses them). */
function ringJudges(rid) { return rid ? judgesList().filter(j => j.ringId === rid) : []; }
function ringJudgesSummary(rid) {
  const js = ringJudges(rid);
  return js.length ? js.map(j => `<span class="chip plain">${esc(judgeShort(j.id))}</span>`).join('') : `<span class="tiny muted">${rid ? 'No judges on ' + esc(ringName(rid)) + ' yet' : 'No ring'}</span>`;
}
async function setJudgeRing(jid, rid) {
  const j = S.d.judges[jid]; if (!j) return;
  const ok = await guard(() => S.store.update(P.doc(S.evId, 'judges', jid), { ringId: rid || '' }), rid ? `${j.name} → ${ringName(rid)}` : `${j.name} unassigned`);
  if (ok && rid) { const ev = curEvent(), need = KT.judgeNeed(ev.level); if ((+j.kataLevel || 0) < need && (+j.kumiteLevel || 0) < need) toast(`${j.name} is below level ${need} for ${ev.level} events`, true); }
}
function ringMoveSelect(j, label) {
  return `<select id="jring-${esc(j.id)}" class="rmove" data-change="judge-ring" data-id="${esc(j.id)}" aria-label="Move ${esc(j.name)}">${opt('', label, '')}${DC.rings.filter(r => r.id !== j.ringId).map(r => opt(r.id, 'To ' + r.name, '')).join('')}${j.ringId ? opt('__none', 'Unassign', '') : ''}</select>`;
}
function judgeRow(j) {
  const ev = curEvent();
  return `<div class="jrow2 jr"><button class="ghost jname" data-act="judge-edit" data-id="${esc(j.id)}"><span class="name">${esc(j.name)}</span><span class="dojo">${esc(KT.judgeFrom(j, ev.level) || '—')}</span></button>
    <span class="pill-list">${judgeChips(j)}<button class="chip ${j.checkedIn ? 'ok' : 'plain'} jin" data-act="judge-in" data-id="${esc(j.id)}" aria-pressed="${!!j.checkedIn}">${j.checkedIn ? '✓ Checked in' : 'Check in'}</button></span>${ringMoveSelect(j, j.ringId ? 'Move…' : 'Assign to ring…')}</div>`;
}
function judgesHTML() {
  const ev = curEvent(), list = judgesList(), need = KT.judgeNeed(ev.level);
  const where = ev.level === 'International' ? 'country' : ev.level === 'National' ? 'region' : 'dojo';
  const un = list.filter(j => !S.d.rings[j.ringId]);
  const ringCards = DC.rings.map(r => { const js = ringJudges(r.id); return `<div class="card stack"><div class="row between"><h3>${esc(r.name)}</h3><span class="chip ${js.length ? '' : 'plain'}">${plural(js.length, 'judge')}</span></div>
    <div class="jlist">${js.map(judgeRow).join('') || '<span class="small muted">No judges on this ring yet.</span>'}</div></div>`; }).join('');
  return fab('judge-new', 'Add judge') + eventHeader(`<button data-act="judge-import">Import judges</button>${list.length ? '<button data-act="judge-export">Export</button>' : ''}<button class="primary" data-act="judge-new">Add judge</button>`)
    + `<p class="small muted">${esc(ev.level)} event · judges shown with their ${where}. Each judge works on one ring until moved; every division, pool and round run on that ring uses the ring’s judges. Credential levels 1–7; levels 3–7 may judge National and International events, levels 1–2 Regional and Local only.${need >= 3 ? '' : ''}</p>`
    + (list.length ? `<div class="card stack"><div class="row between"><h3>Unassigned</h3><span class="chip ${un.length ? 'warn' : 'ok'}">${un.length}</span></div><div class="jlist">${un.map(judgeRow).join('') || '<span class="small muted">Every judge is assigned to a ring.</span>'}</div></div>
      ${DC.rings.length ? `<div class="grid2">${ringCards}</div>` : '<p class="small muted">Create rings on the Rings tab, then assign judges to them.</p>'}`
      : `<div class="card empty"><div class="mark-lg"></div><h2>No judges yet</h2><p class="muted">Add the judges pool, then assign each judge to a ring.</p><button class="primary" data-act="judge-new">Add judge</button></div>`);
}
function judgeForm(id) {
  const j = id ? S.d.judges[id] : { kataLevel: 1, kumiteLevel: 1, ringId: '' };
  const lv = (n, v) => `<select name="${n}" id="j-${n}">${[1, 2, 3, 4, 5, 6, 7].map(x => opt(x, 'Level ' + x, v)).join('')}</select>`;
  openModal(sheet(id ? esc(j.name) : 'Add judge', `<form id="f-judge" data-form="judge" data-id="${esc(id || '')}" class="stack"><div class="fgrid">
    <label class="f req span"><span>Name</span><input name="name" id="j-name" required value="${esc(j.name || '')}"></label>
    <label class="f"><span>Country</span><input name="country" id="j-country" value="${esc(j.country || '')}" placeholder="International events"></label>
    <label class="f"><span>Region</span><input name="region" id="j-region" value="${esc(j.region || '')}" placeholder="National events"></label>
    <label class="f"><span>Dojo</span><input name="dojo" id="j-dojo" value="${esc(j.dojo || '')}" placeholder="Regional & local events"></label>
    <label class="f"><span>Kata credential</span>${lv('kataLevel', j.kataLevel)}</label>
    <label class="f"><span>Kumite credential</span>${lv('kumiteLevel', j.kumiteLevel)}</label>
    <label class="f"><span>Ring</span><select name="ringId" id="j-ring">${opt('', 'Unassigned', j.ringId || '')}${DC.rings.map(r => opt(r.id, r.name, j.ringId || '')).join('')}</select></label>
    <label class="f span"><span>Notes</span><textarea name="notes" id="j-notes">${esc(j.notes || '')}</textarea></label></div>
    <p class="tiny muted">Levels 3–7 may judge National and International events; levels 1–2 Regional and Local only. Lower levels can still be assigned (with a warning).</p></form>`,
    `${id ? '<button class="danger" data-act="judge-delete" style="margin-right:auto">Delete</button>' : ''}<button data-act="modal-close">Cancel</button><button class="primary" type="submit" form="f-judge">Save</button>`));
}
async function saveJudge(form) {
  const v = fd(form); if (!v.name) { toast('Enter the judge’s name.', true); return; }
  const rec = { name: v.name, country: v.country, region: v.region, dojo: v.dojo, kataLevel: +v.kataLevel, kumiteLevel: +v.kumiteLevel, ringId: v.ringId || '', notes: v.notes };
  const ev = curEvent(), need = KT.judgeNeed(ev.level);
  const ok = await guard(() => S.store.set(P.doc(S.evId, 'judges', form.dataset.id || uid()), rec), 'Judge saved');
  if (ok) { closeModal(); if (rec.kataLevel < need && rec.kumiteLevel < need) toast(`Saved · below level ${need}: not qualified for ${ev.level} events`, true); }
}

/* ---------- officials on a score sheet: positions assigned by the Shu-shin, recorded by the ring manager ---------- */
function offKey(rid) { return `kt-off-${S.evId}-${rid || 'none'}`; }
/** Last panel used on this ring, kept only for judges still on the ring and never twice. */
function lastOfficials(rid, positions) {
  let o = {}; try { o = JSON.parse(localStorage.getItem(offKey(rid)) || 'null') || {}; } catch (e) { o = {}; }
  const out = {}, used = new Set();
  for (const p of positions || []) { const id = o[p.key]; const j = S.d.judges[id]; if (j && j.ringId === rid && !used.has(id)) { out[p.key] = id; used.add(id); } }
  return out;
}
function rememberOfficials(rid, o) { try { localStorage.setItem(offKey(rid), JSON.stringify(o || {})); } catch (e) { /* ignore */ } }
function officialsHTML(rid, kind, positions, officials, editable) {
  const ev = curEvent(), o = officials || {};
  const req = KT.judgeNeed(ev.level) >= 3;
  const all = judgesList(), onRing = all.filter(j => j.ringId === rid), others = all.filter(j => j.ringId !== rid);
  const filled = positions.filter(p => o[p.key]).length;
  const optsFor = key => {
    const sel = o[key] || '';
    const taken = new Set(positions.filter(p => p.key !== key).map(p => o[p.key]).filter(Boolean)); // already seated → not offered again
    const name = j => j.name + (KT.judgeEligible(j, kind, ev.level) ? '' : ' ⚠');
    const a = onRing.filter(j => !taken.has(j.id)), b = others.filter(j => !taken.has(j.id));
    return opt('', '— Select judge —', sel)
      + (a.length ? `<optgroup label="${esc(ringName(rid))} judges">${a.map(j => opt(j.id, name(j), sel)).join('')}</optgroup>` : '')
      + (b.length ? `<optgroup label="Other judges">${b.map(j => opt(j.id, name(j) + (j.ringId && S.d.rings[j.ringId] ? ' · ' + ringName(j.ringId) : ''), sel)).join('')}</optgroup>` : '');
  };
  const left = onRing.filter(j => !Object.values(o).includes(j.id));
  return `<details class="officials" ${editable && filled < positions.length ? 'open' : ''}><summary><span>Officials</span><span class="chip ${filled === positions.length ? 'ok' : req ? 'warn' : 'plain'}">${filled}/${positions.length}${req ? ' · required' : ' · optional'}</span></summary>
    ${all.length ? `<div class="off-grid">${positions.map(p => `<label class="f"><span>${esc(p.label)}</span>${editable ? `<select id="off-${p.key}" data-change="official" data-pos="${p.key}">${optsFor(p.key)}</select>` : `<span class="small">${esc(((S.d.judges[o[p.key]] || {}).name) || '—')}</span>`}</label>`).join('')}</div>
    ${editable ? `<p class="tiny muted">The Shu-shin assigns a judge to each position; the ring manager records it here. A seated judge is removed from the other lists. ⚠ = below the credential level for this event.</p>
      <div class="tiny"><span class="muted">Not seated (${esc(ringName(rid))}):</span> ${left.map(j => esc(judgeShort(j.id))).join(', ') || '—'}</div>` : ''}` : '<p class="small muted">No judges in the pool yet (Judges tab).</p>'}</details>`;
}
function officialsRec(officials, positions) {
  const o = officials || {}; if (!Object.values(o).some(Boolean)) return '';
  return `<div class="small"><b>Officials:</b> ${positions.filter(p => o[p.key]).map(p => `${esc(p.label)} ${esc((S.d.judges[o[p.key]] || {}).name || '?')}`).join(' · ')}</div>`;
}
function positionsFor(dv, m, br) {
  const k = kindOf(dv), sc = scoringOf(dv);
  if (k === 'kata') return KT.officialPositions('kata', sc.judges);
  if (k === 'fukugo' && KT.fukugoPart(m, br) === 'kitei') return KT.officialPositions('kitei', 5);
  return KT.officialPositions('kumite');
}
/** Short judge name under a judge column (position index → officials key). */
function posName(officials, i) { const id = (officials || {})[i === 0 ? 'shushin' : 'f' + i]; return id ? judgeShort(id) : ''; }

/* ---------- match view (live activity, result, ring) ---------- */
function liveFor(did, mid) { return Object.entries(S.d.ringstate).find(([, x]) => x && x.did === did && x.mid === mid); }
function openMatch(did, mid) {
  S.modal = { type: 'match', did, mid, refresh: () => renderMatch() };
  openModal('<div id="match-root"></div>', { wide: true, nofocus: true });
  renderMatch();
}
function renderMatch() {
  const M = S.modal; if (!M || M.type !== 'match') return;
  const root = $('#match-root'); if (!root) return;
  const { did, mid } = M, dv = DC.divBy[did], br = S.d.brackets[did];
  if (!dv || !br || !br.matches[mid]) { root.innerHTML = sheet('Match', '<p>This match is no longer available.</p>', '<button data-act="modal-close">Close</button>'); return; }
  const m = br.matches[mid], r = DC.res[did][mid], seg = KT.segOf(br, m), rid = KT.ringOf(dv, seg, mid);
  const live = liveFor(did, mid), rs = live ? live[1] : null;
  const side = s => { const id = r[s]; return `<div class="corner ${s}"><div class="label" style="${s === 'a' ? 'color:#fff;opacity:.8' : ''}">${s === 'a' ? 'Aka' : 'Shiro'}${r.status === 'done' && r.winner === id ? ' · Winner' : ''}</div><div class="who">${id ? esc(entName(id)) : esc((s === 'a' ? r.hintA : r.hintB) || 'TBD')}</div><div class="tiny" style="opacity:.85">${esc(entDojo(id))}</div>
    ${rs && rs.score ? `<div class="big">${esc(rs.score[s])}</div>` : r.status === 'done' && r.result && r.result.pts ? `<div class="big">${esc(r.result.pts[s])}</div>` : ''}</div>`; };
  const status = r.status === 'done' ? `<span class="chip ok">Final · ${esc((r.result || {}).method || '')}</span>` : rs ? '<span class="chip aka">● Live on the mat</span>' : r.status === 'ready' ? '<span class="chip">Ready</span>' : r.status === 'bye' ? '<span class="chip plain">Bye</span>' : '<span class="chip plain">Waiting for earlier matches</span>';
  const canS = canScoreMatch(did, mid);
  let body = `<div class="row between">${status}<span class="small muted">${esc(ringName(rid))}${seg ? ' · ' + esc(SEG_LABEL(seg)) : ''}</span></div>
    <div class="board" style="grid-template-columns:1fr 1fr">${side('a')}${side('b')}</div>`;
  if (rs) body += `<div class="card live-card"><div class="row between"><b>${esc(rs.phase || 'In progress')}</b><span class="tiny muted">updated ${esc(timeAgo(rs.at))}</span></div>${(rs.log || []).length ? `<ol class="live-log">${rs.log.slice().reverse().map(x => `<li>${esc(x)}</li>`).join('')}</ol>` : '<p class="small muted">Waiting for the first score.</p>'}</div>`;
  if (r.status === 'done') {
    if (canScoreDiv(did)) body += recordHTML(dv, br, m, r); else body += officialsRec((r.result || {}).officials, positionsFor(dv, m, br)) + recordedBy(r.result);
  }
  if (isDirector() && r.status !== 'done') body += `<label class="f"><span>Run this match on</span><select id="mring-${esc(mid)}" data-change="match-ring" data-did="${esc(did)}" data-mid="${esc(mid)}">${DC.rings.map(x => opt(x.id, x.name + (x.id === KT.ringOf(dv, seg) ? ' (default)' : ''), rid)).join('')}</select></label>`;
  const foot = `${canS && r.status === 'ready' ? `<button class="go" data-act="score" data-did="${esc(did)}" data-mid="${esc(mid)}">Open scoresheet</button>` : ''}${canS && r.status === 'done' ? `<button data-act="score" data-did="${esc(did)}" data-mid="${esc(mid)}">Result options</button>` : ''}<button class="primary" data-act="modal-close">Close</button>`;
  root.innerHTML = sheet(`${esc(KT.matchLabel(m, br))}`, body, foot, `${esc(dv.name)} · ${esc(mid)}`);
}
function timeAgo(iso) { if (!iso) return ''; const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }

/* ---------- division view (director) ---------- */
function openDivPanel(did) { S.modal = { type: 'divp', did, refresh: () => renderDivPanel() }; openModal('<div id="divp-root"></div>', { wide: true, nofocus: true }); renderDivPanel(); }
function renderDivPanel() {
  const M = S.modal; if (!M || M.type !== 'divp') return;
  const root = $('#divp-root'); if (!root) return;
  const dv = DC.divBy[M.did]; if (!dv) { closeModal(); return; }
  const br = S.d.brackets[dv.id], bs = bracketState(dv.id), n = divEntrants(dv.id).length;
  const ringSel = (id, val, seg) => seg
    ? `<select id="${id}" data-change="seg-ring" data-did="${esc(dv.id)}" data-seg="${esc(seg)}" aria-label="Ring for ${esc(SEG_LABEL(seg))}">${DC.rings.map(x => opt(x.id, x.id === dv.ringId ? x.name + ' (main)' : x.name, val)).join('')}</select>`
    : `<select id="${id}" data-change="div-ring2" data-did="${esc(dv.id)}" aria-label="Main ring">${opt('', 'No ring', val)}${DC.rings.map(x => opt(x.id, x.name, val)).join('')}</select>`;
  const segs = KT.segList(br);
  const cnt = s => br && br.format === 'KP' && s.seg.startsWith('P:') ? plural((br.kpPools[s.seg.slice(2)] || []).length, 'competitor') : br && br.pools && s.seg.startsWith('P:') ? plural((br.pools[s.seg.slice(2)] || []).length, 'competitor') : '';
  const jl = rid => `<div class="pill-list"><span class="tiny muted" style="margin-right:2px">Judges:</span>${ringJudgesSummary(rid)}</div>`;
  const rows = `<div class="seg-row"><div><b>Whole division</b><div class="tiny muted">${plural(n, 'entrant')} · main ring</div></div>${ringSel('dvr-' + dv.id, dv.ringId, '')}${jl(dv.ringId)}</div>`
    + segs.map(s => { const rid = KT.ringOf(dv, s.seg); return `<div class="seg-row"><div><b>${esc(s.label)}</b><div class="tiny muted">${cnt(s)}</div></div>${ringSel(`sgr-${dv.id}-${s.seg.replace(':', '')}`, rid, s.seg)}<div class="tiny muted">Judges: ${S.d.rings[rid] ? `${plural(ringJudges(rid).length, 'judge')} of ${esc(ringName(rid))}` : '—'}</div></div>`; }).join('');
  const body = `<div class="row small muted">${esc(KT.FORMATS[dv.format] || dv.format)} · ${esc(scoringLabel(dv))}</div>
    <div class="row">${!bs.drawn ? (n >= 1 ? '<span class="chip plain">Not drawn</span>' : '<span class="chip plain">Empty</span>') : bs.complete ? '<span class="chip ok">Finished</span>' : `<span class="chip">${bs.fought}/${bs.playable} ${bs.kp ? 'performances' : 'matches'}</span>`}</div>
    <div class="card flush"><div class="card-h"><h3>Rings &amp; judges</h3><span class="tiny muted">Pools and rounds use the judges of the ring they run on</span></div><div class="seg-list">${rows}</div></div>
    ${!segs.length ? '<p class="tiny muted">Pools, semifinal and final can be placed on their own rings once the division is drawn.</p>' : ''}`;
  root.innerHTML = sheet(esc(dv.name), body, `<button data-act="div-edit" data-id="${esc(dv.id)}">Settings</button>${bs.drawn ? `<button data-act="view-bracket" data-id="${esc(dv.id)}">Bracket</button>` : n ? `<button class="primary" data-act="draw" data-id="${esc(dv.id)}">Draw</button>` : ''}<button class="primary" data-act="modal-close">Done</button>`);
}

/* ---------- follow: competitors, dojos, regions, countries ---------- */
function followKey() { return 'kt-follow-' + S.evId; }
function getFollow() { if (S.follow && S.follow.ev === S.evId) return S.follow; let f = {}; try { f = JSON.parse(localStorage.getItem(followKey()) || '{}') || {}; } catch (e) { /* ignore */ } S.follow = Object.assign({ ev: S.evId, comps: [], dojos: [], regions: [], countries: [] }, f, { ev: S.evId }); return S.follow; }
function toggleFollow(kind, val) { const f = getFollow(); const a = f[kind] || (f[kind] = []); const i = a.indexOf(val); if (i >= 0) a.splice(i, 1); else a.push(val); try { localStorage.setItem(followKey(), JSON.stringify(f)); } catch (e) { /* ignore */ } render(); }
const star = (kind, val) => { const on = (getFollow()[kind] || []).includes(val); return `<button class="star ${on ? 'on' : ''}" data-act="follow" data-k="${kind}" data-v="${esc(val)}" aria-pressed="${on}" aria-label="${on ? 'Unfollow' : 'Follow'}">${on ? '★' : '☆'}</button>`; };
/** Where a competitor (or team) stands in one division. */
function entrantStatus(did, id) {
  const br = S.d.brackets[did], dv = DC.divBy[did];
  if (!br) return { text: 'Not drawn yet', cls: 'plain' };
  const pl = DC.pl[did] || {};
  const place = pl.gold === id ? 1 : pl.silver === id ? 2 : (pl.bronze || []).includes(id) ? 3 : pl.fourth === id ? 4 : 0;
  if (pl.complete && place) return { text: ['', '🥇 1st place', '🥈 2nd place', '🥉 3rd place', '4th place'][place], cls: place <= 3 ? 'ok' : 'plain' };
  if (br.format === 'KP') {
    const q = KT.kpQueue(br), mine = q.find(x => x.id === id);
    if (mine) {
      const rid = KT.ringOf(dv, mine.seg), rq = ringQueue(rid), pos = rq.findIndex(x => x.kp && x.kp.key === mine.key && x.did === did);
      const rs = S.d.ringstate[rid];
      if (rs && rs.kp === mine.key) return { text: `On the mat now · ${ringName(rid)} · ${mine.label}`, cls: 'aka', ring: rid };
      return { text: `${mine.label} · ${ringName(rid)}${pos >= 0 ? ` · ${pos === 0 ? 'next up' : pos + ' ahead'}` : ''}`, cls: '', ring: rid };
    }
    const st = KT.kpState(br);
    const rows = st.final ? st.final.rows : (st.rounds.length ? Object.values(st.rounds[st.rounds.length - 1].pools).flatMap(p => p.rows) : []);
    const row = rows.find(x => x.id === id);
    if (row && row.sheet) return { text: `Scored ${(row.total / ((br.judges || 6) >= 5 ? (br.judges || 6) - 2 : br.judges || 6)).toFixed(2)} · place ${row.rank || '–'} · waiting for others`, cls: 'plain' };
    return { text: pl.complete ? 'Finished' : 'Eliminated', cls: 'plain' };
  }
  const res = DC.res[did] || {}, ms = Object.values(br.matches);
  const ready = ms.filter(m => res[m.id] && res[m.id].status === 'ready' && (res[m.id].a === id || res[m.id].b === id));
  for (const m of ready) {
    const r = res[m.id], opp = r.a === id ? r.b : r.a, rid = KT.ringOf(dv, KT.segOf(br, m), m.id);
    const live = liveFor(did, m.id);
    if (live) return { text: `On the mat now · ${ringName(rid)} · vs ${entName(opp)}`, cls: 'aka', did, mid: m.id };
    const rq = ringQueue(rid), pos = rq.findIndex(x => x.m && x.m.id === m.id && x.did === did);
    return { text: `${KT.matchLabel(m, br)} vs ${entName(opp)} · ${ringName(rid)}${pos >= 0 ? ` · ${pos === 0 ? 'next up' : pos + ' ahead'}` : ''}`, cls: '', did, mid: m.id };
  }
  const pending = ms.some(m => res[m.id] && res[m.id].status === 'pending' && (res[m.id].a === id || res[m.id].b === id));
  const done = ms.filter(m => res[m.id] && res[m.id].status === 'done' && (res[m.id].a === id || res[m.id].b === id));
  if (pending) return { text: 'Waiting for next opponent', cls: 'plain' };
  if (!done.length) return { text: 'Waiting', cls: 'plain' };
  const last = done[done.length - 1], lr = res[last.id];
  if (lr.winner === id) return { text: 'Advanced · waiting for next round', cls: 'plain', did, mid: last.id };
  return { text: place ? 'Placed (finishing)' : `Out · lost ${KT.matchLabel(last, br)} to ${entName(lr.winner)}`, cls: 'plain', did, mid: last.id };
}
function entriesOf(c) {
  const out = [];
  for (const did in DC.assign.byDiv) {
    const ents = DC.assign.byDiv[did];
    if (ents.includes(c.id)) out.push({ did, eid: c.id });
    for (const t of DC.teams) if ((t.memberIds || []).includes(c.id) && ents.includes(t.id)) out.push({ did, eid: t.id, team: t });
  }
  return out;
}
function compStatusHTML(c, compact) {
  const ents = entriesOf(c);
  if (!ents.length) return '<div class="tiny muted">No division yet</div>';
  return ents.map(e => {
    const st = entrantStatus(e.did, e.eid), dv = DC.divBy[e.did];
    const tap = st.mid ? `data-act="match" data-did="${esc(st.did)}" data-mid="${esc(st.mid)}" role="button" tabindex="0"` : `data-act="view-bracket" data-id="${esc(e.did)}" role="button" tabindex="0"`;
    return `<div class="fstat ${compact ? 'compact' : ''}" ${tap}><span class="tiny muted">${esc(dv.name)}${e.team ? ' · ' + esc(e.team.name) : ''}</span><span class="chip ${st.cls}">${esc(st.text)}</span></div>`;
  }).join('');
}
function followHTML() {
  const f = getFollow(), q = (S.ui.fq || '').trim().toLowerCase();
  const comps = DC.comps.filter(c => c.status !== 'withdrawn');
  const uniq = arr => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const dojos = uniq(comps.map(c => c.dojo)), regions = uniq(comps.map(c => c.state)), countries = uniq(comps.map(c => c.country));
  let results = '';
  if (q) {
    const cm = comps.filter(c => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q)).slice(0, 12);
    const grp = (title, kind, list) => list.length ? `<div class="label" style="margin-top:8px">${title}</div>${list.map(v => `<div class="frow">${star(kind, v)}<span>${esc(v)}</span><span class="tiny muted">${comps.filter(c => (kind === 'dojos' ? c.dojo : kind === 'regions' ? c.state : c.country) === v).length} competitors</span></div>`).join('')}` : '';
    results = `<div class="card stack" style="gap:4px">${cm.length ? `<div class="label">Competitors</div>${cm.map(c => `<div class="frow">${star('comps', c.id)}<span><b>${esc(c.lastName)}, ${esc(c.firstName)}</b> <span class="tiny muted">${esc(c.dojo || '')}</span></span></div>`).join('')}` : ''}
      ${grp('Dojos / clubs', 'dojos', dojos.filter(d => d.toLowerCase().includes(q)))}${grp('Regions', 'regions', regions.filter(d => d.toLowerCase().includes(q)))}${grp('Countries', 'countries', countries.filter(d => d.toLowerCase().includes(q)))}
      ${!cm.length && ![...dojos, ...regions, ...countries].some(d => d.toLowerCase().includes(q)) ? '<p class="small muted">No matches.</p>' : ''}</div>`;
  }
  const fc = f.comps.map(id => DC.compBy[id]).filter(Boolean);
  const groupCard = (kind, v, key) => {
    const members = comps.filter(c => c[key] === v);
    const medals = KT.medalTable(Object.keys(S.d.brackets).flatMap(did => { const p = DC.pl[did]; if (!p || !p.complete) return []; return [['gold', p.gold], ['silver', p.silver], ...(p.bronze || []).map(b => ['bronze', b])].filter(x => x[1] && members.some(m => m.id === x[1] || (DC.teamBy[x[1]] && (DC.teamBy[x[1]].memberIds || []).includes(m.id)))).map(x => ({ dojo: v, place: x[0] })); }));
    const md = medals[0] || { gold: 0, silver: 0, bronze: 0 };
    return `<div class="card stack"><div class="row between"><div class="row" style="gap:6px">${star(kind, v)}<h3>${esc(v)}</h3></div><span class="small"><span class="medal g" style="width:20px;height:20px">${md.gold}</span> <span class="medal s" style="width:20px;height:20px">${md.silver}</span> <span class="medal b" style="width:20px;height:20px">${md.bronze}</span></span></div>
      <div class="stack" style="gap:8px">${members.map(c => `<div><div class="name">${esc(c.lastName)}, ${esc(c.firstName)}</div>${compStatusHTML(c, true)}</div>`).join('')}</div></div>`;
  };
  const followed = fc.map(c => `<div class="card stack"><div class="row between"><div class="row" style="gap:6px;min-width:0">${star('comps', c.id)}<div style="min-width:0"><div class="name">${esc(c.lastName)}, ${esc(c.firstName)}</div><div class="dojo">${esc([c.dojo, c.state, c.country].filter(Boolean).join(' · '))}</div></div></div></div>${compStatusHTML(c)}</div>`).join('')
    + f.dojos.map(v => groupCard('dojos', v, 'dojo')).join('') + f.regions.map(v => groupCard('regions', v, 'state')).join('') + f.countries.map(v => groupCard('countries', v, 'country')).join('');
  return eventHeader() + `<div class="section-h"><input id="follow-q" class="search" type="search" placeholder="Find a competitor, dojo, region or country…" value="${esc(S.ui.fq || '')}" data-input="fq" aria-label="Search to follow"></div>${results}
    ${followed ? `<div class="grid2">${followed}</div>` : `<div class="card empty"><div class="mark-lg"></div><h2>Follow competitors</h2><p class="muted" style="max-width:48ch">Search above and tap ☆ to follow a competitor, a dojo, a region or a country. You’ll see their rings, next matches, live status and medals here. Follows are saved on this device.</p></div>`}`;
}

/* ===== v1.10: import judges & credentials (CSV / pasted list), copy from another event, export ===== */
const JUDGE_COLS = 'name, country, region, dojo, kata_level, kumite_level, ring, email, notes';
function parseLevel(s) {
  s = String(s || '').trim(); if (!s) return 0;
  const m = s.match(/([1-7])/); return m ? +m[1] : 0;
}
/** Parse judge rows. Returns {rows:[{rec, status, note, matchId}], errors:[]} — nothing is written. */
function judgeImportRows(text) {
  const rows = parseCSV(String(text || '').replace(/\t/g, ','));
  if (rows.length < 2) return { rows: [], errors: ['Need a heading row and at least one judge.'] };
  const h = rows[0].map(x => x.toLowerCase().replace(/[^a-z]/g, ''));
  const col = (...names) => h.findIndex(x => names.includes(x));
  const ix = { name: col('name', 'judge', 'judgename', 'fullname'), first: col('firstname', 'first', 'givenname'), last: col('lastname', 'last', 'surname', 'familyname'),
    country: col('country', 'nation', 'nationality', 'federation'), region: col('region', 'state', 'province', 'area'), dojo: col('dojo', 'club', 'school'),
    kata: col('katalevel', 'kata', 'katacredential', 'katalicense', 'katalicence', 'katagrade'), kumite: col('kumitelevel', 'kumite', 'kumitecredential', 'kumitelicense', 'kumitelicence', 'kumitegrade'),
    level: col('level', 'credential', 'license', 'licence', 'grade', 'judgelevel'), ring: col('ring', 'court', 'mat'), email: col('email', 'mail'), notes: col('notes', 'note', 'remarks') };
  const errors = [];
  if (ix.name < 0 && (ix.first < 0 || ix.last < 0)) return { rows: [], errors: ['A “name” column (or first_name and last_name) is required.'] };
  if (ix.kata < 0 && ix.kumite < 0 && ix.level < 0) return { rows: [], errors: ['Credential columns are required: kata_level and kumite_level (or a single “level”).'] };
  const ev = curEvent(), need = KT.judgeNeed(ev.level), where = ev.level === 'International' ? 'country' : ev.level === 'National' ? 'region' : '';
  const g = (r, i) => (i >= 0 ? String(r[i] || '').trim() : '');
  const ringBy = {}; DC.rings.forEach(r => { ringBy[r.name.toLowerCase()] = r.id; ringBy[r.name.toLowerCase().replace(/^ring\s*/, '')] = r.id; });
  const key = j => [String(j.name || '').toLowerCase().replace(/\s+/g, ' '), String(j.country || j.region || j.dojo || '').toLowerCase()].join('|');
  const existing = {}; judgesList().forEach(j => { existing[key(j)] = j.id; existing[String(j.name || '').toLowerCase().replace(/\s+/g, ' ') + '|'] = existing[String(j.name || '').toLowerCase().replace(/\s+/g, ' ') + '|'] || j.id; });
  const seen = new Set(), out = [];
  rows.slice(1).forEach((r, n) => {
    const name = ix.name >= 0 ? g(r, ix.name) : `${g(r, ix.first)} ${g(r, ix.last)}`.trim();
    const both = parseLevel(g(r, ix.level));
    const rec = { name, country: g(r, ix.country), region: g(r, ix.region), dojo: g(r, ix.dojo),
      kataLevel: parseLevel(g(r, ix.kata)) || both, kumiteLevel: parseLevel(g(r, ix.kumite)) || both, notes: g(r, ix.notes), email: g(r, ix.email).toLowerCase() };
    const ringTxt = g(r, ix.ring).toLowerCase(); const ringId = ringTxt ? (ringBy[ringTxt] || ringBy[ringTxt.replace(/^ring\s*/, '')] || '') : null;
    if (ringId !== null) rec.ringId = ringId;
    const line = n + 2;
    if (!rec.name) { errors.push(`Row ${line}: missing name`); return; }
    if (!rec.kataLevel && !rec.kumiteLevel) { errors.push(`Row ${line} (${rec.name}): credential levels must be 1–7`); return; }
    const k = key(rec); if (seen.has(k)) { errors.push(`Row ${line} (${rec.name}): duplicate row`); return; } seen.add(k);
    const matchId = existing[k] || existing[String(rec.name).toLowerCase().replace(/\s+/g, ' ') + '|'] || '';
    const notes = [];
    if (rec.kataLevel < need && rec.kumiteLevel < need) notes.push(`below level ${need} for ${ev.level}`);
    else if (rec.kataLevel < need || rec.kumiteLevel < need) notes.push(`${rec.kataLevel < need ? 'kata' : 'kumite'} below level ${need}`);
    if (where && !rec[where]) notes.push(`no ${where}`);
    if (ringTxt && !ringId) notes.push(`ring “${g(r, ix.ring)}” not found`);
    out.push({ rec, line, matchId, status: matchId ? 'update' : 'new', warn: notes.join(' · ') });
  });
  return { rows: out, errors };
}
function judgeImportForm() {
  const ev = curEvent(), need = KT.judgeNeed(ev.level);
  const others = Object.values(S.events).filter(e => e.id !== S.evId && (isLocal() || isEventDirector(e)));
  openModal(sheet('Import judges', `<p class="small">Paste the judges list (from a spreadsheet or the federation’s register) or choose a .csv file. The first row must be column headings.</p>
    <p class="tiny mono muted">${JUDGE_COLS}</p>
    <p class="tiny muted">Credentials are levels 1–7 (“5”, “L5”, “Level 5”); a single <span class="mono">level</span> column applies to both kata and kumite. ${ev.level === 'International' ? '<b>International event:</b> include each judge’s country; levels 3–7 required.' : ev.level === 'National' ? '<b>National event:</b> include each judge’s region; levels 3–7 required.' : 'Levels 1–2 may judge Regional and Local events.'} Judges already in the pool (same name) are updated, not duplicated. <span class="mono">ring</span> (e.g. “Ring 2”) assigns them.</p>
    <div class="row" style="flex-wrap:wrap;gap:8px"><input type="file" id="jimp-file" accept=".csv,text/csv,text/plain" data-change="jimp-file"><button class="sm" data-act="jimp-template">Insert example</button></div>
    <textarea id="jimp-text" rows="9" placeholder="name,country,region,dojo,kata_level,kumite_level,ring&#10;Haruki Sato,Japan,Kanto,Hombu Dojo,6,5,Ring 1" data-input="jimp-text"></textarea>
    <div id="jimp-preview"></div>
    ${others.length ? `<details class="card" style="margin-top:6px"><summary class="small"><b>Or copy the judges pool from another of your events</b></summary><div class="row" style="margin-top:8px;flex-wrap:wrap"><select id="jimp-from">${others.map(e => opt(e.id, e.name, '')).join('')}</select><button class="sm" data-act="jimp-copy">Load their judges</button></div><p class="tiny muted">Loads names and credentials (not rings or check-ins) into the box above for review.</p></details>` : ''}`,
    `<button data-act="modal-close">Cancel</button><button class="primary" data-act="jimp-run" id="jimp-run" disabled>Import</button>`), { wide: true });
}
function judgeImportPreview() {
  const box = $('#jimp-text'); if (!box) return;
  const { rows, errors } = judgeImportRows(box.value);
  const nNew = rows.filter(r => r.status === 'new').length, nUp = rows.length - nNew, nWarn = rows.filter(r => r.warn).length;
  const tbl = rows.length ? `<div class="tw" style="max-height:280px;overflow:auto"><table class="acc"><thead><tr><th>Row</th><th>Name</th><th>From</th><th class="n">Kata</th><th class="n">Kumite</th><th>Ring</th><th>Status</th></tr></thead><tbody>${rows.map(r => `<tr><td class="num">${r.line}</td><td>${esc(r.rec.name)}</td><td class="small">${esc([r.rec.country, r.rec.region, r.rec.dojo].filter(Boolean).join(' · '))}</td><td class="n">${r.rec.kataLevel || '—'}</td><td class="n">${r.rec.kumiteLevel || '—'}</td><td class="small">${r.rec.ringId ? esc(ringName(r.rec.ringId)) : ''}</td>
    <td><span class="chip ${r.status === 'new' ? 'ok' : ''}">${r.status === 'new' ? 'New' : 'Update'}</span>${r.warn ? ` <span class="chip warn">${esc(r.warn)}</span>` : ''}</td></tr>`).join('')}</tbody></table></div>` : '';
  $('#jimp-preview').innerHTML = `${rows.length ? `<p class="small"><b>${plural(nNew, 'new judge')}</b>, ${plural(nUp, 'update')}${nWarn ? ` · <span style="color:var(--warn)">${plural(nWarn, 'warning')}</span>` : ''}${errors.length ? ` · <span style="color:var(--bad)">${plural(errors.length, 'row')} skipped</span>` : ''}</p>` : ''}${tbl}${errors.length ? `<p class="tiny" style="color:var(--bad)">${errors.slice(0, 8).map(esc).join('<br>')}${errors.length > 8 ? '<br>…' : ''}</p>` : ''}`;
  const b = $('#jimp-run'); if (b) { b.disabled = !rows.length; b.textContent = rows.length ? `Import ${rows.length}` : 'Import'; }
}
async function judgeImportRun() {
  const { rows, errors } = judgeImportRows($('#jimp-text').value); if (!rows.length) return;
  const b = $('#jimp-run'); if (b) b.disabled = true;
  let n = 0;
  for (const r of rows) {
    const id = r.matchId || uid() + 'j' + n;
    const cur = S.d.judges[id] || {};
    const rec = Object.assign({}, cur, r.rec); delete rec.id;
    if (!rec.email) delete rec.email;
    if (!('ringId' in r.rec)) rec.ringId = cur.ringId || '';
    if (!(await guard(() => S.store.set(P.doc(S.evId, 'judges', id), rec)))) break;
    n++;
  }
  closeModal();
  toast(`Imported ${plural(n, 'judge')}${errors.length ? ` · ${errors.length} rows skipped` : ''}`);
}
function judgesCSV(list) {
  return KT.toCSV([['name', 'country', 'region', 'dojo', 'kata_level', 'kumite_level', 'ring', 'checked_in', 'notes']]
    .concat(list.map(j => [j.name, j.country || '', j.region || '', j.dojo || '', j.kataLevel || '', j.kumiteLevel || '', S.d.rings[j.ringId] ? S.d.rings[j.ringId].name : '', j.checkedIn ? 'yes' : '', j.notes || ''])));
}
function judgeCopyFrom(eid) {
  let off = null;
  off = S.store.watch(P.col(eid, 'judges'), o => {
    if (off) { try { off(); } catch (e) { /* ignore */ } }
    const list = Object.values(o).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    if (!list.length) { toast('That event has no judges.', true); return; }
    const csv = KT.toCSV([['name', 'country', 'region', 'dojo', 'kata_level', 'kumite_level', 'notes']].concat(list.map(j => [j.name, j.country || '', j.region || '', j.dojo || '', j.kataLevel || '', j.kumiteLevel || '', j.notes || ''])));
    const box = $('#jimp-text'); if (box) { box.value = csv; judgeImportPreview(); }
  }, () => toast('Could not read that event’s judges.', true));
}
