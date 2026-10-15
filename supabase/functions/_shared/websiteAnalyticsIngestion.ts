import {validateWebsiteBatch} from './websiteAnalyticsContract.ts';
import type {BatchReceipt,BuildRegistry,ErrorCode,SiteId} from './websiteAnalyticsContract.ts';
import {hashCapability} from './websiteAnalyticsConsent.ts';

export class AnalyticsError extends Error {
 code:ErrorCode;retryAfterMs:number|null;status:number;
 constructor(code:ErrorCode,retryAfterMs:number|null=null,status?:number){super(code);this.code=code;this.retryAfterMs=retryAfterMs;this.status=status??({invalid_consent:403,stale_generation:409,origin_not_allowed:403,rate_limited:429,unauthenticated:401,forbidden:403,source_unavailable:503}[code]??400);}
}
export function siteForOrigin(origin:string):SiteId {
 if(origin==='https://radovar.com')return 'radovar';
 if(origin==='https://codevalanche.com')return 'codevalanche';
 throw new AnalyticsError('origin_not_allowed');
}
export async function analyticsRpc(service:any,name:string,args:Record<string,unknown>):Promise<any> {
 const {data,error}=await service.rpc(name,args);
 if(error){const code=['invalid_consent','stale_generation','invalid_fields','forbidden'].find(c=>error.message===c) as ErrorCode|undefined;throw new AnalyticsError(code??'source_unavailable');}
 const value=Array.isArray(data)?data[0]:data;
 const result=value&&Object.hasOwn(value,name)?value[name]:value;
 if(result?.error)throw new AnalyticsError(result.error,result.retryAfterMs??null);
 return result;
}
type Context={origin:string;service:any;registry?:BuildRegistry};
/** A proof is intentionally not accepted here until a real current P4 adapter
 * verifies BOTH the principal and per-event generation binding. */
export async function ingestWebsiteBatch(input:any,context:Context):Promise<BatchReceipt> {
 const siteId=siteForOrigin(context.origin);
 if(!input||Object.keys(input).sort().join(',')!=='collectionToken,events,generation,receiptId'||typeof input.collectionToken!=='string'||!/^[A-Za-z0-9_-]{32,128}$/.test(input.collectionToken)||typeof input.receiptId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.receiptId)||!Number.isSafeInteger(input.generation)||input.generation<1||new TextEncoder().encode(JSON.stringify(input)).length>32768||!Array.isArray(input.events)||input.events.length<1||input.events.length>50)throw new AnalyticsError('invalid_fields');
 const collectionHash=await hashCapability(input.collectionToken);
 const args={p_receipt_id:input.receiptId,p_site_id:siteId,p_generation:input.generation,p_collection_hash:collectionHash};
 let row;
 try {row=await analyticsRpc(context.service,'wa_get_collection_receipt',args);}
 catch(error){
  if(error instanceof AnalyticsError&&['invalid_consent','stale_generation'].includes(error.code))await analyticsRpc(context.service,'wa_health_increment',{p_site_id:siteId,p_counter:'rejected_consent',p_count:input.events.length});
  throw error;
 }
 if(!row)throw new AnalyticsError('invalid_consent');
 const receipt={receiptId:row.receipt_id,siteId:row.site_id,policyVersion:row.policy_version,generation:Number(row.generation),purposes:{websiteAnalytics:row.website_analytics,accountAnalytics:row.account_analytics},issuedAt:new Date(row.issued_at).toISOString(),expiresAt:new Date(row.expires_at).toISOString(),revokedAt:row.revoked_at};
 const receivedAt=new Date().toISOString();
 // The pre-auth event vocabulary is server-owned. Generic account engagement
 // remains protected; a client surface label cannot downgrade A to W.
 const preAuth=new Set(['signup_started','signup_form_submitted','verification_notice_viewed','login_started','login_form_submitted','auth_challenge_viewed','password_reset_requested_ui','password_reset_form_submitted','account_entry_clicked']);
 const events:any[]=[],rejected:any[]=[];
 for(const raw of input.events){
  const surface=(raw?.page_id==='account'||raw?.page_id==='account_authorize')&&preAuth.has(raw?.event_name)?'pre_auth':undefined;
  const result=validateWebsiteBatch([raw],{origin:context.origin,receivedAt,receipt,surface,registry:context.registry});
  const item=result.accepted?result.results[0]:{accepted:false,reason:result.reason};
  if(item.accepted)events.push(item.event);
  else rejected.push({eventId:typeof raw?.event_id==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(raw.event_id)?raw.event_id:null,code:item.reason});
 }
 return analyticsRpc(context.service,'wa_ingest_website_batch',{...args,p_events:events,p_rejected:rejected});
}
