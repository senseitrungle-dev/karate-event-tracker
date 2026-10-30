/* ===== v1.56 division printout per country / region / club (Letter or A4), laid out like the director's "Division printout" sheet ===== */
const PRINT_BY = { country: 'Country', region: 'Region / federation', club: 'Club / dojo' };
const PRINT_LEVEL = { country: 'International', region: 'National', club: 'Local' };
function printByDefault() { const lv = (curEvent() || {}).level; return lv === 'International' ? 'country' : lv === 'National' ? 'region' : 'club'; }
function printPaper() { try { return localStorage.getItem('kt-paper') === 'a4' ? 'a4' : 'letter'; } catch (e) { return 'letter'; } }
function printData(by) {
  const lv = PRINT_LEVEL[by], none = 'No ' + (by === 'club' ? 'club' : by);
  const divs = DC.divs.filter(d => (DC.assign.byDiv[d.id] || []).length);
  // a team whose members come from different countries / regions / clubs is printed on each of their pages
  const groupOf = id => { const g = entGroupLabel(id, lv), t = DC.teamBy[id]; if (g || !t) return g;
    const gs = [...new Set((t.memberIds || []).map(m => entGroupLabel(m, lv)).filter(Boolean))]; return gs.length ? gs : ''; };
  return KT.printGroups(divs, DC.assign.byDiv, groupOf).map(g => Object.assign(g, { label: g.group || none }));
}
/** Names in one gender column: competitors, or each team (bold) followed by its members. */
function printCol(ids, did) {
  return ids.map(id => { const t = DC.teamBy[id];
    if (!t) return `<div class="pn">${esc(entName(id, did))}</div>`;
    const mem = (t.memberIds || []).map(m => DC.compBy[m]).filter(Boolean);
    return `<div class="pn pteam">${esc(entName(id, did))}</div>${mem.map(m => `<div class="pn pmem">${esc((m.lastName || '') + ', ' + (m.firstName || ''))}</div>`).join('')}`; }).join('');
}
function printBlock(b) {
  if (!b) return '<div class="pblock pempty"></div>';
  const fm = b.F.length || b.M.length ? `<div class="pgrid"><div class="ph">Women</div><div class="ph">Men</div><div class="pc">${printCol(b.F, b.did.F)}</div><div class="pc">${printCol(b.M, b.did.M)}</div></div>` : '';
  const team = KT.EVENT_TYPES[b.et] && KT.EVENT_TYPES[b.et].team;
  const mx = b.X.length ? `<div class="ph pmix">${team ? 'Mixed Gender' : 'Open'}</div><div class="pgrid pxgrid">${b.X.map(id => { const t = DC.teamBy[id];
    if (!t) return `<div class="pn">${esc(entName(id, b.did.X))}</div>`;
    const mem = (t.memberIds || []).map(m => DC.compBy[m]).filter(Boolean);
    return `<div class="pn pteam pspan">${esc(entName(id, b.did.X))}</div>${mem.map(m => `<div class="pn pmem">${esc((m.lastName || '') + ', ' + (m.firstName || ''))}</div>`).join('')}`; }).join('')}</div>` : '';
  return `<div class="pblock"><div class="ptitle">${esc(b.title)}</div>${fm}${mx}</div>`;
}
function printPagesHTML(by, which) {
  const ev = curEvent() || {}, groups = printData(by).filter(g => !which || g.label === which);
  if (!groups.length) return '<p class="small muted">No competitors are placed in a division yet.</p>';
  return groups.map(g => { const n = new Set(g.ages.flatMap(a => a.rows.flat().filter(Boolean).flatMap(b => [...b.F, ...b.M, ...b.X]).flatMap(id => DC.teamBy[id] ? DC.teamBy[id].memberIds || [] : [id]))).size;
    return `<section class="ppage"><h1>${esc(g.label)} Competitors</h1><div class="pmeta">${esc(ev.name || '')}${ev.startDate ? ' · ' + esc(fmtDate(ev.startDate)) : ''} · ${plural(n, 'competitor')}</div>
      ${g.ages.map(a => `<div class="page-grp">${a.rows.map(r => `<div class="prow">${printBlock(r[0])}${printBlock(r[1])}</div>`).join('')}</div>`).join('')}</section>`; }).join('');
}
function printForm() {
  const by = printByDefault(), groups = printData(by);
  openModal(sheet('Print divisions', `<div class="stack">
    <p class="small muted">One page per ${esc(PRINT_BY[by].toLowerCase())} with every division it has competitors in — age groups in order, Kata | Kumite, Team Kata | Team Kumite, Fukugo | Enbu, women and men side by side.</p>
    <div class="fgrid">
      <label class="f"><span>One page per</span><select id="pr-by" data-change="print-opt">${Object.entries(PRINT_BY).map(([k, l]) => opt(k, l, by)).join('')}</select></label>
      <label class="f"><span>Print</span><select id="pr-which" data-change="print-opt">${opt('', `All (${groups.length})`, '')}${groups.map(g => opt(g.label, g.label, '')).join('')}</select></label>
      <label class="f"><span>Paper</span><select id="pr-paper" data-change="print-opt">${opt('letter', 'Letter (8.5 × 11 in)', printPaper())}${opt('a4', 'A4 (210 × 297 mm)', printPaper())}</select></label></div>
    <div id="pr-preview" class="pr-preview paper-${printPaper()}">${printPagesHTML(by, '')}</div></div>`,
    '<button data-act="modal-close">Cancel</button><button class="primary" data-act="print-go" id="pr-go">Print</button>'), { wide: true });
}
/** Options changed: refresh the group list (when the grouping changed) and the preview. */
function printRefresh(el) {
  const by = $('#pr-by').value, w = $('#pr-which'), paper = $('#pr-paper').value;
  try { localStorage.setItem('kt-paper', paper); } catch (e) { /* ignore */ }
  if (el && el.id === 'pr-by') { const gs = printData(by); w.innerHTML = opt('', `All (${gs.length})`, '') + gs.map(g => opt(g.label, g.label, '')).join(''); }
  const pv = $('#pr-preview'); pv.className = 'pr-preview paper-' + paper; pv.innerHTML = printPagesHTML(by, w.value);
}
function printGo() {
  const by = $('#pr-by').value, which = $('#pr-which').value, paper = $('#pr-paper').value;
  let root = document.getElementById('print-root'); if (root) root.remove();
  root = document.createElement('div'); root.id = 'print-root'; root.className = 'paper-' + paper; root.innerHTML = printPagesHTML(by, which); document.body.appendChild(root);
  let st = document.getElementById('print-page'); if (!st) { st = document.createElement('style'); st.id = 'print-page'; document.head.appendChild(st); }
  st.textContent = `@page { size: ${paper === 'a4' ? 'A4' : 'letter'} portrait; margin: 12mm; }`;
  document.body.classList.add('printing');
  const done = () => { document.body.classList.remove('printing'); const r = document.getElementById('print-root'); if (r) r.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  try { window.print(); } catch (e) { toast('Printing is not available here — open the site in a browser tab.', true); }
  setTimeout(() => { if (!window.matchMedia || !window.matchMedia('print').matches) done(); }, 1500);
}
