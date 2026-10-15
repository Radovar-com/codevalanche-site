import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSqlFixture} from './sqlHarness.mjs';
import {createWebsiteAnalyticsHandler} from '../functions/website-analytics/index.ts';
import {issueConsentReceipt} from '../functions/_shared/websiteAnalyticsConsent.ts';
import {validWebsiteEvent} from './fixtures/websiteAnalytics.mjs';
test('actual collector factory accepts only its configured trusted release manifest',async()=>{
 const db=await createSqlFixture();try{
  const service={async rpc(name,args){try{const keys=Object.keys(args);return {data:(await db.query(`select * from public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')})`,keys.map(k=>args[k]))).rows,error:null};}catch(error){return {data:null,error};}}};
  const origin='https://codevalanche.com',receipt=await issueConsentReceipt({siteId:'codevalanche',policyVersion:'2026-10-15',generation:1,purposes:{websiteAnalytics:true,accountAnalytics:false}},{origin,service});
  const downloadManifest={version:1,gatewayBaseUrl:'https://example.supabase.co/functions/v1/download-redirect/v1',allowedOrigins:['https://artifacts.example.org'],assets:[{siteId:'codevalanche',platform:'windows',architecture:'x64',releaseId:'fixture_1',artifactId:'fixture_windows',qualified:true,targetUrl:'https://artifacts.example.org/fixture.exe'}]};
  const body={receiptId:receipt.receiptId,generation:1,collectionToken:receipt.collectionToken,events:[validWebsiteEvent({event_name:'download_clicked',consent_receipt_id:receipt.receiptId,occurred_at:new Date().toISOString(),properties:{cta_id:'download',platform:'windows',architecture:'x64',release_id:'fixture_1',artifact_id:'fixture_windows',placement:'download'}})]};
  const request=()=>new Request('https://example.supabase.co/functions/v1/website-analytics/v1/events',{method:'POST',headers:{Origin:origin,'content-type':'application/json'},body:JSON.stringify(body)});
  const options={service,issuer:'https://example.supabase.co/auth/v1',networkSecret:'fixture_secret'};
  let response=await createWebsiteAnalyticsHandler(options)(request(),{remoteAddress:'127.0.0.1'});const initial=await response.json();assert.equal(response.status,200,JSON.stringify(initial));assert.equal(initial.acceptedIds.length,0);
  response=await createWebsiteAnalyticsHandler({...options,downloadManifest})(request(),{remoteAddress:'127.0.0.1'});const ack=await response.json();assert.equal(ack.acceptedIds.length,1);
  assert.equal((await db.query("select properties->>'release_id' r from wa_events")).rows[0].r,'fixture_1');
 }finally{await db.close();}
});
test('SQL snapshot import is serialized, idempotent, baseline/reset/removal and monotone',async()=>{
 const db=await createSqlFixture();try{
  const put=async(n,time='2026-10-15T10:00:00Z',removed=false,release='fixture_1')=>(await db.query('select public.wa_import_release_asset_snapshot($1,$2,$3,$4,$5,$5,$6) v',['codevalanche',release,'fixture_windows',n,time,removed])).rows[0].v;
  assert.deepEqual(await put(100),{counterStatus:'baseline',countDelta:null,duplicate:false});
  assert.equal((await put(100)).duplicate,true);
  await assert.rejects(()=>put(101));
  assert.deepEqual(await put(106,'2026-10-15T11:00:00Z'),{counterStatus:'measured',countDelta:6,duplicate:false});
  await assert.rejects(()=>put(105,'2026-10-15T10:30:00Z'));
  assert.equal((await put(2,'2026-10-15T12:00:00Z')).counterStatus,'reset');
  assert.equal((await put(0,'2026-10-15T13:00:00Z',true)).counterStatus,'asset_removed');
  assert.equal((await put(50,'2026-10-15T14:00:00Z')).counterStatus,'baseline');
  assert.equal((await put(200,'2026-10-15T15:00:00Z',false,'fixture_2')).counterStatus,'baseline');
  assert.equal((await db.query('select min(count_delta)::int n from wa_source_snapshots')).rows[0].n,6);
  assert.equal((await db.query('select count(*)::int n from wa_events')).rows[0].n,0);
 }finally{await db.close();}
});
test('operational request UUID retries count once, no W IDs; RLS/grants and bounded retention',async()=>{
 const db=await createSqlFixture();try{
  const put=async(id,at='2026-10-15T10:00:00Z')=>db.query("select wa_record_download_request($1,'download_redirected','codevalanche','windows','x64','fixture_1','fixture_windows',$2)",[id,at]);
  const id='11111111-1111-4111-8111-111111111111';await put(id);await put(id);
  assert.equal((await db.query('select sum(count)::int n from wa_download_daily')).rows[0].n,1);
  assert.equal((await db.query('select response_class from wa_download_requests')).rows[0].response_class,'3xx');
  await assert.rejects(()=>put(id,'2026-10-15T11:00:00Z'));
  assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='wa_download_requests' and column_name in ('session_id','receipt_id','anonymous_id','ip','user_agent','url')")).rows[0].n,0);
  for(const role of ['anon','authenticated']){
   await db.exec(`set role ${role}`);await assert.rejects(()=>db.query('select * from wa_download_requests'));await assert.rejects(()=>put(crypto.randomUUID()));await db.exec('reset role');
  }
  await db.query("select wa_record_download_request($1,'download_request_failed','codevalanche','linux','unknown','unknown','unknown','2025-01-01Z')",[crypto.randomUUID()]);
  await db.query("select wa_prune_download_evidence('2026-10-16Z')");
  assert.equal((await db.query('select count(*)::int n from wa_download_requests')).rows[0].n,1);
  assert.equal((await db.query('select sum(count)::int n from wa_download_daily')).rows[0].n,1);
 }finally{await db.close();}
});
