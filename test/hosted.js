// v1.39.1: on the hosted site a missing/example Firebase config shows the warning, never an empty local-mode event list.
const { chromium } = require('playwright'), fs = require('fs'), path = require('path');
const V = p => fs.readFileSync(path.join(__dirname, '..', 'vercel', p));
(async () => {
  const b = await chromium.launch(); let fails = 0;
  const run = async (label, cfgJs, host, expectWarn) => {
    const ctx = await b.newContext(); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await ctx.route('**/*', r => {
      const u = new URL(r.request().url());
      if (/gstatic\.com\/firebasejs/.test(u.href)) return r.fulfill({ contentType: 'text/javascript', body: 'window.firebase = window.firebase || {};' });
      if (u.hostname !== host) return r.abort();
      if (u.pathname === '/firebase-config.js') return r.fulfill({ contentType: 'text/javascript', body: cfgJs });
      if (u.pathname === '/' ) return r.fulfill({ contentType: 'text/html', body: V('index.html') });
      return r.fulfill({ status: 404, body: '' });
    });
    await p.goto(`https://${host}/`); await p.waitForTimeout(800);
    const warn = await p.locator('#cfg-bad').count(), body = await p.locator('body').innerText();
    const local = /Local mode/i.test(body) && !warn;
    const ok = expectWarn ? (warn === 1 && !local && /safe in Firebase/.test(body)) : !warn;
    console.log((ok ? 'PASS ' : 'FAIL ') + label + (errs.length ? ' errors: ' + errs.join('; ') : ''));
    if (!ok || errs.length) fails++; await ctx.close();
  };
  const example = fs.readFileSync(path.join(__dirname, '..', 'vercel', 'firebase-config.example.js'), 'utf8');
  await run('vercel.app with the example config file → warning, no local mode', example, 'karate-event-tracker.vercel.app', true);
  await run('vercel.app with no config at all → warning', '', 'karate-event-tracker.vercel.app', true);
  await run('placeholder values under the right name → warning', 'window.KT_FIREBASE_CONFIG={apiKey:"YOUR_API_KEY",projectId:"YOUR_PROJECT"}', 'karate-event-tracker.vercel.app', true);
  await run('development host (x.localhost) without config → local mode allowed', example, 'dev.localhost', false);
  await b.close(); console.log(fails ? fails + ' failed' : 'ERRORS: none'); process.exit(fails ? 1 : 0);
})();
