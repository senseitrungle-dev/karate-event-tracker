/* ===== Firebase (Firestore + Google sign-in) — used by the Vercel build ===== */
const FB = { on: false, auth: null, fs: null, user: null, needSignIn: false, bootstrapOpen: false, users: null, usersAt: 0, cache: {} };
function fbErr(e) {
  const c = e && e.code;
  if (c === 'permission-denied') return { code: 'invalid_argument', message: 'You do not have permission to change this.' };
  if (c === 'resource-exhausted') return { code: 'resource_exhausted', message: e.message };
  if (c === 'unavailable' || c === 'deadline-exceeded') return { code: 'unavailable', message: e.message };
  return e;
}
function FirestoreStore(fs) {
  const chain = {};
  const run = (p, fn) => { const next = (chain[p] || Promise.resolve()).catch(() => {}).then(fn); chain[p] = next; return next; };
  const wrap = pr => pr.catch(e => { throw fbErr(e); });
  return {
    mode: 'firebase',
    watch(col, cb, onErr) {
      return fs.collection(col).onSnapshot(s => { const o = {}; s.docs.forEach(d => { o[d.id] = Object.assign({}, d.data(), { id: d.id }); }); cb(o); }, e => { if (onErr) onErr(fbErr(e)); });
    },
    watchWhere(col, field, val, cb, onErr) {
      return fs.collection(col).where(field, '==', val).onSnapshot(s => { const o = {}; s.docs.forEach(d => { o[d.id] = Object.assign({}, d.data(), { id: d.id }); }); cb(o); }, e => { if (onErr) onErr(fbErr(e)); });
    },
    set: (p, d) => run(p, () => wrap(fs.doc(p).set(d))),
    // Firestore update() replaces nested maps; set(merge) deep-merges like the claude.ai store
    update: (p, d) => run(p, () => wrap(fs.doc(p).set(d, { merge: true }))),
    del: p => run(p, () => wrap(fs.doc(p).delete())),
    async get(p) { const s = await fs.doc(p).get(); return s.exists ? s.data() : null; },
    watchDoc(p, cb, onErr) { return fs.doc(p).onSnapshot(s => cb(s.exists ? s.data() : null), e => { if (onErr) onErr(fbErr(e)); }); },
  };
}
function fbUserShim(fs) {
  const toProfile = (id, u) => ({ id, name: (u && (u.name || u.email)) || '', avatarUrl: (u && u.photo) || '', email: (u && u.email) || null, isMe: id === FB.user.uid, guest: false });
  return {
    async profiles(ids) {
      const out = {};
      await Promise.all([].concat(ids).map(async id => {
        if (!(id in FB.cache)) { try { const s = await fs.doc('users/' + id).get(); FB.cache[id] = s.exists ? s.data() : null; } catch (e) { FB.cache[id] = null; } }
        out[id] = toProfile(id, FB.cache[id]);
      }));
      return out;
    },
    async search(q) {
      if (!FB.users || Date.now() - FB.usersAt > 3000) {
        try { const s = await fs.collection('users').get(); FB.users = s.docs.map(d => Object.assign({ id: d.id }, d.data())); FB.usersAt = Date.now(); FB.users.forEach(u => { FB.cache[u.id] = u; }); } catch (e) { FB.users = []; }
      }
      q = String(q || '').toLowerCase();
      return FB.users.filter(u => !q || (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q)).slice(0, 8).map(u => toProfile(u.id, u));
    },
  };
}
async function initFirebase(cfg) {
  firebase.initializeApp(cfg);
  FB.on = true; FB.auth = firebase.auth(); FB.fs = firebase.firestore();
  try { FB.fs.settings({ ignoreUndefinedProperties: true }); } catch (e) { /* ignore */ }
  const user = await new Promise(res => { const off = FB.auth.onAuthStateChanged(u => { off(); res(u); }); });
  if (!user && S.pub) { S.store = FirestoreStore(FB.fs); S.user = null; S.myId = null; S.readOnly = true; return true; } // public spectator link: no sign-in
  if (!user) { FB.needSignIn = true; S.store = { mode: 'firebase' }; render(); return false; }
  FB.user = user;
  await FB.fs.doc('users/' + user.uid).set({ name: user.displayName || '', email: user.email || '', photo: user.photoURL || '', seenAt: new Date().toISOString() }, { merge: true }).catch(() => {});
  const roleDoc = await FB.fs.doc('roles/' + user.uid).get().catch(() => null);
  const rl = roleDoc && roleDoc.exists ? roleDoc.data().role : '';
  S.isAdmin = rl === 'director' || rl === 'admin'; S.isOrganizer = S.isAdmin || rl === 'organizer';
  if (!S.isAdmin) { const b = await FB.fs.doc('meta/bootstrap').get().catch(() => null); FB.bootstrapOpen = !(b && b.exists); }
  S.store = FirestoreStore(FB.fs); S.user = fbUserShim(FB.fs); S.myId = user.uid; S.canWrite = null; S.myEmail = String(user.email || '').toLowerCase();
  return true;
}
/** Plain-language reasons for the usual Google sign-in failures. */
function fbAuthHelp(e) {
  const c = (e && e.code) || '', host = location.hostname;
  if (/api-key-not-valid|invalid-api-key/.test(c)) return 'Sign-in failed: the Firebase API key is not valid. Check vercel/firebase-config.js (window.KT_FIREBASE_CONFIG) has your project\'s real values.';
  if (c === 'auth/unauthorized-domain') return `Sign-in failed: ${host} is not authorized. Firebase → Authentication → Settings → Authorized domains → add ${host} (no https://).`;
  if (c === 'auth/operation-not-allowed') return 'Sign-in failed: Google sign-in is turned off. Firebase → Authentication → Sign-in method → enable Google.';
  if (c === 'auth/popup-blocked') return 'The sign-in window was blocked. Allow pop-ups for this site and try again.';
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return 'Sign-in window closed before finishing.';
  if (/requests-from-referer|referer/.test(c + (e && e.message))) return `Sign-in failed: the API key's website restrictions block this site. Google Cloud → Credentials → Browser key → allow ${host}/* and ${(window.KT_FIREBASE_CONFIG || {}).authDomain}/*.`;
  return 'Sign-in failed: ' + ((e && (e.code || e.message)) || 'unknown error');
}
async function fbSignIn() { try { await FB.auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); location.reload(); } catch (e) { console.error(e); toast(fbAuthHelp(e), true); } }
/** True when firebase-config.js still has the example placeholders. */
function fbConfigBad(cfg) { return !cfg || !cfg.projectId || /YOUR_/.test(String(cfg.apiKey || '') + String(cfg.projectId)); }
async function fbSignOut() { await FB.auth.signOut(); location.reload(); }
async function fbClaimDirector() {
  const b = FB.fs.batch();
  b.set(FB.fs.doc('roles/' + FB.user.uid), { role: 'director', at: new Date().toISOString() });
  b.set(FB.fs.doc('meta/bootstrap'), { by: FB.user.uid, at: new Date().toISOString() });
  try { await b.commit(); location.reload(); } catch (e) { toast('Someone has already set up this tracker. Ask a director for access.', true); FB.bootstrapOpen = false; render(); }
}
async function accessForm() {
  const users = await S.user.search('');
  const roles = {};
  await Promise.all(users.map(async u => { const r = await FB.fs.doc('roles/' + u.id).get().catch(() => null); roles[u.id] = r && r.exists ? r.data().role : ''; }));
  openModal(sheet('App admins', `<p class="small muted">People appear here after they sign in once. App admins can open and manage every event and approve tournament directors. Event directors and ring managers are set per event on its People tab.</p>
    <div class="stack" style="gap:6px">${users.map(u => `<label class="row between"><span>${u.avatarUrl ? `<img src="${esc(u.avatarUrl)}" alt="" width="22" height="22" style="border-radius:50%;vertical-align:middle"> ` : ''}${esc(u.name)} <span class="muted small">${esc(u.email || '')}</span></span>
      <input type="checkbox" data-change="fb-role" data-uid="${esc(u.id)}" ${roles[u.id] === 'director' ? 'checked' : ''} ${u.id === FB.user.uid ? 'disabled' : ''} aria-label="Director"></label>`).join('')}</div>`, '<button class="primary" data-act="modal-close">Done</button>'));
}
function fbBarBits() {
  if (!FB.on || !FB.user || S.pub) return '';
  return `<button class="sm ghost" style="color:#fff" data-act="fb-signout" title="${esc(FB.user.email || '')}">Sign out</button>`;
}
function fbHomeBits() {
  if (!FB.on) return '';
  let h = '';
  if (FB.bootstrapOpen && !S.isAdmin) h += `<div class="card stack"><h3>Set up this tracker</h3><p class="small muted">No director has been set up yet. The first person to claim the role becomes the tournament director and can add other directors later.</p><div><button class="primary" data-act="fb-claim">Become director</button></div></div>`;
  if (S.isAdmin) h += `<div class="row" style="margin-bottom:10px"><button class="sm" data-act="fb-access">Manage access</button></div>`;
  return h;
}
function fbSignInHTML() {
  return `<div class="card empty" style="margin-top:40px"><div class="mark-lg"></div><h2>Sign in to continue</h2><p class="muted" style="max-width:48ch">Directors, ring managers and spectators sign in with a Google account. What you can change depends on the role the tournament director gives you.</p>${fbConfigBad(window.KT_FIREBASE_CONFIG) ? `<p class="notice bad small" id="cfg-bad" style="max-width:56ch">This site is not connected to your Firebase project yet: <b>vercel/firebase-config.js</b> still has the example values. Set <code>window.KT_FIREBASE_CONFIG</code> to your web app config (Firebase → Project settings → Your apps), commit and push.</p>` : ''}<button class="primary" data-act="fb-signin" ${fbConfigBad(window.KT_FIREBASE_CONFIG) ? 'disabled' : ''}>Sign in with Google</button></div>`;
}
