import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeEvent} from '../src/analytics/core/sanitizer.js';
import {validateWebsiteEvent,validateContractDto} from '../supabase/functions/_shared/websiteAnalyticsContract.ts';
import {readWebsiteReport} from '../supabase/functions/_shared/websiteAnalyticsReports.ts';
import {validWebsiteEvent,validConsentReceipt,eventContext} from '../supabase/tests/fixtures/websiteAnalytics.mjs';
import {PAGES,IDS,SECTIONS} from '../src/analytics/core/registry.js';
import {PAGE_REGISTRY} from '../supabase/functions/_shared/websiteAnalyticsContract.ts';
import {PAGE_SECTION_SCOPE} from '../supabase/functions/_shared/metricDefinitions.ts';
import {readFile} from 'node:fs/promises';
import {parse} from 'parse5';

const productScopes={how_it_works:['hero','workflow','showcase','footer'],agents:['hero','accounts','details','showcase','footer'],multiple_accounts:['hero','accounts','workflow','faq','footer'],local_ai:['hero','accounts','showcase','privacy_principles','faq','footer'],docs:['hero','workflow','details','faq','footer'],download:['hero','download','faq','footer'],security:['hero','privacy_principles','details','faq','footer']};
test('product page source markers exactly match measured section opportunities',async()=>{
 const sources={how_it_works:'how-it-works',agents:'agents',multiple_accounts:'features/multiple-accounts',local_ai:'local-ai',docs:'docs',download:'download',security:'security'};
 for(const [pageId,source] of Object.entries({...Object.fromEntries(Object.entries(sources).map(([pageId,source])=>[pageId,`${source}/index.html`])),changelog:'changelog.html',privacy:'privacy.html',terms:'terms.html'})){
  const document=parse(await readFile(new URL(`../src/${source}`,import.meta.url),'utf8'));
  const actual=[];const walk=node=>{const section=node.attrs?.find(attribute=>attribute.name==='data-analytics-section');if(section)actual.push(section.value);for(const child of node.childNodes??[])walk(child);};walk(document);walk(parse(await readFile(new URL('../src/partials/footer.html',import.meta.url),'utf8')));
  assert.deepEqual(actual,PAGE_SECTION_SCOPE.codevalanche[pageId],`${pageId} source sections are complete, unique and scoped`);
 }
});
test('Codevalanche product routes have exact section opportunities and additive catalogs',()=>{
 assert.deepEqual(PAGE_SECTION_SCOPE.codevalanche.home,SECTIONS.codevalanche,'all fourteen historical homepage opportunities stay intact');
 for(const pageId of ['home','changelog','privacy','terms','account_entry_legacy','account','account_authorize','not_found']){
  assert.ok(PAGES.codevalanche.includes(pageId));assert.ok(PAGE_REGISTRY.codevalanche.includes(pageId));
 }
 for(const [pageId,scope] of Object.entries(productScopes)){
  assert.ok(PAGES.codevalanche.includes(pageId),`SDK registers ${pageId}`);
  assert.ok(PAGE_REGISTRY.codevalanche.includes(pageId),`collector registers ${pageId}`);
  assert.deepEqual(PAGE_SECTION_SCOPE.codevalanche[pageId],scope);
  assert.equal(new Set(scope).size,scope.length);
  const event=validWebsiteEvent({page_id:pageId});
  assert.equal(validateWebsiteEvent(event,eventContext()).accepted,true);
  assert.ok(sanitizeEvent('navigation_used',{navigation_id:'header',target_page_id:pageId,placement:'header'},{},'codevalanche'));
 }
 for(const featureId of ['project','agents','review','local_first','task_brief','task_execution','command_approval']){
  assert.ok(IDS.feature.includes(featureId));assert.ok(IDS.selection.includes(featureId));
  const properties={feature_id:featureId,selection_id:featureId};
  const event=sanitizeEvent('feature_selected',properties,{},'codevalanche');
  assert.ok(event,`SDK accepts ${featureId}`);
  assert.equal(validateWebsiteEvent(validWebsiteEvent({event_name:'feature_selected',properties:event.properties}),eventContext()).accepted,true);
 }
 for(const id of ['agents/','how-it-works','task_brief?token=x','security@example.org','command_approval/../review']){
  assert.equal(sanitizeEvent('navigation_used',{navigation_id:'header',target_page_id:id,placement:'header'},{},'codevalanche'),null);
  assert.equal(sanitizeEvent('feature_selected',{feature_id:id,selection_id:id},{},'codevalanche'),null);
  assert.equal(validateWebsiteEvent(validWebsiteEvent({page_id:id}),eventContext()).accepted,false);
  assert.equal(validateWebsiteEvent(validWebsiteEvent({event_name:'feature_selected',properties:{feature_id:id,selection_id:id}}),eventContext()).accepted,false);
 }
});

test('Radovar company and product observations survive SDK sanitization and collector validation',()=>{
 const context=eventContext({origin:'https://radovar.com',receipt:validConsentReceipt({siteId:'radovar'})});
 for(const pageId of ['company','codevalanche']){
  for(const [eventName,properties] of [
   ['page_viewed',{navigation_type:'route'}],
   ['session_started',{landing_page_id:pageId,attribution_kind:'unknown'}],
   ['navigation_used',{navigation_id:'header',target_page_id:pageId,placement:'header'}],
  ]){
   const sanitized=sanitizeEvent(eventName,properties,{},'radovar');
   assert.ok(sanitized,`${eventName} accepts Radovar ${pageId}`);
   const event=validWebsiteEvent({site_id:'radovar',page_id:pageId,event_name:eventName,properties:sanitized.properties});
   assert.equal(validateWebsiteEvent(event,context).accepted,true,`${eventName} collector accepts Radovar ${pageId}`);
  }
 }
 assert.equal(sanitizeEvent('navigation_used',{navigation_id:'header',target_page_id:'company',placement:'header'},{},'codevalanche'),null,'the Radovar page catalog stays site scoped');
 assert.equal(validateWebsiteEvent(validWebsiteEvent({page_id:'company'}),eventContext()).accepted,false,'Radovar company does not become a Codevalanche page');
});

test('Radovar research pages preserve site isolation and exact source section opportunities',()=>{
 assert.deepEqual(PAGES.radovar,PAGE_REGISTRY.radovar,'browser and collector catalogs remain identical');
 const context=eventContext({origin:'https://radovar.com',receipt:validConsentReceipt({siteId:'radovar'})});
 const scopes={research:['intro','resources','company','footer'],research_wave_ai:['footer']};
 for(const [pageId,scope] of Object.entries(scopes)){
  assert.ok(PAGES.radovar.includes(pageId),`${pageId} is registered`);
  assert.deepEqual(PAGE_SECTION_SCOPE.radovar[pageId],scope);
  for(const [name,properties] of [['page_viewed',{navigation_type:'route'}],['session_started',{landing_page_id:pageId,attribution_kind:'unknown'}],['navigation_used',{navigation_id:'anchor',target_page_id:pageId,placement:'inline'}],...scope.map(section_id=>['section_viewed',{section_id}])]){
   const result=sanitizeEvent(name,properties,{},'radovar');assert.ok(result,`${pageId}/${name} survives SDK sanitation`);
   assert.equal(validateWebsiteEvent(validWebsiteEvent({site_id:'radovar',page_id:pageId,event_name:name,properties:result.properties}),context).accepted,true);
  }
  assert.equal(sanitizeEvent('navigation_used',{navigation_id:'header',target_page_id:pageId,placement:'header'},{},'codevalanche'),null);
  assert.equal(validateWebsiteEvent(validWebsiteEvent({page_id:pageId}),eventContext()).accepted,false);
 }
});

test('section reports retain exact C/R opportunities including unexposed shared footers',async()=>{
 const cases=[['radovar','company','company',true],['radovar','codevalanche','codevalanche',true],['radovar','press','company',true],['radovar','company','resources',false],['radovar','research','company',false],['radovar','research_wave_ai','footer',false],...['changelog','privacy','terms',...Object.keys(productScopes)].map(pageId=>['codevalanche',pageId,'footer',false])];
 for(const [siteId,pageId,sectionId,exposed] of cases){
  const page={site_id:siteId,event_id:crypto.randomUUID(),event_name:'page_viewed',event_at:'2026-10-14T10:00:00.000Z',received_at:'2026-10-14T10:00:00.000Z',page_id:pageId,page_version:'local_fixture',page_instance_id:crypto.randomUUID(),session_id:crypto.randomUUID(),anonymous_id:crypto.randomUUID(),event_source:'W',properties:{navigation_type:'initial'},context:{},traffic_class:'external',clock_quality:'original'};
  const events=[page,...(exposed?[{...page,event_id:crypto.randomUUID(),event_name:'section_viewed',event_at:'2026-10-14T10:00:02.000Z',properties:{section_id:sectionId}}]:[])];
  const query={siteId,from:'2026-10-14T00:00:00.000Z',to:'2026-10-15T00:00:00.000Z',timeZone:'UTC',granularity:'day',filters:{pageId:[pageId],sectionId:[sectionId]}};
  const result=await readWebsiteReport({actorId:'11111111-1111-4111-8111-111111111111'},query,'sections',{async rpc(){return {data:{events,rollups:[],rollupReady:true,health:[],observedFrom:query.from,watermark:query.to,rawWindowStart:'2026-07-17T12:00:00.000Z',rollupWindowStart:'2025-09-15T12:00:00.000Z'},error:null};}},{now:'2026-10-15T12:00:00.000Z'});
  assert.equal(validateContractDto('WebsiteReport',result),true);
  const reach=result.metrics.find(metric=>metric.id==='section_reach');
  assert.equal(reach.status,'measured',`${pageId}/${sectionId} is a supported opportunity`);
  assert.equal(reach.denominator,1,'the page supplies one section opportunity');
  assert.equal(reach.numerator,exposed?1:0);assert.equal(reach.value,exposed?1:0,'unseen sections remain an observed zero rather than disappearing');
 }
});
