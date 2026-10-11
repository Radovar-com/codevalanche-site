import test from 'node:test';
import assert from 'node:assert/strict';
import {createSqlFixture} from './sqlHarness.mjs';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',sa='33333333-3333-4333-8333-333333333333',fresh='44444444-4444-4444-8444-444444444444';
async function fixture(){
 const db=await createSqlFixture();
 await db.query('insert into auth.users(id) values($1),($2)',[a,b]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sa,a]);
 const job=(await db.query('select * from public.codevalanche_request_erasure($1,$1,$2)',[a,crypto.randomUUID()])).rows[0];
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[fresh,a]);
 const policy=(await db.query('select policy_version from public.codevalanche_account_state where user_id=$1',[a])).rows[0].policy_version;
 const read=async(user=a,sid=fresh,version=policy)=>db.transaction(async tx=>{await tx.exec('set local role service_role');return(await tx.query('select * from public.codevalanche_self_erasure_status($1,$2,$3)',[user,sid,version])).rows;});
 return {db,job,policy,read};
}
test('self status is bound to exact current Auth session policy and linked job, not a caller job ID',async()=>{
 const f=await fixture();try{
  const [row]=await f.read();assert.equal(row.job_id,f.job.job_id);assert.equal(row.phase,'queued');assert.equal(row.can_cancel,true);
  assert.deepEqual(await f.read(a,sa),[],'erasure revoked the original session');
  assert.deepEqual(await f.read(b,fresh),[],'another user cannot reuse this session');
  assert.deepEqual(await f.read(a,fresh,f.policy+1),[],'policy must be current');
  assert.deepEqual(Object.keys(row).sort(),['can_cancel','due_at','job_id','phase','state']);
 }finally{await f.db.close();}
});
test('purge progress closes cancellation, while retrying a started purge never reopens it',async()=>{
 const f=await fixture();try{
  await f.db.query("update public.codevalanche_account_erasure_jobs set state='purging',purge_started_at=now() where job_id=$1",[f.job.job_id]);
  let[row]=await f.read();assert.equal(row.phase,'purging');assert.equal(row.can_cancel,false);
  await f.db.query("update public.codevalanche_account_erasure_jobs set state='failed' where job_id=$1",[f.job.job_id]);
  [row]=await f.read();assert.equal(row.phase,'failed');assert.equal(row.can_cancel,false);
  await f.db.query("update public.codevalanche_account_erasure_jobs set state='queued' where job_id=$1",[f.job.job_id]);
  [row]=await f.read();assert.equal(row.can_cancel,false,'purge-start latch wins a queued retry state');
 }finally{await f.db.close();}
});
test('cancelled and missing bindings do not become a pending self-deletion view',async()=>{
 const f=await fixture();try{
  await f.db.query('select * from public.codevalanche_cancel_erasure($1)',[a]);assert.deepEqual(await f.read(),[]);
  assert.equal((await f.db.query('select count(*) from public.codevalanche_account_erasure_jobs')).rows[0].count,1);
 }finally{await f.db.close();}
});
test('ordinary browser and worker roles cannot invoke the privileged self status reader',async()=>{
 const f=await fixture();try{
  for(const role of ['anon','authenticated','codevalanche_native_ledger_ingest_worker'])await assert.rejects(f.db.transaction(async tx=>{await tx.exec(`set local role ${role}`);await tx.query('select * from public.codevalanche_self_erasure_status($1,$2,$3)',[a,fresh,f.policy]);}),/permission denied/);
 }finally{await f.db.close();}
});
