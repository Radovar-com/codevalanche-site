import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {createSqlFixture} from './sqlHarness.mjs';

const BEFORE_FIX={through:'202610180001_mfa_recovery_attempts.sql'};
const migrationUrl=new URL('../migrations/202610190001_account_safety_fixes.sql',import.meta.url);
const proposalUrl=new URL('../../ops/proposals/20261018-modern-account-safety.sql',import.meta.url);
const proofUrl=new URL('../../ops/security-followup-modern-recovery-20261018.json',import.meta.url);
const sha=value=>createHash('sha256').update(value).digest('hex');
const normalized=value=>value.replaceAll('\r\n','\n').trimEnd()+'\n';
const signature=async db=>(await db.query("select p.proname,p.proowner::text,p.proacl::text,p.prosecdef,p.proconfig,md5(p.prosrc) as body_hash from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('codevalanche_revoke_all_sessions','codevalanche_mfa_recovery_replace') order by p.proname")).rows;

test('counter original RED and inert proposal GREEN report only committed Auth effects',async()=>{
 const db=await createSqlFixture(BEFORE_FIX);
 try{
  const user=randomUUID(),session=randomUUID();
  await db.exec('create table auth.refresh_tokens(id bigint primary key,user_id text);create role followup_limited_owner nologin bypassrls;');
  await db.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[user]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[session,user]);
  await db.query('insert into auth.refresh_tokens(id,user_id) values(1,$1)',[user]);
  await db.exec(`grant usage on schema public,auth to followup_limited_owner;grant select on auth.sessions,auth.refresh_tokens to followup_limited_owner;grant delete on auth.refresh_tokens to followup_limited_owner;grant select,insert on public.codevalanche_revoked_sessions to followup_limited_owner;alter function public.codevalanche_revoke_all_sessions(uuid) owner to followup_limited_owner;`);
  const before=await signature(db);
  await db.exec('begin');
  const original=(await db.query('select public.codevalanche_revoke_all_sessions($1) result',[user])).rows[0].result;
  assert.equal(original.auth_revoked,false);
  assert.equal(original.refresh_tokens_deleted,1,'Original variable survives its inner transaction rollback');
  assert.throws(()=>assert.equal(original.refresh_tokens_deleted,0),{code:'ERR_ASSERTION'},'Original fails the required committed-effect counter');
  await db.exec('rollback');
  await db.exec(await readFile(proposalUrl,'utf8'));
  const after=await signature(db);
  assert.deepEqual(after.map(({body_hash,...meta})=>meta),before.map(({body_hash,...meta})=>meta),'Owners, ACLs, security definer and search paths remain unchanged');
  const fixed=(await db.query('select public.codevalanche_revoke_all_sessions($1) result',[user])).rows[0].result;
  const actual=(await db.query('select (select count(*)::int from auth.refresh_tokens) tokens,(select count(*)::int from auth.sessions) sessions,(select count(*)::int from public.codevalanche_revoked_sessions) denylist')).rows[0];
  assert.equal(fixed.auth_revoked,false);
  assert.equal(fixed.refresh_tokens_deleted,0);
  assert.equal(fixed.auth_sessions_deleted,0);
  assert.equal(fixed.app_revoked,1);
  assert.deepEqual(actual,{tokens:1,sessions:1,denylist:1});
 }finally{await db.close();}
});

test('serialized replacement proposal takes a common transaction user lock before DELETE',async()=>{
 const sql=await readFile(proposalUrl,'utf8');
 const statement=sql.match(/create or replace function public\.codevalanche_mfa_recovery_replace\([\s\S]*?\n\$\$;/i)?.[0];
 assert.ok(statement,'Explicit replacement function is present');
 assert.match(statement,/pg_catalog\.pg_advisory_xact_lock\(pg_catalog\.hashtextextended\(/);
 assert.match(statement,/'codevalanche:mfa-recovery-replace:'\s*\|\|\s*p_user_id::text/);
 assert(statement.indexOf('pg_advisory_xact_lock')<statement.indexOf('delete from public.codevalanche_mfa_recovery_codes'));
 assert.doesNotMatch(statement,/pg_advisory_lock\(/,'The lock is scoped to its transaction, not a pooled session');
 const db=await createSqlFixture(BEFORE_FIX);
 try{
  await db.exec(sql);
  const user=randomUUID();await db.query('insert into auth.users(id) values($1)',[user]);
  await assert.rejects(db.query('select public.codevalanche_mfa_recovery_replace($1,$2)',[user,['bad-hash']]),/invalid_recovery_codes/);
  const a=Array.from({length:10},(_,i)=>sha('synthetic-a-'+i));
  const b=Array.from({length:10},(_,i)=>sha('synthetic-b-'+i));
  assert.equal((await db.query('select public.codevalanche_mfa_recovery_replace($1,$2) count',[user,a])).rows[0].count,10);
  assert.equal((await db.query('select public.codevalanche_mfa_recovery_replace($1,$2) count',[user,b])).rows[0].count,10);
  assert.equal((await db.query('select count(*)::int count from public.codevalanche_mfa_recovery_codes where user_id=$1',[user])).rows[0].count,10);
 }finally{await db.close();}
});

test('inert proposal refuses a missing modern foundation before creating an RPC',async()=>{
 const db=await PGlite.create();
 try{
  await assert.rejects(db.exec(await readFile(proposalUrl,'utf8')),/modern_account_foundation_required/);
  await db.exec('rollback');
  assert.equal((await db.query("select to_regprocedure('public.codevalanche_revoke_all_sessions(uuid)') is null missing")).rows[0].missing,true);
 }finally{await db.close();}
});

test('both function changes roll back atomically when the proposal transaction fails',async()=>{
 const db=await createSqlFixture(BEFORE_FIX);
 try{
  const before=await signature(db),sql=await readFile(proposalUrl,'utf8');
  assert.match(sql,/commit;\s*$/i);
  await assert.rejects(db.exec(sql.replace(/commit;\s*$/i,'select 1/0;\ncommit;')),error=>error.code==='22012');
  await db.exec('rollback');
  assert.deepEqual(await signature(db),before,'Rollback restores both original bodies and security metadata');
 }finally{await db.close();}
});

test('sanitized native two-connection RED GREEN evidence pins this exact inert proposal',async()=>{
 const sql=await readFile(proposalUrl,'utf8'),proof=JSON.parse(await readFile(proofUrl,'utf8'));
 assert.equal(proof.proposal.sha256,sha(normalized(sql)));
 const statement=sql.match(/create or replace function public\.codevalanche_mfa_recovery_replace\([\s\S]*?\n\$\$;/i)?.[0];
 assert.equal(proof.proposal.recoveryReplaceStatementSha256,sha(normalized(statement)));
 assert.equal(proof.native.independentWorkerConnections,2);
 assert.equal(proof.native.red.finalCodeCount,20);
 assert.equal(proof.native.green.finalCodeCount,10);
 assert.equal(proof.native.green.secondCallBlockedBeforeDelete,true);
 assert.equal(proof.native.ownerAclAndSecurityAttributesPreserved,true);
 assert.equal(proof.native.newLocalServerStopped,true);
 assert.equal(proof.providerDeploymentPerformed,false);
 assert.equal(proof.promotionReady,false);
 assert.doesNotMatch(JSON.stringify(proof),/C:[\\/]|AppData|backendPids|serverPid|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
});

test('the promoted migration carries the exact proposal body, and the full chain ends with the fix installed',async()=>{
 const body=sql=>normalized(sql).slice(normalized(sql).indexOf('begin;'));
 assert.equal(body(await readFile(migrationUrl,'utf8')),body(await readFile(proposalUrl,'utf8')));
 const [fixed,proposed]=[await createSqlFixture(),await createSqlFixture(BEFORE_FIX)];
 try{
  await proposed.exec(await readFile(proposalUrl,'utf8'));
  // Line endings follow the checkout (CRLF on Windows), so bodies are compared without CR.
  const lf=async db=>(await db.query("select p.proname,p.proacl::text,p.prosecdef,p.proconfig,md5(replace(p.prosrc,chr(13),'')) as body from pg_catalog.pg_proc p where p.pronamespace='public'::regnamespace order by 1,2")).rows;
  // Later migrations may add unrelated functions; the ones the fix defines must stay exactly as proposed.
  const expected=await lf(proposed),names=new Set(expected.map(row=>row.proname));
  assert.deepEqual((await lf(fixed)).filter(row=>names.has(row.proname)),expected);
 }finally{await fixed.close();await proposed.close();}
});
