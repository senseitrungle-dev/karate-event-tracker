// v1.22.0: email + password accounts (any provider): first use / forgot → "Set a password" email; confirm email;
// invitations work for them; the sign-in box no longer tells spectators to sign in
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\.|gstatic/, r => r.abort());
  const mock = fs.readFileSync('test/fbmock.js', 'utf8'), url = 'file://' + path.resolve('dist/karate-event-tracker.html');
  const signInG = async (pg) => { for (let k = 0; k < 4; k++) { await pg.waitForSelector('button[data-act="fb-signin"], .bar button[data-act="fb-signout"]', { timeout: 15000 }); if (await pg.$('.bar button[data-act="fb-signout"]')) return; await pg.waitForTimeout(400); await pg.click('button[data-act="fb-signin"]').catch(() => {}); await pg.waitForTimeout(1500); } };
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('fbmock')));
  const A = await ctx.newPage(); await A.addInitScript(`sessionStorage.setItem('nextuid','u_admin');` + mock); A.on('pageerror', e => errors.push('A: ' + e.message)); await A.goto(url); await signInG(A);
  await A.click('text=Become director'); await A.waitForSelector('text=Manage access', { timeout: 10000 });
  await A.fill('#ai-email', 'sam@club.org'); await A.selectOption('#ai-role', 'member'); await A.click('#f-app-invite button[type="submit"]'); await A.waitForTimeout(500);
  const body = await A.inputValue('#inv-body');
  ok('invitation for a non-Google email explains “Set a password”', /Set a password/.test(body) && /sam@club\.org/.test(body));
  await A.click('#modal button.primary[data-act="modal-close"]');
  // Sam's browser
  const S = await ctx.newPage(); S.on('pageerror', e => errors.push('S: ' + e.message)); await S.addInitScript(mock); await S.goto(url);
  await S.waitForSelector('#fb-email');
  const txt = await S.textContent('#main');
  ok('sign-in box: Google + email/password', !!(await S.$('button[data-act="fb-signin"]')) && !!(await S.$('#fb-pw')) && !!(await S.$('button[data-act="fb-email-signin"]')));
  ok('sign-in box: spectators don’t sign in (no “spectators sign in with Google”)', /Spectators don’t sign in/.test(txt) && !/spectators sign in with a Google/i.test(txt));
  await S.screenshot({ path: 'test/shots/signin-box.png' });
  await S.fill('#fb-email', 'sam@club.org'); await S.click('button[data-act="fb-set-pw"]'); await S.waitForTimeout(500);
  ok('“Set a password” → link emailed, notice shown', /We emailed a link/.test(await S.textContent('#main')) && (await S.evaluate(() => JSON.parse(localStorage.getItem('fbmock_mail') || '[]'))).some(m => m.type === 'reset' && m.email === 'sam@club.org'));
  ok('…the throw-away session was signed out', await S.evaluate(() => !sessionStorage.getItem('fbuid')));
  // Sam opens the link and picks a password (address not yet confirmed)
  await S.evaluate(() => window.__mockResetPassword('sam@club.org', 'Kiai-2026', false));
  await S.fill('#fb-pw', 'wrong'); await S.click('button[data-act="fb-email-signin"]'); await S.waitForTimeout(400);
  ok('wrong password → clear message', /Email or password is not right/.test(await S.textContent('#toast')));
  await S.fill('#fb-email', 'sam@club.org'); await S.fill('#fb-pw', 'Kiai-2026'); await S.press('#fb-pw', 'Enter'); await S.waitForTimeout(1500);
  ok('unconfirmed address → “Confirm your email” (verification sent)', !!(await S.$('#verify-card')) && (await S.evaluate(() => JSON.parse(localStorage.getItem('fbmock_mail') || '[]'))).some(m => m.type === 'verify'));
  ok('…invitation not used before confirming', !(await db(S))['users/e_sam']);
  await S.evaluate(() => window.__mockVerify('sam@club.org'));
  await S.click('button[data-act="fb-verified"]'); await S.waitForTimeout(2200);
  ok('confirmed → signed in', !!(await S.$('.bar button[data-act="fb-signout"]')));
  const d = await db(S);
  ok('invitation accepted for the email account', (d['users/e_sam'] || {}).invitedAs === 'manager' && !d['invites/sam@club.org']);
  ok('name taken from the email', (d['users/e_sam'] || {}).name === 'Sam');
  await A.reload(); await A.waitForTimeout(1200);
  ok('admin sees Sam (sam@club.org) as ring manager', /Sam\s*sam@club\.org/.test(await A.textContent('#acc-managers')));
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
