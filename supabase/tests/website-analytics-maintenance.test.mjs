import test from 'node:test';
import assert from 'node:assert/strict';
import {createSqlFixture} from './sqlHarness.mjs';

const run=async db=>(await db.query('select public.wa_run_website_analytics_maintenance() v')).rows[0].v;
const health=async db=>(await db.query('select * from public.wa_maintenance_state')).rows[0];
test('maintenance expires all raw sources while preserving supported aggregates and functional profile keys',async()=>{
 const db=await createSqlFixture();try{
  const exists=(await db.query("select to_regprocedure('public.wa_run_website_analytics_maintenance()') f")).rows[0].f;
  assert.ok(exists,'private maintenance orchestrator is installed');
  const user=crypto.randomUUID(),request=crypto.randomUUID(),receipt=crypto.randomUUID();
  await db.query('insert into auth.users(id) values($1)',[user]);
  await db.query("insert into codevalanche_profiles(user_id,display_name,bio) values($1,'Kept','Profile')",[user]);
  await db.query('insert into codevalanche_profile_requests values($1,$2)',[user,request]);
  await db.query("insert into wa_profile_outcomes(user_id,request_id,event_name,occurred_at) values($1,$2,'profile_update_succeeded',now()-interval '91 days')",[user,request]);
  await db.query("insert into wa_provider_session_receipts(session_id,user_id,occurred_at,primary_method) values($1,$2,now()-interval '91 days','password')",[crypto.randomUUID(),user]);
  await db.query("insert into wa_consent_receipts values($1,'codevalanche','2026-10-15',1,true,false,now()-interval '100 days',now()-interval '1 day',null,$2,$2)",[receipt,'a'.repeat(64)]);
  await db.query("insert into wa_events(site_id,event_id,event_name,occurred_at,event_at,received_at,page_id,page_instance_id,page_version,session_id,anonymous_id,consent_receipt_id,consent_generation,properties,traffic_class) values('codevalanche',gen_random_uuid(),'page_viewed',now()-interval '91 days',now()-interval '91 days',now()-interval '91 days','home',gen_random_uuid(),'fixture',gen_random_uuid(),gen_random_uuid(),$1,1,'{\"navigation_type\":\"initial\"}','external')",[receipt]);
  await db.query("select wa_record_download_request($1,'download_redirected','codevalanche','windows','x64','fixture','fixture',now()-interval '91 days')",[crypto.randomUUID()]);
  await db.query("select wa_import_release_asset_snapshot('codevalanche','fixture','fixture',7,now()-interval '14 months',null,false)");
  await db.exec("insert into wa_daily_rollups(site_id,population,day,time_zone,metric_id,dimensions,value,watermark) values('codevalanche','consented_website_observations',(now()-interval '14 months')::date,'UTC','page_views','{}',4,now()-interval '14 months')");
  await db.exec("insert into wa_download_daily values('codevalanche',(now()-interval '14 months')::date,'windows','x64','old_fixture','old_fixture','download_redirected',3,now()-interval '14 months')");
  await db.exec("insert into wa_rate_limits values('network',repeat('b',64),now(),1,1,now(),now()-interval '1 second'); insert into wa_data_health values('codevalanche',now()-interval '14 months','collector','accepted',1,now()-interval '14 months')");
  const result=await run(db);assert.equal(result.status,'succeeded');
  for(const table of ['wa_events','wa_consent_receipts','wa_profile_outcomes','wa_provider_session_receipts','wa_download_requests','wa_source_snapshots','wa_rate_limits','wa_data_health'])assert.equal((await db.query(`select count(*)::int n from ${table}`)).rows[0].n,0,table);
  assert.equal((await db.query('select count(*)::int n from codevalanche_profiles')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from codevalanche_profile_requests')).rows[0].n,1);
  assert.equal(Number((await db.query("select sum(value) n from wa_daily_rollups where metric_id='page_views' and time_zone='UTC'")).rows[0].n),1);
  assert.equal(Number((await db.query('select sum(count) n from wa_download_daily')).rows[0].n),1);
  assert.equal((await db.query("select count(*)::int n from wa_daily_rollups where dimensions::text ~ '(anonymous_id|session_id|user_id)' ")).rows[0].n,0,'archive contains no identifying raw dimensions');
  const before=await health(db);assert.equal(before.status,'succeeded');assert.ok(before.last_success_at);
  assert.equal((await run(db)).status,'succeeded');assert.equal(Number((await db.query('select sum(count) n from wa_download_daily')).rows[0].n),1,'no double archive');
  await db.query("insert into wa_profile_outcomes(user_id,event_name,occurred_at) values($1,'profile_update_succeeded',now()-interval '91 days')",[user]);
  await db.exec('begin');await run(db);assert.equal((await db.query('select count(*)::int n from wa_profile_outcomes')).rows[0].n,0);await db.exec('rollback');
  assert.equal((await db.query('select count(*)::int n from wa_profile_outcomes')).rows[0].n,1,'rollback restores the deleted aged fixture');
 }finally{await db.close();}
});
test('maintenance failures roll back cleanup and never advance successful health; browser roles cannot execute or inspect',async()=>{
 const db=await createSqlFixture();try{
  assert.ok((await db.query("select to_regprocedure('public.wa_run_website_analytics_maintenance()') f")).rows[0].f,'private maintenance orchestrator is installed');
  await run(db);const previous=await health(db);
  await db.exec("create function maintenance_failure() returns trigger language plpgsql as $$begin raise exception 'private-content-must-not-be-stored' using errcode='P1234';end$$; create trigger maintenance_failure before delete on wa_download_requests for each row execute function maintenance_failure()");
  await db.query("select wa_record_download_request($1,'download_redirected','codevalanche','windows','x64','fixture','fixture',now()-interval '91 days')",[crypto.randomUUID()]);
  await db.exec("insert into wa_rate_limits values('network',repeat('c',64),now(),1,1,now(),now()-interval '1 second')");
  const result=await run(db);assert.equal(result.status,'failed');assert.equal(result.errorCode,'P1234');assert.equal(JSON.stringify(result).includes('private-content'),false);
  const failed=await health(db);assert.equal(failed.status,'failed');assert.deepEqual(failed.last_success_at,previous.last_success_at);assert.equal(failed.error_code,'P1234');assert.equal((await db.query('select count(*)::int n from wa_download_requests')).rows[0].n,1);
  assert.equal((await db.query('select count(*)::int n from wa_rate_limits')).rows[0].n,1,'earlier W cleanup is rolled back when later D cleanup fails');
  await db.exec('drop trigger maintenance_failure on wa_download_requests');
  await db.exec("create function maintenance_canceled() returns trigger language plpgsql as $$begin raise exception 'canceled' using errcode='57014';end$$; create trigger maintenance_canceled before delete on wa_download_requests for each row execute function maintenance_canceled()");
  await assert.rejects(()=>run(db),/canceled/);assert.deepEqual((await health(db)).last_success_at,previous.last_success_at,'query cancellation escapes without a false success');
  await db.exec('drop trigger maintenance_canceled on wa_download_requests');
  for(const role of ['anon','authenticated']){await db.exec(`set role ${role}`);await assert.rejects(()=>run(db),/permission denied/);await assert.rejects(()=>health(db),/permission denied/);await assert.rejects(()=>db.query('select wa_configure_website_analytics_maintenance(true)'),/permission denied/);await db.exec('reset role');}
  await db.exec('set role service_role');assert.equal((await run(db)).status,'succeeded');await assert.rejects(()=>db.query('select wa_configure_website_analytics_maintenance(true)'),/permission denied/);await db.exec('reset role');
 }finally{await db.close();}
});

// Test-only adapter permits exercising our scheduler management against local SQL.
// It does not claim pg_cron installation, execution or hosted compatibility.
async function cronAdapter(db){await db.exec(`create schema cron;
 set cron.timezone='UTC';
 create table cron.job(jobid bigint generated always as identity primary key,jobname text,schedule text,command text,database text default current_database(),username text default current_user,active boolean default true,nodename text default 'localhost',nodeport integer default current_setting('port')::integer);
 create function cron.schedule(text,text,text) returns bigint language plpgsql as $$declare v_id bigint;begin insert into cron.job(jobname,schedule,command) values($1,$2,$3) returning jobid into v_id;return v_id;end$$;
 create function cron.alter_job(bigint,schedule text default null,command text default null,database text default null,username text default null,active boolean default null) returns void language sql as $$update cron.job set schedule=coalesce($2,job.schedule),command=coalesce($3,job.command),database=coalesce($4,job.database),username=coalesce($5,job.username),active=coalesce($6,job.active) where jobid=$1$$;
 create function cron.unschedule(bigint) returns boolean language plpgsql as $$begin delete from cron.job where jobid=$1;return found;end$$;`);}
test('scheduler is opt-in, private, idempotent and refuses to overwrite conflicting jobs',async()=>{
 const db=await createSqlFixture();try{
  assert.ok((await db.query("select to_regprocedure('public.wa_configure_website_analytics_maintenance(boolean)') f")).rows[0].f,'private scheduler management is installed');
  assert.equal((await db.query("select to_regnamespace('cron') n")).rows[0].n,null,'migration creates no extension or schedule');
  await assert.rejects(()=>db.query('select wa_configure_website_analytics_maintenance(true)'),/maintenance_cron_unavailable/);
  await cronAdapter(db);await db.exec("insert into cron.job(jobname,schedule,command) values('unrelated','0 0 * * *','select 1')");
  const configure=async(...args)=>(await db.query(`select wa_configure_website_analytics_maintenance(${args.length?'$1':''}) v`,args)).rows[0].v;
  let result=await configure();assert.equal(result.active,false);assert.equal((await db.query('select count(*)::int n from cron.job')).rows[0].n,1,'default inactive does not register a job');
  await db.exec("set cron.timezone='Europe/Bucharest'");await assert.rejects(()=>configure(true),/maintenance_cron_timezone_unqualified/);await db.exec("set cron.timezone='UTC'");
  result=await configure(true);assert.equal(result.active,true);const id=result.jobId;
  assert.equal((await configure(true)).jobId,id);assert.equal((await db.query('select count(*)::int n from cron.job')).rows[0].n,2);
  let job=(await db.query('select * from cron.job where jobid=$1',[id])).rows[0];assert.equal(job.schedule,'17 2 * * *');assert.match(job.command,/statement_timeout/);assert.match(job.command,/lock_timeout/);assert.match(job.command,/wa_run_website_analytics_maintenance\(\)/);
  await db.query("update cron.job set command='select 42' where jobid=$1",[id]);await assert.rejects(()=>configure(true),/maintenance_job_conflict/);await assert.rejects(()=>configure(false),/maintenance_job_conflict/);
  await db.query('update cron.job set command=$1,username=$2 where jobid=$3',[job.command,'foreign_role',id]);await assert.rejects(()=>configure(false),/maintenance_job_conflict/);
  await db.query('update cron.job set username=current_user where jobid=$1',[id]);
  await db.query("update cron.job set nodename='external.example' where jobid=$1",[id]);await assert.rejects(()=>configure(true),/maintenance_job_conflict/);await db.query("update cron.job set nodename='localhost' where jobid=$1",[id]);
  await db.query('insert into cron.job(jobname,schedule,command) values($1,$2,$3)',[job.jobname,job.schedule,job.command]);await assert.rejects(()=>configure(true),/maintenance_job_conflict/);
  await db.query('delete from cron.job where jobid<>$1 and jobname=$2',[id,job.jobname]);assert.equal((await configure(false)).active,false);assert.equal((await configure(false)).active,false);assert.equal((await db.query('select jobname from cron.job')).rows[0].jobname,'unrelated');
 }finally{await db.close();}
});
