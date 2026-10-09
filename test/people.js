// v1.7.0: ring managers & directors — roster picker (like judges), invite by email, auto-apply on first open
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const signIn = async (pg) => { for (let k = 0; k < 4; k++) { await pg.waitForSelector('button[data-act="fb-signin"], .bar button[data-act="fb-signout"]', { timeout: 15000 }); if (await pg.$('.bar button[data-act="fb-signout"]')) return; await pg.waitForTimeout(400); await pg.click('button[data-act="fb-signin"]').catch(() => {}); await pg.waitForTimeout(1500); } };
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const url = 'file://' + path.resolve('dist/karate-event-tracker.html');
  const mailStub = `window.__mail = []; const _c = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (String(this.href).startsWith('mailto:')) { window.__mail.push(this.href); return; } return _c.call(this); };`;
  /* ---------- claude.ai store ---------- */
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route(/fonts\./, r => r.abort());
    const mock = fs.readFileSync('test/cloudmock.js', 'utf8');
    const mk = async role => { const p = await ctx.newPage(); await p.addInitScript(`sessionStorage.setItem('mockRole','${role}');` + mailStub + mock); p.on('pageerror', e => errors.push(role + ': ' + e.message)); await p.goto(url); return p; };
    const o = await mk('admin');
    await o.waitForSelector('text=No events yet');
    await o.click('button:has-text("Create demo tournament")'); await o.click('button[data-kind="local"]'); await o.waitForSelector('text=Director checklist', { timeout: 30000 });
    await o.click('.tab:has-text("Divisions")'); await o.click('button:has-text("Draw all ready")'); await o.click('#confirm button:has-text("Draw")'); await o.waitForTimeout(800);
    await o.click('.tab:has-text("People")'); await o.waitForTimeout(200);
    ok('owner listed as director', /Dana Director/.test(await o.textContent('#main')));
    // invite Eddie (outside guest, email known to the app) as ring manager of Ring 2
    await o.fill('#inv-email', 'Eddie@x.test'); await o.selectOption('#inv-ring', { label: 'Ring 2' });
    await o.fill('#inv-url', 'https://claude.ai/artifact/demo');
    await o.click('#f-invite button[type="submit"]'); await o.waitForTimeout(300);
    ok('invitation sheet shown after creating the invite', !!(await o.$('#inv-gmail')) && !!(await o.$('#inv-body')));
    const gmail = await o.$eval('#inv-gmail', a => a.href);
    ok('Gmail compose link prefilled', /^https:\/\/mail\.google\.com\/mail\/\?view=cm/.test(gmail) && /to=eddie%40x\.test/.test(gmail));
    ok('links open in a new tab (allowed from the sandboxed page)', await o.$eval('#inv-mailto', a => a.target === '_blank' && a.href.startsWith('mailto:')));
    await o.screenshot({ path: 'test/shots/people-invite-sheet.png' });
    const mail = await o.$eval('#inv-mailto', a => a.href);
    await o.click('button[data-act="modal-close"] >> nth=0'); await o.waitForTimeout(150);
    ok('invite email opens prefilled', /^mailto:eddie%40x\.test\?subject=/.test(mail) && /claude\.ai/.test(decodeURIComponent(mail)) && /Request access/.test(decodeURIComponent(mail)));
    ok('pending invite listed', /eddie@x\.test/.test(await o.textContent('#main')));
    await o.screenshot({ path: 'test/shots/people-invite.png', fullPage: true });
    const code = (/code (\w{6})/.exec(decodeURIComponent(mail)) || [])[1];
    ok('invite email carries a 6-character code', !!code);
    // Eddie opens the tracker, enters the code → ring manager
    const e = await mk('editor'); await e.waitForTimeout(900);
    ok('editor without a role cannot open the event (locked)', !!(await e.$('.ev-card.locked')));
    ok('editor without a role sees the code card', !!(await e.$('#inv-code')));
    await e.fill('#inv-code', 'WRONG1'); await e.click('#f-code button'); await e.waitForTimeout(200);
    ok('wrong code refused', /doesn’t match/.test(await e.textContent('body')));
    await e.fill('#inv-code', code.toLowerCase()); await e.click('#f-code button'); await e.waitForTimeout(700);
    await e.click('button.ev-card'); await e.waitForTimeout(400);
    ok('invited editor becomes ring manager', /Ring manager/.test(await e.textContent('.bar')));
    await e.click('.tab:has-text("Mat")'); await e.waitForTimeout(200);
    const rings = await e.$$eval('button[data-act="score"], button[data-act="kp-score"]', x => [...new Set(x.map(y => y.closest('.ring-card').querySelector('h3').textContent))]);
    ok('Eddie can score Ring 2 only', rings.join(',') === 'Ring 2');
    ok('editor is not a director (no Divisions/People tabs)', !(await e.$('.tab:has-text("People")')));
    await o.waitForTimeout(500); await o.click('.tab:has-text("Rings")'); await o.waitForTimeout(200);
    ok('owner sees Eddie on Ring 2', await o.$eval('.card:has(h3:text("Ring 2"))', c => /Eddie Editor/.test(c.textContent)));
    ok('invite cleared', !(await o.$('[data-act="invite-cancel"]')));
    // Erin: outside editor, email not visible → not findable by search, appears in the roster after opening
    const r2 = await mk('editor2'); await r2.waitForTimeout(900);
    await o.waitForTimeout(400); await o.click('.tab:has-text("Rings")'); await o.waitForTimeout(200);
    const opts = await o.$eval('#ring-addmgr-' + await o.$eval('.card:has(h3:text("Ring 1")) select[data-change="ring-addmgr"]', s => s.dataset.ring), s => [...s.options].map(x => x.textContent));
    ok('ring card picker lists people who opened the tracker', opts.some(t => /Erin Outside/.test(t)));
    await o.selectOption('.card:has(h3:text("Ring 1")) select[data-change="ring-addmgr"]', { label: 'Erin Outside' }); await o.waitForTimeout(300);
    ok('Erin added as Ring 1 manager', await o.$eval('.card:has(h3:text("Ring 1"))', c => /Erin Outside/.test(c.textContent)));
    await o.click('.tab:has-text("People")'); await o.waitForTimeout(200);
    const erinSel = await o.$('select[data-change="person-ring"][data-id="u_ed2"]');
    await erinSel.selectOption('__dir'); await o.waitForTimeout(300);
    ok('Erin made director', await o.$eval('.card:has(h3:text("Directors"))', c => /Erin Outside/.test(c.textContent)));
    await r2.reload(); await r2.waitForTimeout(900); if (await r2.$('.ev-card')) { await r2.click('.ev-card'); await r2.waitForTimeout(400); }
    ok('Erin now has director tabs', !!(await r2.$('.tab:has-text("People")')));
    await o.screenshot({ path: 'test/shots/people-tab.png', fullPage: true });
    await ctx.close();
  }
  /* ---------- Firebase ---------- */
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.route(/fonts\.|gstatic/, r => r.abort());
    const mock = fs.readFileSync('test/fbmock.js', 'utf8');
    const mk = async (nextuid) => { const p = await ctx.newPage(); await p.addInitScript(`sessionStorage.setItem('nextuid','${nextuid}');` + mailStub + mock); p.on('pageerror', e => errors.push('fb: ' + e.message)); await p.goto(url); return p; };
    const d = await mk('u_dir');
    await signIn(d);
    await d.waitForSelector('text=Become director', { timeout: 10000 }); await d.click('text=Become director'); await d.waitForSelector('text=Manage access', { timeout: 10000 });
    await d.click('button:has-text("Create demo tournament") >> nth=0'); await d.click('button[data-kind="local"]'); await d.waitForSelector('text=Director checklist', { timeout: 60000 });
    await d.click('.tab:has-text("People")'); await d.waitForTimeout(200);
    await d.fill('#inv-email', 'u_m2@x.test'); await d.selectOption('#inv-ring', { label: 'Ring 1' });
    await d.click('#f-invite button[type="submit"]'); await d.waitForTimeout(400);
    ok('Firebase invite email has the site link + Google sign-in', /Sign in with Google/.test(await d.$eval('#inv-body', t => t.value)));
    await d.click('button[data-act="modal-close"] >> nth=0');
    const m = await mk('u_m2');
    await signIn(m); await m.waitForTimeout(1500);
    if (await m.$('.ev-card')) { await m.click('.ev-card'); await m.waitForTimeout(500); }
    ok('Firebase: invited person becomes ring manager on first sign-in', /Ring manager/.test(await m.textContent('.bar')));
    await ctx.close();
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
