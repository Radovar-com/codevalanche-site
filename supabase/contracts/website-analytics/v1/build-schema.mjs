// Canonical declarative v1 contract. Run with Node 24.18.1; no dependencies.
import { writeFile } from 'node:fs/promises';
const obj=(properties,required=Object.keys(properties),extra={})=>({type:'object',properties,required,additionalProperties:false,...extra});
const str=(maxLength=64,pattern='^[A-Za-z0-9][A-Za-z0-9_.-]*$')=>({type:'string',minLength:1,maxLength,pattern});
const en=(...values)=>({type:'string',enum:values});
const integer=(maximum=Number.MAX_SAFE_INTEGER)=>({type:'integer',minimum:0,maximum});
const num={type:'number',minimum:0};
const bool={type:'boolean'};
const arr=(items,extra={})=>({type:'array',items,...extra});
const ref=name=>({$ref:`#/$defs/${name}`});
const nullable=s=>({anyOf:[s,{type:'null'}]});
const uuid={type:'string',format:'uuid'};
const iso={type:'string',format:'date-time'};
const token={type:'string',minLength:24,maxLength:512,pattern:'^[A-Za-z0-9_-]+$'};
const site=en('radovar','codevalanche');
const id=str();
const safeLabel=str(80,'^[A-Za-z0-9][A-Za-z0-9 _.-]*$');
const platform=en('web','windows','macos','linux','ios','android','unknown');
const architecture=en('x64','arm64','x86','universal','unknown');
const provider=en('email','google','github','unknown');
const placement=en('header','intro','hero','product_panel','resources','footer','download','account','inline');
const duration=integer(86400000);
const pct={type:'number',minimum:0,maximum:100};
export const eventProperties={
  session_started:obj({landing_page_id:id,attribution_kind:en('campaign','referrer','unknown')}),
  page_viewed:obj({navigation_type:en('initial','route','back_forward')}),
  page_engagement_reported:obj({active_ms_total:duration,visible_ms_total:duration,max_scroll_pct:pct,revision:integer()}),
  page_exited:obj({exit_kind:en('hidden','navigation'),max_scroll_pct:pct}),
  section_viewed:obj({section_id:id}),
  section_engagement_reported:obj({section_id:id,active_ms_total:duration,revision:integer()}),
  scroll_depth_reached:obj({threshold:{type:'integer',enum:[25,50,75,90,100]}}),
  cta_clicked:obj({cta_id:id,section_id:id,action_id:id,placement}),
  navigation_used:obj({navigation_id:id,target_page_id:id,placement}),
  outbound_clicked:obj({destination_id:en('product','docs','press','contact','official_repository'),section_id:id}),
  feature_selected:obj({feature_id:id,selection_id:id}),
  faq_toggled:obj({faq_id:id,expanded:bool}),
  download_platform_selected:obj({platform,architecture,selection_source:en('manual','detected')}),
  download_unavailable_shown:obj({platform,reason:en('unconfigured','unsupported','release_pending')}),
  download_clicked:obj({cta_id:id,platform,architecture,release_id:id,artifact_id:id,placement}),
  contact_clicked:obj({contact_id:id,placement}),
  account_entry_clicked:obj({placement,entry_mode:en('signin','signup','profile')}),
  signup_started:obj({entry_point:id,provider_kind:provider}),
  signup_form_submitted:obj({provider_kind:provider}),
  verification_notice_viewed:obj({notice_kind:en('email_verification','email_sent','verification_required')}),
  login_started:obj({provider_kind:provider,entry_point:id}),
  login_form_submitted:obj({provider_kind:provider}),
  auth_challenge_viewed:obj({challenge_kind:en('mfa','verification','reauthentication')}),
  account_page_viewed:obj({account_page_id:en('overview','profile','security','sessions','consent','authorize')}),
  profile_edit_started:obj({edit_area_id:id}),
  profile_save_submitted:obj({operation_id:uuid}),
  password_reset_requested_ui:obj({entry_point:id}),
  password_reset_form_submitted:obj({flow_id:uuid}),
  logout_clicked:obj({account_surface:id}),
  web_vital_reported:obj({metric:en('LCP','INP','CLS'),value:num,unit:en('ms','score'),metric_id:id,revision:integer()}),
  javascript_error_observed:obj({error_code:id,component_id:id,build_sha:str(64)}),
  resource_load_failed:obj({resource_id:id,resource_kind:en('script','style','image','font','other')}),
  interaction_failed:obj({action_id:id,normalized_error:id}),
};
const context= obj({acquisition_source:str(80,'^[A-Za-z0-9][A-Za-z0-9 _.-]*$'),acquisition_medium:str(80,'^[A-Za-z0-9][A-Za-z0-9 _.-]*$'),campaign:str(80,'^[A-Za-z0-9][A-Za-z0-9 _.-]*$'),content:str(80,'^[A-Za-z0-9][A-Za-z0-9 _.-]*$'),term:str(80,'^[A-Za-z0-9][A-Za-z0-9 _.-]*$'),referrer_domain:{type:'string',maxLength:253,pattern:'^(unknown|[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+)$'},landing_page_id:id,locale:{type:'string',pattern:'^(unknown|[a-z]{2}(?:-[A-Z]{2})?)$'},device_class:en('desktop','mobile','tablet','unknown'),os_family:en('windows','macos','linux','ios','android','unknown'),browser_family:en('chrome','edge','firefox','safari','other','unknown'),viewport_bucket:en('small','medium','large','unknown')},[]);
const envelope={schema_version:{const:1},event_id:uuid,site_id:site,event_name:en(...Object.keys(eventProperties)),occurred_at:iso,page_id:id,page_instance_id:uuid,page_version:str(64),session_id:uuid,anonymous_id:uuid,consent_receipt_id:uuid,consent_generation:integer(),properties:{},context};
const eventRequired=Object.keys(envelope).filter(k=>k!=='context');
const errors=en('invalid_fields','unknown_event','forbidden_property','invalid_consent','stale_generation','origin_not_allowed','rate_limited','unauthenticated','forbidden','unsupported_query','source_unavailable');
const period=obj({from:iso,to:iso,timeZone:{type:'string',format:'iana-time-zone'},observedFrom:nullable(iso),observedTo:nullable(iso)});
const population=en('consented_website_observations','operational_accounts','consented_account_activity');
const metric=obj({id, value:nullable(num),unit:en('count','ratio','ms','score'),population:population,numerator:nullable(num),denominator:nullable(num),status:en('measured','partial','unmeasured','unsupported_window'),exactness:en('exact','estimate','not_applicable')});
const coverage=obj({source:en('browser','account_v2','provider_audit','release_provider','delivery','native_ledger','consent_registry','collector'),status:en('measured','partial','unknown','not_configured','unavailable'),watermark:nullable(iso),observedFrom:nullable(iso),observedTo:nullable(iso)});
const commonQuality={sources:arr(coverage),botFiltering:en('known_bots_only','not_configured'),rawWindowStart:nullable(iso),rollupWindowStart:nullable(iso)};
const qualityExtras={
  overview:{identity:en('consented_browser_ids_only')},
  acquisition:{attribution:en('session_start_only','unknown')},
  pages:{engagement:en('visible_recent_interaction_estimate')},
  sections:{exposure:en('continuous_1000ms_min_half_section_or_viewport')},
  journeys:{ordering:en('same_session','attributed_7_day','unmeasured')},
  downloads:{releaseCounterSemantics:en('provider_count_only','not_configured'),transferServed:en('measured','not_configured'),guestActivation:en('unmeasured')},
  accounts:{providerCoverage:arr(obj({concept:en('account_created','email_verified','login_succeeded','login_failed','password_valid','password_invalid','token_refreshed','session_revoked','logout_completed','profile_update_succeeded','profile_update_failed','password_reset_completed','password_changed','mfa_completed','app_admitted','account_deletion_requested','account_deletion_completed'),status:en('measured','partial','unmeasured','not_configured'),source:en('auth_users','provider_audit','provider_session_metadata','password_hook','account_operation','lifecycle_job','unavailable'),watermark:nullable(iso)}))},
  quality:{vitals:en('latest_revision_per_metric','not_configured')},
  health:{rawRetentionDays:{const:90},rollupRetentionMonths:{const:13}},
};
const rowProperties={
 overview:{siteId:site,bucketStart:iso,sessionStarts:integer(),pageViews:integer(),dailyAnonymousIds:nullable(integer())},
 acquisition:{acquisitionSource:safeLabel,acquisitionMedium:safeLabel,campaign:safeLabel,landingPageId:id,sessions:integer(),attribution:en('campaign','referrer','unknown')},
 pages:{pageId:id,pageVersion:id,pageViews:integer(),eligibleViews:integer(),activeMs:nullable(integer()),visibleMs:nullable(integer()),maxScrollPct:nullable(pct)},
 sections:{pageId:id,pageVersion:id,sectionId:id,eligibleViews:integer(),exposedViews:integer(),reach:nullable({type:'number',minimum:0,maximum:1}),activeMs:nullable(integer()),ctaAfterExposureViews:integer()},
 journeys:{journeyId:id,stepId:id,stepOrder:integer(),eligibleSessions:integer(),reachedSessions:nullable(integer()),conversion:nullable({type:'number',minimum:0,maximum:1}),window:en('same_session','7_day'),attribution:en('same_session','server_correlated','unattributed','unmeasured')},
 downloads:{platform,architecture,releaseId:id,artifactId:id,clicks:nullable(integer()),redirects:nullable(integer()),providerCountDelta:nullable(integer()),transferServed:nullable(integer()),firstObservedOpens:nullable(integer()),activations:nullable(integer()),counterStatus:en('measured','baseline','reset','asset_removed','not_configured')},
 accounts:{concept:en(...qualityExtras.accounts.providerCoverage.items.properties.concept.enum,'account_page_viewed','profile_edit_started','profile_save_submitted','logout_clicked','page_engagement_reported'),count:nullable(integer()),attributedCount:nullable(integer()),unattributedCount:nullable(integer()),coverage:en('measured','partial','unmeasured','not_configured')},
 quality:{pageId:id,buildSha:id,metric:en('LCP','INP','CLS','javascript_error','resource_load_failed','interaction_failed'),value:nullable(num),unit:en('ms','score','count'),sampleSize:integer(),statistic:en('p75','count'),normalizedCode:nullable(id)},
 health:{source:coverage.properties.source,status:coverage.properties.status,lastEventAt:nullable(iso),watermark:nullable(iso),lagMs:nullable(integer()),accepted:integer(),rejectedSchema:integer(),rejectedConsent:integer(),duplicate:integer(),rateLimited:integer(),botSuspected:integer(),queueExpired:integer(),lateArrival:integer(),clockAdjusted:integer()},
};
export const viewFilters={
 overview:['pageId','acquisitionSource','campaign','deviceClass','osFamily','browserFamily','country','trafficClass'],
 acquisition:['pageId','acquisitionSource','campaign','deviceClass','osFamily','browserFamily','country','trafficClass'],
 pages:['pageId','acquisitionSource','campaign','deviceClass','osFamily','browserFamily','country','trafficClass'],
 sections:['pageId','sectionId','ctaId','acquisitionSource','campaign','deviceClass','osFamily','browserFamily','country','trafficClass'],
 journeys:['pageId','ctaId','acquisitionSource','campaign','deviceClass','platform','trafficClass'],
 downloads:['pageId','ctaId','acquisitionSource','campaign','deviceClass','osFamily','country','platform','releaseId','appVersion','channel','trafficClass'],
 accounts:['platform','appVersion','channel'],
 quality:['pageId','deviceClass','osFamily','browserFamily','country','appVersion','trafficClass'],
 health:['trafficClass'],
};
const countries='AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'.split(' ');
const filterValues={pageId:id,sectionId:id,ctaId:id,acquisitionSource:safeLabel,campaign:safeLabel,deviceClass:context.properties.device_class,osFamily:context.properties.os_family,browserFamily:context.properties.browser_family,country:en('unknown',...countries),platform,releaseId:id,appVersion:id,channel:en('stable','beta','alpha','dev','unknown'),trafficClass:en('external','internal','test','suspected_bot','unknown')};
const query=obj({accountMode:en('outcomes','activity'),siteId:en('radovar','codevalanche','all'),from:iso,to:iso,timeZone:{type:'string',format:'iana-time-zone'},granularity:en('day','week'),filters:obj(Object.fromEntries(Object.entries(filterValues).map(([k,v])=>[k,arr(v,{minItems:1,maxItems:10,uniqueItems:true})])),[],{maxProperties:3}),comparison:nullable(obj({from:iso,to:iso})),limit:{type:'integer',minimum:1,maximum:200,default:100},cursor:nullable({type:'string',minLength:1,maxLength:512,pattern:'^[A-Za-z0-9_-]+$'}),groupBy:arr(en(...Object.keys(filterValues)),{maxItems:2,uniqueItems:true})},['siteId','from','to','timeZone','granularity','filters']);
const reportBase={definitionVersion:{const:'1'},status:en('ready','partial','insufficient_data','not_configured','unavailable'),population,period,metrics:arr(metric),breakdowns:{},capabilities:arr(obj({metricId:id,window:en('raw_90_days','rollup_13_months','same_session','7_day','unsupported_window'),filters:arr(en(...Object.keys(filterValues))),groupBy:arr(en(...Object.keys(filterValues)),{maxItems:2}),method:id,reason:nullable(str(200,'^[A-Za-z0-9][A-Za-z0-9 _.,:()/-]*$'))})),sampleSize:integer(),generatedAt:iso,watermark:nullable(iso),sourceQuality:{},consentCoverage:obj({status:en('measured','partial','unknown'),numerator:nullable(integer()),denominator:nullable(integer())}),limitations:arr({type:'string',minLength:1,maxLength:500})};
const defs={
  WebsiteEventV1:{oneOf:Object.entries(eventProperties).map(([event_name,properties])=>obj({...envelope,event_name:{const:event_name},properties},eventRequired))},
  ConsentState:obj({policyVersion:id,websiteAnalytics:bool,accountAnalytics:bool,state:en('unknown','denied','granted','withdrawn','pending_revoke'),generation:integer(),changedAt:iso}),
  ConsentReceipt:obj({receiptId:uuid,siteId:site,policyVersion:id,generation:integer(),purposes:obj({websiteAnalytics:bool,accountAnalytics:bool}),issuedAt:iso,expiresAt:iso,collectionToken:token,revocationProof:token}),
  VerifiedConsentReceipt:obj({receiptId:uuid,siteId:site,policyVersion:id,generation:integer(),purposes:obj({websiteAnalytics:bool,accountAnalytics:bool}),issuedAt:iso,expiresAt:iso,revokedAt:nullable(iso)},['receiptId','siteId','policyVersion','generation','purposes','issuedAt','expiresAt']),
  RevocationProof:obj({receiptId:uuid,generation:integer(),capability:token}),
  BatchReceipt:obj({acceptedIds:arr(uuid),duplicateIds:arr(uuid),rejected:arr(obj({eventId:nullable(uuid),code:errors})),generation:integer(),receivedAt:iso,retryAfterMs:nullable(integer())}),
  ErrorCode:errors,
  ErrorResponse:obj({error:obj({code:errors,message:{const:'Analytics request could not be processed.'}}),requestId:uuid,retryAfterMs:nullable(integer())}),
  ReportQuery:query, ReportFilters:query.properties.filters, MetricValue:metric,
};
for(const view of Object.keys(viewFilters)) {
  const fields={...rowProperties[view],dimensions:obj(Object.fromEntries(viewFilters[view].map(key=>[key,filterValues[key]])),[],{maxProperties:2})};
  defs[`${view}Row`]=obj(fields);
  if(view==='journeys')defs.journeysRow={description:'A numeric conversion requires nonnull reachedSessions and positive eligibleSessions; runtime also verifies conversion = reachedSessions / eligibleSessions and reachedSessions <= eligibleSessions.',oneOf:[obj({...fields,conversion:{type:'null'}}),obj({...fields,conversion:{type:'number',minimum:0,maximum:1},reachedSessions:integer(),eligibleSessions:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}})]};
  if(view==='accounts')defs.accountsRow={description:'Unmeasured/not_configured counts must all be null. When both attribution counts are known, count must be known and equal their sum. Any known part cannot exceed a known total. One unknown part may remain null; runtime verifies arithmetic without inventing it.',oneOf:[obj({...fields,coverage:en('unmeasured','not_configured'),count:{type:'null'},attributedCount:{type:'null'},unattributedCount:{type:'null'}}),obj({...fields,coverage:en('measured','partial')})]};
  defs[`${view}SourceQuality`]=obj({view:{const:view},...commonQuality,...qualityExtras[view]});
  defs[`${view}Report`]=obj({...reportBase,population:view==='accounts'?en('operational_accounts','consented_account_activity'):en('consented_website_observations'),breakdowns:arr(obj({dimension:en(...viewFilters[view],'time','site','source','concept','journey','artifact','metric','group'),rows:arr(ref(`${view}Row`),{maxItems:200}),nextCursor:nullable({type:'string',minLength:1,maxLength:512,pattern:'^[A-Za-z0-9_-]+$'})})),sourceQuality:ref(`${view}SourceQuality`)});
}
defs.WebsiteReport={oneOf:Object.keys(viewFilters).map(view=>ref(`${view}Report`))};
defs.AccountOutcomeReport=ref('accountsReport');
defs.ValidatedWebsiteEvent=obj({input:ref('WebsiteEventV1'),eventAt:iso,receivedAt:iso,clockQuality:en('original','adjusted','late'),eventSource:en('W','A'),authority:en('browser_observation','consented_account_observation'),surface:en('marketing','pre_auth','authenticated_account')});
defs.ValidationResult={oneOf:[obj({accepted:{const:true},event:ref('ValidatedWebsiteEvent')}),obj({accepted:{const:false},reason:errors})]};
const schema={$schema:'https://json-schema.org/draft/2020-12/schema',$id:'https://codevalanche.com/contracts/website-analytics/v1/contract.schema.json',title:'Owned website analytics v1',...ref('WebsiteEventV1'),$defs:defs,'x-view-filters':viewFilters};
await writeFile(new URL('contract.schema.json',import.meta.url),JSON.stringify(schema,null,2)+'\n');
for(const view of Object.keys(viewFilters)) await writeFile(new URL(`report-${view}.schema.json`,import.meta.url),JSON.stringify({$schema:schema.$schema,$id:`https://codevalanche.com/contracts/website-analytics/v1/report-${view}.schema.json`,$ref:`contract.schema.json#/$defs/${view}Report`},null,2)+'\n');

// Independent fixture literals: no computed metrics or fabricated runtime report data.
const at='2026-10-15T00:00:00.000Z',to='2026-10-16T00:00:00.000Z';
const qualityValues={overview:{identity:'consented_browser_ids_only'},acquisition:{attribution:'unknown'},pages:{engagement:'visible_recent_interaction_estimate'},sections:{exposure:'continuous_1000ms_min_half_section_or_viewport'},journeys:{ordering:'unmeasured'},downloads:{releaseCounterSemantics:'not_configured',transferServed:'not_configured',guestActivation:'unmeasured'},accounts:{providerCoverage:[{concept:'login_succeeded',status:'unmeasured',source:'unavailable',watermark:null}]},quality:{vitals:'not_configured'},health:{rawRetentionDays:90,rollupRetentionMonths:13}};
const rows={overview:{siteId:'codevalanche',bucketStart:at,sessionStarts:2,pageViews:3,dailyAnonymousIds:2},acquisition:{acquisitionSource:'unknown',acquisitionMedium:'unknown',campaign:'unknown',landingPageId:'home',sessions:2,attribution:'unknown'},pages:{pageId:'home',pageVersion:'build_1',pageViews:3,eligibleViews:3,activeMs:1000,visibleMs:2000,maxScrollPct:50},sections:{pageId:'home',pageVersion:'build_1',sectionId:'hero',eligibleViews:3,exposedViews:2,reach:2/3,activeMs:1000,ctaAfterExposureViews:1},journeys:{journeyId:'download',stepId:'clicked',stepOrder:1,eligibleSessions:2,reachedSessions:1,conversion:0.5,window:'same_session',attribution:'same_session'},downloads:{platform:'windows',architecture:'x64',releaseId:'unknown',artifactId:'unknown',clicks:null,redirects:null,providerCountDelta:null,transferServed:null,firstObservedOpens:null,activations:null,counterStatus:'not_configured'},accounts:{concept:'login_succeeded',count:null,attributedCount:null,unattributedCount:null,coverage:'unmeasured'},quality:{pageId:'home',buildSha:'build_1',metric:'INP',value:null,unit:'ms',sampleSize:0,statistic:'p75',normalizedCode:null},health:{source:'collector',status:'not_configured',lastEventAt:null,watermark:null,lagMs:null,accepted:0,rejectedSchema:0,rejectedConsent:0,duplicate:0,rateLimited:0,botSuspected:0,queueExpired:0,lateArrival:0,clockAdjusted:0}};
const valid=[],invalid=[];
for(const view of Object.keys(viewFilters)) {
 const value={definitionVersion:'1',status:'not_configured',population:view==='accounts'?'operational_accounts':'consented_website_observations',period:{from:at,to,timeZone:'UTC',observedFrom:null,observedTo:null},metrics:[{id:'eligible_observations',value:null,unit:'count',population:view==='accounts'?'operational_accounts':'consented_website_observations',numerator:null,denominator:null,status:'unmeasured',exactness:'not_applicable'}],breakdowns:[{dimension:view==='accounts'?'concept':view==='health'?'source':'time',rows:[{...rows[view],dimensions:{}}],nextCursor:null}],capabilities:[],sampleSize:0,generatedAt:at,watermark:null,sourceQuality:{view,sources:[],botFiltering:'not_configured',rawWindowStart:null,rollupWindowStart:null,...qualityValues[view]},consentCoverage:{status:'unknown',numerator:null,denominator:null},limitations:['Synthetic contract fixture; not production data.']};
 if(['overview','acquisition','pages','sections','journeys'].includes(view)) {
  value.status='ready';value.period.observedFrom=at;value.period.observedTo=to;value.sampleSize=2;value.watermark=at;
  value.metrics=[{id:'session_starts',value:2,unit:'count',population:'consented_website_observations',numerator:2,denominator:null,status:'measured',exactness:'exact'}];
  value.sourceQuality.sources=[{source:'browser',status:'measured',watermark:at,observedFrom:at,observedTo:to}];
 }
 valid.push({name:`${view} report`,schema:'WebsiteReport',value});
 const invalidRow=structuredClone(value);invalidRow.breakdowns[0].rows[0].email='private@example.com';invalid.push({name:`${view} row cannot contain PII`,schema:'WebsiteReport',value:invalidRow});
 const invalidQuality=structuredClone(value);invalidQuality.sourceQuality.rawUserId='forged';invalid.push({name:`${view} source quality cannot contain raw identity`,schema:'WebsiteReport',value:invalidQuality});
}
const invalidRowFixture=(view,name,values,schema='WebsiteReport')=>{const value=structuredClone(valid.find(f=>f.schema==='WebsiteReport'&&f.value.sourceQuality.view===view).value);Object.assign(value.breakdowns[0].rows[0],values);invalid.push({name,schema,value});};
invalidRowFixture('journeys','journey conversion without numerator and denominator',{eligibleSessions:0,reachedSessions:null,conversion:0.5,attribution:'unmeasured'});
invalidRowFixture('journeys','journey conversion without numerator despite positive denominator',{eligibleSessions:2,reachedSessions:null,conversion:0.5});
invalidRowFixture('journeys','journey conversion does not match measured fraction',{eligibleSessions:2,reachedSessions:1,conversion:0.75});
invalidRowFixture('accounts','unmeasured account counts cannot be numeric',{coverage:'unmeasured',count:12,attributedCount:9,unattributedCount:8},'AccountOutcomeReport');
invalidRowFixture('accounts','unconfigured account counts cannot be measured zero',{coverage:'not_configured',count:0,attributedCount:null,unattributedCount:null},'AccountOutcomeReport');
invalidRowFixture('accounts','known account attribution parts must reconcile',{coverage:'measured',count:12,attributedCount:9,unattributedCount:8},'AccountOutcomeReport');
invalidRowFixture('accounts','known account attribution parts require known total',{coverage:'partial',count:null,attributedCount:9,unattributedCount:3},'AccountOutcomeReport');
invalidRowFixture('accounts','known account attribution part cannot exceed total',{coverage:'partial',count:8,attributedCount:9,unattributedCount:null},'AccountOutcomeReport');
const receipt={receiptId:'00000005-0000-4000-8000-000000000005',siteId:'codevalanche',policyVersion:'2026-10-15',generation:1,purposes:{websiteAnalytics:true,accountAnalytics:false},issuedAt:at,expiresAt:to,collectionToken:'synthetic_collection_capability_123456',revocationProof:'synthetic_revocation_capability_123456'};
const event={schema_version:1,event_id:'00000001-0000-4000-8000-000000000001',site_id:'codevalanche',event_name:'page_viewed',occurred_at:at,page_id:'home',page_instance_id:'00000002-0000-4000-8000-000000000002',page_version:'build_1',session_id:'00000003-0000-4000-8000-000000000003',anonymous_id:'00000004-0000-4000-8000-000000000004',consent_receipt_id:receipt.receiptId,consent_generation:1,properties:{navigation_type:'initial'}};
const dtoFixtures={WebsiteEventV1:event,ConsentState:{policyVersion:'2026-10-15',websiteAnalytics:false,accountAnalytics:false,state:'denied',generation:1,changedAt:at},ConsentReceipt:receipt,RevocationProof:{receiptId:receipt.receiptId,generation:1,capability:receipt.revocationProof},BatchReceipt:{acceptedIds:[event.event_id],duplicateIds:[],rejected:[],generation:1,receivedAt:at,retryAfterMs:null},ErrorResponse:{error:{code:'invalid_fields',message:'Analytics request could not be processed.'},requestId:event.event_id,retryAfterMs:null},ReportQuery:{siteId:'all',from:at,to,timeZone:'Europe/Bucharest',granularity:'day',filters:{},comparison:null},MetricValue:{id:'page_views',value:3,unit:'count',population:'consented_website_observations',numerator:3,denominator:null,status:'measured',exactness:'exact'},AccountOutcomeReport:valid.find(f=>f.value.sourceQuality.view==='accounts').value,ValidationResult:{accepted:false,reason:'invalid_fields'}};
dtoFixtures.VerifiedConsentReceipt={receiptId:receipt.receiptId,siteId:'codevalanche',policyVersion:'2026-10-15',generation:1,purposes:{websiteAnalytics:true,accountAnalytics:false},issuedAt:at,expiresAt:to};
for(const [name,value] of Object.entries(dtoFixtures)){ valid.push({name,schema:name,value}); invalid.push({name:`${name} rejects extra properties`,schema:name,value:{...value,unregistered:'forbidden'}}); }
valid.push({name:'accounts activity query',schema:'ReportQuery',value:{...dtoFixtures.ReportQuery,accountMode:'activity'}});
invalid.push({name:'invalid account selector',schema:'ReportQuery',value:{...dtoFixtures.ReportQuery,accountMode:'all'}});
const activityReport=structuredClone(dtoFixtures.AccountOutcomeReport);activityReport.population='consented_account_activity';activityReport.metrics[0].population='consented_account_activity';activityReport.breakdowns[0].rows[0].concept='account_page_viewed';activityReport.sourceQuality.providerCoverage=[];
valid.push({name:'private account activity report',schema:'AccountOutcomeReport',value:activityReport});
const sessionReport=structuredClone(dtoFixtures.AccountOutcomeReport);sessionReport.sourceQuality.providerCoverage=[{concept:'login_succeeded',source:'provider_session_metadata',status:'partial',watermark:at}];valid.push({name:'independent provider session metadata coverage',schema:'AccountOutcomeReport',value:sessionReport});
await writeFile(new URL('fixtures.json',import.meta.url),JSON.stringify({schemaVersion:1,valid,invalid},null,2)+'\n');
