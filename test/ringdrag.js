const { chromium, devices } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path');
(async () => {
  const b = await chromium.launch(); const errs = [];
  const ctx = await b.newContext(devices['iPhone 13']); const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await p.tap('button:has-text("Create demo tournament") >> nth=0'); await p.tap('button[data-kind="local"]'); await p.waitForSelector('.bnav:not([hidden])', { timeout: 30000 }); await p.waitForTimeout(500);
  console.log('nav labels:', await p.$$eval('.bn span', x => x.map(y => y.textContent).join(',')));
  // dashboard boxes are buttons
  const boxes = await p.$$eval('.stat-btn', x => x.map(y => y.dataset.v));
  console.log('dashboard buttons →', boxes.join(','));
  await p.tap('.stat-btn >> nth=3'); await p.waitForTimeout(300);
  console.log('after tapping Rings box, selected tab:', await p.$eval('.bn[aria-selected="true"] span', x => x.textContent));
  const before = await p.$$eval('.rdivs >> nth=0', l => [...l[0].children].map(x => x.querySelector('.name').textContent));
  console.log('ring 1 divisions (only with competitors):', before.length, before.slice(0, 3).join(' | '));
  const allHaveEntrants = await p.$$eval('.rdiv .dojo', x => x.every(y => !/^0 /.test(y.textContent)));
  console.log('all listed have entrants:', allHaveEntrants);
  await p.screenshot({ path: 'test/shots/m-rings.png' });
  // touch-and-hold drag of first row below the third via CDP touch events
  const cdp = await ctx.newCDPSession(p);
  const r0 = await p.$eval('.rdivs .rdiv >> nth=0', e => { e.scrollIntoView({ block: 'center' }); const b = e.getBoundingClientRect(); return { x: b.left + 60, y: b.top + b.height / 2 }; });
  const r2 = await p.$eval('.rdivs .rdiv >> nth=2', e => { const b = e.getBoundingClientRect(); return { y: b.bottom - 4 }; });
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', r0.x, r0.y); await p.waitForTimeout(600);
  const dragging = await p.$$eval('.rdiv.dragging', x => x.length);
  for (let k = 1; k <= 8; k++) { await touch('touchMove', r0.x, r0.y + (r2.y - r0.y) * k / 8); await p.waitForTimeout(30); }
  await p.screenshot({ path: 'test/shots/m-rings-drag.png' });
  await touch('touchEnd', 0, 0); await p.waitForTimeout(600);
  const after = await p.$$eval('.rdivs >> nth=0', l => [...l[0].children].map(x => x.querySelector('.name').textContent));
  console.log('picked up after hold:', dragging === 1, '| moved first →', after.indexOf(before[0]), '| order:', after.slice(0, 3).join(' | '));
  // quick swipe (no hold) should not reorder
  const r0b = await p.$eval('.rdivs .rdiv >> nth=0', e => { const b = e.getBoundingClientRect(); return { x: b.left + 60, y: b.top + b.height / 2 }; });
  await touch('touchStart', r0b.x, r0b.y); for (let k = 1; k <= 5; k++) { await touch('touchMove', r0b.x, r0b.y + 20 * k); await p.waitForTimeout(16); } await touch('touchEnd', 0, 0); await p.waitForTimeout(300);
  const after2 = await p.$$eval('.rdivs >> nth=0', l => [...l[0].children].map(x => x.querySelector('.name').textContent));
  console.log('swipe without hold keeps order:', after2.join('|') === after.join('|'));
  // move to other ring
  const name = after2[0];
  await p.selectOption('.rdivs >> nth=0 >> .rmove >> nth=0', { label: 'To Ring 2' }); await p.waitForTimeout(400);
  const ring2 = await p.$$eval('.rdivs >> nth=1', l => [...l[0].children].map(x => x.querySelector('.name').textContent));
  console.log('moved to Ring 2:', ring2.includes(name), '(last:', ring2[ring2.length - 1] === name, ')');
  console.log('ERRORS:', errs.join('|') || 'none');
  // desktop mouse hold-drag
  const c2 = await b.newContext({ viewport: { width: 1200, height: 900 } }); const q = await c2.newPage();
  await q.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
  await q.click('button:has-text("Create demo tournament") >> nth=0'); await q.click('button[data-kind="local"]'); await q.waitForSelector('.tab', { timeout: 30000 }); await q.waitForTimeout(400);
  await q.click('.stat-btn >> nth=3'); await q.waitForTimeout(300);
  const b0 = await q.$$eval('.rdivs >> nth=0', l => [...l[0].children].map(x => x.dataset.id));
  const m0 = await q.$eval('.rdivs .rdiv >> nth=0', e => { const b = e.getBoundingClientRect(); return { x: b.left + 80, y: b.top + b.height / 2 }; });
  const m1 = await q.$eval('.rdivs .rdiv >> nth=1', e => { const b = e.getBoundingClientRect(); return { y: b.bottom - 3 }; });
  await q.mouse.move(m0.x, m0.y); await q.mouse.down(); await q.waitForTimeout(600);
  await q.mouse.move(m0.x, m1.y, { steps: 6 }); await q.mouse.up(); await q.waitForTimeout(500);
  const a0 = await q.$$eval('.rdivs >> nth=0', l => [...l[0].children].map(x => x.dataset.id));
  console.log('desktop mouse hold-drag swapped first two:', a0[0] === b0[1] && a0[1] === b0[0]);
  await b.close();
})();
