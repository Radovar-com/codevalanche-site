import {validStoredEvent,validBatchReceipt} from './sanitizer.js';
/** Minimal capability HTTP handoff. No cookies, apikey, URL capabilities, or private report access. */
export function createConsentTransport({baseUrl,fetch:request=globalThis.fetch}={}){
 const base=checkedEndpoint(baseUrl);
 const send=async(path,method,body)=>{const response=await request(base+path,{method,headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',body:JSON.stringify(body)});if(!response.ok)throw new Error('Analytics transport unavailable');return response.json();};
 return Object.freeze({issueReceipt:body=>send('/consent/receipts','POST',body),revokeReceipt:body=>send('/consent/receipts/'+encodeURIComponent(body.receiptId),'DELETE',body)});
}
export function checkedEndpoint(value){if(typeof value!=='string'||!value||/[?#]/.test(value))throw new TypeError('Invalid analytics endpoint');const url=new URL(value,globalThis.location?.href??'https://localhost');if(url.username||url.password||!['https:','http:'].includes(url.protocol))throw new TypeError('Invalid analytics endpoint');if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new TypeError('Invalid analytics endpoint');return value.replace(/\/$/,'');}
const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
export function createQueue({manager,endpoint,host=window,now=Date.now,siteId,registry,fetch:request=host.fetch.bind(host)}){
 checkedEndpoint(endpoint);
 let locks;try{locks=host.navigator?.locks;if(typeof locks?.request!=='function')locks=null;}catch{locks=null;}
 // One mutation lock bounds both purpose-specific persisted queues together.
 // Never copy/relabel the peer's events or capabilities into this scope.
 const lockName=`owned_analytics:${siteId}:queue:mutation`,peerQueue=manager.keys.queue===`owned_analytics:${siteId}:queue`?`owned_analytics:${siteId}:account:queue`:`owned_analytics:${siteId}:queue`,pending=new Map(),owned=new Set();
 let shared=!!locks,memory=[],disposed=false,running=null,changes=Promise.resolve(),scheduled=null,epoch=0,lastLease=null,nextAttempt=0,serverRetryUntil=0,lifecycleIssued=false,mutationController=new AbortController();
 const envelope=(entry,events)=>({receiptId:entry.receiptId,generation:entry.generation,collectionToken:entry.collectionToken,events});
 const read=()=>{try{const value=JSON.parse(host.localStorage.getItem(manager.keys.queue)??'[]');return Array.isArray(value)?value.slice(-100):[];}catch{shared=false;return null;}};
 const write=entries=>{try{if(entries.length)host.localStorage.setItem(manager.keys.queue,JSON.stringify(entries));else host.localStorage.removeItem(manager.keys.queue);return true;}catch{shared=false;return false;}};
 const current=()=>{const lease=manager.getCollectionContext({touchActivity:false});if(lease)lastLease=lease;return lease;};
 function valid(entry,lease){
  if(!entry||!validStoredEvent(entry.event,siteId,registry)||entry.event.consent_receipt_id!==entry.receiptId||entry.event.consent_generation!==entry.generation||!Number.isFinite(entry.queuedAt)||now()-entry.queuedAt>=86400000||now()<entry.queuedAt)return false;
  if(lease)return entry.receiptId===lease.receiptId&&entry.generation===lease.generation&&entry.collectionToken===lease.collectionToken&&entry.event.anonymous_id===lease.anonymousId;
  // An idle session may retain its immutable bounded queue, but cannot send or
  // create IDs. A peer awaiting an old revoke ACK must preserve the fresh granted
  // generation; sending still requires the fully verified fresh receipt lease.
  const state=manager.getState();return (state.websiteAnalytics||state.accountAnalytics)&&entry.generation===state.generation;
 }
 function merge(base,additions,lease){
  const unique=new Map();for(const entry of [...base,...additions])if(valid(entry,lease)&&!unique.has(entry.event.event_id))unique.set(entry.event.event_id,entry);
  return [...unique.values()].sort((a,b)=>a.queuedAt-b.queuedAt).slice(-100);
 }
 function snapshot(useShared){
  const lease=current(),staged=[...pending.values()],additions=staged.filter(item=>manager.acceptAck({generation:item.entry.generation},item.lease)).map(item=>item.entry);
  let base=useShared&&shared?read():null,useStorage=useShared&&shared&&base!==null;
  let entries=merge(useStorage?base:memory,additions,lease);
  if(useStorage){
   try{
    const raw=JSON.parse(host.localStorage.getItem(peerQueue)??'[]');
    // Purpose-neutral expiry cleanup prevents an abandoned tab from reserving
    // capacity forever. Valid peer data, its identity and consent stay intact.
    const peer=Array.isArray(raw)?raw.filter(entry=>Number.isFinite(entry?.queuedAt)&&now()>=entry.queuedAt&&now()-entry.queuedAt<86400000&&validStoredEvent(entry.event,siteId,registry)):[];
    if(!Array.isArray(raw)||peer.length!==raw.length){if(peer.length)host.localStorage.setItem(peerQueue,JSON.stringify(peer));else host.localStorage.removeItem(peerQueue);}
    const capacity=Math.max(0,100-peer.length);entries=capacity?entries.slice(-capacity):[];
   }
   catch{shared=false;useStorage=false;entries=merge(memory,additions,lease);}
  }
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
  const old=lastLease;lifecycleIssued=false;epoch++;mutationController.abort();mutationController=new AbortController();pending.clear();memory=[];owned.clear();
  if(shared)void coordinate(useShared=>{const state=snapshot(useShared);const kept=state.entries.filter(entry=>old?entry.receiptId!==old.receiptId||entry.generation!==old.generation||entry.event.anonymous_id!==old.anonymousId:!!state.lease);saveSnapshot(state,kept);});
 }
 async function acknowledge(ack,sending,events,sentEpoch){
  if(disposed||sentEpoch!==epoch)return false;const ids=new Set(events.map(event=>event.event_id));
  if(!validBatchReceipt(ack)||!ack.acceptedIds.every(id=>ids.has(id))||!ack.duplicateIds.every(id=>ids.has(id))||!ack.rejected.every(result=>ids.has(result.eventId)))return false;
  const acknowledged=new Set([...ack.acceptedIds,...ack.duplicateIds,...ack.rejected.map(result=>result.eventId)]);if(!acknowledged.size)return false;
  return coordinate(useShared=>{if(disposed||sentEpoch!==epoch||!manager.acceptAck(ack,sending))return false;const state=snapshot(useShared);saveSnapshot(state,state.entries.filter(entry=>!acknowledged.has(entry.event.event_id)));return true;});
 }
 function flushLifecycle(){
  if(disposed||lifecycleIssued||now()<serverRetryUntil)return;
  const lease=current();if(!lease)return;
  const staged=[...pending.values()].filter(item=>manager.acceptAck({generation:item.entry.generation},item.lease)).map(item=>item.entry);
  const passive=new Set(['session_started','page_viewed','page_engagement_reported','page_exited','section_viewed','section_engagement_reported','scroll_depth_reached','web_vital_reported']);
  // Read only this instance's immutable memory. Prioritize the newest explicit
  // actions, so the click causing navigation is not stranded behind metrics.
  const candidates=merge(memory,staged,lease).reverse().sort((a,b)=>Number(passive.has(a.event.event_name))-Number(passive.has(b.event.event_name))),first=candidates[0],events=[];
  if(!first)return;for(const entry of candidates){if(events.length===50)break;const proposed=[...events,entry.event];if(bytes(envelope(first,proposed))>32768)break;events.push(entry.event);}
  if(!events.length)return;const sentEpoch=epoch,sending=current();
  if(!sending||sending.receiptId!==first.receiptId||sending.generation!==first.generation||sending.collectionToken!==first.collectionToken||sending.anonymousId!==first.event.anonymous_id)return;
  lifecycleIssued=true;
  // Initiate native keepalive synchronously: no persistence barrier/lock/await
  // can stand between pagehide and fetch. Initiation never dequeues anything.
  try{void Promise.resolve(request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(envelope(first,events)),credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',keepalive:true,signal:sending.signal})).then(async response=>{
   const ack=await response.json();if(disposed||sentEpoch!==epoch)return;
   if(!response.ok){if(manager.acceptAck({generation:sending.generation},sending)){const delay=Math.min(86400000,Math.max(1000,Number.isSafeInteger(ack?.retryAfterMs)?ack.retryAfterMs:1000));nextAttempt=now()+delay;if(response.status===429)serverRetryUntil=nextAttempt;}return;}
   await acknowledge(ack,sending,events,sentEpoch);
  }).catch(()=>{});}catch{}
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
   const changed=await acknowledge(ack,sending,events,selected.epoch);
   if(!changed)return;nextAttempt=0;
  }})();try{await running;}finally{running=null;}
 }
 const unsubscribe=manager.subscribe(()=>{if(!manager.getState().websiteAnalytics&&!manager.getState().accountAnalytics)clear();});
 return {enqueue,flush,flushLifecycle,resumeLifecycle(){lifecycleIssued=false;},clear,whenSettled,dispose(){disposed=true;epoch++;mutationController.abort();pending.clear();memory=[];owned.clear();unsubscribe();}};
}
