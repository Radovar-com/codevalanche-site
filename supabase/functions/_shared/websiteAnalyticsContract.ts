import contractSchema from '../../contracts/website-analytics/v1/contract.schema.json' with { type: 'json' };

export const DEFINITION_VERSION = '1' as const;
export const WEBSITE_ANALYTICS_LIMITS = Object.freeze({ batchEvents:50, batchBytes:32768, browserQueueEvents:100, browserQueueAgeMs:86400000, futureSkewMs:300000, serverLateMs:604800000, rawRetentionDays:90, rollupRetentionMonths:13, reportRangeDays:400 });
export type SiteId = 'radovar' | 'codevalanche';
export type ReportView = 'overview'|'acquisition'|'pages'|'sections'|'journeys'|'downloads'|'accounts'|'quality'|'health';
export type ErrorCode = 'invalid_fields'|'unknown_event'|'forbidden_property'|'invalid_consent'|'stale_generation'|'origin_not_allowed'|'rate_limited'|'unauthenticated'|'forbidden'|'unsupported_query'|'source_unavailable';
export type ConsentState = {policyVersion:string;websiteAnalytics:boolean;accountAnalytics:boolean;state:'unknown'|'denied'|'granted'|'withdrawn'|'pending_revoke';generation:number;changedAt:string};
export type ConsentReceipt = {receiptId:string;siteId:SiteId;policyVersion:string;generation:number;purposes:{websiteAnalytics:boolean;accountAnalytics:boolean};issuedAt:string;expiresAt:string;collectionToken:string;revocationProof:string};
export type VerifiedConsentReceipt = Omit<ConsentReceipt,'collectionToken'|'revocationProof'> & {revokedAt?:string|null};
export type RevocationProof = {receiptId:string;generation:number;capability:string};
export type BatchReceipt = {acceptedIds:string[];duplicateIds:string[];rejected:{eventId:string|null;code:ErrorCode}[];generation:number;receivedAt:string;retryAfterMs:number|null};
export type ErrorResponse = {error:{code:ErrorCode;message:'Analytics request could not be processed.'};requestId:string;retryAfterMs:number|null};
export type EventName = 'session_started'|'page_viewed'|'page_engagement_reported'|'page_exited'|'section_viewed'|'section_engagement_reported'|'scroll_depth_reached'|'cta_clicked'|'navigation_used'|'outbound_clicked'|'feature_selected'|'faq_toggled'|'download_platform_selected'|'download_unavailable_shown'|'download_clicked'|'contact_clicked'|'account_entry_clicked'|'signup_started'|'signup_form_submitted'|'verification_notice_viewed'|'login_started'|'login_form_submitted'|'auth_challenge_viewed'|'account_page_viewed'|'profile_edit_started'|'profile_save_submitted'|'password_reset_requested_ui'|'password_reset_form_submitted'|'logout_clicked'|'web_vital_reported'|'javascript_error_observed'|'resource_load_failed'|'interaction_failed';
export type WebsiteEventV1 = {schema_version:1;event_id:string;site_id:SiteId;event_name:EventName;occurred_at:string;page_id:string;page_instance_id:string;page_version:string;session_id:string;anonymous_id:string;consent_receipt_id:string;consent_generation:number;properties:Record<string,string|number|boolean>;context?:Record<string,string>};
export type ClockQuality = 'original'|'adjusted'|'late';
export type Surface = 'marketing'|'pre_auth'|'authenticated_account';
export type ValidatedWebsiteEvent = {input:WebsiteEventV1;eventAt:string;receivedAt:string;clockQuality:ClockQuality;eventSource:'W'|'A';authority:'browser_observation'|'consented_account_observation';surface:Surface};
export type ValidationResult = {accepted:true;event:ValidatedWebsiteEvent}|{accepted:false;reason:ErrorCode};
export type BatchValidationResult = {accepted:true;results:ValidationResult[]}|{accepted:false;reason:ErrorCode};
export type ReportFilter = 'pageId'|'sectionId'|'ctaId'|'acquisitionSource'|'campaign'|'deviceClass'|'osFamily'|'browserFamily'|'country'|'platform'|'releaseId'|'appVersion'|'channel'|'trafficClass';
export type ReportFilters = Partial<Record<ReportFilter,string[]>>;
export type ReportQuery = {accountMode?:'outcomes'|'activity';siteId:SiteId|'all';from:string;to:string;timeZone:string;granularity:'day'|'week';filters:ReportFilters;comparison?:{from:string;to:string}|null;limit?:number;cursor?:string|null;groupBy?:ReportFilter[]};
export type Population = 'consented_website_observations'|'operational_accounts'|'consented_account_activity';
export type MetricValue = {id:string;value:number|null;unit:'count'|'ratio'|'ms'|'score';population:Population;numerator:number|null;denominator:number|null;status:'measured'|'partial'|'unmeasured'|'unsupported_window';exactness:'exact'|'estimate'|'not_applicable'};
export type ReportStatus = 'ready'|'partial'|'insufficient_data'|'not_configured'|'unavailable';
export type Source = 'browser'|'account_v2'|'provider_audit'|'release_provider'|'delivery'|'native_ledger'|'consent_registry'|'collector';
export type CoverageStatus = 'measured'|'partial'|'unknown'|'not_configured'|'unavailable';
export type SourceCoverage = {source:Source;status:CoverageStatus;watermark:string|null;observedFrom:string|null;observedTo:string|null};
export type AccountConcept = 'account_created'|'email_verified'|'login_succeeded'|'login_failed'|'password_valid'|'password_invalid'|'token_refreshed'|'session_revoked'|'logout_completed'|'profile_update_succeeded'|'profile_update_failed'|'password_reset_completed'|'password_changed'|'mfa_completed'|'app_admitted'|'account_deletion_requested'|'account_deletion_completed';
export type ProviderCoverage = {concept:AccountConcept;status:'measured'|'partial'|'unmeasured'|'not_configured';source:'auth_users'|'provider_audit'|'password_hook'|'account_operation'|'lifecycle_job'|'unavailable';watermark:string|null};
type QualityBase = {sources:SourceCoverage[];botFiltering:'known_bots_only'|'not_configured';rawWindowStart:string|null;rollupWindowStart:string|null};
export type SourceQualityByView = {
 overview:QualityBase & {view:'overview';identity:'consented_browser_ids_only'};
 acquisition:QualityBase & {view:'acquisition';attribution:'session_start_only'|'unknown'};
 pages:QualityBase & {view:'pages';engagement:'visible_recent_interaction_estimate'};
 sections:QualityBase & {view:'sections';exposure:'continuous_1000ms_min_half_section_or_viewport'};
 journeys:QualityBase & {view:'journeys';ordering:'same_session'|'attributed_7_day'|'unmeasured'};
 downloads:QualityBase & {view:'downloads';releaseCounterSemantics:'provider_count_only'|'not_configured';transferServed:'measured'|'not_configured';guestActivation:'unmeasured'};
 accounts:QualityBase & {view:'accounts';providerCoverage:ProviderCoverage[]};
 quality:QualityBase & {view:'quality';vitals:'latest_revision_per_metric'|'not_configured'};
 health:QualityBase & {view:'health';rawRetentionDays:90;rollupRetentionMonths:13};
};
export type Platform = 'web'|'windows'|'macos'|'linux'|'ios'|'android'|'unknown';
export type JourneyOutcome = {reachedSessions:number;conversion:number}|{reachedSessions:number|null;conversion:null};
// Both known attribution parts must sum to a known total. Any known part is at
// most a known total; an unknown part stays null and is never inferred as zero.
export type AccountOutcomeCounts = {coverage:'unmeasured'|'not_configured';count:null;attributedCount:null;unattributedCount:null}|{coverage:'measured'|'partial';count:number|null;attributedCount:number|null;unattributedCount:number|null};
type RowFieldsByView = {
 overview:{siteId:SiteId;bucketStart:string;sessionStarts:number;pageViews:number;dailyAnonymousIds:number|null};
 acquisition:{acquisitionSource:string;acquisitionMedium:string;campaign:string;landingPageId:string;sessions:number;attribution:'campaign'|'referrer'|'unknown'};
 pages:{pageId:string;pageVersion:string;pageViews:number;eligibleViews:number;activeMs:number|null;visibleMs:number|null;maxScrollPct:number|null};
 sections:{pageId:string;pageVersion:string;sectionId:string;eligibleViews:number;exposedViews:number;reach:number|null;activeMs:number|null;ctaAfterExposureViews:number};
 journeys:{journeyId:string;stepId:string;stepOrder:number;eligibleSessions:number;window:'same_session'|'7_day';attribution:'same_session'|'server_correlated'|'unattributed'|'unmeasured'} & JourneyOutcome;
 downloads:{platform:Platform;architecture:'x64'|'arm64'|'x86'|'universal'|'unknown';releaseId:string;artifactId:string;clicks:number|null;redirects:number|null;providerCountDelta:number|null;transferServed:number|null;firstObservedOpens:number|null;activations:number|null;counterStatus:'measured'|'baseline'|'reset'|'asset_removed'|'not_configured'};
 accounts:{concept:AccountConcept|'account_page_viewed'|'profile_edit_started'|'profile_save_submitted'|'logout_clicked'|'page_engagement_reported'} & AccountOutcomeCounts;
 quality:{pageId:string;buildSha:string;metric:'LCP'|'INP'|'CLS'|'javascript_error'|'resource_load_failed'|'interaction_failed';value:number|null;unit:'ms'|'score'|'count';sampleSize:number;statistic:'p75'|'count';normalizedCode:string|null};
 health:{source:Source;status:CoverageStatus;lastEventAt:string|null;watermark:string|null;lagMs:number|null;accepted:number;rejectedSchema:number;rejectedConsent:number;duplicate:number;rateLimited:number;botSuspected:number;queueExpired:number;lateArrival:number;clockAdjusted:number};
};
export type ReportFilterByView = {
 overview:'pageId'|'acquisitionSource'|'campaign'|'deviceClass'|'osFamily'|'browserFamily'|'country'|'trafficClass';
 acquisition:'pageId'|'acquisitionSource'|'campaign'|'deviceClass'|'osFamily'|'browserFamily'|'country'|'trafficClass';
 pages:'pageId'|'acquisitionSource'|'campaign'|'deviceClass'|'osFamily'|'browserFamily'|'country'|'trafficClass';
 sections:'pageId'|'sectionId'|'ctaId'|'acquisitionSource'|'campaign'|'deviceClass'|'osFamily'|'browserFamily'|'country'|'trafficClass';
 journeys:'pageId'|'ctaId'|'acquisitionSource'|'campaign'|'deviceClass'|'platform'|'trafficClass';
 downloads:'pageId'|'ctaId'|'acquisitionSource'|'campaign'|'deviceClass'|'osFamily'|'country'|'platform'|'releaseId'|'appVersion'|'channel'|'trafficClass';
 accounts:'platform'|'appVersion'|'channel';
 quality:'pageId'|'deviceClass'|'osFamily'|'browserFamily'|'country'|'appVersion'|'trafficClass';
 health:'trafficClass';
};
export type ReportRowByView = {[V in ReportView]:RowFieldsByView[V] & {dimensions:Partial<Record<ReportFilterByView[V],string>>}};
export type ReportCapability = {metricId:string;window:'raw_90_days'|'rollup_13_months'|'same_session'|'7_day'|'unsupported_window';filters:ReportFilter[];groupBy:ReportFilter[];method:string;reason:string|null};
export type ReportForView<V extends ReportView> = {definitionVersion:'1';status:ReportStatus;population:V extends 'accounts'?'operational_accounts'|'consented_account_activity':'consented_website_observations';period:{from:string;to:string;timeZone:string;observedFrom:string|null;observedTo:string|null};metrics:MetricValue[];breakdowns:{dimension:ReportFilterByView[V]|'time'|'site'|'source'|'concept'|'journey'|'artifact'|'metric'|'group';rows:ReportRowByView[V][];nextCursor:string|null}[];capabilities:ReportCapability[];sampleSize:number;generatedAt:string;watermark:string|null;sourceQuality:SourceQualityByView[V];consentCoverage:{status:'measured'|'partial'|'unknown';numerator:number|null;denominator:number|null};limitations:string[]};
export type WebsiteReport = {[V in ReportView]:ReportForView<V>}[ReportView];
export type AccountOutcomeReport = ReportForView<'accounts'>;

// Registries are build-owned; never take their overrides from the browser/request body.
export const PAGE_REGISTRY:Record<SiteId,readonly string[]> = Object.freeze({radovar:['home','docs','security','privacy','terms','press','releases_archive','changelog_archive','not_found'],codevalanche:['home','changelog','privacy','terms','account_entry_legacy','account','account_authorize','not_found']});
export const SECTION_REGISTRY:Record<SiteId,readonly string[]> = Object.freeze({radovar:['intro','codevalanche','company','resources','footer'],codevalanche:['hero','product_principle','product','accounts','parallel','workflow','details','showcase','companion','privacy_principles','download','proof','faq','footer']});
export type RegistryKind = 'page'|'section'|'cta'|'action'|'feature'|'error'|'navigation'|'selection'|'faq'|'contact'|'entryPoint'|'editArea'|'accountSurface'|'component'|'resource'|'release'|'artifact';
export type BuildRegistry = Partial<Record<RegistryKind,readonly string[]>>;
const initialRegistry:BuildRegistry = {
 cta:['header','intro','product_panel','resources','footer','download','signup','login','contact','docs','product'],action:['download','signup','login','contact','docs','product','navigate'],feature:['project','agents','review','local_first'],error:['unknown','network_error','request_failed','unavailable','timeout','invalid_response'],navigation:['header','footer','anchor','account'],selection:['project','agents','review','local_first'],faq:['guest','privacy','platforms','accounts','download','product','agents'],contact:['info','press','security'],entryPoint:['header','hero','accounts','footer','account','signin','signup','password_reset'],editArea:['profile'],accountSurface:['overview','profile','security','sessions','consent','authorize'],component:['page','account','download','product'],resource:['logo','styles','app','font'],release:['unknown'],artifact:['unknown'],
};
/** Trusted P4 adapter proof: current principal/consent plus the server-stored
 * receipt AND event binding snapshot. Never derive any of these from browser
 * labels or mere current opt-in. Regrant must not revive an old A queue.
 */
export type ConfirmedAccountContext = {confirmed:true;principalId:string;consentGeneration:number;boundPrincipalId:string;boundConsentGeneration:number};
export type EventValidationContext = {origin:string;receivedAt:string;receipt:VerifiedConsentReceipt;surface?:Surface;account?:ConfirmedAccountContext;registry?:BuildRegistry};
export const REPORT_VIEW_FILTERS = contractSchema['x-view-filters'] as Record<ReportView,readonly ReportFilter[]>;
export const CONTRACT_SCHEMAS = contractSchema;
const defs=contractSchema.$defs as Record<string,any>;
const own=(value:object,key:string)=>Object.prototype.hasOwnProperty.call(value,key);
const plain=(value:unknown):value is Record<string,any>=>value!==null && typeof value==='object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value));
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const unsafeText=/(?:@|https?:|www\.|[/?#\\]|(?:access|refresh)[_-]?token|oauth[=:#?]|password[=:\s]|bearer\s|service[_-]?key|(?:^|\s)[A-Za-z]:)/i;

function isIso(value:unknown):value is string {
 if(typeof value!=='string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return false;
 const time=Date.parse(value);
 return Number.isFinite(time) && new Date(time).toISOString().slice(0,19)===value.slice(0,19);
}
function isTimeZone(value:unknown):boolean {
 if(typeof value!=='string' || (value!=='UTC' && !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(value))) return false;
 try {new Intl.DateTimeFormat('en',{timeZone:value});return true;} catch{return false;}
}

/** Dependency-free evaluator for the JSON Schema vocabulary used by this version.
 * Unknown schema keywords are not interpreted; the versioned generator fixes the vocabulary.
 * Public callers should use validateContractDto, which also checks semantic invariants.
 */
function matches(schema:any,value:any):boolean {
 if(schema.$ref) return matches(defs[schema.$ref.split('/').at(-1)],value);
 if(schema.oneOf && schema.oneOf.filter((s:any)=>matches(s,value)).length!==1)return false;
 if(schema.anyOf && !schema.anyOf.some((s:any)=>matches(s,value)))return false;
 if(own(schema,'const') && value!==schema.const)return false;
 if(schema.enum && !schema.enum.includes(value))return false;
 if(schema.type) {
  const valid=schema.type==='null'?value===null:schema.type==='object'?plain(value):schema.type==='array'?Array.isArray(value):schema.type==='integer'?Number.isSafeInteger(value):schema.type==='number'?typeof value==='number'&&Number.isFinite(value):typeof value===schema.type;
  if(!valid)return false;
 }
 if(typeof value==='number' && ((schema.minimum!==undefined&&value<schema.minimum)||(schema.maximum!==undefined&&value>schema.maximum)))return false;
 if(typeof value==='string') {
  if((schema.minLength!==undefined&&value.length<schema.minLength)||(schema.maxLength!==undefined&&value.length>schema.maxLength)||(schema.pattern&&!new RegExp(schema.pattern).test(value)))return false;
  if(schema.format==='uuid'&&!uuidPattern.test(value))return false;
  if(schema.format==='date-time'&&!isIso(value))return false;
  if(schema.format==='iana-time-zone'&&!isTimeZone(value))return false;
 }
 if(Array.isArray(value)) {
  if((schema.minItems!==undefined&&value.length<schema.minItems)||(schema.maxItems!==undefined&&value.length>schema.maxItems))return false;
  if(schema.uniqueItems && new Set(value.map(v=>JSON.stringify(v))).size!==value.length)return false;
  if(schema.items && !value.every(v=>matches(schema.items,v)))return false;
 }
 if(plain(value)) {
  if((schema.required??[]).some((key:string)=>!own(value,key)))return false;
  if(schema.maxProperties!==undefined&&Object.keys(value).length>schema.maxProperties)return false;
  for(const key of Object.keys(value)) {
   if(schema.properties && own(schema.properties,key)) {if(!matches(schema.properties[key],value[key]))return false;}
   else if(schema.additionalProperties===false)return false;
  }
 }
 return true;
}
function validRange(from:string,to:string):boolean {return isIso(from)&&isIso(to)&&Date.parse(from)<Date.parse(to)&&Date.parse(to)-Date.parse(from)<=400*86400000;}
function metricValid(m:MetricValue,population?:Population):boolean {
 if(population&&m.population!==population)return false;
 if(['unmeasured','unsupported_window'].includes(m.status))return m.value===null;
 if(m.value===null)return false;
 if(m.unit==='ratio')return m.numerator!==null&&m.denominator!==null&&m.denominator>0&&m.numerator<=m.denominator&&Math.abs(m.value-m.numerator/m.denominator)<1e-9;
 return m.unit!=='count'||Number.isSafeInteger(m.value);
}
export function validateContractDto(name:string,value:unknown):boolean {
 try {
  if(!own(defs,name)||!matches(defs[name],value))return false;
  const v=value as any;
  if(name==='ReportQuery')return validRange(v.from,v.to)&&(!v.comparison||validRange(v.comparison.from,v.comparison.to));
  if(name==='ConsentReceipt'||name==='VerifiedConsentReceipt')return Date.parse(v.issuedAt)<Date.parse(v.expiresAt);
  if(name==='ConsentState')return v.state==='granted'||(!v.websiteAnalytics&&!v.accountAnalytics);
  if(name==='MetricValue')return metricValid(v);
  if(name==='WebsiteReport'||name==='AccountOutcomeReport'||name.endsWith('Report')) {
   if(!validRange(v.period.from,v.period.to)||!v.metrics.every((m:MetricValue)=>metricValid(m,v.population)))return false;
   if((v.period.observedFrom===null)!==(v.period.observedTo===null))return false;
   if(v.period.observedFrom!==null&&(Date.parse(v.period.observedFrom)<Date.parse(v.period.from)||Date.parse(v.period.observedTo)>Date.parse(v.period.to)||Date.parse(v.period.observedFrom)>Date.parse(v.period.observedTo)))return false;
   if(v.consentCoverage.status==='measured'&&(v.consentCoverage.numerator===null||v.consentCoverage.denominator===null||v.consentCoverage.denominator<=0||v.consentCoverage.numerator>v.consentCoverage.denominator))return false;
   for(const breakdown of v.breakdowns)for(const row of breakdown.rows) {
    if(v.sourceQuality.view==='sections'&&(row.exposedViews>row.eligibleViews||row.ctaAfterExposureViews>row.exposedViews||(row.reach!==null&&(row.eligibleViews===0||Math.abs(row.reach-row.exposedViews/row.eligibleViews)>1e-9))))return false;
    if(v.sourceQuality.view==='journeys') {
     if(row.reachedSessions!==null&&row.reachedSessions>row.eligibleSessions)return false;
     if(row.conversion!==null&&(row.reachedSessions===null||row.eligibleSessions<=0||Math.abs(row.conversion-row.reachedSessions/row.eligibleSessions)>1e-9))return false;
    }
    if(v.sourceQuality.view==='accounts') {
     const activityConcepts=new Set(['account_page_viewed','profile_edit_started','profile_save_submitted','logout_clicked','page_engagement_reported']);
     if(activityConcepts.has(row.concept)!==(v.population==='consented_account_activity'))return false;
     if(v.population==='consented_account_activity'&&v.sourceQuality.providerCoverage.length)return false;
     if(['unmeasured','not_configured'].includes(row.coverage)&&(row.count!==null||row.attributedCount!==null||row.unattributedCount!==null))return false;
     if(row.attributedCount!==null&&row.unattributedCount!==null&&(row.count===null||row.count!==row.attributedCount+row.unattributedCount))return false;
     if(row.count!==null&&((row.attributedCount!==null&&row.attributedCount>row.count)||(row.unattributedCount!==null&&row.unattributedCount>row.count)))return false;
    }
   }
  }
  return true;
 }catch{return false;}
}

export function normalizeEventTime({occurredAt,receivedAt,source}:{occurredAt:string;receivedAt:string;source:'browser'|'server'}):{eventAt:string;clockQuality:ClockQuality} {
 if(!isIso(occurredAt)||!isIso(receivedAt)||!['browser','server'].includes(source))throw new Error('invalid_fields');
 const age=Date.parse(receivedAt)-Date.parse(occurredAt);
 if(age>(source==='browser'?WEBSITE_ANALYTICS_LIMITS.browserQueueAgeMs:WEBSITE_ANALYTICS_LIMITS.serverLateMs))throw new Error('invalid_fields');
 if(age < -WEBSITE_ANALYTICS_LIMITS.futureSkewMs)return {eventAt:receivedAt,clockQuality:'adjusted'};
 return {eventAt:occurredAt,clockQuality:source==='server'&&age>86400000?'late':'original'};
}
const forbiddenKey=/^(?:user_?id|email|auth_session_id|event_source|authority|subject|received_at|access_?token|refresh_?token|service_?key|account_role|password|prompt|project_path|url|raw_url|form_values|dom_text)$/i;
function forbidden(value:unknown):boolean {
 if(Array.isArray(value))return value.some(forbidden);
 if(plain(value))return Object.entries(value).some(([k,v])=>forbiddenKey.test(k)||forbidden(v));
 return false;
}
const accountOnly=new Set(['account_page_viewed','profile_edit_started','profile_save_submitted','logout_clicked']);
const propRegistry:Record<string,RegistryKind>={landing_page_id:'page',section_id:'section',cta_id:'cta',action_id:'action',feature_id:'feature',error_code:'error',navigation_id:'navigation',target_page_id:'page',selection_id:'selection',faq_id:'faq',contact_id:'contact',entry_point:'entryPoint',edit_area_id:'editArea',account_surface:'accountSurface',component_id:'component',resource_id:'resource',normalized_error:'error',release_id:'release',artifact_id:'artifact'};
function inRegistry(kind:RegistryKind,id:string,site:SiteId,registry?:BuildRegistry):boolean {
 const allowed=registry?.[kind]??(kind==='page'?PAGE_REGISTRY[site]:kind==='section'?SECTION_REGISTRY[site]:initialRegistry[kind]);
 return Array.isArray(allowed)&&allowed.includes(id);
}
export function validateWebsiteEvent(input:unknown,context:EventValidationContext):ValidationResult {
 const reject=(reason:ErrorCode):ValidationResult=>({accepted:false,reason});
 try {
  if(!plain(input))return reject('invalid_fields');
  if(forbidden(input))return reject('forbidden_property');
  if(!defs.WebsiteEventV1.oneOf.some((s:any)=>s.properties.event_name.const===input.event_name))return reject('unknown_event');
  if(!validateContractDto('WebsiteEventV1',input)) {
   const allowedTop=new Set(Object.keys(defs.WebsiteEventV1.oneOf[0].properties));
   const eventSchema=defs.WebsiteEventV1.oneOf.find((s:any)=>s.properties.event_name.const===input.event_name);
   if(Object.keys(input).some(k=>!allowedTop.has(k))||(plain(input.properties)&&Object.keys(input.properties).some(k=>!own(eventSchema.properties.properties.properties,k))))return reject('forbidden_property');
   return reject('invalid_fields');
  }
  const event=input as WebsiteEventV1;
  if(context.origin!==`https://${event.site_id}.com`)return reject('origin_not_allowed');
  if(!inRegistry('page',event.page_id,event.site_id,context.registry))return reject('invalid_fields');
  for(const [key,value] of Object.entries(event.properties)) {
   if(typeof value==='string'&&unsafeText.test(value))return reject('forbidden_property');
   if(propRegistry[key]&&!inRegistry(propRegistry[key],String(value),event.site_id,context.registry))return reject('invalid_fields');
  }
  for(const [key,value] of Object.entries(event.context??{})) {
   if(key!=='referrer_domain'&&unsafeText.test(value))return reject('forbidden_property');
   if(key==='landing_page_id'&&!inRegistry('page',value,event.site_id,context.registry))return reject('invalid_fields');
  }
  if(event.event_name==='cta_clicked'&&(['download','signup','login','contact'].includes(String(event.properties.action_id))||['download','signup','login','contact'].includes(String(event.properties.cta_id))))return reject('invalid_fields');
  if(event.event_name==='page_engagement_reported'&&Number(event.properties.active_ms_total)>Number(event.properties.visible_ms_total))return reject('invalid_fields');
  if(event.event_name==='web_vital_reported'&&(event.properties.unit!==(event.properties.metric==='CLS'?'score':'ms')))return reject('invalid_fields');
  const receipt=context.receipt;
  if(!validateContractDto('VerifiedConsentReceipt',receipt&&Object.fromEntries(Object.entries(receipt).filter(([k])=>k!=='collectionToken'&&k!=='revocationProof')))||receipt.revokedAt||receipt.receiptId!==event.consent_receipt_id||receipt.siteId!==event.site_id||!isIso(context.receivedAt)||Date.parse(receipt.issuedAt)>Date.parse(context.receivedAt)||Date.parse(receipt.expiresAt)<=Date.parse(context.receivedAt))return reject('invalid_consent');
  if(event.consent_generation!==receipt.generation)return reject('stale_generation');
  const surface:Surface=context.surface??((event.page_id==='account'||event.page_id==='account_authorize')?'authenticated_account':'marketing');
  const protectedSurface=surface==='authenticated_account';
  const isAccount=protectedSurface||accountOnly.has(event.event_name);
  if(accountOnly.has(event.event_name)&&!protectedSurface)return reject('invalid_consent');
  if(isAccount) {
   const account=context.account;
   if(!receipt.purposes.accountAnalytics||account?.confirmed!==true||!uuidPattern.test(account.principalId??'')||account.boundPrincipalId!==account.principalId||!Number.isSafeInteger(account.consentGeneration)||account.consentGeneration<0||!Number.isSafeInteger(account.boundConsentGeneration)||account.boundConsentGeneration<0)return reject('invalid_consent');
   if(account.consentGeneration!==account.boundConsentGeneration)return reject('stale_generation');
  } else if(!receipt.purposes.websiteAnalytics)return reject('invalid_consent');
  const time=normalizeEventTime({occurredAt:event.occurred_at,receivedAt:context.receivedAt,source:'browser'});
  return {accepted:true,event:{input:structuredClone(event),...time,receivedAt:context.receivedAt,eventSource:isAccount?'A':'W',authority:isAccount?'consented_account_observation':'browser_observation',surface}};
 }catch{return reject('invalid_fields');}
}
export function validateWebsiteBatch(input:unknown,context:EventValidationContext):BatchValidationResult {
 try {
  if(!Array.isArray(input)||input.length===0||input.length>50||new TextEncoder().encode(JSON.stringify(input)).length>32768)return {accepted:false,reason:'invalid_fields'};
  return {accepted:true,results:input.map(event=>validateWebsiteEvent(event,context))};
 }catch{return {accepted:false,reason:'invalid_fields'};}
}
export function validateReportQuery(input:unknown,view:ReportView,registry?:BuildRegistry):{accepted:true;query:ReportQuery}|{accepted:false;reason:'unsupported_query'} {
 const reject={accepted:false,reason:'unsupported_query'} as const;
 if(!own(REPORT_VIEW_FILTERS,view)||!validateContractDto('ReportQuery',input))return reject;
 const query=input as ReportQuery;
 if(query.accountMode!==undefined&&view!=='accounts')return reject;
 if([...Object.keys(query.filters),...(query.groupBy??[])].some(k=>!REPORT_VIEW_FILTERS[view].includes(k as ReportFilter)))return reject;
 for(const [key,values] of Object.entries(query.filters))for(const value of values??[]) {
  if(unsafeText.test(value))return reject;
  if(key==='pageId'&&!(query.siteId==='all'?Object.values(PAGE_REGISTRY).flat():PAGE_REGISTRY[query.siteId]).includes(value))return reject;
  if(key==='sectionId'&&!(query.siteId==='all'?Object.values(SECTION_REGISTRY).flat():SECTION_REGISTRY[query.siteId]).includes(value))return reject;
  if(key==='ctaId'&&!(registry?.cta??initialRegistry.cta)?.includes(value))return reject;
 }
 return {accepted:true,query:{...structuredClone(query),comparison:query.comparison??null,limit:query.limit??100,cursor:query.cursor??null,groupBy:query.groupBy??[]}};
}
