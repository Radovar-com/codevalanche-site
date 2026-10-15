import schema from '../../../supabase/contracts/website-analytics/v1/contract.schema.json' with {type:'json'};
import {registered,PROPERTY_IDS} from './registry.js';
const unsafe=/(?:@|https?:|www\.|[/?#\\]|(?:access|refresh)[_-]?token|oauth[=:#?]|password[=:\s]|bearer\s|service[_-]?key|(?:^|\s)[A-Za-z]:)/i;
export const safeId=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value)&&!unsafe.test(value);
function matches(s,v){
 if(s.anyOf&&!s.anyOf.some(part=>matches(part,v)))return false;if(s.oneOf&&s.oneOf.filter(part=>matches(part,v)).length!==1)return false;
 if(s.type==='null')return v===null;if(s.type==='array')return Array.isArray(v)&&v.length>=(s.minItems??0)&&v.length<=(s.maxItems??Infinity)&&v.every(item=>matches(s.items,item));
 if(s.const!==undefined&&s.const!==v)return false;if(s.enum&&!s.enum.includes(v))return false;
 if(s.type==='object'){if(!v||Object.getPrototypeOf(v)!==Object.prototype)return false;if((s.required??[]).some(k=>!Object.hasOwn(v,k)))return false;return Object.entries(v).every(([k,x])=>s.properties[k]&&matches(s.properties[k],x));}
 if(s.type==='string')return typeof v==='string'&&v.length>=(s.minLength??0)&&v.length<=(s.maxLength??Infinity)&&(!s.pattern||new RegExp(s.pattern).test(v))&&(s.format!=='date-time'||/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(v)&&Number.isFinite(Date.parse(v)))&&(s.format!=='uuid'||/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v));
 if(s.type==='integer'||s.type==='number')return typeof v==='number'&&Number.isFinite(v)&&(s.type!=='integer'||Number.isSafeInteger(v))&&v>=(s.minimum??-Infinity)&&v<=(s.maximum??Infinity);
 return s.type==='boolean'?typeof v==='boolean':true;
}
export function sanitizeEvent(name,properties,context,site,registry){
 const branch=schema.$defs.WebsiteEventV1.oneOf.find(s=>s.properties.event_name.const===name);if(!branch||!matches(branch.properties.properties,properties)||!matches(branch.properties.context,context??{}))return null;
 for(const [key,value] of Object.entries(properties)){if(typeof value==='string'&&unsafe.test(value))return null;if(PROPERTY_IDS[key]&&!registered(PROPERTY_IDS[key],value,site,registry))return null;}
 for(const [key,value] of Object.entries(context??{})){if(key!=='referrer_domain'&&unsafe.test(value))return null;if(key==='landing_page_id'&&!registered('page',value,site))return null;}
 if(name==='cta_clicked'&&(['download','signup','login','contact'].includes(properties.action_id)||['download','signup','login','contact'].includes(properties.cta_id)))return null;
 if(name==='page_engagement_reported'&&properties.active_ms_total>properties.visible_ms_total)return null;
 if(name==='web_vital_reported'&&properties.unit!==(properties.metric==='CLS'?'score':'ms'))return null;
 return {properties:{...properties},context:{...context}};
}

export function validStoredEvent(event,site,registry){
 const branch=schema.$defs.WebsiteEventV1.oneOf.find(s=>s.properties.event_name.const===event?.event_name);
 return !!branch&&matches(branch,event)&&event.site_id===site&&safeId(event.page_id)&&safeId(event.page_version)&&registered('page',event.page_id,site)&&Number.isFinite(Date.parse(event.occurred_at))&&!!sanitizeEvent(event.event_name,event.properties,event.context,site,registry);
}

export const validBatchReceipt=value=>matches(schema.$defs.BatchReceipt,value);

/** Read only after a valid collection lease. No raw URL, referrer path, UA or query is retained. */
export function browserContext(host,{acquisition=false}={}){
 const result={};
 try{
  const nav=host.navigator,ua=nav.userAgent??'';
  result.os_family=/Android/i.test(ua)?'android':/iPhone|iPad|iPod/i.test(ua)?'ios':/Windows/i.test(ua)?'windows':/Mac/i.test(ua)?'macos':/Linux/i.test(ua)?'linux':'unknown';
  result.browser_family=/Edg\//.test(ua)?'edge':/Firefox\//.test(ua)?'firefox':/Chrome\/|CriOS\//.test(ua)?'chrome':/Safari\//.test(ua)?'safari':ua?'other':'unknown';
  result.device_class=/iPad|Tablet/i.test(ua)?'tablet':/Mobile|iPhone|iPod/i.test(ua)?'mobile':ua?'desktop':'unknown';
  result.viewport_bucket=Number.isFinite(host.innerWidth)?host.innerWidth<768?'small':host.innerWidth<1200?'medium':'large':'unknown';
  const locale=nav.language??'';result.locale=/^[a-z]{2}(?:-[A-Z]{2})?$/.test(locale)?locale:'unknown';
 }catch{}
 if(acquisition)try{
  const url=new URL(host.location.href);
  // Only a single value per allowed key; reject PII/URL/token-like values before queueing.
  for(const [query,key] of Object.entries({utm_source:'acquisition_source',utm_medium:'acquisition_medium',utm_campaign:'campaign',utm_content:'content',utm_term:'term'})){
   const values=url.searchParams.getAll(query),value=values[0];if(values.length===1&&typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,79}$/.test(value)&&!unsafe.test(value)&&!/(?:email|token|password|secret|authorization|bearer|[0-9][0-9 .-]{6,}|^[0-9a-f]{8}-[0-9a-f-]{27,}$)/i.test(value))result[key]=value;
  }
  result.referrer_domain='unknown';
  if(host.document.referrer){const ref=new URL(host.document.referrer),domain=ref.hostname.toLowerCase();if(['http:','https:'].includes(ref.protocol)&&!ref.username&&!ref.password&&ref.origin!==url.origin&&domain.length<=253&&/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(domain)&&!/^\d+(?:\.\d+){3}$/.test(domain))result.referrer_domain=domain;}
 }catch{}
 return result;
}
