// v1.50: /api/live (Vercel function) — states, versions, cache headers, value decoding, rules respected, config
const assert = require('assert');
const live = require('../api/live.js');
const { fakeFetch, callLive } = require('./fakerest');
let pass = 0, fail = 0;
const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (v) pass++; else fail++; };
(async () => {
  live._reset();
  const db = {
    'share/tok1': { eventId: 'E1' },
    'meta/branding': { logo: 'horizon' },
    'events/E1': { name: 'Open', public: true, live: true, shareToken: 'tok1', directorIds: ['u1'], n: 3, f: 1.5, ok: true, nil: null, list: ['a', 2] },
    'pubsnap/E1': { v: { 'p~competitors~0': 'v1', 'b~D1': 'v2' } },
    'pubsnap/E1/parts/competitors~0': { col: 'competitors', d: { c1: { firstName: 'Ana', lastName: 'Kowal', events: ['kata'], seed: 2 } } },
    'live/E1/brackets/D1': { format: 'SE', matches: { m1: { id: 'm1' } }, results: {} },
    'live/E1/ringstate/R1': { did: 'D1', mid: 'm1', log: [{ t: 'waza' }] },
    'live/E1/ringready/R1': { ready: true },
    'events/E1/competitors/c1': { firstName: 'Ana' },
  };
  const calls = [];
  const f = fakeFetch(() => db, calls);
  // config read from vercel/firebase-config.js (the real project)
  let r = await callLive(live.handler, '/api/live?t=tok1', f);
  const b = JSON.parse(r.body);
  ok('config from vercel/firebase-config.js', calls.length > 0);
  ok('live bundle: ok, state live, event id', b.ok === 1 && b.state === 'live' && b.eventId === 'E1');
  ok('event fields decoded (string, int, double, bool, null, array)', b.ev.name === 'Open' && b.ev.n === 3 && b.ev.f === 1.5 && b.ev.ok === true && b.ev.nil === null && JSON.stringify(b.ev.list) === '["a",2]');
  ok('versions of every part and bracket', b.v['p~competitors~0'] === 'v1' && b.v['b~D1'] === 'v2');
  ok('ring boards included', b.rs.R1 && b.rs.R1.did === 'D1' && b.rs.R1.log[0].t === 'waza');
  ok('branding included', b.branding && b.branding.logo === 'horizon');
  ok('bundle cached 10 s at the CDN, not in the browser', /s-maxage=10/.test(r.headers['cache-control']) && /max-age=0/.test(r.headers['cache-control']));
  ok('bundle reads: share, event, branding, manifest, ring boards (5)', calls.length === 5);
  ok('never reads ring readiness or the event’s own collections', !calls.some(p => /ringready|events\/E1\/competitors/.test(p)));
  // second bundle on a warm instance: share and branding remembered
  calls.length = 0; await callLive(live.handler, '/api/live?t=tok1', f);
  ok('warm instance: 3 reads (event, manifest, ring boards)', calls.length === 3);
  // one part / bracket at a version
  calls.length = 0; r = await callLive(live.handler, '/api/live?t=tok1&k=p~competitors~0&v=v1', f);
  let j = JSON.parse(r.body);
  ok('part at a version', j.ok === 1 && j.d.col === 'competitors' && j.d.d.c1.lastName === 'Kowal' && j.d.d.c1.seed === 2);
  ok('…cached for good (immutable)', /immutable/.test(r.headers['cache-control']) && /s-maxage=31536000/.test(r.headers['cache-control']));
  ok('…one read', calls.length === 1 && calls[0] === 'pubsnap/E1/parts/competitors~0');
  r = await callLive(live.handler, '/api/live?t=tok1&k=b~D1&v=v2', f); j = JSON.parse(r.body);
  ok('bracket at a version', j.ok === 1 && j.d.format === 'SE' && j.d.matches.m1.id === 'm1');
  r = await callLive(live.handler, '/api/live?t=tok1&k=b~NOPE&v=v9', f); j = JSON.parse(r.body);
  ok('missing bracket → ok, d null', j.ok === 1 && j.d === null);
  r = await callLive(live.handler, '/api/live?t=tok1&k=x~events/E1/competitors/c1&v=1', f);
  ok('other keys refused (no way to read the event’s own collections)', r.status === 400);
  r = await callLive(live.handler, '/api/live?t=tok1&k=p~../../events/E1/competitors/c1&v=1', f);
  ok('path tricks stripped', !calls.some(p => /events\/E1\/competitors/.test(p)) && JSON.parse(r.body).d === null);
  // paused (#4)
  db['events/E1'].pubPaused = true; calls.length = 0;
  r = await callLive(live.handler, '/api/live?t=tok1', f); j = JSON.parse(r.body);
  ok('paused: state paused, no results, short cache', j.ok === 0 && j.state === 'paused' && !j.v && !j.rs && /s-maxage=5/.test(r.headers['cache-control']));
  ok('paused: does not read the manifest or ring boards', !calls.some(p => /pubsnap|ringstate/.test(p)));
  r = await callLive(live.handler, '/api/live?t=tok1&k=p~competitors~0&v=v3', f);
  ok('paused: parts denied by the rules (403, not cached long)', r.status === 403 && /s-maxage=5/.test(r.headers['cache-control']));
  delete db['events/E1'].pubPaused;
  // not live yet
  db['events/E1'].live = false;
  j = JSON.parse((await callLive(live.handler, '/api/live?t=tok1', f)).body);
  ok('before Go live: state wait, event details only', j.ok === 1 && j.state === 'wait' && j.ev.name === 'Open' && !Object.keys(j.v).length);
  db['events/E1'].live = true;
  // stop sharing
  db['events/E1'].public = false;
  j = JSON.parse((await callLive(live.handler, '/api/live?t=tok1', f)).body);
  ok('sharing stopped: state off', j.ok === 0 && j.state === 'off');
  db['events/E1'].public = true; db['events/E1'].shareToken = 'tok2'; db['share/tok2'] = { eventId: 'E1' };
  j = JSON.parse((await callLive(live.handler, '/api/live?t=tok1', f)).body);
  ok('old token after a new link: off', j.ok === 0 && j.state === 'off');
  j = JSON.parse((await callLive(live.handler, '/api/live?t=tok2', f)).body);
  ok('new token works', j.ok === 1 && j.state === 'live');
  j = JSON.parse((await callLive(live.handler, '/api/live?t=nonexistent', f)).body);
  ok('unknown token: state unknown', j.ok === 0 && j.state === 'unknown');
  r = await callLive(live.handler, '/api/live', f);
  ok('no token: 400', r.status === 400);
  // database down
  live._reset();
  r = await callLive(live.handler, '/api/live?t=tok2', async () => { throw new Error('network'); });
  ok('database unreachable: 502, short cache', r.status === 502 && /s-maxage=5/.test(r.headers['cache-control']));
  // env config wins
  live._reset(); process.env.FIREBASE_PROJECT_ID = 'other-proj'; process.env.FIREBASE_API_KEY = 'k123';
  const urls = []; await callLive(live.handler, '/api/live?t=tok2', async u => { urls.push(u); return f(u); });
  ok('environment variables override the config file', /projects\/other-proj\//.test(urls[0]) && /key=k123/.test(urls[0]));
  delete process.env.FIREBASE_PROJECT_ID; delete process.env.FIREBASE_API_KEY; live._reset();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
