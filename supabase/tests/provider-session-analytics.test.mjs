import test from 'node:test';
import assert from 'node:assert/strict';
import {createSqlFixture} from './sqlHarness.mjs';
import {readAccountOutcomeReport} from '../functions/_shared/accountOutcomeReports.ts';
import {validateContractDto} from '../functions/_shared/websiteAnalyticsContract.ts';

test('prospective trusted password sessions deduplicate, exclude recovery and keep unsupported concepts unknown',async()=>{
 const db=await createSqlFixture();try{
 const actor=crypto.randomUUID(),user=crypto.randomUUID(),sid=crypto.randomUUID();
 await db.query('insert into auth.users(id) values($1),($2)',[actor,user]);
 await db.query("insert into codevalanche_admin_memberships(user_id,role,active) values($1,'accounts_admin',true)",[actor]);
 const read=async(from='2026-01-01T00:00:00Z',to='2027-01-01T00:00:00Z')=>(await db.query("select wa_read_account_outcomes($1,$2,$3,'UTC') v",[actor,from,to])).rows[0].v;
 let output=await read();
 assert.equal(output.rows.find(x=>x.concept==='login_succeeded').source,'provider_session_metadata');
 assert.equal(output.rows.find(x=>x.concept==='login_succeeded').count,null);
 // Test-only provider ownership/privileges model the hosted managed schema.
 await db.exec('grant usage on schema auth to supabase_auth_admin; alter table auth.sessions owner to supabase_auth_admin; alter table auth.mfa_amr_claims owner to supabase_auth_admin; grant select on auth.users to supabase_auth_admin');
 const insert=async(id,method='password',age='0 seconds',trusted=true)=>{
  await db.exec('begin');if(trusted)await db.exec('set local role supabase_auth_admin');
  await db.query('insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp()-$3::interval)',[id,user,age]);
  await db.query('insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,$2)',[id,method]);await db.exec('commit');
 };
 await insert(sid);await insert(crypto.randomUUID(),'recovery');await insert(crypto.randomUUID(),'oauth');await insert(crypto.randomUUID(),'password','1 day');await insert(crypto.randomUUID(),'password','0 seconds',false);
 assert.equal((await db.query('select count(*)::int n from wa_provider_session_receipts')).rows[0].n,1);
 // Duplicate provider notification and refresh/MFA updates cannot mint another login.
 await db.exec('begin;set local role supabase_auth_admin');await db.query("insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,'password'),($1,'totp')",[sid]);await db.query('update auth.sessions set updated_at=clock_timestamp() where id=$1',[sid]);await db.exec('commit');
 assert.equal((await db.query('select count(*)::int n from wa_provider_session_receipts')).rows[0].n,1);
 await db.exec('update wa_provider_session_source set qualified=true');
 assert.equal((await db.query('select wa_provider_session_source_qualified() q')).rows[0].q,true);
 // Even enabled legacy audit rows must not double count the selected producer.
 await db.exec("insert into codevalanche_provider_event_cursor(source,provider_audit_enabled) values('provider_audit',true)");
 output=await read();assert.equal(output.rows.find(x=>x.concept==='login_succeeded').count,1);assert.equal(output.rows.find(x=>x.concept==='login_succeeded').coverage,'partial');
 await db.exec('delete from codevalanche_provider_event_cursor');output=await read();
 for(const name of ['login_failed','password_valid','password_invalid','token_refreshed','mfa_completed','app_admitted'])assert.equal(output.rows.find(x=>x.concept===name).count,null,name);
 const before=(await db.query('select installed_at from wa_provider_session_source')).rows[0].installed_at;
 assert.equal((await read('2026-01-01T00:00:00Z',new Date(before).toISOString())).rows.find(x=>x.concept==='login_succeeded').count,null);
 const report=await readAccountOutcomeReport({actorId:actor},{siteId:'codevalanche',from:'2026-01-01T00:00:00Z',to:'2027-01-01T00:00:00Z',timeZone:'UTC',granularity:'day',filters:{}},{rpc:async()=>({data:output,error:null})});
 assert.equal(validateContractDto('AccountOutcomeReport',report),true);assert.equal(report.sourceQuality.providerCoverage.find(x=>x.concept==='login_succeeded').source,'provider_session_metadata');
 assert.match(report.capabilities.find(x=>x.metricId==='login_succeeded').method,/provider_session/);
 for(const role of ['anon','authenticated','service_role']){
  await db.exec(`set role ${role}`);await assert.rejects(()=>db.query('insert into wa_provider_session_receipts(session_id,user_id,occurred_at,primary_method) values($1,$2,now(),\'password\')',[crypto.randomUUID(),user]),/permission denied/);await db.exec('reset role');
 }
 await db.exec('alter table auth.sessions disable trigger wa_capture_provider_session');assert.equal((await db.query('select wa_provider_session_source_qualified() q')).rows[0].q,false);
 assert.equal((await read()).rows.find(x=>x.concept==='login_succeeded').count,null);await db.exec('alter table auth.sessions enable trigger wa_capture_provider_session');
 for(const drift of [
  "alter table auth.sessions enable always trigger wa_capture_provider_session",
  "alter function wa_capture_provider_session() security invoker",
  "alter function wa_capture_provider_session() set search_path=public",
  "alter table auth.mfa_amr_claims alter column created_at type timestamp",
  "grant set on parameter session_replication_role to supabase_auth_admin",
  "alter role supabase_auth_admin set session_replication_role='replica'",
  "drop trigger wa_capture_provider_session_amr on auth.mfa_amr_claims;create trigger wa_capture_provider_session_amr after insert on auth.mfa_amr_claims for each row execute function wa_capture_provider_session()",
 ]){await db.exec('begin');await db.exec(drift);assert.equal((await db.query('select wa_provider_session_source_qualified() q')).rows[0].q,false,drift);await db.exec('rollback');}
 await db.exec("create function fail_session_receipt() returns trigger language plpgsql as $$ begin raise exception 'test unavailable';end $$;create trigger fail_session_receipt before insert on wa_provider_session_receipts for each row execute function fail_session_receipt()");
 const stillWorks=crypto.randomUUID();await insert(stillWorks);assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[stillWorks])).rows[0].n,1);assert.equal((await db.query('select qualified from wa_provider_session_source')).rows[0].qualified,false);
 await db.exec('drop trigger fail_session_receipt on wa_provider_session_receipts');
 await db.query('delete from auth.sessions where id=$1',[sid]);assert.equal((await db.query('select count(*)::int n from wa_provider_session_receipts')).rows[0].n,1,'logout retains receipt');
 await db.query("update wa_provider_session_receipts set occurred_at=now()-interval '91 days'");await db.query('select wa_prune_website_analytics(now())');assert.equal((await db.query('select count(*)::int n from wa_provider_session_receipts')).rows[0].n,0);
 await insert(crypto.randomUUID());await db.query('delete from auth.users where id=$1',[user]);assert.equal((await db.query('select count(*)::int n from wa_provider_session_receipts')).rows[0].n,0,'erasure cascades');
 }finally{await db.close();}
});
