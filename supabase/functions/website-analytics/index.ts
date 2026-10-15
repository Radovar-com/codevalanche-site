import {issueConsentReceipt,revokeConsentReceipt} from '../_shared/websiteAnalyticsConsent.ts';
import {AnalyticsError,analyticsRpc,ingestWebsiteBatch,siteForOrigin} from '../_shared/websiteAnalyticsIngestion.ts';
import {authorizeWebsiteReport} from '../_shared/websiteAnalyticsAuthorization.ts';
import {confirmWebsiteAccount} from '../_shared/websiteAccountContext.ts';
import {readAccountOutcomeReport} from '../_shared/accountOutcomeReports.ts';
import {validateReportQuery,validateContractDto} from '../_shared/websiteAnalyticsContract.ts';
import type {BuildRegistry,ReportView} from '../_shared/websiteAnalyticsContract.ts';

type Options={service:any;issuer:string;clientIds?:string[];networkSecret:string;registry?:BuildRegistry;readReport?:(actor:any,query:any,view:ReportView)=>Promise<unknown>};
async function readBody(request:Request){
 if(!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type')??''))throw new AnalyticsError('invalid_fields',null,415);
 const reader=request.body?.getReader();if(!reader)throw new AnalyticsError('invalid_fields');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>32768){await reader.cancel();throw new AnalyticsError('invalid_fields',null,413);}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new AnalyticsError('invalid_fields');}
}
async function networkHash(address:string,secret:string){
 if(!address||!secret)throw new AnalyticsError('source_unavailable');
 const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`${Math.floor(Date.now()/3600000)}:${address}`));
 return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}
export function createWebsiteAnalyticsHandler(options:Options){
 return async(request:Request,connection?:{remoteAddress?:string})=>{
  const headers:Record<string,string>={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,DELETE,GET,OPTIONS'};
  const respond=(body:unknown,status=200)=>new Response(body===null?null:JSON.stringify(body),{status,headers});
  try{
   const url=new URL(request.url),path=url.pathname.replace(/^\/functions\/v1\/website-analytics/,'').replace(/^\/website-analytics/,'');
   const report=path.match(/^\/v1\/reports\/([a-z]+)$/),origin=request.headers.get('origin')??'';
   if(origin){siteForOrigin(origin);headers['Access-Control-Allow-Origin']=origin;}
   if(request.method==='OPTIONS'){siteForOrigin(origin);return respond(null,204);}
   if(report&&request.method==='GET'){
    const actor=await authorizeWebsiteReport(request,options);
    let query;try{if([...url.searchParams.keys()].some(k=>k!=='query')||url.searchParams.getAll('query').length!==1)throw 0;query=JSON.parse(url.searchParams.get('query')??'');}catch{throw new AnalyticsError('unsupported_query');}
    const view=report[1] as ReportView,result=validateReportQuery(query,view,options.registry);
    if(!result.accepted)throw new AnalyticsError('unsupported_query');
    if(!options.readReport&&view!=='accounts')throw new AnalyticsError('source_unavailable');
    const data=options.readReport?await options.readReport(actor,result.query,view):await readAccountOutcomeReport(actor,result.query,options.service);
    if(!validateContractDto('WebsiteReport',data)||(data as any)?.sourceQuality?.view!==view)throw new AnalyticsError('source_unavailable');
    return respond(data);
   }
   const siteId=siteForOrigin(origin);
   // Connection address is supplied by the server runtime, never a forwarded
   // header. On hosted gateways this may be shared infrastructure (T12 gate).
   const retry=Number(await analyticsRpc(options.service,'wa_take_rate_limit',{p_scope:'network',p_key_hash:await networkHash(connection?.remoteAddress??'',options.networkSecret),p_site_id:siteId}));
   if(!Number.isFinite(retry))throw new AnalyticsError('source_unavailable');
   if(retry>0)throw new AnalyticsError('rate_limited',retry);
   if(url.search)throw new AnalyticsError('invalid_fields');
   if(path==='/v1/events'&&request.method==='POST')return respond(await ingestWebsiteBatch(await readBody(request),{origin,service:options.service,registry:options.registry,confirmAccount:()=>confirmWebsiteAccount(request,options)}));
   if(path==='/v1/consent/receipts'&&request.method==='POST'){
    const body=await readBody(request),account=body?.purposes?.accountAnalytics===true?await confirmWebsiteAccount(request,options):undefined;
    return respond(await issueConsentReceipt(body,{origin,service:options.service,account}),201);
   }
   const revoke=path.match(/^\/v1\/consent\/receipts\/([0-9a-f-]+)$/i);
   if(revoke&&request.method==='DELETE'){const proof=await readBody(request);if(proof?.receiptId!==revoke[1])throw new AnalyticsError('invalid_fields');return respond(await revokeConsentReceipt(proof,{origin,service:options.service}));}
   throw new AnalyticsError('invalid_fields',null,404);
  }catch(error){
   let safe=error instanceof AnalyticsError?error:null;
   if(!safe&&error instanceof Error&&['invalid_fields','invalid_consent','stale_generation','origin_not_allowed'].includes(error.message))safe=new AnalyticsError(error.message as any);
   safe??=new AnalyticsError('source_unavailable');
   if(safe.retryAfterMs!==null)headers['Retry-After']=String(Math.ceil(safe.retryAfterMs/1000));
   return respond({error:{code:safe.code,message:'Analytics request could not be processed.'},requestId:crypto.randomUUID(),retryAfterMs:safe.retryAfterMs},safe.status);
  }
 };
}

// Dynamic import keeps the identical handler executable in the existing Node
// HTTP harness. No local dependency/runtime installation is required.
if(typeof Deno!=='undefined'&&import.meta.main){
 const {createClient}=await import('npm:@supabase/supabase-js@2.116.0');
 const url=Deno.env.get('SUPABASE_URL')??'';
 const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')??'',{auth:{persistSession:false,autoRefreshToken:false}});
 const handler=createWebsiteAnalyticsHandler({service,issuer:`${url.replace(/\/$/,'')}/auth/v1`,clientIds:(Deno.env.get('ACCOUNT_OAUTH_CLIENT_IDS')??'').split(',').filter(Boolean),networkSecret:Deno.env.get('WEBSITE_ANALYTICS_NETWORK_SECRET')??''});
 Deno.serve((request,info)=>handler(request,{remoteAddress:info.remoteAddr.hostname}));
}
