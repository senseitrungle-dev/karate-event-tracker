// v1.25.1: App admin card fits a phone screen (no text past the right edge)
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const signIn = async (pg) => { for (let k = 0; k < 4; k++) { await pg.waitForSelector('button[data-act="fb-signin"], .bar button[data-act="fb-signout"]', { timeout: 15000 }); if (await pg.$('.bar button[data-act="fb-signout"]')) return; await pg.waitForTimeout(400); await pg.click('button[data-act="fb-signin"]').catch(() => {}); await pg.waitForTimeout(1500); } };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\.|gstatic/, r => r.abort());
  const mock = fs.readFileSync('test/fbmock.js', 'utf8');
  const A = await ctx.newPage(); await A.addInitScript(`sessionStorage.setItem('nextuid','u_admin_with_a_long_name');` + mock); A.on('pageerror', e => errors.push(e.message));
  await A.goto('file://' + path.resolve('dist/karate-event-tracker.html')); await signIn(A);
  await A.click('text=Become director'); await A.waitForSelector('text=Manage access', { timeout: 10000 });
  await A.click('button:has-text("Create demo tournament") >> nth=1').catch(() => A.click('button:has-text("Create demo tournament") >> nth=0'));
  await A.click('button[data-kind="local"]').catch(() => {}); await A.waitForSelector('text=Director checklist', { timeout: 60000 });
  await A.click('.bar button.brand'); await A.waitForTimeout(400);
  for (const [email, role] of [['abhi.krishna.very.long.address@gmail.com', 'organizer'], ['jskaintl@aol.com', 'organizer'], ['sabooali1@gmail.com', 'member']]) {
    await A.fill('#ai-email', email); await A.selectOption('#ai-role', role); await A.click('#f-app-invite button[type="submit"]'); await A.waitForTimeout(500);
    await A.click('#modal button.primary[data-act="modal-close"]'); await A.waitForTimeout(200);
  }
  for (const w of [390, 320]) {
    await A.setViewportSize({ width: w, height: 844 }); await A.waitForTimeout(300);
    const r = await A.evaluate(() => {
      const card = document.querySelector('.admin-card'); if (card && card.tagName === 'DETAILS') card.open = true;
      const cr = card.getBoundingClientRect(), out = [];
      for (const el of card.querySelectorAll('*')) { const r = el.getBoundingClientRect(); if (r.width && r.right > cr.right + 1 && !el.closest('.tw[data-scroll]')) out.push(el.tagName + '.' + el.className + ' ' + (el.textContent || '').slice(0, 30)); }
      return { page: document.documentElement.scrollWidth, vw: innerWidth, card: Math.round(cr.right), out: out.slice(0, 8) };
    });
    console.log('  ', w, JSON.stringify(r));
    ok(`${w}px: page does not scroll sideways`, r.page <= r.vw);
    ok(`${w}px: nothing in the App admin card sticks out`, !r.out.length);
    await A.screenshot({ path: `test/shots/adminphone-${w}.png`, fullPage: true });
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
