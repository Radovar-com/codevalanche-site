/** Optional A observations. The account API/P4 response is a local hint only;
 * the collector verifies the current session and its own P4 snapshot afresh.
 * Credentials live only in this in-memory Auth handoff and HTTP headers. */
export function createAccountAnalytics({config={},window:host=globalThis.window,loadSdk=()=>import('../analytics/owned-analytics.js')}={}){
 let sdk=null,loading=null,session=null,key=null,epoch=0,active=false,expiryTimer=null,profileEditRecorded=false;
 const unavailable=()=>({queued:false,reason:'unavailable'});
 const credential=()=>active&&session?.access_token&&session.expires_at*1000>Date.now()?`Bearer ${session.access_token}`:null;
 const send=(url,options)=>{
  if(options.method==='DELETE')return host.fetch(url,options);
  const authorization=credential();if(!authorization){suspend();throw new Error('Account capture unavailable');}
  const attempt=epoch;
  return host.fetch(url,{...options,headers:{...options.headers,Authorization:authorization}}).then(response=>{if(epoch===attempt&&[401,403,409].includes(response.status))suspend();return response;});
 };
 function suspend(){
  host.clearTimeout(expiryTimer);expiryTimer=null;
  epoch++;active=false;session=null;key=null;profileEditRecorded=false;
  // setConsent fences synchronously before its first await. No Auth or core UI
  // operation waits on optional revocation transport.
  if(sdk)try{sdk.resetIdentity('account_boundary');void sdk.setConsent({accountAnalytics:false}).catch(()=>{});}catch{}
 }
 async function update({session:next,account}){
  if(config.enabled!==true||!config.baseUrl||!next?.access_token||!next?.user?.id||next.expires_at*1000<=Date.now()||account?.analyticsConsent!==true||!Number.isSafeInteger(account?.consentGeneration)){suspend();return;}
  const nextKey=`${next.user.id}:${account.consentGeneration}`;
  if(key===nextKey&&active){session=next;host.clearTimeout(expiryTimer);expiryTimer=host.setTimeout(suspend,Math.min(2147483647,next.expires_at*1000-Date.now()));return;}
  suspend();const attempt=++epoch;session=next;key=nextKey;active=true;
  expiryTimer=host.setTimeout(suspend,Math.min(2147483647,next.expires_at*1000-Date.now()));
  try{
   if(!sdk){
    loading??=loadSdk();const module=await loading;
    if(epoch!==attempt)return;
    sdk=module.createAnalyticsClient({siteId:'codevalanche',purpose:'accountAnalytics',baseUrl:config.baseUrl,pageVersion:config.pageVersion??'owned_analytics_1',window:host,fetch:send});
   }
   if(epoch!==attempt)return;
   await sdk.setConsent({accountAnalytics:true});if(epoch!==attempt)return;
   sdk.startPage({pageId:'account',surface:'authenticated_account'});
   sdk.track('account_page_viewed',{account_page_id:'profile'});
  }catch{if(epoch===attempt)suspend();}
 }
 function track(name,properties){try{if(!active)return unavailable();if(!credential()){suspend();return unavailable();}return sdk?.track(name,properties)??unavailable();}catch{return unavailable();}}
 return Object.freeze({update,suspend,track,startProfileEdit(){
  if(profileEditRecorded)return {queued:false,reason:'already_recorded'};
  // A refused, unready or storage-blocked focus is not an observation. Only a
  // fresh interaction accepted by this account/page/consent scope consumes it.
  const result=track('profile_edit_started',{edit_area_id:'profile'});
  if(result.queued)profileEditRecorded=true;
  return result;
 },async flush(){try{if(active)await sdk?.flush();}catch{}},dispose(){suspend();sdk?.dispose();}});
}
