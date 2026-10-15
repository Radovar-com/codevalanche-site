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
 checkedEndpoint(endpoint);let entries=[],disposed=false,running=null,nextAttempt=0,serverRetryUntil=0;
 const read=()=>{try{return JSON.parse(host.localStorage.getItem(manager.keys.queue)??'[]');}catch{return [];}};
 const save=()=>{try{if(entries.length)host.localStorage.setItem(manager.keys.queue,JSON.stringify(entries));else host.localStorage.removeItem(manager.keys.queue);}catch{}};
 const clear=()=>{entries=[];save();};
 const fresh=()=>{const lease=manager.getCollectionContext({touchActivity:false});if(!lease){if(!manager.getState().websiteAnalytics)clear();else{const disk=read();entries=(Array.isArray(disk)?disk:[]).filter(e=>e&&validStoredEvent(e.event,siteId)&&Number.isFinite(e.queuedAt)&&now()-e.queuedAt<86400000&&now()>=e.queuedAt).slice(-100);save();}return null;}const disk=read();entries=(Array.isArray(disk)?disk:[]).filter(e=>e&&validStoredEvent(e.event,siteId)&&e.event.consent_receipt_id===e.receiptId&&e.event.consent_generation===e.generation&&e.receiptId===lease.receiptId&&e.generation===lease.generation&&e.collectionToken===lease.collectionToken&&e.event.anonymous_id===lease.anonymousId&&Number.isFinite(e.queuedAt)&&now()-e.queuedAt<86400000&&now()>=e.queuedAt).slice(-100);save();return lease;};
 const envelope=(entry,events)=>({receiptId:entry.receiptId,generation:entry.generation,collectionToken:entry.collectionToken,events});
 function enqueue(event,lease){if(disposed||!manager.acceptAck({generation:lease.generation},lease))return false;fresh();const entry={event:JSON.parse(JSON.stringify(event)),receiptId:lease.receiptId,generation:lease.generation,collectionToken:lease.collectionToken,queuedAt:now()};if(bytes(envelope(entry,[event]))>32768)return false;entries.push(entry);entries=entries.slice(-100);save();return true;}
 async function flush(reason='manual'){
  if(disposed||now()<serverRetryUntil)return;if(running)return running;if(reason!=='manual'&&now()<nextAttempt)return;
  running=(async()=>{for(let batch=0;batch<3;batch++){
   const lease=fresh();if(!lease||!entries.length)return;const selected=[],first=entries[0];
   for(const entry of entries){if(selected.length===50||entry.receiptId!==first.receiptId||entry.generation!==first.generation||entry.collectionToken!==first.collectionToken)break;const proposed=[...selected,entry.event];if(bytes(envelope(first,proposed))>32768)break;selected.push(entry.event);}
   if(!selected.length){entries.shift();save();continue;}
   // A second fresh lease fences the exact immutable envelope immediately before IO.
   const sending=manager.getCollectionContext({touchActivity:false});if(!sending||sending.receiptId!==first.receiptId||sending.generation!==first.generation||sending.collectionToken!==first.collectionToken||sending.anonymousId!==first.event.anonymous_id)return;
   let response,ack;try{response=await request(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(envelope(first,selected)),credentials:'omit',cache:'no-store',referrerPolicy:'no-referrer',keepalive:reason==='hidden'||reason==='pagehide',signal:sending.signal});ack=await response.json();}catch{nextAttempt=now()+1000;return;}
   if(!response.ok){if(!manager.acceptAck({generation:sending.generation},sending))return;const delay=Math.min(86400000,Math.max(1000,Number.isSafeInteger(ack?.retryAfterMs)?ack.retryAfterMs:1000));nextAttempt=now()+delay;if(response.status===429)serverRetryUntil=nextAttempt;return;}
   if(!manager.acceptAck(ack,sending))return;
   const ids=new Set(selected.map(e=>e.event_id));
   const valid=validBatchReceipt(ack)&&Array.isArray(ack.acceptedIds)&&Array.isArray(ack.duplicateIds)&&Array.isArray(ack.rejected)&&ack.acceptedIds.every(id=>ids.has(id))&&ack.duplicateIds.every(id=>ids.has(id))&&ack.rejected.every(r=>r&&ids.has(r.eventId)&&typeof r.code==='string')&&Number.isFinite(Date.parse(ack.receivedAt))&&(ack.retryAfterMs===null||Number.isSafeInteger(ack.retryAfterMs)&&ack.retryAfterMs>=0);
   if(!valid)return;const acknowledged=new Set([...ack.acceptedIds,...ack.duplicateIds,...ack.rejected.map(r=>r.eventId)]);if(!acknowledged.size)return;
   // Re-read shared storage so an ACK does not erase observations from a peer tab.
   fresh();entries=entries.filter(e=>!acknowledged.has(e.event.event_id));save();nextAttempt=0;
  }})();try{await running;}finally{running=null;}
 }
 const unsubscribe=manager.subscribe(()=>{if(!manager.getState().websiteAnalytics)clear();});
 return {enqueue,flush,clear,dispose(){disposed=true;unsubscribe();entries=[];}};
}
