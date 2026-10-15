/** First-party consent boundary. No transport is invoked before an explicit choice.
 * T4 owns event production/transport: acquire a fresh lease immediately before
 * sending, pass its signal, and ignore ACKs unless acceptAck returns true.
 */
export function createConsentManager({siteId,policyVersion='2026-10-15',transport={},window:host=globalThis.window,now=Date.now,onPurge=()=>{}}={}) {
 if(!['radovar','codevalanche'].includes(siteId))throw new TypeError('Invalid analytics site');
 const prefix=`owned_analytics:${siteId}:`,keys=Object.freeze(Object.fromEntries(['preference','receipt','pending','identity','queue','request'].map(k=>[k,prefix+k])));
 const storage=host.localStorage,day=86400000,listeners=new Set();
 let disposed=false,controller=new AbortController(),lastScope='',retrying;
 const read=k=>{try{return JSON.parse(storage.getItem(keys[k])??'null');}catch{return null;}};
 const write=(k,value)=>{if(value===null)storage.removeItem(keys[k]);else storage.setItem(keys[k],JSON.stringify(value));};
 const unknown=()=>({policyVersion,websiteAnalytics:false,accountAnalytics:false,state:'unknown',generation:0,changedAt:new Date(now()).toISOString()});
 const validState=s=>s&&s.policyVersion===policyVersion&&Number.isSafeInteger(s.generation)&&s.generation>=0&&['unknown','denied','granted','withdrawn','pending_revoke'].includes(s.state)&&Number.isFinite(Date.parse(s.changedAt));
 const preference=()=>{const p=read('preference');return validState(p?.value)&&p.expiresAt>now()?p.value:unknown();};
 const pending=()=>{const value=read('pending');return Array.isArray(value)?value:[];};
 const putPreference=s=>write('preference',{value:s,expiresAt:now()+180*day});
 const proof=r=>({receiptId:r.receiptId,generation:r.generation,capability:r.revocationProof});
 const remember=r=>{if(!r?.receiptId||!r.revocationProof)return;const p=pending();if(!p.some(x=>x.receiptId===r.receiptId))write('pending',[...p,proof(r)]);};
 function purge() {
  controller.abort();controller=new AbortController();lastScope='';
  for(const key of ['identity','queue','receipt','request'])write(key,null);
  // Explicit legacy analytics key only; Auth/theme/unrelated storage is untouched.
  storage.removeItem('codevalanche_analytics_installation');onPurge();
 }
 function notify(){for(const listener of listeners)listener(getState());}
 function authority(){
  const state=preference(),r=read('receipt');
  if(disposed||pending().length||state.state!=='granted'||!state.websiteAnalytics||!r||r.siteId!==siteId||r.policyVersion!==policyVersion||r.generation!==state.generation||!r.purposes?.websiteAnalytics||r.purposes.accountAnalytics!==false||!Number.isFinite(Date.parse(r.expiresAt))||!Number.isFinite(Date.parse(r.issuedAt))||Date.parse(r.expiresAt)<=now()||Date.parse(r.issuedAt)>now()||typeof r.collectionToken!=='string')return null;
  return {state,r};
 }
 function sync(){
  const a=authority(),scope=a?`${a.r.receiptId}:${a.state.generation}`:'';
  const obsolete=read('receipt');
  if(!a&&obsolete){remember(obsolete);purge();const state=preference();putPreference({...state,websiteAnalytics:false,accountAnalytics:false,state:'pending_revoke'});}
  if(lastScope&&scope!==lastScope){controller.abort();controller=new AbortController();write('identity',null);write('queue',null);onPurge();}
  if(!a){controller.abort();controller=new AbortController();write('identity',null);write('queue',null);storage.removeItem('codevalanche_analytics_installation');}
  lastScope=scope;
 }
 function getState(){const value=preference();return {...value,accountAnalytics:false,websiteAnalytics:value.state==='granted'&&value.websiteAnalytics===true};}
 async function retryRevocations(){
  if(disposed)return false;if(retrying)return retrying;
  retrying=(async()=>{
   for(const p of pending()) {
    if(!transport.revokeReceipt)return false;
    try{const result=await transport.revokeReceipt(p);if(result?.revoked!==true)return false;}catch{return false;}
    const remaining=pending().filter(x=>x.receiptId!==p.receiptId);write('pending',remaining.length?remaining:null);
   }
   const state=preference();if(!pending().length&&state.state==='pending_revoke'){putPreference({...state,state:'withdrawn'});notify();}
   return pending().length===0;
  })();
  try{return await retrying;}finally{retrying=null;}
 }
 async function setConsent(choice){
  if(disposed)return;
  const enabled=choice?.websiteAnalytics===true,old=preference();
  // Pending proof is saved BEFORE receipt/IDs disappear. A second tab's fresh
  // lease check immediately sees the pending fence, even before storage events.
  remember(read('receipt'));purge();
  const awaitingRevoke=pending().length>0;
  const state={policyVersion,websiteAnalytics:enabled&&!awaitingRevoke,accountAnalytics:false,state:awaitingRevoke?'pending_revoke':enabled?'granted':old.state==='granted'?'withdrawn':'denied',generation:old.generation+1,changedAt:new Date(now()).toISOString()};
  putPreference(state);notify();
  if(!enabled){await retryRevocations();return;}
  const attempt=host.crypto.randomUUID();write('request',attempt);
  const current=()=>!disposed&&read('request')===attempt&&preference().generation===state.generation;
  if(!await retryRevocations()||!current())return;
  putPreference({...state,websiteAnalytics:true,state:'granted'});notify();
  if(!transport.issueReceipt)return;
  let receipt;
  try{receipt=await transport.issueReceipt({siteId,policyVersion,generation:state.generation,purposes:{websiteAnalytics:true,accountAnalytics:false}});}catch{return;}
  if(!current()){remember(receipt);await retryRevocations();return;}
  const valid=receipt?.siteId===siteId&&receipt.policyVersion===policyVersion&&receipt.generation===state.generation&&receipt.purposes?.websiteAnalytics===true&&receipt.purposes.accountAnalytics===false&&Date.parse(receipt.expiresAt)>now()&&Date.parse(receipt.issuedAt)<=now()&&typeof receipt.collectionToken==='string'&&typeof receipt.revocationProof==='string';
  if(!valid){remember(receipt);await retryRevocations();return;}
  write('receipt',receipt);write('request',null);sync();notify();
 }
 function getCollectionContext(){
  sync();const a=authority();if(!a)return null;
  const time=now();let identity=read('identity');
  if(!identity||identity.expiresAt<=time){identity={anonymousId:host.crypto.randomUUID(),expiresAt:time+30*day};}
  if(!identity.sessionId||time-identity.lastActiveAt>=30*60000||time-identity.sessionStartedAt>=day){identity.sessionId=host.crypto.randomUUID();identity.sessionStartedAt=time;}
  identity.lastActiveAt=time;write('identity',identity);
  return {anonymousId:identity.anonymousId,sessionId:identity.sessionId,receiptId:a.r.receiptId,generation:a.state.generation,collectionToken:a.r.collectionToken,accountAnalytics:false,signal:controller.signal};
 }
 function acceptAck(ack,lease){sync();const a=authority();return !!a&&!!lease&&!lease.signal?.aborted&&lease.receiptId===a.r.receiptId&&lease.generation===a.state.generation&&ack?.generation===a.state.generation;}
 const onStorage=event=>{if(event.key===null||Object.values(keys).includes(event.key)){sync();notify();}};
 const onOnline=()=>{void retryRevocations();};
 host.addEventListener('storage',onStorage);host.addEventListener('online',onOnline);
 // Legacy accepted is not current policy acceptance; ask again. A legacy
 // refusal can safely migrate without a network request or optional identity.
 if(!read('preference')){
  const legacy=host.document.cookie.split(';').map(x=>x.trim()).find(x=>x.startsWith(`${siteId}_consent=`))?.split('=')[1];
  if(legacy==='declined')putPreference({...unknown(),state:'denied',generation:1});
 }
 const storedReceipt=read('receipt');
 if(storedReceipt&&!authority()){remember(storedReceipt);purge();const s=preference();putPreference({...s,websiteAnalytics:false,accountAnalytics:false,state:pending().length?'pending_revoke':'unknown'});}
 sync();
 return Object.freeze({keys,getState,setConsent,getCollectionContext,acceptAck,retryRevocations,subscribe(listener){listeners.add(listener);return ()=>listeners.delete(listener);},dispose(){disposed=true;controller.abort();listeners.clear();host.removeEventListener('storage',onStorage);host.removeEventListener('online',onOnline);}});
}
