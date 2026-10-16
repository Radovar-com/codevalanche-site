import test from 'node:test';
import assert from 'node:assert/strict';
import {createSqlFixture} from './sqlHarness.mjs';
import {fixture,loadHandler,request,validClaims,userId,sessionId} from './handlerHarness.mjs';
import {buildAccountExport,ACCOUNT_EXPORT_FORMAT} from '../functions/_shared/accountExport.ts';
import {runAccountRetention} from '../functions/_shared/accountRetention.ts';

const other='33333333-3333-4333-8333-333333333333', otherSession='44444444-4444-4444-8444-444444444444', secondSession='55555555-5555-4555-8555-555555555555';
async function sqlFixture(){
 const db=await createSqlFixture();
 await db.query("insert into auth.users(id,email) values($1,'a@example.test'),($2,'b@example.test')",[userId,other]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2),($3,$2),($4,$5)',[sessionId,userId,secondSession,otherSession,other]);
 return db;
}
const one=async(db,sql,params=[])=>(await db.query(sql,params)).rows[0];

// --- 1. revoke-session ends the Auth session (refresh tokens cascade) ------------
test('revoking a session deletes it at Supabase Auth and records the revocation',async()=>{const db=await sqlFixture();try{
 assert.equal((await one(db,'select public.codevalanche_revoke_session($1,$2) r',[userId,secondSession])).r,'provider_ended');
 assert.equal((await one(db,'select count(*)::int n from auth.sessions where id=$1',[secondSession])).n,0);
 assert.equal((await one(db,'select user_id from public.codevalanche_revoked_sessions where session_id=$1',[secondSession])).user_id,userId);
 assert.equal((await one(db,'select count(*)::int n from auth.sessions where id=$1',[sessionId])).n,1,'other sessions of the same person stay');
 assert.equal((await one(db,'select public.codevalanche_revoke_session($1,$2) r',[userId,secondSession])).r,'already_ended','retry is idempotent');
}finally{await db.close()}});
test('a session of another person can never be revoked or deleted',async()=>{const db=await sqlFixture();try{
 await assert.rejects(()=>db.query('select public.codevalanche_revoke_session($1,$2)',[userId,otherSession]),/not_found/);
 assert.equal((await one(db,'select count(*)::int n from auth.sessions where id=$1',[otherSession])).n,1);
 assert.equal((await one(db,'select count(*)::int n from public.codevalanche_revoked_sessions')).n,0);
}finally{await db.close()}});
test('without the privilege to delete Auth sessions the application revocation still holds',async()=>{const db=await sqlFixture();try{
 await db.exec("create function auth.refuse_delete() returns trigger language plpgsql as $$ begin raise exception 'denied' using errcode='insufficient_privilege'; end $$; create trigger refuse before delete on auth.sessions for each row execute function auth.refuse_delete();");
 assert.equal((await one(db,'select public.codevalanche_revoke_session($1,$2) r',[userId,secondSession])).r,'application_only');
 assert.equal((await one(db,'select count(*)::int n from public.codevalanche_revoked_sessions where session_id=$1',[secondSession])).n,1);
}finally{await db.close()}});
test('clients cannot call the revocation, export or retention functions directly',async()=>{const db=await sqlFixture();try{
 for(const role of ['anon','authenticated']){
  await db.exec(`set role ${role}`);
  await assert.rejects(()=>db.query('select public.codevalanche_revoke_session($1,$2)',[userId,secondSession]),/permission denied/);
  await assert.rejects(()=>db.query('select public.codevalanche_account_export($1)',[userId]),/permission denied/);
  await assert.rejects(()=>db.query('select public.codevalanche_account_retention()'),/permission denied/);
  await assert.rejects(()=>db.query('select public.codevalanche_rate_limits_prune(10)'),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec('set role codevalanche_retention_worker');
 await db.query('select public.codevalanche_account_retention()');
 await db.query('select public.codevalanche_rate_limits_prune(10)');
 await assert.rejects(()=>db.query('select public.codevalanche_account_export($1)',[userId]),/permission denied/);
 await db.exec('reset role');
}finally{await db.close()}});

// --- 2. GDPR export ----------------------------------------------------------------
test('the export holds the person\'s own rows only, without other people\'s ids',async()=>{const db=await sqlFixture();try{
 await db.query("insert into public.codevalanche_feedback(user_id,category,message) values($1,'bug','mine'),($2,'idea','not mine')",[userId,other]);
 await db.query("insert into public.codevalanche_events(id,user_id,event_name,platform) values(gen_random_uuid(),$1,'app_opened','windows'),(gen_random_uuid(),$2,'app_opened','linux')",[userId,other]);
 await db.query("insert into public.codevalanche_account_state(user_id,analytics_consent) values($1,true)",[userId]);
 await db.query("insert into public.codevalanche_operation_jobs(operation_id,actor_id,user_id,action,reason_code,parameters) values(gen_random_uuid(),$2,$1,'admin.account.suspend','abuse','{}')",[userId,other]);
 const doc=(await one(db,'select public.codevalanche_account_export($1) d',[userId])).d;
 assert.deepEqual(doc.feedback.map(f=>f.message),['mine']);
 assert.deepEqual(doc.events.map(e=>e.platform),['windows']);
 assert.equal(doc.accountState.analytics_consent,true);
 assert.equal(doc.accountActions.length,1);
 assert.equal(JSON.stringify(doc).includes(other),false,'no identifier of another person (administrator actor) leaks');
 assert.deepEqual(doc.activity,[]);assert.equal(doc.profile,null);
}finally{await db.close()}});
test('export document joins the verified Auth identity with the stored rows',async()=>{
 const calls=[];const service={rpc:async(name,args)=>{calls.push([name,args]);return {data:{feedback:[]},error:null}}};
 const user={id:userId,email:'a@example.test',email_confirmed_at:'2026-09-01T00:00:00Z',created_at:'2026-08-01T00:00:00Z',user_metadata:{display_name:'A'},app_metadata:{provider:'email'},identities:[{identity_id:'i1',provider:'google',identity_data:{email:'a@example.test'},created_at:'2026-08-01T00:00:00Z'}]};
 const doc=await buildAccountExport({user,sessions:[{id:sessionId,user_agent:'Codevalanche'},{id:secondSession}],currentSessionId:sessionId},service,new Date('2026-10-16T00:00:00Z'));
 assert.deepEqual(calls,[['codevalanche_account_export',{p_user_id:userId}]]);
 assert.equal(doc.format,ACCOUNT_EXPORT_FORMAT);assert.equal(doc.generatedAt,'2026-10-16T00:00:00.000Z');
 assert.equal(doc.user.email,'a@example.test');assert.equal(doc.signInMethods[0].provider,'google');
 assert.deepEqual(doc.sessions.map(s=>s.current),[true,false]);assert.deepEqual(doc.stored,{feedback:[]});
 await assert.rejects(()=>buildAccountExport({user,sessions:[],currentSessionId:sessionId},{rpc:async()=>({data:null,error:new Error('down')})}),/account_service_unavailable/);
});

// --- 3. Retention --------------------------------------------------------------------
test('retention removes only rows older than their written period',async()=>{const db=await sqlFixture();try{
 await db.query("insert into public.codevalanche_events(id,user_id,event_name,platform,created_at) values(gen_random_uuid(),$1,'app_opened','windows',now()-interval '91 days'),(gen_random_uuid(),$1,'app_opened','windows',now()-interval '89 days')",[userId]);
 await db.query("insert into public.codevalanche_feedback(user_id,category,message,created_at) values($1,'bug','old',now()-interval '731 days'),($1,'bug','recent',now()-interval '700 days')",[userId]);
 await db.query("insert into public.codevalanche_revoked_sessions(session_id,user_id,revoked_at) values($1,$2,now()-interval '31 days'),(gen_random_uuid(),$2,now()-interval '31 days'),(gen_random_uuid(),$2,now()-interval '1 day')",[sessionId,userId]);
 await db.query("insert into public.codevalanche_rate_limits(bucket,started_at) values('account:old',now()-interval '10 minutes'),('account:live',now())");
 await db.query("insert into public.codevalanche_operation_jobs(operation_id,actor_id,user_id,action,reason_code,parameters,state,completed_at) values(gen_random_uuid(),$1,$1,'admin.limits.update','x','{}','completed',now()-interval '366 days'),(gen_random_uuid(),$1,$1,'admin.limits.update','x','{}','pending',null)",[userId]);
 const result=(await one(db,'select public.codevalanche_account_retention() r')).r;
 assert.deepEqual({e:result.eventsDeleted,f:result.feedbackDeleted,r:result.revokedSessionsDeleted,o:result.operationJobsDeleted,l:result.rateLimitsDeleted},{e:1,f:1,r:1,o:1,l:1});
 assert.deepEqual((await db.query('select message from public.codevalanche_feedback')).rows.map(r=>r.message),['recent']);
 assert.equal((await one(db,'select count(*)::int n from public.codevalanche_revoked_sessions where session_id=$1',[sessionId])).n,1,'a revocation whose Auth session still exists is kept');
 assert.deepEqual((await db.query('select bucket from public.codevalanche_rate_limits')).rows.map(r=>r.bucket),['account:live']);
 assert.equal((await one(db,"select count(*)::int n from public.codevalanche_operation_jobs where state='pending'")).n,1);
 await assert.rejects(()=>db.query("select public.codevalanche_account_retention(now()+interval '1 year')"),/invalid_fields/);
}finally{await db.close()}});
test('rate-limit pruning is bounded and keeps live windows',async()=>{const db=await sqlFixture();try{
 await db.query("insert into public.codevalanche_rate_limits(bucket,started_at) select 'b'||g,now()-interval '1 hour' from generate_series(1,7) g");
 await db.query("insert into public.codevalanche_rate_limits(bucket) values('live')");
 assert.equal((await one(db,'select public.codevalanche_rate_limits_prune(5) n')).n,5);
 assert.equal((await one(db,'select public.codevalanche_rate_limits_prune(5) n')).n,2);
 assert.deepEqual((await db.query('select bucket from public.codevalanche_rate_limits')).rows.map(r=>r.bucket),['live']);
 assert.equal((await one(db,"select public.codevalanche_rate_limit('live',60) ok")).ok,true,'the limiter keeps working after a prune');
}finally{await db.close()}});
test('the retention worker runs the account retention next to the existing sweeps',async()=>{
 const calls=[];const service={rpc:async name=>{calls.push(name);return {data:name==='codevalanche_analytics_retention'?3:{n:1},error:null}}};
 const result=await runAccountRetention(service);
 assert.deepEqual(calls,['codevalanche_retention_sweep','codevalanche_analytics_retention','codevalanche_account_retention']);
 assert.deepEqual(Object.keys(result),['security','analytics','account']);
});

// --- 4. Indexes ------------------------------------------------------------------------
test('feedback and events have per-user and time-ordered indexes',async()=>{const db=await sqlFixture();try{
 const rows=(await db.query("select indexname,indexdef from pg_indexes where schemaname='public' and tablename in ('codevalanche_feedback','codevalanche_events')")).rows;
 const def=name=>rows.find(r=>r.indexname===name)?.indexdef||'';
 assert.match(def('codevalanche_feedback_user_created'),/\(user_id, created_at DESC\)/);
 assert.match(def('codevalanche_events_user_created'),/\(user_id, created_at DESC\)/);
 assert.match(def('codevalanche_events_created'),/\(created_at DESC\)/);
 assert.match(def('codevalanche_feedback_created'),/\(created_at DESC, id\)/);
}finally{await db.close()}});

// --- Handler wiring ------------------------------------------------------------------
const f=fixture();const rpcCalls=[];const baseRpc=f.db.rpc;const baseFrom=f.db.from;
f.db.from=table=>({...baseFrom(table),insert:async data=>{f.writes.push({table,data});return {data:null,error:null}}});
f.db.rpc=async(name,args)=>{rpcCalls.push([name,args]);
 if(name==='codevalanche_sessions')return {data:f.active?[{id:sessionId},{id:secondSession}]:[],error:null};
 if(name==='codevalanche_revoke_session')return {data:'provider_ended',error:null};
 if(name==='codevalanche_account_export')return {data:{feedback:[{message:'mine'}]},error:null};
 if(name==='codevalanche_rate_limit'&&String(args?.p_bucket).startsWith('export:')&&f.exportLimited)return {data:false,error:null};
 if(name==='codevalanche_credential_evidence')return {data:[{qualified:true,verified_factor_count:f.factors||0,credential_changed_at:null,recovery_only:false,policy_version:1,current_status:'active',blocked:false,session_active:true}],error:null};
 return baseRpc(name,args)};
const handler=await loadHandler(f.db);
const v2=(action,fields={})=>handler(request(action,{apiVersion:2,requestId:'w7-request',...fields}));
test('sessions.revoke ends the chosen session at Auth through the service-only RPC',async()=>{rpcCalls.length=0;
 const r=await v2('sessions.revoke',{sessionId:secondSession}),b=await r.json();
 assert.equal(r.status,200);assert.equal(b.data.ok,true);assert.equal(b.data.providerSession,'provider_ended');
 assert.deepEqual(rpcCalls.find(c=>c[0]==='codevalanche_revoke_session'),['codevalanche_revoke_session',{p_user_id:userId,p_session_id:secondSession}]);
});
test('sessions.revoke of a session that is not the person\'s own touches nothing',async()=>{rpcCalls.length=0;f.writes=[];
 assert.equal((await v2('sessions.revoke',{sessionId:otherSession})).status,404);
 assert.equal(rpcCalls.some(c=>c[0]==='codevalanche_revoke_session'),false);assert.equal(f.writes.length,0);
});
test('account.export returns the person\'s document in the v2 envelope, rate limited per account',async()=>{rpcCalls.length=0;
 const r=await v2('account.export'),b=await r.json();
 assert.equal(r.status,200);assert.equal(b.apiVersion,2);assert.equal(b.data.format,ACCOUNT_EXPORT_FORMAT);assert.equal(b.data.user.id,userId);
 assert.deepEqual(b.data.stored,{feedback:[{message:'mine'}]});assert.equal(b.data.sessions.find(s=>s.current).id,sessionId);
 assert.ok(rpcCalls.some(c=>c[0]==='codevalanche_rate_limit'&&c[1].p_bucket===`export:${userId}`));
 f.exportLimited=true;try{assert.equal((await v2('account.export')).status,429)}finally{f.exportLimited=false}
});
test('account.export stays available while a deletion is pending',async()=>{const state=f.state;f.state={...state,status:'deletion_pending',deletion_scheduled_for:new Date(Date.now()+86400000).toISOString()};
 try{assert.equal((await v2('account.export')).status,200);assert.equal((await v2('profile.update',{displayName:'x'})).status,403)}finally{f.state=state}
});
test('the v2 envelope carries an additive API revision while apiVersion stays 2 for installed clients',async()=>{
 const b=await (await v2('account.overview')).json();assert.equal(b.apiVersion,2);assert.equal(Number.isInteger(b.apiRevision)&&b.apiRevision>=1,true);
 const flat=await (await handler(request('get-account',{},validClaims(),'GET'))).json();assert.equal(flat.apiRevision,undefined);assert.equal(flat.apiVersion,undefined);
});
test('feedback is never anonymous and never shares a bucket between people',async()=>{rpcCalls.length=0;f.writes=[];
 const anonymous=new Request('https://example.test',{method:'POST',headers:{'content-type':'application/json',origin:'https://codevalanche.com'},body:JSON.stringify({action:'feedback.submit',apiVersion:2,requestId:'w7-anon',category:'bug',message:'hi'})});
 assert.equal((await handler(anonymous)).status,401);assert.equal(rpcCalls.length,0);assert.equal(f.writes.length,0);
 await v2('feedback.submit',{category:'bug',message:'hello'});
 const buckets=rpcCalls.filter(c=>c[0]==='codevalanche_rate_limit').map(c=>c[1].p_bucket);
 assert.ok(buckets.includes(`feedback:${userId}`));assert.equal(buckets.some(b=>!b.endsWith(userId)),false);
});

// --- Review fixes (W7-FIX-SRV-ACCOUNT) ----------------------------------------------
const staleClaims=()=>({...validClaims(),amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)-3600}]});
test('account.export asks for a recent sign-in, like a deletion request',async()=>{rpcCalls.length=0;
 const r=await handler(request('account.export',{apiVersion:2,requestId:'w7-stale'},staleClaims())),b=await r.json();
 assert.equal(r.status,401);assert.equal(b.error.code,'reauthentication_required');
 assert.equal(rpcCalls.some(c=>c[0]==='codevalanche_account_export'),false,'no data is read for a stale sign-in');
 const flat=await handler(request('export-data',{},staleClaims()));assert.equal(flat.status,401,'the v1 action name is held to the same rule');
});
test('account.export asks for the authenticator when one is enrolled',async()=>{rpcCalls.length=0;f.factors=1;try{
 const r=await v2('account.export'),b=await r.json();
 assert.equal(r.status,403);assert.equal(b.error.code,'mfa_required');
 assert.equal(rpcCalls.some(c=>c[0]==='codevalanche_account_export'),false);
}finally{f.factors=0}});
test('an export above the byte cap is refused with a clear 413, not an Edge 5xx',async()=>{
 const user={id:userId,identities:[]};
 await assert.rejects(()=>buildAccountExport({user,sessions:[],currentSessionId:sessionId},{rpc:async()=>({data:null,error:{message:'export_too_large'}})}),e=>e.code==='export_too_large'&&e.status===413);
 const db=await sqlFixture();try{
  await db.query("insert into public.codevalanche_feedback(user_id,category,message) select $1,'bug',repeat('x',1000) from generate_series(1,40)",[userId]);
  assert.ok((await one(db,'select public.codevalanche_account_export($1) d',[userId])).d.feedback.length===40,'under the cap the document is returned');
  await db.exec("set codevalanche.account_export_max_bytes = '20000'");
  await assert.rejects(()=>db.query('select public.codevalanche_account_export($1)',[userId]),/export_too_large/);
  await db.exec("set codevalanche.account_export_max_bytes = '999999999999'");
  assert.ok((await one(db,'select public.codevalanche_account_export($1) d',[userId])).d.feedback.length===40,'the setting can only lower the built-in cap');
 }finally{await db.close()}
});
test('retention deletes in bounded batches and reports that more is left',async()=>{const db=await sqlFixture();try{
 await db.query("insert into public.codevalanche_events(id,user_id,event_name,platform,created_at) select gen_random_uuid(),$1,'app_opened','windows',now()-interval '100 days' from generate_series(1,12000)",[userId]);
 await db.query("insert into public.codevalanche_rate_limits(bucket,started_at) select 'old'||g,now()-interval '1 hour' from generate_series(1,10500) g");
 const first=(await one(db,'select public.codevalanche_account_retention() r')).r;
 assert.equal(first.eventsDeleted,10000);assert.equal(first.rateLimitsDeleted,10000);assert.equal(first.more,true);
 const second=(await one(db,'select public.codevalanche_account_retention() r')).r;
 assert.equal(second.eventsDeleted,2000);assert.equal(second.rateLimitsDeleted,500);assert.equal(second.more,false);
 assert.equal((await one(db,'select count(*)::int n from public.codevalanche_events')).n,0);
}finally{await db.close()}});
test('the retention worker repeats the account pass while it reports more, within a bound',async()=>{
 let left=3;const calls=[];const service={rpc:async name=>{calls.push(name);if(name!=='codevalanche_account_retention')return {data:1,error:null};left--;return {data:{eventsDeleted:10000,more:left>0},error:null}}};
 const result=await runAccountRetention(service);
 assert.equal(calls.filter(n=>n==='codevalanche_account_retention').length,3);assert.equal(result.account.more,false);assert.equal(result.account.passes,3);assert.equal(result.account.eventsDeleted,30000);
 const endless={rpc:async name=>({data:name==='codevalanche_account_retention'?{eventsDeleted:1,more:true}:1,error:null})};
 const capped=await runAccountRetention(endless);assert.equal(capped.account.more,true);assert.ok(capped.account.passes<=20);
});
test('the account page names the export size refusal instead of a generic error',async()=>{
 const {normalizeAccountError,safeError}=await import('../../src/account/helpers.js');
 const e=normalizeAccountError({apiVersion:2,ok:false,error:{code:'export_too_large'}},413);
 assert.equal(e.code,'export_too_large');assert.match(safeError(e),/too large/);
});
