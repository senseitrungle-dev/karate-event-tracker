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
      </div>
      <div><div class="label" style="margin-bottom:6px">Events offered</div><div class="pill-list">${KT.EVENT_ORDER.map(k => `<label class="check chip plain"><input type="checkbox" data-multi="1" name="eventTypes" value="${k}" ${et.has(k) ? 'checked' : ''}> ${esc(KT.EVENT_TYPES[k].label)}</label>`).join('')}</div></div>
    </div></fieldset>
    <label class="f"><span>Notes</span><textarea name="notes" id="ev-notes">${esc(e.notes || '')}</textarea></label></form>`,
    `${id ? '<button class="danger" data-act="event-delete" style="margin-right:auto">Delete event</button>' : ''}<button data-act="modal-close">Cancel</button><button class="primary" type="submit" form="f-event">${id ? 'Save' : 'Create event'}</button>`));
}

function compForm(id) {
  const ev = curEvent(), tour = ev.kind === 'tournament';
  const c = id ? DC.compBy[id] : { gender: '', events: [], status: 'active' };
  const evs = new Set(c.events || []);
  const offered = (ev.eventTypes || KT.EVENT_ORDER);
  const evRows = tour ? offered.map(et => {
    const T = KT.EVENT_TYPES[et];
    if (T.team) return `<div class="row between small"><label class="check"><input type="checkbox" data-multi="1" name="events" value="${et}" ${evs.has(et) ? 'checked' : ''}> ${esc(T.label)}</label><span class="muted tiny">Assign on the Teams tab</span></div>`;
    const cand = id ? KT.candidateDivisions(c, et, DC.divs, DC.asOf) : [];
    const all = DC.divs.filter(d => d.eventType === et);
    const ov = (c.divOverride || {})[et] || '';
    return `<div class="row between small" style="gap:6px"><label class="check"><input type="checkbox" data-multi="1" name="events" value="${et}" ${evs.has(et) ? 'checked' : ''}> ${esc(T.label)}</label>
      <select name="ov_${et}" id="ov-${et}" style="max-width:320px" aria-label="${esc(T.label)} division">${opt('', cand.length ? `Auto → ${cand[0].name}` : 'Auto (save to match)', ov)}${all.map(d => opt(d.id, d.name, ov)).join('')}</select></div>`;
  }).join('') : '';
  openModal(sheet(id ? `${esc(c.firstName)} ${esc(c.lastName)}` : (tour ? 'Register competitor' : 'Add participant'), `<form id="f-comp" data-form="comp" data-id="${esc(id || '')}" class="stack">
    <fieldset><legend>Competitor</legend><div class="fgrid">
      <label class="f req"><span>First name</span><input name="firstName" id="c-first" required value="${esc(c.firstName || '')}"></label>
      <label class="f req"><span>Last name</span><input name="lastName" id="c-last" required value="${esc(c.lastName || '')}"></label>
      <label class="f ${tour ? 'req' : ''}"><span>Gender</span><select name="gender" id="c-gender" ${tour ? 'required' : ''}>${opt('', 'Select…', c.gender)}${opt('M', 'Male', c.gender)}${opt('F', 'Female', c.gender)}</select></label>
      <label class="f ${tour ? 'req' : ''}"><span>Date of birth</span><input type="date" name="dob" id="c-dob" ${tour ? 'required' : ''} value="${esc(c.dob || '')}"></label>
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
const PV_FIELDS = ['dob', 'email', 'phone', 'emergencyName', 'emergencyPhone', 'feeAmount', 'notes'];
async function saveComp(form) {
  const ev = curEvent(), id = form.dataset.id || uid(), v = fd(form);
  const tour = ev.kind === 'tournament';
  if (!v.firstName || !v.lastName || !v.rank || (tour && (!v.gender || !v.dob))) { toast('Name, rank' + (tour ? ', gender and date of birth are' : ' are') + ' required.', true); return; }
  const divOverride = {};
  for (const k of Object.keys(v)) if (k.startsWith('ov_')) { if (v[k]) divOverride[k.slice(3)] = v[k]; delete v[k]; }
  const pub = { firstName: v.firstName, lastName: v.lastName, gender: v.gender, rank: v.rank, dojo: v.dojo, state: v.state, country: v.country,
    waiver: v.waiver, feePaid: v.feePaid, checkedIn: v.checkedIn, status: v.status || 'active', events: v.events || [], divOverride,
    age: v.dob ? KT.ageOn(v.dob, DC.asOf) : null, updatedAt: new Date().toISOString() };
  const old = DC.compBy[form.dataset.id];
  if (old && old.createdAt) pub.createdAt = old.createdAt; else pub.createdAt = new Date().toISOString();
  const pv = {}; PV_FIELDS.forEach(k => { pv[k] = v[k] || ''; });
  const ok = await guard(async () => { await S.store.set(P.doc(S.evId, 'competitors', id), pub); await S.store.set(P.pv(S.evId, id), pv); }, 'Saved');
  if (ok) closeModal();
}

function importForm() {
  openModal(sheet('Import competitors', `<p class="small">Paste CSV text or choose a .csv file. The first row must be column headings. Recognised columns:</p>
    <p class="tiny mono muted">first_name, last_name, gender, dob, rank, dojo, state, country, email, phone, emergency_name, emergency_phone, waiver, paid, events</p>
    <p class="tiny muted">Dates as YYYY-MM-DD or M/D/YYYY · ranks like “3rd Kyu”, “Shodan”, “2nd Dan”, k3, d2 · events separated by “;” (Individual Kata; Individual Kumite; Team Kata; Team Kumite; Fukugo; Enbu).</p>
    <input type="file" id="imp-file" accept=".csv,text/csv" data-change="imp-file">
    <textarea id="imp-text" rows="10" placeholder="first_name,last_name,gender,dob,rank,dojo,events&#10;Aiko,Tanaka,F,2001-04-12,Shodan,Hoshi Dojo,Individual Kata;Individual Kumite"></textarea>
    <div id="imp-preview" class="small muted"></div>`,
    `<button data-act="modal-close">Cancel</button><button data-act="imp-preview">Check</button><button class="primary" data-act="imp-run">Import</button>`));
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
function importRows(text) {
  const rows = parseCSV(text); if (rows.length < 2) return { recs: [], errors: ['Need a heading row and at least one competitor.'] };
  const h = rows[0].map(x => x.toLowerCase().replace(/[^a-z]/g, ''));
  const col = (...names) => h.findIndex(x => names.includes(x));
  const ix = { first: col('firstname', 'first', 'givenname'), last: col('lastname', 'last', 'surname', 'familyname'), gender: col('gender', 'sex'), dob: col('dob', 'dateofbirth', 'birthdate', 'birthday'),
    rank: col('rank', 'belt', 'grade'), dojo: col('dojo', 'club', 'school'), state: col('state', 'region', 'province'), country: col('country'), email: col('email'), phone: col('phone', 'mobile'),
    en: col('emergencyname', 'emergencycontact', 'emergency'), ep: col('emergencyphone'), waiver: col('waiver', 'waiversigned'), paid: col('paid', 'feepaid'), events: col('events', 'event', 'divisions') };
  const recs = [], errors = [];
  const g = (r, i) => (i >= 0 ? (r[i] || '').trim() : '');
  const yes = s => /^(y|yes|true|1|x|✓)$/i.test(s);
  rows.slice(1).forEach((r, n) => {
    let dob = g(r, ix.dob);
    const m = dob.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) dob = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
    const gs = g(r, ix.gender).toLowerCase();
    const rec = { firstName: g(r, ix.first), lastName: g(r, ix.last), gender: /^(m|male|man|men)$/.test(gs) ? 'M' : /^(f|female|w|woman|women)$/.test(gs) ? 'F' : '',
      dob: /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : '', rank: parseRank(g(r, ix.rank)), dojo: g(r, ix.dojo), state: g(r, ix.state), country: g(r, ix.country), email: g(r, ix.email), phone: g(r, ix.phone),
      emergencyName: g(r, ix.en), emergencyPhone: g(r, ix.ep), waiver: yes(g(r, ix.waiver)), feePaid: yes(g(r, ix.paid)),
      events: [...new Set(g(r, ix.events).split(/[;|]/).map(s => EV_ALIASES[s.trim().toLowerCase()] || (KT.EVENT_TYPES[s.trim().toUpperCase()] ? s.trim().toUpperCase() : null)).filter(Boolean))] };
    const miss = [];
    if (!rec.firstName || !rec.lastName) miss.push('name'); if (!rec.rank) miss.push('rank');
    if (curEvent().kind === 'tournament') { if (!rec.gender) miss.push('gender'); if (!rec.dob) miss.push('date of birth'); }
    if (miss.length) errors.push(`Row ${n + 2}: missing ${miss.join(', ')}`); else recs.push(rec);
  });
  return { recs, errors };
}
async function runImport() {
  const { recs, errors } = importRows($('#imp-text').value);
  if (!recs.length) { $('#imp-preview').textContent = errors.join(' · ') || 'Nothing to import.'; return; }
  const btn = $('[data-act="imp-run"]'); btn.disabled = true;
  let done = 0;
  for (const r of recs) {
    const id = uid();
    const pub = { firstName: r.firstName, lastName: r.lastName, gender: r.gender, rank: r.rank, dojo: r.dojo, state: r.state, country: r.country, waiver: r.waiver, feePaid: r.feePaid,
      checkedIn: false, status: 'active', events: r.events, divOverride: {}, age: r.dob ? KT.ageOn(r.dob, DC.asOf) : null, createdAt: new Date().toISOString() };
    const ok = await guard(async () => { await S.store.set(P.doc(S.evId, 'competitors', id), pub); await S.store.set(P.pv(S.evId, id), { dob: r.dob, email: r.email, phone: r.phone, emergencyName: r.emergencyName, emergencyPhone: r.emergencyPhone, feeAmount: '', notes: '' }); return true; });
    if (!ok) break;
    done++; $('#imp-preview').textContent = `Imported ${done} of ${recs.length}…`;
  }
  closeModal(); toast(`Imported ${plural(done, 'competitor')}${errors.length ? ` · ${errors.length} rows skipped` : ''}`);
}

function teamForm(id, et) {
  const t = id ? DC.teamBy[id] : { eventType: et, memberIds: [], status: 'active' };
  et = t.eventType; const T = KT.EVENT_TYPES[et];
  const mem = new Set(t.memberIds || []);
  const pool = DC.comps.filter(c => c.status !== 'withdrawn' && ((c.events || []).includes(et) || mem.has(c.id)))
    .sort((a, b) => String(a.dojo).localeCompare(String(b.dojo)) || String(a.lastName).localeCompare(String(b.lastName)));
  const inOther = new Set(DC.teams.filter(x => x.id !== id && x.eventType === et).flatMap(x => x.memberIds || []));
  const divs = DC.divs.filter(d => d.eventType === et);
  openModal(sheet(id ? esc(t.name) : `New ${esc(T.label)} team`, `<form id="f-team" data-form="team" data-id="${esc(id || '')}" data-et="${et}" class="stack">
    <div class="fgrid"><label class="f req"><span>Team name</span><input name="name" id="t-name" required value="${esc(t.name || '')}" placeholder="e.g. Hoshi Dojo A"></label>
      <label class="f"><span>Dojo / club</span><input name="dojo" id="t-dojo" value="${esc(t.dojo || '')}"></label>
      <label class="f"><span>Division</span><select name="divisionId" id="t-div">${opt('', 'Auto (by members)', t.divisionId)}${divs.map(d => opt(d.id, d.name, t.divisionId)).join('')}</select></label>
      <label class="f"><span>Status</span><select name="status" id="t-status">${opt('active', 'Active', t.status)}${opt('withdrawn', 'Withdrawn', t.status)}</select></label></div>
    <fieldset><legend>Members · ${T.size[0] === T.size[1] ? T.size[0] : T.size[0] + '–' + T.size[1]} needed</legend>
      ${pool.length ? `<div class="stack" style="gap:6px;max-height:300px;overflow:auto">${pool.map(c => `<label class="check"><input type="checkbox" data-multi="1" name="memberIds" value="${esc(c.id)}" ${mem.has(c.id) ? 'checked' : ''}>
        ${esc(c.lastName)}, ${esc(c.firstName)} <span class="muted small">· ${esc(c.dojo || '')} · ${esc(c.gender === 'F' ? 'W' : 'M')} · ${esc(KT.rankLabel(c.rank))}${inOther.has(c.id) ? ' · on another team' : ''}</span></label>`).join('')}</div>`
        : `<p class="small muted">No competitors have entered ${esc(T.label)} yet. Tick the event on their registration first.</p>`}</fieldset></form>`,
    `${id ? '<button class="danger" data-act="team-delete" style="margin-right:auto">Delete</button>' : ''}<button data-act="modal-close">Cancel</button><button class="primary" type="submit" form="f-team">Save</button>`));
}
async function saveTeam(form) {
  const v = fd(form), et = form.dataset.et, T = KT.EVENT_TYPES[et], id = form.dataset.id || uid();
  if (!v.name) { toast('Give the team a name.', true); return; }
  const mids = v.memberIds || [];
  if (mids.length < T.size[0] || mids.length > T.size[1]) { toast(`${T.label} teams need ${T.size[0] === T.size[1] ? T.size[0] : T.size[0] + '–' + T.size[1]} members (selected ${mids.length}).`, true); return; }
  const mem = mids.map(i => DC.compBy[i]).filter(Boolean);
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
      <label class="f"><span>Gender</span><select name="gender" id="d-g">${KT.EVENT_TYPES[d.eventType].genders.map(g => opt(g, KT.GENDERS[g], d.gender)).join('')}</select></label>
      <label class="f"><span>Belt class</span><select name="belt" id="d-belt">${opt('black', 'Black belt (Dan)', d.belt)}${opt('kyu', 'Kyu belt', d.belt)}</select></label>
      <label class="f"><span>Group label</span><input name="group" id="d-group" value="${esc(d.group || '')}" placeholder="Senior, Youth, Novice…"></label>
      <label class="f"><span>Minimum age</span><input type="number" name="minAge" id="d-min" min="0" max="99" value="${esc(d.minAge ?? '')}"></label>
      <label class="f"><span>Maximum age</span><input type="number" name="maxAge" id="d-max" min="0" max="120" value="${esc(d.maxAge ?? '')}" placeholder="No limit"></label>
      <label class="f"><span>Lowest rank</span><select name="minRank" id="d-rlo">${rankOptions(d.minRank)}</select></label>
      <label class="f"><span>Highest rank</span><select name="maxRank" id="d-rhi">${rankOptions(d.maxRank)}</select></label>
      <label class="f span"><span>Division name</span><input name="name" id="d-name" value="${esc(d.name || '')}" placeholder="Leave blank to name automatically"></label>
    </div>
    <fieldset><legend>Bracket</legend><div class="fgrid">
      <label class="f"><span>Format</span><select name="format" id="d-fmt" ${bs.results ? 'disabled' : ''}>${Object.entries(KT.FORMATS).filter(([x]) => x !== 'KP' || k === 'kata').map(([x, l]) => opt(x, l, d.format)).join('')}</select></label>
      <label class="f"><span>Third place (single elim. / playoff)</span><select name="bronze" id="d-bronze">${opt('two', 'Two bronzes', d.bronze)}${opt('match', 'Bronze match', d.bronze)}</select></label>
      <label class="f"><span>Double elim. grand final</span><select name="reset" id="d-reset">${opt('1', 'Reset match if needed', d.reset === false ? '0' : '1')}${opt('0', 'Single final', d.reset === false ? '0' : '1')}</select></label>
      <label class="f"><span>Round robin: advance per pool</span><select name="advance" id="d-adv">${opt('', 'Auto (2 if two pools, else 1)', d.advance || '')}${opt('1', '1', d.advance)}${opt('2', '2', d.advance)}</select></label>
      <label class="f"><span>Ring</span><select name="ringId" id="d-ring">${opt('', 'No ring yet', d.ringId)}${DC.rings.map(r => opt(r.id, r.name, d.ringId)).join('')}</select></label>
    </div>${bs.results ? '<p class="tiny muted">Format is locked because results exist.</p>' : ''}</fieldset>
    <fieldset><legend>Scoring (ITKF 2009)</legend><div class="fgrid">
      ${k === 'kata' ? `<label class="f"><span>Decision</span><select name="method" id="d-method">${opt('flags', 'Flags (judges’ majority)', sc.method)}${opt('scores', 'Scores 0–10 (drop high & low with 5)', sc.method)}</select></label>` : ''}
      ${k === 'kata' ? `<label class="f"><span>Kata pools: max per pool</span><input type="number" name="poolSize" id="d-pool" min="4" max="12" value="${esc(d.poolSize || 8)}"><span class="tiny muted">Kata score pools only · ITKF allows up to 12</span></label>` : ''}
      ${k === 'kumite' || k === 'teamkumite' || k === 'fukugo' ? `<label class="f"><span>Kumite style</span><select name="style" id="d-style">${opt('shobu', 'Shobu Ippon (1:30)', sc.style)}${opt('kogo', 'Ko-go Kumite (6 exchanges)', sc.style)}</select></label>` : ''}
      ${k === 'kata' ? `<label class="f"><span>Judges</span><select name="judges" id="d-judges">${opt('3', '3', sc.judges)}${opt('5', '5', sc.judges)}${opt('6', '6 (Shu-shin + 5, scores only)', sc.judges)}${opt('7', '7', sc.judges)}</select></label>` : ''}
      ${k !== 'kata' ? `<label class="f"><span>Bout time (seconds)</span><input type="number" name="boutTime" id="d-bt" min="30" max="600" step="10" value="${esc(sc.boutTime)}"></label>
      <label class="f"><span>Kettei-sen (seconds, 0 = none)</span><input type="number" name="ketteiTime" id="d-kt" min="0" max="180" step="10" value="${esc(sc.ketteiTime)}"></label>` : ''}
      ${k === 'teamkumite' ? `<label class="f"><span>Rounds per team match</span><select name="bouts" id="d-bouts">${opt('3', '3 (ITKF)', sc.bouts)}${opt('5', '5', sc.bouts)}</select></label>` : ''}
    </div></fieldset>
    ${id ? `<fieldset><legend>Entrants &amp; seeds (${ents.length})</legend>${ents.length ? `<div class="stack" style="gap:6px">${ents.map(e => `<div class="row between small"><span style="min-width:0"><b>${esc(entName(e))}</b> <span class="muted">${esc(entDojo(e))}</span></span>
      <input type="number" min="1" max="64" name="seed_${esc(e)}" id="seed-${esc(e)}" value="${esc((d.seeds || {})[e] || '')}" placeholder="Seed" style="width:86px" aria-label="Seed"></div>`).join('')}</div>
      <p class="tiny muted" style="margin-top:6px">Seeded entrants are kept apart in the draw. Others are placed at random with dojo-mates separated where possible.</p>` : '<p class="small muted">No entrants match this division yet.</p>'}</fieldset>` : ''}</form>`,
    `${id ? `<button class="danger" data-act="div-delete" style="margin-right:auto">Delete</button>${bs.drawn ? `<button class="danger" data-act="bracket-clear">Clear bracket</button>` : ''}` : ''}<button data-act="modal-close">Cancel</button>${id && ents.length ? `<button data-act="draw" data-id="${esc(id)}" ${bs.results ? 'disabled' : ''}>${bs.drawn ? 'Save & redraw' : 'Save & draw'}</button>` : ''}<button class="primary" type="submit" form="f-div">Save</button>`));
}
async function saveDiv(form, thenDraw) {
  const v = fd(form), id = form.dataset.id || uid();
  const old = DC.divBy[form.dataset.id] || {};
  const T = KT.EVENT_TYPES[v.eventType];
  if (!T.genders.includes(v.gender)) v.gender = T.genders[0];
  const seeds = {}; for (const k of Object.keys(v)) if (k.startsWith('seed_')) { if (+v[k] > 0) seeds[k.slice(5)] = +v[k]; delete v[k]; }
  const kind = T.kind, base = Object.assign(KT.defaultScoring(v.eventType), old.scoring || {});
  if (v.format === 'KP' && kind !== 'kata') { toast('Kata score pools are for kata, team kata and enbu divisions.', true); return false; }
  const scoring = { method: v.format === 'KP' ? 'scores' : (v.method || base.method), judges: +(v.judges || base.judges), boutTime: +(v.boutTime || base.boutTime), ketteiTime: v.ketteiTime === '' || v.ketteiTime == null ? base.ketteiTime : +v.ketteiTime, bouts: +(v.bouts || base.bouts), style: v.style || base.style };
  if (scoring.method === 'flags' && scoring.judges % 2 === 0) scoring.judges = 5;
  const dv = { eventType: v.eventType, gender: v.gender, belt: v.belt, group: v.group, minAge: v.minAge === '' ? null : +v.minAge, maxAge: v.maxAge === '' ? null : +v.maxAge,
    minRank: v.minRank || (v.belt === 'black' ? 'd1' : 'k10'), maxRank: v.maxRank || (v.belt === 'black' ? 'd10' : 'k1'), format: v.format || old.format || 'SE', bronze: v.bronze, reset: v.reset !== '0', advance: v.advance ? +v.advance : null,
    ringId: v.ringId || '', ringOrder: old.ringOrder ?? Date.now(), scoring, seeds, order: old.order || 0, poolSize: v.poolSize ? Math.min(12, Math.max(4, +v.poolSize)) : (old.poolSize || 8) };
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
    <div class="stack" style="gap:6px">${S.tbOrder.map((id, i) => `<div class="row between"><span><b class="num">${i + 1}.</b> ${esc(entName(id))} <span class="muted small">${esc(entDojo(id))}</span></span>
    <span class="row" style="gap:4px"><button class="sm" data-act="tb-move" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="Up">↑</button><button class="sm" data-act="tb-move" data-i="${i}" data-dir="1" ${i === S.tbOrder.length - 1 ? 'disabled' : ''} aria-label="Down">↓</button></span></div>`).join('')}</div>`;
  S.tbDraw = draw;
  openModal(sheet(`Tiebreak · Pool ${esc(P)}`, `<div id="tb-body">${draw()}</div>`, `<button data-act="modal-close">Cancel</button><button class="primary" data-act="tb-save">Save order</button>`));
  S.modal = { type: 'tb', did, P };
}
