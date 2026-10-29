// v1.49: a stand-in for Firestore's REST API (read-only, not signed in) over a test database {path: doc} —
// the same rules a signed-out visitor meets (see firestore.rules / test/fbmock.js). Used by test/livefn.js and test/spectfeed.js.
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: v.length ? { values: v.map(enc) } : {} };
  return { mapValue: { fields: encFields(v) } };
}
function encFields(o) { const f = {}; for (const k in o) f[k] = enc(o[k]); return f; }
function readable(db, p) {
  if (/^share\//.test(p) || p === 'meta/branding') return true;
  const m = /^(events|live|pubsnap)\/([^/]+)/.exec(p); if (!m) return false;
  const ev = db['events/' + m[2]] || {};
  if (/^events\/[^/]+$/.test(p)) return ev.public === true;
  const pub = ev.public === true && ev.live === true && ev.pubPaused !== true;
  return pub && (/^pubsnap\//.test(p) || /^live\/[^/]+\/(brackets|ringstate)(\/|$)/.test(p));
}
/** fetch(url) for https://firestore.googleapis.com/v1/projects/P/databases/(default)/documents/<path>?key=… */
function fakeFetch(getDb, log) {
  const res = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
  return async url => {
    const u = new URL(url);
    const p = decodeURIComponent(u.pathname.split('/documents/')[1] || '');
    if (log) log.push(p);
    const db = typeof getDb === 'function' ? await getDb() : getDb;
    const segs = p.split('/');
    if (segs.length % 2 === 0) {   // a document
      if (!readable(db, p)) return res(403, { error: { code: 403, status: 'PERMISSION_DENIED' } });
      if (!db[p]) return res(404, { error: { code: 404, status: 'NOT_FOUND' } });
      return res(200, { name: 'projects/x/databases/(default)/documents/' + p, fields: encFields(db[p]) });
    }
    if (!readable(db, p + '/x')) return res(403, { error: { code: 403, status: 'PERMISSION_DENIED' } });
    const docs = Object.keys(db).filter(k => k.split('/').slice(0, -1).join('/') === p).map(k => ({ name: 'projects/x/databases/(default)/documents/' + k, fields: encFields(db[k]) }));
    return res(200, docs.length ? { documents: docs } : {});
  };
}
/** Run the function like Vercel does: returns {status, headers, body}. */
async function callLive(handler, url, doFetch) {
  const headers = {}; let body = '', status = 200;
  const res = { set statusCode(v) { status = v; }, get statusCode() { return status; }, setHeader(k, v) { headers[k.toLowerCase()] = v; }, end(b) { body = b || ''; } };
  await handler({ url, method: 'GET', headers: {} }, res, doFetch);
  return { status, headers, body };
}
module.exports = { fakeFetch, callLive, enc, readable };
