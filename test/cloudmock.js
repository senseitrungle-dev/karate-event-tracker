// Injected mock of window.claude with db rules: root write admin, live write interact, pv read/write admin.
(function () {
  const role = sessionStorage.getItem('mockRole') || new URLSearchParams(location.search).get('role') || 'admin';
  // 'editor' / 'editor2' = people shared as Editor from outside (admin level, not the owner); editor has an email the app can see
  const uidv = role === 'admin' ? 'u_director' : role === 'interact' ? 'u_manager' : role === 'editor' ? 'u_editor' : role === 'editor2' ? 'u_ed2' : 'u_viewer';
  const isEd = role === 'admin' || role === 'editor' || role === 'editor2';
  const KEY = 'mockdb';
  const load = () => JSON.parse(localStorage.getItem(KEY) || '{}');
  const save = d => localStorage.setItem(KEY, JSON.stringify(d));
  const subs = new Set();
  const canRead = p => !((p.startsWith('pv/') || p.startsWith('invites/')) && !isEd);
  const canWrite = p => isEd || (role === 'interact' && p.startsWith('live/'));
  const fire = () => subs.forEach(f => f());
  window.addEventListener('storage', e => { if (e.key === KEY) fire(); });
  const deepFreeze = o => { if (o && typeof o === 'object') { Object.values(o).forEach(deepFreeze); Object.freeze(o); } return o; };
  const merge = (t, p) => { for (const k in p) { const v = p[k]; if (v && typeof v === 'object' && !Array.isArray(v) && t[k] && typeof t[k] === 'object' && !Array.isArray(t[k])) merge(t[k], v); else t[k] = v; } return t; };
  const rej = (code) => Promise.reject({ code, message: code });
  const db = {
    collection(path) {
      if (path.split('/').length % 2 === 0) throw new TypeError('parity');
      return {
        onSnapshot(next) {
          const f = () => { const d = load(); const docs = Object.keys(d).filter(k => k.split('/').slice(0, -1).join('/') === path && canRead(k)).map(k => ({ id: k.split('/').pop(), exists: true, data: () => deepFreeze(JSON.parse(JSON.stringify(d[k]))) })); next({ docs, size: docs.length, empty: !docs.length }); };
          subs.add(f); setTimeout(f, 5); return () => subs.delete(f);
        },
      };
    },
    doc(path) {
      if (path.split('/').length % 2) throw new TypeError('parity');
      return {
        onSnapshot(next) { const f = () => { const d = load(); next(canRead(path) && d[path] ? { id: path.split('/').pop(), exists: true, data: () => deepFreeze(JSON.parse(JSON.stringify(d[path]))) } : { id: path.split('/').pop(), exists: false, data: () => undefined }); }; subs.add(f); setTimeout(f, 5); return () => subs.delete(f); },
        async get() { const d = load(); return canRead(path) && d[path] ? { exists: true, data: () => d[path] } : { exists: false, data: () => undefined }; },
        async set(v) { if (!canWrite(path)) return rej('invalid_argument'); const d = load(); d[path] = JSON.parse(JSON.stringify(v)); save(d); setTimeout(fire, 1); },
        async update(v) { if (!canWrite(path)) return rej('invalid_argument'); const d = load(); if (!d[path]) return rej('invalid_argument'); merge(d[path], JSON.parse(JSON.stringify(v))); save(d); setTimeout(fire, 1); },
        async delete() { if (!canWrite(path)) return rej('invalid_argument'); const d = load(); delete d[path]; save(d); setTimeout(fire, 1); },
      };
    },
  };
  const people = { u_director: 'Dana Director', u_manager: 'Manny Manager', u_viewer: 'Vic Viewer', u_editor: 'Eddie Editor', u_ed2: 'Erin Outside' };
  const emails = {}; // claude.ai does not give the page anyone's email
  const prof = id => ({ id, name: people[id] || '', avatarUrl: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', color: '#888', email: id === uidv ? (emails[id] || null) : null, isMe: id === uidv, guest: id === 'u_editor' || id === 'u_ed2' });
  const user = {
    isOwner: async () => role === 'admin', canEdit: async () => isEd, can: async () => role !== 'view',
    me: async () => Object.assign(prof(uidv), { isOwner: role === 'admin', canEdit: isEd }), id: async () => uidv,
    profiles: async ids => Object.fromEntries([].concat(ids).map(i => [i, prof(i)])),
    // claude.ai search covers the owner's organization only: outside guests (editors) are never found
    search: async q => Object.keys(people).filter(i => !['u_editor', 'u_ed2'].includes(i) && people[i].toLowerCase().includes(q.toLowerCase())).map(prof),
  };
  window.claude = { use: async n => (n === 'db' ? db : n === 'user' ? user : null) };
})();
