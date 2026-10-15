import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validateWebsiteEvent, validateWebsiteBatch, normalizeEventTime, validateReportQuery, validateContractDto } from '../functions/_shared/websiteAnalyticsContract.ts';
import { validWebsiteEvent, validConsentReceipt, reportQuery, eventContext } from './fixtures/websiteAnalytics.mjs';
import { createSqlFixture } from './sqlHarness.mjs';
const currentAccountProof=(overrides={})=>({confirmed:true,principalId:'00000009-0000-4000-8000-000000000009',consentGeneration:7,boundPrincipalId:'00000009-0000-4000-8000-000000000009',boundConsentGeneration:7,...overrides});

test('strict browser contract rejects authority, unknown and derived events, identifiers and unregistered fields', () => {
  const ctx = eventContext();
  assert.equal(validateWebsiteEvent(validWebsiteEvent(), ctx).accepted, true);
  for (const key of ['user_id','event_source','authority','subject','received_at','email','auth_session_id']) {
    assert.equal(validateWebsiteEvent(validWebsiteEvent({[key]:'forged'}), ctx).reason, 'forbidden_property', key);
  }
  for (const event_name of ['download_section_viewed','download_completed','login_succeeded','user_intent_answered','unknown']) {
    assert.equal(validateWebsiteEvent(validWebsiteEvent({event_name}), ctx).reason, 'unknown_event');
  }
  for (const update of [{event_id:'bad'}, {site_id:'all'}, {schema_version:2}, {page_id:'unregistered'}, {consent_generation:-1}]) {
    assert.equal(validateWebsiteEvent(validWebsiteEvent(update), ctx).accepted, false);
  }
  assert.equal(validateWebsiteEvent(validWebsiteEvent({properties:{navigation_type:'initial',email:'private@example.com'}}), ctx).reason,'forbidden_property');
  assert.equal(validateWebsiteEvent(validWebsiteEvent({properties:{navigation_type:'reload'}}),ctx).accepted,false);
  assert.equal(validateWebsiteEvent(validWebsiteEvent({properties:{}}),ctx).accepted,false);
});

test('context binds production origin, receipt/site/generation and confirmed account consent', () => {
  const ctx=eventContext();
  assert.equal(validateWebsiteEvent(validWebsiteEvent(), {...ctx,origin:'https://www.codevalanche.com'}).reason,'origin_not_allowed');
  assert.equal(validateWebsiteEvent(validWebsiteEvent(), {...ctx,receipt:{...ctx.receipt,siteId:'radovar'}}).reason,'invalid_consent');
  assert.equal(validateWebsiteEvent(validWebsiteEvent({consent_generation:2}),ctx).reason,'stale_generation');
  assert.equal(validateWebsiteEvent(validWebsiteEvent(),{...ctx,receipt:{...ctx.receipt,revokedAt:ctx.receivedAt}}).reason,'invalid_consent');
  assert.equal(validateWebsiteEvent(validWebsiteEvent({page_id:'account',event_name:'page_viewed'}),ctx).reason,'invalid_consent');
  const account=currentAccountProof();
  const accountCtx={...ctx,account,receipt:{...ctx.receipt,purposes:{websiteAnalytics:false,accountAnalytics:true}}};
  assert.equal(validateWebsiteEvent(validWebsiteEvent({page_id:'account',event_name:'account_page_viewed',properties:{account_page_id:'profile'}}),accountCtx).accepted,true);
  assert.equal(validateWebsiteEvent(validWebsiteEvent(),accountCtx).reason,'invalid_consent');
});

test('server validation uses verified receipt scope without needing raw collection or revocation capabilities',()=>{
  const {collectionToken,revocationProof,...receipt}=validConsentReceipt();
  assert.equal(validateWebsiteEvent(validWebsiteEvent(),eventContext({receipt})).accepted,true);
});

test('A authority uses independent current P4 generation and receipt/event principal binding',()=>{
  const event=validWebsiteEvent({page_id:'account',event_name:'account_page_viewed',properties:{account_page_id:'profile'}});
  const ctx=eventContext({receipt:validConsentReceipt({purposes:{websiteAnalytics:true,accountAnalytics:true}}),account:currentAccountProof()});
  const accepted=validateWebsiteEvent(event,ctx);
  assert.equal(accepted.accepted,true,'W generation1 and P4 generation7 are independent');
  assert.equal(accepted.event.eventSource,'A');
  assert.equal('principalId' in accepted.event,false,'trusted identity is never copied to website storage DTO');
  for(const account of [undefined,currentAccountProof({confirmed:false}),{confirmed:true,consentGeneration:7},currentAccountProof({principalId:'bad'}),currentAccountProof({boundPrincipalId:'00000008-0000-4000-8000-000000000008'})]) {
    assert.equal(validateWebsiteEvent(event,{...ctx,account}).reason,'invalid_consent');
  }
  assert.equal(validateWebsiteEvent(event,{...ctx,account:currentAccountProof({boundConsentGeneration:6})}).reason,'stale_generation');
});

test('PII cannot hide in acquisition, referrer, registry IDs or unexpected nested properties', () => {
  for(const context of [{campaign:'private@example.com'},{campaign:'https://host/?code=secret'},{referrer_domain:'https://host/path'},{term:'C:\\private\\project'},{campaign:'access_token=secret'}]) {
    assert.equal(validateWebsiteEvent(validWebsiteEvent({context}),eventContext()).accepted,false);
  }
  assert.equal(validateWebsiteEvent(validWebsiteEvent({event_name:'cta_clicked',properties:{cta_id:'download',section_id:'hero',action_id:'download',placement:'hero'}}),eventContext()).accepted,false,'dedicated download CTA must not be duplicated as cta_clicked');
  assert.equal(validateWebsiteEvent(validWebsiteEvent({event_name:'web_vital_reported',properties:{metric:'CLS',value:0.1,unit:'score',metric_id:'vital_1',revision:0}}),eventContext()).accepted,true);
  assert.equal(validateWebsiteEvent(validWebsiteEvent({event_name:'web_vital_reported',properties:{metric:'CLS',value:0.1,unit:'ms',metric_id:'vital_1',revision:0}}),eventContext()).accepted,false);
});

test('time normalization enforces source windows and marks future skew', () => {
  const receivedAt='2026-10-15T12:00:00.000Z';
  assert.deepEqual(normalizeEventTime({occurredAt:'2026-10-16T12:00:00.000Z',receivedAt,source:'browser'}),{eventAt:receivedAt,clockQuality:'adjusted'});
  assert.equal(normalizeEventTime({occurredAt:'2026-10-14T12:00:00.000Z',receivedAt,source:'browser'}).clockQuality,'original');
  assert.throws(()=>normalizeEventTime({occurredAt:'2026-10-14T11:59:59.999Z',receivedAt,source:'browser'}),/invalid_fields/);
  assert.equal(normalizeEventTime({occurredAt:'2026-10-08T12:00:00.000Z',receivedAt,source:'server'}).clockQuality,'late');
  assert.throws(()=>normalizeEventTime({occurredAt:'2026-10-08T11:59:59.999Z',receivedAt,source:'server'}),/invalid_fields/);
  assert.throws(()=>normalizeEventTime({occurredAt:'2026-02-30T00:00:00Z',receivedAt,source:'browser'}),/invalid_fields/);
  assert.throws(()=>normalizeEventTime({occurredAt:receivedAt,receivedAt,source:'made_up'}),/invalid_fields/);
});

test('batch count and UTF-8 wire size checked separately from event validation', () => {
  assert.equal(validateWebsiteBatch([validWebsiteEvent()],eventContext()).accepted,true);
  assert.equal(validateWebsiteBatch(Array(51).fill(validWebsiteEvent()),eventContext()).accepted,false);
  assert.equal(validateWebsiteBatch([],eventContext()).accepted,false);
  assert.equal(validateWebsiteBatch([{...validWebsiteEvent(),properties:{text:'é'.repeat(17000)}}],eventContext()).reason,'invalid_fields');
});

test('report queries enforce bounded half-open periods, valid zones and view-specific safe filters', () => {
  for(const timeZone of ['UTC','Europe/Bucharest']) assert.equal(validateReportQuery(reportQuery({timeZone}),'sections').accepted,true);
  for(const update of [{from:'2026-10-16T00:00:00Z'}, {to:'2028-01-01T00:00:00Z'}, {timeZone:'Bogus/Place'}, {user_id:'forged'}, {filters:{user_id:['forged']}}, {filters:{pageId:['home'],sectionId:['hero'],ctaId:['download'],platform:['web']}}, {limit:201}, {groupBy:['pageId','sectionId','ctaId']}, {cursor:'select * from users'}, {comparison:{from:'2026-10-17T00:00:00Z',to:'2026-10-16T00:00:00Z'}}]) {
    assert.equal(validateReportQuery(reportQuery(update),'sections').accepted,false,JSON.stringify(update));
  }
  assert.equal(validateReportQuery(reportQuery({filters:{country:['RO']}}),'accounts').accepted,false);
  assert.equal(validateReportQuery(reportQuery({filters:{country:['RO']}}),'acquisition').accepted,true);
  assert.equal(validateReportQuery(reportQuery({filters:{country:['Romania']}}),'acquisition').accepted,false);
});

test('pre-auth account screens use W while authenticated account surfaces still require P4',()=>{
  const event=validWebsiteEvent({page_id:'account',event_name:'login_started',properties:{provider_kind:'email',entry_point:'signin'}});
  assert.equal(validateWebsiteEvent(event,eventContext({surface:'pre_auth'})).accepted,true);
  assert.equal(validateWebsiteEvent(event,eventContext({surface:'authenticated_account'})).reason,'invalid_consent');
  assert.equal(validateWebsiteEvent(validWebsiteEvent({page_id:'account',event_name:'profile_edit_started',properties:{edit_area_id:'profile'}}),eventContext({surface:'pre_auth'})).accepted,false);
});

test('report schemas retain sanitized campaign labels and reject non-ISO countries and incoherent rates',async()=>{
  assert.equal(validateReportQuery(reportQuery({filters:{country:['ZZ']}}),'acquisition').accepted,false);
  const fixtures=JSON.parse(await readFile(new URL('../contracts/website-analytics/v1/fixtures.json',import.meta.url),'utf8'));
  const report=structuredClone(fixtures.valid.find(f=>f.schema==='WebsiteReport'&&f.value.sourceQuality.view==='acquisition').value);
  report.breakdowns[0].rows[0].campaign='Autumn campaign';
  assert.equal(validateContractDto('WebsiteReport',report),true);
  report.metrics=[{id:'conversion',value:0.5,unit:'ratio',population:'consented_website_observations',numerator:1,denominator:0,status:'measured',exactness:'exact'}];
  assert.equal(validateContractDto('WebsiteReport',report),false);
  report.metrics[0].denominator=2;report.metrics[0].population='operational_accounts';
  assert.equal(validateContractDto('WebsiteReport',report),false);
});

test('all catalog event families accept only their declared scalar properties and qualified surfaces',()=>{
  const scenarios={
    session_started:{landing_page_id:'home',attribution_kind:'unknown'},
    page_viewed:{navigation_type:'initial'},
    page_engagement_reported:{active_ms_total:1000,visible_ms_total:2000,max_scroll_pct:50,revision:1},
    page_exited:{exit_kind:'hidden',max_scroll_pct:50},
    section_viewed:{section_id:'hero'},
    section_engagement_reported:{section_id:'hero',active_ms_total:1000,revision:1},
    scroll_depth_reached:{threshold:50},
    cta_clicked:{cta_id:'docs',section_id:'hero',action_id:'docs',placement:'hero'},
    navigation_used:{navigation_id:'header',target_page_id:'home',placement:'header'},
    outbound_clicked:{destination_id:'official_repository',section_id:'hero'},
    feature_selected:{feature_id:'review',selection_id:'review'},
    faq_toggled:{faq_id:'guest',expanded:true},
    download_platform_selected:{platform:'windows',architecture:'x64',selection_source:'detected'},
    download_unavailable_shown:{platform:'windows',reason:'unconfigured'},
    download_clicked:{cta_id:'download',platform:'windows',architecture:'x64',release_id:'release_1',artifact_id:'artifact_1',placement:'download'},
    contact_clicked:{contact_id:'info',placement:'footer'},
    account_entry_clicked:{placement:'header',entry_mode:'signin'},
    signup_started:{entry_point:'signup',provider_kind:'email'},
    signup_form_submitted:{provider_kind:'email'},
    verification_notice_viewed:{notice_kind:'email_verification'},
    login_started:{provider_kind:'email',entry_point:'signin'},
    login_form_submitted:{provider_kind:'email'},
    auth_challenge_viewed:{challenge_kind:'mfa'},
    account_page_viewed:{account_page_id:'profile'},
    profile_edit_started:{edit_area_id:'profile'},
    profile_save_submitted:{operation_id:'00000009-0000-4000-8000-000000000009'},
    password_reset_requested_ui:{entry_point:'password_reset'},
    password_reset_form_submitted:{flow_id:'00000008-0000-4000-8000-000000000008'},
    logout_clicked:{account_surface:'profile'},
    web_vital_reported:{metric:'LCP',value:1200,unit:'ms',metric_id:'vital_1',revision:1},
    javascript_error_observed:{error_code:'network_error',component_id:'page',build_sha:'build_1'},
    resource_load_failed:{resource_id:'logo',resource_kind:'image'},
    interaction_failed:{action_id:'download',normalized_error:'network_error'},
  };
  const accountEvents=['account_page_viewed','profile_edit_started','profile_save_submitted','logout_clicked'];
  for(const [event_name,properties] of Object.entries(scenarios)) {
    const isAccount=accountEvents.includes(event_name);
    const ctx=eventContext({surface:isAccount?'authenticated_account':'marketing',registry:{release:['release_1'],artifact:['artifact_1']},account:currentAccountProof(),receipt:validConsentReceipt({purposes:{websiteAnalytics:true,accountAnalytics:true}})});
    const event=validWebsiteEvent({event_name,properties,page_id:isAccount?'account':'home'});
    assert.equal(validateWebsiteEvent(event,ctx).accepted,true,event_name);
    const missing=structuredClone(properties);delete missing[Object.keys(missing)[0]];
    assert.equal(validateWebsiteEvent({...event,properties:missing},ctx).accepted,false,`${event_name} required property`);
    assert.equal(validateWebsiteEvent({...event,properties:{...properties,arbitrary:'hidden'}},ctx).accepted,false,`${event_name} extra property`);
  }
});

test('versioned strict schemas validate every valid/invalid DTO and all nine report unions', async()=> {
  const fixtures=JSON.parse(await readFile(new URL('../contracts/website-analytics/v1/fixtures.json',import.meta.url),'utf8'));
  for(const fixture of fixtures.valid) assert.equal(validateContractDto(fixture.schema,fixture.value),true,fixture.name);
  for(const fixture of fixtures.invalid) assert.equal(validateContractDto(fixture.schema,fixture.value),false,fixture.name);
  assert.equal(validateContractDto('ConsentReceipt',validConsentReceipt()),true);
  assert.deepEqual(fixtures.valid.filter(f=>f.schema==='WebsiteReport').map(f=>f.value.sourceQuality.view).sort(),['overview','acquisition','pages','sections','journeys','downloads','accounts','quality','health'].sort());
});

test('grouped report rows carry at most two view-allowed dimensions without raw identifiers',async()=>{
  const fixtures=JSON.parse(await readFile(new URL('../contracts/website-analytics/v1/fixtures.json',import.meta.url),'utf8'));
  const report=structuredClone(fixtures.valid.find(f=>f.schema==='WebsiteReport'&&f.value.sourceQuality.view==='pages').value);
  const row=report.breakdowns[0].rows[0];
  report.breakdowns[0].dimension='group';row.dimensions={country:'RO',deviceClass:'desktop'};
  assert.equal(validateContractDto('WebsiteReport',report),true);
  row.dimensions.user_id='forged';assert.equal(validateContractDto('WebsiteReport',report),false);
  delete row.dimensions.user_id;row.dimensions.browserFamily='chrome';assert.equal(validateContractDto('WebsiteReport',report),false);
  row.dimensions={platform:'windows'};assert.equal(validateContractDto('WebsiteReport',report),false);
});

test('journey conversion independently requires known reached sessions and a qualified denominator',async()=>{
  const fixtures=JSON.parse(await readFile(new URL('../contracts/website-analytics/v1/fixtures.json',import.meta.url),'utf8'));
  const original=fixtures.valid.find(f=>f.schema==='WebsiteReport'&&f.value.sourceQuality.view==='journeys').value;
  const cases=[
    {eligibleSessions:0,reachedSessions:null,conversion:0.5,want:false},
    {eligibleSessions:2,reachedSessions:null,conversion:0.5,want:false},
    {eligibleSessions:0,reachedSessions:0,conversion:0,want:false},
    {eligibleSessions:2,reachedSessions:1,conversion:0.75,want:false},
    {eligibleSessions:2,reachedSessions:1,conversion:0.5,want:true},
    {eligibleSessions:2,reachedSessions:0,conversion:0,want:true},
    {eligibleSessions:0,reachedSessions:null,conversion:null,want:true},
  ];
  for(const {want,...values} of cases) {
    const report=structuredClone(original);Object.assign(report.breakdowns[0].rows[0],values);
    assert.equal(validateContractDto('WebsiteReport',report),want,JSON.stringify(values));
    if(values.conversion!==null&&(values.reachedSessions===null||values.eligibleSessions===0))assert.equal(validateContractDto('journeysRow',report.breakdowns[0].rows[0]),false,'canonical row schema also rejects an unqualified rate');
  }
});

test('account coverage preserves unknown counts and known attribution parts reconcile with the total',async()=>{
  const fixtures=JSON.parse(await readFile(new URL('../contracts/website-analytics/v1/fixtures.json',import.meta.url),'utf8'));
  const original=fixtures.valid.find(f=>f.schema==='AccountOutcomeReport').value;
  const cases=[
    {coverage:'unmeasured',count:12,attributedCount:9,unattributedCount:8,want:false},
    {coverage:'not_configured',count:0,attributedCount:null,unattributedCount:null,want:false},
    {coverage:'unmeasured',count:null,attributedCount:0,unattributedCount:null,want:false},
    {coverage:'not_configured',count:null,attributedCount:null,unattributedCount:0,want:false},
    {coverage:'unmeasured',count:null,attributedCount:null,unattributedCount:null,want:true},
    {coverage:'not_configured',count:null,attributedCount:null,unattributedCount:null,want:true},
    {coverage:'measured',count:12,attributedCount:9,unattributedCount:8,want:false},
    {coverage:'measured',count:12,attributedCount:9,unattributedCount:3,want:true},
    {coverage:'measured',count:0,attributedCount:0,unattributedCount:0,want:true},
    {coverage:'partial',count:null,attributedCount:9,unattributedCount:3,want:false},
    {coverage:'partial',count:8,attributedCount:9,unattributedCount:null,want:false},
    {coverage:'partial',count:8,attributedCount:null,unattributedCount:9,want:false},
    {coverage:'partial',count:12,attributedCount:9,unattributedCount:null,want:true},
    {coverage:'partial',count:null,attributedCount:9,unattributedCount:null,want:true},
  ];
  for(const {want,...values} of cases) {
    const report=structuredClone(original);Object.assign(report.breakdowns[0].rows[0],values);
    for(const schema of ['WebsiteReport','AccountOutcomeReport'])assert.equal(validateContractDto(schema,report),want,`${schema}: ${JSON.stringify(values)}`);
    if(['unmeasured','not_configured'].includes(values.coverage))assert.equal(validateContractDto('accountsRow',report.breakdowns[0].rows[0]),want,'canonical row schema preserves absent-source nulls');
  }
});

test('storage enforces RLS, privacy, ranges and server-side report membership', async()=>{
  const db=await createSqlFixture();
  try {
    const longDomain='a'.repeat(63)+'.'+'b'.repeat(50)+'.com';
    assert.equal((await db.query("select public.wa_safe_dimensions($1,array['referrer_domain']) valid",[{referrer_domain:longDomain}])).rows[0].valid,true,'DNS domain length must match canonical context schema');
    const tables=['wa_events','wa_consent_receipts','wa_sessions','wa_source_snapshots','wa_daily_rollups','wa_data_health'];
    for(const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      for(const table of tables) {
        await assert.rejects(()=>db.query(`select * from public.${table}`),/permission denied/);
        await assert.rejects(()=>db.query(`insert into public.${table} default values`),/permission denied/);
      }
      await assert.rejects(()=>db.query("select public.wa_assert_report_actor('11111111-1111-4111-8111-111111111111')"),/permission denied/);
      await db.exec('reset role');
    }
    const receipt=validConsentReceipt();
    await db.query(`insert into public.wa_consent_receipts(receipt_id,site_id,policy_version,generation,website_analytics,account_analytics,issued_at,expires_at,collection_token_hash,revocation_proof_hash) values($1,$2,$3,$4,true,false,$5,$6,$7,$7)`,[receipt.receiptId,receipt.siteId,receipt.policyVersion,1,receipt.issuedAt,receipt.expiresAt,'a'.repeat(64)]);
    const event=validWebsiteEvent();
    const insert=properties=>db.query(`insert into public.wa_events(site_id,event_id,event_name,occurred_at,event_at,received_at,page_id,page_instance_id,page_version,session_id,anonymous_id,consent_receipt_id,consent_generation,properties) values('codevalanche',$1,'page_viewed',$2,$2,$2,'home',$3,'build_1',$4,$5,$6,1,$7)`,[event.event_id,event.occurred_at,event.page_instance_id,event.session_id,event.anonymous_id,event.consent_receipt_id,properties]);
    await assert.rejects(()=>insert({email:'private@example.com'}),/check constraint/);
    await assert.rejects(()=>insert({navigation_type:'initial',hidden:{token:'secret'}}),/check constraint/);
    await insert({navigation_type:'initial'});
    await db.exec('grant select on public.wa_events to authenticated;set role authenticated');
    assert.equal((await db.query('select count(*)::int n from public.wa_events')).rows[0].n,0);
    await db.exec('reset role;revoke select on public.wa_events from authenticated;set role service_role');
    await assert.rejects(()=>db.query("select public.wa_assert_report_actor('11111111-1111-4111-8111-111111111111')"),/forbidden/);
    await assert.rejects(()=>db.query("select public.wa_assert_report_period('2026-10-16','2026-10-15','UTC')"),/unsupported_query/);
    await assert.rejects(()=>db.query("select public.wa_assert_report_period('2026-01-01','2028-01-01','UTC')"),/unsupported_query/);
    await assert.rejects(()=>db.query("select public.wa_assert_report_period('2026-10-15','2026-10-16','Bogus/Place')"),/unsupported_query/);
    await db.query("select public.wa_assert_report_period('2026-10-15','2026-10-16','Europe/Bucharest')");
    await db.exec('reset role');
    const actor='11111111-1111-4111-8111-111111111111';
    await db.query('insert into auth.users(id) values($1)',[actor]);
    await db.query("insert into public.codevalanche_admin_memberships(user_id,role) values($1,'support_readonly')",[actor]);
    await db.exec('set role service_role');
    await db.query('select public.wa_assert_report_actor($1)',[actor]);
    await db.exec('reset role');
    await db.query('update public.codevalanche_admin_memberships set active=false where user_id=$1',[actor]);
    await db.exec('set role service_role');
    await assert.rejects(()=>db.query('select public.wa_assert_report_actor($1)',[actor]),/forbidden/);
    await db.exec('reset role');
    await assert.rejects(()=>db.query("insert into public.wa_source_snapshots(site_id,source,artifact_id,release_id,count_total,observed_at,source_watermark) values('codevalanche','release_provider','artifact','release',-1,now(),now())"),/check constraint/);
  } finally { await db.close(); }
});
test('Codevalanche real tab and FAQ IDs are registered without accepting arbitrary DOM labels',()=>{
 for(const id of ['project','agents','review','local_first'])assert.equal(validateWebsiteEvent(validWebsiteEvent({event_name:'feature_selected',properties:{feature_id:id,selection_id:id}}),eventContext()).accepted,true,id);
 for(const faq_id of ['product','agents','accounts','privacy','download'])assert.equal(validateWebsiteEvent(validWebsiteEvent({event_name:'faq_toggled',properties:{faq_id,expanded:true}}),eventContext()).accepted,true,faq_id);
 for(const id of ['Local-first tab text','unregistered'])assert.equal(validateWebsiteEvent(validWebsiteEvent({event_name:'feature_selected',properties:{feature_id:id,selection_id:id}}),eventContext()).accepted,false,id);
 for(const faq_id of ['What is Codevalanche?','unregistered'])assert.equal(validateWebsiteEvent(validWebsiteEvent({event_name:'faq_toggled',properties:{faq_id,expanded:true}}),eventContext()).accepted,false,faq_id);
});
