(function(){
  const KEY='fbmock', load=()=>JSON.parse(localStorage.getItem(KEY)||'{}'), save=d=>localStorage.setItem(KEY,JSON.stringify(d));
  const subs=new Set(); const fire=()=>setTimeout(()=>subs.forEach(f=>f()),1);
  window.addEventListener('storage',e=>{ if(e.key===KEY) fire(); });
  const merge=(t,p)=>{for(const k in p){const v=p[k]; if(v&&typeof v==='object'&&!Array.isArray(v)&&t[k]&&typeof t[k]==='object'&&!Array.isArray(t[k]))merge(t[k],v); else t[k]=v;} return t;};
  const uid=()=>sessionStorage.getItem('fbuid');
  const isDir=d=>d['roles/'+uid()]&&d['roles/'+uid()].role==='director';
  const canWrite=(p,d)=>{ if(p.startsWith('users/'))return p==='users/'+uid(); if(p.startsWith('meta/')||p.startsWith('roles/'))return true; if(p.startsWith('live/'))return !!uid(); return isDir(d); };
  const deny=()=>Promise.reject({code:'permission-denied',message:'denied'});
  const snap=(k,v)=>({id:k.split('/').pop(),exists:!!v,data:()=>v&&JSON.parse(JSON.stringify(v))});
  const fs={
    settings(){}, collection(col){ const list=()=>{const d=load();return Object.keys(d).filter(k=>k.split('/').slice(0,-1).join('/')===col&&(!k.startsWith('pv/')||isDir(d))).map(k=>snap(k,d[k]));};
      return { onSnapshot(n){const f=()=>n({docs:list()}); subs.add(f); setTimeout(f,5); return ()=>subs.delete(f);}, async get(){return {docs:list()};} }; },
    doc(p){ return { async get(){return snap(p,load()[p]);}, async set(v,o){const d=load(); if(!canWrite(p,d))return deny(); d[p]=o&&o.merge&&d[p]?merge(d[p],JSON.parse(JSON.stringify(v))):JSON.parse(JSON.stringify(v)); save(d); fire();}, async delete(){const d=load(); if(!canWrite(p,d))return deny(); delete d[p]; save(d); fire();} }; },
    batch(){ const ops=[]; return { set(ref,v){ops.push([ref,v]);}, async commit(){ for(const [r,v] of ops) await r.set(v);} }; },
  };
  const auth={ onAuthStateChanged(cb){ setTimeout(()=>cb(uid()?{uid:uid(),displayName:'User '+uid(),email:uid()+'@x.test',photoURL:''}:null),5); return ()=>{}; },
    async signInWithPopup(){ sessionStorage.setItem('fbuid', sessionStorage.getItem('nextuid')||'u1'); }, async signOut(){ sessionStorage.removeItem('fbuid'); } };
  window.firebase={ initializeApp(){}, auth: Object.assign(()=>auth,{GoogleAuthProvider:function(){}}), firestore:()=>fs };
  window.KT_FIREBASE_CONFIG={projectId:'mock'};
})();
