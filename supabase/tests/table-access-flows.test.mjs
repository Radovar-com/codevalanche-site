import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccessFixture as createSqlFixture} from './tableAccessFixture.mjs';
import {roleSqlClient} from './roleSqlClient.mjs';
import {tableAccess} from './tableAccessContract.mjs';
import {loadHandler,request,userId,sessionId,issuer} from './handlerHarness.mjs';
import {createDownloadRedirectHandler} from '../functions/download-redirect/index.ts';
import {createDownloadEvidenceStore} from '../functions/_shared/downloadEvidence.ts';
import {createWebsiteAnalyticsHandler} from '../functions/website-analytics/index.ts';
import {validWebsiteEvent} from './fixtures/websiteAnalytics.mjs';
import {requestErasure,processErasure} from '../functions/_shared/erasureJob.ts';
import {deliverNotification,notificationStore} from '../functions/_shared/notificationDelivery.ts';
import {runWebsiteAnalyticsRetention} from '../functions/_shared/websiteAnalyticsRetention.ts';

const otherUser='33333333-3333-4333-8333-333333333333';
const previousMigration='202610210001_download_page_counts.sql';
const manifest={version:1,gatewayBaseUrl:'https://example.supabase.co/functions/v1/download-redirect/v1',allowedOrigins:['https://artifacts.example.org'],assets:[{siteId:'codevalanche',platform:'windows',architecture:'x64',releaseId:'fixture_1',artifactId:'fixture_windows',qualified:true,targetUrl:'https://artifacts.example.org/fixture.exe'}]};
async function seed(db) {
  await db.query('insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now())',[userId,otherUser]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
  await db.query('insert into codevalanche_account_state(user_id) values($1),($2)',[userId,otherUser]);
  await db.query("insert into codevalanche_profiles(user_id,display_name,bio) values($1,'other fixture','private fixture')",[otherUser]);
}

for (const phase of ['before','after','after legacy defaults']) {
  const options=phase==='before'?{through:previousMigration}:{legacyTableGrants:phase==='after legacy defaults'};
  test(`account handler keeps self reads, profile writes, feedback, consent and revocation (${phase})`,async () => {
    const db=await createSqlFixture(options);
    try {
      await seed(db);
      const service=roleSqlClient(db,'service_role');
      service.auth={getUser:async()=>({data:{user:{id:userId,email_confirmed_at:'2026-10-01',user_metadata:{},identities:[]}},error:null}),admin:{}};
      const handler=await loadHandler(service);
      const call=async(action,fields={})=>{
        const response=await handler(request(action,{apiVersion:2,requestId:crypto.randomUUID(),...fields}));
        const body=await response.json();
        assert.equal(response.status,200,JSON.stringify(body));return body.data;
      };
      assert.equal((await call('account.overview')).user.id,userId);
      assert.equal((await call('profile.update',{displayName:'local fixture',bio:'fixture bio'})).ok,true);
      assert.equal((await call('account.overview')).user.displayName,'local fixture');
      assert.equal((await call('feedback.submit',{category:'bug',message:'synthetic feedback'})).ok,true);
      await call('analytics.consent',{analytics:true});
      assert.equal((await db.query('select analytics_consent from codevalanche_account_state where user_id=$1',[userId])).rows[0].analytics_consent,true);
      const foreign=await handler(request('account.overview',{apiVersion:2,requestId:crypto.randomUUID(),userId:otherUser}));
      assert.equal(foreign.status,403);
      const foreignProfile=await handler(request('profile.update',{apiVersion:2,requestId:crypto.randomUUID(),userId:otherUser,displayName:'tampered'}));
      assert.equal(foreignProfile.status,403);
      const foreignSession=crypto.randomUUID();
      await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[foreignSession,otherUser]);
      assert.equal((await handler(request('revoke-session',{sessionId:foreignSession}))).status,404);
      assert.equal((await db.query('select display_name from codevalanche_profiles where user_id=$1',[otherUser])).rows[0].display_name,'other fixture');
      assert.equal((await db.query('select count(*)::int n from codevalanche_feedback where user_id=$1',[userId])).rows[0].n,1);
      const ownSession=crypto.randomUUID();
      await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[ownSession,userId]);
      assert.equal((await handler(request('revoke-session',{sessionId:ownSession}))).status,200);
      assert.equal((await db.query('select count(*)::int n from codevalanche_revoked_sessions where session_id=$1',[ownSession])).rows[0].n,1);
    } finally { await db.close(); }
  });

  test(`public count RPC, redirect and analytics collector retain durable effects (${phase})`,async () => {
    const db=await createSqlFixture(options);
    try {
      for (const role of ['anon','authenticated']) {
        const result=await roleSqlClient(db,role).rpc('codevalanche_count_download',{p_metric:'download_started',p_platform:'windows-x64',p_locale:'ro'});
        assert.equal(result.error,null);
      }
      const service=roleSqlClient(db,'service_role'),pending=[],evidence=[];
      const record=createDownloadEvidenceStore(service);
      const redirect=createDownloadRedirectHandler({manifest,record:async row=>{evidence.push(row);await record(row);},waitUntil:p=>pending.push(p)});
      const response=await redirect(new Request('https://example.supabase.co/functions/v1/download-redirect/v1/codevalanche/windows/fixture_1/fixture_windows'));
      assert.equal(response.status,302);assert.equal(response.headers.get('location'),manifest.assets[0].targetUrl);
      await Promise.all(pending);
      await record(evidence[0]); // transport retry must not add another count
      assert.equal(Number((await db.query('select sum(count) n from wa_download_daily')).rows[0].n),1);
      assert.equal(Number((await db.query('select sum(count) n from codevalanche_download_counts')).rows[0].n),2);
      const handler=createWebsiteAnalyticsHandler({service,issuer,networkSecret:'synthetic-network-secret',downloadManifest:manifest});
      const call=(path,body,method='POST')=>handler(new Request(`https://example.supabase.co/functions/v1/website-analytics/v1/${path}`,{method,headers:{origin:'https://codevalanche.com','content-type':'application/json'},body:JSON.stringify(body)}),{remoteAddress:'127.0.0.1'});
      const issued=await call('consent/receipts',{siteId:'codevalanche',policyVersion:'2026-10-15',generation:1,purposes:{websiteAnalytics:true,accountAnalytics:false}});
      const receipt=await issued.json();assert.equal(issued.status,201,JSON.stringify(receipt));
      const event=validWebsiteEvent({occurred_at:new Date().toISOString(),consent_receipt_id:receipt.receiptId});
      const batch={receiptId:receipt.receiptId,generation:1,collectionToken:receipt.collectionToken,events:[event]};
      const ingested=await call('events',batch),ack=await ingested.json();assert.equal(ingested.status,200,JSON.stringify(ack));assert.deepEqual(ack.acceptedIds,[event.event_id]);
      const retry=await call('events',batch);assert.equal(retry.status,200);
      assert.equal((await db.query('select count(*)::int n from wa_events')).rows[0].n,1);
      assert.equal((await db.query('select count(*)::int n from wa_sessions')).rows[0].n,0);
      const revoked=await call(`consent/receipts/${receipt.receiptId}`,{receiptId:receipt.receiptId,generation:1,capability:receipt.revocationProof},'DELETE');
      assert.equal(revoked.status,200);assert.equal((await revoked.json()).revoked,true);
      assert.equal((await call('events',batch)).status,403);
      const retained=await runWebsiteAnalyticsRetention(service);assert.ok(retained);
    } finally { await db.close(); }
  });

  test(`scoped notification and erasure workers complete the same jobs (${phase})`,async () => {
    const db=await createSqlFixture(options);
    try {
      await seed(db);
      const notice=(await db.query('select id from codevalanche_notification_outbox where user_id=$1 limit 1',[userId])).rows[0];
      let deliveries=0;
      const result=await deliverNotification(notice.id,{store:notificationStore(roleSqlClient(db,'codevalanche_notification_worker')),channel:{send:async()=>{deliveries++;return {id:'synthetic-receipt'};}}});
      assert.equal(result.state,'delivered');assert.equal(deliveries,1);
      assert.equal((await db.query('select state from codevalanche_notification_outbox where id=$1',[notice.id])).rows[0].state,'delivered');
      const job=await requestErasure({userId,actorId:userId,operationId:crypto.randomUUID(),confirmation:'DELETE'},roleSqlClient(db,'service_role'));
      await db.query("update codevalanche_account_erasure_jobs set due_at=now()-interval '1 day' where job_id=$1",[job.jobId]);
      await db.query('update codevalanche_account_state set deletion_scheduled_for=(select due_at from codevalanche_account_erasure_jobs where job_id=$1) where user_id=$2',[job.jobId,userId]);
      const erasure=roleSqlClient(db,'codevalanche_erasure_worker');
      let deletes=0;
      // External Auth and remote purge are synthetic; every queue/RPC operation
      // still runs in PGlite under the restricted worker role.
      erasure.auth={admin:{getUserById:async()=>({data:{user:(await db.query('select id from auth.users where id=$1',[userId])).rows[0]??null},error:null}),deleteUser:async()=>{deletes++;await db.query('delete from auth.users where id=$1',[userId]);return {error:null};}}};
      erasure.remoteErase=async binding=>({...binding,state:'completed',receiptId:crypto.randomUUID(),localFilesTouched:false,metadataPurged:true});
      assert.equal((await processErasure(job.jobId,{execute:true,service:erasure})).state,'completed');
      assert.equal(deletes,1);
      assert.equal((await db.query('select state from codevalanche_account_erasure_jobs where job_id=$1',[job.jobId])).rows[0].state,'completed');
      assert.equal((await db.query('select count(*)::int n from codevalanche_profiles where user_id=$1',[otherUser])).rows[0].n,1);
      assert.equal((await roleSqlClient(db,'codevalanche_erasure_worker').from('codevalanche_account_state').select()).error?.code,'42501');
      assert.equal((await roleSqlClient(db,'codevalanche_notification_worker').rpc('codevalanche_erasure_claim',{p_job_id:job.jobId,p_lease_id:crypto.randomUUID()})).error?.code,'42501');
    } finally { await db.close(); }
  });
}

test('browser roles cannot read any private table; RLS hides both users even with a temporary SELECT grant',async () => {
  const db=await createSqlFixture();
  try {
    await seed(db);
    for (const role of ['anon','authenticated']) {
      const client=roleSqlClient(db,role,{claims:{sub:userId,role}});
      for (const table of Object.keys(tableAccess)) assert.equal((await client.from(table).select()).error?.code,'42501',`${role} ${table}`);
      for (const sub of [userId,otherUser]) {
        await db.exec('begin');
        try {
          await db.exec(`grant select on all tables in schema public to ${role};set role ${role}`);
          await db.query("select set_config('request.jwt.claims',$1,true)",[JSON.stringify({sub,role})]);
          for (const table of Object.keys(tableAccess)) assert.deepEqual((await db.query(`select * from public.${table}`)).rows,[],`${role} ${sub} ${table}`);
        } finally { await db.exec('reset role;rollback'); }
      }
    }
  } finally { await db.close(); }
});

test('concurrent role clients cannot lend service privileges to an anonymous write',async () => {
  const db=await createSqlFixture();
  try {
    await db.exec('create table public.role_race(id int primary key);grant select,insert,update on role_race to service_role');
    const anon=roleSqlClient(db,'anon'),service=roleSqlClient(db,'service_role');
    const [forbidden,read]=await Promise.all([
      anon.from('role_race').upsert({id:1}),
      service.from('role_race').select(),
    ]);
    assert.equal(forbidden.error?.code,'42501','anon must never execute with the concurrent service role');
    assert.equal(read.error,null);
    assert.equal((await db.query('select count(*)::int n from role_race')).rows[0].n,0);
    assert.equal((await db.query('select current_user actor')).rows[0].actor,'postgres');
  } finally { await db.close(); }
});
