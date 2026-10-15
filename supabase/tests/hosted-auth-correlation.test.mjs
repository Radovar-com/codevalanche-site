import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {reconcileOperation,requestAccountOperation} from '../functions/_shared/accountLifecycle.ts';

// Model hosted ownership before 022, without making the migration user an Auth owner.
async function fixture(mode='hosted') {
 const db=await PGlite.create();
 try {
  await db.exec(`create role fixture_migrator superuser;set role fixture_migrator;
   create role anon;create role authenticated;create role service_role bypassrls;create role supabase_auth_admin;create role authenticator nologin;
   create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,created_at timestamptz default now(),last_sign_in_at timestamptz,raw_user_meta_data jsonb default '{}',encrypted_password text,banned_until timestamptz,raw_app_meta_data jsonb default '{}');
   create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,created_at timestamptz default now(),updated_at timestamptz default now(),user_agent text,not_after timestamptz);
   create table auth.mfa_factors(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,status text,factor_type text,secret text);
   create table auth.mfa_amr_claims(session_id uuid references auth.sessions(id) on delete cascade,authentication_method text,created_at timestamptz default now(),updated_at timestamptz default now());`);
  const root=new URL('../migrations/',import.meta.url);
  for(const file of (await readdir(root)).filter(f=>f.endsWith('.sql')&&f<='202610110022_auth_operation_correlation.sql').sort()) {
   if(file==='202610110022_auth_operation_correlation.sql'&&mode!=='owner') {
    // Recovery authority exists only in this synthetic fixture, never in deployment SQL.
    await db.exec(`reset role;
     grant usage,create on schema public to fixture_migrator;
     grant usage on schema auth to fixture_migrator,supabase_auth_admin;grant all on auth.users to fixture_migrator;
     ${mode==='unknown'?'create role unknown_auth_owner;alter table auth.users owner to unknown_auth_owner;':'alter table auth.users owner to supabase_auth_admin;'}
     grant all on auth.users to fixture_migrator;
     alter role fixture_migrator nosuperuser;set role fixture_migrator;`);
   }
   await db.exec(await readFile(new URL(file,root),'utf8'));
  }
  await db.exec(await readFile(new URL('202610150006_auth_correlation_trigger_qualification.sql',root),'utf8'));
  return db;
 }catch(error){await db.exec('rollback');await db.close();throw error;}
}
async function qualified(db){return (await db.query('select public.codevalanche_auth_correlation_qualified() as qualified')).rows[0].qualified;}
async function mutateAsFixtureSuper(db,sql){await db.exec('reset role');try{await db.exec(sql);}finally{await db.exec('set role fixture_migrator');}}

test('managed Auth owner permits 022 installation as ordinary migration role, qualification stays explicitly gated',async()=>{
 const db=await fixture();try{
  assert.deepEqual((await db.query("select tgenabled from pg_trigger where tgrelid='auth.users'::regclass and tgname like 'codevalanche_auth_operation_%' order by tgname")).rows.map(r=>r.tgenabled),['O','O']);
  assert.equal((await db.query("select pg_get_userbyid(relowner) as owner from pg_class where oid='auth.users'::regclass")).rows[0].owner,'supabase_auth_admin');
  assert.equal(await qualified(db),false);
  await db.exec('update public.codevalanche_auth_correlation_config set qualified=true');
  assert.equal(await qualified(db),true);
 }finally{await db.close();}
});

test('owner installation preserves ALWAYS triggers and explicit qualification gate',async()=>{
 const db=await fixture('owner');try{
  assert.deepEqual((await db.query("select tgenabled from pg_trigger where tgrelid='auth.users'::regclass and tgname like 'codevalanche_auth_operation_%' order by tgname")).rows.map(r=>r.tgenabled),['A','A']);
  assert.equal(await qualified(db),false);
  await db.exec('update public.codevalanche_auth_correlation_config set qualified=true');
  assert.equal(await qualified(db),true);
  await db.exec('create or replace trigger codevalanche_auth_operation_guard before update of email on auth.users for each row execute function public.codevalanche_auth_operation_guard();alter table auth.users enable always trigger codevalanche_auth_operation_guard;');
  assert.equal(await qualified(db),false,'column-specific ALWAYS trigger must not qualify');
  await db.exec('create or replace trigger codevalanche_auth_operation_guard before update on auth.users for each row execute function public.codevalanche_auth_operation_guard();alter table auth.users enable always trigger codevalanche_auth_operation_guard;');
  assert.equal(await qualified(db),true);
 }finally{await db.close();}
});

test('unrecognized non-owned Auth table fails installation closed',async()=>{
 await assert.rejects(()=>fixture('unknown'),/auth_correlation_unsupported_owner/);
});

test('hosted qualification rejects dangerous role privileges, defaults, trigger states and identities',async()=>{
 const db=await fixture();try{
  await db.exec('update public.codevalanche_auth_correlation_config set qualified=true');
  assert.equal(await qualified(db),true);
  const cases=[
   ["grant set on parameter session_replication_role to supabase_auth_admin","revoke set on parameter session_replication_role from supabase_auth_admin"],
   ["grant set on parameter session_replication_role to service_role","revoke set on parameter session_replication_role from service_role"],
   ["grant authenticated to supabase_auth_admin","revoke authenticated from supabase_auth_admin"],
   ["create role unsafe_replica_role;grant set on parameter session_replication_role to unsafe_replica_role;grant unsafe_replica_role to service_role with inherit false","revoke unsafe_replica_role from service_role;revoke set on parameter session_replication_role from unsafe_replica_role;drop role unsafe_replica_role"],
   ["alter role supabase_auth_admin set session_replication_role='replica'","alter role supabase_auth_admin reset session_replication_role"],
   ["alter database postgres set session_replication_role='replica'","alter database postgres reset session_replication_role"],
   ["alter table auth.users disable trigger codevalanche_auth_operation_guard","alter table auth.users enable trigger codevalanche_auth_operation_guard"],
   ["alter table auth.users enable replica trigger codevalanche_auth_operation_commit","alter table auth.users enable trigger codevalanche_auth_operation_commit"],
   ["alter role authenticator rename to hidden_authenticator","alter role hidden_authenticator rename to authenticator"],
   ["create or replace trigger codevalanche_auth_operation_guard before update on auth.users for each row execute function public.codevalanche_auth_operation_commit()","create or replace trigger codevalanche_auth_operation_guard before update on auth.users for each row execute function public.codevalanche_auth_operation_guard()"],
   ["create or replace trigger codevalanche_auth_operation_guard before update on auth.users for each row when (false) execute function public.codevalanche_auth_operation_guard()","create or replace trigger codevalanche_auth_operation_guard before update on auth.users for each row execute function public.codevalanche_auth_operation_guard()"],
   ["create or replace trigger codevalanche_auth_operation_guard before update of email on auth.users for each row execute function public.codevalanche_auth_operation_guard()","create or replace trigger codevalanche_auth_operation_guard before update on auth.users for each row execute function public.codevalanche_auth_operation_guard()"],
  ];
  for(const [breakIt,restore] of cases){
   await mutateAsFixtureSuper(db,breakIt);
   assert.equal(await qualified(db),false,breakIt);
   await mutateAsFixtureSuper(db,restore);
   assert.equal(await qualified(db),true,restore);
  }
  await mutateAsFixtureSuper(db,"set session_replication_role='replica'");
  assert.equal(await qualified(db),false);
  await mutateAsFixtureSuper(db,"set session_replication_role='origin'");
  assert.equal(await qualified(db),true);
 }finally{await db.close();}
});

test('hosted ordinary triggers commit the exact receipt and reject fenced provider writes without changing Auth',async()=>{
 const db=await fixture();try{
  const actor='11111111-1111-4111-8111-111111111111',userId='22222222-2222-4222-8222-222222222222';
  await db.query('insert into auth.users(id) values($1),($2)',[actor,userId]);
  await db.query("insert into public.codevalanche_admin_memberships(user_id,role) values($1,'owner')",[actor]);
  await db.exec('update public.codevalanche_auth_correlation_config set qualified=true');
  const rpc=async(name,args={})=>{
   try{return {data:(await db.query(`select * from public.${name}(${Object.keys(args).map((k,i)=>`${k}=>$${i+1}`).join(',')})`,Object.values(args))).rows,error:null};}
   catch(error){return {data:null,error};}
  };
  const commit=async(id,patch)=>{
   await db.exec('reset role;set role supabase_auth_admin;begin');
   try{
    await db.query('update auth.users set raw_app_meta_data=raw_app_meta_data||$1::jsonb where id=$2',[patch.app_metadata,id]);
    await db.query('update auth.users set banned_until=$1 where id=$2',[new Date(Date.now()+600000).toISOString(),id]);
    await db.exec('commit');
   }catch(error){await db.exec('rollback');throw error;}
   finally{await db.exec('reset role;set role fixture_migrator');}
   return {data:{user:{id}},error:null};
  };
  const service={authCorrelationQualified:true,rpc,auth:{admin:{updateUserById:commit}}};
  const op=await requestAccountOperation({actorId:actor,userId,operationId:crypto.randomUUID(),action:'admin.account.suspend',reasonCode:'test',reason:'Synthetic hosted mode',until:new Date(Date.now()+600000).toISOString()},service);
  const staleLease=crypto.randomUUID();
  await db.query('select * from public.codevalanche_claim_operation($1,$2)',[op.operationId,staleLease]);
  const stale=(await db.query('select * from public.codevalanche_prepare_correlated_operation($1,$2)',[op.operationId,staleLease])).rows[0];
  await db.exec("update public.codevalanche_operation_jobs set lease_until=now()-interval '1 second'");
  assert.equal((await reconcileOperation(op.operationId,service)).state,'completed');
  assert.deepEqual((await db.query('select state from public.codevalanche_auth_operation_attempts order by created_at')).rows.map(r=>r.state),['fenced','committed']);
  const before=(await db.query('select banned_until,raw_app_meta_data from auth.users where id=$1',[userId])).rows[0];
  assert.equal(before.raw_app_meta_data.codevalanche_operation_v1,undefined);
  await assert.rejects(()=>commit(userId,{app_metadata:{codevalanche_operation_v1:stale.binding}}),/operation_conflict/);
  assert.deepEqual((await db.query('select banned_until,raw_app_meta_data from auth.users where id=$1',[userId])).rows[0],before);
 }finally{await db.close();}
});
