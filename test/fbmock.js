(function(){
  const KEY='fbmock', load=()=>JSON.parse(localStorage.getItem(KEY)||'{}'), save=d=>localStorage.setItem(KEY,JSON.stringify(d));
  const subs=new Set(); const fire=()=>setTimeout(()=>subs.forEach(f=>f()),1);
  window.addEventListener('storage',e=>{ if(e.key===KEY) fire(); });
  const merge=(t,p)=>{for(const k in p){const v=p[k]; if(v&&typeof v==='object'&&!Array.isArray(v)&&t[k]&&typeof t[k]==='object'&&!Array.isArray(t[k]))merge(t[k],v); else t[k]=v;} return t;};
  const uid=()=>sessionStorage.getItem('fbuid');
  // simplified mirror of firestore.rules (v1.9 per-event access)
  const role=d=>(d['roles/'+uid()]||{}).role||'';
  const isDir=d=>['director','admin'].includes(role(d));
  const isOrg=d=>isDir(d)||role(d)==='organizer';
  const em=()=>uid()?uid()+'@x.test':'';
  const inv=d=>d['invites/'+em()];
  const ev=(d,e)=>d['events/'+e]||{};
  const evDir=(d,e)=>isDir(d)||(!!uid()&&(ev(d,e).directorIds||[]).includes(uid()));
  const evMem=(d,e)=>evDir(d,e)||(!!uid()&&((ev(d,e).managerIds||[]).includes(uid())||(ev(d,e).staffIds||[]).includes(uid())));
  const evOf=p=>{const m=/^(?:events|live|pv)\/([^/]+)/.exec(p); return m?m[1]:null;};
  const canWrite=(p,d,v)=>{
    if(p.startsWith('users/'))return p==='users/'+uid();
    if(p.startsWith('meta/')||p.startsWith('roles/'))return true;
    if(p.startsWith('orgRequests/'))return p==='orgRequests/'+uid()||isDir(d);
    if(p.startsWith('invites/'))return !!uid();
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
  const auth={ onAuthStateChanged(cb){ setTimeout(()=>cb(uid()?{uid:uid(),displayName:'User '+uid(),email:uid()+'@x.test',photoURL:''}:null),5); return ()=>{}; },
    async signInWithPopup(){ sessionStorage.setItem('fbuid', sessionStorage.getItem('nextuid')||'u1'); }, async signOut(){ sessionStorage.removeItem('fbuid'); } };
  window.firebase={ initializeApp(){}, auth: Object.assign(()=>auth,{GoogleAuthProvider:function(){}}), firestore:()=>fs };
  window.KT_FIREBASE_CONFIG={projectId:'mock'};
})();
