// v1.49: spectator feed — compact copy for spectators (#2), website cache /api/live (#3), pause spectators (#4), follow a division
// Part A: Firebase mock on file:// (no website function → direct feed). Part B: http site with /api/live run through the real
// function over a stand-in Firestore REST API and an emulated CDN cache.
const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright');
const path = require('path'), fs = require('fs'), http = require('http');
const live = require('../api/live.js');
const { fakeFetch, callLive } = require('./fakerest');
(async () => {
  const b = await chromium.launch(); const errors = [];
  const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (!v) errors.push('assert: ' + name); };
  const signIn = async (pg) => { for (let k = 0; k < 4; k++) { await pg.waitForSelector('button[data-act="fb-signin"], .bar button[data-act="fb-signout"]', { timeout: 15000 }); if (await pg.$('.bar button[data-act="fb-signout"]')) return; await pg.waitForTimeout(400); await pg.click('button[data-act="fb-signin"]').catch(() => {}); await pg.waitForTimeout(1500); } };
  const mock = fs.readFileSync('test/fbmock.js', 'utf8'), file = 'file://' + path.resolve('dist/karate-event-tracker.html');
  const db = async pg => JSON.parse(await pg.evaluate(() => localStorage.getItem('fbmock')));
  const until = async (fn, ms) => { const t = Date.now(); while (Date.now() - t < (ms || 8000)) { try { if (await fn()) return true; } catch (e) { /* retry */ } await new Promise(r => setTimeout(r, 250)); } return false; };
  const stats = async pg => (await pg.$eval('.stats', x => x.innerText)).replace(/\s+/g, ' ').replace(/›/g, '').trim();
  const tab = async (pg, name) => { const vis = sel => pg.isVisible(sel).catch(() => false);
    if (await vis(`.tab:has-text("${name}")`)) await pg.click(`.tab:has-text("${name}")`); else if (await vis(`.bn:has-text("${name}")`)) await pg.click(`.bn:has-text("${name}")`);
    else { await pg.click('.bn[data-act="more-tabs"]'); await pg.click(`.menu-item:has-text("${name}")`); } await pg.waitForTimeout(150); };
  /** director: score whatever is first on the Mat tab (kata pool, flags, scores or kumite) */
  const scoreOne = async d => {
    await tab(d, 'Mat');
    const SEL = 'button[data-act="score"], button[data-act="kp-score"]';
    if (!(await d.$(SEL))) return false;
    await d.click(SEL + ' >> nth=0'); await d.waitForTimeout(150);
    if (await d.$('#kp-kata')) {
      await d.fill('#kp-kata', 'Bassai Dai');
      const J = await d.$$eval('input[data-input="kp-j"]', x => x.map(y => y.id));
      for (let i = 0; i < J.length; i++) await d.fill('#' + J[i], (7 + (i % 4) * 0.1).toFixed(1));
      await d.click('#kp-save'); await d.waitForTimeout(300); return true;
    }
    const root = await d.$('#score-root');
    if (await root.$('.srow input')) {
      const n = await root.$$eval('.srow input[data-s="a"]', x => x.length);
      for (let i = 0; i < n; i++) { await d.fill(`#sc-a-${i}`, '7.5'); await d.dispatchEvent(`#sc-a-${i}`, 'change'); await d.fill(`#sc-b-${i}`, '6.5'); await d.dispatchEvent(`#sc-b-${i}`, 'change'); }
    } else if (await root.$('.jrow')) {
      const j = await root.$$eval('.jrow', x => x.length);
      for (let i = 0; i < j; i++) await d.click(`button[data-act="flag"][data-i="${i}"][data-s="a"]`);
    } else if (await root.$('button[data-t="next"]')) {
      await d.click('.corner.a button[data-t="waza"]'); for (let i = 0; i < 8 && await d.$('button[data-t="next"]'); i++) await d.click('button[data-t="next"]');
    } else if (await root.$('.corner button[data-t="ippon"]')) {
      await d.click('.corner.a button[data-t="ippon"]');
    }
    const save = await d.$('button[data-act="save-result"]:not([disabled])');
    if (!save) { await d.click('button[data-act="modal-close"] >> nth=0').catch(() => {}); return false; }
    await save.click(); await d.waitForTimeout(300); return true;
  };
  const setupLive = async (d, nextGo) => {
    await signIn(d);
    for (let k = 0; k < 5 && !(await d.$('text=Manage access')); k++) { await d.click('text=Become director', { timeout: 5000 }).catch(() => {}); await d.waitForSelector('text=Manage access', { timeout: 5000 }).catch(() => {}); }
    if (!(await d.$('text=Manage access'))) console.log('  setup: page shows', JSON.stringify((await d.innerText('body')).slice(0, 300)));
    await d.click('button:has-text("Create demo tournament") >> nth=0'); await d.click('button[data-kind="local"]'); await d.waitForSelector('text=Director checklist', { timeout: 60000 });
    await tab(d, 'Divisions'); await d.click('button:has-text("Draw all ready")'); await d.click('#confirm button:has-text("Draw")'); await d.waitForTimeout(1500);
    await tab(d, 'Dashboard');
    await d.click('button[data-act="live-go"][data-force="1"]'); await d.click('#confirm button:has-text("Go live anyway")'); await d.waitForTimeout(800);
    return d.$eval('#share-url', i => i.value).catch(async () => { await d.click('button[data-act="share-on"]').catch(() => {}); await d.waitForTimeout(600); return d.$eval('#share-url', i => i.value); });
  };

  /* ================= Part A: Firebase mock, direct feed ================= */
  {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\.|gstatic/, r => r.abort());
    const mk = async (u, url) => { const p = await ctx.newPage(); await p.addInitScript(`sessionStorage.setItem('nextuid','${u}');` + mock); p.on('pageerror', e => errors.push((u || 'pub') + ': ' + e.message)); await p.goto(url || file); return p; };
    const d = await mk('u_dir');
    const link = await setupLive(d);
    ok('A: live with a public link', /#watch=[0-9a-f]{32}$/.test(link));
    const evId = Object.keys(await db(d)).find(k => /^events\/[^/]+$/.test(k)).split('/')[1];
    await until(async () => Object.keys((await db(d))['pubsnap/' + evId] ? (await db(d))['pubsnap/' + evId].v : {}).length > 3, 10000);
    let D = await db(d);
    const parts = Object.keys(D).filter(k => k.startsWith(`pubsnap/${evId}/parts/`));
    const man = (D['pubsnap/' + evId] || {}).v || {}, nBr = Object.keys(D).filter(k => k.startsWith(`live/${evId}/brackets/`)).length;
    const nComp = Object.keys(D).filter(k => k.startsWith(`events/${evId}/competitors/`)).length;
    const inParts = parts.filter(k => /competitors~/.test(k)).reduce((n, k) => n + Object.keys(D[k].d || {}).length, 0);
    console.log(`  parts: ${parts.length}, manifest keys: ${Object.keys(man).length}, brackets: ${nBr}, competitors: ${nComp}`);
    ok('A: Go live wrote the spectators’ copy: every competitor in a part', nComp > 0 && inParts === nComp);
    ok('A: manifest lists every bracket and part', Object.keys(man).filter(k => k.startsWith('b~')).length === nBr && parts.every(k => man['p~' + k.split('/').pop()]));
    ok('A: judges in the copy carry no email / notes', parts.filter(k => /judges~/.test(k)).every(k => Object.values(D[k].d || {}).every(j => !('email' in j) && !('notes' in j))));
    ok('A: no private details (pv) in the copy', !JSON.stringify(parts.map(k => D[k])).match(/"(dob|phone|emergency)"/i));
    const raw = Object.keys(D).filter(k => new RegExp(`^(events/${evId}/|live/${evId}/)`).test(k) && !/\/requests\//.test(k)).length;
    // spectator (signed out) — file:// has no website function → direct feed
    const v = await mk('', link);
    await until(async () => /\d/.test(await stats(v)), 10000); await v.waitForTimeout(800);
    const reads = await v.evaluate(() => window.__mockReads || 0);
    console.log(`  spectator first load: ${reads} document reads (the event's own collections: ${raw} documents)`);
    ok('A: spectator sees the same dashboard as the director', (await stats(v)).split(' Rings')[0] === (await stats(d)).split(' Rings')[0]);
    ok('A: spectator reads far fewer documents than the event has', reads > 0 && reads * 3 < raw);
    const deny = async (pg, p) => pg.evaluate(async p => { try { await firebase.firestore().collection(p).get(); return 'read'; } catch (e) { return e.code; } }, p);
    ok('A: rules — spectators cannot read the event’s own collections', await deny(v, `events/${evId}/competitors`) === 'permission-denied' && await deny(v, `events/${evId}/judges`) === 'permission-denied');
    ok('A: rules — nor ring readiness or attendance', await deny(v, `live/${evId}/ringready`) === 'permission-denied' && await deny(v, `live/${evId}/attendance`) === 'permission-denied');
    ok('A: rules — the copy, brackets and ring boards are readable', await deny(v, `pubsnap/${evId}/parts`) === 'read' && await deny(v, `live/${evId}/brackets`) === 'read' && await deny(v, `live/${evId}/ringstate`) === 'read');
    // live changes reach the spectator: check-in (copy) and a match result (bracket)
    await tab(d, 'Competitors');
    const before = await v.evaluate(() => 0); void before;
    await d.click('button[data-act="checkin"] >> nth=0'); await d.waitForTimeout(300);
    await tab(d, 'Dashboard');
    ok('A: a check-in reaches the spectator', await until(async () => (await stats(v)).split(' Divisions')[0] === (await stats(d)).split(' Divisions')[0], 8000));
    const s0 = await stats(d);
    ok('A: director scores a match', await scoreOne(d));
    await tab(d, 'Dashboard');
    ok('A: …director’s match count changed', (await stats(d)) !== s0);
    ok('A: a match result reaches the spectator', await until(async () => (await stats(v)).replace(/ Rings.*/, '') === (await stats(d)).replace(/ Rings.*/, ''), 8000));
    // follow a division
    await tab(v, 'Follow');
    await v.fill('#follow-q', 'Kata'); await v.waitForTimeout(250);
    ok('A: Follow search lists divisions', /Divisions/.test(await v.textContent('#main')) && !!(await v.$('button.star[data-k="divs"]')));
    const divName = await v.$eval('button.star[data-k="divs"]', x => x.parentElement.textContent.replace(/[☆★]/g, '').replace(/\d+ entrants?$/, '').trim());
    await v.click('button.star[data-k="divs"] >> nth=0'); await v.waitForTimeout(150);
    await v.fill('#follow-q', ''); await v.dispatchEvent('#follow-q', 'input'); await v.waitForTimeout(250);
    ok('A: followed division card: name, status, Bracket button', !!(await v.$('.follow-div')) && (await v.textContent('.follow-div')).includes(divName) && !!(await v.$('.follow-div button[data-act="view-bracket"]')));
    await v.screenshot({ path: 'test/shots/spect-follow-div.png', fullPage: true });
    await v.reload(); await until(async () => !!(await v.$('.tab')), 10000); await tab(v, 'Follow');
    ok('A: the division stays followed after reload (this device)', !!(await v.$('.follow-div')));
    await v.click('.follow-div button[data-act="view-bracket"]'); await v.waitForTimeout(200);
    ok('A: Bracket › opens the division’s bracket', (await v.$eval('.tab[aria-selected="true"]', t => t.textContent)) === 'Brackets');
    await tab(v, 'Divisions');
    await v.click('.vrow button.star[data-k="divs"]:not(.on) >> nth=0'); await v.waitForTimeout(150);
    ok('A: ☆ on the Divisions list follows without leaving the list', (await v.$eval('.tab[aria-selected="true"]', t => t.textContent)) === 'Divisions' && (await v.$$('.vrow button.star.on')).length === 2);
    await v.setViewportSize({ width: 390, height: 844 }); await tab(v, 'Follow');
    ok('A: Follow with divisions fits a phone', await v.evaluate(() => document.documentElement.scrollWidth <= 391));
    await v.screenshot({ path: 'test/shots/spect-follow-phone.png', fullPage: true });
    await v.setViewportSize({ width: 1280, height: 900 }); await tab(v, 'Dashboard');
    // signed-in person who is not on the event's team: same compact copy
    const w = await mk('u_watch'); await signIn(w); await w.waitForTimeout(800);
    await w.evaluate(id => { const x = [...document.querySelectorAll('button.ev-card')].find(c => c.dataset.id === id); if (x) x.click(); }, evId);   // (or already open: last event on this device)
    await until(async () => /\d/.test(await stats(w)), 10000); await w.waitForTimeout(600);
    const wr = await w.evaluate(() => window.__mockReads || 0);
    console.log(`  signed-in spectator: ${wr} document reads (incl. sign-in and the event list)`);
    ok('A: signed-in spectator (not on the team) uses the copy too', wr > 0 && wr * 3 < raw && (await stats(w)).split(' Rings')[0] === (await stats(d)).split(' Rings')[0]);
    // #4 pause spectators
    await tab(d, 'Dashboard');
    ok('A: live card has the Spectators controls', !!(await d.$('#spect-ctl')) && !!(await d.$('button[data-act="pub-pause"]')) && !!(await d.$('#pub-feed')));
    await d.screenshot({ path: 'test/shots/spect-controls.png' });
    await d.click('button[data-act="pub-pause"]'); await d.waitForTimeout(400);
    ok('A: paused: director sees Paused + Resume', /Paused/.test(await d.textContent('#spect-state')) && !!(await d.$('button[data-act="pub-resume"]')));
    ok('A: paused: public page says so, shows no results', await until(async () => !!(await v.$('#pub-paused')), 6000) && !(await v.$('.tab, .bn, .stats')));
    await v.screenshot({ path: 'test/shots/spect-paused.png' });
    ok('A: paused: signed-in spectator sees the paused page', await until(async () => !!(await w.$('#pub-paused')), 6000));
    ok('A: paused: rules close the copy to spectators', await deny(v, `pubsnap/${evId}/parts`) === 'permission-denied' && await deny(v, `live/${evId}/brackets`) === 'permission-denied');
    ok('A: paused: the director still reads the event', await deny(d, `events/${evId}/competitors`) === 'read');
    const s1 = await stats(d);
    ok('A: paused: scoring goes on', await scoreOne(d)); await tab(d, 'Dashboard');
    ok('A: …and is saved', (await stats(d)) !== s1);
    await d.click('button[data-act="pub-resume"]'); await d.waitForTimeout(400);
    ok('A: resumed: public page back with the latest results', await until(async () => !!(await v.$('.stats')) && (await stats(v)).replace(/ Rings.*/, '') === (await stats(d)).replace(/ Rings.*/, ''), 8000));
    ok('A: resumed: signed-in spectator back with the latest results', await until(async () => !!(await w.$('.stats')) && (await stats(w)).replace(/ Rings.*/, '') === (await stats(d)).replace(/ Rings.*/, ''), 8000));
    // feed choice saved on the event
    await d.selectOption('#pub-feed', 'direct'); await d.waitForTimeout(400);
    D = await db(d);
    ok('A: “Direct” feed saved on the event', D['events/' + evId].pubFeed === 'direct');
    // Refresh spectators' data repairs a damaged copy
    await d.evaluate(id => { const x = JSON.parse(localStorage.getItem('fbmock')); delete x[`pubsnap/${id}/parts/rings~0`]; localStorage.setItem('fbmock', JSON.stringify(x)); }, evId);
    await d.click('button[data-act="pub-refresh"]'); await d.waitForTimeout(800);
    ok('A: Refresh spectators’ data rebuilds a missing part', !!(await db(d))[`pubsnap/${evId}/parts/rings~0`]);
    await ctx.close();
  }

  /* ================= Part B: website cache (/api/live through the real function) ================= */
  {
    const html = fs.readFileSync('dist/karate-event-tracker.html');
    const srv = http.createServer((q, r) => { if (q.url === '/' || q.url.startsWith('/?') || q.url.startsWith('/#')) { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); r.end(html); } else { r.writeHead(404); r.end('not found'); } });
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const site = `http://127.0.0.1:${srv.address().port}/`;
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); await ctx.route(/fonts\.|gstatic/, r => r.abort());
    let director = null; const dbReads = []; const cache = new Map(); let requests = 0, misses = 0;
    const TTL_SCALE = 0.2;   // the emulated CDN keeps s-maxage × 0.2 so the test runs fast
    live._reset();
    const doFetch = fakeFetch(async () => db(director), dbReads);
    const perPage = new Map();
    await ctx.route('**/api/live**', async route => {
      requests++; try { const pg = route.request().frame().page(); perPage.set(pg, (perPage.get(pg) || 0) + 1); } catch (e) { /* ignore */ }
      const u = new URL(route.request().url()), key = u.pathname + u.search, hit = cache.get(key);
      if (hit && hit.exp > Date.now()) return route.fulfill(hit.resp);
      misses++;
      const r = await callLive(live.handler, key, doFetch);
      const resp = { status: r.status, headers: { 'content-type': 'application/json', 'cache-control': r.headers['cache-control'] }, body: r.body };
      const m = /s-maxage=(\d+)/.exec(r.headers['cache-control'] || ''); if (m) cache.set(key, { exp: Date.now() + (+m[1]) * 1000 * TTL_SCALE, resp });
      return route.fulfill(resp);
    });
    const mk = async (u, url, poll) => { const p = await ctx.newPage(); await p.addInitScript(`sessionStorage.setItem('nextuid','${u}');${poll ? `window.__ktPollMs=${poll};` : ''}` + mock); p.on('pageerror', e => errors.push('B' + (u || 'pub') + ': ' + e.message)); await p.goto(url || site); return p; };
    director = await mk('u_dir');
    const link = await setupLive(director);
    const d = director;
    ok('B: link on the website', link.startsWith(site + '#watch='));
    await d.waitForTimeout(2500);
    const specs = [];
    for (let i = 0; i < 4; i++) specs.push(await mk('', link, 1000));
    const ready = await until(async () => { for (const s of specs) if (!(await s.$('.stats')) || !/\d/.test(await stats(s))) return false; return true; }, 15000);
    ok('B: 4 spectators see the live event through the website cache', ready);
    ok('B: …the same dashboard as the director', (await stats(specs[0])).split(' Rings')[0] === (await stats(d)).split(' Rings')[0]);
    const fsReads = await Promise.all(specs.map(s => s.evaluate(() => window.__mockReads || 0)));
    ok('B: spectators read nothing from the database themselves', fsReads.every(n => n === 0));
    requests = 0; misses = 0; dbReads.length = 0;
    await specs[0].waitForTimeout(6000);
    console.log(`  6 s with 4 spectators polling every 1 s: ${requests} requests to /api/live, ${misses} reached the function, ${dbReads.length} database reads`);
    ok('B: the cache answers most requests', requests >= 12 && misses * 2 < requests);
    ok('B: database reads do not grow with spectators (≤ 3 per cache period)', dbReads.length <= Math.ceil(6 / (10 * TTL_SCALE) + 1) * 3);
    // a change on the mat reaches everyone through the cache
    const s0 = await stats(d);
    ok('B: director scores a match', await scoreOne(d)); await tab(d, 'Dashboard');
    ok('B: …all spectators get the result', (await stats(d)) !== s0 && await until(async () => { for (const s of specs) if ((await stats(s)).replace(/ Rings.*/, '') !== (await stats(d)).replace(/ Rings.*/, '')) return false; return true; }, 12000));
    await tab(d, 'Competitors'); await d.click('button[data-act="checkin"] >> nth=0'); await d.waitForTimeout(300); await tab(d, 'Dashboard');
    ok('B: a check-in reaches the spectators (changed part only)', await until(async () => (await stats(specs[1])).split(' Divisions')[0] === (await stats(d)).split(' Divisions')[0], 12000));
    // pause / resume through the cache
    await d.click('button[data-act="pub-pause"]'); await d.waitForTimeout(300);
    ok('B: paused → spectators show the paused page', await until(async () => !!(await specs[2].$('#pub-paused')), 10000));
    await d.click('button[data-act="pub-resume"]'); await d.waitForTimeout(300);
    ok('B: resumed → live results again', await until(async () => !!(await specs[2].$('.stats')), 10000));
    // director switches to direct feed → open pages switch to the database
    await d.selectOption('#pub-feed', 'direct'); await d.waitForTimeout(300);
    ok('B: “Direct” → spectators move to the database listeners', await until(async () => (await specs[3].evaluate(() => window.__mockReads || 0)) > 0 && !!(await specs[3].$('.stats')), 12000));
    const n3 = perPage.get(specs[3]) || 0;
    await d.selectOption('#pub-feed', 'cdn');
    ok('B: “Website cache” again → the open page polls the cache again', await until(async () => (perPage.get(specs[3]) || 0) > n3 + 2, 10000) && !!(await specs[3].$('.stats')));
    await d.waitForTimeout(10000 * TTL_SCALE * 1.5);   // a visitor inside the cache period may still get “direct” and move over when it sees the change
    const s4 = await mk('', link, 1000);
    ok('B: …and a new visitor reads nothing from the database', await until(async () => !!(await s4.$('.stats')), 10000) && (await s4.evaluate(() => window.__mockReads || 0)) === 0);
    // no function on the site → falls back to the database
    await ctx.unroute('**/api/live**');
    const fb = await mk('', link, 1000);
    ok('B: site without the function → spectator falls back to the database', await until(async () => !!(await fb.$('.stats')) && (await fb.evaluate(() => window.__mockReads || 0)) > 0, 12000));
    await ctx.close(); srv.close();
  }
  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await b.close(); process.exit(errors.length ? 1 : 0);
})();
