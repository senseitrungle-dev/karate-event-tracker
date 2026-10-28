/* ===== v1.38 ring call: the ring manager announces the next queued match / performance, checks the competitors in at the ring, then starts it ===== */
/** Identity of a queue item: {did, mid} for a match, {did, kp} for a kata performance. */
function qRef(x) { return x.kp ? { did: x.did, kp: x.kp.key } : { did: x.did, mid: x.m.id }; }
function sameRef(a, b) { return !!a && !!b && a.did === b.did && (a.kp || '') === (b.kp || '') && (a.mid || '') === (b.mid || ''); }
/** Item currently on the mat for a ring (being scored). */
function onMatRef(rs) { return rs && rs.did ? (rs.kp ? { did: rs.did, kp: rs.kp } : rs.mid ? { did: rs.did, mid: rs.mid } : null) : null; }
/** True while the item on the mat is still unfinished (still in the ring's queue). */
function ringBusy(rid) { const on = onMatRef(S.d.ringstate[rid]); return !!on && ringQueue(rid).some(x => sameRef(qRef(x), on)); }
/** The call to keep when a ring-state document is rewritten: kept only while it is for a different item than the one going on the mat. */
function keepCall(rid, ref) {
  const rs = S.d.ringstate[rid], c = rs && rs.call;
  if (!c || (ref && sameRef(c, ref))) return {};
  return { call: c };
}
/** Who has to be at the ring for an item: [{k, color, id}] — Aka/Shiro for a match, one competitor (or team) for a kata performance. */
function callSides(x) {
  if (x.kp) return [{ k: 'c', color: 'kata', id: x.kp.id, did: x.did }];
  return [{ k: 'a', color: 'Aka', id: x.r.a, did: x.did }, { k: 'b', color: 'Shiro', id: x.r.b, did: x.did }];
}
function callLabel(x) {
  const dv = DC.divBy[x.did], br = S.d.brackets[x.did];
  return `${dv ? dv.name : ''} · ${x.kp ? x.kp.label : KT.matchLabel(x.m, br)}`;
}
const whoText = (id, did) => `${entName(id, did)}${entDojo(id) ? ' (' + entDojo(id) + ')' : ''}`;
/** Plain announcement text: what is called, then who is on deck. */
function announceText(rid, x, deck) {
  const ring = (S.d.rings[rid] || {}).name || 'Ring';
  const sides = callSides(x).map(s => (x.kp ? '' : s.color + ': ') + whoText(s.id, s.did)).join('. ');
  let t = `${ring}, now calling: ${callLabel(x)}. ${sides}.`;
  if (deck) t += ` On deck: ${callSides(deck).map(s => entName(s.id, s.did)).join(' and ')}.`;
  return t;
}
/** Queue of a ring without the item already on the mat. */
function callQueue(rid) {
  const rs = S.d.ringstate[rid], on = onMatRef(rs);
  return ringQueue(rid).filter(x => !sameRef(qRef(x), on));
}
function canRunRing(rid) { return !S.readOnly && (isDirector() || myRingIds().includes(rid)); }
/** Call panel on a ring card (Mat tab). */
function callPanelHTML(r) {
  if (!canRunRing(r.id)) return '';
  const rs = S.d.ringstate[r.id], q = callQueue(r.id);
  if (!q.length) return '';
  const c = rs && rs.call;
  const ci = c ? q.findIndex(x => sameRef(qRef(x), c)) : -1;
  const busy = ringBusy(r.id);
  if (ci < 0) {
    const x = q[0];
    return `<div class="callbox" data-rid="${esc(r.id)}"><div class="label">Next to call</div>
      <div class="small"><b>${esc(callSides(x).map(s => entName(s.id, s.did)).join(' vs '))}</b> <span class="muted">· ${esc(callLabel(x))}</span></div>
      <div class="row" style="margin-top:6px"><button class="go" data-act="ring-call" data-rid="${esc(r.id)}" data-i="0">📣 Call to ${esc(r.name)}</button></div>
      ${busy ? '<div class="tiny muted" style="margin-top:4px">You can call the next one while the current match finishes.</div>' : ''}</div>`;
  }
  const x = q[ci], deck = q[ci + 1] || null, sides = callSides(x), pres = c.present || {};
  const allIn = sides.every(s => pres[s.k]);
  return `<div class="callbox called" data-rid="${esc(r.id)}"><div class="row between"><span class="label">Called${c.n > 1 ? ' × ' + c.n : ''}</span><span class="chip ${allIn ? 'ok' : 'warn'}">${allIn ? 'All present' : 'Check in at the ring'}</span></div>
    <p class="announce" id="announce-${esc(r.id)}">${esc(announceText(r.id, x, deck))}</p>
    <div class="stack" style="gap:4px">${sides.map(s => `<label class="check-in"><input type="checkbox" data-change="call-present" data-rid="${esc(r.id)}" data-k="${s.k}" ${pres[s.k] ? 'checked' : ''}> <span>${x.kp ? '' : `<span class="belt ${s.k}"></span>`}<b>${esc(entName(s.id, s.did))}</b> <span class="muted small">${esc(entDojo(s.id))}</span> — present &amp; ready</span></label>`).join('')}</div>
    <div class="row" style="margin-top:8px;flex-wrap:wrap"><button class="primary" data-act="ring-start" data-rid="${esc(r.id)}" ${allIn && !busy ? '' : 'disabled'}>Start — open ${x.kp ? 'score card' : 'scoresheet'}</button>
      <button data-act="ring-recall" data-rid="${esc(r.id)}">Call again</button><button data-act="ring-speak" data-rid="${esc(r.id)}" title="Read the announcement aloud">🔊 Read aloud</button><button class="ghost" data-act="ring-uncall" data-rid="${esc(r.id)}">Cancel call</button></div>
    ${busy ? '<div class="tiny muted" style="margin-top:4px">Finish the match on the mat first.</div>' : ''}
    ${!allIn && c.n >= 3 ? `<div class="notice warn small" style="margin-top:6px">Called ${c.n} times. If a competitor does not report, record Ki-ken on the ${x.kp ? 'score card' : 'scoresheet'} or ask the director.</div>` : ''}</div>`;
}
/** Short public line for spectators: who has been called to the ring. */
function calledHTML(rid) {
  const rs = S.d.ringstate[rid], c = rs && rs.call; if (!c) return '';
  const x = callQueue(rid).find(y => sameRef(qRef(y), c)); if (!x) return '';
  return `<div class="called-line small"><span class="chip aka">Called</span> ${esc(callSides(x).map(s => entName(s.id, s.did)).join(' vs '))} <span class="muted">· ${esc(callLabel(x))}</span></div>`;
}
async function writeCall(rid, call) {
  const rs = Object.assign({}, S.d.ringstate[rid] || { did: '', mid: '' });
  if (call) rs.call = call; else delete rs.call;
  rs.at = new Date().toISOString();
  await guard(() => S.store.set(P.live(S.evId, 'ringstate', rid), rs));
}
function ringCall(rid, i) {
  const x = callQueue(rid)[+i || 0]; if (!x) return;
  const call = Object.assign(qRef(x), { n: 1, present: {}, at: new Date().toISOString(), by: S.myId || '' });
  writeCall(rid, call).then(() => { toast('Called — check the competitors in when they reach the ring'); speakCall(rid); });
}
function ringRecall(rid) {
  const c = (S.d.ringstate[rid] || {}).call; if (!c) return;
  writeCall(rid, Object.assign({}, c, { n: (c.n || 1) + 1, at: new Date().toISOString() })).then(() => speakCall(rid));
}
function ringPresent(rid, k, on) {
  const c = (S.d.ringstate[rid] || {}).call; if (!c) return;
  writeCall(rid, Object.assign({}, c, { present: Object.assign({}, c.present, { [k]: !!on }) }));
}
function ringUncall(rid) { writeCall(rid, null); }
async function ringStart(rid) {
  const rs = S.d.ringstate[rid] || {}, c = rs.call; if (!c) return;
  if (ringBusy(rid)) { toast('Finish the match on the mat first', true); return; }
  const x = callQueue(rid).find(y => sameRef(qRef(y), c)); if (!x) { ringUncall(rid); return; }
  if (!callSides(x).every(s => (c.present || {})[s.k])) { toast('Check every competitor in first', true); return; }
  const br = S.d.brackets[x.did];
  const doc = x.kp ? { did: x.did, kp: x.kp.key, seg: x.kp.seg || '', kata: '', score: '', log: [], at: new Date().toISOString(), by: S.myId || '' }
    : { did: x.did, mid: x.m.id, seg: KT.segOf(br, x.m), score: null, phase: '', log: [], at: new Date().toISOString(), by: S.myId || '' };
  const ok = await guard(() => S.store.set(P.live(S.evId, 'ringstate', rid), doc));
  if (!ok) return;
  if (x.kp) { if (canScoreKP(x.did, x.kp.key)) openKP(x.did, x.kp.key); }
  else if (canScoreMatch(x.did, x.m.id)) openScore(x.did, x.m.id);
}
function speakCall(rid) {
  const el = document.getElementById('announce-' + rid); const t = el ? el.textContent.replace(/ \*(\d+)/g, ', rank $1') : '';   // v1.45: "*2" is read as "rank 2"
  try { if (t && window.speechSynthesis && window.SpeechSynthesisUtterance && !navigator.webdriver) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(t)); } } catch (e) { /* no speech on this device */ }
}
