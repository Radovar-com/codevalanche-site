// Rehearsal of the legacy → modern account promotion on synthetic data.
// Production still runs the five-table schema of the first migration. This
// proves that applying every later migration, in order, onto that exact
// baseline with legacy rows present gives the same schema as a fresh modern
// database, keeps the legacy rows, and that a failing step changes nothing.
// PGlite only: not hosted Auth, not native concurrency, not a provider proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createSqlFixture} from './sqlHarness.mjs';

const root=new URL('../migrations/',import.meta.url);
const files=(await readdir(root)).filter(f=>f.endsWith('.sql')).sort();
const sources=Object.fromEntries(await Promise.all(files.map(async f=>[f,await readFile(new URL(f,root),'utf8')])));
const BASE='202609080001_account_service.sql';
const LEGACY_TABLES=['codevalanche_account_state','codevalanche_events','codevalanche_feedback','codevalanche_rate_limits','codevalanche_revoked_sessions'];
const u=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

async function fingerprint(db){
  const q=async sql=>(await db.query(sql)).rows.map(r=>JSON.stringify(r)).sort();
  return {
    columns:await q(`select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public'`),
    constraints:await q(`select conrelid::regclass::text as rel,conname,pg_get_constraintdef(oid) as def from pg_constraint where connamespace='public'::regnamespace`),
    indexes:await q(`select tablename,indexname,indexdef from pg_indexes where schemaname='public'`),
    policies:await q(`select tablename,policyname,cmd,roles::text,qual,with_check from pg_policies where schemaname='public'`),
    rls:await q(`select relname,relrowsecurity,relforcerowsecurity from pg_class where relnamespace='public'::regnamespace and relkind='r'`),
    functions:await q(`select p.proname,pg_get_function_identity_arguments(p.oid) as args,md5(p.prosrc) as body,p.prosecdef,p.proconfig::text as config,p.proacl::text as acl from pg_proc p where p.pronamespace='public'::regnamespace`),
    triggers:await q(`select tgrelid::regclass::text as rel,tgname,md5(pg_get_triggerdef(oid)) as def from pg_trigger where not tgisinternal`),
    grants:await q(`select table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema='public'`),
  };
}
async function baseline(){
  const db=await createSqlFixture({through:BASE});
  assert.deepEqual((await db.query(`select tablename from pg_tables where schemaname='public' order by 1`)).rows.map(r=>r.tablename),LEGACY_TABLES);
  // Legacy-shaped rows: a normal user with metadata, a blocked user, a pending deletion.
  await db.exec(`insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
    ('${u(1)}','one@example.test',now(),'{"display_name":"Ana","bio":"Legacy bio"}'),
    ('${u(2)}','two@example.test',now(),'{}'),('${u(3)}','three@example.test',now(),'{}');
    insert into auth.sessions(id,user_id) values ('${u(11)}','${u(1)}'),('${u(12)}','${u(1)}');
    insert into public.codevalanche_account_state(user_id,analytics_consent,blocked,deletion_requested_at,deletion_scheduled_for) values
    ('${u(1)}',true,false,null,null),('${u(2)}',false,true,null,null),('${u(3)}',false,false,now(),now()+interval '30 days');
    insert into public.codevalanche_revoked_sessions(session_id,user_id) values ('${u(12)}','${u(1)}');
    insert into public.codevalanche_feedback(user_id,category,message) values ('${u(1)}','idea','Keep this');
    insert into public.codevalanche_events(id,user_id,event_name,platform) values ('${u(21)}','${u(1)}','app_opened','windows');
    insert into public.codevalanche_rate_limits(bucket,hits) values ('account:${u(1)}',2);`);
  return db;
}
async function applyRest(db,mutate=sql=>sql){
  for(const file of files.filter(f=>f>BASE)) await db.exec(mutate(await readFile(new URL(file,root),'utf8'),file));
}

test('every later migration applies in order onto the legacy baseline with rows present', async()=>{
  const db=await baseline();
  try{
    const legacy=await fingerprint(db);
    await applyRest(db);
    const fresh=await createSqlFixture();
    try{
      const modern=await fingerprint(fresh);
      // The comparison is meaningful: the baseline really differs and the modern schema is rich.
      assert.notDeepEqual(legacy,modern);
      assert.ok(modern.functions.length>40&&modern.columns.length>200&&modern.triggers.length>5,JSON.stringify(Object.fromEntries(Object.entries(modern).map(([k,v])=>[k,v.length]))));
      assert.deepEqual(await fingerprint(db),await fingerprint(fresh),'bridged schema equals a fresh modern schema');
    } finally{ await fresh.close(); }
  } finally { await db.close(); }
});

test('legacy rows survive and map to the documented modern states', async()=>{
  const db=await baseline();
  try{
    await applyRest(db);
    const state=Object.fromEntries((await db.query(`select user_id,status,blocked,analytics_consent,deletion_scheduled_for is not null as pending from public.codevalanche_account_state`)).rows.map(r=>[r.user_id,r]));
    assert.equal(state[u(1)].status,'active');
    assert.equal(state[u(2)].status,'suspended'); assert.equal(state[u(2)].blocked,true);
    assert.equal(state[u(3)].status,'deletion_pending'); assert.equal(state[u(3)].pending,true,'the existing due date is kept');
    // Documented privacy semantics: an old boolean is not identified-activity consent.
    assert.equal(state[u(1)].analytics_consent,false);
    for(const [table,count] of [['codevalanche_revoked_sessions',1],['codevalanche_feedback',1],['codevalanche_events',1],['codevalanche_rate_limits',1]])
      assert.equal(Number((await db.query(`select count(*)::int as n from public.${table}`)).rows[0].n),count,table);
    // The service-only session list still hides the revoked session.
    assert.deepEqual((await db.query(`select id from public.codevalanche_sessions('${u(1)}')`)).rows.map(r=>r.id),[u(11)]);
    // No administrator is manufactured by the migration chain.
    const admins=await db.query(`select count(*)::int as n from information_schema.tables where table_schema='public' and table_name='codevalanche_admin_memberships'`);
    if(admins.rows[0].n) assert.equal(Number((await db.query(`select count(*)::int as n from public.codevalanche_admin_memberships`)).rows[0].n),0);
  } finally { await db.close(); }
});

test('a failing migration step leaves the schema and rows exactly as before it', async()=>{
  const db=await baseline();
  try{
    const before=await fingerprint(db);
    const rows=async()=>(await db.query(`select user_id,blocked,deletion_scheduled_for from public.codevalanche_account_state order by user_id`)).rows;
    const legacy=await rows();
    const first=files.find(f=>f>BASE);
    await assert.rejects(()=>db.exec((s=>s.replace(/commit;\s*$/i,'select 1/0;\ncommit;'))(sources[first])),/division by zero/);
    await db.exec('rollback');
    assert.deepEqual(await fingerprint(db),before);
    assert.deepEqual(await rows(),legacy);
    // A retry after the failure succeeds normally.
    await applyRest(db);
    assert.equal((await db.query(`select status from public.codevalanche_account_state where user_id='${u(2)}'`)).rows[0].status,'suspended');
  } finally { await db.close(); }
});
