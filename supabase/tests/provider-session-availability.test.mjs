import test from 'node:test';
import assert from 'node:assert/strict';
import {createSqlFixture} from './sqlHarness.mjs';

test('optional capture cancellation and health cancellation cannot roll back provider session commit',async()=>{
 const db=await createSqlFixture();try{
 const user=crypto.randomUUID();await db.query('insert into auth.users(id) values($1)',[user]);
 await db.exec('grant usage on schema auth to supabase_auth_admin;alter table auth.sessions owner to supabase_auth_admin;alter table auth.mfa_amr_claims owner to supabase_auth_admin;grant select on auth.users to supabase_auth_admin');
 const signin=async()=>{const session=crypto.randomUUID();await db.exec('begin;set local role supabase_auth_admin');await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);await db.query("insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,'password')",[session]);await db.exec('commit');return session;};
 await db.exec("set lock_timeout='987ms';create function cancel_optional_capture() returns trigger language plpgsql as $$begin raise exception using errcode='57014',message='controlled_optional_capture_cancel';end $$;create trigger cancel_optional_capture before insert on wa_provider_session_receipts for each row execute function cancel_optional_capture()");
 const id=await signin();assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[id])).rows[0].n,1,'provider transaction must commit despite optional analytics cancellation');
 assert.equal((await db.query('show lock_timeout')).rows[0].lock_timeout,'987ms','provider lock setting restored');
 const state=(await db.query('select qualified,capture_errors from wa_provider_session_source')).rows[0];assert.equal(state.qualified,false);assert.ok(Number(state.capture_errors)>0);
 // Even cancellation of the best-effort failure marker must stay contained.
 await db.exec('create trigger cancel_optional_health before update on wa_provider_session_source for each row execute function cancel_optional_capture()');
 const second=await signin();assert.equal((await db.query('select count(*)::int n from auth.sessions where id=$1',[second])).rows[0].n,1);
 assert.equal((await db.query('show lock_timeout')).rows[0].lock_timeout,'987ms');
 await db.exec('drop trigger cancel_optional_health on wa_provider_session_source;drop trigger cancel_optional_capture on wa_provider_session_receipts;update wa_provider_session_source set capture_errors=0');await signin();await db.exec('update wa_provider_session_source set qualified=true');
 assert.equal((await db.query('select wa_provider_session_source_qualified() q')).rows[0].q,true);
 await db.exec('alter function wa_capture_provider_session() reset lock_timeout');assert.equal((await db.query('select wa_provider_session_source_qualified() q')).rows[0].q,false,'unbounded producer must not qualify');
 }finally{await db.close();}
});
