import test from 'node:test';
import assert from 'node:assert/strict';
import {AuthSessionMissingError} from '@supabase/supabase-js';
import {createServer} from 'node:http';
import {createSqlFixture} from './sqlHarness.mjs';
import {validWebsiteEvent,reportQuery} from './fixtures/websiteAnalytics.mjs';
import {fixture,validClaims,issuer} from './handlerHarness.mjs';
import {createWebsiteAnalyticsHandler} from '../functions/website-analytics/index.ts';
import {ingestWebsiteBatch} from '../functions/_shared/websiteAnalyticsIngestion.ts';
import {issueConsentReceipt,revokeConsentReceipt,hashCapability} from '../functions/_shared/websiteAnalyticsConsent.ts';
import {validateContractDto} from '../functions/_shared/websiteAnalyticsContract.ts';

const origin='https://codevalanche.com';
function service(db){return {async rpc(name,args){try{const keys=Object.keys(args);return {data:(await db.query(`select * from public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')})`,keys.map(k=>args[k]))).rows,error:null};}catch(error){return {data:null,error};}}};}
const choice={siteId:'codevalanche',policyVersion:'2026-10-15',generation:1,purposes:{websiteAnalytics:true,accountAnalytics:false}};
async function setup(){const db=await createSqlFixture(),s=service(db),receipt=await issueConsentReceipt(choice,{origin,service:s});return {db,s,receipt,body:(events)=>({receiptId:receipt.receiptId,generation:1,collectionToken:receipt.collectionToken,events:events??[validWebsiteEvent({consent_receipt_id:receipt.receiptId,occurred_at:new Date().toISOString()})]})};}
test('real SQL inserts once across concurrent duplicate RPC calls and records ACK/health',async()=>{
 const f=await setup();try{const context={origin,service:f.s};const acks=await Promise.all([ingestWebsiteBatch(f.body(),context),ingestWebsiteBatch(f.body(),context)]);
 assert.equal(acks.flatMap(a=>a.acceptedIds).length,1);assert.equal(acks.flatMap(a=>a.duplicateIds).length,1);
 for(const ack of acks)assert.equal(validateContractDto('BatchReceipt',ack),true);
 assert.equal((await f.db.query('select count(*)::int n from wa_events')).rows[0].n,1);
 assert.equal((await f.db.query("select sum(count)::int n from wa_data_health where counter='accepted'")).rows[0].n,1);
 }finally{await f.db.close();}
});
test('insert failure rolls back the entire locked transaction and event envelope scope cannot be forged',async()=>{
 const f=await setup();try{const e=f.body().events[0],receivedAt=new Date().toISOString(),wrap=input=>({input,eventAt:receivedAt,receivedAt,clockQuality:'original',eventSource:'W',authority:'browser_observation',surface:'marketing'});
 const result=await f.s.rpc('wa_ingest_website_batch',{p_receipt_id:f.receipt.receiptId,p_site_id:'codevalanche',p_generation:1,p_collection_hash:await hashCapability(f.receipt.collectionToken),p_events:[wrap(e),wrap({...e,event_id:crypto.randomUUID(),properties:{navigation_type:'initial',email:'private@example.test'}})],p_rejected:[]});
 assert.ok(result.error);assert.equal((await f.db.query('select count(*)::int n from wa_events')).rows[0].n,0);
 const ack=await ingestWebsiteBatch(f.body([
  {...e,consent_receipt_id:crypto.randomUUID()},
  {...e,consent_generation:2},
  {...e,site_id:'radovar'},
  {...e,event_id:'not-a-uuid',event_source:'provider'},
 ]),{origin,service:f.s});
 assert.deepEqual(ack.rejected.map(r=>r.code),['invalid_consent','stale_generation','origin_not_allowed','forbidden_property']);assert.equal(ack.rejected[3].eventId,null);assert.equal(ack.acceptedIds.length,0);assert.equal(validateContractDto('BatchReceipt',ack),true);
 }finally{await f.db.close();}
});
test('committed ingest/revoke orderings and transaction rollback retain receipt serialization',async()=>{
 const f=await setup();try{const c={origin,service:f.s},proof={receiptId:f.receipt.receiptId,generation:1,capability:f.receipt.revocationProof};
 assert.equal((await ingestWebsiteBatch(f.body(),c)).acceptedIds.length,1);
 await f.db.exec('begin');await revokeConsentReceipt(proof,c);await f.db.exec('rollback');
 assert.equal((await ingestWebsiteBatch(f.body(),c)).duplicateIds.length,1);
 await revokeConsentReceipt(proof,c);
 await assert.rejects(ingestWebsiteBatch(f.body(),c),/invalid_consent/);
 assert.equal((await f.db.query('select count(*)::int n from wa_events')).rows[0].n,1);
 // A prevalidated payload cannot bypass a revoke committed before the insert RPC.
 const row={input:f.body().events[0],eventAt:new Date().toISOString(),receivedAt:new Date().toISOString(),clockQuality:'original',eventSource:'W',authority:'browser_observation',surface:'marketing'};
 const late=await f.s.rpc('wa_ingest_website_batch',{p_receipt_id:f.receipt.receiptId,p_site_id:'codevalanche',p_generation:1,p_collection_hash:await hashCapability(f.receipt.collectionToken),p_events:[row],p_rejected:[]});
 assert.equal(late.data[0].wa_ingest_website_batch.error,'invalid_consent');
 }finally{await f.db.close();}
});
test('schema, provenance spoof, stale generation, token, origin, clock and A guards',async()=>{
 const f=await setup();try{const c={origin,service:f.s},event=f.body().events[0];
 for(const bad of ['https://www.codevalanche.com','http://codevalanche.com','https://evil.test','null',''])await assert.rejects(ingestWebsiteBatch(f.body(),{...c,origin:bad}),/origin_not_allowed/);
 await assert.rejects(ingestWebsiteBatch({...f.body(),generation:2},c),/stale_generation/);
 await assert.rejects(ingestWebsiteBatch({...f.body(),collectionToken:'x'.repeat(43)},c),/invalid_consent/);
 await assert.rejects(ingestWebsiteBatch(f.body(Array(51).fill(event)),c),/invalid_fields/);
 const ack=await ingestWebsiteBatch(f.body([
  {...event,event_id:crypto.randomUUID(),event_source:'user'},
  {...event,event_id:crypto.randomUUID(),event_name:'login_succeeded',properties:{}},
  {...event,event_id:crypto.randomUUID(),event_name:'profile_edit_started',page_id:'account',properties:{edit_area_id:'profile'}},
  {...event,event_id:crypto.randomUUID(),occurred_at:new Date(Date.now()+3600000).toISOString()},
  {...event,event_id:crypto.randomUUID(),occurred_at:new Date(Date.now()-86401000).toISOString()},
 ]),c);
 assert.deepEqual(ack.rejected.map(r=>r.code),['forbidden_property','unknown_event','invalid_consent','invalid_fields']);assert.equal(ack.acceptedIds.length,1);
 const rows=(await f.db.query('select event_source,authority,clock_quality from wa_events')).rows;
 assert.deepEqual(rows,[{event_source:'W',authority:'browser_observation',clock_quality:'adjusted'}]);
 assert.equal((await f.db.query("select sum(count)::int n from wa_data_health where counter='rejected_consent'")).rows[0].n,3);
 }finally{await f.db.close();}
});
test('receipt burst limit persists refusal and health counters independently of account/download',async()=>{
 const f=await setup();try{for(let i=0;i<20;i++)await ingestWebsiteBatch(f.body(),{origin,service:f.s});
 // Seed a depleted bucket because real request time legitimately refills it.
 await f.db.query("update wa_rate_limits set tokens=0,updated_at=clock_timestamp() where scope='receipt'");
 await assert.rejects(ingestWebsiteBatch(f.body(),{origin,service:f.s}),e=>e.message==='rate_limited'&&e.retryAfterMs>0);
 assert.equal((await f.db.query("select sum(count)::int n from wa_data_health where counter='rate_limited'")).rows[0].n,1);
 await f.db.query("update wa_rate_limits set tokens=20,minute_count=120,minute_start=date_trunc('minute',clock_timestamp()) where scope='receipt'");
 await assert.rejects(ingestWebsiteBatch(f.body(),{origin,service:f.s}),e=>e.message==='rate_limited'&&e.retryAfterMs>0&&e.retryAfterMs<=60000);
 for(const role of ['anon','authenticated']){await f.db.exec(`set role ${role}`);await assert.rejects(f.db.query('select * from wa_rate_limits'),/permission denied/);await f.db.exec('reset role');}
 }finally{await f.db.close();}
});
test('network brake shares quota across fresh receipts, ignores spoofed forwarding headers, expires hashes',async()=>{
 const f=await setup();try{const handler=createWebsiteAnalyticsHandler({service:f.s,issuer,networkSecret:'test-only-secret'});
 const call=()=>handler(new Request('https://api.test/functions/v1/website-analytics/v1/consent/receipts',post(choice,{'x-forwarded-for':crypto.randomUUID()})),{remoteAddress:'192.0.2.55'});
 for(let i=0;i<60;i++)assert.equal((await call()).status,201);
 // Seed a depleted bucket because real request time legitimately refills it.
 await f.db.query("update wa_rate_limits set tokens=0,updated_at=clock_timestamp() where scope='network'");
 const blocked=await call();assert.equal(blocked.status,429);assert.ok(Number(blocked.headers.get('retry-after'))>=1);
 const stored=(await f.db.query("select key_hash,expires_at from wa_rate_limits where scope='network'")).rows;assert.equal(stored.length,1);assert.match(stored[0].key_hash,/^[a-f0-9]{64}$/);assert.equal(JSON.stringify(stored).includes('192.0.2.55'),false);
 await f.db.query("update wa_rate_limits set tokens=60,minute_count=600,minute_start=date_trunc('minute',clock_timestamp()) where scope='network'");
 assert.equal((await call()).status,429);
 await f.db.query("update wa_rate_limits set expires_at=clock_timestamp()-interval '1 second'");assert.equal((await call()).status,201);
 assert.equal((await f.db.query('select count(*)::int n from wa_rate_limits')).rows[0].n,1);
 }finally{await f.db.close();}
});

async function http(handler,run){const server=createServer(async(req,res)=>{const request=new Request(`http://localhost${req.url}`,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:req,duplex:'half'})});const out=await handler(request,{remoteAddress:'192.0.2.1'});res.writeHead(out.status,Object.fromEntries(out.headers));res.end(Buffer.from(await out.arrayBuffer()));});await new Promise(r=>server.listen(0,'127.0.0.1',r));try{await run(`http://127.0.0.1:${server.address().port}/functions/v1/website-analytics/v1`);}finally{await new Promise(r=>server.close(r));}}
const post=(body,headers={})=>({method:'POST',headers:{origin,'content-type':'application/json',...headers},body:JSON.stringify(body)});
test('real local HTTP consent, events, errors, CORS and revoke routes use the frozen wire',async()=>{
 const f=await setup();try{const handler=createWebsiteAnalyticsHandler({service:f.s,issuer,networkSecret:'test-only-network-secret'});
 await http(handler,async(base)=>{
  let r=await fetch(`${base}/consent/receipts`,post(choice));assert.equal(r.status,201);const receipt=await r.json();
  const body={receiptId:receipt.receiptId,generation:1,collectionToken:receipt.collectionToken,events:[validWebsiteEvent({consent_receipt_id:receipt.receiptId,occurred_at:new Date().toISOString()})]};
  r=await fetch(`${base}/events`,post(body));assert.equal(r.status,200);assert.equal((await r.json()).acceptedIds.length,1);assert.equal(r.headers.get('access-control-allow-origin'),origin);assert.equal(r.headers.get('cache-control'),'no-store');
  r=await fetch(`${base}/events`,post(body,{origin:'https://evil.test'}));assert.equal(r.status,403);assert.equal(r.headers.get('access-control-allow-origin'),null);
  r=await fetch(`${base}/events`,post({...body,extra:'x'.repeat(33000)}));assert.equal(r.status,413);
  r=await fetch(`${base}/consent/receipts/${receipt.receiptId}`,{...post({receiptId:receipt.receiptId,generation:1,capability:receipt.revocationProof}),method:'DELETE'});assert.equal(r.status,200);assert.deepEqual(await r.json(),{revoked:true,generation:2});
  r=await fetch(`${base}/events`,post(body));assert.equal(r.status,403);const error=await r.json();assert.equal(error.error.code,'invalid_consent');assert.equal(error.error.message,'Analytics request could not be processed.');assert.ok(error.requestId);assert.equal(JSON.stringify(error).includes('wa_'),false);
 });}finally{await f.db.close();}
});
test('reports reuse authoritative Auth session, current membership and factor evidence; absent reader unavailable',async()=>{
 const f=fixture();let membership=null,evidence={qualified:true,verified_factor_count:1,recovery_only:false,current_status:'active',blocked:false,session_active:true,policy_version:1};
 let guardError=null;const original=f.db.rpc;f.db.rpc=async(name,args)=>name==='codevalanche_credential_evidence'?{data:[evidence],error:null}:name==='wa_assert_report_actor'?{data:null,error:guardError}:original(name,args);
 f.db.from=()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:membership,error:null})});
 const handler=createWebsiteAnalyticsHandler({service:f.db,issuer,networkSecret:'test'}),url=`https://api.test/functions/v1/website-analytics/v1/reports/overview?query=${encodeURIComponent(JSON.stringify(reportQuery()))}`;
 const read=claims=>handler(new Request(url,{headers:claims?{authorization:`Bearer e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`}: {apikey:'public-key'}}));
 assert.equal((await read()).status,401);assert.equal((await read(validClaims())).status,403);
 membership={role:'owner',active:true};assert.equal((await read(validClaims())).status,403);
 const claims={...validClaims(),aal:'aal2',amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)-10},{method:'totp',timestamp:Math.floor(Date.now()/1000)-1}]};
 let r=await read(claims);assert.equal(r.status,503);assert.equal((await r.json()).error.code,'source_unavailable');
 guardError={message:'forbidden'};assert.equal((await read(claims)).status,403);guardError=null;
 membership={role:'owner',active:false};assert.equal((await read(claims)).status,403);membership={role:'support_readonly',active:true};
 assert.equal((await read(claims)).status,503);
 evidence={...evidence,qualified:false};assert.equal((await read(claims)).status,503);evidence={...evidence,qualified:true};
 evidence={...evidence,blocked:true};assert.equal((await read(claims)).status,403);evidence={...evidence,blocked:false};
 evidence={...evidence,verified_factor_count:0};assert.equal((await read(claims)).status,403);
 evidence={...evidence,verified_factor_count:1};f.active=false;assert.equal((await read(claims)).status,401);
 f.active=true;f.db.auth.getUser=async()=>({data:null,error:{status:401}});assert.equal((await read(claims)).status,401);
});
for(const [name,error,status,code] of [
 ['SDK missing session after provider sign-out',new AuthSessionMissingError(),401,'unauthenticated'],
 ['provider unauthorized',{status:401},401,'unauthenticated'],
 ['provider forbidden',{status:403},401,'unauthenticated'],
 ['unrecognized provider bad request',{status:400,name:'AuthApiError'},503,'source_unavailable'],
 ['provider server error',{status:500,name:'AuthApiError'},503,'source_unavailable'],
 ['missing-session name with server failure',{status:500,name:'AuthSessionMissingError'},503,'source_unavailable'],
 ['network failure without HTTP status',new TypeError('fetch failed'),503,'source_unavailable'],
]) test(`${name} propagates through the private website report API`,async()=>{
 const f=fixture();f.db.auth.getUser=async()=>({data:{user:null},error});
 const handler=createWebsiteAnalyticsHandler({service:f.db,issuer,networkSecret:'test'});
 const claims=validClaims(),query=encodeURIComponent(JSON.stringify(reportQuery()));
 const response=await handler(new Request(`https://api.test/functions/v1/website-analytics/v1/reports/overview?query=${query}`,{headers:{authorization:`Bearer e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`}}));
 assert.equal(response.status,status);assert.equal((await response.json()).error.code,code);
});
