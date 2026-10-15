import {createConsentManager} from './consent.js';
import {createPage} from './page.js';
import {createQueue,createConsentTransport} from './transport.js';
import {sanitizeEvent,safeId} from './sanitizer.js';
import {registered,PREAUTH,ACCOUNT,SDK_VERSION} from './registry.js';
export {createConsentManager,createConsentTransport,SDK_VERSION};
export function createAnalyticsClient({siteId,consentManager,endpoint,baseUrl,pageVersion='build_1',window:host=globalThis.window,now=Date.now,fetch}={}){
 if(!['codevalanche','radovar'].includes(siteId)||!safeId(pageVersion))throw new TypeError('Invalid analytics configuration');
 const manager=consentManager??createConsentManager({siteId,window:host,now,transport:createConsentTransport({baseUrl,fetch:fetch??host.fetch.bind(host)})});
 const queue=createQueue({manager,siteId,endpoint:endpoint??baseUrl+'/events',host,now,fetch});let current=null,disposed=false,documentClaimed=false;const sessions=new Set();
 function allowed(surface,pageId){if(disposed||surface==='authenticated_account'||(['account','account_authorize'].includes(pageId)&&surface!=='pre_auth'))return null;const lease=manager.getCollectionContext({touchActivity:false});return lease?`${lease.receiptId}:${lease.generation}:${lease.anonymousId}:${lease.sessionId}`:null;}
 function emit(name,properties,context={}){
  const pageId=context.pageId??current?.pageId,surface=context.surface??current?.surface??'marketing';
  if(context.userInteraction===true&&surface!=='authenticated_account'&&(!['account','account_authorize'].includes(pageId)||surface==='pre_auth')){manager.getCollectionContext({touchActivity:true});current?.refreshScope();}
  if(!registered('page',pageId,siteId)||!allowed(surface,pageId)||ACCOUNT.has(name)||(surface==='pre_auth'&&!PREAUTH.has(name)))return {queued:false,reason:'unavailable'};
  const sanitized=sanitizeEvent(name,properties,context.context??{},siteId);if(!sanitized)return {queued:false,reason:'invalid_fields'};
  const lease=manager.getCollectionContext({touchActivity:context.userInteraction===true});if(!lease)return {queued:false,reason:'invalid_consent'};
  const instance=context.pageInstanceId??current?.pageInstanceId;if(!instance)return {queued:false,reason:'unavailable'};
  const event={schema_version:1,event_id:host.crypto.randomUUID(),site_id:siteId,event_name:name,occurred_at:new Date(now()).toISOString(),page_id:pageId,page_instance_id:instance,page_version:context.pageVersion??current?.pageVersion??pageVersion,session_id:lease.sessionId,anonymous_id:lease.anonymousId,consent_receipt_id:lease.receiptId,consent_generation:lease.generation,properties:sanitized.properties};
  if(Object.keys(sanitized.context).length)event.context=sanitized.context;
  return {queued:queue.enqueue(event,lease),eventId:event.event_id};
 }
 function sessionStart(page){const lease=manager.getCollectionContext({touchActivity:false});if(!lease||page.surface!=='marketing'||sessions.has(lease.sessionId))return;const result=emit('session_started',{landing_page_id:page.pageId,attribution_kind:'unknown'});if(result.queued)sessions.add(lease.sessionId);}
 function startPage({pageId,pageVersion:version=pageVersion,navigationType='initial',surface=(['account','account_authorize'].includes(pageId)?'authenticated_account':'marketing')}={}){
  if(!registered('page',pageId,siteId)||!safeId(version)||!['initial','route','back_forward'].includes(navigationType)||!['marketing','pre_auth','authenticated_account'].includes(surface))throw new TypeError('Invalid analytics page');
  if(current&&current.pageId===pageId&&current.pageVersion===version&&current.surface===surface){current.resume();return current;}
  if(current){current.flush('navigation');current.destroy();}
  if(surface!=='authenticated_account'&&(!['account','account_authorize'].includes(pageId)||surface==='pre_auth')){manager.getCollectionContext({touchActivity:true});current?.refreshScope();}
  const initialDocument=!documentClaimed&&navigationType==='initial';documentClaimed=true;
  current=createPage({host,siteId,initialDocument,historicalConsent:()=>{try{const receipt=JSON.parse(host.localStorage.getItem(manager.keys.receipt));return Date.parse(manager.getState().changedAt)<host.performance.timeOrigin&&Date.parse(receipt?.issuedAt)<host.performance.timeOrigin;}catch{return false;}},pageId,pageVersion:version,navigationType,surface,emit,allowed,onActivity:()=>surface!=='authenticated_account'&&manager.getCollectionContext({touchActivity:true})});sessionStart(current);return current;
 }
 const online=()=>{void queue.flush('online');},hidden=()=>{if(host.document.visibilityState==='hidden'){current?.flush('hidden');queue.flushLifecycle();}else queue.resumeLifecycle();},pagehide=()=>{current?.flush('hidden');queue.flushLifecycle();},pageshow=event=>{if(event.persisted){queue.resumeLifecycle();current?.stopQuality('bfcache_restore');current?.resume();}};
 let lastGrantedGeneration=manager.getState().state==='granted'?manager.getState().generation:-1;
 const unsubscribe=manager.subscribe(state=>{if(!state.websiteAnalytics){current?.stopQuality('consent_unavailable');return;}if(current&&state.generation!==lastGrantedGeneration){const lease=manager.getCollectionContext({touchActivity:true});if(lease){lastGrantedGeneration=state.generation;current.refreshScope();sessionStart(current);}}});
 const timer=host.setInterval(()=>{if(current){current.flush('interval');sessionStart(current);}void queue.flush('interval');},15000);
 host.addEventListener('online',online);host.document.addEventListener('visibilitychange',hidden);host.addEventListener('pagehide',pagehide);host.addEventListener('pageshow',pageshow);
 return Object.freeze({version:SDK_VERSION,consentManager:manager,async setConsent(choice){await manager.setConsent(choice);if(manager.getState().websiteAnalytics)manager.getCollectionContext({touchActivity:true});},whenQueueSettled:()=>queue.whenSettled(),getQualityStatus:()=>current?.getQualityStatus()??Object.fromEntries(['LCP','CLS','INP'].map(metric=>[metric,{status:'unmeasured',reason:'no_page'}])),reportError:({errorCode,componentId,buildSha=pageVersion}={})=>emit('javascript_error_observed',{error_code:errorCode,component_id:componentId,build_sha:buildSha}),reportResourceFailure:({resourceId,resourceKind}={})=>emit('resource_load_failed',{resource_id:resourceId,resource_kind:resourceKind}),reportInteractionFailure:({actionId,errorCode}={})=>emit('interaction_failed',{action_id:actionId,normalized_error:errorCode}),track:(name,properties,context={})=>emit(name,properties,{...context,userInteraction:true}),startPage,resetIdentity(){queue.clear();current?.destroy();current=null; // No new ID is created by reset, and no old scope can be relabeled.
 try{host.localStorage.removeItem(manager.keys.identity);}catch{}},async flush(reason='manual'){current?.flush(reason);if(reason==='hidden'||reason==='pagehide')queue.flushLifecycle();else await queue.flush(reason);},dispose(){if(disposed)return;current?.flush('manual');disposed=true;current?.destroy();queue.dispose();unsubscribe();host.clearInterval(timer);host.removeEventListener('online',online);host.document.removeEventListener('visibilitychange',hidden);host.removeEventListener('pagehide',pagehide);host.removeEventListener('pageshow',pageshow);if(!consentManager)manager.dispose();}});
}
