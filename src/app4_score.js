/* ===== scoresheet (WTKF 2009) ===== */
const CLOCK = { left: 0, running: false, t0: 0, base: 0, timer: null, key: '' };
function stopClock() { if (CLOCK.timer) clearInterval(CLOCK.timer); CLOCK.timer = null; if (CLOCK.running) { CLOCK.left = Math.max(0, CLOCK.base - (Date.now() - CLOCK.t0) / 1000); CLOCK.running = false; } }
function setClock(sec, key) { stopClock(); CLOCK.left = sec; CLOCK.base = sec; CLOCK.key = key || CLOCK.key; paintClock(); }
function clockLeft() { return CLOCK.running ? Math.max(0, CLOCK.base - (Date.now() - CLOCK.t0) / 1000) : CLOCK.left; }
function toggleClock() {
  if (CLOCK.running) { stopClock(); }
  else { if (clockLeft() <= 0) return; CLOCK.base = CLOCK.left; CLOCK.t0 = Date.now(); CLOCK.running = true; CLOCK.timer = setInterval(() => { paintClock(); if (clockLeft() <= 0) { stopClock(); CLOCK.left = 0; clockChanged(); } }, 200); }
  clockChanged();
}
/** Scoring buttons are only live while the clock is stopped (Yame), so the sheet is redrawn on every start / stop. */
function clockChanged() {
  if (S.modal && S.modal.type === 'score' && $('#score-root .board .corner button[data-act="k-ev"]')) renderScore(true); else paintClock();
}
function paintClock() {
  const el = $('#clock'); if (!el) return;
  // write only on change: replacing a button's text while it is held down can cancel the click
  const l = clockLeft(), t = fmtClock(Math.ceil(l)); if (el.textContent !== t) el.textContent = t; el.classList.toggle('zero', l <= 0);
  const b = $('#clock-btn'), bt = CLOCK.running ? 'Stop' : 'Start'; if (b && b.textContent !== bt) b.textContent = bt;
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
/** Evaluate the draft into an outcome {done, winner:'a'|'b', method, pts, detail} — WTKF 2009 rules */
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
  const jl = i => { const n = posName(d.officials, i); return (i === 0 ? 'Shu-shin' : 'J' + (i + 1)) + (n ? `<br><span class="tiny">${esc(n)}</span>` : ''); };
  const n = fl.filter(x => x === 'a').length, m = fl.filter(x => x === 'b').length;
  return `<div class="stack"><div class="row between"><h3>${title}</h3><span class="chip"><span class="num">${n}</span>&nbsp;Aka · <span class="num">${m}</span>&nbsp;Shiro</span></div><div class="judges">${Array.from({ length: sc.judges }, (_, i) => `<div class="jrow"><span class="label">${jl(i)}</span>
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
    <div class="tw"><div class="stack" style="min-width:${120 + J * 60 + 80}px"><div class="srow" style="--j:${J}"><span></span>${Array.from({ length: J }, (_, i) => `<span class="label" style="text-align:center">J${i + 1}${posName(d.officials, i) ? `<br><span class="tiny">${esc(posName(d.officials, i))}</span>` : ''}</span>`).join('')}<span class="label" style="text-align:right">Score</span></div>${row('a', d.sa)}${row('b', d.sb)}</div></div>
    ${out.tie || d.tieSide ? `<div class="notice warn">Tied even after adding back the dropped scores. Court Judges decide (Kettei-sen):</div><div class="row"><button class="${d.tieSide === 'a' ? 'primary' : ''}" data-act="tie-side" data-s="a">Aka</button><button class="${d.tieSide === 'b' ? 'primary' : ''}" data-act="tie-side" data-s="b">Shiro</button></div>` : ''}</div>`;
}
const EV_LABEL = { waza: 'Waza-ari', ippon: 'Ippon', jogai: 'Jo-gai', keikoku: 'Kei-koku', chui: 'Chui', tento: 'Ten-to', hansoku: 'Han-soku', kiken: 'Ki-ken', timeup: 'Time up', ketteiend: 'Kettei-sen ended', hantei: 'Hantei',
  jikan: 'Jikan', kakushi: 'Kakushi', saki: 'Saki', nigetai: 'Nige-tai', next: 'No score · next exchange' };
function evText(e) { return (e.s ? (e.s === 'a' ? 'Aka ' : 'Shiro ') : '') + (EV_LABEL[e.t] || e.t) + (e.t === 'tento' && e.exec ? ' · penalty match' : '') + (e.ae ? ' · exchange over' : ''); }
function logHTML(log) { return `<div class="log">${log.slice(-6).map(e => esc(evText(e))).join('<br>')}</div>`; }
function kumitePanel(log, path, sc, r, opts) {
  if (opts.kogo) return kogoPanel(log, path, r, opts);
  const ev = KT.kumiteEval(log, opts);
  const corner = (s) => {
    const st = ev.st[s];
    const name = s === 'a' ? entName(r.a) : entName(r.b);
    const dis = ev.done || CLOCK.running ? 'disabled' : '';
    const b = (t, l, cls) => `<button class="${cls || ''}" data-act="k-ev" data-p="${path}" data-s="${s}" data-t="${t}" ${dis}${t === 'tento' ? ' title="Fall: Ten-to penalty match (no points). After time has expired: 1 point to the opponent."' : ''}>${l}</button>`;
    return `<div class="corner ${s}"><div class="row between"><span class="label" style="${s === 'a' ? 'color:#fff;opacity:.8' : ''}">${s === 'a' ? 'Aka' : 'Shiro'}</span>${ev.done && ev.winner === s ? '<span class="chip ok">Winner</span>' : ''}</div>
      <div class="who">${esc(opts.names ? opts.names[s] || name : name)}</div><div class="big">${ev.cur[s]}</div>
      <div class="tally">Waza-ari ${st.waza} · Jo-gai ${st.jogai} · K ${st.keikoku} · C ${st.chui}${st.tento || st.tentoX ? ' · Ten-to ' + (st.tento + st.tentoX) : ''}</div>
      ${ev.hansokuDue.includes(s) ? '<div class="tally" style="font-weight:700">Second Chui — Court Judges decide Han-soku</div>' : ''}
      <div class="btns">${b('waza', 'Waza-ari')}${b('ippon', 'Ippon')}${b('jogai', 'Jo-gai', 'pen')}${b('keikoku', 'Kei-koku', 'pen')}${b('chui', 'Chui', 'pen')}${b('tento', 'Ten-to', 'pen')}${b('hansoku', 'Han-soku', 'pen')}${ev.phase === 'hantei' ? `<button data-act="k-ev" data-p="${path}" data-s="${s}" data-t="hantei">Hantei</button>` : '<span></span>'}</div></div>`;
  };
  const phaseTxt = ev.done ? `${ev.winner ? (ev.winner === 'a' ? 'Aka' : 'Shiro') + ' · ' : ''}${ev.method}` : ev.phase === 'kettei' ? `Kettei-sen · no carry-over · first Waza-ari wins${ev.score ? ` (regular ${ev.score.a}–${ev.score.b})` : ''}` : ev.phase === 'hantei' ? 'Hantei · Court Judges decide' : opts.ketteiOnly ? 'Representative Kettei-sen' : 'Shobu Ippon';
  return `<div class="board">${corner('a')}<div class="mid"><div class="phase">${esc(phaseTxt)}</div>
      <div class="clock" id="clock">${fmtClock(clockLeft())}</div><div class="row" style="justify-content:center"><button id="clock-btn" data-act="clock" data-press="1" ${ev.done ? 'disabled' : ''}>${CLOCK.running ? 'Stop' : 'Start'}</button><button data-act="clock-reset" data-p="${path}" aria-label="Reset clock">↺</button></div>
      ${CLOCK.running && !ev.done ? '<p class="tiny" style="text-align:center;margin:0;color:var(--warn)">Clock running — stop it (Yame) to record a score or penalty.</p>' : ''}
      ${ev.phase === 'regular' && !ev.done ? `<button data-act="k-ev" data-p="${path}" data-t="timeup" ${CLOCK.running ? 'disabled' : ''}>Time up</button>` : ''}
      ${ev.phase === 'kettei' && !opts.ketteiOnly ? `<button data-act="k-ev" data-p="${path}" data-t="ketteiend">End Kettei-sen</button>` : ''}
      ${ev.phase === 'kettei' && opts.ketteiOnly ? `<button data-act="k-ev" data-p="${path}" data-t="ketteiend">Time up · judges decide</button>` : ''}
      <button data-act="k-undo" data-p="${path}" ${log.length ? '' : 'disabled'}>Undo last</button>${logHTML(log)}</div>${corner('b')}</div>`;
}
function kogoPanel(log, path, r, opts) {
  const ev = KT.kogoEval(log, opts);
  const corner = (s) => {
    const name = s === 'a' ? entName(r.a) : entName(r.b);
    const dis = ev.done ? 'disabled' : '';
    const off = !ev.done && ev.phase !== 'hantei' && ev.offense === s;
    const live = !ev.done && ev.phase !== 'hantei';
    // offense can't commit Saki / Nige-tai; defense can't commit Jikan / Kakushi
    const na = live ? (off ? { saki: 1, nigetai: 1 } : { jikan: 1, kakushi: 1 }) : {};
    const b = (t, l, cls) => `<button class="${cls || ''}" data-act="k-ev" data-p="${path}" data-s="${s}" data-t="${t}" ${dis || (na[t] ? 'disabled title="Not applicable to the ' + (off ? 'offense' : 'defense') + ' side"' : '')}>${l}</button>`;
    return `<div class="corner ${s}"><div class="row between"><span class="label" style="${s === 'a' ? 'color:#fff;opacity:.8' : ''}">${s === 'a' ? 'Aka' : 'Shiro'} · ${off ? 'Offense' : 'Defense'}</span>${ev.done && ev.winner === s ? '<span class="chip ok">Winner</span>' : ''}</div>
      <div class="who">${esc(opts.names ? opts.names[s] || name : name)}</div><div class="big">${ev.cur[s]}</div>
      <div class="btns">${b('waza', 'Waza-ari')}${b('ippon', 'Ippon')}${b('jikan', 'Jikan', 'pen')}${b('kakushi', 'Kakushi', 'pen')}${b('saki', 'Saki', 'pen')}${b('nigetai', 'Nige-tai', 'pen')}${b('keikoku', 'Kei-koku', 'pen')}${b('chui', 'Chui', 'pen')}${b('jogai', 'Jo-gai', 'pen')}${b('tento', 'Ten-to', 'pen')}${b('hansoku', 'Han-soku', 'pen')}${ev.phase === 'hantei' ? `<button data-act="k-ev" data-p="${path}" data-s="${s}" data-t="hantei">Hantei</button>` : '<span></span>'}</div></div>`;
  };
  const phaseTxt = ev.done ? `${ev.winner ? (ev.winner === 'a' ? 'Aka' : 'Shiro') + ' · ' : ''}${ev.method}` : ev.phase === 'hantei' ? 'Hantei · Court Judges decide' : `${ev.phase === 'kettei' ? 'Kettei-sen' : 'Ko-go Kumite'} · Ko-geki ${ev.exchange} of 6`;
  return `<div class="board">${corner('a')}<div class="mid"><div class="phase">${esc(phaseTxt)}</div>
      ${!ev.done && ev.phase !== 'hantei' ? `<div class="clock" style="font-size:1.4rem">${ev.offense === 'a' ? 'Aka' : 'Shiro'} attacks</div><button class="primary" data-act="k-ev" data-p="${path}" data-t="next">${ev.exchange < 6 ? 'No score · next exchange' : 'No score · end of exchanges'}</button>` : ''}
      <p class="tiny muted">Points from all six exchanges are added together. Equal scores (or no score) → Kettei-sen: first Waza-ari or Ippon wins. Each exchange is a stand-alone match: it ends at the first score or penalty (the next exchange starts automatically); use “No score” when it ends without one. Offense must attack within 10 s (Jikan) · max 4 techniques. Penalties give 2 points to the opponent (Chui 4, Ten-to 1).</p>
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
    <p class="tiny muted">WTKF: every round is fought; the higher team total wins (Ippon 10). Han-soku or Ki-ken of any member decides the whole team match. Tie → Kettei-sen by Representative.</p>
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
  const seg = KT.segOf(br, m), rid = KT.ringOf(dv, seg, mid);
  const sub = esc(dv.name) + (seg ? ' · ' + esc(SEG_LABEL(seg)) : '') + (S.d.rings[rid] ? ' · ' + esc(S.d.rings[rid].name) : '');
  const positions = positionsFor(dv, m, br), canS = canScoreMatch(did, mid);
  const hdr = `<div class="board" style="grid-template-columns:1fr 1fr"><div class="corner a"><div class="label" style="color:#fff;opacity:.8">Aka</div><div class="who">${esc(entName(r.a) || 'TBD')}</div><div class="tiny" style="opacity:.85">${esc(entDojo(r.a))}</div></div>
    <div class="corner b"><div class="label">Shiro</div><div class="who">${esc(entName(r.b) || 'TBD')}</div><div class="tiny muted">${esc(entDojo(r.b))}</div></div></div>`;
  if (r.status === 'done') {
    const can = canS && KT.canEdit(br, mid, DC.res[did]);
    root.innerHTML = sheet(title, `${hdr}<div class="result-banner">Winner: ${esc(entName(r.winner))} · ${esc((r.result || {}).method || '')}${r.result && r.result.pts ? ` · <span class="num">${esc(r.result.pts.a)}–${esc(r.result.pts.b)}</span>` : ''}</div>
      ${canScoreDiv(did) ? recordHTML(dv, br, m, r) : officialsRec((r.result || {}).officials, positions)}
      ${!can && canS ? '<p class="small muted">This result can no longer be changed because a later match that depends on it has been scored. Undo that match first.</p>' : ''}`,
      `${can ? '<button class="danger" data-act="undo-result">Undo result</button>' : ''}<button class="primary" data-act="modal-close">Close</button>`, sub);
    return;
  }
  if (r.status !== 'ready') { root.innerHTML = sheet(title, `${hdr}<p class="muted">Waiting for earlier matches.</p>`, '<button data-act="modal-close">Close</button>', sub); return; }
  if (!canS) { root.innerHTML = sheet(title, `${hdr}<p class="muted">Only the director or the manager of ${esc(ringName(rid))} can score this match.</p>`, '<button data-act="modal-close">Close</button>', sub); return; }
  const d = loadDraft(key), out = evaluate(dv, d, m, br), k = kindOf(dv), sc = scoringOf(dv), kogo = kumiteStyle(dv) === 'kogo';
  if (!d.officials) d.officials = lastOfficials(rid, positions);
  const offErr = KT.officialsCheck(positions, d.officials, (curEvent() || {}).level);
  const part = partOf(dv, m, br);
  const offs = officialsHTML(rid, k === 'fukugo' && part === 'kitei' ? 'kata' : k, positions, d.officials, true);
  let body = '';
  if (k === 'kata') body = sc.method === 'scores' ? scoresPanel(d, sc, out) : flagsPanel(d, sc, 'flags', 'Judges’ flags');
  else if (k === 'kumite') body = kumitePanel(d.log || [], 'log', sc, r, { kogo, kettei: sc.ketteiTime > 0 });
  else if (k === 'teamkumite') body = teamPanel(d, sc, r, out, kogo);
  else if (k === 'fukugo') body = fukugoPanel(d, sc, r, out, part, kogo);
  const kiken = `<div class="row small"><span class="muted">Withdrawal / no-show:</span><button class="sm ${d.kiken === 'a' ? 'danger' : ''}" data-act="kiken" data-s="a">Aka kiken</button><button class="sm ${d.kiken === 'b' ? 'danger' : ''}" data-act="kiken" data-s="b">Shiro kiken</button></div>`;
  const banner = out.done ? `<div class="result-banner">Result: ${esc(entName(out.winner === 'a' ? r.a : r.b))} wins · ${esc(out.method)}</div>` : '';
  const ring = S.d.rings[rid];
  const offNote = out.done && offErr ? `<p class="small" style="color:var(--bad)">${esc(offErr)}</p>` : '';
  const openEl = document.activeElement && document.activeElement.id; const wasOpen = !!root.querySelector('details.officials[open]');
  root.innerHTML = sheet(title + (part ? ` · ${part === 'kitei' ? 'Ki-tei' : 'Kumite'}` : ''), `${offs}${k === 'kumite' || (k === 'fukugo' && part === 'kumite') ? '' : hdr}${body}${banner}${offNote}${kiken}`,
    `${ring ? `<button data-act="call-mat" style="margin-right:auto">Call to ${esc(ring.name)}</button>` : ''}<button data-act="reset-draft">Clear sheet</button><button data-act="modal-close">Close</button><button class="primary" data-act="save-result" ${out.done && !offErr ? '' : 'disabled'}>Confirm result</button>`, sub);
  if (wasOpen) { const dd = root.querySelector('details.officials'); if (dd) dd.open = true; }
  if (openEl && openEl.startsWith('off-')) { const el = document.getElementById(openEl); if (el) el.focus(); }
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
  const dv = DC.divBy[M.did]; if (!dv || S.readOnly) return;
  const rid = matchRing(M.did, M.mid); if (!S.d.rings[rid]) return;
  clearTimeout(liveT);
  liveT = setTimeout(() => {
    const br = S.d.brackets[M.did]; const m = br && br.matches[M.mid]; const d = loadDraft(M.key); const out = evaluate(dv, d, m, br);
    const phase = out.done ? out.method : out.phase === 'kettei' ? 'Kettei-sen' : out.phase === 'hantei' ? 'Hantei' : '';
    S.store.set(P.live(S.evId, 'ringstate', rid), { did: M.did, mid: M.mid, seg: m ? KT.segOf(br, m) : '', score: out.pts || null, phase, log: liveLog(d), at: new Date().toISOString(), by: S.myId || '' }).catch(e => console.warn(e));
  }, 350);
}
function matchRing(did, mid) { const dv = DC.divBy[did], br = S.d.brackets[did]; return br && br.matches[mid] ? KT.ringOf(dv, KT.segOf(br, br.matches[mid]), mid) : dv.ringId; }
/** Last few events of the sheet as readable text for spectators. */
function liveLog(d) {
  const ev = (log, pre) => (log || []).filter(e => e.t !== 'next').map(e => (pre || '') + evText(e));
  let out = ev(d.log);
  (d.bouts || []).forEach((b, i) => { if (b) out = out.concat(ev(b.log, `Round ${i + 1}: `)); });
  if (d.daihyo) out = out.concat(ev(d.daihyo.log, 'Representative: '));
  if (d.flags) { const a = d.flags.filter(x => x === 'a').length, b = d.flags.filter(x => x === 'b').length; if (a + b) out.push(`Flags: Aka ${a} · Shiro ${b}`); }
  if (d.sa || d.sb) { const n = arr => (arr || []).filter(x => x !== '' && x != null).length; out.push(`Scores entered: Aka ${n(d.sa)} · Shiro ${n(d.sb)}`); }
  if (d.kiken) out.push((d.kiken === 'a' ? 'Aka' : 'Shiro') + ' Ki-ken');
  return out.slice(-6);
}
function draftChanged() { const M = S.modal; saveDraft(M.key); renderScore(true); pushLive(); }
async function saveResult() {
  const M = S.modal; const dv = DC.divBy[M.did];
  const br = S.d.brackets[M.did];
  const r = DC.res[M.did][M.mid]; const d = loadDraft(M.key), m = br.matches[M.mid]; const out = evaluate(dv, d, m, br);
  if (!out.done || r.status !== 'ready') return;
  const seg = KT.segOf(br, m), positions = positionsFor(dv, m, br);
  const offErr = KT.officialsCheck(positions, d.officials, (curEvent() || {}).level);
  if (offErr) { toast(offErr, true); return; }
  const officials = {}; for (const p of positions) if ((d.officials || {})[p.key]) officials[p.key] = d.officials[p.key];
  const winnerId = out.winner === 'a' ? r.a : r.b;
  const rec = { winnerId, method: out.method, pts: out.pts || { a: 0, b: 0 }, detail: clone(out.detail || {}), at: new Date().toISOString(), by: S.myId || '' };
  if (Object.keys(officials).length) { rec.officials = officials; rememberOfficials(matchRing(M.did, M.mid), officials); }
  const ok = await guard(() => S.store.update(P.live(S.evId, 'brackets', M.did), { results: { [M.mid]: rec } }));
  if (!ok) return;
  dropDraft(M.key);
  const rid = matchRing(M.did, M.mid);
  if (S.d.rings[rid]) S.store.set(P.live(S.evId, 'ringstate', rid), { did: '', mid: '', at: new Date().toISOString() }).catch(() => {});
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
const KATA_LIST = KT.WTKF_KATA.concat(['Heian Shodan', 'Heian Nidan', 'Heian Sandan', 'Heian Yondan', 'Heian Godan', 'Tekki Shodan', 'Tekki Nidan', 'Tekki Sandan']);
function openKP(did, key) {
  const br = S.d.brackets[did]; if (!br) return;
  const ctx = kpContext(br, key); if (!ctx) return;
  const saved = (br.scores || {})[key];
  const dkey = draftKey(did, key);
  const d = loadDraft(dkey);
  const J = br.judges || 6, dv = DC.divBy[did];
  const withApp = !!br.application && ctx.isFinal && !ctx.rp;
  const seg = KT.kpSegOfKey(br, key), rid = KT.ringOf(dv, seg);
  const positions = KT.officialPositions('kata', J);
  if (!d.officials) d.officials = Object.assign({}, saved && saved.officials ? saved.officials : lastOfficials(rid, positions));
  if (!d.s) { d.s = saved && saved.s ? saved.s.map(String) : Array.from({ length: J }, () => ''); d.kata = saved ? saved.kata : ''; d.hansoku = !!(saved && saved.hansoku); }
  if (withApp && !d.app) d.app = saved && saved.app ? saved.app.map(String) : Array.from({ length: J }, () => '');
  S.modal = { type: 'kp', did, key, dkey, ctx, withApp, seg, rid, positions, refresh: null };
  const can = canScoreKP(did, key), editable = can && (!saved || KT.kpCanEdit(br, key));
  const dis = editable ? '' : 'disabled';
  const row = (field, label) => `<div><div class="label" style="margin-bottom:6px">${label}</div><div class="kprow" style="--j:${J}">${Array.from({ length: J }, (_, i) => `<label class="f"><span style="text-align:center">${i === 0 ? 'Shu-shin' : 'J' + (i + 1)}<span class="tiny jn" data-jn="${i}">${esc(posName(d.officials, i))}</span></span><input id="kp-${field}${i}" data-input="kp-j" data-f="${field}" data-i="${i}" inputmode="decimal" value="${esc((d[field] || [])[i] ?? '')}" ${dis} aria-label="${label} judge ${i + 1}"></label>`).join('')}</div></div>`;
  const kataLabel = br.kataRule ? 'Kata performed' : 'Choreography (optional)';
  const body = `${officialsHTML(rid, 'kata', positions, d.officials, editable)}<div class="corner" style="background:var(--ai-soft);color:var(--ink)"><div class="label">${esc(ctx.label)}</div><div class="who">${esc(entName(ctx.id))}</div><div class="tiny muted">${esc(entDojo(ctx.id))}</div></div>
    <label class="f ${br.kataRule ? 'req' : ''}"><span>${kataLabel}</span><input id="kp-kata" data-input="kp-kata" value="${esc(d.kata || '')}" placeholder="${br.kataRule ? 'e.g. Bassai Dai' : ''}" ${dis} list="kata-list">
      <datalist id="kata-list">${br.kataRule ? KATA_LIST.map(k => `<option value="${k}">`).join('') : ''}</datalist></label>
    ${ctx.rp ? `<p class="small">Kettei-sen: ${br.kataRule ? 'a different kata than the one that tied; ' : ''}this score only breaks the tie and is not added to the total.</p>` : ctx.isFinal && ctx.semiKata && br.kataRule ? `<p class="small">Semifinal kata: <b>${esc(ctx.semiKata)}</b> — the final needs a different kata.</p>` : ''}
    ${row('s', withApp ? 'Kata scores (0.0–10.0)' : `Judges’ scores (0.0–10.0)${J >= 5 ? ' · highest and lowest dropped, average of the rest' : ''}`)}
    ${withApp ? row('app', 'Application (Bunkai) scores') : ''}
    <label class="check"><input type="checkbox" id="kp-hansoku" data-change="kp-hansoku" ${d.hansoku ? 'checked' : ''} ${dis}> Han-soku (zero card — scored 0)</label>
    <div id="kp-sum" class="kp-total"></div><p id="kp-err" class="small" style="color:var(--bad)"></p>
    ${saved && !editable && can ? '<p class="small muted">This score is locked because the next round has started.</p>' : ''}`;
  const recBlock = saved && can ? `<details class="rec" open><summary>Recorded score</summary><div class="stack" style="margin-top:8px">
    ${saved.hansoku ? '<p class="small"><b>Han-soku</b> (zero card) — scored 0.</p>' : `<p class="small">Kata: <b>${esc(saved.kata || '—')}</b></p>${kpRecTable(saved.s, J, withApp || saved.app ? 'Kata' : 'Score')}${saved.app ? kpRecTable(saved.app, J, 'Application') : ''}`}
    ${officialsRec(saved.officials, positions)}${recordedBy(saved)}</div></details>` : '';
  const ring = S.d.rings[rid];
  openModal(sheet(esc(entName(ctx.id)), recBlock + body,
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
  const offErr = KT.officialsCheck(M.positions || [], d.officials, (curEvent() || {}).level);
  if (!err && offErr) err = offErr;
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
    if (M.ctx.isFinal && M.ctx.carry != null && !M.ctx.rp) h += `<span class="small">+ semifinal ${f(M.ctx.carry)} = <b style="font-size:1.4rem">${f(own + M.ctx.carry)}</b></span>`;
    h += `<span class="small muted">all six ${t.all.toFixed(1)} · dropped ${t.hi.toFixed(1)} / ${t.lo.toFixed(1)}</span>`;
  }
  if (sum) sum.innerHTML = h;
  const e = $('#kp-err'); if (e) e.textContent = err;
  const d = loadDraft(M.dkey); document.querySelectorAll('[data-jn]').forEach(el => { el.textContent = posName(d.officials, +el.dataset.jn); });
  const b = $('#kp-save'); if (b) b.disabled = !ok;
}
function kpPushLive(clear) {
  const M = S.modal; const dv = DC.divBy[M.did]; if (!dv || !S.d.rings[M.rid] || S.readOnly) return;
  const d = loadDraft(M.dkey), { t, a, k } = kpEval();
  const n = (d.s || []).filter(x => x !== '' && x != null).length;
  const doc = clear ? { did: '', mid: '', at: new Date().toISOString() } : { did: M.did, kp: M.key, seg: M.seg, kata: d.kata || '', score: t ? ((t.total + (a ? a.total : 0)) / k).toFixed(2) : '', log: [entName(M.ctx.id) + ' · ' + M.ctx.label, d.kata ? 'Kata: ' + d.kata : '', `Scores entered ${n}/${(S.d.brackets[M.did] || {}).judges || 6}`].filter(Boolean), at: new Date().toISOString(), by: S.myId || '' };
  S.store.set(P.live(S.evId, 'ringstate', M.rid), doc).catch(e => console.warn(e));
}
async function kpSave() {
  const M = S.modal, d = loadDraft(M.dkey), ev = kpEval(); if (!ev.ok) return;
  const br = S.d.brackets[M.did];
  const rec = d.hansoku ? { hansoku: true, kata: String(d.kata || '').trim(), at: new Date().toISOString(), by: S.myId || '' }
    : { s: d.s.map(x => +String(x).replace(',', '.')), kata: String(d.kata || '').trim(), at: new Date().toISOString(), by: S.myId || '' };
  if (!d.hansoku && M.withApp) rec.app = d.app.map(x => +String(x).replace(',', '.'));
  const officials = {}; for (const p of M.positions || []) if ((d.officials || {})[p.key]) officials[p.key] = d.officials[p.key];
  if (Object.keys(officials).length) { rec.officials = officials; rememberOfficials(M.rid, officials); }
  const saved = await guard(() => S.store.update(P.live(S.evId, 'brackets', M.did), { scores: { [M.key]: rec } }));
  if (!saved) return;
  kpPushLive(true); dropDraft(M.dkey);
  toast(`${entName(M.ctx.id)} · ${d.hansoku ? 'Han-soku' : ((ev.t.total + (ev.a ? ev.a.total : 0)) / kpKept(br)).toFixed(2)}`);
  closeModal();
}

/* ===== recorded score detail (director / ring manager review) ===== */
function recordedBy(rec) {
  if (!rec) return '';
  const who = rec.by ? ((S.profiles[rec.by] || {}).name || (rec.by === S.myId ? 'you' : 'ring official')) : '';
  if (rec.by && !S.profiles[rec.by]) refreshProfiles([rec.by]);
  const when = rec.at ? new Date(rec.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  return `<p class="tiny muted">Recorded ${esc(when)}${who ? ' by ' + esc(who) : ''}</p>`;
}
function flagsRecHTML(fl, title) {
  fl = fl || [];
  return `<div><div class="label">${esc(title)}</div><div class="rec-flags">${fl.map((x, i) => `<span class="rec-flag ${x === 'a' ? 'a' : 'b'}">${i === 0 ? 'Shu-shin' : 'J' + (i + 1)} · ${x === 'a' ? 'Aka' : 'Shiro'}</span>`).join('')}</div></div>`;
}
function scoresRecHTML(sa, sb, J) {
  const row = (lbl, arr) => {
    const v = (arr || []).map(Number), t = KT.scoreTotal(v, J);
    const hi = Math.max(...v), lo = Math.min(...v); let dh = J >= 5, dl = J >= 5;
    return `<tr><td><b>${lbl}</b></td>${v.map(x => { let c = ''; if (dh && x === hi) { c = 'dropped'; dh = false; } else if (dl && x === lo) { c = 'dropped'; dl = false; } return `<td class="n"><span class="js ${c}">${x.toFixed(1)}</span></td>`; }).join('')}<td class="n"><b>${t ? t.avg.toFixed(2) : ''}</b></td></tr>`;
  };
  return `<div class="tw"><table><thead><tr><th></th>${Array.from({ length: J }, (_, i) => `<th class="n">${i === 0 ? 'Shu-shin' : 'J' + (i + 1)}</th>`).join('')}<th class="n">Score</th></tr></thead><tbody>${row('Aka', sa)}${row('Shiro', sb)}</tbody></table></div>`;
}
/** Event-by-event log with the running score (Shobu Ippon or Ko-go). */
function logRecHTML(log, kogo, names, o) {
  log = log || [];
  if (!log.length) return '<p class="small muted">No events recorded.</p>';
  const E = kogo ? KT.kogoEval : KT.kumiteEval;
  const rows = []; let ex = 1, phase = o && o.ketteiOnly ? 'kettei' : 'regular';
  if (kogo) rows.push(`<tr class="rec-sep"><td colspan="3">Exchange 1 · ${esc(names.a)} (Aka) attacks</td></tr>`);
  log.forEach((e, i) => {
    const after = E(log.slice(0, i + 1), o || {});
    if (e.t === 'next') {
      if (after.phase !== phase) { phase = after.phase; ex = after.exchange; rows.push(`<tr class="rec-sep"><td colspan="3">${phase === 'kettei' ? 'Kettei-sen · exchange 1 · Aka attacks' : phase === 'hantei' ? 'Court Judges meeting (Hantei)' : ''}</td></tr>`); return; }
      if (after.exchange !== ex) { ex = after.exchange; rows.push(`<tr class="rec-sep"><td colspan="3">${phase === 'kettei' ? 'Kettei-sen · ' : ''}Exchange ${ex} · ${after.offense === 'a' ? esc(names.a) + ' (Aka)' : esc(names.b) + ' (Shiro)'} attacks</td></tr>`); }
      return;
    }
    if (e.t === 'timeup' || e.t === 'ketteiend') { rows.push(`<tr class="rec-sep"><td colspan="3">${e.t === 'timeup' ? 'Time up' : 'Kettei-sen time up'}${after.phase === 'kettei' ? ' → Kettei-sen (scores reset)' : after.phase === 'hantei' ? ' → Court Judges (Hantei)' : ''}</td></tr>`); phase = after.phase; return; }
    const who = e.s ? `<span class="belt ${e.s}" style="display:inline-block;height:12px;vertical-align:middle"></span> ${esc(e.s === 'a' ? names.a : names.b)}` : '';
    rows.push(`<tr><td class="num tiny">${i + 1}</td><td>${who} · ${esc((EV_LABEL[e.t] || e.t) + (e.t === 'tento' && e.exec ? ' · penalty match (no points)' : ''))}</td><td class="n">${after.cur ? after.cur.a + '–' + after.cur.b : ''}</td></tr>`);
    if (kogo && e.ae && !after.done) { // exchange ended by this score / penalty
      if (after.phase !== phase) { phase = after.phase; ex = after.exchange; rows.push(`<tr class="rec-sep"><td colspan="3">${phase === 'kettei' ? 'Kettei-sen · exchange 1 · Aka attacks' : phase === 'hantei' ? 'Court Judges meeting (Hantei)' : ''}</td></tr>`); }
      else if (after.exchange !== ex) { ex = after.exchange; rows.push(`<tr class="rec-sep"><td colspan="3">${phase === 'kettei' ? 'Kettei-sen · ' : ''}Exchange ${ex} · ${after.offense === 'a' ? esc(names.a) + ' (Aka)' : esc(names.b) + ' (Shiro)'} attacks</td></tr>`); }
    }
  });
  return `<div class="tw"><table class="rec-log"><thead><tr><th>#</th><th>Event</th><th class="n">Aka–Shiro</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}
function recordHTML(dv, br, m, r) {
  const rec = r.result || {}, d = rec.detail || {}, k = kindOf(dv), sc = scoringOf(dv), kogo = kumiteStyle(dv) === 'kogo';
  const names = { a: entName(r.a), b: entName(r.b) };
  let body = '';
  if (/^Ki-ken/.test(rec.method || '')) body = '<p class="small">Decided by Ki-ken (withdrawal / no-show).</p>';
  else if (k === 'kata') body = d.flags ? flagsRecHTML(d.flags, 'Judges’ flags') : d.sa ? scoresRecHTML(d.sa, d.sb, sc.judges) : '';
  else if (k === 'kumite') body = logRecHTML(d.log, kogo, names);
  else if (k === 'fukugo') body = KT.fukugoPart(m, br) === 'kitei' ? flagsRecHTML(d.flags, 'Ki-tei flags') : logRecHTML(d.log, kogo, names);
  else if (k === 'teamkumite') {
    const ta = DC.teamBy[r.a] || {}, tb = DC.teamBy[r.b] || {};
    const nm = id => { const c = DC.compBy[id]; return c ? `${c.firstName} ${c.lastName}` : ''; };
    body = (d.bouts || []).map((b, i) => b ? `<div class="bout"><b>Round ${i + 1}</b>${logRecHTML(b.log, kogo, { a: nm(b.ma) || ta.name || 'Aka', b: nm(b.mb) || tb.name || 'Shiro' }, { allowDraw: true })}</div>` : '').join('')
      + (d.daihyo && (d.daihyo.log || []).length ? `<div class="bout"><b>Kettei-sen by Representative</b>${logRecHTML(d.daihyo.log, false, { a: nm(d.daihyo.ma) || 'Aka', b: nm(d.daihyo.mb) || 'Shiro' }, { ketteiOnly: true })}</div>` : '');
  }
  return `<details class="rec" open><summary>How this result was recorded</summary><div class="stack" style="margin-top:8px">${body || '<p class="small muted">No detail stored for this result.</p>'}${officialsRec(rec.officials, positionsFor(dv, m, br))}${recordedBy(rec)}</div></details>`;
}

function kpRecTable(arr, J, label) {
  const v = (arr || []).map(Number), t = KT.scoreTotal(v, J); if (!t) return '';
  const hi = Math.max(...v), lo = Math.min(...v); let dh = J >= 5, dl = J >= 5;
  return `<div class="tw"><table><thead><tr><th></th>${v.map((_, i) => `<th class="n">${i === 0 ? 'Shu-shin' : 'J' + (i + 1)}</th>`).join('')}<th class="n">Avg</th></tr></thead><tbody><tr><td><b>${esc(label)}</b></td>${v.map(x => { let c = ''; if (dh && x === hi) { c = 'dropped'; dh = false; } else if (dl && x === lo) { c = 'dropped'; dl = false; } return `<td class="n"><span class="js ${c}">${x.toFixed(1)}</span></td>`; }).join('')}<td class="n"><b>${t.avg.toFixed(2)}</b></td></tr></tbody></table></div>`;
}
