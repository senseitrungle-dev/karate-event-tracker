/* ===== scoresheet (ITKF 2009) ===== */
const CLOCK = { left: 0, running: false, t0: 0, base: 0, timer: null, key: '' };
function stopClock() { if (CLOCK.timer) clearInterval(CLOCK.timer); CLOCK.timer = null; if (CLOCK.running) { CLOCK.left = Math.max(0, CLOCK.base - (Date.now() - CLOCK.t0) / 1000); CLOCK.running = false; } }
function setClock(sec, key) { stopClock(); CLOCK.left = sec; CLOCK.base = sec; CLOCK.key = key || CLOCK.key; paintClock(); }
function clockLeft() { return CLOCK.running ? Math.max(0, CLOCK.base - (Date.now() - CLOCK.t0) / 1000) : CLOCK.left; }
function toggleClock() {
  if (CLOCK.running) { stopClock(); }
  else { if (clockLeft() <= 0) return; CLOCK.base = CLOCK.left; CLOCK.t0 = Date.now(); CLOCK.running = true; CLOCK.timer = setInterval(() => { paintClock(); if (clockLeft() <= 0) { stopClock(); CLOCK.left = 0; paintClock(); } }, 200); }
  paintClock();
}
function paintClock() {
  const el = $('#clock'); if (!el) return;
  const l = clockLeft(); el.textContent = fmtClock(Math.ceil(l)); el.classList.toggle('zero', l <= 0);
  const b = $('#clock-btn'); if (b) b.textContent = CLOCK.running ? 'Stop' : 'Start';
}

function draftKey(did, mid) { return `${S.evId}:${did}:${mid}`; }
function loadDraft(key) {
  if (S.draft[key]) return S.draft[key];
  try { const v = JSON.parse(localStorage.getItem('kt-draft-' + key) || 'null'); if (v) return (S.draft[key] = v); } catch (e) { /* ignore */ }
  return (S.draft[key] = {});
}
function saveDraft(key) { try { localStorage.setItem('kt-draft-' + key, JSON.stringify(S.draft[key])); } catch (e) { /* ignore */ } }
function dropDraft(key) { delete S.draft[key]; try { localStorage.removeItem('kt-draft-' + key); } catch (e) { /* ignore */ } }

function openScore(did, mid) {
  S.modal = { type: 'score', did, mid, key: draftKey(did, mid), sig: '', refresh: () => renderScore(false) };
  const dv = DC.divBy[did]; const sc = scoringOf(dv);
  setClock(sc.boutTime, S.modal.key + ':main');
  openModal('<div id="score-root"></div>', { wide: true, nofocus: true });
  renderScore(true);
}
/** Evaluate the draft into an outcome {done, winner:'a'|'b', method, pts, detail} — ITKF 2009 rules */
function kumiteStyle(dv) { return scoringOf(dv).style === 'kogo' ? 'kogo' : 'shobu'; }
function partOf(dv, m, br) { return kindOf(dv) === 'fukugo' ? KT.fukugoPart(m, br) : null; }
function evaluate(dv, d, m, br) {
  const k = kindOf(dv), sc = scoringOf(dv), kogo = kumiteStyle(dv) === 'kogo';
  if (d.kiken) return { done: true, winner: d.kiken === 'a' ? 'b' : 'a', method: 'Ki-ken', pts: { a: 0, b: 0 } };
  const bout = (log, o) => {
    const r = kogo ? KT.kogoEval(log || [], o) : KT.kumiteEval(log || [], Object.assign({ kettei: sc.ketteiTime > 0 }, o));
    return { done: r.done, winner: r.winner, method: r.method, pts: r.score, phase: r.phase, detail: { log: log || [] } };
  };
  if (k === 'kata') {
    if (sc.method === 'scores') {
      const r = KT.scoresEval(d.sa || [], d.sb || [], sc.judges, d.tieSide);
      return { done: r.done, winner: r.winner, method: r.method, pts: r.score, tie: r.tie, detail: { sa: d.sa, sb: d.sb } };
    }
    const fl = d.flags || [];
    if (fl.filter(Boolean).length < sc.judges) return { done: false };
    const r = KT.flagsEval(fl.filter(x => x === 'a').length, sc.judges);
    return { done: r.done, winner: r.winner, method: r.method, pts: r.score, detail: { flags: fl } };
  }
  if (k === 'kumite') return bout(d.log);
  if (k === 'teamkumite') {
    const r = KT.teamKumiteEval(d.bouts || [], sc.bouts, d.daihyo, kogo);
    return { done: r.done, winner: r.winner, method: r.method, pts: r.pts, needDaihyo: r.needDaihyo, per: r.per, detail: { bouts: d.bouts, daihyo: d.daihyo || null } };
  }
  if (k === 'fukugo') {
    if (partOf(dv, m, br) === 'kitei') { const r = KT.kiteiEval(d.flags, 5); return { done: r.done, winner: r.winner, method: r.method, pts: r.score, detail: { flags: d.flags } }; }
    const r = bout(d.log); if (r.method) r.method = 'Kumite · ' + r.method; return r;
  }
  return { done: false };
}
function flagsPanel(d, sc, field, title) {
  const fl = d[field] || [];
  const n = fl.filter(x => x === 'a').length, m = fl.filter(x => x === 'b').length;
  return `<div class="stack"><div class="row between"><h3>${title}</h3><span class="chip"><span class="num">${n}</span>&nbsp;Aka · <span class="num">${m}</span>&nbsp;Shiro</span></div><div class="judges">${Array.from({ length: sc.judges }, (_, i) => `<div class="jrow"><span class="label">${i === 0 ? 'Shu-shin' : 'J' + (i + 1)}</span>
    <button class="${fl[i] === 'a' ? 'on a' : ''}" data-act="flag" data-f="${field}" data-i="${i}" data-s="a" aria-pressed="${fl[i] === 'a'}">Aka</button><button class="${fl[i] === 'b' ? 'on b' : ''}" data-act="flag" data-f="${field}" data-i="${i}" data-s="b" aria-pressed="${fl[i] === 'b'}">Shiro</button></div>`).join('')}</div></div>`;
}
function scoresPanel(d, sc, out) {
  const J = sc.judges;
  const row = (side, arr) => {
    const t = KT.scoreTotal(arr || [], J);
    return `<div class="srow" style="--j:${J}"><span class="side"><span class="belt ${side}"></span><b>${side === 'a' ? 'Aka' : 'Shiro'}</b></span>
      ${Array.from({ length: J }, (_, i) => `<input id="sc-${side}-${i}" inputmode="decimal" data-change="kscore" data-s="${side}" data-i="${i}" value="${esc((arr || [])[i] ?? '')}" placeholder="0.0" aria-label="${side === 'a' ? 'Aka' : 'Shiro'} judge ${i + 1}">`).join('')}
      <span class="tot">${t ? t.avg.toFixed(2) : '—'}</span></div>`;
  };
  return `<div class="stack"><div class="row between"><h3>Judges’ scores</h3><span class="small muted">0.0–10.0${J >= 5 ? ' · highest and lowest dropped, average of the rest' : ''}</span></div>
    <div class="tw"><div class="stack" style="min-width:${120 + J * 60 + 80}px"><div class="srow" style="--j:${J}"><span></span>${Array.from({ length: J }, (_, i) => `<span class="label" style="text-align:center">J${i + 1}</span>`).join('')}<span class="label" style="text-align:right">Score</span></div>${row('a', d.sa)}${row('b', d.sb)}</div></div>
    ${out.tie || d.tieSide ? `<div class="notice warn">Tied even after adding back the dropped scores. Court Judges decide (Kettei-sen):</div><div class="row"><button class="${d.tieSide === 'a' ? 'primary' : ''}" data-act="tie-side" data-s="a">Aka</button><button class="${d.tieSide === 'b' ? 'primary' : ''}" data-act="tie-side" data-s="b">Shiro</button></div>` : ''}</div>`;
}
const EV_LABEL = { waza: 'Waza-ari', ippon: 'Ippon', jogai: 'Jo-gai', keikoku: 'Kei-koku', chui: 'Chui', tento: 'Ten-to', hansoku: 'Han-soku', kiken: 'Ki-ken', timeup: 'Time up', ketteiend: 'Kettei-sen ended', hantei: 'Hantei',
  jikan: 'Jikan', kakushi: 'Kakushi', saki: 'Saki', nigetai: 'Nige-tai', next: 'Next exchange' };
function logHTML(log) { return `<div class="log">${log.slice(-6).map(e => esc((e.s ? (e.s === 'a' ? 'Aka ' : 'Shiro ') : '') + (EV_LABEL[e.t] || e.t))).join('<br>')}</div>`; }
function kumitePanel(log, path, sc, r, opts) {
  if (opts.kogo) return kogoPanel(log, path, r, opts);
  const ev = KT.kumiteEval(log, opts);
  const corner = (s) => {
    const st = ev.st[s];
    const name = s === 'a' ? entName(r.a) : entName(r.b);
    const dis = ev.done ? 'disabled' : '';
    const b = (t, l, cls) => `<button class="${cls || ''}" data-act="k-ev" data-p="${path}" data-s="${s}" data-t="${t}" ${dis}>${l}</button>`;
    return `<div class="corner ${s}"><div class="row between"><span class="label" style="${s === 'a' ? 'color:#fff;opacity:.8' : ''}">${s === 'a' ? 'Aka' : 'Shiro'}</span>${ev.done && ev.winner === s ? '<span class="chip ok">Winner</span>' : ''}</div>
      <div class="who">${esc(opts.names ? opts.names[s] || name : name)}</div><div class="big">${ev.cur[s]}</div>
      <div class="tally">Waza-ari ${st.waza} · Jo-gai ${st.jogai} · K ${st.keikoku} · C ${st.chui}${st.tento ? ' · Ten-to ' + st.tento : ''}</div>
      ${ev.hansokuDue.includes(s) ? '<div class="tally" style="font-weight:700">Second Chui — Court Judges decide Han-soku</div>' : ''}
      <div class="btns">${b('waza', 'Waza-ari')}${b('ippon', 'Ippon')}${b('jogai', 'Jo-gai', 'pen')}${b('keikoku', 'Kei-koku', 'pen')}${b('chui', 'Chui', 'pen')}${b('tento', 'Ten-to', 'pen')}${b('hansoku', 'Han-soku', 'pen')}${ev.phase === 'hantei' ? `<button data-act="k-ev" data-p="${path}" data-s="${s}" data-t="hantei">Hantei</button>` : '<span></span>'}</div></div>`;
  };
  const phaseTxt = ev.done ? `${ev.winner ? (ev.winner === 'a' ? 'Aka' : 'Shiro') + ' · ' : ''}${ev.method}` : ev.phase === 'kettei' ? `Kettei-sen · no carry-over · first Waza-ari wins${ev.score ? ` (regular ${ev.score.a}–${ev.score.b})` : ''}` : ev.phase === 'hantei' ? 'Hantei · Court Judges decide' : opts.ketteiOnly ? 'Representative Kettei-sen' : 'Shobu Ippon';
  return `<div class="board">${corner('a')}<div class="mid"><div class="phase">${esc(phaseTxt)}</div>
      <div class="clock" id="clock">${fmtClock(clockLeft())}</div><div class="row" style="justify-content:center"><button id="clock-btn" data-act="clock" ${ev.done ? 'disabled' : ''}>${CLOCK.running ? 'Stop' : 'Start'}</button><button data-act="clock-reset" data-p="${path}" aria-label="Reset clock">↺</button></div>
      ${ev.phase === 'regular' && !ev.done ? `<button data-act="k-ev" data-p="${path}" data-t="timeup">Time up</button>` : ''}
      ${ev.phase === 'kettei' && !opts.ketteiOnly ? `<button data-act="k-ev" data-p="${path}" data-t="ketteiend">End Kettei-sen</button>` : ''}
      ${ev.phase === 'kettei' && opts.ketteiOnly ? `<button data-act="k-ev" data-p="${path}" data-t="ketteiend">Time up · judges decide</button>` : ''}
      <button data-act="k-undo" data-p="${path}" ${log.length ? '' : 'disabled'}>Undo last</button>${logHTML(log)}</div>${corner('b')}</div>`;
}
function kogoPanel(log, path, r, opts) {
  const ev = KT.kogoEval(log, opts);
  const corner = (s) => {
    const name = s === 'a' ? entName(r.a) : entName(r.b);
    const dis = ev.done ? 'disabled' : '';
    const b = (t, l, cls) => `<button class="${cls || ''}" data-act="k-ev" data-p="${path}" data-s="${s}" data-t="${t}" ${dis}>${l}</button>`;
    const off = !ev.done && ev.phase !== 'hantei' && ev.offense === s;
    return `<div class="corner ${s}"><div class="row between"><span class="label" style="${s === 'a' ? 'color:#fff;opacity:.8' : ''}">${s === 'a' ? 'Aka' : 'Shiro'} · ${off ? 'Offense' : 'Defense'}</span>${ev.done && ev.winner === s ? '<span class="chip ok">Winner</span>' : ''}</div>
      <div class="who">${esc(opts.names ? opts.names[s] || name : name)}</div><div class="big">${ev.cur[s]}</div>
      <div class="btns">${b('waza', 'Waza-ari')}${b('ippon', 'Ippon')}${b('jikan', 'Jikan', 'pen')}${b('kakushi', 'Kakushi', 'pen')}${b('saki', 'Saki', 'pen')}${b('nigetai', 'Nige-tai', 'pen')}${b('keikoku', 'Kei-koku', 'pen')}${b('chui', 'Chui', 'pen')}${b('jogai', 'Jo-gai', 'pen')}${b('tento', 'Ten-to', 'pen')}${b('hansoku', 'Han-soku', 'pen')}${ev.phase === 'hantei' ? `<button data-act="k-ev" data-p="${path}" data-s="${s}" data-t="hantei">Hantei</button>` : '<span></span>'}</div></div>`;
  };
  const phaseTxt = ev.done ? `${ev.winner ? (ev.winner === 'a' ? 'Aka' : 'Shiro') + ' · ' : ''}${ev.method}` : ev.phase === 'hantei' ? 'Hantei · Court Judges decide' : `${ev.phase === 'kettei' ? 'Kettei-sen' : 'Ko-go Kumite'} · Ko-geki ${ev.exchange} of 6`;
  return `<div class="board">${corner('a')}<div class="mid"><div class="phase">${esc(phaseTxt)}</div>
      ${!ev.done && ev.phase !== 'hantei' ? `<div class="clock" style="font-size:1.4rem">${ev.offense === 'a' ? 'Aka' : 'Shiro'} attacks</div><button class="primary" data-act="k-ev" data-p="${path}" data-t="next">${ev.exchange < 6 ? 'Next exchange' : 'End of exchanges'}</button>` : ''}
      <p class="tiny muted">Points from all six exchanges are added together. Equal scores (or no score) → Kettei-sen: first Waza-ari or Ippon wins. Offense must attack within 10 s (Jikan) · max 4 techniques. Penalties give 2 points to the opponent (Chui 4, Ten-to 1).</p>
      <button data-act="k-undo" data-p="${path}" ${log.length ? '' : 'disabled'}>Undo last</button>${logHTML(log)}</div>${corner('b')}</div>`;
}
function teamPanel(d, sc, r, out, kogo) {
  const ta = DC.teamBy[r.a] || {}, tb = DC.teamBy[r.b] || {};
  const nm = (t, id) => { const c = DC.compBy[id]; return c ? `${c.firstName} ${c.lastName}` : ''; };
  const sel = (t, side, i, v) => `<select id="tm-${side}-${i}" data-change="bout-member" data-s="${side}" data-i="${i}" aria-label="Competitor">${opt('', side === 'a' ? 'Aka competitor…' : 'Shiro competitor…', v)}${(t.memberIds || []).map(id => opt(id, nm(t, id), v)).join('')}</select>`;
  const bouts = d.bouts || [];
  const idx = Math.min(S.boutSel ?? 0, sc.bouts - 1 + (out.needDaihyo ? 1 : 0));
  const tabs = Array.from({ length: sc.bouts }, (_, i) => { const p = out.per && out.per[i]; return `<button class="sm ${idx === i ? 'primary' : ''}" data-act="bout-sel" data-i="${i}">Round ${i + 1}${p && p.done ? ` · ${p.score.a}–${p.score.b}` : ''}</button>`; }).join('')
    + (out.needDaihyo ? `<button class="sm ${idx === sc.bouts ? 'primary' : ''}" data-act="bout-sel" data-i="${sc.bouts}">Representative</button>` : '');
  const isD = idx === sc.bouts, b = isD ? (d.daihyo || {}) : (bouts[idx] || {});
  const path = isD ? 'daihyo' : `bouts.${idx}`;
  return `<div class="stack"><div class="row between"><h3>Team match</h3><span class="chip">Team score <span class="num">&nbsp;${out.pts ? out.pts.a : 0}–${out.pts ? out.pts.b : 0}</span></span></div>
    <p class="tiny muted">ITKF: every round is fought; the higher team total wins (Ippon 10). Han-soku or Ki-ken of any member decides the whole team match. Tie → Kettei-sen by Representative.</p>
    <div class="row">${tabs}</div>
    <div class="bout"><div class="bout-h"><b>${isD ? 'Kettei-sen by Representative' : `Round ${idx + 1}`}</b><div class="row">${sel(ta, 'a', isD ? 'd' : idx, b.ma)}${sel(tb, 'b', isD ? 'd' : idx, b.mb)}</div></div>
    ${kumitePanel(b.log || [], path, sc, r, { kogo: kogo && !isD, allowDraw: !isD, ketteiOnly: isD, names: { a: b.ma ? nm(ta, b.ma) : entName(r.a), b: b.mb ? nm(tb, b.mb) : entName(r.b) } })}</div></div>`;
}
function fukugoPanel(d, sc, r, out, part, kogo) {
  if (part === 'kitei') return `<p class="small muted">Ki-tei round: both competitors perform the designated kata together; five judges each choose a winner (no tie).</p>${flagsPanel(d, { judges: 5 }, 'flags', 'Ki-tei · judges’ flags')}`;
  return `<p class="small muted">Kumite round of Fukugo${kogo ? ' (Ko-go Kumite)' : ''}.</p>${kumitePanel(d.log || [], 'log', sc, r, { kogo, kettei: sc.ketteiTime > 0 })}`;
}
function renderScore(force) {
  const M = S.modal; if (!M || M.type !== 'score') return;
  const root = $('#score-root'); if (!root) return;
  const { did, mid, key } = M;
  const dv = DC.divBy[did], br = S.d.brackets[did];
  if (!dv || !br || !br.matches[mid]) { root.innerHTML = sheet('Match unavailable', '<p>This match no longer exists (the bracket may have been redrawn).</p>', '<button data-act="modal-close">Close</button>'); return; }
  const r = DC.res[did][mid], m = br.matches[mid];
  const sig = [r.status, r.a, r.b, r.winner].join('|');
  if (!force && sig === M.sig) return; // background update that doesn't affect this sheet
  M.sig = sig;
  const title = `${esc(KT.matchLabel(m, br))} · ${esc(mid)}`;
  const sub = esc(dv.name) + (S.d.rings[dv.ringId] ? ' · ' + esc(S.d.rings[dv.ringId].name) : '');
  const hdr = `<div class="board" style="grid-template-columns:1fr 1fr"><div class="corner a"><div class="label" style="color:#fff;opacity:.8">Aka</div><div class="who">${esc(entName(r.a) || 'TBD')}</div><div class="tiny" style="opacity:.85">${esc(entDojo(r.a))}</div></div>
    <div class="corner b"><div class="label">Shiro</div><div class="who">${esc(entName(r.b) || 'TBD')}</div><div class="tiny muted">${esc(entDojo(r.b))}</div></div></div>`;
  if (r.status === 'done') {
    const can = canScoreDiv(did) && KT.canEdit(br, mid, DC.res[did]);
    root.innerHTML = sheet(title, `${hdr}<div class="result-banner">Winner: ${esc(entName(r.winner))} · ${esc((r.result || {}).method || '')}${r.result && r.result.pts ? ` · <span class="num">${esc(r.result.pts.a)}–${esc(r.result.pts.b)}</span>` : ''}</div>
      ${!can && canScoreDiv(did) ? '<p class="small muted">This result can no longer be changed because a later match that depends on it has been scored. Undo that match first.</p>' : ''}`,
      `${can ? '<button class="danger" data-act="undo-result">Undo result</button>' : ''}<button class="primary" data-act="modal-close">Close</button>`, sub);
    return;
  }
  if (r.status !== 'ready') { root.innerHTML = sheet(title, `${hdr}<p class="muted">Waiting for earlier matches.</p>`, '<button data-act="modal-close">Close</button>', sub); return; }
  if (!canScoreDiv(did)) { root.innerHTML = sheet(title, `${hdr}<p class="muted">Only the director or this ring’s manager can score this match.</p>`, '<button data-act="modal-close">Close</button>', sub); return; }
  const d = loadDraft(key), out = evaluate(dv, d, m, br), k = kindOf(dv), sc = scoringOf(dv), kogo = kumiteStyle(dv) === 'kogo';
  const part = partOf(dv, m, br);
  let body = '';
  if (k === 'kata') body = sc.method === 'scores' ? scoresPanel(d, sc, out) : flagsPanel(d, sc, 'flags', 'Judges’ flags');
  else if (k === 'kumite') body = kumitePanel(d.log || [], 'log', sc, r, { kogo, kettei: sc.ketteiTime > 0 });
  else if (k === 'teamkumite') body = teamPanel(d, sc, r, out, kogo);
  else if (k === 'fukugo') body = fukugoPanel(d, sc, r, out, part, kogo);
  const kiken = `<div class="row small"><span class="muted">Withdrawal / no-show:</span><button class="sm ${d.kiken === 'a' ? 'danger' : ''}" data-act="kiken" data-s="a">Aka kiken</button><button class="sm ${d.kiken === 'b' ? 'danger' : ''}" data-act="kiken" data-s="b">Shiro kiken</button></div>`;
  const banner = out.done ? `<div class="result-banner">Result: ${esc(entName(out.winner === 'a' ? r.a : r.b))} wins · ${esc(out.method)}</div>` : '';
  const ring = S.d.rings[dv.ringId];
  root.innerHTML = sheet(title + (part ? ` · ${part === 'kitei' ? 'Ki-tei' : 'Kumite'}` : ''), `${k === 'kumite' || (k === 'fukugo' && part === 'kumite') ? '' : hdr}${body}${banner}${kiken}`,
    `${ring ? `<button data-act="call-mat" style="margin-right:auto">Call to ${esc(ring.name)}</button>` : ''}<button data-act="reset-draft">Clear sheet</button><button data-act="modal-close">Close</button><button class="primary" data-act="save-result" ${out.done ? '' : 'disabled'}>Confirm result</button>`, sub);
  paintClock();
}
function logAt(d, path) {
  if (path === 'log') return (d.log = d.log || []);
  if (path === 'daihyo') { d.daihyo = d.daihyo || { log: [] }; return (d.daihyo.log = d.daihyo.log || []); }
  const i = +path.split('.')[1]; d.bouts = d.bouts || []; d.bouts[i] = d.bouts[i] || { log: [] }; return (d.bouts[i].log = d.bouts[i].log || []);
}
let liveT = null;
function pushLive() {
  const M = S.modal; if (!M || M.type !== 'score') return;
  const dv = DC.divBy[M.did]; if (!dv || !S.d.rings[dv.ringId] || S.readOnly) return;
  clearTimeout(liveT);
  liveT = setTimeout(() => {
    const br = S.d.brackets[M.did]; const out = evaluate(dv, loadDraft(M.key), br && br.matches[M.mid], br);
    const phase = out.done ? out.method : out.phase === 'kettei' ? 'Kettei-sen' : out.phase === 'hantei' ? 'Hantei' : '';
    S.store.set(P.live(S.evId, 'ringstate', dv.ringId), { did: M.did, mid: M.mid, score: out.pts || null, phase, at: new Date().toISOString(), by: S.myId || '' }).catch(e => console.warn(e));
  }, 350);
}
function draftChanged() { const M = S.modal; saveDraft(M.key); renderScore(true); pushLive(); }
async function saveResult() {
  const M = S.modal; const dv = DC.divBy[M.did];
  const br = S.d.brackets[M.did];
  const r = DC.res[M.did][M.mid]; const out = evaluate(dv, loadDraft(M.key), br.matches[M.mid], br);
  if (!out.done || r.status !== 'ready') return;
  const winnerId = out.winner === 'a' ? r.a : r.b;
  const rec = { winnerId, method: out.method, pts: out.pts || { a: 0, b: 0 }, detail: clone(out.detail || {}), at: new Date().toISOString(), by: S.myId || '' };
  const ok = await guard(() => S.store.update(P.live(S.evId, 'brackets', M.did), { results: { [M.mid]: rec } }));
  if (!ok) return;
  dropDraft(M.key);
  if (S.d.rings[dv.ringId]) S.store.set(P.live(S.evId, 'ringstate', dv.ringId), { did: '', mid: '', at: new Date().toISOString() }).catch(() => {});
  toast(`${entName(winnerId)} wins · ${out.method}`);
  closeModal();
}

/* ===== kata score pools: performance sheet ===== */
function kpContext(br, key) {
  const m = /^R(\d+)_(.+?)(_rp)?$/.exec(key); if (!m) return null;
  const n = +m[1], id = m[2], rp = !!m[3];
  const st = KT.kpState(br);
  let label = '', isFinal = false, semiKata = '', carry = null, pool = '';
  if (st.final && st.final.n === n) { isFinal = true; label = 'Final'; semiKata = st.final.semiKata[id] || ''; const r = st.final.rows.find(x => x.id === id); if (r && st.final.carried) carry = r.carry != null && r.sheet ? r.carry : null; }
  else { const rd = st.rounds.find(r => r.n === n); if (rd) { label = KT.kpRoundName(rd); pool = Object.keys(rd.pools).find(P => rd.pools[P].order.includes(id)) || ''; if (Object.keys(rd.pools).length > 1) label += ' · Pool ' + pool; } }
  if (isFinal && st.final.carried && carry == null) {
    const semi = st.rounds[st.rounds.length - 1]; const P = Object.keys(semi.pools)[0]; const r = semi.pools[P].rows.find(x => x.id === id); carry = r ? r.own : null;
  }
  return { n, id, rp, label: label + (rp ? ' · Kettei-sen' : ''), isFinal, semiKata, carry };
}
function kpKept(br) { const J = br.judges || 6; return J >= 5 ? J - 2 : J; }
const KATA_LIST = KT.ITKF_KATA.concat(['Heian Shodan', 'Heian Nidan', 'Heian Sandan', 'Heian Yondan', 'Heian Godan', 'Tekki Shodan', 'Tekki Nidan', 'Tekki Sandan']);
function openKP(did, key) {
  const br = S.d.brackets[did]; if (!br) return;
  const ctx = kpContext(br, key); if (!ctx) return;
  const saved = (br.scores || {})[key];
  const dkey = draftKey(did, key);
  const d = loadDraft(dkey);
  const J = br.judges || 6, dv = DC.divBy[did];
  const withApp = !!br.application && ctx.isFinal && !ctx.rp;
  if (!d.s) { d.s = saved && saved.s ? saved.s.map(String) : Array.from({ length: J }, () => ''); d.kata = saved ? saved.kata : ''; d.hansoku = !!(saved && saved.hansoku); }
  if (withApp && !d.app) d.app = saved && saved.app ? saved.app.map(String) : Array.from({ length: J }, () => '');
  S.modal = { type: 'kp', did, key, dkey, ctx, withApp, refresh: null };
  const can = canScoreDiv(did), editable = can && (!saved || KT.kpCanEdit(br, key));
  const dis = editable ? '' : 'disabled';
  const row = (field, label) => `<div><div class="label" style="margin-bottom:6px">${label}</div><div class="kprow" style="--j:${J}">${Array.from({ length: J }, (_, i) => `<label class="f"><span style="text-align:center">${i === 0 ? 'Shu-shin' : 'J' + (i + 1)}</span><input id="kp-${field}${i}" data-input="kp-j" data-f="${field}" data-i="${i}" inputmode="decimal" value="${esc((d[field] || [])[i] ?? '')}" ${dis} aria-label="${label} judge ${i + 1}"></label>`).join('')}</div></div>`;
  const kataLabel = br.kataRule ? 'Kata performed' : 'Choreography (optional)';
  const body = `<div class="corner" style="background:var(--ai-soft);color:var(--ink)"><div class="label">${esc(ctx.label)}</div><div class="who">${esc(entName(ctx.id))}</div><div class="tiny muted">${esc(entDojo(ctx.id))}</div></div>
    <label class="f ${br.kataRule ? 'req' : ''}"><span>${kataLabel}</span><input id="kp-kata" data-input="kp-kata" value="${esc(d.kata || '')}" placeholder="${br.kataRule ? 'e.g. Bassai Dai' : ''}" ${dis} list="kata-list">
      <datalist id="kata-list">${br.kataRule ? KATA_LIST.map(k => `<option value="${k}">`).join('') : ''}</datalist></label>
    ${ctx.rp ? `<p class="small">Kettei-sen: ${br.kataRule ? 'a different kata than the one that tied; ' : ''}this score only breaks the tie and is not added to the total.</p>` : ctx.isFinal && ctx.semiKata && br.kataRule ? `<p class="small">Final elimination kata: <b>${esc(ctx.semiKata)}</b> — the final needs a different kata.</p>` : ''}
    ${row('s', withApp ? 'Kata scores (0.0–10.0)' : `Judges’ scores (0.0–10.0)${J >= 5 ? ' · highest and lowest dropped, average of the rest' : ''}`)}
    ${withApp ? row('app', 'Application (Bunkai) scores') : ''}
    <label class="check"><input type="checkbox" id="kp-hansoku" data-change="kp-hansoku" ${d.hansoku ? 'checked' : ''} ${dis}> Han-soku (zero card — scored 0)</label>
    <div id="kp-sum" class="kp-total"></div><p id="kp-err" class="small" style="color:var(--bad)"></p>
    ${saved && !editable && can ? '<p class="small muted">This score is locked because the next round has started.</p>' : ''}`;
  const ring = S.d.rings[dv.ringId];
  openModal(sheet(esc(entName(ctx.id)), body,
    `${ring && editable ? `<button data-act="kp-call" style="margin-right:auto">Call to ${esc(ring.name)}</button>` : ''}${saved && editable ? '<button class="danger" data-act="kp-clear">Clear score</button>' : ''}<button data-act="modal-close">Close</button>${editable ? '<button class="primary" data-act="kp-save" id="kp-save">Save score</button>' : ''}`,
    `${esc(dv.name)}${ring ? ' · ' + esc(ring.name) : ''}`));
  kpPaint();
}
function kpEval() {
  const M = S.modal, br = S.d.brackets[M.did], J = br.judges || 6, d = loadDraft(M.dkey), k = kpKept(br);
  const num = arr => (arr || []).map(x => String(x).replace(',', '.').trim());
  const vals = num(d.s), app = M.withApp ? num(d.app) : null;
  const full = v => v.length === J && v.every(x => x !== '' && !isNaN(+x));
  let err = '';
  for (const v of [vals, app || []]) if (v.some(x => x !== '' && (isNaN(+x) || +x < 0 || +x > 10))) err = 'Scores must be between 0.0 and 10.0.';
  const kataErr = KT.kpKataCheck(br, M.key, d.kata);
  if (!err && kataErr && (d.kata || !d.hansoku)) err = kataErr === 'Enter the kata name.' && !d.kata ? '' : kataErr;
  if (d.hansoku) {
    const needKata = br.kataRule && !String(d.kata || '').trim();
    return { t: { avg: 0, total: 0, all: 0 }, hansoku: true, err, ok: !err && !needKata, k };
  }
  const t = full(vals) ? KT.scoreTotal(vals.map(Number), J) : null;
  const a = app ? (full(app) ? KT.scoreTotal(app.map(Number), J) : null) : undefined;
  const needKata = br.kataRule && !String(d.kata || '').trim();
  return { t, a, err, k, ok: !!t && a !== null && !err && !needKata };
}
function kpPaint() {
  const M = S.modal; if (!M || M.type !== 'kp') return;
  const { t, a, err, ok, k, hansoku } = kpEval();
  const f = x => (x / k).toFixed(2);
  const sum = $('#kp-sum');
  let h = '<span class="small muted">Enter every judge’s score.</span>';
  if (hansoku) h = '<span>Han-soku · score <b>0.00</b></span>';
  else if (t) {
    const own = t.total + (a ? a.total : 0);
    h = `<span>${a ? 'Kata ' + f(t.total) + ' + Application ' + f(a.total) + ' = ' : 'Score '}<b>${f(own)}</b></span>`;
    if (M.ctx.isFinal && M.ctx.carry != null && !M.ctx.rp) h += `<span class="small">+ final elimination ${f(M.ctx.carry)} = <b style="font-size:1.4rem">${f(own + M.ctx.carry)}</b></span>`;
    h += `<span class="small muted">all six ${t.all.toFixed(1)} · dropped ${t.hi.toFixed(1)} / ${t.lo.toFixed(1)}</span>`;
  }
  if (sum) sum.innerHTML = h;
  const e = $('#kp-err'); if (e) e.textContent = err;
  const b = $('#kp-save'); if (b) b.disabled = !ok;
}
function kpPushLive(clear) {
  const M = S.modal; const dv = DC.divBy[M.did]; if (!dv || !S.d.rings[dv.ringId] || S.readOnly) return;
  const d = loadDraft(M.dkey), { t, a, k } = kpEval();
  const doc = clear ? { did: '', mid: '', at: new Date().toISOString() } : { did: M.did, kp: M.key, kata: d.kata || '', score: t ? ((t.total + (a ? a.total : 0)) / k).toFixed(2) : '', at: new Date().toISOString(), by: S.myId || '' };
  S.store.set(P.live(S.evId, 'ringstate', dv.ringId), doc).catch(e => console.warn(e));
}
async function kpSave() {
  const M = S.modal, d = loadDraft(M.dkey), ev = kpEval(); if (!ev.ok) return;
  const br = S.d.brackets[M.did];
  const rec = d.hansoku ? { hansoku: true, kata: String(d.kata || '').trim(), at: new Date().toISOString(), by: S.myId || '' }
    : { s: d.s.map(x => +String(x).replace(',', '.')), kata: String(d.kata || '').trim(), at: new Date().toISOString(), by: S.myId || '' };
  if (!d.hansoku && M.withApp) rec.app = d.app.map(x => +String(x).replace(',', '.'));
  const saved = await guard(() => S.store.update(P.live(S.evId, 'brackets', M.did), { scores: { [M.key]: rec } }));
  if (!saved) return;
  kpPushLive(true); dropDraft(M.dkey);
  toast(`${entName(M.ctx.id)} · ${d.hansoku ? 'Han-soku' : ((ev.t.total + (ev.a ? ev.a.total : 0)) / kpKept(br)).toFixed(2)}`);
  closeModal();
}
