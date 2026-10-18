// v1.24.0: email + password accounts only with an invitation code (no open sign-up, no Firebase emails needed);
// Forgot password only for existing accounts; Gmail invitees use Google; spectators don't sign in
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\.|gstatic/, r => r.abort());
  const mock = fs.readFileSync('test/fbmock.js', 'utf8'), url = 'file://' + path.resolve('dist/karate-event-tracker.html');
  const signInG = async (pg) => { for (let k = 0; k < 4; k++) { await pg.waitForSelector('button[data-act="fb-signin"], .bar button[data-act="fb-signout"]', { timeout: 15000 }); if (await pg.$('.bar button[data-act="fb-signout"]')) return; await pg.waitForTimeout(400); await pg.click('button[data-act="fb-signin"]').catch(() => {}); await pg.waitForTimeout(1500); } };
  const db = p => p.evaluate(() => JSON.parse(localStorage.getItem('fbmock')));
  const accts = p => p.evaluate(() => JSON.parse(localStorage.getItem('fbmock_auth') || '{}'));
  const A = await ctx.newPage(); await A.addInitScript(`sessionStorage.setItem('nextuid','u_admin');` + mock); A.on('pageerror', e => errors.push('A: ' + e.message)); await A.goto(url); await signInG(A);
  await A.click('text=Become director'); await A.waitForSelector('text=Manage access', { timeout: 10000 });
  for (const [email, role] of [['sam@club.org', 'member'], ['gina@gmail.com', 'organizer']]) {
    await A.fill('#ai-email', email); await A.selectOption('#ai-role', role); await A.click('#f-app-invite button[type="submit"]'); await A.waitForTimeout(600);
    if (email === 'sam@club.org') {
      const body = await A.inputValue('#inv-body'), code = ((await db(A))['invites/sam@club.org'] || {}).code || '';
      ok('non-Gmail invite: 10-character code in the invitation, with the steps', code.length === 10 && body.includes(code) && /First time\? Use your invitation code/.test(body));
      ok('…only the hash of the code is public', Object.keys(await db(A)).some(k => k.startsWith('invcodes/') && !k.includes(code)));
    } else ok('Gmail invite: no code, “Sign in with Google”', !((await db(A))['invites/gina@gmail.com'] || {}).code && /Sign in with Google/.test(await A.inputValue('#inv-body')));
    await A.click('#modal button.primary[data-act="modal-close"]'); await A.waitForTimeout(200);
  }
  const code = (await db(A))['invites/sam@club.org'].code;
  // Sam's browser
  const S = await ctx.newPage(); S.on('pageerror', e => errors.push('S: ' + e.message)); await S.addInitScript(mock); await S.goto(url);
  await S.waitForSelector('#fb-email');
  const txt = await S.textContent('#main');
  ok('no open “Set a password” any more', !/Set a password/.test(txt) && !(await S.$('[data-act="fb-set-pw"]')));
  ok('spectators don’t sign in', /Spectators don’t sign in/.test(txt));
  // someone without an invitation cannot create an account
  await S.fill('#fb-email', 'eve@club.org'); await S.click('button[data-act="fb-first"]'); await S.waitForSelector('#first-time');
  await S.fill('#fb-code', 'ABCDEFGHJK'); await S.fill('#fb-newpw', 'Sneaky-2026'); await S.fill('#fb-newpw2', 'Sneaky-2026'); await S.click('button[data-act="fb-create"]'); await S.waitForTimeout(500);
  ok('uninvited email + guessed code → refused, no account created', /doesn’t match/.test(await S.textContent('#auth-msg')) && !(await accts(S))['eve@club.org']);
  // Sam: wrong code, then the right one
  await S.fill('#fb-email', 'sam@club.org'); await S.fill('#fb-code', 'WRONGCODE1'); await S.fill('#fb-newpw', 'Kiai-2026!'); await S.fill('#fb-newpw2', 'Kiai-2026!'); await S.click('button[data-act="fb-create"]'); await S.waitForTimeout(400);
  ok('wrong code → refused', /doesn’t match/.test(await S.textContent('#auth-msg')) && !(await accts(S))['sam@club.org']);
  await S.fill('#fb-newpw2', 'different'); await S.fill('#fb-code', code); await S.click('button[data-act="fb-create"]'); await S.waitForTimeout(300);
  ok('passwords must match', /different/.test(await S.textContent('#auth-msg')));
  await S.fill('#fb-newpw', 'Kiai-2026!'); await S.fill('#fb-newpw2', 'Kiai-2026!'); await S.fill('#fb-code', code.toLowerCase()); await S.press('#fb-newpw2', 'Enter'); await S.waitForTimeout(2500);
  ok('right code → account created, signed in straight away (no email needed)', !!(await S.$('.bar button[data-act="fb-signout"]')) && !(await S.$('#verify-card')));
  let d = await db(S);
  ok('invitation accepted; code and invite removed; address recorded as proven', (d['users/e_sam'] || {}).invitedAs === 'manager' && !d['invites/sam@club.org'] && !Object.keys(d).some(k => k.startsWith('invcodes/') && d[k].email === 'sam@club.org') && (d['claims/e_sam'] || {}).email === 'sam@club.org');
  // the used code cannot be used again
  const S2 = await ctx.newPage(); await S2.addInitScript(mock); await S2.goto(url); await S2.waitForSelector('#fb-email');
  await S2.evaluate(() => sessionStorage.clear());
  await S2.fill('#fb-email', 'sam@club.org'); await S2.click('button[data-act="fb-first"]'); await S2.fill('#fb-code', code); await S2.fill('#fb-newpw', 'Other-2026!'); await S2.fill('#fb-newpw2', 'Other-2026!'); await S2.click('button[data-act="fb-create"]'); await S2.waitForTimeout(500);
  ok('a used code cannot set the password again', /doesn’t match|already exists/.test(await S2.textContent('#auth-msg')) && (await accts(S2))['sam@club.org'].pw === 'Kiai-2026!');
  // sign in later with the password; Forgot password only sends, never creates
  await S2.fill('#fb-pw', 'Kiai-2026!'); await S2.click('button[data-act="fb-email-signin"]'); await S2.waitForTimeout(1500);
  ok('later: sign in with email + password', !!(await S2.$('.bar button[data-act="fb-signout"]')));
  const S3 = await ctx.newPage(); await S3.addInitScript(mock); await S3.goto(url); await S3.waitForSelector('#fb-email');
  await S3.fill('#fb-email', 'nobody@club.org'); await S3.click('button[data-act="fb-forgot"]'); await S3.waitForTimeout(400);
  ok('Forgot password never creates an account', !(await accts(S3))['nobody@club.org'] && !!(await S3.$('#reset-sent')));
  await S.screenshot({ path: 'test/shots/signin-code.png' });
  await S3.click('button[data-act="fb-first"]'); await S3.waitForTimeout(200); await S3.screenshot({ path: 'test/shots/signin-firsttime.png' });
  // configuration problem shown on the card
  const T = await ctx.newPage(); await T.addInitScript(mock + ';window.__mockSignupOff=true;'); await T.goto(url); await T.waitForSelector('#fb-email');
  const c2 = await A.evaluate(async () => { const e = 'pat@club.org'; return null; });
  await T.fill('#fb-email', 'sam@club.org'); await T.click('button[data-act="fb-forgot"]'); await T.waitForTimeout(300);
  ok('…typed email kept', (await T.inputValue('#fb-email')) === 'sam@club.org');
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
