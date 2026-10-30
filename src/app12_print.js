/* ===== v1.56 division printout per country / region / club (Letter or A4).
   v1.57: laid out like the Polish federation's sheet — group bar, age groups side by side (Senior | Youth, Junior | Cadet),
   events stacked (kata ind., fukugo, kumite ind., kata team, enbu, kumite team), women | men numbered; the font shrinks so a
   group fits on at most two pages. Printing keeps the pages until the print dialog is done (iPhone / iPad print later).
   v1.58: 8 mm margins, names on one line (the font shrinks until every name fits), the preview is the real page scaled to the
   screen, and "PDF" draws the pages itself and builds the PDF in the app — the home-screen app on iPhone / iPad cannot print,
   so the PDF goes to the share sheet (Print, Save to Files, Mail…) or is downloaded. ===== */
const PRINT_BY = { country: 'Country', region: 'Region / federation', club: 'Club / dojo' };
const PRINT_LEVEL = { country: 'International', region: 'National', club: 'Local' };
const PRINT_EV = { IKATA: 'kata ind.', FUKUGO: 'fukugo', IKUMITE: 'kumite ind.', TKATA: 'kata team', ENBU: 'enbu', TKUMITE: 'kumite team', KITEI: 'ki-tei kata' };
/** Paper in CSS px (96 / in) and PDF points, with 8 mm margins; area = printable width × height in CSS px. */
const PRINT_MM = 96 / 25.4, PRINT_MARGIN = 8;
const PRINT_PAPER = { letter: { w: 816, h: 1056, pt: [612, 792], css: 'letter' }, a4: { w: 794, h: 1123, pt: [595.28, 841.89], css: 'A4' } };
const PRINT_AREA = Object.fromEntries(Object.entries(PRINT_PAPER).map(([k, p]) => [k, { w: Math.floor(p.w - 2 * PRINT_MARGIN * PRINT_MM), h: Math.floor(p.h - 2 * PRINT_MARGIN * PRINT_MM) }]));
const PRINT_CSS = `
.ppage { font: 10px/1.3 "IBM Plex Sans", Arial, Helvetica, sans-serif; color: #111; background: #fff; box-sizing: border-box; }
.ppage * { box-sizing: border-box; }
.ppage .pbar { background: #616161; color: #fff; font-weight: 700; font-size: 1.5em; text-align: center; padding: .25em .5em; letter-spacing: .02em; }
.ppage .pmeta { font-size: .85em; color: #555; text-align: center; margin: .3em 0 .7em; }
.ppage .pcols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: .9em 1.4em; align-items: start; }
.ppage .page-col { min-width: 0; }
.ppage .pbar2 { break-after: avoid; page-break-after: avoid; background: #616161; color: #fff; font-weight: 700; font-size: 1.1em; text-align: center; padding: .2em .5em; margin-bottom: .55em; text-transform: uppercase; letter-spacing: .03em; }
.ppage table.psec { width: 100%; border-collapse: collapse; table-layout: fixed; margin-bottom: .75em; font-size: 1em; }
.ppage .psec tr { break-inside: avoid; page-break-inside: avoid; }
.ppage .psec thead { display: table-header-group; }
.ppage .psec th { background: #d9d9d9; text-align: left; font-weight: 600; padding: .2em .35em; border-top: 1px solid #c3c3c3; text-transform: none; letter-spacing: normal; font-size: 1em; color: #111; position: static; }
.ppage .psec th .sub { font-weight: 400; color: #555; font-size: .85em; margin-left: .35em; }
.ppage .psec td { padding: .12em .3em; border-bottom: 1px solid #e3e3e3; vertical-align: top; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 600; font-size: 1em; line-height: 1.3; color: #111; }
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
/** Font size per group page: the largest (13 → 5.5 px) at which every name fits on its line and the sheet fits on two pages. */
function printFit(html, paper) {
  printStyles();
  const A = PRINT_AREA[paper] || PRINT_AREA.letter, box = printMeasureBox(html, A);
  const sizes = [...box.querySelectorAll('.ppage')].map(pg => {
    let fitH = null;
    for (const fs of [13, 12, 11, 10.5, 10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5]) {
      pg.style.fontSize = fs + 'px';
      if (pg.scrollHeight > A.h * 2 * 0.95) continue;   // room for page breaks between rows
      if (fitH === null) fitH = fs;
      if (![...pg.querySelectorAll('.psec td')].some(td => td.scrollWidth > td.clientWidth + 1)) return fs;
    }
    return fitH || 5.5;
  });
  box.remove();
  return sizes;
}
function printMeasureBox(html, A) {
  const box = document.createElement('div');
  box.style.cssText = `position:fixed;left:-20000px;top:0;width:${A.w}px;visibility:hidden;pointer-events:none`;
  box.innerHTML = html; document.body.appendChild(box); return box;
}
function printApply(el, sizes) { [...el.querySelectorAll('.ppage')].forEach((pg, i) => { pg.style.fontSize = (sizes[i] || 10) + 'px'; }); }
function printForm() {
  printStyles();
  const by = printByDefault(), groups = printData(by);
  openModal(sheet('Print divisions', `<div class="stack">
    <p class="small muted">One ${esc(PRINT_BY[by].toLowerCase())} per sheet — age groups side by side, every division it has competitors in, women and men numbered. The text gets smaller as needed so every name fits on its line and each sheet fits on at most two pages.</p>
    <div class="fgrid">
      <label class="f"><span>One sheet per</span><select id="pr-by" data-change="print-opt">${Object.entries(PRINT_BY).map(([k, l]) => opt(k, l, by)).join('')}</select></label>
      <label class="f"><span>Print</span><select id="pr-which" data-change="print-opt">${opt('', `All (${groups.length})`, '')}${groups.map(g => opt(g.label, g.label, '')).join('')}</select></label>
      <label class="f"><span>Paper</span><select id="pr-paper" data-change="print-opt">${opt('letter', 'Letter (8.5 × 11 in)', printPaper())}${opt('a4', 'A4 (210 × 297 mm)', printPaper())}</select></label></div>
    <div id="pr-preview" class="pr-preview"></div>
    <div id="pr-out" class="pr-out" hidden></div>
    <p class="tiny muted"><b>PDF</b> makes the file here — then share it (Print, Save to Files, Mail…) or download it. <b>Print</b> uses the browser's print dialog (computers; not available in the home-screen app on iPhone / iPad).</p></div>`,
    '<button data-act="modal-close">Cancel</button><button data-act="print-go" id="pr-go">Print</button><button class="primary" data-act="print-pdf" id="pr-pdf">PDF</button>'), { wide: true });
  printRefresh();
}
/** Options changed: refresh the group list (when the grouping changed) and the preview (the real page, scaled to the screen). */
function printRefresh(el) {
  const by = $('#pr-by').value, w = $('#pr-which'), paper = $('#pr-paper').value, A = PRINT_AREA[paper];
  try { localStorage.setItem('kt-paper', paper); } catch (e) { /* ignore */ }
  if (el && el.id === 'pr-by') { const gs = printData(by); w.innerHTML = opt('', `All (${gs.length})`, '') + gs.map(g => opt(g.label, g.label, '')).join(''); }
  const out = $('#pr-out'); if (out) { out.hidden = true; out.innerHTML = ''; }
  const pv = $('#pr-preview'), html = printPagesHTML(by, w.value), sizes = printFit(html, paper);
  pv.innerHTML = html.replace(/<section class="ppage">/g, '<div class="pv-sheet"><section class="ppage">').replace(/<\/section>/g, '</section></div>');
  printApply(pv, sizes);
  const inner = Math.max(120, pv.clientWidth - 20), sc = Math.min(1, inner / (A.w + 2 * PRINT_MARGIN * PRINT_MM));
  pv.querySelectorAll('.pv-sheet').forEach(sh => { const pg = sh.querySelector('.ppage');
    pg.style.width = A.w + 'px'; pg.style.padding = (PRINT_MARGIN * PRINT_MM) + 'px'; pg.style.boxSizing = 'content-box';
    pg.style.transform = `scale(${sc})`; pg.style.transformOrigin = '0 0';
    sh.style.width = Math.ceil((A.w + 2 * PRINT_MARGIN * PRINT_MM) * sc) + 'px'; sh.style.height = Math.ceil(pg.offsetHeight * sc) + 'px'; });
}
function printDoc() {
  const by = $('#pr-by').value, which = $('#pr-which').value, paper = $('#pr-paper').value, html = printPagesHTML(by, which);
  return { paper, html, sizes: printFit(html, paper), title: `${(curEvent() || {}).name || 'Event'} - divisions by ${PRINT_BY[by].toLowerCase()}` };
}
function printCleanup() { document.body.classList.remove('printing'); const r = document.getElementById('print-root'); if (r) r.remove(); }
function printStandalone() { return !!(window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)); }
function printGo() {
  if (printStandalone()) { toast('The home-screen app cannot print — making a PDF to share or print instead.'); printPdf(); return; }
  const d = printDoc();
  printCleanup(); printStyles();
  const root = document.createElement('div'); root.id = 'print-root'; root.innerHTML = d.html; printApply(root, d.sizes); document.body.appendChild(root);
  let st = document.getElementById('print-page'); if (!st) { st = document.createElement('style'); st.id = 'print-page'; document.head.appendChild(st); }
  st.textContent = `@page { size: ${PRINT_PAPER[d.paper].css} portrait; margin: ${PRINT_MARGIN}mm; }`;
  document.body.classList.add('printing');
  // the pages stay until the print dialog is done: on iPhone / iPad print() returns at once and the dialog reads the page later
  window.addEventListener('afterprint', function done() { window.removeEventListener('afterprint', done); setTimeout(printCleanup, 800); });
  if (typeof window.print !== 'function') { toast('This browser cannot print from here — use PDF.', true); return; }
  try { window.print(); } catch (e) { toast('Printing is blocked here — use PDF.', true); }
}

/* ---------- v1.58: PDF made in the app (pages drawn on a canvas from the laid-out sheet, one JPEG per page) ---------- */
/** Where to cut a sheet of height H into pages of height ph without cutting through a row, bar or header (boxes: [top, bottom]). */
function printCuts(H, ph, boxes) {
  const cuts = [0];
  while (H - cuts[cuts.length - 1] > ph) {
    const start = cuts[cuts.length - 1], lim = start + ph;
    const inside = y => boxes.some(([t, b]) => t < y - 0.5 && y + 0.5 < b);
    const cand = boxes.map(([, b]) => b).filter(b => b > start + ph * 0.3 && b <= lim && !inside(b)).sort((a, b) => b - a);
    cuts.push(cand.length ? cand[0] : lim);
  }
  cuts.push(H); return cuts;
}
/** Draw the part [y0, y1) of a laid-out sheet onto a canvas context (backgrounds, borders, text word by word). */
function printDraw(ctx, pg, y0, y1, A) {
  const base = pg.getBoundingClientRect(), rel = r => ({ x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height });
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, A.w, y1 - y0);
  ctx.save(); ctx.translate(0, -y0); ctx.beginPath(); ctx.rect(0, y0, A.w, y1 - y0); ctx.clip();
  for (const el of [pg, ...pg.querySelectorAll('*')]) {
    const r = rel(el.getBoundingClientRect()); if (r.y > y1 || r.y + r.h < y0 || !r.w) continue;
    const cs = getComputedStyle(el);
    if (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) { ctx.fillStyle = cs.backgroundColor; ctx.fillRect(r.x, r.y, r.w, r.h); }
    for (const [side, x, y, w, h] of [['Top', r.x, r.y, r.w, 0], ['Bottom', r.x, r.y + r.h, r.w, 0]]) {
      const bw = parseFloat(cs['border' + side + 'Width']); if (!bw || cs['border' + side + 'Style'] === 'none') continue;
      ctx.fillStyle = cs['border' + side + 'Color']; ctx.fillRect(x, side === 'Top' ? y : y - bw, w || bw, h || bw);
    }
  }
  const tw = document.createTreeWalker(pg, NodeFilter.SHOW_TEXT), range = document.createRange();
  ctx.textBaseline = 'middle';
  for (let n = tw.nextNode(); n; n = tw.nextNode()) {
    const text = n.nodeValue; if (!/\S/.test(text)) continue;
    const cs = getComputedStyle(n.parentElement), up = cs.textTransform === 'uppercase';
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`; ctx.fillStyle = cs.color;
    const cell = n.parentElement.closest('td'), cr = cell ? rel(cell.getBoundingClientRect()) : null;
    if (cr) { ctx.save(); ctx.beginPath(); ctx.rect(cr.x, cr.y, cr.w - 2, cr.h); ctx.clip(); }
    for (const m of text.matchAll(/\S+/g)) {
      range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length);
      const r = rel(range.getBoundingClientRect()); if (!r.w || r.y > y1 || r.y + r.h < y0) continue;
      ctx.fillText(up ? m[0].toUpperCase() : m[0], r.x, r.y + r.h / 2);
    }
    if (cr) ctx.restore();
  }
  ctx.restore();
}
/** A PDF with one full-page JPEG per page (pages: [{jpg: Uint8Array, w, h}]), placed inside the 8 mm margins. */
function printPdfBytes(pages, paper) {
  const [W, H] = PRINT_PAPER[paper].pt, m = PRINT_MARGIN * 72 / 25.4, parts = [], offs = [];
  let len = 0;
  const put = x => { const b = typeof x === 'string' ? Uint8Array.from(x, c => c.charCodeAt(0) & 255) : x; parts.push(b); len += b.length; };
  const obj = (i, body) => { offs[i] = len; put(`${i} 0 obj\n`); body(); put('\nendobj\n'); };
  put('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  const n = pages.length, kids = pages.map((_, i) => `${3 + 3 * i} 0 R`).join(' ');
  obj(1, () => put('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => put(`<< /Type /Pages /Kids [${kids}] /Count ${n} >>`));
  pages.forEach((p, i) => {
    const iw = W - 2 * m, ih = iw * p.h / p.w, f = x => x.toFixed(2);
    const cmd = `q ${f(iw)} 0 0 ${f(ih)} ${f(m)} ${f(H - m - ih)} cm /Im0 Do Q`;
    obj(3 + 3 * i, () => put(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(W)} ${f(H)}] /Resources << /XObject << /Im0 ${5 + 3 * i} 0 R >> >> /Contents ${4 + 3 * i} 0 R >>`));
    obj(4 + 3 * i, () => { put(`<< /Length ${cmd.length} >>\nstream\n`); put(cmd); put('\nendstream'); });
    obj(5 + 3 * i, () => { put(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpg.length} >>\nstream\n`); put(p.jpg); put('\nendstream'); });
  });
  const xref = len, total = 3 + 3 * n;
  put(`xref\n0 ${total}\n0000000000 65535 f \n` + Array.from({ length: total - 1 }, (_, i) => String(offs[i + 1]).padStart(10, '0') + ' 00000 n \n').join(''));
  put(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len); let o = 0; for (const b of parts) { out.set(b, o); o += b.length; } return out;
}
/** Make the PDF of the chosen sheets, then offer Share (Print, Files, Mail… on phones) and Download. */
async function printPdf() {
  const d = printDoc(), A = PRINT_AREA[d.paper], btn = $('#pr-pdf'), out = $('#pr-out');
  if (btn) { btn.disabled = true; btn.textContent = 'Making PDF…'; }
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const box = printMeasureBox(d.html, A); box.style.visibility = 'visible'; printApply(box, d.sizes);
    const sc = 2.4, pages = [];   // ≈ 230 dpi
    for (const pg of box.querySelectorAll('.ppage')) {
      const base = pg.getBoundingClientRect().top, boxes = [...pg.querySelectorAll('tr, .pbar, .pbar2, .pmeta')].map(e => { const r = e.getBoundingClientRect(); return [r.top - base, r.bottom - base]; });
      const cuts = printCuts(Math.ceil(pg.scrollHeight), A.h, boxes);
      for (let i = 0; i < cuts.length - 1; i++) {
        const h = Math.ceil(cuts[i + 1] - cuts[i]), cv = document.createElement('canvas');
        cv.width = Math.round(A.w * sc); cv.height = Math.round(h * sc);
        const ctx = cv.getContext('2d'); ctx.scale(sc, sc); printDraw(ctx, pg, cuts[i], cuts[i] + h, A);
        const jpg = Uint8Array.from(atob(cv.toDataURL('image/jpeg', 0.9).split(',')[1]), c => c.charCodeAt(0));
        pages.push({ jpg, w: cv.width, h: cv.height });
      }
    }
    box.remove();
    const name = d.title.replace(/[\\/:*?"<>|]/g, '-') + '.pdf', blob = new Blob([printPdfBytes(pages, d.paper)], { type: 'application/pdf' });
    const file = typeof File === 'function' ? new File([blob], name, { type: 'application/pdf' }) : null;
    const canShare = !!(file && navigator.canShare && navigator.share && (() => { try { return navigator.canShare({ files: [file] }); } catch (e) { return false; } })());
    S.printPdf = { blob, file, name };
    if (out) { out.hidden = false; out.innerHTML = `<div class="pr-actions"><b>PDF ready</b> <span class="small muted">${plural(pages.length, 'page')} · ${esc(PRINT_PAPER[d.paper].css)}</span>
      ${canShare ? '<button class="primary" data-act="print-share" id="pr-share">Share / Print…</button>' : ''}<button ${canShare ? '' : 'class="primary"'} data-act="print-dl" id="pr-dl">Download PDF</button></div>`; }
  } catch (e) { console.warn(e); toast('Could not make the PDF on this device.', true); }
  if (btn) { btn.disabled = false; btn.textContent = 'PDF'; }
}
async function printShare() {
  const p = S.printPdf; if (!p || !p.file) return;
  try { await navigator.share({ files: [p.file], title: p.name }); } catch (e) { if (e && e.name !== 'AbortError') printDownload(); }
}
function printDownload() {
  const p = S.printPdf; if (!p) return;
  const url = URL.createObjectURL(p.blob), a = document.createElement('a');
  a.href = url; a.download = p.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
