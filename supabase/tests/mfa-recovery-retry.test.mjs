import test from 'node:test';
import assert from 'node:assert/strict';
import {createSqlFixture} from './sqlHarness.mjs';
import {loadHandler,request,userId,sessionId} from './handlerHarness.mjs';
import {hashRecoveryCode,normalizeRecoveryCode} from '../functions/codevalanche-account/mfa.mjs';

const factorId='55555555-5555-4555-8555-555555555555';
const secondFactor='66666666-6666-4666-8666-666666666666';
const code='00000-00000';
async function recoveryFixture(factorIds=[factorId]) {
 const db=await createSqlFixture();
 await db.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[userId]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
 await db.query("insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,'password')",[sessionId]);
 for(const id of factorIds)await db.query("insert into auth.mfa_factors(id,user_id,status,factor_type) values($1,$2,'verified','totp')",[id,userId]);
 const hashes=await Promise.all(Array.from({length:10},(_,i)=>hashRecoveryCode(userId,`000000000${i}`)));
 await db.query('select public.codevalanche_mfa_recovery_replace($1,$2)',[userId,hashes]);
 const f={db,hashes,deleted:[],fault:null,completeFails:0,omitEmpty:false};
 const providerUser=async()=>({id:userId,email:'synthetic@example.test',email_confirmed_at:'2026-10-18',identities:[],user_metadata:{},factors:(await db.query('select id,status,factor_type from auth.mfa_factors where user_id=$1 order by id',[userId])).rows});
 const scalar=new Set(['codevalanche_rate_limit','codevalanche_mfa_recovery_consume','codevalanche_mfa_recovery_clear','codevalanche_mfa_recovery_complete']);
 const service={auth:{getUser:async()=>({data:{user:await providerUser()},error:null}),admin:{
  getUserById:async id=>{const user=id===userId?await providerUser():null;if(f.omitEmpty&&user&&!user.factors.length)delete user.factors;return {data:{user},error:null}},
  mfa:{deleteFactor:async({id,userId:owner})=>{
   assert.equal(owner,userId);
   const fault=f.fault?.(id);if(fault==='before')return {error:{status:503}};
   await db.query('delete from auth.mfa_factors where id=$1 and user_id=$2',[id,owner]);f.deleted.push(id);
   if(fault==='throw-after')throw new Error('synthetic transport disconnected');
   return fault==='after'?{error:{status:503}}:{data:{id},error:null};
  }},
 }},rpc:async(name,args={})=>{
  if(name==='codevalanche_mfa_recovery_complete'&&f.completeFails-->0)return {data:null,error:new Error('synthetic lost database availability')};
  try{const keys=Object.keys(args);const rows=(await db.query(`select * from public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')})`,keys.map(k=>args[k]))).rows;
   return {data:scalar.has(name)?Object.values(rows[0]??{})[0]:rows,error:null};
  }catch(error){return {data:null,error}};
 },from:table=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:(await db.query('select * from public.codevalanche_account_state where user_id=$1',[userId])).rows[0],error:null}),insert:async()=>({error:null})})};
 f.handler=await loadHandler(service);f.redeem=()=>f.handler(request('mfa-recovery-redeem',{code}));
 f.saved=async()=> (await db.query('select * from public.codevalanche_mfa_recovery_codes where user_id=$1 and code_hash=$2',[userId,hashes[0]])).rows[0];
 return f;
}

test('provider failure leaves recovery proof retryable until the original factors are removed',async()=>{
 const f=await recoveryFixture();try{
  f.fault=()=> 'before';assert.equal((await f.redeem()).status,503);
  assert.equal((await f.saved()).used_at,null,'failure before provider effect must not consume the proof');
  f.fault=null;assert.equal((await f.redeem()).status,200);
  assert.deepEqual(f.deleted,[factorId]);assert.ok((await f.saved()).used_at);
  assert.equal((await f.db.query('select count(*)::int n from public.codevalanche_mfa_recovery_codes where user_id=$1 and used_at is null',[userId])).rows[0].n,0);
 }finally{await f.db.close()}
});

test('partial provider success and lost reply reconcile without re-deleting absent factors',async()=>{
 const f=await recoveryFixture([factorId,secondFactor]);try{
  f.fault=id=>id===factorId?'after':'before';assert.equal((await f.redeem()).status,503);
  assert.deepEqual(f.deleted,[factorId]);
  f.fault=null;assert.equal((await f.redeem()).status,200);
  assert.deepEqual(f.deleted,[factorId,secondFactor]);
 }finally{await f.db.close()}
});

test('the provider may omit the factors property when no factors remain',async()=>{
 const f=await recoveryFixture();try{
  f.omitEmpty=true;assert.equal((await f.redeem()).status,200);assert.ok((await f.saved()).used_at);
 }finally{await f.db.close()}
});

test('a thrown transport failure after deletion resumes without another deletion',async()=>{
 const f=await recoveryFixture();try{
  f.fault=()=> 'throw-after';assert.equal((await f.redeem()).status,503);
  f.fault=null;assert.equal((await f.redeem()).status,200);assert.deepEqual(f.deleted,[factorId]);
 }finally{await f.db.close()}
});

test('recreating the same factor ID invalidates the old attempt',async()=>{
 const f=await recoveryFixture();try{
  f.fault=()=> 'before';assert.equal((await f.redeem()).status,503);
  await f.db.query('delete from auth.mfa_factors where id=$1',[factorId]);
  await f.db.query("insert into auth.mfa_factors(id,user_id,status,factor_type) values($1,$2,'verified','totp')",[factorId,userId]);
  f.fault=null;assert.equal((await f.redeem()).status,400);assert.deepEqual(f.deleted,[]);
 }finally{await f.db.close()}
});

test('a code from another account and SQL completion with live factors cannot authorize recovery',async()=>{
 const f=await recoveryFixture();try{
  const other='44444444-4444-4444-8444-444444444444';
  const wrong=(await f.db.query('select * from public.codevalanche_mfa_recovery_prepare($1,$2)',[other,f.hashes[0]])).rows;
  assert.deepEqual(wrong,[]);
  await f.db.query('select * from public.codevalanche_mfa_recovery_prepare($1,$2)',[userId,f.hashes[0]]);
  assert.equal((await f.db.query('select public.codevalanche_mfa_recovery_complete($1,$2) ok',[userId,f.hashes[0]])).rows[0].ok,false);
  assert.equal((await f.saved()).used_at,null);
 }finally{await f.db.close()}
});

test('lost completion database access retries even after every provider factor is absent',async()=>{
 const f=await recoveryFixture();try{
  f.completeFails=1;assert.equal((await f.redeem()).status,503);
  assert.equal((await f.saved()).used_at,null);
  assert.equal((await f.redeem()).status,200);assert.deepEqual(f.deleted,[factorId]);
  const replay=await f.redeem();assert.equal(replay.status,200,'terminal retry only acknowledges the completed result');
  assert.deepEqual(f.deleted,[factorId],'completed proof cannot authorize another provider operation');
 }finally{await f.db.close()}
});

test('new enrollment invalidates a pending recovery snapshot instead of expanding its authority',async()=>{
 const f=await recoveryFixture();try{
  f.fault=()=> 'before';assert.equal((await f.redeem()).status,503);
  await f.db.query("insert into auth.mfa_factors(id,user_id,status,factor_type) values($1,$2,'verified','totp')",[secondFactor,userId]);
  f.fault=null;assert.equal((await f.redeem()).status,400);assert.deepEqual(f.deleted,[]);
 }finally{await f.db.close()}
});

test('completed recovery proof cannot disable a subsequently enrolled authenticator',async()=>{
 const f=await recoveryFixture();try{
  assert.equal((await f.redeem()).status,200);
  await f.db.query("insert into auth.mfa_factors(id,user_id,status,factor_type) values($1,$2,'verified','totp')",[secondFactor,userId]);
  assert.equal((await f.redeem()).status,400);assert.deepEqual(f.deleted,[factorId]);
 }finally{await f.db.close()}
});

test('regenerating recovery codes invalidates any pending old-code operation',async()=>{
 const f=await recoveryFixture();try{
  f.fault=()=> 'before';assert.equal((await f.redeem()).status,503);
  const hashes=await Promise.all(Array.from({length:10},(_,i)=>hashRecoveryCode(userId,normalizeRecoveryCode(`10000-0000${i}`))));
  await f.db.query('select public.codevalanche_mfa_recovery_replace($1,$2)',[userId,hashes]);
  f.fault=null;assert.equal((await f.redeem()).status,400);assert.deepEqual(f.deleted,[]);
 }finally{await f.db.close()}
});

test('expired recovery attempts cannot restart with old authority',async()=>{
 const f=await recoveryFixture();try{
  f.fault=()=> 'before';assert.equal((await f.redeem()).status,503);
  await f.db.query("update public.codevalanche_mfa_recovery_codes set recovery_started_at=now()-interval '16 minutes' where user_id=$1 and code_hash=$2",[userId,f.hashes[0]]);
  assert.equal((await f.db.query('select public.codevalanche_mfa_recovery_remaining($1) n',[userId])).rows[0].n,9,'expired reserved proof is not a usable remaining code');
  f.fault=null;assert.equal((await f.redeem()).status,400);assert.deepEqual(f.deleted,[]);
 }finally{await f.db.close()}
});

test('recovery attempt storage and its authority functions are unavailable to browser database roles',async()=>{
 const f=await recoveryFixture();try{
  for(const role of ['anon','authenticated']){
   await f.db.exec(`set role ${role}`);
   await assert.rejects(()=>f.db.query('select recovery_factor_ids from public.codevalanche_mfa_recovery_codes'),/permission denied/);
   await assert.rejects(()=>f.db.query('select * from public.codevalanche_mfa_recovery_prepare($1,$2)',[userId,f.hashes[0]]),/permission denied/);
   await assert.rejects(()=>f.db.query('select public.codevalanche_mfa_recovery_complete($1,$2)',[userId,f.hashes[0]]),/permission denied/);
   await f.db.exec('reset role');
  }
 }finally{await f.db.close()}
});
