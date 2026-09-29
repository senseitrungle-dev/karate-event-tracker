/* ===== scoresheet (WTKF) ===== */
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
/** Evaluate the draft into an outcome {done, winner:'a'|'b', method, pts, detail, need} */
function evaluate(dv, d) {
  const k = kindOf(dv), sc = scoringOf(dv);
  if (d.kiken) return { done: true, winner: d.kiken === 'a' ? 'b' : 'a', method: 'Kiken (withdrawal)', pts: { a: 0, b: 0 } };
  if (k === 'kata') {
    if (sc.method === 'scores') {
      const r = KT.scoresEval(d.sa || [], d.sb || [], sc.judges, d.tieFlags != null ? (d.tieFlags || []).filter(x => x === 'a').length : null);
      if (d.tieFlags && d.tieFlags.filter(Boolean).length < sc.judges && r.done && r.method.startsWith('Tie')) return { done: false, tie: true, pts: r.score };
      return { done: r.done, winner: r.winner, method: r.method, pts: r.score, tie: r.tie, detail: { sa: d.sa, sb: d.sb } };
    }
    const fl = d.flags || [];
    if (fl.filter(Boolean).length < sc.judges) return { done: false };
    const r = KT.flagsEval(fl.filter(x => x === 'a').length, sc.judges);
    return { done: r.done, winner: r.winner, method: r.method, pts: r.score, detail: { flags: fl } };
  }
  if (k === 'kumite') {
    const r = KT.kumiteEval(d.log || [], { kettei: sc.ketteiTime > 0 });
    return { done: r.done, winner: r.winner, method: r.method, pts: r.score, phase: r.phase, detail: { log: d.log } };
  }
  if (k === 'teamkumite') {
    const r = KT.teamKumiteEval(d.bouts || [], sc.bouts, d.daihyo);
    return { done: r.done, winner: r.winner, method: r.method, pts: r.wins, needDaihyo: r.needDaihyo, per: r.per, detail: { bouts: d.bouts, daihyo: d.daihyo || null } };
  }
  if (k === 'fukugo') {
    const fl = d.flags || [];
    const kf = fl.filter(Boolean).length === sc.judges ? fl.filter(x => x === 'a').length : null;
    const r = KT.fukugoEval(kf, sc.judges, d.log || [], d.hantei);
    return { done: r.done, winner: r.winner, method: r.method, pts: r.score || { a: 0, b: 0 }, split: r.split, kata: r.kata, kumite: r.kumite, detail: { flags: fl, log: d.log } };
  }
  return { done: false };
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
  const d = loadDraft(key), out = evaluate(dv, d), k = kindOf(dv), sc = scoringOf(dv);
  let body = '';
  if (k === 'kata') body = sc.method === 'scores' ? scoresPanel(d, sc, out) : flagsPanel(d, sc, 'flags', 'Judges’ flags');
  else if (k === 'kumite') body = kumitePanel(d.log || [], 'log', sc, r, { kettei: sc.ketteiTime > 0 });
  else if (k === 'teamkumite') body = teamPanel(d, sc, r, out);
  else if (k === 'fukugo') body = fukugoPanel(d, sc, r, out);
  const kiken = `<div class="row small"><span class="muted">Withdrawal / no-show:</span><button class="sm ${d.kiken === 'a' ? 'danger' : ''}" data-act="kiken" data-s="a">Aka kiken</button><button class="sm ${d.kiken === 'b' ? 'danger' : ''}" data-act="kiken" data-s="b">Shiro kiken</button></div>`;
  const banner = out.done ? `<div class="result-banner">Result: ${esc(entName(out.winner === 'a' ? r.a : r.b))} wins · ${esc(out.method)}</div>` : '';
  const ring = S.d.rings[dv.ringId];
  root.innerHTML = sheet(title, `${k === 'kumite' ? '' : hdr}${body}${banner}${kiken}`,
    `${ring ? `<button data-act="call-mat" style="margin-right:auto">Call to ${esc(ring.name)}</button>` : ''}<button data-act="reset-draft">Clear sheet</button><button data-act="modal-close">Close</button><button class="primary" data-act="save-result" ${out.done ? '' : 'disabled'}>Confirm result</button>`, sub);
  paintClock();
}
function flagsPanel(d, sc, field, title) {
  const fl = d[field] || [];
  const n = fl.filter(x => x === 'a').length, m = fl.filter(x => x === 'b').length;
  return `<div class="stack"><div class="row between"><h3>${title}</h3><span class="chip"><span class="num">${n}</span>&nbsp;Aka · <span class="num">${m}</span>&nbsp;Shiro</span></div><div class="judges">${Array.from({ length: sc.judges }, (_, i) => `<div class="jrow"><span class="label">J${i + 1}</span>
    <button class="${fl[i] === 'a' ? 'on a' : ''}" data-act="flag" data-f="${field}" data-i="${i}" data-s="a" aria-pressed="${fl[i] === 'a'}">Aka</button><button class="${fl[i] === 'b' ? 'on b' : ''}" data-act="flag" data-f="${field}" data-i="${i}" data-s="b" aria-pressed="${fl[i] === 'b'}">Shiro</button></div>`).join('')}</div></div>`;
}
function scoresPanel(d, sc, out) {
  const J = sc.judges;
  const row = (side, arr) => {
    const t = KT.scoreTotal(arr || [], J);
    return `<div class="srow" style="--j:${J}"><span class="side"><span class="belt ${side}"></span><b>${side === 'a' ? 'Aka' : 'Shiro'}</b></span>
      ${Array.from({ length: J }, (_, i) => `<input id="sc-${side}-${i}" inputmode="decimal" data-change="kscore" data-s="${side}" data-i="${i}" value="${esc((arr || [])[i] ?? '')}" placeholder="0.0" aria-label="${side === 'a' ? 'Aka' : 'Shiro'} judge ${i + 1}">`).join('')}
      <span class="tot">${t ? t.total.toFixed(1) : '—'}</span></div>`;
  };
  return `<div class="stack"><div class="row between"><h3>Judges’ scores</h3><span class="small muted">0.0–10.0${J >= 5 ? ' · highest and lowest dropped' : ''}</span></div>
    <div class="tw"><div class="stack" style="min-width:${120 + J * 60 + 80}px"><div class="srow" style="--j:${J}"><span></span>${Array.from({ length: J }, (_, i) => `<span class="label" style="text-align:center">J${i + 1}</span>`).join('')}<span class="label" style="text-align:right">Total</span></div>${row('a', d.sa)}${row('b', d.sb)}</div></div>
    ${out.tie ? `<div class="notice warn">Scores are tied on every tiebreak. Judges decide by flags.</div>${flagsPanel(d, sc, 'tieFlags', 'Tie decision')}` : ''}</div>`;
}
function kumitePanel(log, path, sc, r, opts) {
  const ev = KT.kumiteEval(log, opts);
  const corner = (s) => {
    const st = ev.st[s];
    const name = s === 'a' ? entName(r.a) : entName(r.b);
    const dis = ev.done ? 'disabled' : '';
    return `<div class="corner ${s}"><div class="row between"><span class="label" style="${s === 'a' ? 'color:#fff;opacity:.8' : ''}">${s === 'a' ? 'Aka' : 'Shiro'}</span>${ev.done && ev.winner === s ? '<span class="chip ok">Winner</span>' : ''}</div>
      <div class="who">${esc(opts.names ? opts.names[s] || name : name)}</div><div class="big">${ev.score[s]}</div>
      <div class="tally">Ippon ${st.ippon} · Waza-ari ${st.waza}${st.keikoku || st.chui ? ` · <span title="Penalties">K${st.keikoku} C${st.chui}</span>` : ''}</div>
      <div class="btns"><button data-act="k-ev" data-p="${path}" data-s="${s}" data-t="waza" ${dis}>Waza-ari</button><button data-act="k-ev" data-p="${path}" data-s="${s}" data-t="ippon" ${dis}>Ippon</button>
      <button class="pen" data-act="k-ev" data-p="${path}" data-s="${s}" data-t="keikoku" ${dis}>Keikoku</button><button class="pen" data-act="k-ev" data-p="${path}" data-s="${s}" data-t="chui" ${dis}>Chui</button>
      <button class="pen" data-act="k-ev" data-p="${path}" data-s="${s}" data-t="hansoku" ${dis}>Hansoku</button>${ev.phase === 'hantei' ? `<button data-act="k-ev" data-p="${path}" data-s="${s}" data-t="hantei">Hantei</button>` : '<span></span>'}</div></div>`;
  };
  const phaseTxt = ev.done ? `${ev.winner ? (ev.winner === 'a' ? 'Aka' : 'Shiro') + ' · ' : ''}${ev.method}` : ev.phase === 'kettei' ? 'Kettei-sen · first score wins' : ev.phase === 'hantei' ? 'Hantei · judges decide' : 'Shobu ippon';
  const main = path === S.activeClock || !S.activeClock;
  return `<div class="board">${corner('a')}<div class="mid"><div class="phase">${esc(phaseTxt)}</div>
      ${main ? `<div class="clock" id="clock">${fmtClock(clockLeft())}</div><div class="row" style="justify-content:center"><button id="clock-btn" data-act="clock" ${ev.done ? 'disabled' : ''}>${CLOCK.running ? 'Stop' : 'Start'}</button><button data-act="clock-reset" data-p="${path}" aria-label="Reset clock">↺</button></div>` : ''}
      ${ev.phase === 'regular' && !ev.done ? `<button data-act="k-ev" data-p="${path}" data-t="timeup">Time up</button>` : ''}
      ${ev.phase === 'kettei' ? `<button data-act="k-ev" data-p="${path}" data-t="ketteiend">End Kettei-sen</button>` : ''}
      <button data-act="k-undo" data-p="${path}" ${log.length ? '' : 'disabled'}>Undo last</button>
      <div class="log">${log.slice(-6).map(e => esc((e.s ? (e.s === 'a' ? 'Aka ' : 'Shiro ') : '') + ({ waza: 'Waza-ari', ippon: 'Ippon', keikoku: 'Keikoku', chui: 'Chui', hansoku: 'Hansoku', kiken: 'Kiken', timeup: 'Time up', ketteiend: 'Kettei-sen ended', hantei: 'Hantei' }[e.t] || e.t))).join('<br>')}</div></div>${corner('b')}</div>`;
}
function teamPanel(d, sc, r, out) {
  const ta = DC.teamBy[r.a] || {}, tb = DC.teamBy[r.b] || {};
  const nm = (t, id) => { const c = DC.compBy[id]; return c ? `${c.firstName} ${c.lastName}` : ''; };
  const sel = (t, side, i, v) => `<select id="tm-${side}-${i}" data-change="bout-member" data-s="${side}" data-i="${i}" aria-label="Competitor">${opt('', side === 'a' ? 'Aka competitor…' : 'Shiro competitor…', v)}${(t.memberIds || []).map(id => opt(id, nm(t, id), v)).join('')}</select>`;
  const bouts = d.bouts || [];
  const idx = Math.min(S.boutSel ?? 0, sc.bouts - 1 + (out.needDaihyo ? 1 : 0));
  const tabs = Array.from({ length: sc.bouts }, (_, i) => { const p = out.per[i]; return `<button class="sm ${idx === i ? 'primary' : ''}" data-act="bout-sel" data-i="${i}">Bout ${i + 1}${p && p.done ? (p.winner ? (p.winner === 'a' ? ' · Aka' : ' · Shiro') : ' · Draw') : ''}</button>`; }).join('')
    + (out.needDaihyo ? `<button class="sm ${idx === sc.bouts ? 'primary' : ''}" data-act="bout-sel" data-i="${sc.bouts}">Daihyo-sen</button>` : '');
  const isD = idx === sc.bouts, b = isD ? (d.daihyo || {}) : (bouts[idx] || {});
  const path = isD ? 'daihyo' : `bouts.${idx}`;
  return `<div class="stack"><div class="row between"><h3>Team match</h3><span class="chip">Bouts <span class="num">&nbsp;${out.pts ? out.pts.a : 0}–${out.pts ? out.pts.b : 0}</span></span></div>
    <div class="row">${tabs}</div>
    <div class="bout"><div class="bout-h"><b>${isD ? 'Daihyo-sen (representative bout)' : `Bout ${idx + 1}`}</b><div class="row">${sel(ta, 'a', isD ? 'd' : idx, b.ma)}${sel(tb, 'b', isD ? 'd' : idx, b.mb)}</div></div>
    ${kumitePanel(b.log || [], path, sc, r, { allowDraw: !isD, names: { a: b.ma ? nm(ta, b.ma) : entName(r.a), b: b.mb ? nm(tb, b.mb) : entName(r.b) } })}</div></div>`;
}
function fukugoPanel(d, sc, r, out) {
  return `<div class="stack">${flagsPanel(d, sc, 'flags', 'Part 1 · Kata (flags)')}
    <div class="stack"><h3>Part 2 · Kumite</h3>${kumitePanel(d.log || [], 'log', sc, r, { kettei: sc.ketteiTime > 0 })}</div>
    ${out.split ? `<div class="notice warn">Kata and kumite went to different competitors. Judges give an overall hantei:</div><div class="row"><button class="${d.hantei === 'a' ? 'primary' : ''}" data-act="fk-hantei" data-s="a">Aka</button><button class="${d.hantei === 'b' ? 'primary' : ''}" data-act="fk-hantei" data-s="b">Shiro</button></div>` : ''}</div>`;
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
    const out = evaluate(dv, loadDraft(M.key));
    const phase = out.done ? out.method : out.phase === 'kettei' ? 'Kettei-sen' : out.phase === 'hantei' ? 'Hantei' : '';
    S.store.set(P.live(S.evId, 'ringstate', dv.ringId), { did: M.did, mid: M.mid, score: out.pts || null, phase, at: new Date().toISOString(), by: S.myId || '' }).catch(e => console.warn(e));
  }, 350);
}
function draftChanged() { const M = S.modal; saveDraft(M.key); renderScore(true); pushLive(); }
async function saveResult() {
  const M = S.modal; const dv = DC.divBy[M.did];
  const r = DC.res[M.did][M.mid]; const out = evaluate(dv, loadDraft(M.key));
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
