(function(){
  const KEY='fbmock', load=()=>JSON.parse(localStorage.getItem(KEY)||'{}'), save=d=>localStorage.setItem(KEY,JSON.stringify(d));
  const subs=new Set(); const fire=()=>setTimeout(()=>subs.forEach(f=>f()),1);
  window.addEventListener('storage',e=>{ if(e.key===KEY) fire(); });
  const merge=(t,p)=>{for(const k in p){const v=p[k]; if(v&&typeof v==='object'&&!Array.isArray(v)&&t[k]&&typeof t[k]==='object'&&!Array.isArray(t[k]))merge(t[k],v); else t[k]=v;} return t;};
  const rawUid=()=>sessionStorage.getItem('fbuid');
  const uid=()=>{ const u=rawUid(); if(!u) return null; const d=JSON.parse(localStorage.getItem(KEY)||'{}'); return d['blocked/'+u]?null:u; };   // blocked = signed out (v1.21 rules)
  // simplified mirror of firestore.rules (v1.9 per-event access)
  const role=d=>(d['roles/'+uid()]||{}).role||'';
  const isDir=d=>['director','admin'].includes(role(d));
  const isOrg=d=>isDir(d)||role(d)==='organizer';
  const A_KEY='fbmock_auth', accts=()=>JSON.parse(localStorage.getItem(A_KEY)||'{}'), saveA=a=>localStorage.setItem(A_KEY,JSON.stringify(a));
  const em=()=>{ if(!uid()) return ''; const e=sessionStorage.getItem('fbemail'); if(!e) return uid()+'@x.test'; const a=accts()[e]; return a&&a.verified?e:''; };   // unverified email accounts: no invitations
  const inv=d=>d['invites/'+em()];
  const ev=(d,e)=>d['events/'+e]||{};
  const evDir=(d,e)=>isDir(d)||(!!uid()&&(ev(d,e).directorIds||[]).includes(uid()));
  const evMem=(d,e)=>evDir(d,e)||(!!uid()&&((ev(d,e).managerIds||[]).includes(uid())||(ev(d,e).staffIds||[]).includes(uid())));
  const evOf=p=>{const m=/^(?:events|live|pv)\/([^/]+)/.exec(p); return m?m[1]:null;};
  const canWrite=(p,d,v)=>{
    if(p.startsWith('users/'))return p==='users/'+uid();
    if(p.startsWith('meta/'))return true;
    if(p.startsWith('roles/')){ if(isDir(d))return true; if(p!=='roles/'+uid()||d[p])return false; if(v&&v.role==='director'&&!d['meta/bootstrap'])return true; const i=inv(d); return !!(v&&v.role==='organizer'&&i&&i.scope==='app'&&i.role==='organizer'); }
    if(p.startsWith('orgRequests/'))return p==='orgRequests/'+rawUid()||isDir(d);
    if(p.startsWith('blocked/'))return isDir(d);
    if(p.startsWith('invites/')){ if(v&&v.scope==='app')return isDir(d); return !!uid(); }
    if(p.startsWith('share/'))return !!uid();
    let m=/^events\/([^/]+)$/.exec(p);
    if(m){ if(!d[p]) return isOrg(d)&&v&&(v.directorIds||[]).includes(uid()); if(evDir(d,m[1]))return true; const i=inv(d); return !!(i&&i.eventId===m[1]); }
    m=/^events\/([^/]+)\/requests\/([^/]+)$/.exec(p); if(m) return m[2]===uid()||evDir(d,m[1]);
    m=/^events\/([^/]+)\/rings\/([^/]+)$/.exec(p); if(m){ const i=inv(d); if(!evDir(d,m[1])&&i&&i.role==='manager'&&i.eventId===m[1]&&i.ringId===m[2]) return true; }
    const e=evOf(p); if(!e) return false;
    if(ev(d,e).locked===true) return false; // archived: read-only
    if(p.startsWith('live/'))return evMem(d,e);
    return evDir(d,e);
  };
  const canRead=(p,d)=>{
    if(p.startsWith('blocked/'))return isDir(d)||p==='blocked/'+rawUid();
    if(p.startsWith('share/'))return true;
    const e=evOf(p);
    if(!uid()){ return !!(e&&ev(d,e).public===true&&!p.startsWith('pv/')); }
    if(/^events\/[^/]+$/.test(p)||!e)return true;
    if(p.startsWith('pv/'))return evDir(d,e);
    if(/^events\/[^/]+\/requests\/([^/]+)$/.test(p))return evDir(d,e)||p.endsWith('/'+uid());
    return evMem(d,e)||ev(d,e).public===true;
  };
  const canList=(col,d)=>{ if(uid())return canRead(col+'/x',d)||col==='events'||col==='users'||col==='roles'||col==='invites'||col==='orgRequests'; if(col==='events'||col==='share')return false; return canRead(col+'/x',d); };
  const deny=()=>Promise.reject({code:'permission-denied',message:'denied'});
  const snap=(k,v)=>({id:k.split('/').pop(),exists:!!v,data:()=>v&&JSON.parse(JSON.stringify(v))});
  const q=(col,filt)=>({
    onSnapshot(n,err){const f=()=>{const d=load(); if(!canList(col,d)){ if(err)err({code:'permission-denied'}); return;} const docs=Object.keys(d).filter(k=>k.split('/').slice(0,-1).join('/')===col&&canRead(k,d)&&(!filt||d[k][filt[0]]===filt[1])).map(k=>snap(k,d[k])); n({docs});}; subs.add(f); setTimeout(f,5); return ()=>subs.delete(f);},
    async get(){const d=load(); if(!canList(col,d)) throw {code:'permission-denied'}; return {docs:Object.keys(d).filter(k=>k.split('/').slice(0,-1).join('/')===col&&canRead(k,d)&&(!filt||d[k][filt[0]]===filt[1])).map(k=>snap(k,d[k]))};},
    where(f,op,v){ return q(col,[f,v]); },
  });
  const fs={
    settings(){}, collection(col){ return q(col); },
    doc(p){ return { async get(){const d=load(); if(!canRead(p,d)) throw {code:'permission-denied'}; return snap(p,d[p]);},
      onSnapshot(n,err){const f=()=>{const d=load(); if(!canRead(p,d)){ if(err)err({code:'permission-denied'}); return;} n(snap(p,d[p]));}; subs.add(f); setTimeout(f,5); return ()=>subs.delete(f);},
      async set(v,o){const d=load(); const nv=o&&o.merge&&d[p]?merge(JSON.parse(JSON.stringify(d[p])),JSON.parse(JSON.stringify(v))):JSON.parse(JSON.stringify(v)); if(!canWrite(p,d,nv))return deny(); d[p]=nv; save(d); fire();},
      async delete(){const d=load(); if(!canWrite(p,d))return deny(); delete d[p]; save(d); fire();} }; },
    batch(){ const ops=[]; return { set(ref,v){ops.push([ref,v]);}, async commit(){ for(const [r,v] of ops) await r.set(v);} }; },
  };
  const userObj=()=>{ const u=rawUid(); if(!u) return null; const e=sessionStorage.getItem('fbemail');
    if(!e) return {uid:u,displayName:'User '+u,email:u+'@x.test',photoURL:'',emailVerified:true,providerData:[{providerId:'google.com'}]};
    const a=accts()[e]||{}; return {uid:u,displayName:'',email:e,photoURL:'',emailVerified:!!a.verified,providerData:[{providerId:'password'}],
      async reload(){}, async getIdToken(){ return 't'; }, async sendEmailVerification(){ const m=JSON.parse(localStorage.getItem('fbmock_mail')||'[]'); m.push({type:'verify',email:e}); localStorage.setItem('fbmock_mail',JSON.stringify(m)); } }; };
  const auth={ onAuthStateChanged(cb){ setTimeout(()=>cb(userObj()),5); return ()=>{}; },
    get currentUser(){ return userObj(); },
    async signInWithPopup(){ sessionStorage.setItem('fbuid', sessionStorage.getItem('nextuid')||'u1'); sessionStorage.removeItem('fbemail'); },
    async signOut(){ sessionStorage.removeItem('fbuid'); sessionStorage.removeItem('fbemail'); },
    async createUserWithEmailAndPassword(e,pw){ if(window.__mockSignupOff) throw {code:'auth/operation-not-allowed'}; const a=accts(); if(a[e]) throw {code:'auth/email-already-in-use'}; a[e]={uid:'e_'+e.split('@')[0].replace(/\W/g,''),pw,verified:false}; saveA(a); sessionStorage.setItem('fbuid',a[e].uid); sessionStorage.setItem('fbemail',e); },
    async signInWithEmailAndPassword(e,pw){ const a=accts()[e]; if(!a||a.pw!==pw) throw {code:'auth/invalid-credential'}; sessionStorage.setItem('fbuid',a.uid); sessionStorage.setItem('fbemail',e); },
    async sendPasswordResetEmail(e,opts){ if(window.__mockAuthFail){ throw {code:window.__mockAuthFail}; } const m=JSON.parse(localStorage.getItem('fbmock_mail')||'[]'); m.push({type:'reset',email:e,url:opts&&opts.url||''}); localStorage.setItem('fbmock_mail',JSON.stringify(m)); } };
  // test helpers: the person opens the emailed link (choose a password / confirm the address)
  window.__mockResetPassword=(e,pw,verify)=>{ const a=accts(); if(!a[e]) return false; a[e].pw=pw; if(verify) a[e].verified=true; saveA(a); return true; };
  window.__mockVerify=e=>{ const a=accts(); if(a[e]){ a[e].verified=true; saveA(a); } };
  window.firebase={ initializeApp(){}, auth: Object.assign(()=>auth,{GoogleAuthProvider:function(){ this.setCustomParameters=function(o){ sessionStorage.setItem('fbprompt', o && o.prompt || ''); }; }}), firestore:()=>fs };
  window.KT_FIREBASE_CONFIG={projectId:'mock'};
})();
