import {validStoredEvent,validBatchReceipt} from './sanitizer.js';
/** Minimal capability HTTP handoff. No cookies, apikey, URL capabilities, or private report access. */
export function createConsentTransport({baseUrl,fetch:request=globalThis.fetch}={}){
 const base=checkedEndpoint(baseUrl);
 const send=async(path,method,body)=>{const response=await request(base+path,{method,headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',body:JSON.stringify(body)});if(!response.ok)throw new Error('Analytics transport unavailable');return response.json();};
 return Object.freeze({issueReceipt:body=>send('/consent/receipts','POST',body),revokeReceipt:body=>send('/consent/receipts/'+encodeURIComponent(body.receiptId),'DELETE',body)});
}
export function checkedEndpoint(value){if(typeof value!=='string'||!value||/[?#]/.test(value))throw new TypeError('Invalid analytics endpoint');const url=new URL(value,globalThis.location?.href??'https://localhost');if(url.username||url.password||!['https:','http:'].includes(url.protocol))throw new TypeError('Invalid analytics endpoint');if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new TypeError('Invalid analytics endpoint');return value.replace(/\/$/,'');}
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
export function createQueue({manager,endpoint,host=window,now=Date.now,siteId,fetch:request=host.fetch.bind(host)}){
 checkedEndpoint(endpoint);
 let locks;try{locks=host.navigator?.locks;if(typeof locks?.request!=='function')locks=null;}catch{locks=null;}
 const lockName=manager.keys.queue+':mutation',pending=new Map(),owned=new Set();
 let shared=!!locks,memory=[],disposed=false,running=null,changes=Promise.resolve(),scheduled=null,epoch=0,lastLease=null,nextAttempt=0,serverRetryUntil=0,mutationController=new AbortController();
 const envelope=(entry,events)=>({receiptId:entry.receiptId,generation:entry.generation,collectionToken:entry.collectionToken,events});
 const read=()=>{try{const value=JSON.parse(host.localStorage.getItem(manager.keys.queue)??'[]');return Array.isArray(value)?value.slice(-100):[];}catch{shared=false;return null;}};
 const write=entries=>{try{if(entries.length)host.localStorage.setItem(manager.keys.queue,JSON.stringify(entries));else host.localStorage.removeItem(manager.keys.queue);return true;}catch{shared=false;return false;}};
 const current=()=>{const lease=manager.getCollectionContext({touchActivity:false});if(lease)lastLease=lease;return lease;};
 function valid(entry,lease){
  if(!entry||!validStoredEvent(entry.event,siteId)||entry.event.consent_receipt_id!==entry.receiptId||entry.event.consent_generation!==entry.generation||!Number.isFinite(entry.queuedAt)||now()-entry.queuedAt>=86400000||now()<entry.queuedAt)return false;
  if(lease)return entry.receiptId===lease.receiptId&&entry.generation===lease.generation&&entry.collectionToken===lease.collectionToken&&entry.event.anonymous_id===lease.anonymousId;
  // An idle session may retain its immutable bounded queue, but cannot send or
  // create IDs. A peer awaiting an old revoke ACK must preserve the fresh granted
  // generation; sending still requires the fully verified fresh receipt lease.
  const state=manager.getState();return state.websiteAnalytics&&entry.generation===state.generation;
 }
 function merge(base,additions,lease){
  const unique=new Map();for(const entry of [...base,...additions])if(valid(entry,lease)&&!unique.has(entry.event.event_id))unique.set(entry.event.event_id,entry);
  return [...unique.values()].sort((a,b)=>a.queuedAt-b.queuedAt).slice(-100);
 }
 function snapshot(useShared){
  const lease=current(),staged=[...pending.values()],additions=staged.filter(item=>manager.acceptAck({generation:item.entry.generation},item.lease)).map(item=>item.entry);
  let base=useShared&&shared?read():null,useStorage=useShared&&shared&&base!==null;
  let entries=merge(useStorage?base:memory,additions,lease);
  if(useStorage&&!write(entries)){useStorage=false;entries=merge(memory,additions,lease);}
  if(lease&&!manager.acceptAck({generation:lease.generation},lease)){entries=entries.filter(entry=>entry.receiptId!==lease.receiptId||entry.generation!==lease.generation);if(useStorage&&!write(entries))useStorage=false;}
  memory=useStorage?entries.filter(entry=>owned.has(entry.event.event_id)):entries;
  for(const item of staged)if(pending.get(item.entry.event.event_id)===item)pending.delete(item.entry.event.event_id);
  return {lease,entries,useStorage};
 }
 function saveSnapshot(state,entries){
  if(state.useStorage&&shared){if(write(entries)){memory=entries.filter(entry=>owned.has(entry.event.event_id));return;} // Failure is atomic; do not overwrite/read shared storage without a lock.
   memory=entries.filter(entry=>owned.has(entry.event.event_id));
  }else memory=entries;
 }
 function coordinate(action){
  const operationEpoch=epoch,signal=mutationController.signal;
  const operation=changes.then(()=>{
   if(signal.aborted||operationEpoch!==epoch)return;
   if(!shared)return action(false);
   let entered=false;
   const fallback=()=>{if(signal.aborted||operationEpoch!==epoch)return;shared=false;if(!entered)return action(false);};
   try{return Promise.resolve(locks.request(lockName,{mode:'exclusive',signal},()=>{if(signal.aborted||operationEpoch!==epoch)return;entered=true;return action(shared);})).catch(fallback);}catch{return fallback();}
  }).catch(()=>{if(!signal.aborted&&operationEpoch===epoch){shared=false;pending.clear();memory=[];}});
  changes=operation;return operation;
 }
 function schedule(){
  if(scheduled)return;
  scheduled=coordinate(useShared=>disposed?undefined:snapshot(useShared)).finally(()=>{scheduled=null;if(pending.size&&!disposed)schedule();});
 }
 function enqueue(event,lease){
  if(disposed||!manager.acceptAck({generation:lease.generation},lease))return false;
  const entry={event:JSON.parse(JSON.stringify(event)),receiptId:lease.receiptId,generation:lease.generation,collectionToken:lease.collectionToken,queuedAt:now()};
  if(bytes(envelope(entry,[entry.event]))>32768)return false;
  lastLease=lease;owned.add(entry.event.event_id);while(owned.size>100)owned.delete(owned.values().next().value);memory=memory.filter(item=>owned.has(item.event.event_id));pending.set(entry.event.event_id,{entry,lease});while(pending.size>100)pending.delete(pending.keys().next().value);
  schedule();return true; // Synchronous acceptance into bounded memory; persistence is deliberately asynchronous.
 }
 function clear(){
  const old=lastLease;epoch++;mutationController.abort();mutationController=new AbortController();pending.clear();memory=[];owned.clear();
  if(shared)void coordinate(useShared=>{const state=snapshot(useShared);const kept=state.entries.filter(entry=>old?entry.receiptId!==old.receiptId||entry.generation!==old.generation||entry.event.anonymous_id!==old.anonymousId:!!state.lease);saveSnapshot(state,kept);});
 }
 async function whenSettled(){await changes;}
 async function flush(reason='manual'){
  if(disposed||now()<serverRetryUntil)return;if(running)return running;if(reason!=='manual'&&now()<nextAttempt)return;
  running=(async()=>{await whenSettled();for(let batch=0;batch<3;batch++){
   const selected=await coordinate(useShared=>{
    if(disposed)return null;const state=snapshot(useShared);if(!state.lease||!state.entries.length)return null;
    const first=state.entries[0],events=[];
    for(const entry of state.entries){if(events.length===50||entry.receiptId!==first.receiptId||entry.generation!==first.generation||entry.collectionToken!==first.collectionToken)break;const proposed=[...events,entry.event];if(bytes(envelope(first,proposed))>32768)break;events.push(entry.event);}
    if(!events.length){saveSnapshot(state,state.entries.slice(1));return null;}
    return {first,events,epoch};
   });
   if(disposed||!selected)return;const {first,events}=selected;
   // No Web Lock is held during network, await, or caller/UI work.
   const sending=current();if(!sending||selected.epoch!==epoch||sending.receiptId!==first.receiptId||sending.generation!==first.generation||sending.collectionToken!==first.collectionToken||sending.anonymousId!==first.event.anonymous_id)return;
   let response,ack;try{response=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(envelope(first,events)),credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',keepalive:reason==='hidden'||reason==='pagehide',signal:sending.signal});ack=await response.json();}catch{nextAttempt=now()+1000;return;}
   if(selected.epoch!==epoch)return;
   if(!response.ok){if(!manager.acceptAck({generation:sending.generation},sending))return;const delay=Math.min(86400000,Math.max(1000,Number.isSafeInteger(ack?.retryAfterMs)?ack.retryAfterMs:1000));nextAttempt=now()+delay;if(response.status===429)serverRetryUntil=nextAttempt;return;}
   const ids=new Set(events.map(event=>event.event_id));
   if(!validBatchReceipt(ack)||!ack.acceptedIds.every(id=>ids.has(id))||!ack.duplicateIds.every(id=>ids.has(id))||!ack.rejected.every(result=>ids.has(result.eventId)))return;
   const acknowledged=new Set([...ack.acceptedIds,...ack.duplicateIds,...ack.rejected.map(result=>result.eventId)]);if(!acknowledged.size)return;
   const changed=await coordinate(useShared=>{
    if(disposed||selected.epoch!==epoch||!manager.acceptAck(ack,sending))return false;
    const state=snapshot(useShared);saveSnapshot(state,state.entries.filter(entry=>!acknowledged.has(entry.event.event_id)));return true;
   });
   if(!changed)return;nextAttempt=0;
  }})();try{await running;}finally{running=null;}
 }
 const unsubscribe=manager.subscribe(()=>{if(!manager.getState().websiteAnalytics)clear();});
 return {enqueue,flush,clear,whenSettled,dispose(){disposed=true;epoch++;mutationController.abort();pending.clear();memory=[];owned.clear();unsubscribe();}};
}
