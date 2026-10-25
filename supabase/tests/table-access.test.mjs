import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAccessFixture as createSqlFixture} from './tableAccessFixture.mjs';
import {tableAccess,tableAccessViolations} from './tableAccessContract.mjs';

const accessMigration = '202610250001_explicit_table_access.sql';
for (const legacyTableGrants of [false,true]) {
  test(`all public tables have reviewed explicit grants and RLS (legacy defaults: ${legacyTableGrants})`,async () => {
    const db = await createSqlFixture({legacyTableGrants});
    try { assert.deepEqual(await tableAccessViolations(db),[]); } finally { await db.close(); }
  });
}

test('guardian detects disabled RLS on every table and missing, excessive, inherited, column and unknown access',async () => {
  const db = await createSqlFixture();
  try {
    for (const name of Object.keys(tableAccess)) {
      await db.exec(`begin;alter table public.${name} disable row level security`);
      try { assert.ok((await tableAccessViolations(db)).includes(`${name}: RLS disabled`)); }
      finally { await db.exec('rollback'); }
    }
    const faults = [
      ['revoke select on codevalanche_account_state from service_role','missing explicit service_role SELECT'],
      ['grant select on wa_events to anon','explicit anon SELECT'],
      ['grant update on codevalanche_download_counts to authenticated','explicit authenticated UPDATE'],
      ['grant select on wa_events to public','explicit PUBLIC SELECT'],
      ['grant select(event_id) on wa_events to authenticated','unreviewed column grants'],
      ['grant select on wa_events to codevalanche_notification_worker;grant codevalanche_notification_worker to authenticated','effective authenticated SELECT=true'],
      ['grant select on wa_events to service_role with grant option','WITH GRANT OPTION'],
      ['revoke select on wa_events from service_role;grant select on wa_events to codevalanche_retention_worker;grant codevalanche_retention_worker to service_role','missing explicit service_role SELECT'],
      ['create table public.unreviewed_table(id integer)','unreviewed public table'],
      ['create policy accidental_read on wa_events for select to authenticated using(true)','unreviewed RLS policies'],
    ];
    for (const [sql,message] of faults) {
      await db.exec(`begin;${sql}`);
      try { assert.ok((await tableAccessViolations(db)).some(e => e.includes(message)),message); }
      finally { await db.exec('rollback'); }
    }
  } finally { await db.close(); }
});

test('access migration is idempotent and repairs legacy defaults without changing RPC grants or unrelated tables',async () => {
  const db = await createSqlFixture({legacyTableGrants:true,through:'202610210001_download_page_counts.sql'});
  try {
    await db.exec('create table public.unrelated_extension_table(id int);insert into public.unrelated_extension_table values(1)');
    const snapshot = async () => (await db.query(`select c.relname,c.relacl::text,c.relrowsecurity from pg_class c
      join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname`)).rows;
    const rpc = async () => (await db.query(`select p.oid,p.proacl::text,pg_get_functiondef(p.oid) definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' order by p.oid`)).rows;
    await db.exec("select public.codevalanche_count_download('download_started','windows-x64','ro')");
    const data=(await db.query('select * from codevalanche_download_counts')).rows;
    const functions = await rpc();
    const unrelated=(await snapshot()).find(t=>t.relname==='unrelated_extension_table');
    const sql = await readFile(new URL(`../migrations/${accessMigration}`,import.meta.url),'utf8');
    await db.exec(sql);
    assert.deepEqual(await rpc(),functions,'initial repair preserves every RPC body and ACL');
    const before=await snapshot();
    assert.deepEqual(before.find(t=>t.relname==='unrelated_extension_table'),unrelated);
    await db.exec(sql);await db.exec(sql);
    assert.deepEqual(await snapshot(),before);
    assert.deepEqual(await rpc(),functions);
    assert.deepEqual((await db.query('select * from codevalanche_download_counts')).rows,data);
    assert.equal((await db.query('select id from unrelated_extension_table')).rows[0].id,1);
  } finally { await db.close(); }
});

test('access repair rolls back all ACL and RLS changes if a later statement fails',async () => {
  const db=await createSqlFixture({legacyTableGrants:true,through:'202610210001_download_page_counts.sql'});
  try {
    await db.exec('alter table public.wa_events disable row level security');
    const snapshot=async()=>(await db.query(`select relname,relacl::text,relrowsecurity from pg_class
      where relnamespace='public'::regnamespace and relkind='r' order by relname`)).rows;
    const before=await snapshot();
    const sql=await readFile(new URL(`../migrations/${accessMigration}`,import.meta.url),'utf8');
    const broken=sql.replace('grant select on table public.codevalanche_account_erasure_jobs','grant select on table public.missing_fixture_table');
    await assert.rejects(()=>db.exec(broken),/missing_fixture_table/);
    await db.exec('rollback');
    assert.deepEqual(await snapshot(),before);
    await db.exec(sql);
    assert.deepEqual(await tableAccessViolations(db),[]);
  } finally { await db.close(); }
});
