// Karate Event Tracker v1.49 — spectators' live feed through the website cache (Vercel function + CDN).
// GET /api/live?t=<share token>                 → event + versions of every part / bracket + ring boards  (cached 10 s)
// GET /api/live?t=<share token>&k=<key>&v=<ver> → one part or bracket at that version                     (cached for good)
// The function reads Firestore's REST API without signing in, so the security rules decide exactly as for a
// spectator's browser (shared + live + not paused). However many spectators poll, the CDN answers them and the
// database is asked at most once per cache period.
'use strict';
const fs = require('fs'), path = require('path');

let CFG = null;
function config() {
  if (CFG) return CFG;
  let projectId = process.env.FIREBASE_PROJECT_ID || '', apiKey = process.env.FIREBASE_API_KEY || '';
  if (!projectId || !apiKey) {
    try {
      const src = fs.readFileSync(path.join(__dirname, '..', 'vercel', 'firebase-config.js'), 'utf8');
      const m = k => (new RegExp(k + "\\s*:\\s*['\"]([^'\"]+)['\"]").exec(src) || [])[1] || '';
      projectId = projectId || m('projectId'); apiKey = apiKey || m('apiKey');
    } catch (e) { /* no config file */ }
  }
  CFG = { projectId, apiKey };
  return CFG;
}
const BUNDLE_S = 10, MISS_S = 5, YEAR = 31536000;

/** Firestore REST value → plain JSON */
function val(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return !!v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return v.timestampValue;
  if ('mapValue' in v) return fields(v.mapValue.fields);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  if ('referenceValue' in v) return v.referenceValue;
  if ('geoPointValue' in v) return v.geoPointValue;
  if ('bytesValue' in v) return v.bytesValue;
  return null;
}
function fields(f) { const o = {}; for (const k in f || {}) o[k] = val(f[k]); return o; }

function api(doFetch) {
  const { projectId, apiKey } = config();
  const host = process.env.FIRESTORE_EMULATOR_HOST ? 'http://' + process.env.FIRESTORE_EMULATOR_HOST : 'https://firestore.googleapis.com';   // tests: the local emulator
  const base = `${host}/v1/projects/${projectId}/databases/(default)/documents/`;
  const enc = p => p.split('/').map(encodeURIComponent).join('/');
  return {
    /** one document: {status, data} — data null when missing */
    async get(p) {
      const r = await doFetch(base + enc(p) + '?key=' + encodeURIComponent(apiKey));
      if (r.status === 404) return { status: 404, data: null };
      if (!r.ok) return { status: r.status, data: null };
      const j = await r.json(); return { status: 200, data: fields(j.fields) };
    },
    /** every document of a collection: {status, data: {id: doc}} */
    async list(p) {
      const out = {}; let tok = '';
      for (let i = 0; i < 20; i++) {
        const r = await doFetch(base + enc(p) + '?pageSize=300&key=' + encodeURIComponent(apiKey) + (tok ? '&pageToken=' + encodeURIComponent(tok) : ''));
        if (!r.ok) return { status: r.status, data: null };
        const j = await r.json();
        for (const d of j.documents || []) out[d.name.split('/').pop()] = fields(d.fields);
        tok = j.nextPageToken || ''; if (!tok) break;
      }
      return { status: 200, data: out };
    },
  };
}

const shares = new Map();   // token → {eventId, at} — warm instances skip the lookup
let brand = null;           // meta/branding (the app logo), kept 10 minutes
function send(res, code, body, maxAge) {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', maxAge >= YEAR ? `public, max-age=${YEAR}, s-maxage=${YEAR}, immutable`
    : `public, max-age=0, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}`);
  res.end(JSON.stringify(body));
}
const clean = (s, n) => String(s || '').replace(/[^A-Za-z0-9_~-]/g, '').slice(0, n);

async function handler(req, res, doFetch) {
  doFetch = doFetch || globalThis.fetch;
  const q = new URL(req.url, 'http://x').searchParams;
  const t = clean(q.get('t'), 64), k = clean(q.get('k'), 200), v = clean(q.get('v'), 40);
  if (!config().projectId || !config().apiKey) return send(res, 500, { ok: 0, state: 'config' }, MISS_S);
  if (!t) return send(res, 400, { ok: 0, state: 'bad' }, YEAR);
  const db = api(doFetch);
  try {
    let sh = shares.get(t);
    if (!sh || Date.now() - sh.at > 600000) {
      const r = await db.get('share/' + t);
      if (!r.data || !r.data.eventId) return send(res, 200, { ok: 0, state: 'unknown' }, 30);
      sh = { eventId: clean(r.data.eventId, 128), at: Date.now() }; shares.set(t, sh);
    }
    const e = sh.eventId;
    if (k) {   // one part or bracket (the version only makes the address unique, so a new version is a new cache entry)
      let p = '';
      if (k.startsWith('p~')) p = `pubsnap/${e}/parts/${k.slice(2)}`;
      else if (k.startsWith('b~')) p = `live/${e}/brackets/${k.slice(2)}`;
      else return send(res, 400, { ok: 0, state: 'bad' }, YEAR);
      const r = await db.get(p);
      if (r.status === 403) return send(res, 403, { ok: 0, state: 'denied' }, MISS_S);
      if (r.status !== 200 && r.status !== 404) return send(res, 502, { ok: 0, state: 'error' }, MISS_S);
      return send(res, 200, { ok: 1, k, v, d: r.data }, v ? YEAR : BUNDLE_S);
    }
    const er = await db.get('events/' + e);
    const ev = er.data;
    if (!ev || !ev.public || ev.shareToken !== t) { shares.delete(t); return send(res, 200, { ok: 0, state: 'off' }, BUNDLE_S); }
    if (!brand || Date.now() - brand.at > 600000) { const r = await db.get('meta/branding'); brand = { d: r.data || {}, at: Date.now() }; }
    if (!ev.live) return send(res, 200, { ok: 1, state: 'wait', eventId: e, ev, v: {}, rs: {}, branding: brand.d }, BUNDLE_S);
    if (ev.pubPaused) return send(res, 200, { ok: 0, state: 'paused', eventId: e, ev, branding: brand.d }, MISS_S);
    const [man, rs] = await Promise.all([db.get('pubsnap/' + e), db.list(`live/${e}/ringstate`)]);
    if (man.status === 403 || rs.status === 403) return send(res, 200, { ok: 0, state: 'paused', eventId: e, ev }, MISS_S);
    return send(res, 200, { ok: 1, state: 'live', eventId: e, ev, v: (man.data && man.data.v) || {}, rs: rs.data || {}, branding: brand.d, at: new Date().toISOString() }, BUNDLE_S);
  } catch (err) {
    console.error('[live]', err);
    return send(res, 502, { ok: 0, state: 'error' }, MISS_S);
  }
}
module.exports = (req, res) => handler(req, res);
module.exports.handler = handler;
module.exports._reset = () => { CFG = null; shares.clear(); brand = null; };
