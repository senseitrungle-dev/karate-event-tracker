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
  // v1.22: email + password accounts must confirm their email before they can use invitations or roles
  if (isPwUser(user) && !user.emailVerified) { const cl = await FB.fs.doc('claims/' + user.uid).get().catch(() => null); if (cl && cl.exists) FB.claimed = true; }
  if (isPwUser(user) && !user.emailVerified && !FB.claimed) { try { if (!sessionStorage.getItem('kt-verify-sent')) { sessionStorage.setItem('kt-verify-sent', '1'); await user.sendEmailVerification(); } } catch (e) { /* resend button */ } FB.needVerify = true; S.store = { mode: 'firebase' }; S.myEmail = String(user.email || '').toLowerCase(); render(); return false; }
  { const bl = await FB.fs.doc('blocked/' + user.uid).get().catch(() => null); S.blocked = !!(bl && bl.exists); }   // v1.21: access removed by the app admin
  if (S.blocked) { S.store = FirestoreStore(FB.fs); S.myId = user.uid; S.myEmail = String(user.email || '').toLowerCase(); S.myName = user.displayName || ''; return true; }
  await FB.fs.doc('users/' + user.uid).set({ name: user.displayName || nameFromEmail(user.email), email: user.email || '', photo: user.photoURL || '', seenAt: new Date().toISOString() }, { merge: true }).catch(() => {});
  const roleDoc = await FB.fs.doc('roles/' + user.uid).get().catch(() => null);
  const rl = roleDoc && roleDoc.exists ? roleDoc.data().role : '';
  S.isAdmin = rl === 'director' || rl === 'admin'; S.isOrganizer = S.isAdmin || rl === 'organizer';
  if (!S.isAdmin) { const b = await FB.fs.doc('meta/bootstrap').get().catch(() => null); FB.bootstrapOpen = !(b && b.exists); }
  S.store = FirestoreStore(FB.fs); S.user = fbUserShim(FB.fs); S.myId = user.uid; S.canWrite = null; S.myEmail = String(user.email || '').toLowerCase();
  return true;
}
/* ---------- v1.22: email + password sign-in (any email provider, not only Google) ---------- */
function isPwUser(u) { return !!(u && (u.providerData || []).some(p => p && p.providerId === 'password')); }
function nameFromEmail(e) { const n = String(e || '').split('@')[0].replace(/[._-]+/g, ' ').trim(); return n ? n.replace(/\b\w/g, c => c.toUpperCase()) : ''; }
function fbEmailVal() { return String(($('#fb-email') || {}).value || '').trim().toLowerCase(); }
async function fbEmailSignIn() {
  const email = fbEmailVal(), pw = String(($('#fb-pw') || {}).value || '');
  FB.lastEmail = email;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setAuthMsg({ bad: true, text: 'Enter your email address.' }); return; }
  if (!pw) { setAuthMsg({ bad: true, text: 'Enter your password — first time? Tap “First time? Use your invitation code”.' }); return; }
  try { await FB.auth.signInWithEmailAndPassword(email, pw); location.reload(); }
  catch (e) { console.error(e); setAuthMsg({ bad: true, text: fbAuthHelp(e), code: (e && e.code) || '' }); }
}
/** First use or forgotten password: make sure the account exists, then email a link to choose a password. */
/** Forgot password: Firebase emails a reset link — only for an account that already exists (no account is created). */
async function fbForgotPassword() {
  const email = fbEmailVal(); FB.lastEmail = email;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setAuthMsg({ bad: true, text: 'Enter your email address first, then tap “Forgot your password?”.' }); return; }
  if (FB.resetAt && Date.now() - FB.resetAt < 30000 && FB.resetSent === email) { setAuthMsg({ bad: true, text: 'An email was just sent — wait 30 seconds before asking again.' }); return; }
  setAuthMsg({ text: 'Sending…' });
  try {
    const back = { url: location.origin + location.pathname, handleCodeInApp: false };
    try { await FB.auth.sendPasswordResetEmail(email, back); }
    catch (e) { if (e && /continue-uri|unauthorized-continue|invalid-continue/.test(e.code || '')) await FB.auth.sendPasswordResetEmail(email); else throw e; }
    FB.resetSent = email; FB.resetAt = Date.now(); FB.authMsg = null; render();
  } catch (e) { console.error('[auth] reset failed', e); setAuthMsg({ bad: true, text: fbAuthHelp(e), code: (e && e.code) || '' }); }
}
/** Show a sign-in message in place — the typed fields stay as they are. */
function authMsgInner(m) { return `${esc(m.text)}${m.code ? ` <span class="tiny" style="display:block;margin-top:4px;opacity:.8">Code: ${esc(m.code)}</span>` : ''}`; }
function setAuthMsg(m) {
  FB.authMsg = m; const el = $('#auth-msg');
  if (!el) { render(); return; }
  el.hidden = !m; el.classList.toggle('bad', !!(m && m.bad)); el.innerHTML = m ? authMsgInner(m) : '';
}
/** v1.24: SHA-256 of "email:CODE" — the public key of an invitation code (the code itself is never stored readable). */
async function codeHash(email, code) {
  const data = new TextEncoder().encode(String(email).trim().toLowerCase() + ':' + String(code).trim().toUpperCase().replace(/[^A-Z0-9]/g, ''));
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), b => b.toString(16).padStart(2, '0')).join('');
}
/** First time: only someone holding an invitation code for this email can create an email + password account. */
async function fbCreateWithCode() {
  const email = fbEmailVal(); FB.lastEmail = email;
  const code = String(($('#fb-code') || {}).value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  const pw = String(($('#fb-newpw') || {}).value || ''), pw2 = String(($('#fb-newpw2') || {}).value || '');
  const fail = t => setAuthMsg({ bad: true, text: t });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Enter the email address the invitation was sent to.');
  if (code.length < 6) return fail('Enter the invitation code from your invitation email.');
  if (pw.length < 8) return fail('Choose a password of at least 8 characters.');
  if (pw !== pw2) return fail('The two passwords are different.');
  setAuthMsg({ text: 'Checking your invitation…' });
  try {
    const h = await codeHash(email, code);
    const inv = await FB.fs.doc('invcodes/' + h).get().catch(() => null);
    if (!inv || !inv.exists) return fail('That invitation code doesn’t match this email address. Check both against your invitation email, or ask the tournament director for a new invitation.');
    try { await FB.auth.createUserWithEmailAndPassword(email, pw); }
    catch (e) {
      if (e && e.code === 'auth/email-already-in-use') return fail('An account already exists for this email. Sign in with your password above, or use “Forgot your password?”. If you never chose a password, ask the app admin to delete the old account (Firebase → Authentication → Users) and try again.');
      throw e;
    }
    const u = FB.auth.currentUser;
    await FB.fs.doc('claims/' + u.uid).set({ email, h, at: new Date().toISOString() });   // proves the address (the code came by email)
    location.reload();
  } catch (e) { console.error('[auth] create with code failed', e); setAuthMsg({ bad: true, text: fbAuthHelp(e), code: (e && e.code) || '' }); }
}
async function fbResendVerify() { try { await FB.auth.currentUser.sendEmailVerification(); toast('Verification email sent'); } catch (e) { toast(fbAuthHelp(e), true); } }
async function fbVerifiedContinue() { try { await FB.auth.currentUser.reload(); } catch (e) { /* ignore */ } if (FB.auth.currentUser && FB.auth.currentUser.emailVerified) { try { await FB.auth.currentUser.getIdToken(true); } catch (e) { /* ignore */ } location.reload(); } else toast('Not verified yet — open the link in the email first.', true); }
function fbVerifyHTML() {
  return `<div class="card empty" style="margin-top:40px" id="verify-card"><div class="mark-lg"></div><h2>Confirm your email</h2>
    <p class="muted" style="max-width:52ch">Before you can use the tracker, confirm that <b>${esc(S.myEmail || '')}</b> is yours: open the link we emailed you (check spam), then come back here.</p>
    <div class="row" style="justify-content:center;flex-wrap:wrap"><button class="primary" data-act="fb-verified">I’ve confirmed — continue</button><button data-act="fb-verify-resend">Send the email again</button><button class="ghost" data-act="fb-signout">Sign out</button></div></div>`;
}
/** Plain-language reasons for the usual Google sign-in failures. */
function fbAuthHelp(e, via) {
  const c = (e && e.code) || '', host = location.hostname;
  if (/api-key-not-valid|invalid-api-key/.test(c)) return 'Sign-in failed: the Firebase API key is not valid. Check vercel/firebase-config.js (window.KT_FIREBASE_CONFIG) has your project\'s real values.';
  if (c === 'auth/unauthorized-domain') return `Sign-in failed: ${host} is not authorized. Firebase → Authentication → Settings → Authorized domains → add ${host} (no https://).`;
  if (c === 'auth/operation-not-allowed' && via === 'google') return 'Sign-in failed: Google sign-in is turned off. Firebase → Authentication → Sign-in method → enable Google.';
  if (c === 'auth/operation-not-allowed') return 'Email and password sign-in is turned off for this site. App admin: Firebase console → Authentication → Sign-in method → Email/Password → Enable → Save.';
  if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return 'Email or password is not right. First time? Use your invitation code. Forgot it? Tap “Forgot your password?”.';
  if (c === 'auth/admin-restricted-operation') return 'New accounts are switched off. Firebase → Authentication → Settings → User actions → turn on “Enable create (sign-up)”.';
  if (c === 'auth/network-request-failed') return 'No connection to Firebase — check the internet connection and try again.';
  if (c === 'auth/quota-exceeded') return 'Firebase’s daily email limit was reached — try again tomorrow.';
  if (c === 'auth/missing-email') return 'Enter your email address first.';
  if (c === 'auth/too-many-requests') return 'Too many tries — wait a few minutes and try again.';
  if (c === 'auth/invalid-email') return 'That email address doesn’t look right.';
  if (c === 'auth/popup-blocked') return 'The sign-in window was blocked. Allow pop-ups for this site and try again.';
  if (c === 'auth/popup-closed-by-user' || c === 'auth/cancelled-popup-request') return 'Sign-in window closed before finishing.';
  if (/requests-from-referer|referer/.test(c + (e && e.message))) return `Sign-in failed: the API key's website restrictions block this site. Google Cloud → Credentials → Browser key → allow ${host}/* and ${(window.KT_FIREBASE_CONFIG || {}).authDomain}/*.`;
  return 'Sign-in failed: ' + ((e && (e.code || e.message)) || 'unknown error');
}
/** Google always shows the account chooser, so a different account can be picked after signing out. */
function fbProvider() { const pr = new firebase.auth.GoogleAuthProvider(); if (pr.setCustomParameters) pr.setCustomParameters({ prompt: 'select_account' }); return pr; }
async function fbSignIn() { try { await FB.auth.signInWithPopup(fbProvider()); location.reload(); } catch (e) { console.error(e); toast(fbAuthHelp(e, 'google'), true); } }
/** True when firebase-config.js still has the example placeholders. */
/** True on a real web host (not a local file or a development host), where local mode would hide the real database. */
function hostedSite() { const h = location.hostname; return /^https?:$/.test(location.protocol) && !!h && !/^(localhost|127\.0\.0\.1|\[::1\])$|\.(localhost|test)$/.test(h); }
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
  return `<span class="bar-mail" title="Signed in as ${esc(FB.user.email || '')}">${esc(FB.user.email || '')}</span><button class="sm ghost" style="color:#fff" data-act="fb-signout" title="${esc(FB.user.email || '')}">Sign out</button>`;
}
function fbHomeBits() {
  if (!FB.on) return '';
  let h = '';
  if (FB.bootstrapOpen && !S.isAdmin) h += `<div class="card stack"><h3>Set up this tracker</h3><p class="small muted">No director has been set up yet. The first person to claim the role becomes the tournament director and can add other directors later.</p><div><button class="primary" data-act="fb-claim">Become director</button></div></div>`;
  if (S.isAdmin) h += `<div class="row" style="margin-bottom:10px"><button class="sm" data-act="fb-access">Manage access</button></div>`;
  return h;
}
function fbSignInHTML() {
  if (FB.needVerify) return fbVerifyHTML();
  const bad = fbConfigBad(window.KT_FIREBASE_CONFIG), dis = bad ? 'disabled' : '';
  return `<div class="card stack signin-card" style="margin:40px auto 0;max-width:460px"><div class="mark-lg" style="margin:0 auto"></div><h2 style="text-align:center">Sign in</h2>
    <p class="muted" style="text-align:center">For tournament directors and ring managers. What you can do depends on the role you were given.</p>
    ${bad ? `<p class="notice bad small" id="cfg-bad">This site is not connected to your Firebase project yet: <b>vercel/firebase-config.js</b> is missing or still has the example values, so no events or people can be shown (they are safe in Firebase). Set <code>window.KT_FIREBASE_CONFIG</code> to your web app config (Firebase → Project settings → Your apps), commit and push.</p>` : ''}
    <button class="primary" data-act="fb-signin" ${dis}>Sign in with Google</button>
    <p class="tiny muted" style="text-align:center;margin-top:-4px">Gmail and Google Workspace accounts</p>
    <div class="or-line"><span>or with any email</span></div>
    <label class="f"><span>Email</span><input id="fb-email" type="email" autocomplete="username" placeholder="name@example.com" value="${esc(FB.resetSent || FB.lastEmail || '')}" ${dis}></label>
    <label class="f"><span>Password</span><input id="fb-pw" type="password" autocomplete="current-password" ${dis}></label>
    <button class="go" data-act="fb-email-signin" ${dis}>Sign in with email</button>
    <p style="display:block;overflow-wrap:anywhere" class="notice small ${FB.authMsg && FB.authMsg.bad ? 'bad' : ''}" id="auth-msg" role="status" ${FB.authMsg ? '' : 'hidden'}>${FB.authMsg ? authMsgInner(FB.authMsg) : ''}</p>
    ${FB.resetSent ? `<div class="notice small" id="reset-sent" role="status" style="display:block;overflow-wrap:anywhere"><b>Reset email sent to ${esc(FB.resetSent)}.</b> It comes from <b>noreply@${esc(((window.KT_FIREBASE_CONFIG || {}).authDomain) || 'firebaseapp.com')}</b> — look in Spam / Junk too. Some providers (e.g. Comcast) block these emails: if nothing arrives, ask the app admin.</div>` : ''}
    <div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:6px"><button class="ghost sm" data-act="fb-first" ${dis}>First time? Use your invitation code</button><button class="ghost sm" data-act="fb-forgot" ${dis}>Forgot your password?</button></div>
    ${FB.firstTime ? `<div class="stack first-time" id="first-time"><div class="label">Set your password with your invitation code</div>
      <p class="tiny muted">Only people who were invited can create a password. Use the email address and the code from your invitation email.</p>
      <label class="f"><span>Invitation code</span><input id="fb-code" autocomplete="one-time-code" placeholder="e.g. K7M2QX9PAD" style="text-transform:uppercase" ${dis}></label>
      <label class="f"><span>New password (8+ characters)</span><input id="fb-newpw" type="password" autocomplete="new-password" ${dis}></label>
      <label class="f"><span>New password again</span><input id="fb-newpw2" type="password" autocomplete="new-password" ${dis}></label>
      <button class="primary" data-act="fb-create" ${dis}>Create my password and sign in</button></div>` : ''}
    <p class="small spect-note" style="text-align:center">Spectators don’t sign in — open the event’s public link from the tournament director.</p></div>`;
}
