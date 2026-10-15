import {qualifiedAssets,trustedDownloadManifest} from '../_shared/downloadManifest.ts';
import {createDownloadEvidenceStore} from '../_shared/downloadEvidence.ts';
import type {DownloadRequestEvidence} from '../_shared/downloadEvidence.ts';

export function createDownloadRedirectHandler({manifest=trustedDownloadManifest,record,waitUntil}:{manifest?:any;record?:(e:DownloadRequestEvidence)=>unknown;waitUntil?:(p:Promise<unknown>)=>void}={}){
 const assets=qualifiedAssets(manifest);
 return async(request:Request)=>{
  const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Type':'application/json'};
  const fail=(status:number,state:string)=>new Response(request.method==='HEAD'?null:JSON.stringify({status:state}),{status,headers});
  if(!['GET','HEAD'].includes(request.method))return fail(405,'method_not_allowed');
  const url=new URL(request.url),path=url.pathname.replace(/^\/functions\/v1\/download-redirect/,'').replace(/^\/download-redirect/,'');
  if(url.search)return fail(400,'invalid_request');
  const route=path.match(/^\/v1\/(codevalanche|radovar)\/(windows|mac-arm|mac-intel|linux)\/([A-Za-z0-9_.-]{1,64})\/([A-Za-z0-9_.-]{1,64})$/);
  if(!route)return fail(400,'invalid_request');
  const [,siteId,platform,releaseId,artifactId]=route,asset=assets.find(a=>a.siteId===siteId&&a.platform===platform&&a.releaseId===releaseId&&a.artifactId===artifactId);
  const response=asset?new Response(null,{status:302,headers:{...headers,Location:asset.targetUrl}}):fail(404,'not_configured');
  // No receipt/session/identity, request URL, network headers or range data enter D.
  // Evidence is best effort and must never delay or prevent the native redirect.
  if(record&&request.method==='GET'){
   const evidence:DownloadRequestEvidence={requestId:crypto.randomUUID(),eventName:asset?'download_redirected':'download_request_failed',responseClass:asset?'3xx':'4xx',normalizedError:asset?null:'unavailable',siteId,platform,architecture:asset?.architecture??'unknown',releaseId:asset?.releaseId??'unknown',artifactId:asset?.artifactId??'unknown',observedAt:new Date().toISOString()};
   try{const pending=Promise.resolve(record(evidence)).catch(()=>{});try{waitUntil?.(pending);}catch{}}catch{}
  }
  return response;
 };
}
if(typeof Deno!=='undefined'&&import.meta.main){
 const {createClient}=await import('npm:@supabase/supabase-js@2.116.0');
 const service=createClient(Deno.env.get('SUPABASE_URL')??'',Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{auth:{persistSession:false,autoRefreshToken:false}});
 Deno.serve(createDownloadRedirectHandler({record:createDownloadEvidenceStore(service),waitUntil:p=>EdgeRuntime.waitUntil(p)}));
}
