/** First-party consent boundary. No transport is invoked before an explicit choice.
 * T4 owns event production/transport: acquire a fresh lease immediately before
 * sending, pass its signal, and ignore ACKs unless acceptAck returns true.
 */
export function createConsentManager({siteId,policyVersion='2026-10-15',transport={},window:host=globalThis.window,now=Date.now,onPurge=()=>{}}={}) {
 if(!['radovar','codevalanche'].includes(siteId))throw new TypeError('Invalid analytics site');
 const prefix=`owned_analytics:${siteId}:`,cookieName=`${siteId}_consent`,keys=Object.freeze(Object.fromEntries(['preference','receipt','pending','recovery','identity','queue','request'].map(k=>[k,prefix+k])));
 const storage=host.localStorage,day=86400000,listeners=new Set();
 const memoryProofs=new Map(),blockedReceipts=new Set(),acknowledgedProofs=new Set();
 let disposed=false,controller=new AbortController(),lastScope='',retrying,locallyFenced=false,fenceGeneration=-1,volatilePreference=null,revocationResolved=false;
 const channel=typeof host.BroadcastChannel==='function'?new host.BroadcastChannel(prefix+'consent'):null;
 const read=k=>{try{return JSON.parse(storage.getItem(keys[k])??'null');}catch{return null;}};
 const write=(k,value)=>{try{if(value===null)storage.removeItem(keys[k]);else storage.setItem(keys[k],JSON.stringify(value));return true;}catch{return false;}};
 const cookie=()=>{try{return decodeURIComponent(host.document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)??'');}catch{return '';}};
 const unknown=()=>({policyVersion,websiteAnalytics:false,accountAnalytics:false,state:'unknown',generation:0,changedAt:new Date(now()).toISOString()});
 const validState=s=>s&&s.policyVersion===policyVersion&&Number.isSafeInteger(s.generation)&&s.generation>=0&&['unknown','denied','granted','withdrawn','pending_revoke'].includes(s.state)&&Number.isFinite(Date.parse(s.changedAt));
 const preference=()=>{let p;try{p=JSON.parse(cookie());}catch{}const value=validState(p?.value)&&p.expiresAt>now()?p.value:unknown();return volatilePreference&&volatilePreference.generation>=value.generation?volatilePreference:value;};
 const diskProofs=k=>{const value=read(k);return Array.isArray(value)?value:[];};
 const proofKey=p=>`${p.receiptId}:${p.generation}`;
 const pending=()=>[...new Map([...diskProofs('pending'),...diskProofs('recovery'),...memoryProofs.values()].filter(p=>!acknowledgedProofs.has(proofKey(p))).map(p=>[p.receiptId,p])).values()];
 const persistProofs=()=>{const value=pending();if(!value.length)return; if(!write('pending',value))write('recovery',value);};
 function putPreference(s){
  const record={value:s,expiresAt:now()+180*day},encoded=encodeURIComponent(JSON.stringify(record));
  // Essential host-only cookie: no Domain attribute, no identity/capability.
  let persisted=false;try{host.document.cookie=`${cookieName}=${encoded}; Max-Age=15552000; Path=/; SameSite=Lax${host.location.protocol==='https:'?'; Secure':''}`;persisted=cookie()===decodeURIComponent(encoded);}catch{}
  volatilePreference=persisted?null:s;
  write('preference',record); // Notification mirror only; never grants authority.
  return persisted;
 }
 const proof=r=>({receiptId:r.receiptId,generation:r.generation,capability:r.revocationProof});
 const remember=r=>{if(!r?.receiptId||!r.revocationProof||acknowledgedProofs.has(proofKey(r)))return;memoryProofs.set(r.receiptId,proof(r));revocationResolved=false;persistProofs();};
 function acknowledge(p,broadcast=false){
  // Reconcile only an exact known proof after a real transport ACK. Empty disk
  // storage is never evidence that a peer's in-memory debt was acknowledged.
  if(!pending().some(value=>proofKey(value)===proofKey(p)))return;
  acknowledgedProofs.add(proofKey(p));
  if(memoryProofs.get(p.receiptId)?.generation===p.generation)memoryProofs.delete(p.receiptId);
  revocationResolved=true;
  for(const key of ['pending','recovery']){const remaining=diskProofs(key).filter(value=>proofKey(value)!==proofKey(p));write(key,remaining.length?remaining:null);}
  if(broadcast)try{channel?.postMessage({acknowledged:{receiptId:p.receiptId,generation:p.generation}});}catch{}
 }
 function fence(generation=preference().generation){locallyFenced=true;fenceGeneration=Math.max(fenceGeneration,generation);const receipt=read('receipt');if(receipt?.receiptId)blockedReceipts.add(receipt.receiptId);controller.abort();controller=new AbortController();lastScope='';}
 function purge() {
  controller.abort();controller=new AbortController();lastScope='';
  for(const key of ['identity','queue','receipt','request'])write(key,null);
  // Explicit legacy analytics key only; Auth/theme/unrelated storage is untouched.
  try{storage.removeItem('codevalanche_analytics_installation');}catch{}try{onPurge();}catch{}
 }
 function notify(){for(const listener of listeners)try{listener(getState());}catch{}}
 function authority(ignorePending=false){
  const state=preference(),r=read('receipt');
  if(disposed||(!ignorePending&&pending().length)||state.state!=='granted'||!state.websiteAnalytics||!r||r.siteId!==siteId||r.policyVersion!==policyVersion||r.generation!==state.generation||!r.purposes?.websiteAnalytics||r.purposes.accountAnalytics!==false||!Number.isFinite(Date.parse(r.expiresAt))||!Number.isFinite(Date.parse(r.issuedAt))||Date.parse(r.expiresAt)<=now()||Date.parse(r.issuedAt)>now()||typeof r.collectionToken!=='string')return null;
  if(locallyFenced&&blockedReceipts.has(r.receiptId))return null;
  locallyFenced=false;
  return {state,r};
 }
 function sync(){
  const a=authority(),candidate=!a?authority(true):null;
  const waitingForOldProof=!!candidate&&pending().every(p=>p.receiptId!==candidate.r.receiptId),scope=a?`${a.r.receiptId}:${a.state.generation}`:'';
  const obsolete=read('receipt');
  if(!a&&obsolete&&!waitingForOldProof){fence();remember(obsolete);purge();persistProofs();const state=preference();putPreference({...state,websiteAnalytics:false,accountAnalytics:false,state:'pending_revoke'});}
  if(lastScope&&scope!==lastScope){controller.abort();controller=new AbortController();write('identity',null);write('queue',null);onPurge();}
  if(!a){controller.abort();controller=new AbortController();if(waitingForOldProof){void retryRevocations();}else{write('identity',null);write('queue',null);try{storage.removeItem('codevalanche_analytics_installation');}catch{}}}
  lastScope=scope;
 }
 function getState(){const value=preference();if(locallyFenced&&value.generation<=fenceGeneration&&value.state==='granted')return {...value,state:pending().length?'pending_revoke':'withdrawn',websiteAnalytics:false,accountAnalytics:false};return {...value,accountAnalytics:false,websiteAnalytics:value.state==='granted'&&value.websiteAnalytics===true};}
 async function retryRevocations(){
  if(disposed)return false;if(retrying)return retrying;
  retrying=(async()=>{
   for(const p of pending()) {
    if(!transport.revokeReceipt)return false;
    try{const result=await transport.revokeReceipt(p);if(result?.revoked!==true)return false;}catch{return false;}
    acknowledge(p,true);
   }
   const state=preference();if(!pending().length&&state.state==='pending_revoke'){if(!revocationResolved)return false;putPreference({...state,state:'withdrawn'});notify();}
   sync();notify();return pending().length===0;
  })();
  try{return await retrying;}finally{retrying=null;}
 }
 async function setConsent(choice){
  if(disposed)return;
  const enabled=choice?.websiteAnalytics===true,old=preference();
  // Abort/fence BEFORE any fallible persistence, including the pending proof.
  fence(old.generation+1);remember(read('receipt'));purge();persistProofs();
  const awaitingRevoke=pending().length>0||(old.state==='pending_revoke'&&!revocationResolved);
  const state={policyVersion,websiteAnalytics:enabled&&!awaitingRevoke,accountAnalytics:false,state:awaitingRevoke?'pending_revoke':enabled?'granted':old.state==='granted'?'withdrawn':'denied',generation:old.generation+1,changedAt:new Date(now()).toISOString()};
  putPreference(state);notify();
  if(state.state!=='granted')try{channel?.postMessage({state,proofs:pending()});}catch{}
  if(!enabled){await retryRevocations();return;}
  const attempt=host.crypto.randomUUID();if(!write('request',attempt))return;
  const current=()=>!disposed&&read('request')===attempt&&preference().generation===state.generation;
  if(!await retryRevocations()||!current())return;
  if(!putPreference({...state,websiteAnalytics:true,state:'granted'}))return;notify();
  if(!transport.issueReceipt)return;
  let receipt;
  try{receipt=await transport.issueReceipt({siteId,policyVersion,generation:state.generation,purposes:{websiteAnalytics:true,accountAnalytics:false}});}catch{return;}
  if(!current()){remember(receipt);await retryRevocations();return;}
  const valid=receipt?.siteId===siteId&&receipt.policyVersion===policyVersion&&receipt.generation===state.generation&&receipt.purposes?.websiteAnalytics===true&&receipt.purposes.accountAnalytics===false&&Date.parse(receipt.expiresAt)>now()&&Date.parse(receipt.issuedAt)<=now()&&typeof receipt.collectionToken==='string'&&typeof receipt.revocationProof==='string';
  if(!valid){remember(receipt);await retryRevocations();return;}
  if(!write('receipt',receipt)){remember(receipt);purge();persistProofs();await retryRevocations();return;}
  write('request',null);locallyFenced=false;sync();notify();
 }
 function getCollectionContext({touchActivity=true}={}){
  sync();const a=authority();if(!a)return null;
  const time=now();let identity=read('identity');
  // Automatic observations never create/rotate IDs or renew idle activity.
  if(!touchActivity&&(!identity||identity.expiresAt<=time||!identity.sessionId||!Number.isFinite(identity.lastActiveAt)||time-identity.lastActiveAt>=30*60000||time-identity.sessionStartedAt>=day))return null;
  if(!identity||identity.expiresAt<=time){identity={anonymousId:host.crypto.randomUUID(),expiresAt:time+30*day};}
  if(!identity.sessionId||time-identity.lastActiveAt>=30*60000||time-identity.sessionStartedAt>=day){identity.sessionId=host.crypto.randomUUID();identity.sessionStartedAt=time;}
  if(touchActivity){identity.lastActiveAt=time;if(!write('identity',identity))return null;}
  return {anonymousId:identity.anonymousId,sessionId:identity.sessionId,receiptId:a.r.receiptId,generation:a.state.generation,collectionToken:a.r.collectionToken,accountAnalytics:false,signal:controller.signal};
 }
 function acceptAck(ack,lease){sync();const a=authority();return !!a&&!!lease&&!lease.signal?.aborted&&lease.receiptId===a.r.receiptId&&lease.generation===a.state.generation&&ack?.generation===a.state.generation;}
 const onStorage=event=>{if(event.key===null||Object.values(keys).includes(event.key)){sync();notify();}};
 const onOnline=()=>{void retryRevocations();};
 host.addEventListener('storage',onStorage);host.addEventListener('online',onOnline);
 if(channel)channel.onmessage=event=>{
  const message=event.data,current=preference();
  if(message?.acknowledged){
   acknowledge(message.acknowledged);
   if(!pending().length&&current.state==='pending_revoke'&&revocationResolved)putPreference({...current,state:'withdrawn'});
   sync();notify();return;
  }
  if(!validState(message?.state)||message.state.generation<current.generation)return;
  if(message.state.generation===current.generation&&message.state.state==='pending_revoke'&&['granted','withdrawn'].includes(current.state)&&!pending().length)return;
  fence(message.state.generation);
  for(const p of message.proofs??[])if(p?.receiptId&&p.capability&&!acknowledgedProofs.has(proofKey(p))){memoryProofs.set(p.receiptId,{receiptId:p.receiptId,generation:p.generation,capability:p.capability});revocationResolved=false;}
  purge();persistProofs();if(message.state.state!=='granted')putPreference(message.state);notify();
 };
 // Legacy accepted is not current policy acceptance; ask again. A legacy
 // refusal can safely migrate without a network request or optional identity.
 if(preference().state==='unknown'){
  const legacy=cookie();
  if(legacy==='declined')putPreference({...unknown(),state:'denied',generation:1});
 }
 const storedReceipt=read('receipt');
 if(storedReceipt&&!authority()){fence();remember(storedReceipt);purge();persistProofs();const s=preference();putPreference({...s,websiteAnalytics:false,accountAnalytics:false,state:pending().length?'pending_revoke':'unknown'});}
 sync();
 return Object.freeze({keys,cookieName,getState,setConsent,getCollectionContext,acceptAck,retryRevocations,subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},dispose(){disposed=true;controller.abort();listeners.clear();channel?.close();host.removeEventListener('storage',onStorage);host.removeEventListener('online',onOnline);}});
}
