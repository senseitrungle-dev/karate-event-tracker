/* ===== v1.56 division printout per country / region / club (Letter or A4).
   v1.57: laid out like the Polish federation's sheet — group bar, age groups side by side (Senior | Youth, Junior | Cadet),
   events stacked (kata ind., fukugo, kumite ind., kata team, enbu, kumite team), women | men numbered; the font shrinks so a
   group fits on at most two pages. Printing keeps the pages until the print dialog is done (iPhone / iPad print later). ===== */
const PRINT_BY = { country: 'Country', region: 'Region / federation', club: 'Club / dojo' };
const PRINT_LEVEL = { country: 'International', region: 'National', club: 'Local' };
const PRINT_EV = { IKATA: 'kata ind.', FUKUGO: 'fukugo', IKUMITE: 'kumite ind.', TKATA: 'kata team', ENBU: 'enbu', TKUMITE: 'kumite team' };
/** Printable area of one page in CSS px (12 mm margins). */
const PRINT_AREA = { letter: { w: 816 - 91, h: 1056 - 91 }, a4: { w: 794 - 91, h: 1123 - 91 } };
const PRINT_CSS = `
.ppage { font: 10px/1.3 "IBM Plex Sans", Arial, Helvetica, sans-serif; color: #111; background: #fff; box-sizing: border-box; }
.ppage * { box-sizing: border-box; }
.ppage .pbar { background: #616161; color: #fff; font-weight: 700; font-size: 1.5em; text-align: center; padding: .25em .5em; letter-spacing: .02em; }
.ppage .pmeta { font-size: .85em; color: #555; text-align: center; margin: .3em 0 .7em; }
.ppage .pcols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .9em 2.2em; align-items: start; }
.ppage .page-col { min-width: 0; }
.ppage .pbar2 { break-after: avoid; page-break-after: avoid; background: #616161; color: #fff; font-weight: 700; font-size: 1.1em; text-align: center; padding: .2em .5em; margin-bottom: .55em; text-transform: uppercase; letter-spacing: .03em; }
.ppage table.psec { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: .75em; font-size: 1em; }
.ppage .psec tr { break-inside: avoid; page-break-inside: avoid; }
.ppage .psec thead { display: table-header-group; }
.ppage .psec th { background: #d9d9d9; text-align: left; font-weight: 600; padding: .2em .35em; border-top: 1px solid #c3c3c3; text-transform: none; letter-spacing: normal; font-size: 1em; color: #111; position: static; }
.ppage .psec th .sub { font-weight: 400; color: #555; font-size: .85em; margin-left: .35em; }
.ppage .psec td { padding: .12em .3em; border-bottom: 1px solid #e3e3e3; vertical-align: top; overflow-wrap: anywhere; font-weight: 600; font-size: 1em; line-height: 1.3; color: #111; }
.ppage .psec td.pnum { text-align: right; color: #333; font-weight: 400; padding-right: .35em; overflow-wrap: normal; white-space: nowrap; }
.ppage .psec td.pteam { font-weight: 700; font-style: italic; color: #333; }
.ppage .psec .pfrom { font-weight: 400; font-style: italic; color: #555; }
.ppage .psec col.pn { width: 2.3em; }
#print-root { display: none; }
@media print {
  body.printing > *:not(#print-root) { display: none !important; }
  body.printing { background: #fff !important; margin: 0 !important; padding: 0 !important; }
  body.printing #print-root { display: block; width: 100%; margin: 0; }
  #print-root .ppage { padding: 0 2px 0 1px; break-after: page; page-break-after: always; }
  #print-root .ppage:last-child { break-after: auto; page-break-after: auto; }
  .ppage .pbar, .ppage .pbar2, .ppage .psec th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}`;
let printLv = 'International';
function printStyles() { if (!document.getElementById('print-css')) { const st = document.createElement('style'); st.id = 'print-css'; st.textContent = PRINT_CSS; document.head.appendChild(st); } }
function printByDefault() { const lv = (curEvent() || {}).level; return lv === 'International' ? 'country' : lv === 'National' ? 'region' : 'club'; }
function printPaper() { try { return localStorage.getItem('kt-paper') === 'a4' ? 'a4' : 'letter'; } catch (e) { return 'letter'; } }
function printData(by) {
  const lv = PRINT_LEVEL[by], none = 'No ' + (by === 'club' ? 'club' : by);
  const divs = DC.divs.filter(d => (DC.assign.byDiv[d.id] || []).length);
  // a team whose members come from different countries / regions / clubs is printed once: on the page of most of its members (ties: A→Z)
  const groupOf = id => { const g = entGroupLabel(id, lv), t = DC.teamBy[id]; if (g || !t) return g;
    const n = {}; for (const m of t.memberIds || []) { const x = entGroupLabel(m, lv); if (x) n[x] = (n[x] || 0) + 1; }
    return Object.keys(n).sort((a, b) => n[b] - n[a] || a.localeCompare(b))[0] || ''; };
  printLv = lv;
  return KT.printGroups(divs, DC.assign.byDiv, groupOf).map(g => Object.assign(g, { label: g.group || none }));
}
/** Lines of one column: competitors numbered; teams as their members numbered (the team name first when the column has several teams). */
function printLines(ids, did) {
  const teams = ids.filter(id => DC.teamBy[id]).length, out = [];
  let n = 0;
  for (const id of ids) {
    const t = DC.teamBy[id];
    if (!t) { const c = DC.compBy[id], seed = entSeed(id, did); out.push({ n: ++n, h: esc(c ? `${c.firstName || ''} ${c.lastName || ''}`.trim() + (seed ? ' *' + seed : '') : entName(id, did)) }); continue; }
    if (teams > 1) { out.push({ team: true, h: esc(entName(id, did)) }); n = 0; }
    const mem = (t.memberIds || []).map(m => DC.compBy[m]).filter(Boolean), gs = mem.map(m => entGroupLabel(m.id, printLv)), mixed = new Set(gs.filter(Boolean)).size > 1;
    mem.forEach((m, i) => out.push({ n: ++n, h: `${esc((m.firstName || '') + ' ' + (m.lastName || ''))}${mixed ? ` <span class="pfrom">· ${esc(gs[i] || '—')}</span>` : ''}` }));
  }
  return out;
}
/** One event of an age group: women | men (enbu: W/M mixed | M/M | W/W); more than two columns wrap in pairs. */
function printSection(b) {
  const ev = PRINT_EV[b.et] || b.et, enbu = b.et === 'ENBU';
  const cols = (enbu ? [['X', 'enbu W/M'], ['M', 'enbu M/M'], ['F', 'enbu W/W']] : [['F', 'women'], ['M', 'men'], ['X', 'mixed']])
    .filter(([k], i) => b[k].length || (!enbu && i < 2)).map(([k, l]) => ({ l, lines: printLines(b[k], b.did[k]) }));
  let html = '';
  for (let i = 0; i < cols.length; i += 2) {
    const L = cols[i], R = cols[i + 1] || { l: '', lines: [] }, rows = Math.max(L.lines.length, R.lines.length);
    const head = c => enbu ? `<b>${esc(c.l)}</b>` : c.l ? (c === cols[0] ? `<b>${esc(ev)}</b><span class="sub">${esc(c.l)}</span>` : `<span class="sub">${esc(c.l)}</span>`) : '';
    const cell = x => !x ? '<td class="pnum"></td><td></td>' : x.team ? `<td class="pnum"></td><td class="pteam">${x.h}</td>` : `<td class="pnum">${x.n}</td><td>${x.h}</td>`;
    html += `<table class="psec"><colgroup><col class="pn"><col><col class="pn"><col></colgroup><thead><tr><th colspan="2">${head(L)}</th><th colspan="2">${head(R)}</th></tr></thead>
      <tbody>${Array.from({ length: rows }, (_, r) => `<tr>${cell(L.lines[r])}${cell(R.lines[r])}</tr>`).join('')}</tbody></table>`;
  }
  return html;
}
function printPagesHTML(by, which) {
  const ev = curEvent() || {}, groups = printData(by).filter(g => !which || g.label === which);
  if (!groups.length) return '<p class="small muted">No competitors are placed in a division yet.</p>';
  return groups.map(g => { const n = new Set(g.ages.flatMap(a => a.blocks.flatMap(b => [...b.F, ...b.M, ...b.X]).flatMap(id => DC.teamBy[id] ? DC.teamBy[id].memberIds || [] : [id]).filter(id => entGroupLabel(id, printLv) === g.group))).size;   // this page's own competitors
    return `<section class="ppage"><div class="pbar">${esc(g.label.toUpperCase())}</div><div class="pmeta">${esc(ev.name || '')}${ev.startDate ? ' · ' + esc(fmtDate(ev.startDate)) : ''} · ${plural(n, 'competitor')}</div>
      <div class="pcols">${g.ages.map(a => `<div class="page-col"><div class="pbar2">${esc(a.age)}</div>${a.blocks.map(printSection).join('')}</div>`).join('')}</div></section>`; }).join('');
}
/** Font size per group page so it fits on at most two pages of the paper (measured off screen at the printable width). */
function printFit(html, paper) {
  printStyles();
  const A = PRINT_AREA[paper] || PRINT_AREA.letter, box = document.createElement('div');
  box.style.cssText = `position:fixed;left:-20000px;top:0;width:${A.w}px;visibility:hidden;pointer-events:none`;
  box.innerHTML = html; document.body.appendChild(box);
  const sizes = [...box.querySelectorAll('.ppage')].map(pg => {
    for (const fs of [10.5, 10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6]) { pg.style.fontSize = fs + 'px'; if (pg.scrollHeight <= A.h * 2 * 0.94) return fs; }   // room for page breaks between tables
    return 6;
  });
  box.remove();
  return sizes;
}
function printApply(el, sizes) { [...el.querySelectorAll('.ppage')].forEach((pg, i) => { pg.style.fontSize = (sizes[i] || 10) + 'px'; }); }
function printForm() {
  printStyles();
  const by = printByDefault(), groups = printData(by);
  openModal(sheet('Print divisions', `<div class="stack">
    <p class="small muted">One ${esc(PRINT_BY[by].toLowerCase())} per sheet — age groups side by side, every division it has competitors in, women and men numbered. The text gets smaller as needed so each fits on at most two pages.</p>
    <div class="fgrid">
      <label class="f"><span>One sheet per</span><select id="pr-by" data-change="print-opt">${Object.entries(PRINT_BY).map(([k, l]) => opt(k, l, by)).join('')}</select></label>
      <label class="f"><span>Print</span><select id="pr-which" data-change="print-opt">${opt('', `All (${groups.length})`, '')}${groups.map(g => opt(g.label, g.label, '')).join('')}</select></label>
      <label class="f"><span>Paper</span><select id="pr-paper" data-change="print-opt">${opt('letter', 'Letter (8.5 × 11 in)', printPaper())}${opt('a4', 'A4 (210 × 297 mm)', printPaper())}</select></label></div>
    <div id="pr-preview" class="pr-preview paper-${printPaper()}"></div>
    <p class="tiny muted">Print opens your device's print dialog — choose your printer, or “Save as PDF” (on iPhone / iPad: Print, then share the preview to save it). If nothing opens here, use “Open as page”.</p></div>`,
    '<button data-act="modal-close">Cancel</button><button data-act="print-page" id="pr-page">Open as page</button><button class="primary" data-act="print-go" id="pr-go">Print</button>'), { wide: true });
  printRefresh();
}
/** Options changed: refresh the group list (when the grouping changed) and the preview. */
function printRefresh(el) {
  const by = $('#pr-by').value, w = $('#pr-which'), paper = $('#pr-paper').value;
  try { localStorage.setItem('kt-paper', paper); } catch (e) { /* ignore */ }
  if (el && el.id === 'pr-by') { const gs = printData(by); w.innerHTML = opt('', `All (${gs.length})`, '') + gs.map(g => opt(g.label, g.label, '')).join(''); }
  const pv = $('#pr-preview'), html = printPagesHTML(by, w.value);
  pv.className = 'pr-preview paper-' + paper; pv.innerHTML = html; printApply(pv, printFit(html, paper));
}
function printDoc() {
  const by = $('#pr-by').value, which = $('#pr-which').value, paper = $('#pr-paper').value, html = printPagesHTML(by, which);
  return { paper, html, sizes: printFit(html, paper), title: `${(curEvent() || {}).name || 'Event'} - divisions by ${PRINT_BY[by].toLowerCase()}` };
}
function printCleanup() { document.body.classList.remove('printing'); const r = document.getElementById('print-root'); if (r) r.remove(); }
function printGo() {
  const d = printDoc();
  printCleanup(); printStyles();
  const root = document.createElement('div'); root.id = 'print-root'; root.innerHTML = d.html; printApply(root, d.sizes); document.body.appendChild(root);
  let st = document.getElementById('print-page'); if (!st) { st = document.createElement('style'); st.id = 'print-page'; document.head.appendChild(st); }
  st.textContent = `@page { size: ${d.paper === 'a4' ? 'A4' : 'letter'} portrait; margin: 12mm; }`;
  document.body.classList.add('printing');
  // the pages stay until the print dialog is done: on iPhone / iPad print() returns at once and the dialog reads the page later
  window.addEventListener('afterprint', function done() { window.removeEventListener('afterprint', done); setTimeout(printCleanup, 800); });
  if (typeof window.print !== 'function') { toast('This browser cannot print from here — use “Open as page”.', true); return; }
  try { window.print(); } catch (e) { toast('Printing is blocked here — use “Open as page”.', true); }
}
/** The same pages as a document of their own (new tab; or a file to open and print where tabs are blocked). */
function printPage() {
  const d = printDoc(), box = document.createElement('div'); box.innerHTML = d.html; printApply(box, d.sizes);
  const doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(d.title)}</title>
<style>@page { size: ${d.paper === 'a4' ? 'A4' : 'letter'} portrait; margin: 12mm; } body { margin: 0; background: #e9e9e6; } .ppage { max-width: ${d.paper === 'a4' ? '210mm' : '8.5in'}; margin: 12px auto; padding: 12mm; box-shadow: 0 1px 6px rgba(0,0,0,.18); }
@media print { body { background: #fff; } .ppage { margin: 0; padding: 0 2px 0 1px; box-shadow: none; max-width: none; break-after: page; page-break-after: always; } .ppage:last-child { break-after: auto; page-break-after: auto; } .bar-p { display: none; } }
.bar-p { text-align: center; padding: 10px; font: 14px Arial, sans-serif; } .bar-p button { font: inherit; padding: 8px 16px; }${PRINT_CSS.replace(/#print-root[^}]*}/, '')}</style></head>
<body><div class="bar-p"><button onclick="window.print()">Print / Save as PDF</button></div>${box.innerHTML}</body></html>`;
  let w = null;
  try { const url = URL.createObjectURL(new Blob([doc], { type: 'text/html' })); w = window.open(url, '_blank'); setTimeout(() => URL.revokeObjectURL(url), 60000); } catch (e) { w = null; }
  if (!w) saveFile(d.title + '.html', doc);   // pop-ups blocked: download it, then open it and print
}
