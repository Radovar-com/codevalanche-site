import test from 'node:test';
import assert from 'node:assert/strict';
import {sanitizeEvent} from '../src/analytics/core/sanitizer.js';
import {validateWebsiteEvent,validateContractDto} from '../supabase/functions/_shared/websiteAnalyticsContract.ts';
import {readWebsiteReport} from '../supabase/functions/_shared/websiteAnalyticsReports.ts';
import {validWebsiteEvent,validConsentReceipt,eventContext} from '../supabase/tests/fixtures/websiteAnalytics.mjs';

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

test('Radovar section reports include opportunities on company, product and newsroom facts',async()=>{
 for(const [pageId,sectionId,exposed] of [['company','company',true],['codevalanche','codevalanche',true],['press','company',true],['company','resources',false]]){
  const page={site_id:'radovar',event_id:crypto.randomUUID(),event_name:'page_viewed',event_at:'2026-10-14T10:00:00.000Z',received_at:'2026-10-14T10:00:00.000Z',page_id:pageId,page_version:'local_fixture',page_instance_id:crypto.randomUUID(),session_id:crypto.randomUUID(),anonymous_id:crypto.randomUUID(),event_source:'W',properties:{navigation_type:'initial'},context:{},traffic_class:'external',clock_quality:'original'};
  const events=[page,...(exposed?[{...page,event_id:crypto.randomUUID(),event_name:'section_viewed',event_at:'2026-10-14T10:00:02.000Z',properties:{section_id:sectionId}}]:[])];
  const query={siteId:'radovar',from:'2026-10-14T00:00:00.000Z',to:'2026-10-15T00:00:00.000Z',timeZone:'UTC',granularity:'day',filters:{pageId:[pageId],sectionId:[sectionId]}};
  const result=await readWebsiteReport({actorId:'11111111-1111-4111-8111-111111111111'},query,'sections',{async rpc(){return {data:{events,rollups:[],rollupReady:true,health:[],observedFrom:query.from,watermark:query.to,rawWindowStart:'2026-07-17T12:00:00.000Z',rollupWindowStart:'2025-09-15T12:00:00.000Z'},error:null};}},{now:'2026-10-15T12:00:00.000Z'});
  assert.equal(validateContractDto('WebsiteReport',result),true);
  const reach=result.metrics.find(metric=>metric.id==='section_reach');
  assert.equal(reach.status,'measured',`${pageId}/${sectionId} is a supported opportunity`);
  assert.equal(reach.denominator,1,'the page supplies one section opportunity');
  assert.equal(reach.numerator,exposed?1:0);assert.equal(reach.value,exposed?1:0,'unseen sections remain an observed zero rather than disappearing');
 }
});
