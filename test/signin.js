// v1.13.1: placeholder Firebase config is reported on the sign-in screen; sign-in errors are explained
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  await ctx.route(/fonts\.|gstatic/, r => r.abort());
  const mock = fs.readFileSync('test/fbmock.js', 'utf8');
  const mk = async (cfg, failCode) => {
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
    await p.addInitScript(`sessionStorage.removeItem('fbuid');` + mock + `;window.KT_FIREBASE_CONFIG=${JSON.stringify(cfg)};` +
      (failCode ? `(function(){const a=firebase.auth;firebase.auth=Object.assign(function(){const x=a.apply(this,arguments);x.signInWithPopup=async()=>{const e=new Error("x");e.code="${failCode}";throw e;};return x;},a);})();` : ''));
    await p.goto('file://' + path.resolve('dist/karate-event-tracker.html'));
    await p.waitForSelector('button[data-act="fb-signin"]', { timeout: 15000 }); return p;
  };
  const real = { apiKey: 'AIzaSyTEST', authDomain: 'demo.firebaseapp.com', projectId: 'demo', appId: '1:2:web:3' };
  let p = await mk({ apiKey: 'YOUR_API_KEY', authDomain: 'YOUR_PROJECT.firebaseapp.com', projectId: 'YOUR_PROJECT' });
  ok('placeholder config: notice shown', /example values/.test(await p.textContent('#cfg-bad').catch(() => '')));
  ok('placeholder config: sign-in disabled', await p.$eval('button[data-act="fb-signin"]', x => x.disabled));
  await p.close();
  p = await mk(real);
  ok('real config: no notice', !(await p.$('#cfg-bad')));
  ok('real config: sign-in enabled', !(await p.$eval('button[data-act="fb-signin"]', x => x.disabled)));
  await p.close();
  for (const [code, re] of [['auth/unauthorized-domain', /not authorized.*Authorized domains/], ['auth/api-key-not-valid.-please-pass-a-valid-api-key.', /API key is not valid/], ['auth/operation-not-allowed', /enable Google/], ['auth/popup-blocked', /Allow pop-ups/]]) {
    p = await mk(real, code); await p.click('button[data-act="fb-signin"]'); await p.waitForTimeout(300);
    ok(`${code} explained`, re.test(await p.textContent('.toast').catch(() => '')));
    await p.close();
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
