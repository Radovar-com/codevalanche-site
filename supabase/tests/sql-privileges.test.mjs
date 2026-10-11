import test from 'node:test';import assert from 'node:assert/strict';
import {createSqlFixture} from './sqlHarness.mjs';
test('additive migrations execute on PostgreSQL with synthetic Auth schema and restricted privileges',async()=>{const db=await createSqlFixture();try {
 for(const role of ['anon','authenticated']) {
  await db.exec(`set role ${role}`);
  await assert.rejects(()=>db.query('select * from public.codevalanche_account_state'),/permission denied/);
  await assert.rejects(()=>db.query("select * from public.codevalanche_sessions('11111111-1111-4111-8111-111111111111')"),/permission denied/);
  await assert.rejects(()=>db.query("select * from public.codevalanche_admin_directory('',null,51)"),/permission denied/);
  await assert.rejects(()=>db.query("select * from public.codevalanche_credential_evidence('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222')"),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec('set role service_role');assert.equal((await db.query("select * from public.codevalanche_admin_directory('',null,51)")).rows.length,0);
 await assert.rejects(()=>db.query("insert into public.codevalanche_admin_memberships(user_id,role) values('11111111-1111-4111-8111-111111111111','owner')"),/permission denied/);
 await db.exec('reset role');
 const uid='11111111-1111-4111-8111-111111111111';await db.query('insert into auth.users(id) values($1)',[uid]);await db.query('insert into public.codevalanche_account_state(user_id) values($1)',[uid]);
 await db.exec('grant select on public.codevalanche_account_state to authenticated;set role authenticated');
 assert.equal((await db.query('select current_user as actor,(select rolsuper from pg_roles where rolname=current_user) as superuser')).rows[0].actor,'authenticated');assert.equal((await db.query('select rolsuper from pg_roles where rolname=current_user')).rows[0].rolsuper,false);
 assert.equal((await db.query('select count(*)::int n from public.codevalanche_account_state')).rows[0].n,0,'RLS must deny rows even when table SELECT is temporarily granted');await db.exec('reset role;revoke select on public.codevalanche_account_state from authenticated;set role service_role');assert.equal((await db.query('select count(*)::int n from public.codevalanche_account_state')).rows[0].n,1);await db.exec('reset role');
}finally{await db.close()}});
test('direct provider password and factor changes bump policy without lifting suspension',async()=>{const db=await createSqlFixture();try {
 const uid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
 await db.query('insert into auth.users(id,encrypted_password) values($1,$2)',[uid,'synthetic-before']);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,uid]);
 await db.query("insert into public.codevalanche_account_state(user_id,status,blocked) values($1,'suspended',true)",[uid]);
 await db.query('update auth.users set encrypted_password=$1 where id=$2',['synthetic-after',uid]);
 let row=(await db.query('select status,policy_version from public.codevalanche_account_state where user_id=$1',[uid])).rows[0];assert.equal(row.status,'suspended');assert.equal(row.policy_version,2);
 assert.equal((await db.query('select * from public.codevalanche_sessions($1)',[uid])).rows.length,0);
 await db.query("insert into auth.mfa_factors(id,user_id,status,factor_type) values(gen_random_uuid(),$1,'verified','totp')",[uid]);
 row=(await db.query('select policy_version from public.codevalanche_account_state where user_id=$1',[uid])).rows[0];assert.equal(row.policy_version,3);
 assert.equal((await db.query('select count(*)::int n from public.codevalanche_credential_events')).rows[0].n,2);
}finally{await db.close()}});
