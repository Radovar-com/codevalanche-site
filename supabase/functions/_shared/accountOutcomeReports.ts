import {validateReportQuery,validateContractDto} from './websiteAnalyticsContract.ts';
import {AnalyticsError,analyticsRpc} from './websiteAnalyticsIngestion.ts';
import {conversionCounts} from './conversionReceipts.ts';
import type {AccountOutcomeReport,ReportQuery,ProviderCoverage} from './websiteAnalyticsContract.ts';

/** actor must come from authorizeWebsiteReport (current session + MFA); SQL
 * rechecks role/current policy. This operational population never divides W. */
export async function readAccountOutcomeReport(actor:any,query:ReportQuery,service:any):Promise<AccountOutcomeReport>{
 if(!validateReportQuery(query,'accounts').accepted||Object.keys(query.filters).length||query.groupBy?.length||query.cursor||query.comparison)throw new AnalyticsError('unsupported_query');
 const data=await analyticsRpc(service,'wa_read_account_outcomes',{p_actor_id:actor?.actorId,p_from:query.from,p_to:query.to,p_timezone:query.timeZone});
 if(!data||!Array.isArray(data.rows))throw new AnalyticsError('source_unavailable');
 data.observedFrom=data.observedFrom?new Date(data.observedFrom).toISOString():null;data.watermark=data.watermark?new Date(data.watermark).toISOString():null;for(const row of data.rows)row.watermark=row.watermark?new Date(row.watermark).toISOString():null;
 const available=query.siteId!=='radovar',generatedAt=new Date().toISOString(),population='operational_accounts';
 const rows=data.rows.map((r:any)=>{
  const count=available?r.count:null,coverage=available?r.coverage:'not_configured';
  if(count!==null&&(!Number.isSafeInteger(count)||count<0))throw new AnalyticsError('source_unavailable');
  return {concept:r.concept,coverage,...conversionCounts(r.concept,count,r.attributed),dimensions:{}};
 });
 const observedFrom=available&&Date.parse(data.observedFrom)<Date.parse(query.to)&&Date.parse(data.watermark)>=Date.parse(query.from)?new Date(Math.max(Date.parse(query.from),Date.parse(data.observedFrom))).toISOString():null;
 const observedTo=observedFrom?new Date(Math.min(Date.parse(query.to),Date.parse(data.watermark))).toISOString():null;
 const providerCoverage:ProviderCoverage[]=data.rows.map((r:any)=>({concept:r.concept,status:available?r.coverage:'not_configured',source:r.source,watermark:available?r.watermark:null}));
 const result:AccountOutcomeReport={definitionVersion:'1',status:available?'partial':'not_configured',population,
  period:{from:query.from,to:query.to,timeZone:query.timeZone,observedFrom,observedTo},
  metrics:rows.map((r:any)=>({id:r.concept,value:r.count,unit:'count',population,numerator:r.count,denominator:null,status:r.count===null?'unmeasured':r.coverage==='measured'?'measured':'partial',exactness:r.count===null?'not_applicable':'exact'})),
  breakdowns:[{dimension:'concept',rows,nextCursor:null}],capabilities:rows.map((r:any)=>({metricId:r.concept,window:'raw_90_days',filters:[],groupBy:[],method:r.concept==='login_succeeded'?'provider_session_primary_issuance':'retained_verified_account_outcomes',reason:r.concept==='login_succeeded'?`Password from ${data.providerSessionSource?.observedFrom?new Date(data.providerSessionSource.observedFrom).toISOString():'unknown'}. Native social OAuth from ${data.providerSessionSource?.oauthObservedFrom?new Date(data.providerSessionSource.oauthObservedFrom).toISOString():'unknown'}. Recovery and delegated grants excluded. Partial issuance, not MFA or admission.`:'Operational account results, unsupported segmentation and provider gaps remain explicit.'})),
  sampleSize:rows.reduce((n:number,r:any)=>n+(r.count??0),0),generatedAt,watermark:available?data.watermark:null,
  sourceQuality:{view:'accounts',sources:[{source:'account_v2',status:available?'partial':'not_configured',watermark:available?data.watermark:null,observedFrom:available?data.observedFrom:null,observedTo:available?data.watermark:null}],botFiltering:'not_configured',rawWindowStart:data.observedFrom,rollupWindowStart:null,providerCoverage},
  consentCoverage:{status:'unknown',numerator:null,denominator:null},
  limitations:['Operational outcomes and optional account observations are separate populations.','Auth counts describe retained accounts, excluding erased users; signup creation and email verification are separate timestamps.','Provider events are observed partial coverage, never browser auth-callback success; password verification and token refresh are separate concepts.','Login uses only independently qualified prospective primary password or native social OAuth session receipts, once per canonical session. Delegated code grants, unsupported methods and pre-method-installation history are excluded. The source watermark is the last successfully captured observation, not proof of continuous coverage. Capture failures disable qualification when health persistence is available; a simultaneous health-store failure can only be described as partial coverage.', 'Profile collection begins at migration activation; raw outcomes retain 90 days. UUID results are terminal outcomes: a successful retry replaces an earlier failure at the success time. Legacy results are uncorrelated attempts.','Successful profile attribution requires an exact operation UUID plus receipt principal/P4 generation. Failures stay unassigned without an original snapshot. Signup/login have no qualified provider nonce handoff.','Account outcomes cannot be assigned to Radovar, campaigns or Guest history. No W conversion denominator is asserted.']};
 if(!validateContractDto('AccountOutcomeReport',result))throw new AnalyticsError('source_unavailable');return result;
}
