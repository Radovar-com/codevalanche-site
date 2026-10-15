import test from 'node:test';
import assert from 'node:assert/strict';
import {createSqlFixture} from './sqlHarness.mjs';
import {readAccountOutcomeReport} from '../functions/_shared/accountOutcomeReports.ts';

test('native primary oauth session is prospective provider issuance, never delegated authorization-code activity',async()=>{
 const db=await createSqlFixture();try{
 const user=crypto.randomUUID(),actor=crypto.randomUUID();await db.query('insert into auth.users(id) values($1),($2)',[user,actor]);await db.query("insert into codevalanche_admin_memberships(user_id,role,active) values($1,'accounts_admin',true)",[actor]);
 await db.exec('grant usage on schema auth to supabase_auth_admin;alter table auth.sessions owner to supabase_auth_admin;alter table auth.mfa_amr_claims owner to supabase_auth_admin;grant select on auth.users to supabase_auth_admin');
 const signin=async(methods,{age='0 seconds',trusted=true}={})=>{const sid=crypto.randomUUID();await db.exec('begin');if(trusted)await db.exec('set local role supabase_auth_admin');await db.query('insert into auth.sessions(id,user_id,created_at) values($1,$2,clock_timestamp()-$3::interval)',[sid,user,age]);for(const method of methods)await db.query('insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,$2)',[sid,method]);await db.exec('commit');return sid;};
 const oauth=await signin(['oauth']);
 assert.deepEqual((await db.query('select primary_method from wa_provider_session_receipts where session_id=$1',[oauth])).rows,[{primary_method:'oauth'}]);
 const both=await signin(['oauth','password']);assert.equal((await db.query('select primary_method from wa_provider_session_receipts where session_id=$1',[both])).rows[0].primary_method,'password');
 for(const methods of [['oauth_provider'],['authorization_code'],['oauth_provider','authorization_code'],['recovery'],['otp'],['magiclink'],['invite'],['signup'],['totp'],['oauth','recovery'],['oauth','authorization_code'],['password','oauth_provider']]){
  const sid=await signin(methods);assert.equal((await db.query('select count(*)::int n from wa_provider_session_receipts where session_id=$1',[sid])).rows[0].n,0,methods.join(','));
 }
 await signin(['oauth'],{trusted:false});await signin(['oauth'],{age:'1 day'});
 // An old social session from the password-only era must not become new history.
 await db.exec("update wa_provider_session_source set installed_at=now()-interval '2 days'");const old=await signin(['oauth'],{age:'1 day'});assert.equal((await db.query('select count(*)::int n from wa_provider_session_receipts where session_id=$1',[old])).rows[0].n,0);
 await db.exec('begin;set local role supabase_auth_admin');await db.query("insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,'oauth'),($1,'totp')",[oauth]);await db.query('update auth.sessions set updated_at=clock_timestamp() where id=$1',[oauth]);await db.exec('commit');
 assert.equal((await db.query('select count(*)::int n from wa_provider_session_receipts')).rows[0].n,2,'repeated primary/MFA/refresh-like updates do not mint new logins');
 assert.equal((await db.query('select qualified from wa_provider_session_source')).rows[0].qualified,false);
 await db.exec('update wa_provider_session_source set qualified=true');assert.equal((await db.query('select wa_provider_session_source_qualified() q')).rows[0].q,true);
 for(const drift of [
  'alter table wa_provider_session_source drop column oauth_observed_from',
  'alter table wa_provider_session_source alter column oauth_observed_from type timestamp',
  'alter table wa_provider_session_source alter column oauth_observed_from drop default',
  "alter table wa_provider_session_source alter column oauth_observed_from set default '2020-01-01Z'::timestamptz",
  'alter table wa_provider_session_source alter column oauth_observed_from drop not null',
 ]){await db.exec('begin');await db.exec(drift);assert.equal((await db.query('select wa_provider_session_source_qualified() q')).rows[0].q,false,drift);await db.exec('rollback');}
 const from=new Date(Date.now()-86400000).toISOString(),to=new Date(Date.now()+60000).toISOString();const data=(await db.query("select wa_read_account_outcomes($1,$2,$3,'UTC') v",[actor,from,to])).rows[0].v;
 const dto=await readAccountOutcomeReport({actorId:actor},{siteId:'codevalanche',from,to,timeZone:'UTC',granularity:'day',filters:{}},{rpc:async()=>({data,error:null})});
 assert.equal(dto.metrics.find(x=>x.id==='login_succeeded').value,2);assert.equal(dto.metrics.find(x=>x.id==='mfa_completed').value,null);assert.equal(dto.metrics.find(x=>x.id==='app_admitted').value,null);assert.equal(dto.metrics.find(x=>x.id==='token_refreshed').value,null);assert.match(dto.capabilities.find(x=>x.metricId==='login_succeeded').reason,/social OAuth/);
 const socialStart=(await db.query('select oauth_observed_from from wa_provider_session_source')).rows[0].oauth_observed_from;assert.ok(dto.capabilities.find(x=>x.metricId==='login_succeeded').reason.includes(new Date(socialStart).toISOString()),'the exact social observation boundary reaches the strict public capability');
 // Social capture must keep008's optional-error containment and caller settings.
 await db.exec("set lock_timeout='987ms';create function cancel_social_capture() returns trigger language plpgsql as $$begin raise exception using errcode='57014',message='controlled_optional_capture_cancel';end $$;create trigger cancel_social_capture before insert on wa_provider_session_receipts for each row execute function cancel_social_capture()");
 const canceled=await signin(['oauth']);assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[canceled])).rows[0].n,1);assert.equal((await db.query('show lock_timeout')).rows[0].lock_timeout,'987ms');assert.equal((await db.query('select qualified from wa_provider_session_source')).rows[0].qualified,false);
 }finally{await db.close();}
});
