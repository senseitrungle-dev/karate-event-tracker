// v1.50: firestore.rules in the real Firestore emulator — spectators' copy (pubsnap), pause, team-only collections,
// and the field-level writes the app uses (set + mergeFields + FieldValue.delete).
// Needs Java and:  npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10   (anywhere; point NODE_PATH at its node_modules)
// Run:  NODE_PATH=<dir>/node_modules npx firebase emulators:exec --only firestore --project demo-kt "node test/rules-emulator.js"
const fs = require('fs'), path = require('path');
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const firebase = require('firebase/compat/app'); require('firebase/compat/firestore');
let pass = 0, fail = 0;
const ok = (name, v) => { console.log((v ? 'PASS ' : 'FAIL ') + name); if (v) pass++; else fail++; };
const allowed = async (name, p) => { try { await assertSucceeds(p); ok(name, true); } catch (e) { console.log('   ', e.message); ok(name, false); } };
const denied = async (name, p) => { try { await assertFails(p); ok(name, true); } catch (e) { console.log('   ', e.message); ok(name, false); } };
(async () => {
  const env = await initializeTestEnvironment({ projectId: 'demo-kt', firestore: { rules: fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8') } });
  const seed = async ev => env.withSecurityRulesDisabled(async c => {
    const db = c.firestore();
    await db.doc('events/E').set(Object.assign({ name: 'Open', public: true, live: true, shareToken: 't1', directorIds: ['dir'], managerIds: ['mgr'], staffIds: ['stf'] }, ev || {}));
    await db.doc('events/E/rings/R').set({ name: 'Ring 1', managerIds: ['mgr'] });
    await db.doc('events/E/divisions/D').set({ name: 'Kata', ringId: 'R' });
    await db.doc('events/E/competitors/C').set({ firstName: 'Ana' });
    await db.doc('events/E/judges/J').set({ name: 'J', email: 'j@x.org' });
    await db.doc('pv/E/competitors/C').set({ dob: '2010-01-01' });
    await db.doc('live/E/brackets/D').set({ format: 'SE' });
    await db.doc('live/E/ringstate/R').set({ did: 'D' });
    await db.doc('live/E/ringready/R').set({ ready: true });
    await db.doc('live/E/attendance/S').set({ x: true });
    await db.doc('pubsnap/E').set({ v: { 'p~competitors~0': 'a' } });
    await db.doc('pubsnap/E/parts/competitors~0').set({ col: 'competitors', d: { C: { firstName: 'Ana' } } });
  });
  await seed();
  const anon = env.unauthenticatedContext().firestore(), view = env.authenticatedContext('viewer').firestore();
  const dir = env.authenticatedContext('dir').firestore(), mgr = env.authenticatedContext('mgr').firestore(), stf = env.authenticatedContext('stf').firestore();
  for (const [who, db] of [['signed out', anon], ['signed-in non-team', view]]) {
    await allowed(`${who}: event document`, db.doc('events/E').get());
    await allowed(`${who}: spectators’ copy (manifest)`, db.doc('pubsnap/E').get());
    await allowed(`${who}: spectators’ copy (parts list)`, db.collection('pubsnap/E/parts').get());
    await allowed(`${who}: brackets`, db.collection('live/E/brackets').get());
    await allowed(`${who}: ring boards`, db.collection('live/E/ringstate').get());
    await denied(`${who}: event’s competitors`, db.collection('events/E/competitors').get());
    await denied(`${who}: one competitor`, db.doc('events/E/competitors/C').get());
    await denied(`${who}: judges (emails)`, db.doc('events/E/judges/J').get());
    await denied(`${who}: private details`, db.doc('pv/E/competitors/C').get());
    await denied(`${who}: ring readiness`, db.doc('live/E/ringready/R').get());
    await denied(`${who}: attendance`, db.doc('live/E/attendance/S').get());
    await denied(`${who}: write the copy`, db.doc('pubsnap/E/parts/competitors~0').set({ col: 'competitors', d: {} }));
    await denied(`${who}: write the manifest`, db.doc('pubsnap/E').set({ v: {} }));
  }
  // the team
  await allowed('director: event’s competitors', dir.collection('events/E/competitors').get());
  await allowed('ring manager: event’s competitors', mgr.collection('events/E/competitors').get());
  await allowed('staff: ring readiness', stf.doc('live/E/ringready/R').get());
  const FP = firebase.firestore.FieldPath, DEL = firebase.firestore.FieldValue.delete;
  const patch = (db, p, field, kv, top) => { const data = Object.assign({}, top || {}, { [field]: {}, at: 'now' }), paths = Object.keys(top || {}).concat(['at']); for (const k in kv) { data[field][k] = kv[k] === null ? DEL() : kv[k]; paths.push(new FP(field, k)); } return db.doc(p).set(data, { mergeFields: paths }); };
  await allowed('director: patch a part', patch(dir, 'pubsnap/E/parts/competitors~0', 'd', { C2: { firstName: 'Bo', tags: ['a'] } }, { col: 'competitors' }));
  await allowed('director: patch the manifest', patch(dir, 'pubsnap/E', 'v', { 'b~D': 'x1' }));
  await allowed('ring manager: patch the manifest (bracket version)', patch(mgr, 'pubsnap/E', 'v', { 'b~D': 'x2' }));
  await denied('ring manager: cannot write the competitors part', patch(mgr, 'pubsnap/E/parts/competitors~0', 'd', { C: { firstName: 'Hacked' } }, { col: 'competitors' }));
  await allowed('ring manager: attendance part', patch(mgr, 'pubsnap/E/parts/attendance~0', 'd', { S: { x: 1 } }, { col: 'attendance' }));
  await allowed('staff: attendance part', patch(stf, 'pubsnap/E/parts/attendance~0', 'd', { S2: { x: 2 } }, { col: 'attendance' }));
  await denied('staff: not the divisions part', patch(stf, 'pubsnap/E/parts/divisions~0', 'd', { D: {} }, { col: 'divisions' }));
  await denied('signed-in non-team: no attendance part', patch(view, 'pubsnap/E/parts/attendance~0', 'd', { S: {} }, { col: 'attendance' }));
  // field-level semantics: other entries untouched, nested values replaced whole, null deletes
  await patch(dir, 'pubsnap/E/parts/competitors~0', 'd', { C2: { firstName: 'Bo' } });
  let d = (await dir.doc('pubsnap/E/parts/competitors~0').get()).data();
  ok('patch keeps the other entries', d.d.C && d.d.C.firstName === 'Ana' && d.col === 'competitors');
  ok('patch replaces an entry whole (removed fields go)', d.d.C2.firstName === 'Bo' && !('tags' in d.d.C2));
  await patch(mgr, 'pubsnap/E', 'v', { 'p~competitors~0': 'b' });
  d = (await dir.doc('pubsnap/E').get()).data();
  ok('two writers, different manifest entries: both kept', d.v['b~D'] === 'x2' && d.v['p~competitors~0'] === 'b');
  await patch(dir, 'pubsnap/E/parts/competitors~0', 'd', { C2: null });
  d = (await dir.doc('pubsnap/E/parts/competitors~0').get()).data();
  ok('null deletes one entry', !('C2' in d.d) && d.d.C.firstName === 'Ana');
  await allowed('patch on a document that does not exist yet (creates it)', patch(dir, 'pubsnap/E/parts/teams~1', 'd', { T: { name: 'A' } }, { col: 'teams' }));
  // #4 paused
  await env.withSecurityRulesDisabled(c => c.firestore().doc('events/E').update({ pubPaused: true }));
  await allowed('paused: signed out still gets the event document (paused page)', anon.doc('events/E').get());
  await denied('paused: signed out — no copy', anon.collection('pubsnap/E/parts').get());
  await denied('paused: signed out — no brackets', anon.collection('live/E/brackets').get());
  await denied('paused: signed out — no ring boards', anon.collection('live/E/ringstate').get());
  await denied('paused: signed-in non-team — no copy', view.doc('pubsnap/E').get());
  await allowed('paused: director reads and writes as usual', dir.collection('events/E/competitors').get());
  await allowed('paused: ring manager reads brackets', mgr.collection('live/E/brackets').get());
  await allowed('paused: ring manager updates the manifest', patch(mgr, 'pubsnap/E', 'v', { 'b~D': 'x3' }));
  await env.withSecurityRulesDisabled(c => c.firestore().doc('events/E').update({ pubPaused: false }));
  await allowed('resumed: signed out reads the copy again', anon.collection('pubsnap/E/parts').get());
  // not live / not shared
  await env.withSecurityRulesDisabled(c => c.firestore().doc('events/E').update({ live: false }));
  await denied('before Go live: no copy', anon.collection('pubsnap/E/parts').get());
  await allowed('before Go live: event document (waiting page)', anon.doc('events/E').get());
  await env.withSecurityRulesDisabled(c => c.firestore().doc('events/E').update({ live: true, public: false }));
  await denied('sharing off: no event document', anon.doc('events/E').get());
  await denied('sharing off: no copy', anon.doc('pubsnap/E').get());
  // archived
  await env.withSecurityRulesDisabled(c => c.firestore().doc('events/E').update({ public: true, locked: true }));
  await denied('archived: director cannot change the copy', patch(dir, 'pubsnap/E/parts/competitors~0', 'd', { C: null }));
  // the website function (api/live.js) against the emulator's REST API, signed out like on Vercel
  await seed({ pubPaused: false, locked: false });
  await env.withSecurityRulesDisabled(c => c.firestore().doc('share/t1').set({ eventId: 'E' }));
  await env.withSecurityRulesDisabled(c => c.firestore().doc('live/E/brackets/D').set({ format: 'SE', n: 2, f: 7.25, ok: true, none: null, list: [1, 'a', { x: [] }], m: { a: { b: 1 } } }));
  process.env.FIREBASE_PROJECT_ID = 'demo-kt'; process.env.FIREBASE_API_KEY = 'fake';
  const live = require('../api/live.js'); live._reset();
  const { callLive } = require('./fakerest');
  let r = JSON.parse((await callLive(live.handler, '/api/live?t=t1')).body);
  ok('function: live bundle from the emulator', r.ok === 1 && r.state === 'live' && r.ev.name === 'Open' && r.v['p~competitors~0'] === 'a' && r.rs.R.did === 'D');
  r = JSON.parse((await callLive(live.handler, '/api/live?t=t1&k=b~D&v=1')).body);
  ok('function: real REST values decoded', r.d.format === 'SE' && r.d.n === 2 && r.d.f === 7.25 && r.d.ok === true && r.d.none === null && JSON.stringify(r.d.list) === '[1,"a",{"x":[]}]' && r.d.m.a.b === 1);
  r = JSON.parse((await callLive(live.handler, '/api/live?t=t1&k=p~competitors~0&v=1')).body);
  ok('function: a part', r.ok === 1 && r.d.d.C.firstName === 'Ana');
  await env.withSecurityRulesDisabled(c => c.firestore().doc('events/E').update({ pubPaused: true }));
  r = JSON.parse((await callLive(live.handler, '/api/live?t=t1')).body);
  ok('function: paused', r.ok === 0 && r.state === 'paused');
  const r2 = await callLive(live.handler, '/api/live?t=t1&k=p~competitors~0&v=2');
  ok('function: paused — the rules refuse the part (403)', r2.status === 403);
  await env.cleanup();
  console.log(`${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
