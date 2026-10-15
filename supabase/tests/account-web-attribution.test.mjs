import test from 'node:test';
import assert from 'node:assert/strict';
import {createSqlFixture} from './sqlHarness.mjs';
import {validWebsiteEvent} from './fixtures/websiteAnalytics.mjs';
import {request,validClaims,issuer,userId,sessionId,loadHandler} from './handlerHarness.mjs';
import {createWebsiteAnalyticsHandler} from '../functions/website-analytics/index.ts';
import {normalizeProviderEvent,normalizePasswordHook} from '../functions/_shared/securityEvent.ts';
import {reportQuery} from './fixtures/websiteAnalytics.mjs';
import {validateContractDto} from '../functions/_shared/websiteAnalyticsContract.ts';
const origin='https://codevalanche.com',other='33333333-3333-4333-8333-333333333333';
async function setup(){
 const db=await createSqlFixture();
 await db.query('insert into auth.users(id,email_confirmed_at) values($1,now()),($2,null)',[userId,other]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
 await db.query('insert into codevalanche_account_state(user_id,analytics_consent,consent_generation) values($1,true,7),($2,true,7)',[userId,other]);
 let current=userId;
 const service={auth:{getUser:async()=>({data:{user:{id:current,email_confirmed_at:'2026-10-01',user_metadata:{}}},error:null})},
  async rpc(name,args){try{const keys=Object.keys(args);return {data:(await db.query(`select * from public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')})`,keys.map(k=>args[k]))).rows,error:null};}catch(error){return {data:null,error};}},
  from(table){let filter;return {select(){return this},eq(k,v){filter=[k,v];return this},async maybeSingle(){return {data:(await db.query(`select * from public.${table} where ${filter[0]}=$1`,[filter[1]])).rows[0]??null,error:null}}}}
 };
 const handler=createWebsiteAnalyticsHandler({service,issuer,networkSecret:'local-test-only'});
 const call=(path,body,claims=validClaims())=>handler(new Request('https://api.test/functions/v1/website-analytics/v1'+path,{method:'POST',headers:{origin,'content-type':'application/json',...(claims?{authorization:request('x',{},claims).headers.get('authorization')}:{})},body:JSON.stringify(body)}),{remoteAddress:'192.0.2.3'});
 return {db,service,call,switchTo(id){current=id;}};
}
test('current ordinary consumer P4 session admits A with W refused; switch, expiry and regrant reject old scope',async()=>{
 const f=await setup();try{
 const choice={siteId:'codevalanche',policyVersion:'2026-10-15',generation:2,purposes:{websiteAnalytics:false,accountAnalytics:true}};
 const response=await f.call('/consent/receipts',choice);assert.equal(response.status,201,'A receipt must use consumer authority and independent P4 generation');const r=await response.json();
 const e=validWebsiteEvent({event_id:crypto.randomUUID(),occurred_at:new Date().toISOString(),page_id:'account',event_name:'account_page_viewed',properties:{account_page_id:'profile'},consent_receipt_id:r.receiptId,consent_generation:r.generation});
 const body={receiptId:r.receiptId,generation:r.generation,collectionToken:r.collectionToken,events:[e]};
 assert.equal((await (await f.call('/events',body)).json()).acceptedIds.length,1);
 assert.deepEqual((await f.db.query('select event_source,authority from wa_events')).rows,[{event_source:'A',authority:'consented_account_observation'}]);
 assert.equal((await f.call('/events',body,null)).status,401);
 assert.equal((await f.call('/events',body,{...validClaims(),exp:1})).status,401);
 f.switchTo(other);await f.db.query('update auth.sessions set user_id=$1 where id=$2',[other,sessionId]);
 assert.equal((await f.call('/events',body,{...validClaims(),sub:other})).status,403);
 f.switchTo(userId);await f.db.query('update auth.sessions set user_id=$1 where id=$2',[userId,sessionId]);
 await f.db.query('update codevalanche_account_state set consent_generation=9 where user_id=$1',[userId]);
 assert.equal((await f.call('/events',body)).status,409);
 assert.equal((await f.db.query('select count(*)::int n from wa_events')).rows[0].n,1);
 }finally{await f.db.close();}
});
test('profile persistence and durable outcome are atomic, actor-scoped idempotent, and analytics-independent',async()=>{
 const f=await setup();try{
 const {persistProfileWithOutcome}=await import('../functions/_shared/profileOutcome.ts');const rid=crypto.randomUUID();
 await f.db.query('update codevalanche_account_state set analytics_consent=false');
 const save=(id=userId,requestId=rid,validatedChanges={display_name:'New name'})=>persistProfileWithOutcome({principal:{userId:id},validatedChanges,requestId,consentGeneration:7},f.service);
 assert.equal((await save()).ok,true);assert.equal((await save()).ok,true);
 assert.equal((await f.db.query('select count(*)::int n from wa_profile_outcomes')).rows[0].n,1);
 assert.equal((await f.db.query('select display_name,bio from codevalanche_profiles where user_id=$1',[userId])).rows[0].display_name,'New name');
 await save(other);assert.equal((await f.db.query('select count(*)::int n from wa_profile_outcomes')).rows[0].n,2);
 await save(userId,'legacy_request',{bio:'Legacy works'});
 assert.equal((await f.db.query('select display_name,bio from codevalanche_profiles where user_id=$1',[userId])).rows[0].bio,'Legacy works');
 await f.db.exec("create function fail_outcome() returns trigger language plpgsql as $$ begin raise exception 'fixture persistence failure'; end $$;create trigger fail_outcome before insert on wa_profile_outcomes for each row execute function fail_outcome()");
 await assert.rejects(save(userId,crypto.randomUUID(),{display_name:'Must roll back'}));
 assert.equal((await f.db.query('select display_name,bio from codevalanche_profiles where user_id=$1',[userId])).rows[0].display_name,'New name');
 await f.db.exec('drop trigger fail_outcome on wa_profile_outcomes');
 await f.db.query('delete from auth.users where id=$1',[userId]);
 assert.equal((await f.db.query('select count(*)::int n from wa_profile_outcomes where user_id=$1',[userId])).rows[0].n,0);
 }finally{await f.db.close();}
});
test('provider outcomes never turn refresh or password-only success into session success',()=>{
 assert.equal(normalizeProviderEvent({id:'refresh',action:'token_refreshed',user_id:userId,session_id:sessionId,created_at:new Date().toISOString()}).eventName,'token_refreshed');
 assert.equal(normalizePasswordHook({valid:true,user_id:userId}).eventName,'password_valid');
 assert.notEqual(normalizeProviderEvent({id:'login',action:'login',user_id:userId,created_at:new Date().toISOString()}).eventName,'login_succeeded');
});
test('account report distinguishes created/verified, hides provider gaps and exposes no identity',async()=>{
 const f=await setup();try{
 const {readAccountOutcomeReport}=await import('../functions/_shared/accountOutcomeReports.ts');
 await f.db.query("insert into codevalanche_admin_memberships(user_id,role,active) values($1,'owner',true)",[userId]);
 const report=await readAccountOutcomeReport({actorId:userId,role:'owner'},reportQuery({from:new Date(Date.now()-3600000).toISOString(),to:new Date(Date.now()+3600000).toISOString()}),f.service);
 assert.equal(validateContractDto('AccountOutcomeReport',report),true);
 const rows=report.breakdowns[0].rows;
 assert.equal(rows.find(r=>r.concept==='account_created').count,2);
 assert.equal(rows.find(r=>r.concept==='email_verified').count,1);
 assert.equal(rows.find(r=>r.concept==='login_succeeded').count,null);
 assert.equal(rows.find(r=>r.concept==='login_succeeded').attributedCount,null);
 assert.equal(report.population,'operational_accounts');assert.equal(JSON.stringify(report).includes(userId),false);
 await assert.rejects(readAccountOutcomeReport({actorId:other,role:'owner'},reportQuery(),f.service));
 }finally{await f.db.close();}
});
test('canonical profile seeds partial saves, preserves clears, updates admin search and keeps UUID retry idempotent after retention',async()=>{
 const f=await setup();try{
 const {persistProfileWithOutcome,readOwnedProfile}=await import('../functions/_shared/profileOutcome.ts');
 await f.db.query("update auth.users set raw_user_meta_data='{"+'"display_name":"Legacy","bio":"Original bio"'+"}' where id=$1",[userId]);
 assert.equal((await readOwnedProfile(f.service,{id:userId})).display_name,'Legacy');
 const rid=crypto.randomUUID(),save=(changes,id=rid)=>persistProfileWithOutcome({principal:{userId},requestId:id,validatedChanges:changes},f.service);
 await Promise.all([save({display_name:'Canonical'}),save({display_name:'Canonical'})]);
 assert.deepEqual(await readOwnedProfile(f.service,{id:userId}),{display_name:'Canonical',bio:'Original bio'});
 assert.equal((await f.db.query('select * from codevalanche_admin_directory($1,null,51)',['Canonical'])).rows[0].display_name,'Canonical');
 assert.equal((await f.db.query('select * from codevalanche_admin_directory($1,null,51)',['Legacy'])).rows.length,0);
 const first=(await f.db.query("select * from codevalanche_admin_directory('',null,1)")).rows;
 assert.deepEqual(first.map(r=>r.id),[userId]);
 assert.deepEqual((await f.db.query("select * from codevalanche_admin_directory('',$1,1)",[userId])).rows.map(r=>r.id),[other]);
 assert.equal((await f.db.query('select * from codevalanche_admin_user_detail($1)',[userId])).rows[0].display_name,'Canonical');
 assert.equal((await f.db.query('select raw_user_meta_data from auth.users where id=$1',[userId])).rows[0].raw_user_meta_data.display_name,'Legacy','Auth metadata stays provider-managed');
 await save({display_name:'',bio:''},crypto.randomUUID());
 assert.deepEqual(await readOwnedProfile(f.service,{id:userId}),{display_name:'',bio:''});
 await f.db.query("update wa_profile_outcomes set occurred_at=now()-interval '91 days'");await f.db.query('select wa_profile_retention()');
 await save({display_name:'Must not replay'});
 assert.equal((await readOwnedProfile(f.service,{id:userId})).display_name,'');
 for(const role of ['anon','authenticated']){await f.db.exec(`set role ${role}`);await assert.rejects(f.db.query('select * from codevalanche_profiles'),/permission denied/);await assert.rejects(f.db.query('select * from wa_profile_outcomes'),/permission denied/);await f.db.exec('reset role');}
 }finally{await f.db.close();}
});
test('actual account handler returns success only after canonical commit, keeps legacy saves, and reports normalized failure',async()=>{
 const f=await setup();try{
 const handler=await loadHandler(f.service);await f.db.query('update codevalanche_account_state set analytics_consent=false');
 const id=crypto.randomUUID();const save=()=>handler(request('profile.update',{apiVersion:2,requestId:id,displayName:'Persisted',bio:'Private profile content'}));
 const r=await save();assert.equal(r.status,200);assert.equal((await r.json()).data.ok,true);await save();
 assert.equal((await f.db.query('select count(*)::int n from wa_profile_outcomes')).rows[0].n,1);
 const overview=await handler(request('get-account'));assert.equal((await overview.json()).user.displayName,'Persisted');
 const legacy=await handler(request('update-profile',{requestId:'legacy-id',displayName:'Legacy compatible'}));assert.equal(legacy.status,200);
 await f.db.exec("create function reject_profile_update() returns trigger language plpgsql as $$ begin raise exception 'private database detail';end $$;create trigger reject_profile_update before update on codevalanche_profiles for each row execute function reject_profile_update()");
 const failed=await handler(request('profile.update',{apiVersion:2,requestId:crypto.randomUUID(),bio:'Will fail'}));assert.equal(failed.status,503);assert.equal((await failed.text()).includes('private database detail'),false);
 const outcomes=(await f.db.query('select event_name,reason_code from wa_profile_outcomes')).rows;assert.equal(outcomes.filter(r=>r.event_name==='profile_update_failed')[0].reason_code,'persistence_unavailable');assert.equal(JSON.stringify(outcomes).includes('Private profile content'),false);
 }finally{await f.db.close();}
});
test('atomic A RPC rechecks P4 after trusted pre-read; report joins only exact actor/request/generation',async()=>{
 const f=await setup();try{
 const choice={siteId:'codevalanche',policyVersion:'2026-10-15',generation:2,purposes:{websiteAnalytics:false,accountAnalytics:true}};
 const r=await (await f.call('/consent/receipts',choice)).json(),rid=crypto.randomUUID();
 const e=validWebsiteEvent({event_id:crypto.randomUUID(),occurred_at:new Date().toISOString(),page_id:'account',event_name:'profile_save_submitted',properties:{operation_id:rid},consent_receipt_id:r.receiptId,consent_generation:r.generation});
 const body={receiptId:r.receiptId,generation:r.generation,collectionToken:r.collectionToken,events:[e]};
 assert.equal((await (await f.call('/events',body)).json()).acceptedIds.length,1);
 const {persistProfileWithOutcome}=await import('../functions/_shared/profileOutcome.ts');await persistProfileWithOutcome({principal:{userId},validatedChanges:{bio:'saved'},requestId:rid},f.service);
 await f.db.query("insert into codevalanche_admin_memberships(user_id,role,active) values($1,'owner',true)",[userId]);
 const {readAccountOutcomeReport}=await import('../functions/_shared/accountOutcomeReports.ts');
 const q=reportQuery({from:new Date(Date.now()-3600000).toISOString(),to:new Date(Date.now()+3600000).toISOString()});
 const report=await readAccountOutcomeReport({actorId:userId},q,f.service);assert.equal(report.breakdowns[0].rows.find(r=>r.concept==='profile_update_succeeded').attributedCount,1);
 const rpc=f.service.rpc;f.service.rpc=async(name,args)=>{if(name==='wa_ingest_website_batch')await f.db.query('update codevalanche_account_state set consent_generation=8 where user_id=$1',[userId]);return rpc(name,args)};
 assert.equal((await f.call('/events',{...body,events:[{...e,event_id:crypto.randomUUID()}]})).status,409);
 assert.equal((await f.db.query('select count(*)::int n from wa_events')).rows[0].n,1);
 const after=await readAccountOutcomeReport({actorId:userId},q,f.service);assert.equal(after.breakdowns[0].rows.find(r=>r.concept==='profile_update_succeeded').attributedCount,0);
 }finally{await f.db.close();}
});
test('committed profile with lost RPC reply reconciles durable UUID through producer and actual handler',async()=>{
 const f=await setup();try{
 const {persistProfileWithOutcome}=await import('../functions/_shared/profileOutcome.ts'),rpc=f.service.rpc;
 f.service.rpc=async(name,args)=>{const result=await rpc(name,args);if(name==='codevalanche_persist_profile_outcome'&&!result.error)return {data:null,error:{message:'fixture reply lost after commit'}};return result;};
 const rid=crypto.randomUUID(),save=()=>persistProfileWithOutcome({principal:{userId},requestId:rid,validatedChanges:{display_name:'Committed'}},f.service);
 assert.deepEqual(await save(),{ok:true});assert.deepEqual(await save(),{ok:true});
 const handler=await loadHandler(f.service),response=await handler(request('profile.update',{apiVersion:2,requestId:rid,displayName:'Do not replay'}));
 assert.equal(response.status,200);assert.equal((await response.json()).data.ok,true);
 assert.equal((await f.db.query('select display_name from codevalanche_profiles where user_id=$1',[userId])).rows[0].display_name,'Committed');
 assert.deepEqual((await f.db.query('select event_name from wa_profile_outcomes where user_id=$1 and request_id=$2',[userId,rid])).rows,[{event_name:'profile_update_succeeded'}]);
 }finally{await f.db.close();}
});
test('confirmed SQL rollback is superseded by successful UUID retry; concurrent late error cannot add false failure',async()=>{
 const f=await setup();try{
 const {persistProfileWithOutcome}=await import('../functions/_shared/profileOutcome.ts'),rid=crypto.randomUUID();
 const save=()=>persistProfileWithOutcome({principal:{userId},requestId:rid,validatedChanges:{bio:'Retry saved'}},f.service);
 await f.db.exec("create function fail_profile_once() returns trigger language plpgsql as $$ begin raise exception 'fixture rollback';end $$;create trigger fail_profile_once before update on codevalanche_profiles for each row execute function fail_profile_once()");
 await assert.rejects(save());
 assert.deepEqual((await f.db.query('select event_name,reason_code from wa_profile_outcomes where request_id=$1',[rid])).rows,[{event_name:'profile_update_failed',reason_code:'persistence_unavailable'}]);
 await f.db.exec('drop trigger fail_profile_once on codevalanche_profiles');await save();
 assert.deepEqual((await f.db.query('select event_name from wa_profile_outcomes where request_id=$1',[rid])).rows,[{event_name:'profile_update_succeeded'}]);
 const raceId=crypto.randomUUID(),rpc=f.service.rpc;let held=false,release,entered;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 f.service.rpc=async(name,args)=>{if(name==='codevalanche_persist_profile_outcome'&&!held){held=true;entered();await gate;return {data:null,error:{message:'fixture delayed unresolved reply'}};}return rpc(name,args);};
 const racing=()=>persistProfileWithOutcome({principal:{userId},requestId:raceId,validatedChanges:{bio:'Concurrent saved'}},f.service);
 const first=racing();await ready;const second=await racing();release();assert.deepEqual(await first,{ok:true});assert.deepEqual(second,{ok:true});
 assert.deepEqual((await f.db.query('select event_name from wa_profile_outcomes where request_id=$1',[raceId])).rows,[{event_name:'profile_update_succeeded'}]);
 }finally{await f.db.close();}
});
test('unresolved UUID or legacy reply loss stays unknown and never manufactures confirmed failure',async()=>{
 const f=await setup();try{
 const rpc=f.service.rpc;let commit=true;
 f.service.rpc=async(name,args)=>{
  if(name==='codevalanche_persist_profile_outcome'){if(commit)await rpc(name,args);return {data:null,error:{message:'fixture ambiguous transport failure'}};}
  if(name==='codevalanche_profile_resolution')return {data:null,error:{message:'fixture reconciliation unavailable'}};
  return rpc(name,args);
 };
 const handler=await loadHandler(f.service);
 for(const requestId of [crypto.randomUUID(),'legacy-request']){
  const response=await handler(request('profile.update',{apiVersion:2,requestId,displayName:'Committed despite reply loss'}));assert.equal(response.status,503);assert.equal((await response.json()).error.code,'account_service_unavailable');
 }
 commit=false;assert.equal((await handler(request('profile.update',{apiVersion:2,requestId:crypto.randomUUID(),bio:'Never reached database'}))).status,503);
 assert.equal((await f.db.query("select count(*)::int n from wa_profile_outcomes where event_name='profile_update_failed'")).rows[0].n,0);
 assert.equal((await f.db.query("select count(*)::int n from wa_profile_outcomes where event_name='profile_update_succeeded'")).rows[0].n,2);
 }finally{await f.db.close();}
});
test('resolution before a late database commit remains unknown without creating a false terminal failure',async()=>{
 const f=await setup();try{
 const {persistProfileWithOutcome}=await import('../functions/_shared/profileOutcome.ts'),rpc=f.service.rpc,rid=crypto.randomUUID();let release,pending;
 const gate=new Promise(r=>release=r);
 f.service.rpc=async(name,args)=>{
  if(name==='codevalanche_persist_profile_outcome'){pending=(async()=>{await gate;return rpc(name,args);})();return {data:null,error:{message:'fixture transport timed out before dispatch completion'}};}
  return rpc(name,args);
 };
 await assert.rejects(persistProfileWithOutcome({principal:{userId},requestId:rid,validatedChanges:{display_name:'Late commit'}},f.service),/account_service_unavailable/);
 assert.equal((await f.db.query('select count(*)::int n from wa_profile_outcomes where request_id=$1',[rid])).rows[0].n,0);
 release();assert.equal((await pending).error,null);
 assert.deepEqual((await f.db.query('select event_name from wa_profile_outcomes where request_id=$1',[rid])).rows,[{event_name:'profile_update_succeeded'}]);
 assert.equal((await f.db.query('select display_name from codevalanche_profiles where user_id=$1',[userId])).rows[0].display_name,'Late commit');
 for(const role of ['anon','authenticated']){await f.db.exec(`set role ${role}`);await assert.rejects(f.db.query('select * from codevalanche_profile_resolution($1,$2)',[userId,rid]),/permission denied/);await f.db.exec('reset role');}
 }finally{await f.db.close();}
});
