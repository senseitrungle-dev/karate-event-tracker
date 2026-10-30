/* ===== forms & modals ===== */
function eventForm(id) {
  const e = id ? S.events[id] : { kind: 'tournament', level: 'Local', startDate: todayISO(), eventTypes: KT.EVENT_ORDER.slice(), defaultFormat: 'SE', bronze: 'two' };
  const et = new Set(e.eventTypes || KT.EVENT_ORDER);
  openModal(sheet(id ? 'Event settings' : 'New event', `<form id="f-event" data-form="event" data-id="${esc(id || '')}" class="stack">
    <div class="fgrid">
      <label class="f req span"><span>Event name</span><input name="name" id="ev-name" required value="${esc(e.name || '')}" placeholder="e.g. Great Lakes Traditional Karate Championship"></label>
      <label class="f"><span>Type</span><select name="kind" id="ev-kind" data-change="ev-kind">${Object.entries(KT.EVENT_KINDS).map(([k, v]) => opt(k, v, e.kind)).join('')}</select></label>
      <label class="f ev-t" ${e.kind === 'tournament' ? '' : 'hidden'}><span>Level</span><select name="level" id="ev-level">${KT.LEVELS.map(l => opt(l, l, e.level)).join('')}</select></label>
      <label class="f req"><span>Start date</span><input type="date" name="startDate" id="ev-start" required value="${esc(e.startDate || '')}"></label>
      <label class="f"><span>End date</span><input type="date" name="endDate" id="ev-end" value="${esc(e.endDate || '')}"></label>
      <label class="f"><span>Location</span><input name="location" id="ev-loc" value="${esc(e.location || '')}" placeholder="Venue, city"></label>
      <label class="f"><span>Host organization</span><input name="host" id="ev-host" value="${esc(e.host || '')}"></label>
    </div>
    <fieldset class="ev-t" ${e.kind === 'tournament' ? '' : 'hidden'}><legend>Tournament rules</legend><div class="stack">
      <div class="fgrid">
        <label class="f"><span>Ages calculated as of</span><input type="date" name="ageAsOf" id="ev-asof" value="${esc(e.ageAsOf || '')}"><span class="tiny muted">Blank = start date</span></label>
        <label class="f"><span>Default bracket</span><select name="defaultFormat" id="ev-fmt">${Object.entries(KT.FORMATS).map(([k, v]) => opt(k, v, e.defaultFormat)).join('')}</select></label>
        <label class="f"><span>Third place</span><select name="bronze" id="ev-bronze">${opt('two', 'Two bronze medals', e.bronze)}${opt('match', 'Bronze match (one bronze)', e.bronze)}</select></label>
        <label class="f"><span>Minimum judge level</span><select name="judgeMin" id="ev-jmin">${opt('', 'By event level (National/International 3, others 1)', String(e.judgeMin || ''))}${[1, 2, 3, 4, 5, 6, 7].map(x => opt(String(x), 'Level ' + x + (x === 4 ? ' — WTKF Class C' : x === 5 ? ' — Class B' : x === 6 ? ' — Class A' : ''), String(e.judgeMin || ''))).join('')}</select></label>
      </div>
      <div><div class="label" style="margin-bottom:6px">Events offered</div><div class="pill-list">${KT.EVENT_ORDER.map(k => `<label class="check chip plain"><input type="checkbox" data-multi="1" name="eventTypes" value="${k}" ${et.has(k) ? 'checked' : ''}> ${esc(KT.EVENT_TYPES[k].label)}</label>`).join('')}</div></div>
    </div></fieldset>
    <label class="f"><span>Notes</span><textarea name="notes" id="ev-notes">${esc(e.notes || '')}</textarea></label></form>`,
    `${id ? '<button class="danger" data-act="event-delete" style="margin-right:auto">Delete event</button>' : ''}${id && canCreateEvents() ? '<button data-act="event-dup">Duplicate…</button>' : ''}<button data-act="modal-close">Cancel</button><button class="primary" type="submit" form="f-event">${id ? 'Save' : 'Create event'}</button>`));
}

/* ===== v1.46: duplicate an event — settings, competitors (with private details), teams, judges, divisions, rings, sessions ===== */
function dupForm() {
  const ev = curEvent(); if (!ev) return;
  const n = o => Object.keys(S.d[o] || {}).length;
  openModal(sheet('Duplicate event', `<form id="f-dup" data-form="dup" class="stack">
    <p class="small">Makes a new event with this event’s settings, <b>${plural(n('competitors'), 'competitor')}</b>, ${plural(n('teams'), 'team')}, ${plural(n('judges'), 'judge')}, ${plural(n('divisions'), 'division')}, ${plural(n('rings'), 'ring')}${n('sessions') ? ', ' + plural(n('sessions'), 'session') : ''}, and the same directors, ring managers and staff. This event is not changed.</p>
    <div class="fgrid">
      <label class="f span"><span>Name of the copy</span><input name="name" id="dup-name" value="${esc(ev.name + ' (copy)')}" required></label>
      <label class="f"><span>Start date</span><input type="date" name="startDate" id="dup-start" value="${esc(ev.startDate || '')}"></label>
      <label class="f"><span>End date</span><input type="date" name="endDate" id="dup-end" value="${esc(ev.endDate || '')}"></label></div>
    <label class="check"><input type="checkbox" name="keepStatus" id="dup-status"> Keep check-in, payment and waiver status (otherwise everyone starts not checked in, unpaid, no waiver)</label>
    ${n('brackets') ? `<label class="check"><input type="checkbox" name="brackets" id="dup-br"> Also copy the drawn brackets and results (${plural(n('brackets'), 'bracket')})</label>` : ''}
    <p class="tiny muted">Not copied: going live, the public link, ring readiness, who is on the mat, attendance, and approval / archive status.</p></form>`,
    '<button data-act="modal-close">Cancel</button><button class="primary" type="submit" form="f-dup" id="dup-go">Duplicate</button>'));
}
/** Fields of the event document that belong to that event's run, not to its setup. */
const DUP_DROP = ['id', 'live', 'liveAt', 'endedAt', 'locked', 'archived', 'approvedAt', 'approvedBy', 'reopenedAt', 'reopenedBy', 'public', 'shareToken'];
async function duplicateEvent(v) {
  const src = curEvent(), sid = S.evId; if (!src || !canCreateEvents()) return;
  if (!String(v.name || '').trim()) { toast('Give the copy a name.', true); return; }
  const id = uid(), now = new Date().toISOString(), keep = !!v.keepStatus;
  const ev = Object.assign({}, src, { name: String(v.name).trim(), startDate: v.startDate || src.startDate || '', endDate: v.endDate || '', createdAt: now, createdBy: S.myId || '', copiedFrom: sid,
    directorIds: [...new Set((src.directorIds || []).concat(S.myId ? [S.myId] : []))] });
  DUP_DROP.forEach(k => delete ev[k]);
  const D = clone(S.d), btn = $('#dup-go'); if (btn) { btn.disabled = true; btn.textContent = 'Duplicating…'; }
  toast('Duplicating…');
  if (!(await guard(() => S.store.set(P.event(id), ev)))) { if (btn) { btn.disabled = false; btn.textContent = 'Duplicate'; } return; }
  const fresh = (c, x) => keep ? x : c === 'competitors' ? Object.assign(x, { checkedIn: false, feePaid: false, waiver: false }) : c === 'judges' ? Object.assign(x, { checkedIn: false }) : x;
  let n = 0;
  for (const c of ['rings', 'divisions', 'competitors', 'teams', 'judges', 'sessions'])
    for (const [k, x] of Object.entries(D[c] || {})) { if (!(await guard(() => S.store.set(P.doc(id, c, k), fresh(c, x))))) return; n++; }
  for (const [k, x] of Object.entries(D.pv || {})) if (!(await guard(() => S.store.set(P.pv(id, k), x)))) return;
  if (v.brackets) for (const [k, x] of Object.entries(D.brackets || {})) if (!(await guard(() => S.store.set(P.live(id, 'brackets', k), x)))) return;
  closeModal(); openEvent(id);
  toast(`Copy created · ${plural(n, 'record')} copied`);
}
function compForm(id) {
  const ev = curEvent(), tour = ev.kind === 'tournament';
  const c = id ? DC.compBy[id] : { gender: '', events: [], status: 'active' };
  const evs = new Set(c.events || []);
  const offered = (ev.eventTypes || KT.EVENT_ORDER);
  const evRows = tour ? offered.map(et => {
    const T = KT.EVENT_TYPES[et];
    // v1.54: the team (and its division) this competitor is actually on
    if (T.team) { const a = id && evs.has(et) ? compAssigned(c, et) : null;
      return `<div class="row between small" style="gap:6px"><label class="check"><input type="checkbox" data-multi="1" name="events" value="${et}" ${evs.has(et) ? 'checked' : ''}> ${esc(T.label)}</label>${a && a.team
        ? `<button type="button" class="sm ghost assigned" data-act="team-edit" data-id="${esc(a.team.id)}" title="Open the team"><b>${esc(a.team.name)}</b>${a.div ? ' · ' + esc(a.div.name) : ' · <span class="chip bad">no division</span>'} ›</button>`
        : `<span class="muted tiny">${evs.has(et) && id ? '<span class="chip warn">Not on a team yet</span> ' : ''}Assign on the Teams tab</span>`}</div>`; }
    const cand = id ? KT.candidateDivisions(c, et, DC.divs, DC.asOf) : [];
    const all = DC.divs.filter(d => d.eventType === et);
    const ov = (c.divOverride || {})[et] || '';
    return `<div class="row between small" style="gap:6px"><label class="check"><input type="checkbox" data-multi="1" name="events" value="${et}" ${evs.has(et) ? 'checked' : ''}> ${esc(T.label)}</label>
      <select name="ov_${et}" id="ov-${et}" style="max-width:320px" aria-label="${esc(T.label)} division">${opt('', cand.length ? `Auto → ${cand[0].name}` : 'Auto (save to match)', ov)}${all.map(d => opt(d.id, d.name, ov)).join('')}</select>
      ${id && evs.has(et) ? (a => `<div class="tiny assigned-line" style="flex-basis:100%">${a.div ? `In: <b>${esc(a.div.name)}</b>` : '<span class="chip bad">No division yet</span>'}</div>`)(compAssigned(c, et)) : ''}</div>`;
  }).join('') : '';
  openModal(sheet(id ? `${esc(c.firstName)} ${esc(c.lastName)}` : (tour ? 'Register competitor' : 'Add participant'), `<form id="f-comp" data-form="comp" data-id="${esc(id || '')}" class="stack">
    <fieldset><legend>Competitor</legend><div class="fgrid">
      <label class="f req"><span>First name</span><input name="firstName" id="c-first" required value="${esc(c.firstName || '')}"></label>
      <label class="f req"><span>Last name</span><input name="lastName" id="c-last" required value="${esc(c.lastName || '')}"></label>
      <label class="f ${tour ? 'req' : ''}"><span>Gender</span><select name="gender" id="c-gender" ${tour ? 'required' : ''}>${opt('', 'Select…', c.gender)}${opt('M', 'Male', c.gender)}${opt('F', 'Female', c.gender)}</select></label>
      ${yobOnly() ? `<label class="f ${tour ? 'req' : ''}"><span>Year of birth</span><input type="text" inputmode="numeric" maxlength="4" autocomplete="off" name="yobText" id="c-yob" ${tour ? 'required' : ''} value="${esc(c.birthYear || (c.dob || '').slice(0, 4))}" placeholder="YYYY" data-input="yob-type"><span class="tiny muted" id="c-yob-out">${c.birthYear || c.dob ? esc(yobRead(c.birthYear || (c.dob || '').slice(0, 4))) : 'International event: only the year is kept (age on 31 Dec)'}</span></label>` : `<label class="f ${tour ? 'req' : ''}"><span>Date of birth · ${dobFmt()}</span><input type="text" inputmode="numeric" autocomplete="off" name="dobText" id="c-dob" ${tour ? 'required' : ''} value="${esc(dobShow(c.dob))}" placeholder="${dobFmt()}" data-input="dob-type"><span class="tiny muted" id="c-dob-out">${c.dob ? esc(dobRead(c.dob)) : 'Type the full year, e.g. ' + (dobOrderNow() === 'MDY' ? '07/27/2012' : '27/07/2012')}</span></label>`}
      <label class="f req"><span>Rank</span><select name="rank" id="c-rank" required>${rankOptions(c.rank)}</select></label>
      <label class="f req"><span>Dojo / club</span><input name="dojo" id="c-dojo" required value="${esc(c.dojo || '')}" list="dojo-list"><datalist id="dojo-list">${[...new Set(DC.comps.map(x => x.dojo).filter(Boolean))].map(d => `<option value="${esc(d)}">`).join('')}</datalist></label>
      <label class="f"><span>State / region</span><input name="state" id="c-state" value="${esc(c.state || '')}"></label>
      <label class="f"><span>Country</span><input name="country" id="c-country" value="${esc(c.country || '')}"></label>
    </div></fieldset>
    <fieldset><legend>Contact &amp; emergency (directors only)</legend><div class="fgrid">
      <label class="f"><span>Email</span><input type="email" name="email" id="c-email" value="${esc(c.email || '')}"></label>
      <label class="f"><span>Phone</span><input type="tel" name="phone" id="c-phone" value="${esc(c.phone || '')}"></label>
      <label class="f req"><span>Emergency contact</span><input name="emergencyName" id="c-ename" value="${esc(c.emergencyName || '')}"></label>
      <label class="f req"><span>Emergency phone</span><input type="tel" name="emergencyPhone" id="c-ephone" value="${esc(c.emergencyPhone || '')}"></label>
    </div></fieldset>
    <fieldset><legend>Registration</legend><div class="row" style="gap:18px">
      <label class="check"><input type="checkbox" name="waiver" id="c-waiver" ${c.waiver ? 'checked' : ''}> Waiver signed <span style="color:var(--aka)">*</span></label>
      <label class="check"><input type="checkbox" name="feePaid" id="c-paid" ${c.feePaid ? 'checked' : ''}> Fee paid</label>
      <label class="check"><input type="checkbox" name="checkedIn" id="c-in" ${c.checkedIn ? 'checked' : ''}> Checked in</label>
      <label class="f" style="max-width:140px"><span>Amount paid</span><input name="feeAmount" id="c-fee" inputmode="decimal" value="${esc(c.feeAmount || '')}"></label>
      <label class="f" style="max-width:180px"><span>Status</span><select name="status" id="c-status">${opt('active', 'Active', c.status)}${opt('withdrawn', 'Withdrawn', c.status)}</select></label></div></fieldset>
    ${tour ? `<fieldset><legend>Events entered</legend><div class="stack" style="gap:8px">${evRows}</div><p class="tiny muted" style="margin-top:8px">Divisions are matched automatically by gender, age on ${fmtDate(DC.asOf)} and rank. Choose a division only to override.</p></fieldset>` : ''}
    <label class="f"><span>Notes (directors only)</span><textarea name="notes" id="c-notes">${esc(c.notes || '')}</textarea></label>
    <p id="c-miss" class="small" style="color:var(--warn)"></p></form>`,
    `${id ? '<button class="danger" data-act="comp-delete" style="margin-right:auto">Delete</button>' : ''}<button data-act="modal-close">Cancel</button><button class="primary" type="submit" form="f-comp">Save</button>`));
}
const PV_FIELDS = ['dob', 'birthYear', 'email', 'phone', 'emergencyName', 'emergencyPhone', 'feeAmount', 'notes'];
/* v1.35: birth date typed as text (the browser date picker can't take a typed year on some phones) — same reading rules as the import */
/* v1.37: International events keep only the year of birth (GDPR data minimisation; WTKF ages are by birth year) */
function yobOnly(ev) { ev = ev || curEvent(); return !!ev && ev.level === 'International'; }
function yearOf(txt) { const m = String(txt || '').match(/(?:^|\D)((?:19|20)\d\d)(?:\D|$)/); return m ? +m[1] : null; }
function yobRead(y) { const a = KT.ageFromYear(y, DC.asOf); return `Born ${y}${a != null ? ` · age ${a} in ${String(DC.asOf).slice(0, 4)} (on 31 Dec)` : ''}`; }
function dobOrderNow() { return dateOrder([], [], 'auto').order; }
function dobFmt() { return dobOrderNow() === 'MDY' ? 'MM/DD/YYYY' : 'DD/MM/YYYY'; }
function dobShow(iso) { if (!iso) return ''; const [y, m, d] = iso.split('-'); return dobOrderNow() === 'MDY' ? `${m}/${d}/${y}` : `${d}/${m}/${y}`; }
function dobRead(iso) { const a = KT.ageOn(iso, DC.asOf); return new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) + (a != null ? ` · age ${a} on ${fmtDate(DC.asOf)}` : ''); }
function dobParse(txt) { txt = String(txt || '').trim(); if (!txt) return ''; return importDate(txt.replace(/\s+/g, ''), dobOrderNow()); }
async function saveComp(form) {
  const ev = curEvent(), id = form.dataset.id || uid(), v = fd(form);
  if (v.yobText != null) { const t = String(v.yobText).trim(), y = /^\d{4}$/.test(t) ? +t : null; delete v.yobText;
    if (t && !(y > 1900 && y <= new Date().getFullYear())) { toast(`“${t}” is not a year of birth — type 4 digits, e.g. 2011.`, true); return; }
    v.birthYear = y ? String(y) : ''; v.dob = ''; }
  if (v.dobText != null) { const t = String(v.dobText).trim(); v.dob = dobParse(t); delete v.dobText; if (t && !v.dob) { toast(`“${t}” is not a date — type it as ${dobFmt()} (or YYYY-MM-DD).`, true); return; } }
  const tour = ev.kind === 'tournament';
  if (!v.firstName || !v.lastName || !v.rank || (tour && (!v.gender || !(v.dob || v.birthYear)))) { toast('Name, rank' + (tour ? `, gender and ${yobOnly() ? 'year' : 'date'} of birth are` : ' are') + ' required.', true); return; }
  const divOverride = {};
  for (const k of Object.keys(v)) if (k.startsWith('ov_')) { if (v[k]) divOverride[k.slice(3)] = v[k]; delete v[k]; }
  const pub = { firstName: v.firstName, lastName: v.lastName, gender: v.gender, rank: v.rank, dojo: v.dojo, state: v.state, country: v.country,
    waiver: v.waiver, feePaid: v.feePaid, checkedIn: v.checkedIn, status: v.status || 'active', events: v.events || [], divOverride,
    age: v.dob ? KT.ageOn(v.dob, DC.asOf) : v.birthYear ? KT.ageFromYear(v.birthYear, DC.asOf) : null, updatedAt: new Date().toISOString() };
  const old = DC.compBy[form.dataset.id];
  if (old && old.createdAt) pub.createdAt = old.createdAt; else pub.createdAt = new Date().toISOString();
  const pv = {}; PV_FIELDS.forEach(k => { pv[k] = v[k] || ''; });
  const ok = await guard(async () => { await S.store.set(P.doc(S.evId, 'competitors', id), pub); await S.store.set(P.pv(S.evId, id), pv); }, 'Saved');
  if (ok) closeModal();
}

function importForm() {
  openModal(sheet('Import competitors', `<p class="small">Paste CSV text or choose a .csv file. It needs a row of column headings (it doesn’t have to be the first row) with at least a name column. Every recognised column is imported; anything missing is listed and the competitors are marked <b>Incomplete</b> so the details can be entered later. Check shows everything before you import. Recognised columns:</p>
    <p class="tiny mono muted">first_name, last_name (or one name column: “Last, First” / “First Last”), gender, dob, rank, dojo, state, country, email, phone, emergency_name, emergency_phone, waiver, paid, events</p>
    <p class="tiny muted">Birth dates: YYYY-MM-DD, or day and month in either order — <b>day-month-year</b> (Europe and most countries, 27.07.2012 or 27/07/2012) or <b>month-day-year</b> (USA, 07/27/2012). The order is worked out for the whole file (from dates like 27.07 that can only be one way, then the country); you can set it below · ranks like “3rd Kyu”, “Shodan”, “2nd Dan”, “1 dan”, k3, d2 · events either separated by “;” in an events column (Individual Kata; Individual Kumite; Team Kata; Team Kumite; Fukugo; Enbu) or one column per event marked X.</p>
    <p class="tiny muted"><b>WTKF National Federation registration sheet</b>: choose the .csv as it is (File → Save As → CSV UTF-8 in Excel). The country and federation are read from the top of the sheet; the judges/coaches and photographer sections are skipped. Names typed in capitals are changed to Name Case. People already registered (same name and birth date) are skipped.</p>
    <label class="f" style="max-width:420px"><span>Birth dates are</span><select id="imp-dates" data-change="imp-dates">${opt('auto', 'Work it out (recommended)', 'auto')}${opt('DMY', 'Day-month-year · Europe & most countries (27.07.2012)', '')}${opt('MDY', 'Month-day-year · USA (07/27/2012)', '')}</select></label>
    <input type="file" id="imp-file" accept=".csv,text/csv" data-change="imp-file">
    <textarea id="imp-text" rows="10" placeholder="first_name,last_name,gender,dob,rank,dojo,events&#10;Aiko,Tanaka,F,2001-04-12,Shodan,Hoshi Dojo,Individual Kata;Individual Kumite"></textarea>
    <div id="imp-preview" class="small muted"></div>`,
    `<button data-act="modal-close">Cancel</button><button data-act="imp-preview">Check</button><button class="primary" data-act="imp-run">Import</button>`), { wide: true });
}
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}
const EV_ALIASES = { 'individual kata': 'IKATA', kata: 'IKATA', ikata: 'IKATA', 'individual kumite': 'IKUMITE', kumite: 'IKUMITE', ikumite: 'IKUMITE', 'team kata': 'TKATA', tkata: 'TKATA',
  'team kumite': 'TKUMITE', tkumite: 'TKUMITE', fukugo: 'FUKUGO', fukogo: 'FUKUGO', enbu: 'ENBU' };
/* v1.26: also reads the WTKF "Informational Spreadsheet for National Federations" (title rows, COUNTRY / National Federation,
   ATHLETES INFORMATION table with an X per event, then JUDGES/COACHES and PHOTOGRAPHER sections which are skipped). */
const EV_COLS = { individualkata: 'IKATA', kata: 'IKATA', individualkumite: 'IKUMITE', kumite: 'IKUMITE', teamkata: 'TKATA', teamkumite: 'TKUMITE',
  fukugo: 'FUKUGO', fukogo: 'FUKUGO', enbu: 'ENBU', mixedenbu: 'ENBU', manmanenbu: 'ENBU', womanwomanenbu: 'ENBU', menenbu: 'ENBU', womenenbu: 'ENBU' };
const normH = x => String(x || '').toLowerCase().replace(/[^a-z]/g, '');
/* v1.28: birth-date order per file. Europe and most of the world write day-month-year (27.07.2012), the USA month-day-year (07/27/2012).
   The separator says nothing, so the order is decided once per file: 1) the director's choice, 2) the dates themselves (a first number
   above 12 can only be a day, a second number above 12 can only be a day), 3) the country on the sheet / in the rows (USA → month first),
   4) otherwise day first. Year-first dates (2012-07-27) are always year-month-day. 8 digits without separators (27072012) follow the same order. */
const US_NAMES = /^(us|usa|u\.s\.a?\.?|united states( of america)?|america|puerto rico|guam)$/i;
function splitDate(s) {
  s = String(s || '').trim(); let k;
  if ((k = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/))) return { ymd: true, y: k[1], a: +k[2], b: +k[3] };
  if ((k = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})$/))) return { a: +k[1], b: +k[2], y: k[3] };
  if ((k = s.match(/^(\d{2})(\d{2})(\d{4})$/))) return { a: +k[1], b: +k[2], y: k[3] };
  // v1.59: two-digit years (5/12/06, 11/6/96 — Google / Numbers forms): the most recent year that is not in the future
  if ((k = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})$/))) return { a: +k[1], b: +k[2], y: String(fullYear(+k[3])) };
  return null;
}
/** v1.59: a long form question as a column heading, shortened for the preview ("Waiver By filling out this form…") */
function impShort(h) { h = String(h || '').replace(/\s+/g, ' ').trim(); return h.length > 48 ? h.slice(0, 45).replace(/\s+\S*$/, '') + '…' : h; }
/** "06" → 2006, "96" → 1996: a birth year is never in the future (relative to today). */
function fullYear(yy) { const now = new Date().getFullYear(), c = Math.floor(now / 100) * 100; return c + yy > now ? c - 100 + yy : c + yy; }
/** decide day-first (DMY) or month-first (MDY) for a list of raw dates; returns { order, why, clash } */
function dateOrder(raw, countries, choice) {
  if (choice === 'DMY' || choice === 'MDY') return { order: choice, why: 'chosen by you' };
  const ps = raw.map(splitDate).filter(p => p && !p.ymd);
  const dayFirst = ps.find(p => p.a > 12 && p.b <= 12), monFirst = ps.find(p => p.b > 12 && p.a <= 12);
  const ex = p => `${String(p.a).padStart(2, '0')}·${String(p.b).padStart(2, '0')}·${p.y}`;
  const us = countries.filter(Boolean).some(c => US_NAMES.test(String(c).trim())), other = countries.filter(Boolean).some(c => !US_NAMES.test(String(c).trim()));
  const byCountry = us && !other ? { order: 'MDY', why: 'country USA' } : other && !us ? { order: 'DMY', why: 'country outside the USA' } : null;
  if (dayFirst && monFirst) return Object.assign({ clash: true }, byCountry || { order: 'DMY', why: 'mixed dates — check the file' }, { why: `the file mixes both orders (${ex(dayFirst)} and ${ex(monFirst)})` });
  if (dayFirst) return { order: 'DMY', why: `dates like ${ex(dayFirst)} can only be day-month-year` };
  if (monFirst) return { order: 'MDY', why: `dates like ${ex(monFirst)} can only be month-day-year` };
  if (byCountry) return byCountry;
  const loc = String((curEvent() || {}).location || '');
  if (/\b(USA|U\.S\.A?\.?|United States)\b|,\s*(A[LKZR]|C[AOT]|D[EC]|FL|GA|HI|I[ADLN]|K[SY]|LA|M[ADEINOST]|N[CDEHJMVY]|O[HKR]|PA|RI|S[CD]|T[NX]|UT|V[AT]|W[AIVY])\b/.test(loc)) return { order: 'MDY', why: 'the event is in the USA' };
  const lang = (navigator.languages && navigator.languages[0]) || navigator.language || '';
  if (/^en-US$/i.test(lang)) return { order: 'MDY', why: 'nothing in the file decides it — your device uses US dates' };
  return { order: 'DMY', why: 'nothing in the file decides it — day first assumed' };
}
/** raw date → yyyy-mm-dd in the given order ('' if impossible) */
function importDate(s, order) {
  const p = splitDate(s); if (!p) return '';
  const [m, d] = p.ymd ? [p.a, p.b] : order === 'MDY' ? [p.a, p.b] : [p.b, p.a];
  const iso = `${p.y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`, t = new Date(iso + 'T00:00:00Z');
  return !isNaN(t) && t.toISOString().slice(0, 10) === iso ? iso : '';
}
/** "ANNA-MARIA" → "Anna-Maria" when a name is typed in capitals; mixed-case names are kept as typed */
function nameCase(s) {
  s = String(s || '').trim().replace(/\s+/g, ' ');
  if (!s || s !== s.toUpperCase() || s === s.toLowerCase()) return s;
  return s.toLowerCase().replace(/(^|[\s\-'’])(\S)/g, (_, a, c) => a + c.toUpperCase());
}
/** CSV file bytes → text: UTF-8 when valid, otherwise the Windows code page Excel used (Central-European for PL/CZ/SK/HU/HR/SI/RO, else Western) */
function decodeCsvBytes(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { /* not UTF-8 */ }
  const west = new TextDecoder('windows-1252').decode(buf);
  if (/POLAND|POLSKA|CZECH|SLOVAK|HUNGAR|CROATIA|SLOVENIA|ROMANIA|SERBIA|BOSNIA|ALBANIA/i.test(west)) { try { return new TextDecoder('windows-1250').decode(buf); } catch (e) { /* no cp1250 */ } }
  return west;
}
function titleWord(s) { return nameCase(String(s || '').trim()); }
function importRows(text) {
  const rows = parseCSV(String(text || '').replace(/^﻿/, ''));
  // heading row = first row that names both first and last name (not necessarily row 1)
  const FIRST = ['firstname', 'first', 'givenname', 'fname'], LAST = ['lastname', 'last', 'surname', 'familyname', 'lname'], FULL = ['name', 'fullname', 'competitor', 'competitorname', 'athlete', 'athletename', 'participant', 'participantname', 'student', 'studentname'];
  let hi = rows.findIndex(r => { const h = r.map(normH); return h.some(x => FIRST.includes(x)) && h.some(x => LAST.includes(x)); });
  if (hi < 0) hi = rows.slice(0, 20).findIndex(r => r.map(normH).some(x => FULL.includes(x) || FIRST.includes(x) || LAST.includes(x)));   // v1.34: one name column is enough
  if (hi < 0 || hi >= rows.length - 1) return { recs: [], errors: ['No name column found. The file needs a heading row with a name column (Name, or First Name and Last Name) and at least one competitor.'], info: { noName: true } };
  // federation sheet: title rows above the table
  const info = { sheet: false, country: '', federation: '', skipped: [] };
  const after = (r, i) => { for (let j = i + 1; j < r.length; j++) if (String(r[j] || '').trim() && !/^(name|email|phone)/i.test(r[j].trim())) return r[j].trim(); return ''; };
  rows.slice(0, hi).forEach(r => r.forEach((c, i) => {
    const n = normH(c);
    if (n === 'country' && !info.country) info.country = titleWord(after(r, i));
    if ((n === 'nationalfederation' || n === 'federation') && !info.federation) info.federation = titleWord(after(r, i));
    if (/athletesinformation|registrationandfee/.test(n)) info.sheet = true;
  }));
  const h = rows[hi].map(normH);
  const col = (...names) => h.findIndex(x => names.includes(x));
  // v1.59: form questions often carry an explanation after the name ("Waiver By filling out this form…"): match the start of the heading
  const colStart = (...names) => { const i = col(...names); return i >= 0 ? i : h.findIndex(x => x.length > 12 && names.some(n => n.length >= 6 && x.startsWith(n))); };
  const ix = { first: col(...FIRST), last: col(...LAST), name: col(...FULL), gender: col('gender', 'sex'),
    dob: col('dob', 'dateofbirth', 'birthdate', 'birthday', 'born'), age: col('age'), yob: col('yearofbirth', 'birthyear', 'yob', 'yearborn'),
    rank: col('rank', 'belt', 'grade', 'kyu', 'beltrank'), dojo: col('dojo', 'club', 'school', 'team'), state: col('state', 'region', 'province'), country: col('country', 'nation'), email: col('email'), phone: col('phone', 'mobile'),
    en: col('emergencyname', 'emergencycontact', 'emergency', 'emergencycontactname', 'parentname', 'parent', 'guardian'), ep: col('emergencyphone', 'emergencycontactphone', 'parentphone', 'guardianphone'), waiver: colStart('waiver', 'waiversigned', 'liabilitywaiver', 'releaseofliability'), paid: col('paid', 'feepaid'), events: col('events', 'event', 'divisions'),
    fee: h.findIndex(x => /^(participationfee|fee|entryfee)/.test(x)) };
  // one column per event, ticked with X — or a form question whose heading starts with the event ("Team Kata (Name, Member's Names) …")
  const evStart = x => Object.keys(EV_COLS).filter(k => k.length >= 6 && x.length > k.length && x.startsWith(k)).sort((a, b) => b.length - a.length)[0];
  const evCols = h.map((x, i) => [i, EV_COLS[x] || (i !== ix.events && i !== ix.waiver && evStart(x) ? EV_COLS[evStart(x)] : null)]).filter(([, e]) => e);
  // v1.34: column scan — recognised, required but not in the file, ignored
  const LBL = { first: 'First name', last: 'Last name', name: 'Name', gender: 'Gender', dob: 'Date of birth', rank: 'Rank', dojo: 'Dojo / club', state: 'State / region', country: 'Country', email: 'Email', phone: 'Phone',
    en: 'Emergency contact', ep: 'Emergency phone', waiver: 'Waiver', paid: 'Paid', events: 'Events', fee: 'Fee' };
  const raw = rows[hi].map(x => String(x || '').trim());
  info.cols = Object.entries(LBL).filter(([k]) => ix[k] >= 0).map(([k, l]) => ({ label: l, header: raw[ix[k]] }));
  if (ix.age >= 0 && ix.dob < 0) info.cols.push({ label: 'Date of birth', header: raw[ix.age] });
  if (ix.yob >= 0) info.cols.push({ label: 'Year of birth', header: raw[ix.yob] });
  const yo = yobOnly(); info.yobOnly = yo;
  evCols.forEach(([i, e]) => info.cols.push({ label: KT.EVENT_TYPES[e].label, header: raw[i] }));
  const used = new Set([...Object.values(ix).filter(i => i >= 0), ...evCols.map(([i]) => i)]);
  info.ignored = raw.map((x, i) => (x && !used.has(i) && !/^(#|no\.?|nr|number)$/i.test(x) ? x : '')).filter(Boolean);
  const isT = curEvent().kind === 'tournament';
  info.missingCols = [
    ix.first < 0 && ix.last < 0 && ix.name < 0 ? 'Name' : '',
    ix.first < 0 && ix.name >= 0 ? '' : ix.first < 0 ? 'First name' : '', ix.last < 0 && ix.name < 0 && ix.first >= 0 ? 'Last name' : '',
    ix.gender < 0 && isT ? 'Gender' : '', ix.dob < 0 && ix.age < 0 && ix.yob < 0 && isT ? (yo ? 'Year of birth' : 'Date of birth') : '', ix.rank < 0 ? 'Rank' : '', ix.dojo < 0 && !info.federation ? 'Dojo / club' : '',
    ix.en < 0 || ix.ep < 0 ? 'Emergency contact' : '', ix.waiver < 0 ? 'Waiver' : '', isT && ix.events < 0 && !evCols.length ? 'Events' : ''].filter(Boolean);
  const recs = [], errors = [];
  const g = (r, i) => (i >= 0 ? (r[i] || '').trim() : '');
  const yes = s => /^(y|yes|true|1|x|✓|✔|i agree|agree|agreed|i accept|accept|accepted|signed|i have read and agree)$/i.test(String(s || '').trim().replace(/[.!]+$/, ''));
  // v1.55: an event column counts as entered when it holds anything but a blank or a "no" (e.g. X, or the division name from our own export)
  const entered = s => !!String(s || '').trim() && !/^(n|no|false|0|-|–|—)$/i.test(String(s).trim());
  const body = rows.slice(hi + 1);
  const rawDate = r => g(r, ix.dob) || (ix.age >= 0 && splitDate(g(r, ix.age)) ? g(r, ix.age) : '');
  const dord = dateOrder(body.map(rawDate).filter(Boolean), [info.country, ...body.map(r => g(r, ix.country))], (($('#imp-dates') || {}).value) || 'auto');
  if (body.some(r => rawDate(r)) && !yobOnly()) info.dates = dord;     // only talk about date order when the file has dates (year-only events don't need it)
  const isTournament = curEvent().kind === 'tournament';
  const yrOf = c => String(c.birthYear || (c.dob || '').slice(0, 4) || '');
  // year only (international): same name + same year + same country / dojo = same person
  const whoKey = (f, l, c) => [normH(f), normH(l)].concat(yobOnly() ? [yrOf(c), normH(c.country || c.dojo)] : [c.dob || '']).join('|');
  const seen = new Map(DC.comps.map(c => [whoKey(c.firstName, c.lastName, c), c]));
  for (let n = hi + 1; n < rows.length; n++) {
    const r = rows[n], lead = String(r[0] || '').trim();
    // next section of a federation sheet (JUDGES/COACHES, PHOTOGRAPHER, TOTAL FEES …) ends the athlete table
    if (lead && !/^\d+$/.test(lead) && /[A-Za-z]{4,}/.test(lead) && !g(r, ix.first) && !g(r, ix.last) && (ix.name < 0 || ix.name === 0 && info.sheet)) { info.skipped.push(lead.replace(/\s+/g, ' ')); break; }
    if (r.map(normH).some(x => x === 'firstname') && r.map(normH).some(x => x === 'lastname')) break;
    // one name column: "Last, First" or "First Last"
    let fn = g(r, ix.first), ln = g(r, ix.last);
    if (!fn && !ln && ix.name >= 0) { const full = g(r, ix.name); if (full.includes(',')) { [ln, fn] = full.split(/,(.*)/).map(x => (x || '').trim()); } else { const w = full.split(/\s+/).filter(Boolean); ln = w.length > 1 ? w.pop() : w[0] || ''; fn = w.length ? w.join(' ') : ''; } }
    if (!fn && !ln) {                                          // empty numbered slot / no name — nothing to import
      if (r.some((x, i) => String(x || '').trim() && !(i === 0 && /^\d+$/.test(String(x).trim())) && !/^(free|\$?0(\.00)?)$/i.test(String(x).trim()))) errors.push(`Row ${n + 1}: no name — not imported`);
      continue;
    }
    const dob = importDate(rawDate(r), dord.order);   // the federation sheet puts the birth date under "Age"
    const gs = g(r, ix.gender).toLowerCase();
    const evText = g(r, ix.events).split(/[;|,]/).map(s => EV_ALIASES[s.trim().toLowerCase()] || (KT.EVENT_TYPES[s.trim().toUpperCase()] ? s.trim().toUpperCase() : null));
    const fee = g(r, ix.fee).replace(/[^0-9.]/g, '');
    const rec = { firstName: nameCase(fn), lastName: nameCase(ln), gender: /^(m|male|man|men|boy)$/.test(gs) ? 'M' : /^(f|female|w|woman|women|girl)$/.test(gs) ? 'F' : '',
      dob, rank: parseRank(g(r, ix.rank)), dojo: g(r, ix.dojo) || info.federation, state: g(r, ix.state), country: titleWord(g(r, ix.country)) || info.country, email: g(r, ix.email), phone: g(r, ix.phone),
      emergencyName: g(r, ix.en), emergencyPhone: g(r, ix.ep), waiver: yes(g(r, ix.waiver)), feePaid: yes(g(r, ix.paid)), feeAmount: fee && +fee ? String(+fee) : '',
      events: [...new Set([...evText, ...evCols.filter(([i]) => entered(g(r, i))).map(([, e]) => e)].filter(Boolean))],
      // v1.59: what was written in a team-event column (team name, members) is kept in the director's notes for making the teams
      notes: evCols.filter(([i, e]) => KT.EVENT_TYPES[e].team && entered(g(r, i)) && !yes(g(r, i))).map(([i, e]) => `${KT.EVENT_TYPES[e].label}: ${g(r, i)}`).join('\n') };
    // v1.34: never drop a named competitor for missing details — import what is there and flag the rest for entry later
    const miss = [], bad = (v, l) => (v ? `${l} (“${v}” not recognised)` : l);
    if (!rec.firstName) miss.push('First name'); if (!rec.lastName) miss.push('Last name');
    if (isTournament && !rec.gender) miss.push(bad(g(r, ix.gender), 'Gender'));
    if (yobOnly()) {               // keep only the year; the day and month are never stored
      const y = yearOf(g(r, ix.yob)) || yearOf(rawDate(r)) || yearOf(g(r, ix.age));
      rec.birthYear = y ? String(y) : ''; rec.dob = '';
      if (isTournament && !y) miss.push(rawDate(r) || g(r, ix.yob) ? `Year of birth (“${g(r, ix.yob) || rawDate(r)}” has no year)` : 'Year of birth');
    } else
    if (isTournament && !rec.dob) miss.push(rawDate(r) ? `Date of birth (“${rawDate(r)}” is not a date as ${dord.order === 'MDY' ? 'month-day-year' : 'day-month-year'})` : 'Date of birth');
    if (!rec.rank) miss.push(bad(g(r, ix.rank), 'Rank'));
    if (!rec.dojo) miss.push('Dojo / club');
    if (!rec.emergencyName || !rec.emergencyPhone) miss.push('Emergency contact');
    if (!rec.waiver) miss.push('Signed waiver');
    if (isTournament && !rec.events.length) miss.push('Events');
    rec.missing = miss; rec.row = n + 1;
    const who = `${rec.firstName} ${rec.lastName}`.trim();
    const key = whoKey(rec.firstName, rec.lastName, rec);
    const had = seen.get(key);
    if (had) {
      // same person; a name that lost its accents (“?”) is corrected from this file
      if (/\?/.test(had.firstName + had.lastName) && !/\?/.test(rec.firstName + rec.lastName)) { recs.push({ ...rec, fixId: had.id, was: `${had.firstName} ${had.lastName}` }); seen.set(key, rec); continue; }
      errors.push(`Row ${n + 1} · ${who}: already registered — skipped`); continue;
    }
    seen.set(key, rec);
    if (/\?/.test(rec.firstName + rec.lastName)) rec.warn = true;
    recs.push(rec);
  }
  return { recs, errors, info };
}
function importPreviewHTML() {
  const { recs, errors, info } = importRows($('#imp-text').value);
  const evs = e => (e || []).map(x => KT.EVENT_TYPES[x].short).join(', ') || '<span class="muted">none</span>';
  const head = info && info.sheet ? `<div class="notice info" style="display:block"><b>WTKF National Federation sheet</b>${info.country ? ' · ' + esc(info.country) : ''}${info.federation ? ' · ' + esc(info.federation) : ''}<br><span class="tiny">Athletes are imported with country ${esc(info.country || '—')} and dojo/club “${esc(info.federation || '—')}”. ${info.skipped.length ? 'Sections after the athletes (' + esc(info.skipped.join(', ')) + ' …) are not competitors and are skipped.' : ''}</span></div>` : '';
  const warn = recs.some(r => r.warn) ? `<div class="notice warn" style="display:block">Some names contain “?” — the file lost its accented letters (e.g. Ł, Ń, Ę) when it was saved. In Excel use <b>File → Save As → CSV UTF-8</b> and import that file, or fix the names after importing.</div>` : '';
  const isT = curEvent().kind === 'tournament';
  const cell = (v, need) => v ? esc(v) : need ? '<span class="imp-miss">missing</span>' : '<span class="muted">—</span>';
  const born = r => r.birthYear ? r.birthYear : r.dob ? new Date(r.dob + 'T12:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const tbl = recs.length ? `<div class="tw imp-wrap"><table class="imp-tbl"><thead><tr><th>#</th><th>Name</th><th>G</th><th>${info.yobOnly ? 'Born (year)' : 'Born'}</th><th>Rank</th><th>Dojo / club</th><th>${info.country || recs.some(r => r.country) ? 'Country' : 'State / region'}</th>${isT ? '<th>Events</th>' : ''}<th>Emergency</th><th>Waiver</th><th>Needs later</th></tr></thead><tbody>${recs.map((r, i) => `<tr class="${r.warn ? 'imp-warn' : ''}${(r.missing || []).length ? ' imp-inc' : ''}"><td class="n">${i + 1}</td><td>${cell([r.lastName, r.firstName].filter(Boolean).join(', '), true)}${r.fixId ? ' <span class="chip ok">name fix</span>' : ''}</td><td>${r.gender ? (r.gender === 'F' ? 'W' : 'M') : cell('', isT)}</td><td class="mono" title="year-month-day">${cell(born(r), isT)}</td><td>${r.rank ? esc(KT.rankLabel(r.rank)) : cell('', true)}</td><td>${cell(r.dojo, true)}</td><td>${cell(r.country || r.state, false)}</td>${isT ? `<td>${r.events.length ? evs(r.events) : cell('', true)}</td>` : ''}<td>${r.emergencyName || r.emergencyPhone ? esc([r.emergencyName, r.emergencyPhone].filter(Boolean).join(' · ')) : cell('', true)}</td><td>${r.waiver ? '✓' : cell('', true)}</td><td class="imp-need">${(r.missing || []).map(esc).join(', ')}</td></tr>`).join('')}</tbody></table></div>` : '';
  const fixes = recs.filter(r => r.fixId), adds = recs.length - fixes.length;
  const dd = info && info.dates, dline = dd ? `<div class="notice ${dd.clash ? 'warn' : 'info'}" style="display:block">Birth dates read as <b>${dd.order === 'MDY' ? 'month-day-year (USA, 07/27/2012 = July 27)' : 'day-month-year (Europe, 27.07.2012 = 27 July)'}</b> — ${esc(dd.why)}. ${dd.clash ? 'Rows that don’t fit are listed below. ' : ''}Change it with “Birth dates are” above if this is wrong.</div>` : '';
  const nInc = recs.filter(r => !r.fixId && (r.missing || []).length).length;
  const colsBox = info && info.cols ? `<div class="imp-cols"><div><b>Columns found (${info.cols.length})</b><div class="pill-list">${info.cols.map(c => `<span class="chip ok" title="File heading: ${esc(c.header)}">${esc(c.label)}${normH(c.header) !== normH(c.label) ? ` <span class="tiny">← ${esc(impShort(c.header))}</span>` : ''}</span>`).join('') || '<span class="muted small">none</span>'}</div></div>
    ${info.missingCols.length ? `<div><b>Not in the file — enter later</b><div class="pill-list">${info.missingCols.map(c => `<span class="chip warn">${esc(c)}</span>`).join('')}</div></div>` : ''}
    ${info.ignored.length ? `<div><b>Not used</b> <span class="tiny muted">(not recognised)</span><div class="pill-list">${info.ignored.map(c => `<span class="chip plain" title="${esc(c)}">${esc(impShort(c))}</span>`).join('')}</div></div>` : ''}</div>` : '';
  const yline = info && info.yobOnly ? `<div class="notice info" style="display:block"><b>International event — year of birth only.</b> Ages count on 31 Dec (birth-year rule); the day and month in the file are not stored (data minimisation).</div>` : '';
  return `${head}${colsBox}${yline}${dline}${warn}<p><b>${plural(adds, 'competitor')} ready to import</b>${nInc ? ` — <span style="color:var(--warn)"><b>${nInc}</b> with details to enter later</span> (marked <span class="chip warn">Incomplete</span>; Competitors → filter “Missing information”)` : ''}.${fixes.length ? ` <b>${plural(fixes.length, 'name')} will be corrected</b> (${fixes.map(r => esc(r.was) + ' → ' + esc(r.firstName + ' ' + r.lastName)).join(', ')}).` : ''}${errors.length ? `<br><span class="small" style="color:var(--bad)">${errors.slice(0, 10).map(esc).join('<br>')}${errors.length > 10 ? '<br>…and ' + (errors.length - 10) + ' more' : ''}</span>` : ''}</p>${tbl}`;
}
async function runImport() {
  const { recs, errors } = importRows($('#imp-text').value);
  if (!recs.length) { $('#imp-preview').textContent = errors.join(' · ') || 'Nothing to import.'; return; }
  const btn = $('[data-act="imp-run"]'); btn.disabled = true;
  const batch = { id: uid(), name: S.ui.impName || 'Pasted list', at: new Date().toISOString() };
  let done = 0;
  for (const r of recs) {
    if (r.fixId) { if (!(await guard(() => S.store.update(P.doc(S.evId, 'competitors', r.fixId), { firstName: r.firstName, lastName: r.lastName })))) break; done++; continue; }
    const id = uid();
    const pub = { firstName: r.firstName, lastName: r.lastName, gender: r.gender, rank: r.rank, dojo: r.dojo, state: r.state, country: r.country, waiver: r.waiver, feePaid: r.feePaid,
      checkedIn: false, status: 'active', events: r.events, divOverride: {}, age: r.dob ? KT.ageOn(r.dob, DC.asOf) : r.birthYear ? KT.ageFromYear(r.birthYear, DC.asOf) : null, createdAt: new Date().toISOString(),
      importId: batch.id, importName: batch.name, importAt: batch.at };     // v1.36: which import a competitor came from (bulk remove)
    const ok = await guard(async () => { await S.store.set(P.doc(S.evId, 'competitors', id), pub); await S.store.set(P.pv(S.evId, id), { dob: r.dob || '', birthYear: r.birthYear || '', email: r.email, phone: r.phone, emergencyName: r.emergencyName, emergencyPhone: r.emergencyPhone, feeAmount: r.feeAmount || '', notes: r.notes || '' }); return true; });
    if (!ok) break;
    done++; $('#imp-preview').textContent = `Imported ${done} of ${recs.length}…`;
  }
  const nFix = recs.filter(r => r.fixId).length;
  const nInc = recs.filter(r => !r.fixId && (r.missing || []).length).length;
  if (nInc) S.ui.filter = 'incomplete';       // show who still needs details
  closeModal(); toast(`Imported ${plural(done - nFix, 'competitor')}${nInc ? ` · ${nInc} need details — showing “Missing information”` : ''}${nFix ? ` · ${plural(nFix, 'name')} corrected` : ''}${errors.length ? ` · ${errors.length} rows skipped` : ''}`);
}

function teamForm(id, et) {
  const t = id ? DC.teamBy[id] : { eventType: et, memberIds: [], status: 'active' };
  et = t.eventType; const T = KT.EVENT_TYPES[et];
  const mem = new Set(t.memberIds || []);
  const pool = DC.comps.filter(c => c.status !== 'withdrawn' && ((c.events || []).includes(et) || mem.has(c.id)));
  // v1.47: which other team of this event each competitor is already on (by name)
  const onTeam = {}; for (const x of DC.teams) if (x.id !== id && x.eventType === et) for (const m of x.memberIds || []) (onTeam[m] = onTeam[m] || []).push(x.name || 'Team');
  const divs = DC.divs.filter(d => d.eventType === et);
  openModal(sheet(id ? esc(t.name) : `New ${esc(T.label)} team`, `<form id="f-team" data-form="team" data-id="${esc(id || '')}" data-et="${et}" class="stack">
    <div class="fgrid"><label class="f req"><span>Team name</span><input name="name" id="t-name" required value="${esc(t.name || '')}" placeholder="e.g. Hoshi Dojo A"></label>
      <label class="f"><span>Dojo / club</span><input name="dojo" id="t-dojo" value="${esc(t.dojo || '')}"></label>
      <label class="f"><span>Division</span><select name="divisionId" id="t-div">${opt('', 'Auto (by members)', t.divisionId)}${divs.map(d => opt(d.id, d.name, t.divisionId)).join('')}</select></label>
      <label class="f"><span>Status</span><select name="status" id="t-status">${opt('active', 'Active', t.status)}${opt('withdrawn', 'Withdrawn', t.status)}</select></label></div>
    <fieldset><legend>Members · ${T.size[0] === T.size[1] ? T.size[0] : T.size[0] + '–' + T.size[1]} needed</legend>
      ${pool.length ? `${teamMemSortSelect()}<div class="stack tm-list" id="t-mems">${teamMemRows(pool.map(c => c.id)).map(({ id: cid, head }) => { const c = DC.compBy[cid]; return `${head}<label class="check tm-row" data-id="${esc(cid)}"><input type="checkbox" data-multi="1" name="memberIds" value="${esc(cid)}" ${mem.has(cid) ? 'checked' : ''}>
        <span class="tm-who"><b>${esc(c.lastName)}, ${esc(c.firstName)}</b><span class="muted small tm-info">${esc([c.country, c.state, c.dojo].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join(' · '))} · ${esc(c.gender === 'F' ? 'W' : 'M')} · ${esc(KT.rankLabel(c.rank))}</span>${onTeam[cid] ? `<span class="chip warn tm-on">On ${esc(onTeam[cid].join(', '))}</span>` : ''}</span></label>`; }).join('')}</div>`
        : `<p class="small muted">No competitors have entered ${esc(T.label)} yet. Tick the event on their registration first.</p>`}</fieldset></form>`,
    `${id ? '<button class="danger" data-act="team-delete" style="margin-right:auto">Delete</button>' : ''}<button data-act="modal-close">Cancel</button><button class="primary" type="submit" form="f-team">Save</button>`));
}
/** v1.47: team member list order — country / region / club (dojo) with a heading per group, or name A→Z. Default: the event's separation group. */
const TEAM_MEM_SORTS = { country: 'By country', region: 'By region', club: 'By club / dojo', name: 'By name A→Z' };
function teamMemSortMode() {
  if (TEAM_MEM_SORTS[S.ui.teamMemSort]) return S.ui.teamMemSort;
  const lv = (curEvent() || {}).level; return lv === 'International' ? 'country' : lv === 'National' ? 'region' : 'club';
}
function teamMemSortSelect() { return `<label class="f ent-sort"><span>Sort competitors</span><select id="t-msort" data-change="team-mem-sort">${Object.entries(TEAM_MEM_SORTS).map(([k, l]) => opt(k, l, teamMemSortMode())).join('')}</select></label>`; }
function teamMemRows(ids, mode) {
  mode = mode || teamMemSortMode();
  const f = { country: 'country', region: 'state', club: 'dojo' }[mode];
  const list = KT.sortEntrants(ids.map(id => { const c = DC.compBy[id] || {}; return { id, last: c.lastName, first: c.firstName, group: f ? String(c[f] || '').trim() : '' }; }), mode === 'name' ? 'name' : 'club');
  let last = null;
  return list.map(x => { const g = f ? (x.group || 'No ' + (mode === 'club' ? 'club' : mode)) : null; const head = g !== null && g !== last ? `<div class="ent-grp label">${esc(g)}</div>` : ''; last = g; return { id: x.id, head }; });
}
/** Re-order the member rows in place (ticks stay as they are). */
function reorderTeamMems(mode) {
  const box = $('#t-mems'); if (!box) return;
  const rows = Object.fromEntries($$('.tm-row', box).map(r => [r.dataset.id, r]));
  $$('.ent-grp', box).forEach(h => h.remove());
  for (const { id, head } of teamMemRows(Object.keys(rows), mode)) { if (head) box.insertAdjacentHTML('beforeend', head); box.appendChild(rows[id]); }
}
async function saveTeam(form) {
  const v = fd(form), et = form.dataset.et, T = KT.EVENT_TYPES[et], id = form.dataset.id || uid();
  if (!v.name) { toast('Give the team a name.', true); return; }
  const mids = v.memberIds || [];
  const mem = mids.map(i => DC.compBy[i]).filter(Boolean);
  // v1.29: the division decides the team size (e.g. WTKF 2026 Enbu: Cadet & Junior 3, Youth & Senior 2; Team Kumite 3 + 1 reserve)
  const tdiv = v.divisionId ? DC.divBy[v.divisionId] : (mem.length ? KT.teamCandidates({ eventType: et }, mem, DC.divs, DC.asOf)[0] : null);
  const sz = KT.teamSizeFor(tdiv, et), szTxt = sz[0] === sz[1] ? sz[0] : sz[0] + '–' + sz[1];
  if (mids.length < sz[0] || mids.length > sz[1]) { toast(`${tdiv ? tdiv.name : T.label} teams need ${szTxt} members (selected ${mids.length}).`, true); return; }
  const g = KT.teamGender(mem);
  if (!T.genders.includes(g)) { toast(`${T.label} has no mixed division. Pick members of one gender.`, true); return; }
  if (!v.dojo && mem.length && mem.every(m => m.dojo === mem[0].dojo)) v.dojo = mem[0].dojo;
  const ok = await guard(async () => {
    await S.store.set(P.doc(S.evId, 'teams', id), { name: v.name, dojo: v.dojo, eventType: et, memberIds: mids, divisionId: v.divisionId || '', status: v.status || 'active', gender: g });
    for (const m of mem) if (!(m.events || []).includes(et)) await S.store.update(P.doc(S.evId, 'competitors', m.id), { events: (m.events || []).concat(et) });
  }, 'Team saved');
  if (ok) closeModal();
}

function divForm(id) {
  const ev = curEvent();
  const d = id ? DC.divBy[id] : { eventType: (ev.eventTypes || KT.EVENT_ORDER)[0], gender: 'M', belt: 'black', group: 'Senior', minAge: 21, maxAge: '', minRank: 'd1', maxRank: 'd10', format: ev.defaultFormat || 'SE', bronze: ev.bronze || 'two', reset: true };
  const sc = scoringOf(d), k = kindOf(d);
  const ents = id ? divEntrants(id) : [];
  const bs = id ? bracketState(id) : { drawn: false };
  openModal(sheet(id ? esc(d.name) : 'New division', `<form id="f-div" data-form="div" data-id="${esc(id || '')}" class="stack">
    <div class="fgrid">
      <label class="f"><span>Event</span><select name="eventType" id="d-et" data-change="div-et">${(ev.eventTypes || KT.EVENT_ORDER).map(t => opt(t, KT.EVENT_TYPES[t].label, d.eventType)).join('')}</select></label>
      <label class="f"><span>Gender</span><select name="gender" id="d-g">${KT.EVENT_TYPES[d.eventType].genders.map(g => opt(g, KT.GENDERS[g], d.open ? '' : d.gender)).join('')}${opt('open', 'Open (any gender)', d.open ? 'open' : '')}</select></label>
      <label class="f"><span>Belt class</span><select name="belt" id="d-belt">${opt('black', 'Black belt (Dan)', d.belt)}${opt('kyu', 'Kyu belt', d.belt)}</select></label>
      <label class="f"><span>Group label</span><input name="group" id="d-group" value="${esc(d.group || '')}" placeholder="Senior, Youth, Novice…"></label>
      <label class="f"><span>Minimum age</span><input type="number" name="minAge" id="d-min" min="0" max="99" value="${esc(d.minAge ?? '')}"></label>
      <label class="f"><span>Maximum age</span><input type="number" name="maxAge" id="d-max" min="0" max="120" value="${esc(d.maxAge ?? '')}" placeholder="No limit"></label>
      <label class="f"><span>Lowest rank</span><select name="minRank" id="d-rlo">${rankOptions(d.minRank)}</select></label>
      <label class="f"><span>Highest rank</span><select name="maxRank" id="d-rhi">${rankOptions(d.maxRank)}</select></label>
      <label class="f span"><span>Division name</span><input name="name" id="d-name" value="${esc(d.name || '')}" placeholder="Leave blank to name automatically"></label>
    </div>
    <fieldset><legend>Bracket</legend><div class="fgrid">
      <label class="f"><span>Format</span><select name="format" id="d-fmt" data-change="div-fmt" ${bs.results ? 'disabled' : ''}>${Object.entries(KT.FORMATS).filter(([x]) => x !== 'KP' || k === 'kata').map(([x, l]) => opt(x, l, d.format)).join('')}</select></label>
      <label class="f" data-fmts="SE,KP"><span>Draw chart</span><select name="chart" id="d-chart">${opt('', 'Automatic — WTKF charts at National / International', d.chart || '')}${opt('wtkf', 'WTKF charts (Exhibit A / E / F)', d.chart || '')}${opt('standard', 'Standard draw', d.chart || '')}</select><span class="tiny muted">WTKF charts: kumite / fuku-go in four pools A-1, A-2, B-1, B-2; kata in charts of up to 12 (single elimination and score pools only)</span></label>
      <label class="f" data-fmts="SE,RR,DE,DES"><span>Third place (single elim. / playoff)</span><select name="bronze" id="d-bronze">${opt('two', 'Two bronzes', d.bronze)}${opt('match', 'Bronze match', d.bronze)}</select></label>
      <label class="f" data-fmts="DE,DES"><span>Double elim.: number of pools</span><input type="number" name="poolCount" id="d-pools" min="0" max="16" value="${esc(d.poolCount || '')}" placeholder="Auto (8 per pool)"><span class="tiny muted">Top 2 of each pool go to a single-elimination playoff</span></label>
      <label class="f" data-fmts="RR"><span>Round robin: pool size</span><select name="rrPoolSize" id="d-rrsize">${opt('', '4 (default)', String(d.rrPoolSize || ''))}${[3, 5, 6, 7, 8].map(x => opt(String(x), 'Up to ' + x, String(d.rrPoolSize || ''))).join('')}</select></label>
      ${k === 'kata' ? `<label class="f span"><span>Allowed kata (comma separated, optional)</span><input name="kataList" id="d-kata" value="${esc((d.kataList || []).join(', '))}" placeholder="e.g. Heian Shodan, Heian Nidan"></label>` : ''}
      <label class="f" data-fmts="RR"><span>Round robin: advance per pool</span><select name="advance" id="d-adv">${opt('', 'Auto (2 if two pools, else 1)', d.advance || '')}${opt('1', '1', d.advance)}${opt('2', '2', d.advance)}</select></label>
      <label class="f"><span>Ring</span><select name="ringId" id="d-ring">${opt('', 'No ring yet', d.ringId)}${DC.rings.map(r => opt(r.id, r.name, d.ringId)).join('')}</select></label>
    </div>${bs.results ? '<p class="tiny muted">Format is locked because results exist.</p>' : ''}</fieldset>
    <fieldset><legend>Scoring (WTKF 2009)</legend><div class="fgrid">
      ${k === 'kata' ? `<label class="f" data-fmts="SE,RR,DE,DES"><span>Decision</span><select name="method" id="d-method">${opt('flags', 'Flags (judges’ majority)', sc.method)}${opt('scores', 'Scores 0–10 (drop high & low with 5)', sc.method)}</select></label>` : ''}
      ${k === 'kata' ? `<label class="f" data-fmts="KP"><span>Kata pools: max per pool</span><input type="number" name="poolSize" id="d-pool" min="4" max="12" value="${esc(d.poolSize || 8)}"><span class="tiny muted">Kata score pools only · WTKF allows up to 12</span></label>` : ''}
      ${k === 'kumite' || k === 'teamkumite' || k === 'fukugo' ? `<label class="f"><span>Kumite style</span><select name="style" id="d-style">${opt('shobu', 'Shobu Ippon (1:30)', sc.style)}${opt('kogo', 'Ko-go Kumite (6 exchanges)', sc.style)}${k === 'kumite' ? opt('kyux', 'Kyu exchanges (list below)', sc.style) + opt('ncr1', 'NCR kyu Level 1 (4 exchanges, flags)', sc.style) + opt('ncr2', 'NCR kyu Level 2 (6 exchanges, flags)', sc.style) + opt('ncr3', 'NCR kyu Level 3 (6 exchanges, Waza-ari)', sc.style) : ''}</select></label>
      ${k === 'kumite' && d.belt === 'kyu' ? `<label class="f span"><span>Kyu exchanges — one technique per line (each side attacks through the list: Aka first, then Shiro)</span><textarea name="exchanges" id="d-ex" rows="3" placeholder="Jodan oi-tsuki&#10;Chudan oi-tsuki">${esc((sc.exchanges || []).map(e => Array.isArray(e) ? e[1] : e).join('\n'))}</textarea></label>
        <label class="f"><span>Winner decided by</span><select name="decide" id="d-decide">${opt('flags', 'Court Judges’ flags (no points)', sc.decide || 'flags')}${opt('points', 'Waza-ari points, tie → flags', sc.decide || 'flags')}</select></label>` : ''}` : ''}
      ${k === 'kata' ? `<label class="f"><span>Judges</span><select name="judges" id="d-judges">${opt('3', '3', sc.judges)}${opt('5', '5', sc.judges)}${opt('6', '6 (Shu-shin + 5, scores only)', sc.judges)}${opt('7', '7', sc.judges)}</select></label>` : ''}
      ${k !== 'kata' ? `<label class="f"><span>Bout time (seconds)</span><input type="number" name="boutTime" id="d-bt" min="30" max="600" step="10" value="${esc(sc.boutTime)}"></label>
      <label class="f"><span>Kettei-sen (seconds, 0 = none)</span><input type="number" name="ketteiTime" id="d-kt" min="0" max="180" step="10" value="${esc(sc.ketteiTime)}"></label>` : ''}
      ${k === 'teamkumite' ? `<label class="f"><span>Rounds per team match</span><select name="bouts" id="d-bouts">${opt('3', '3 (WTKF)', sc.bouts)}${opt('5', '5', sc.bouts)}</select></label>` : ''}
    </div></fieldset>
    ${id ? `<fieldset><legend>Entrants &amp; seeds (${ents.length})</legend>${smallDivHTML(id)}${ents.length ? `${entSortSelect('d-entsort')}<div class="stack ent-list" id="d-ents" style="gap:6px">${entRowsSorted(ents).map(({ id: e, head }) => `${head}<div class="row between small ent-row" data-id="${esc(e)}"><span style="min-width:0"><button type="button" class="ghost ent-link" data-act="ent-open" data-id="${esc(e)}" title="Open — change division, details"><b>${esc(entName(e, id))}</b> ›</button> <span class="muted">${esc(entDojo(e))}</span></span>
      <input type="number" min="1" max="64" name="seed_${esc(e)}" id="seed-${esc(e)}" data-input="seed" value="${esc((d.seeds || {})[e] || '')}" placeholder="Seed" style="width:86px" aria-label="Seed"></div>`).join('')}</div>
      <p class="notice bad small" id="seed-msg" hidden style="margin-top:6px"></p>
      <p class="tiny muted" style="margin-top:6px">Each seed number can be given to one entrant only. ${d.chart !== 'standard' && (d.chart === 'wtkf' || ['International', 'National'].includes(ev.level)) ? 'WTKF charts: seeds 1–4 = last championship’s 1st–4th (kumite: 1st A-1, 2nd B-1, 3rd B-2, 4th A-2 with byes first; kata: at the bottom of their chart).' : ''} Seeded entrants are kept apart in the draw; the others are placed at random, with entrants from the same ${esc(sepLabel())} put in different pools and bracket halves wherever possible.</p>` : '<p class="small muted">No entrants match this division yet.</p>'}</fieldset>` : ''}</form>`,
    `${id ? `<button class="danger" data-act="div-delete" style="margin-right:auto">Delete</button>${bs.drawn ? `<button class="danger" data-act="bracket-clear">Clear bracket</button>` : ''}` : ''}<button data-act="modal-close">Cancel</button>${id && ents.length ? `<button data-act="draw" data-id="${esc(id)}" ${bs.results ? 'disabled' : ''}>${bs.drawn ? 'Save & redraw' : 'Save & draw'}</button>` : ''}<button class="primary" type="submit" form="f-div">Save</button>`));
  fmtApplies();
}
/** v1.44: entrant rows of the division form in list order; group headings (club / region / country) before each group. */
function entRowsSorted(ids, mode) {
  mode = mode || entSortMode();
  let last = null;
  return sortedEntrants(ids, mode).map(x => { const g = ENT_SORT_LEVEL[mode] ? (x.group || 'No ' + (mode === 'club' ? 'club' : mode)) : null;
    const head = g !== null && g !== last ? `<div class="ent-grp label">${esc(g)}</div>` : ''; last = g; return { id: x.id, head }; });
}
/** Re-order the rows in place (typed seeds stay as they are). */
function reorderEntRows(mode) {
  const box = $('#d-ents'); if (!box) return;
  const rows = Object.fromEntries($$('.ent-row', box).map(r => [r.dataset.id, r]));
  $$('.ent-grp', box).forEach(h => h.remove());
  for (const { id, head } of entRowsSorted(Object.keys(rows), mode)) { if (head) box.insertAdjacentHTML('beforeend', head); box.appendChild(rows[id]); }
}
/** v1.48: grey out the bracket settings the chosen format does not use (the values are kept and still saved). */
function fmtApplies(form) {
  form = form || $('#f-div'); if (!form) return;
  const fmt = (form.querySelector('#d-fmt') || {}).value || 'SE', name = KT.FORMATS[fmt] || fmt;
  for (const lb of form.querySelectorAll('[data-fmts]')) {
    const on = lb.dataset.fmts.split(',').includes(fmt);
    lb.classList.toggle('na', !on);
    lb.querySelectorAll('input, select, textarea').forEach(x => { x.disabled = !on; });
    let note = lb.querySelector('.na-note');
    if (!on && !note) { lb.insertAdjacentHTML('beforeend', '<span class="tiny na-note"></span>'); note = lb.querySelector('.na-note'); }
    if (note) note.textContent = on ? '' : `Not used by ${name}`;
  }
}
/** What the draw keeps apart, by event level. */
function sepLabel(level) { level = level || (curEvent() || {}).level; return level === 'International' ? 'country' : level === 'National' ? 'region' : 'dojo'; }
function seedClashText(clash) { return Object.entries(clash).map(([n, ids]) => `Seed ${n} is given to ${ids.map(entName).join(' and ')}`).join('. ') + '. Each seed can be used once.'; }
/** Highlight seed inputs that share a number and explain under the list. */
function seedMarks(form) {
  form = form || $('#f-div'); if (!form) return {};
  const seeds = {}; $$('input[data-input="seed"]', form).forEach(i => { if (+i.value > 0) seeds[i.name.slice(5)] = +i.value; });
  const clash = KT.seedClashes(seeds), bad = new Set([].concat(...Object.values(clash)));
  $$('input[data-input="seed"]', form).forEach(i => { const b = bad.has(i.name.slice(5)); i.classList.toggle('clash', b); i.setAttribute('aria-invalid', b ? 'true' : 'false'); });
  const m = $('#seed-msg', form); if (m) { m.hidden = !bad.size; m.textContent = bad.size ? seedClashText(clash) : ''; }
  return clash;
}
async function saveDiv(form, thenDraw) {
  const v = fd(form), id = form.dataset.id || uid();
  const old = DC.divBy[form.dataset.id] || {};
  const T = KT.EVENT_TYPES[v.eventType];
  const isOpen = v.gender === 'open'; if (isOpen) v.gender = 'X';
  if (!isOpen && !T.genders.includes(v.gender)) v.gender = T.genders[0];
  const seeds = {}; for (const k of Object.keys(v)) if (k.startsWith('seed_')) { if (+v[k] > 0) seeds[k.slice(5)] = +v[k]; delete v[k]; }
  const clash = KT.seedClashes(seeds);
  if (Object.keys(clash).length) { seedMarks(form); toast(seedClashText(clash), true); return false; }
  const kind = T.kind, base = Object.assign(KT.defaultScoring(v.eventType), old.scoring || {});
  if (v.format === 'KP' && kind !== 'kata') { toast('Kata score pools are for kata, team kata and enbu divisions.', true); return false; }
  const scoring = { method: v.format === 'KP' ? 'scores' : (v.method || base.method), judges: +(v.judges || base.judges), boutTime: +(v.boutTime || base.boutTime), ketteiTime: v.ketteiTime === '' || v.ketteiTime == null ? base.ketteiTime : +v.ketteiTime, bouts: +(v.bouts || base.bouts), style: v.style || base.style };
  if (v.exchanges != null) { scoring.exchanges = String(v.exchanges).split('\n').map(x => x.trim()).filter(Boolean); scoring.decide = v.decide === 'points' ? 'points' : 'flags'; }
  if (scoring.style === 'kyux' && !(scoring.exchanges || []).length) { toast('List at least one exchange for “Kyu exchanges”.', true); return false; }
  scoring.styleExplicit = !!v.style && (v.style === 'kyux' || KT.NCR_STYLES[v.style] || old.preset === 'ncr-kyu') || !!v.style && v.style !== KT.defaultStyle({ eventType: v.eventType, belt: v.belt, group: v.group, maxAge: v.maxAge === '' ? null : +v.maxAge, minRank: v.minRank, maxRank: v.maxRank });
  if (scoring.method === 'flags' && scoring.judges % 2 === 0) scoring.judges = 5;
  const dv = { eventType: v.eventType, gender: v.gender, belt: v.belt, group: v.group, minAge: v.minAge === '' ? null : +v.minAge, maxAge: v.maxAge === '' ? null : +v.maxAge,
    minRank: v.minRank || (v.belt === 'black' ? 'd1' : 'k10'), maxRank: v.maxRank || (v.belt === 'black' ? 'd10' : 'k1'), format: v.format || old.format || 'SE', bronze: v.bronze, reset: false, poolCount: v.poolCount ? Math.max(0, +v.poolCount) : 0, advance: v.advance ? +v.advance : null,
    ringId: v.ringId || '', ringOrder: old.ringOrder ?? Date.now(), scoring, seeds, order: old.order || 0, poolSize: v.poolSize ? Math.min(12, Math.max(4, +v.poolSize)) : (old.poolSize || 8),
    rrPoolSize: v.rrPoolSize ? +v.rrPoolSize : null, chart: v.chart || '', kataList: String(v.kataList || '').split(',').map(x => x.trim()).filter(Boolean), open: isOpen, level: old.level || null, preset: old.preset || null, quota: old.quota || null, teamSize: old.teamSize || null };
  dv.name = v.name && v.name !== (old.eventType ? KT.divisionName(old) : '') ? v.name : KT.divisionName(dv);
  if (dv.minRank && dv.maxRank && KT.rankValue(dv.minRank) > KT.rankValue(dv.maxRank)) { toast('Lowest rank must be below highest rank.', true); return false; }
  const ok = await guard(() => S.store.set(P.doc(S.evId, 'divisions', id), dv), thenDraw ? null : 'Division saved');
  if (!ok) return false;
  closeModal();
  return id;
}
function stdDivForm(kyu) {
  const ev = curEvent();
  const ets = ev.eventTypes || KT.EVENT_ORDER;
  openModal(sheet(kyu ? 'Add kyu divisions' : 'Add black-belt divisions', `<form id="f-std" data-form="${kyu ? 'kyu' : 'std'}" class="stack">
    ${kyu ? `<p class="small muted">Define one kyu group. A division is created for every event and gender you pick.</p><div class="fgrid">
      <label class="f req"><span>Group label</span><input name="label" id="k-label" required placeholder="e.g. Youth Novice"></label>
      <label class="f"><span>Lowest rank</span><select name="minRank" id="k-lo">${rankOptions('k10').replace(/<option value="d[\s\S]*$/, '')}</select></label>
      <label class="f"><span>Highest rank</span><select name="maxRank" id="k-hi">${rankOptions('k1')}</select></label>
      <label class="f"><span>Minimum age</span><input type="number" name="minAge" id="k-min" min="0" max="99"></label>
      <label class="f"><span>Maximum age</span><input type="number" name="maxAge" id="k-max" min="0" max="120" placeholder="No limit"></label></div>`
      : `<p class="small muted">Creates Senior (21+), Youth (19–20), Junior (16–18) and Cadet (14–15) divisions for each gender category of the events you pick. Existing divisions are skipped.</p>`}
    <div><div class="label" style="margin-bottom:6px">Events</div><div class="pill-list">${ets.map(k => `<label class="check chip plain"><input type="checkbox" data-multi="1" name="ets" value="${k}" checked> ${esc(KT.EVENT_TYPES[k].label)}</label>`).join('')}</div></div>
    <label class="f" style="max-width:320px"><span>Bracket format</span><select name="format" id="std-fmt">${Object.entries(KT.FORMATS).map(([x, l]) => opt(x, l, ev.defaultFormat || 'SE')).join('')}</select></label></form>`,
    `<button data-act="modal-close">Cancel</button><button class="primary" type="submit" form="f-std">Create divisions</button>`));
}
async function saveStd(form, kyu) {
  const v = fd(form), ev = curEvent();
  if (!(v.ets || []).length) { toast('Pick at least one event.', true); return; }
  let list;
  if (kyu) {
    if (!v.label) { toast('Give the group a label.', true); return; }
    list = KT.kyuDivisions({ label: v.label, minRank: v.minRank, maxRank: v.maxRank, minAge: v.minAge === '' ? null : +v.minAge, maxAge: v.maxAge === '' ? null : +v.maxAge }, v.ets, v.format);
  } else list = KT.blackBeltDivisions(v.ets, v.format);
  const key = d => [d.eventType, d.gender, d.belt, d.group, d.minAge, d.maxAge, d.minRank, d.maxRank].join('|');
  const have = new Set(DC.divs.map(key));
  const add = list.filter(d => !have.has(key(d)));
  for (const d of add) { d.bronze = ev.bronze || 'two'; d.ringId = ''; d.ringOrder = Date.now(); await guard(() => S.store.set(P.doc(S.evId, 'divisions', uid()), d)); }
  closeModal(); toast(add.length ? `Created ${plural(add.length, 'division')}` : 'Those divisions already exist');
}
/* ---------- v1.29: rule-set presets (WTKF World Championship 2026) ---------- */
function presetForm(pid) {
  const pr = KT.PRESETS[pid || 'wtkf-worlds-2026'], ev = curEvent(), list = KT.presetDivisions(pr);
  const key = d => [d.eventType, d.gender, d.group].join('|');
  const keys = new Set(list.map(key));
  const others = DC.divs.filter(d => !keys.has(key(d)));
  const removable = others.filter(d => !S.d.brackets[d.id]), kept = others.filter(d => S.d.brackets[d.id]);
  const byGroup = {}; list.forEach(d => (byGroup[d.group] = byGroup[d.group] || []).push(d));
  const gtxt = Object.entries(pr.groups).map(([, [l, a, b]]) => `${l} ${b == null ? a + '+' : a + '–' + b}`).join(' · ');
  openModal(sheet(esc(pr.label), `<form id="f-preset" data-form="preset" data-id="${esc(pr.id)}" class="stack">
    <p class="small">From the <b>${esc(pr.source)}</b>. Applying it sets this event up for the championship:</p>
    <ul class="small" style="margin:0;padding-left:20px;display:grid;gap:4px">
      <li><b>${list.length} divisions</b> — ${esc(gtxt)}. Black belts only (Shodan and higher).</li>
      <li><b>Ages by birth year</b>: ages are counted on 31 Dec 2026 (Cadet = born 2011–2012, Junior 2009–2010, Youth 2006–2008, Senior 2005 and before).</li>
      <li><b>Kumite & Fuku-go</b>: Cadet and Junior = Ko-go Kumite; Youth and Senior = Jiyu Kumite (Shobu Ippon).</li>
      <li><b>Teams</b>: Synchronized (Team) Kata 3 · Enbu 3 for Cadet & Junior, 2 for Youth & Senior · Team Kumite 3 + 1 reserve.</li>
      <li><b>Quota per National Federation</b>: ${pr.quota} athletes per individual category, ${pr.teamQuota} team per team category — countries over the limit are flagged on the division and in the go-live checklist.</li>
      <li><b>Draw</b>: International — athletes of the same country are kept apart in pools and bracket halves. Kata/Enbu = score pools, Kumite = elimination, Fuku-go = single elimination.</li>
      <li><b>Judges</b>: Class A (6), B (5), C (4) — minimum judge level 4.</li></ul>
    <details class="card"><summary class="small"><b>The ${list.length} divisions</b></summary><div class="stack" style="gap:8px;margin-top:8px">${Object.entries(byGroup).map(([g, ds]) => `<div><div class="label">${esc(g)}</div><div class="small">${ds.map(d => esc(d.name.replace(/^Black Belt /, '').replace(g + ' ', '')) + (d.teamSize ? ` <span class="muted">(${d.teamSize[0] === d.teamSize[1] ? d.teamSize[0] : d.teamSize[0] + '–' + d.teamSize[1]})</span>` : '') + (d.scoring.style === 'kogo' ? ' <span class="muted">Ko-go</span>' : KT.EVENT_TYPES[d.eventType].kind === 'kumite' || d.eventType === 'FUKUGO' || d.eventType === 'TKUMITE' ? ' <span class="muted">Jiyu</span>' : '')).join(' · ')}</div></div>`).join('')}</div></details>
    <label class="check"><input type="checkbox" name="settings" checked> Also set the event to International, ages as of 31 Dec 2026, minimum judge level 4, all six events offered</label>
    ${removable.length ? `<label class="check"><input type="checkbox" name="removeOld" checked> Remove the ${plural(removable.length, 'other division')} not in this rule set (none drawn yet) — otherwise their age groups (e.g. Junior 16–18) would compete for the same athletes</label>` : ''}
    ${kept.length ? `<p class="notice warn small" style="display:block">${plural(kept.length, 'division')} outside the rule set already ${kept.length === 1 ? 'has' : 'have'} a bracket and ${kept.length === 1 ? 'is' : 'are'} kept: ${kept.map(d => esc(d.name)).join(', ')}.</p>` : ''}
    <p class="tiny muted">Divisions that already exist (same event, gender and age group) get these ages, ranks, quotas, team sizes and kumite type unless they have been drawn; their ring, bracket format and timing are kept. Brackets are not drawn by this step — check entrants and quotas, then use Draw all ready.</p></form>`,
    `<button data-act="modal-close">Cancel</button><button class="primary" type="submit" form="f-preset">Apply rule set</button>`), { wide: true });
}
async function applyPreset(form) {
  const pr = KT.PRESETS[form.dataset.id], v = fd(form), ev = curEvent(); if (!pr) return;
  const list = KT.presetDivisions(pr), key = d => [d.eventType, d.gender, d.group].join('|');
  const mine = {}; DC.divs.forEach(d => { mine[key(d)] = d; });
  let added = 0, updated = 0, removed = 0;
  if (v.settings) await guard(() => S.store.update(P.event(S.evId), { level: pr.level, ageAsOf: pr.ageAsOf, judgeMin: String(pr.judgeMin), preset: pr.id, eventTypes: KT.EVENT_ORDER.slice() }));
  for (const d of list) {
    const cur = mine[key(d)];
    if (cur && S.d.brackets[cur.id]) continue;
    if (cur) { // keep the director's ring, order, format, bronze, timing; apply ages, rank, quota, team size and kumite type
      const { ringId, ringOrder, seeds, officials, format, bronze, scoring, reset, order, ...rules } = d;
      rules.scoring = Object.assign({}, cur.scoring || scoring, { style: scoring.style });
      await guard(() => S.store.update(P.doc(S.evId, 'divisions', cur.id), rules)); updated++; }
    else { d.ringId = ''; d.ringOrder = Date.now() + added; await guard(() => S.store.set(P.doc(S.evId, 'divisions', uid()), d)); added++; }
  }
  if (v.removeOld) {
    const keep = new Set(list.map(key));
    for (const d of DC.divs) if (!keep.has(key(d)) && !S.d.brackets[d.id]) { await guard(() => S.store.del(P.doc(S.evId, 'divisions', d.id))); removed++; }
  }
  if (v.settings && ev.ageAsOf !== pr.ageAsOf) for (const c of DC.comps) if (c.dob || c.birthYear) await guard(() => S.store.update(P.doc(S.evId, 'competitors', c.id), { age: KT.ageOf(c, pr.ageAsOf) }));
  closeModal(); toast(`${pr.label}: ${plural(added, 'division')} added${updated ? `, ${updated} updated` : ''}${removed ? `, ${removed} removed` : ''}`);
}
/* ---------- v1.31: NCR kyu rules (local & regional tournaments) ---------- */
function kyuGroupsOf(ev) { return ev && Array.isArray(ev.kyuGroups) && ev.kyuGroups.length ? ev.kyuGroups : KT.defaultKyuGroups(); }
const kyuRankName = r => r === 'k10' ? 'White belt / 10th Kyu' : KT.rankLabel(r);
function kyuDecideText(g) { return g.decide === 'kogo' ? 'WTKF Ko-go Kumite' : `${(g.exchanges || []).length * 2} exchanges · ${g.decide === 'points' ? 'Waza-ari points, tie → flags' : 'Court Judges’ flags'}`; }
function ncrForm(justSaved) {
  const ev0 = curEvent(), ev = Array.isArray(justSaved) ? Object.assign({}, ev0, { kyuGroups: justSaved }) : ev0;   // just saved: don't wait for the store
  const pr = KT.NCR_KYU, groups = kyuGroupsOf(ev), custom = Array.isArray(ev.kyuGroups) && ev.kyuGroups.length;
  const kyuNow = DC.divs.filter(d => d.belt === 'kyu' && d.preset !== pr.id), drawnKyu = kyuNow.filter(d => S.d.brackets[d.id]);
  const lvlRows = groups.map(g => `<tr><td><b>${esc(g.label)}</b></td><td>${esc(kyuRankName(g.minRank))} – ${esc(KT.rankLabel(g.maxRank))}</td><td class="small">${(g.kata || []).map(esc).join(', ') || '—'}</td><td class="small">${esc(kyuDecideText(g))}${g.decide !== 'kogo' ? `<div class="tiny muted">${(g.exchanges || []).map(esc).join(' · ')}</div>` : ''}</td></tr>`).join('');
  openModal(sheet(custom ? 'Kyu rules · this event’s levels' : 'Kyu rules · NCR v3.3', `<form id="f-ncr" data-form="ncr" class="stack">
    <p class="small">${custom ? '<b>This event’s own kyu levels and exchanges</b> (edited from the NCR rules)' : `From <b>${esc(pr.source)}</b>`} — for kyu competitors at local and regional tournaments.${ev.level === 'National' || ev.level === 'International' ? ` <span style="color:var(--warn)">This event is ${esc(ev.level)}; the NCR rules are written for local and regional events.</span>` : ''}</p>
    <div class="tw"><table class="acc"><thead><tr><th>Level</th><th>Ranks</th><th>Allowed kata</th><th>Kumite</th></tr></thead><tbody>${lvlRows}</tbody></table></div>
    <div><button type="button" class="sm" data-act="kyu-groups">Edit rank groups &amp; exchanges…</button> <span class="tiny muted">For regions with other rank groups or exchanges. Saved with this event.</span></div>
    <ul class="small" style="margin:0;padding-left:20px;display:grid;gap:4px">
      <li><b>Individual Kata</b>: two competitors perform at the same time, Court Judges’ flags decide (3–5 judges); kata from the level’s list, may change each round.</li>
      <li><b>Individual Kumite</b>: ${custom ? 'each level’s exchanges as listed above — Aka attacks through the list first, then Shiro; the score sheet calls each exchange' : 'Level 1–3 guided exchanges (Aka attacks first, then Shiro), Level 4 WTKF Ko-go'}.</li>
      <li><b>Team (synchronized) Kata</b> and <b>Enbu</b>: scored, highest total wins.</li>
      <li><b>Pools of up to 6</b>; each pool does kata first, then kumite (kata divisions are put ahead of kumite in each ring’s order).</li></ul>
    <fieldset><legend>Divisions</legend><div class="stack" style="gap:8px">
      <div class="pill-list">${pr.events.map(et => `<label class="check chip plain"><input type="checkbox" data-multi="1" name="ets" value="${et}" checked> ${esc(KT.EVENT_TYPES[et].label)}</label>`).join('')}</div>
      <label class="check"><input type="checkbox" name="byGender" checked> Separate women and men (individual events)</label>
      <label class="check"><input type="checkbox" name="byAge" checked> Separate youth (17 and under) and adults (18+)</label>
      <p class="tiny muted">The rules allow mixing gender or age when there are not enough competitors for a pool and the coaches and competitors agree — untick to create combined (open) divisions.</p>
      <div class="fgrid"><label class="f"><span>Pool format</span><select name="format">${opt('RR', 'Round robin (pools of up to 6)', 'RR')}${opt('DE', 'Double elimination', 'RR')}</select></label>
        <label class="f"><span>Judges per match</span><select name="judges">${opt('3', '3 (Shu-shin + 2 Fuku-shin)', '3')}${opt('5', '5 (Shu-shin + 4 Fuku-shin)', '3')}</select></label></div>
      ${kyuNow.length ? `<label class="check"><input type="checkbox" name="removeOld" checked> Replace the ${plural(kyuNow.length - drawnKyu.length, 'existing kyu division')} not drawn yet (black-belt divisions are not touched)</label>` : ''}
      ${drawnKyu.length ? `<p class="notice warn small" style="display:block">${plural(drawnKyu.length, 'kyu division')} already drawn ${drawnKyu.length === 1 ? 'is' : 'are'} kept: ${drawnKyu.map(d => esc(d.name)).join(', ')}.</p>` : ''}
    </div></fieldset></form>`,
    `<button data-act="modal-close">Cancel</button><button class="primary" type="submit" form="f-ncr">Create kyu divisions</button>`), { wide: true });
}
async function applyNcr(form) {
  const v = fd(form), ets = v.ets || [];
  if (!ets.length) { toast('Pick at least one event.', true); return; }
  const ev = curEvent(), custom = Array.isArray(ev.kyuGroups) && ev.kyuGroups.length;
  const list = KT.ncrDivisions({ byGender: !!v.byGender, byAge: !!v.byAge, format: v.format || 'RR', judges: +v.judges || 3, events: ets, groups: custom ? ev.kyuGroups : null });
  const key = d => [d.eventType, d.open ? 'open' : d.gender, d.group, d.minRank, d.maxRank].join('|');
  const mine = {}; DC.divs.forEach(d => { mine[key(d)] = d; });
  let added = 0, updated = 0, removed = 0;
  if (v.removeOld == null && custom) v.removeOld = true;
  if (v.removeOld) { const keep = new Set(list.map(key)); for (const d of DC.divs) if (d.belt === 'kyu' && !keep.has(key(d)) && !S.d.brackets[d.id]) { await guard(() => S.store.del(P.doc(S.evId, 'divisions', d.id))); removed++; } }
  const base = Date.now();
  for (const d of list) {
    const cur = mine[key(d)];
    if (cur && S.d.brackets[cur.id]) continue;
    d.ringOrder = base + d.order;            // kata before kumite within each level and age group
    if (cur) { const { ringId, ...rules } = d; await guard(() => S.store.update(P.doc(S.evId, 'divisions', cur.id), rules)); updated++; }
    else { d.ringId = ''; await guard(() => S.store.set(P.doc(S.evId, 'divisions', uid()), d)); added++; }
  }
  const et = new Set(curEvent().eventTypes || KT.EVENT_ORDER); ets.forEach(x => et.add(x));
  await guard(() => S.store.update(P.event(S.evId), { eventTypes: KT.EVENT_ORDER.filter(x => et.has(x)) }));
  closeModal(); toast(`Kyu rules: ${plural(added, 'division')} added${updated ? `, ${updated} updated` : ''}${removed ? `, ${removed} replaced` : ''}`);
}
/* ---------- v1.32: the event's own kyu rank groups & kumite exchanges ---------- */
function kyuGroupsForm(draft) {
  const ev = curEvent(), groups = draft || JSON.parse(JSON.stringify(kyuGroupsOf(ev)));
  S.ui.kyuDraft = groups;
  const kyuOpts = sel => Array.from({ length: 10 }, (_, i) => 'k' + (10 - i)).map(r => opt(r, kyuRankName(r), sel)).join('');
  const chk = KT.kyuGroupsCheck(groups);
  const card = (g, i) => `<fieldset class="kyu-g" data-i="${i}"><legend>${esc(g.label || 'Level ' + (i + 1))}</legend><div class="fgrid">
      <label class="f"><span>Name</span><input name="label" value="${esc(g.label || '')}" placeholder="Level ${i + 1}"></label>
      <label class="f"><span>Lowest rank</span><select name="minRank">${kyuOpts(g.minRank)}</select></label>
      <label class="f"><span>Highest rank</span><select name="maxRank">${kyuOpts(g.maxRank)}</select></label>
      <label class="f"><span>Winner decided by</span><select name="decide" data-change="kyu-decide">${opt('flags', 'Court Judges’ flags (no points)', g.decide)}${opt('points', 'Waza-ari points, tie → flags', g.decide)}${opt('kogo', 'WTKF Ko-go Kumite', g.decide)}</select></label>
      <label class="f span"><span>Allowed kata (comma separated, optional)</span><input name="kata" value="${esc((g.kata || []).join(', '))}" placeholder="e.g. Heian Shodan, Heian Nidan"></label>
      ${g.decide === 'kogo' ? '<p class="tiny muted span">Ko-go uses the WTKF exchanges (3 per side) — no list needed.</p>' : `<label class="f span"><span>Kumite exchanges — one technique per line; each side attacks through the list (Aka first, then Shiro)</span><textarea name="exchanges" rows="${Math.max(3, (g.exchanges || []).length + 1)}" placeholder="Jodan oi-tsuki&#10;Chudan oi-tsuki&#10;Chudan mae-geri">${esc((g.exchanges || []).join('\n'))}</textarea></label>`}
    </div><div class="row" style="justify-content:flex-end"><button type="button" class="sm danger" data-act="kyu-del" data-i="${i}" ${groups.length <= 1 ? 'disabled' : ''}>Remove ${esc(g.label || 'level')}</button></div></fieldset>`;
  openModal(sheet('Kyu rank groups & exchanges', `<form id="f-kyug" data-form="kyugroups" class="stack">
    <p class="small">Group the kyu ranks into levels and list each level’s kumite exchanges. Divisions are made per level (and by gender and youth/adult if you choose) when you press <b>Create</b> in the kyu rules window. Saved with this event only.</p>
    ${groups.map(card).join('')}
    <div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="sm" data-act="kyu-add">+ Add level</button><button type="button" class="sm ghost" data-act="kyu-reset">Reset to NCR v3.3</button></div>
    ${chk.errors.length ? `<p class="notice bad small" style="display:block">${chk.errors.map(esc).join('<br>')}</p>` : ''}
    ${chk.gaps.length ? `<p class="notice warn small" style="display:block">Not in any level: ${chk.gaps.map(kyuRankName).map(esc).join(', ')} — competitors with these ranks get no division.</p>` : ''}
  </form>`, `<button data-act="kyu-back">Cancel</button><button class="primary" type="submit" form="f-kyug">Save levels</button>`), { wide: true });
}
/** read the editor back into the draft (before add / remove / re-render) */
function kyuReadForm() {
  return $$('#f-kyug fieldset.kyu-g').map(f => {
    const v = n => { const el = f.querySelector(`[name="${n}"]`); return el ? el.value : null; };
    const ex = v('exchanges'), prev = (S.ui.kyuDraft || [])[+f.dataset.i] || {};
    return { id: prev.id || uid(), label: (v('label') || '').trim(), minRank: v('minRank'), maxRank: v('maxRank'), decide: v('decide') || 'flags',
      kata: String(v('kata') || '').split(',').map(x => x.trim()).filter(Boolean), exchanges: ex == null ? (prev.exchanges || []) : ex.split('\n').map(x => x.trim()).filter(Boolean) };
  });
}
async function saveKyuGroups() {
  const groups = kyuReadForm(), chk = KT.kyuGroupsCheck(groups);
  if (chk.errors.length) { kyuGroupsForm(groups); toast(chk.errors[0], true); return; }
  groups.sort((a, b) => KT.rankValue(a.minRank) - KT.rankValue(b.minRank));
  const canon = gs => JSON.stringify(gs.map(g => [g.label, g.minRank, g.maxRank, g.decide, (g.kata || []).join('|'), g.decide === 'kogo' ? '' : (g.exchanges || []).join('|')]));
  const same = canon(groups) === canon(KT.defaultKyuGroups());
  if (!(await guard(() => S.store.update(P.event(S.evId), { kyuGroups: same ? [] : groups }), same ? 'Kyu levels: NCR v3.3' : `Saved ${plural(groups.length, 'kyu level')}`))) return;
  ncrForm(same ? [] : groups);
}
/* ---------- v1.35: too few entrants → combine with another division (minimum 3) ---------- */
const MIN_DIV = 3;
function smallDivHTML(did) {
  const d = DC.divBy[did]; if (!d) return '';
  const n = divEntrants(did).length; if (!n || n >= MIN_DIV || S.d.brackets[did]) return '';
  return `<div class="notice warn" style="display:block;margin-bottom:8px"><b>${plural(n, 'entrant')}</b> — a division needs at least ${MIN_DIV}. <button type="button" class="sm" data-act="div-combine" data-id="${esc(did)}">Combine with another division…</button><div class="tiny" style="margin-top:4px">Or tap a name to move just that ${KT.EVENT_TYPES[d.eventType].team ? 'team' : 'competitor'}.</div></div>`;
}
/** other divisions of the same event, closest first (same gender, overlapping / next age group, closest ranks) */
function combineTargets(d) {
  const mid = x => (x == null || x === '' ? null : +x);
  const ageMid = v => { const lo = mid(v.minAge) ?? 0, hi = mid(v.maxAge) ?? 70; return (lo + hi) / 2; };
  const rk = v => ((KT.rankValue(v.minRank) || 0) + (KT.rankValue(v.maxRank) || 0)) / 2;
  return DC.divs.filter(x => x.id !== d.id && x.eventType === d.eventType && x.belt === d.belt)
    .map(x => ({ x, cost: (x.gender === d.gender || x.open || d.open ? 0 : 100) + Math.abs(ageMid(x) - ageMid(d)) + Math.abs(rk(x) - rk(d)) * 3 + (S.d.brackets[x.id] ? 50 : 0) }))
    .sort((a, b) => a.cost - b.cost).map(o => o.x).concat(DC.divs.filter(x => x.id !== d.id && x.eventType === d.eventType && x.belt !== d.belt));
}
function combineForm(did) {
  const d = DC.divBy[did]; if (!d) return;
  const ents = divEntrants(did), tg = combineTargets(d), team = KT.EVENT_TYPES[d.eventType].team;
  if (!tg.length) { toast(`No other ${KT.EVENT_TYPES[d.eventType].label} division to combine with — create one or edit this division’s ages / ranks.`, true); return; }
  const lbl = x => `${x.name} · ${plural(divEntrants(x.id).length, 'entrant')}${S.d.brackets[x.id] ? ' · drawn' : ''}`;
  openModal(sheet(`Combine · ${esc(d.name)}`, `<form id="f-combine" data-form="combine" data-id="${esc(did)}" class="stack">
    <p class="small">${plural(ents.length, team ? 'team' : 'entrant')} here — at least ${MIN_DIV} are needed. Move ${ents.length === 1 ? 'it' : 'them'} into another ${esc(KT.EVENT_TYPES[d.eventType].label)} division:</p>
    <div class="pill-list">${ents.map(e => `<span class="chip plain">${esc(entName(e, did))}</span>`).join('')}</div>
    <label class="f"><span>Combine into</span><select name="target" id="cmb-target" data-change="combine-target">${tg.map(x => opt(x.id, lbl(x), tg[0].id)).join('')}</select></label>
    <p class="small" id="cmb-out"></p>
    <label class="check"><input type="checkbox" name="removeOld" checked> Delete “${esc(d.name)}” once it is empty</label>
    <p class="tiny muted">${team ? 'Each team is assigned to the chosen division.' : 'Each competitor gets the chosen division for this event (shown on their card, where it can be set back to Auto).'} The chosen division keeps its name, ages and rules; ${S.d.brackets[tg[0].id] ? 'if it is already drawn it must be redrawn.' : 'draw it when ready.'}</p></form>`,
    `<button data-act="modal-close">Cancel</button><button class="primary" type="submit" form="f-combine">Combine</button>`));
  combineOut();
}
function combineOut() {
  const f = $('#f-combine'); if (!f) return;
  const d = DC.divBy[f.dataset.id], t = DC.divBy[$('#cmb-target').value]; if (!d || !t) return;
  const total = divEntrants(d.id).length + divEntrants(t.id).length;
  $('#cmb-out').innerHTML = `${esc(t.name)} will have <b>${total}</b>${total >= MIN_DIV ? '' : ' <span style="color:var(--warn)">(still under ' + MIN_DIV + ')</span>'}${t.gender !== d.gender && !t.open ? ' · <span style="color:var(--warn)">different gender</span>' : ''}${S.d.brackets[t.id] ? ' · <span style="color:var(--warn)">already drawn — redraw it after combining</span>' : ''}.`;
}
async function saveCombine(f) {
  const d = DC.divBy[f.dataset.id], v = fd(f), t = DC.divBy[v.target]; if (!d || !t) return;
  const ents = divEntrants(d.id).slice();
  for (const id of ents) {
    const c = DC.compBy[id];
    if (c) await guard(() => S.store.update(P.doc(S.evId, 'competitors', id), { divOverride: Object.assign({}, c.divOverride || {}, { [d.eventType]: t.id }) }));
    else if (DC.teamBy[id]) await guard(() => S.store.update(P.doc(S.evId, 'teams', id), { divisionId: t.id }));
  }
  await guard(() => S.store.update(P.doc(S.evId, 'divisions', t.id), { combinedFrom: [...new Set([...(t.combinedFrom || []), d.name])] }));
  if (v.removeOld && !S.d.brackets[d.id]) await guard(() => S.store.del(P.doc(S.evId, 'divisions', d.id)));
  closeModal(); toast(`${plural(ents.length, 'entrant')} moved into ${t.name}${v.removeOld ? ` · ${d.name} removed` : ''}`);
}
/* ---------- v1.36: bulk remove competitors of one import / dojo, club, federation / region / country ---------- */
function compHasResults(id) {
  for (const did in S.d.brackets) {
    const br = S.d.brackets[did];
    if (br.format === 'KP') { if (Object.keys(br.scores || {}).some(k => (k.split('_')[1] || '') === id && br.scores[k])) return true; continue; }
    const res = DC.res[did] || {};
    for (const mid in br.results || {}) { const r = res[mid]; if (r && (r.a === id || r.b === id)) return true; }
  }
  return false;
}
function inDrawnBracket(id) { return Object.values(S.d.brackets).some(br => (br.entrants || []).includes(id)); }
function removeGroups() {
  const out = [], add = (key, label, kind, ids) => ids.length && out.push({ key, label, kind, ids });
  const by = (f) => { const m = {}; DC.comps.forEach(c => { const v = String(c[f] || '').trim(); if (v) (m[v] = m[v] || []).push(c.id); }); return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0])); };
  const imp = {}; DC.comps.forEach(c => { if (c.importId) (imp[c.importId] = imp[c.importId] || { name: c.importName, at: c.importAt, ids: [] }).ids.push(c.id); });
  Object.entries(imp).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at))).forEach(([k, v]) => add('import:' + k, `${v.name || 'Import'} · ${v.at ? new Date(v.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}`, 'From an import', v.ids));
  by('dojo').forEach(([v, ids]) => add('dojo:' + v, v, 'Dojo / club / federation', ids));
  by('state').forEach(([v, ids]) => add('state:' + v, v, 'State / region', ids));
  by('country').forEach(([v, ids]) => add('country:' + v, v, 'Country', ids));
  return out;
}
function removeGroupForm(key) {
  const groups = removeGroups();
  if (!groups.length) { toast('No competitors to remove.', true); return; }
  const g = groups.find(x => x.key === key) || groups[0];
  const kinds = [...new Set(groups.map(x => x.kind))];
  const sel = `<select id="rg-group" data-change="rg-group" aria-label="Group">${kinds.map(k => `<optgroup label="${esc(k)}">${groups.filter(x => x.kind === k).map(x => opt(x.key, `${x.label} (${x.ids.length})`, g.key)).join('')}</optgroup>`).join('')}</select>`;
  const rows = g.ids.map(id => DC.compBy[id]).filter(Boolean).sort((a, b) => String(a.lastName).localeCompare(String(b.lastName)) || String(a.firstName).localeCompare(String(b.firstName))).map(c => {
    const locked = compHasResults(c.id), drawn = !locked && inDrawnBracket(c.id);
    return `<label class="check rg-row${locked ? ' locked' : ''}"><input type="checkbox" name="rm" value="${esc(c.id)}" ${locked ? 'disabled' : 'checked'} data-change="rg-count"> <span><b>${esc(c.lastName)}, ${esc(c.firstName)}</b> <span class="tiny muted">${esc([c.dojo, c.state, c.country].filter(Boolean).join(' · '))}</span>${locked ? ' <span class="chip bad">has results — kept</span>' : drawn ? ' <span class="chip warn">in a drawn bracket</span>' : ''}</span></label>`;
  }).join('');
  openModal(sheet('Remove a group of competitors', `<form id="f-rmgroup" data-form="rmgroup" class="stack">
    <p class="small">Take out everyone from one import, dojo / club / federation, region or country — e.g. to import a corrected file again. Competitors with recorded results are kept.</p>
    <label class="f"><span>Group</span>${sel}</label>
    <div class="row between small"><span><b id="rg-n"></b></span><span><button type="button" class="sm ghost" data-act="rg-all" data-v="1">Tick all</button><button type="button" class="sm ghost" data-act="rg-all" data-v="0">Untick all</button></span></div>
    <div class="stack rg-list" style="gap:4px">${rows}</div>
    <p class="tiny muted">Removing deletes their registration and private details in this event and takes them off any team (a team left with nobody is deleted). Drawn brackets that included them show “Entrants changed” and need a redraw. This can’t be undone — import the corrected file afterwards.</p></form>`,
    `<button data-act="modal-close">Cancel</button><button class="danger primary" type="submit" form="f-rmgroup" id="rg-go">Remove</button>`), { wide: true });
  rgCount();
}
function rgCount() {
  const n = $$('#f-rmgroup input[name="rm"]:checked').length, kept = $$('#f-rmgroup input[name="rm"]:disabled').length;
  const el = $('#rg-n'); if (el) el.textContent = `${plural(n, 'competitor')} selected${kept ? ` · ${kept} with results kept` : ''}`;
  const b = $('#rg-go'); if (b) { b.disabled = !n; b.textContent = n ? `Remove ${n}` : 'Remove'; }
}
async function removeGroup(f) {
  const ids = $$('input[name="rm"]:checked', f).map(i => i.value).filter(id => DC.compBy[id] && !compHasResults(id));
  if (!ids.length) return;
  const gl = ($('#rg-group') || {}).selectedOptions ? $('#rg-group').selectedOptions[0].textContent.replace(/\s*\(\d+\)$/, '') : '';
  if (!(await confirmBox(`Remove ${plural(ids.length, 'competitor')}${gl ? ' of ' + gl : ''}? Their registrations are deleted from this event.`, `Remove ${ids.length}`, true))) return;
  const set = new Set(ids);
  for (const t of DC.teams) {
    const left = (t.memberIds || []).filter(m => !set.has(m));
    if (left.length === (t.memberIds || []).length) continue;
    await guard(() => left.length ? S.store.update(P.doc(S.evId, 'teams', t.id), { memberIds: left }) : S.store.del(P.doc(S.evId, 'teams', t.id)));
  }
  let n = 0;
  for (const id of ids) { if (await guard(async () => { await S.store.del(P.doc(S.evId, 'competitors', id)); await S.store.del(P.pv(S.evId, id)); return true; })) n++; }
  closeModal(); S.ui.filter = 'all'; toast(`Removed ${plural(n, 'competitor')}${gl ? ' · ' + gl : ''}. You can import the corrected file now.`);
}
/** v1.37: strip day and month from birth dates already stored (international events) */
async function keepYearOnly() {
  const list = DC.comps.filter(c => c.dob);
  if (!list.length) return;
  if (!(await confirmBox(`Keep only the year of birth for ${plural(list.length, 'competitor')}? The day and month are deleted for good; ages stay the same (birth-year rule, 31 Dec).`, 'Keep year only'))) return;
  let n = 0;
  for (const c of list) if (await guard(async () => { await S.store.update(P.pv(S.evId, c.id), { dob: '', birthYear: c.dob.slice(0, 4) }); await S.store.update(P.doc(S.evId, 'competitors', c.id), { age: KT.ageFromYear(c.dob.slice(0, 4), DC.asOf) }); return true; })) n++;
  toast(`${plural(n, 'birth date')} reduced to the year`);
}
function ringForm(id) {
  const r = id ? S.d.rings[id] : {};
  openModal(sheet(id ? 'Ring' : 'Add ring', `<form id="f-ring" data-form="ring" data-id="${esc(id || '')}" class="stack"><label class="f req"><span>Ring name</span><input name="name" id="r-name" required value="${esc(r.name || '')}" placeholder="Ring ${DC.rings.length + 1}"></label></form>`,
    `${id ? '<button class="danger" data-act="ring-delete" style="margin-right:auto">Delete ring</button>' : ''}<button data-act="modal-close">Cancel</button><button class="primary" type="submit" form="f-ring">Save</button>`));
}
function sessionForm(id) {
  const s = id ? S.d.sessions[id] : { date: curEvent().startDate };
  openModal(sheet(id ? 'Session' : 'Add session', `<form id="f-sess" data-form="session" data-id="${esc(id || '')}" class="stack"><div class="fgrid">
    <label class="f req span"><span>Title</span><input name="title" id="s-title" required value="${esc(s.title || '')}" placeholder="e.g. Kata: Bassai Dai"></label>
    <label class="f req"><span>Date</span><input type="date" name="date" id="s-date" required value="${esc(s.date || '')}"></label>
    <label class="f"><span>Start</span><input type="time" name="start" id="s-start" value="${esc(s.start || '')}"></label>
    <label class="f"><span>End</span><input type="time" name="end" id="s-end" value="${esc(s.end || '')}"></label>
    <label class="f"><span>Instructor</span><input name="instructor" id="s-inst" value="${esc(s.instructor || '')}"></label>
    <label class="f"><span>Location</span><input name="location" id="s-loc" value="${esc(s.location || '')}"></label>
    <label class="f"><span>Capacity</span><input type="number" name="capacity" id="s-cap" min="0" value="${esc(s.capacity || '')}"></label>
    <label class="f span"><span>Notes</span><textarea name="notes" id="s-notes">${esc(s.notes || '')}</textarea></label></div></form>`,
    `${id ? '<button class="danger" data-act="session-delete" style="margin-right:auto">Delete</button>' : ''}<button data-act="modal-close">Cancel</button><button class="primary" type="submit" form="f-sess">Save</button>`));
}
function tiebreakForm(did, P) {
  const br = S.d.brackets[did], res = DC.res[did];
  const st = KT.standings(br, P, id => res[id]);
  S.tbOrder = st.rows.map(r => r.id);
  S.modal = { type: 'tb', did, P, refresh: null };
  const draw = () => `<p class="small muted">Set the final order for Pool ${esc(P)} (for example after a deciding bout or a referee panel decision).</p>
    <div class="stack" style="gap:6px">${S.tbOrder.map((id, i) => `<div class="row between"><span><b class="num">${i + 1}.</b> ${esc(entName(id, did))} <span class="muted small">${esc(entDojo(id))}</span></span>
    <span class="row" style="gap:4px"><button class="sm" data-act="tb-move" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Up">↑</button><button class="sm" data-act="tb-move" data-i="${i}" data-dir="1" ${i === S.tbOrder.length - 1 ? 'disabled' : ''} aria-label="Down">↓</button></span></div>`).join('')}</div>`;
  S.tbDraw = draw;
  openModal(sheet(`Tiebreak · Pool ${esc(P)}`, `<div id="tb-body">${draw()}</div>`, `<button data-act="modal-close">Cancel</button><button class="primary" data-act="tb-save">Save order</button>`));
  S.modal = { type: 'tb', did, P };
}
