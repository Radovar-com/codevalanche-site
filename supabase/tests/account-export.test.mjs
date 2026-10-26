import test from 'node:test';
import assert from 'node:assert/strict';
import {createSqlFixture} from './sqlHarness.mjs';
import {fixture,loadHandler,request,validClaims} from './handlerHarness.mjs';

const a='11111111-1111-4111-8111-111111111111', b='33333333-3333-4333-8333-333333333333';
const sa='22222222-2222-4222-8222-222222222222', sb='44444444-4444-4444-8444-444444444444';
const rpc=(db,uid=a,sid=sa,aal='aal1')=>db.query('select public.codevalanche_export_account($1,$2,$3) as data',[uid,sid,aal]).then(r=>r.rows[0].data);
async function seed(){
 const db=await createSqlFixture();
 for(const [uid,sid,label] of [[a,sa,'Own'],[b,sb,'Foreign']]){
  await db.query('insert into auth.users(id,email,encrypted_password,raw_user_meta_data) values($1,$2,$3,$4)',[uid,`${label.toLowerCase()}@example.test`,'hidden-password-hash',JSON.stringify({display_name:label,bio:'Biography',secret:'hidden-metadata'})]);
  await db.query('insert into auth.sessions(id,user_id,user_agent) values($1,$2,$3)',[sid,uid,`${label} browser`]);
  await db.query("insert into public.codevalanche_account_state(user_id) values($1)",[uid]);
  await db.query('insert into public.codevalanche_profiles(user_id,display_name,bio) values($1,$2,$3)',[uid,label,'Saved biography']);
  await db.query('insert into public.codevalanche_profile_requests(user_id,request_id) values($1,gen_random_uuid())',[uid]);
  await db.query("insert into public.codevalanche_feedback(user_id,category,message) values($1,'idea',$2)",[uid,`${label} feedback`]);
  await db.query("insert into public.codevalanche_security_events(user_id,session_id,source,occurred_at,event_name,outcome,ip,coverage) values($1,$2,'application_api',now(),'login','success','192.0.2.123','{\"secret\":\"hidden-coverage\"}')",[uid,sid]);
  await db.query("insert into public.codevalanche_account_erasure_jobs(user_id,actor_id,operation_id,previous_status,due_at,lease_id) values($1,$2,gen_random_uuid(),'active',now()+interval '7 days',gen_random_uuid())",[uid,uid===a?b:a]);
 }
 return db;
}
test('export returns a versioned complete owned snapshot with explicit safe fields',async()=>{
 const db=await seed();try{
  await db.exec('set role service_role');const data=await rpc(db);await db.exec('reset role');
  assert.equal(data.schemaVersion,1);assert.ok(Number.isFinite(Date.parse(data.exportedAt)));
  assert.equal(data.account.id,a);assert.equal(data.profile.display_name,'Own');
  assert.equal(data.sessions.length,1);assert.equal(data.sessions[0].id,sa);
  assert.equal(data.securityEvents.filter(e=>e.event_name==='login').length,1);
  assert.ok(data.securityEvents.length>=1);assert.equal(data.profileRequests.length,1);
  assert.equal(data.deletionRequests.length,1);assert.equal(data.feedback.length,1);
  assert.equal(data.feedback[0].message,'Own feedback');
  assert.deepEqual(Object.keys(data.securityEvents[0]).sort(),['event_id','event_name','occurred_at','outcome','reason_code','received_at','session_id','source'].sort());
  const json=JSON.stringify(data);for(const excluded of [b,sb,'Foreign','foreign@example.test','192.0.2.123','hidden-password-hash','hidden-metadata','hidden-coverage','lease_id','actor_id'])assert.ok(!json.includes(excluded),excluded);
  assert.equal((await rpc(db,b,sb)).account.id,b);
 }finally{await db.close()}
});
test('export rate is per account, atomic, and opens again after 300 seconds',async()=>{
 const db=await seed();try{
  const results=await Promise.allSettled([rpc(db),rpc(db)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.match(results.find(r=>r.status==='rejected').reason.message,/rate_limited/);
  await rpc(db,b,sb);
  await db.query("update public.codevalanche_rate_limits set started_at=clock_timestamp()-interval '301 seconds' where bucket=$1",[`account-export:${a}`]);
  assert.equal((await rpc(db)).account.id,a);
 }finally{await db.close()}
});
test('MFA export requires aal2 for verified factors and refusals do not consume the rate',async()=>{
 const db=await seed();try{
  await db.query("insert into auth.mfa_factors(id,user_id,status,factor_type,secret) values(gen_random_uuid(),$1,'verified','totp','hidden-totp-secret')",[a]);
  // Credential trigger revokes existing sessions: make a fresh signed-in session.
  await db.query('delete from public.codevalanche_revoked_sessions where user_id=$1',[a]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2) on conflict(id) do nothing',[sa,a]);
  await assert.rejects(()=>rpc(db),/mfa_required/);
  assert.equal((await db.query('select count(*)::int n from public.codevalanche_rate_limits')).rows[0].n,0);
  assert.ok(!JSON.stringify(await rpc(db,a,sa,'aal2')).includes('hidden-totp-secret'));
 }finally{await db.close()}
});
test('export refuses foreign, expired and revoked sessions before consuming rate',async()=>{
 const db=await seed();try{
  await assert.rejects(()=>rpc(db,a,sb),/session_revoked/);
  await db.query("update auth.sessions set not_after=now()-interval '1 second' where id=$1",[sa]);
  await assert.rejects(()=>rpc(db),/session_revoked/);
  await db.query('update auth.sessions set not_after=null where id=$1',[sa]);
  await db.query('insert into public.codevalanche_revoked_sessions(session_id,user_id) values($1,$2)',[sa,a]);
  await assert.rejects(()=>rpc(db),/session_revoked/);
  assert.equal((await db.query('select count(*)::int n from public.codevalanche_rate_limits')).rows[0].n,0);
 }finally{await db.close()}
});
test('export is denied directly to browser roles',async()=>{
 const db=await seed();try{for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(()=>rpc(db),/permission denied/);await db.exec('reset role')}}finally{await db.close()}
});
test('handler export requires MFA even for OAuth tokens and accepts only its own subject',async()=>{
 const f=fixture();f.user.factors=[{id:crypto.randomUUID(),factor_type:'totp',status:'verified'}];
 const handler=await loadHandler(f.db);
 const response=await handler(request('export-account',{}, {...validClaims(),client_id:'mobile-approved'}));
 assert.equal(response.status,401);assert.equal((await response.json()).mfaRequired,true);
 assert.equal((await handler(request('export-account',{userId:b},{...validClaims(),aal:'aal2'}))).status,400);
});

test('real handler exports through PostgreSQL, maps cooldown, and fails closed on storage errors',async()=>{
 const db=await seed();try{
  const f=fixture();f.user.id=a;
  const calls=[];
  f.db.rpc=async(name,args)=>{
   calls.push({name,args});
   try{
    const keys=Object.keys(args);
    const result=await db.query(`select public.${name}(${keys.map((k,i)=>`${k} => $${i+1}`).join(',')}) as data`,keys.map(k=>args[k]));
    return {data:result.rows[0]?.data,error:null};
   }catch(error){return {data:null,error}}
  };
  // Auth/session list is a SETOF RPC, whereas export is scalar JSON.
  const sqlRpc=f.db.rpc;
  f.db.rpc=async(name,args)=>name==='codevalanche_sessions'?{data:(await db.query('select * from public.codevalanche_sessions($1)',[args.p_user_id])).rows,error:null}:sqlRpc(name,args);
  const handler=await loadHandler(f.db);
  const result=await handler(request('export-account'));assert.equal(result.status,200);assert.equal((await result.json()).account.id,a);assert.equal(result.headers.get('cache-control'),'no-store');
  const refused=await handler(request('export-account',{apiVersion:2}));assert.equal(refused.status,429);assert.equal(refused.headers.get('retry-after'),'300');
  assert.equal((await refused.json()).error.retryAfterSeconds,300);
  assert.deepEqual(calls.find(c=>c.name==='codevalanche_export_account').args,{p_user_id:a,p_session_id:sa,p_aal:'aal1'});
  const invalid=await handler(request('export-account',{sessionId:sb}));assert.equal(invalid.status,400);
  f.db.rpc=async(name,args)=>name==='codevalanche_export_account'?{data:null,error:{message:'private database diagnostic'}}:sqlRpc(name,args);
  // Restore SETOF session reads for the handler authentication phase.
  const failureRpc=f.db.rpc;f.db.rpc=async(name,args)=>name==='codevalanche_sessions'?{data:[{id:sa}],error:null}:failureRpc(name,args);
  const unavailable=await handler(request('export-account'));assert.equal(unavailable.status,503);assert.ok(!JSON.stringify(await unavailable.json()).includes('private database diagnostic'));
 }finally{await db.close()}
});

test('large exports include every row and use profile fallback when no profile was saved',async()=>{
 const db=await seed();try{
  await db.query('delete from public.codevalanche_profiles where user_id=$1',[a]);
  await db.query("insert into public.codevalanche_feedback(user_id,category,message) select $1,'general','Item '||n from generate_series(1,1100) n",[a]);
  const data=await rpc(db);assert.equal(data.profile.display_name,'Own');assert.equal(data.profile.bio,'Biography');assert.equal(data.feedback.length,1101);
  assert.deepEqual(data.accountActivity,[]);assert.deepEqual(data.websiteAccountActivity,[]);
 }finally{await db.close()}
});

test('receipt joins export only account-attributed observations and never capabilities',async()=>{
 const db=await seed();try{
  for(const [uid,receiptId,label] of [[a,'55555555-5555-4555-8555-555555555555','own'],[b,'66666666-6666-4666-8666-666666666666','foreign']]){
   await db.query("insert into public.wa_consent_receipts(receipt_id,site_id,policy_version,generation,website_analytics,account_analytics,issued_at,expires_at,collection_token_hash,revocation_proof_hash) values($1,'codevalanche','v1',1,true,true,now(),now()+interval '1 day',repeat('a',64),repeat('b',64))",[receiptId]);
   await db.query('insert into public.wa_receipt_account_bindings(receipt_id,principal_id,account_consent_generation) values($1,$2,1)',[receiptId,uid]);
   for(const source of ['A','W'])await db.query("insert into public.wa_events(site_id,event_id,event_name,occurred_at,event_at,page_id,page_instance_id,page_version,session_id,anonymous_id,consent_receipt_id,consent_generation,properties,event_source,authority,surface) values('codevalanche',gen_random_uuid(),'page_viewed',now(),now(),$1,gen_random_uuid(),'v1',gen_random_uuid(),gen_random_uuid(),$2,1,'{\"navigation_type\":\"initial\"}',$3,$4,$5)",[label,receiptId,source,source==='A'?'consented_account_observation':'browser_observation',source==='A'?'authenticated_account':'marketing']);
  }
  const data=await rpc(db);assert.equal(data.consentReceipts.length,1);assert.equal(data.websiteAccountActivity.length,1);assert.equal(data.websiteAccountActivity[0].page_id,'own');
  const json=JSON.stringify(data);assert.ok(!json.includes('collection_token_hash'));assert.ok(!json.includes('revocation_proof_hash'));assert.ok(!json.includes('foreign'));assert.ok(!json.includes('66666666-6666-4666-8666-666666666666'));
 }finally{await db.close()}
});
