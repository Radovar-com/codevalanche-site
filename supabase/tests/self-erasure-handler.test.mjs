import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {SignJWT,jwtVerify} from 'jose';
import {createSqlFixture} from './sqlHarness.mjs';
import {issuer,loadHandler} from './handlerHarness.mjs';
const uid='11111111-1111-4111-8111-111111111111',oldSid='33333333-3333-4333-8333-333333333333',sid='44444444-4444-4444-8444-444444444444';
async function fixture(){
 const db=await createSqlFixture(),key=randomBytes(32);
 await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[uid,'own-fixture@example.invalid']);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[oldSid,uid]);
 const job=(await db.query('select * from public.codevalanche_request_erasure($1,$1,$2)',[uid,crypto.randomUUID()])).rows[0];
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sid,uid]);
 await db.query("insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,'password')",[sid]);
 let before=null;
 const service={auth:{getUser:async token=>{try{const {payload}=await jwtVerify(token,key,{issuer,audience:'authenticated',algorithms:['HS256']});const row=(await db.query('select * from auth.users where id=$1',[payload.sub])).rows[0];return{data:{user:row?{...row,user_metadata:{},identities:[]}:null},error:null};}catch{return{data:{user:null},error:{status:401}};}}},
  rpc:async(name,args={})=>{try{if(name==='codevalanche_self_erasure_status'&&before)await before();const keys=Object.keys(args);const rows=(await db.query(`select * from public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')})`,keys.map(k=>args[k]))).rows;return{data:name==='codevalanche_rate_limit'?rows[0].codevalanche_rate_limit:rows,error:null};}catch(error){return{data:null,error};}},
  from:table=>({select(){return this;},eq(_key,id){this.id=id;return this;},async maybeSingle(){return{data:(await db.query(`select * from public.${table} where user_id=$1`,[this.id])).rows[0]??null,error:null};}})};
 const handler=await loadHandler(service);
 async function call(session=sid){const token=await new SignJWT({sub:uid,session_id:session,role:'authenticated',aal:'aal1',amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)}]}).setProtectedHeader({alg:'HS256'}).setIssuer(issuer).setAudience('authenticated').setIssuedAt().setExpirationTime('1h').sign(key);return handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({apiVersion:2,action:'account.overview',requestId:'self-status-test'})}));}
 return{db,job,call,setBefore(fn){before=fn;}};
}
test('actual signed-token handler publishes only own queued/purge status and closes cancellation at persisted start',async()=>{
 const f=await fixture();try{
  let response=await f.call();assert.equal(response.status,200);let body=await response.json();assert.equal(body.requestId,'self-status-test');assert.equal(body.data.deletion.jobId,f.job.job_id);assert.equal(body.data.deletion.phase,'queued');assert.equal(body.data.deletion.canCancel,true);
  await f.db.query("update public.codevalanche_account_erasure_jobs set state='purging',purge_started_at=now() where job_id=$1",[f.job.job_id]);
  response=await f.call();assert.equal(response.status,200);body=await response.json();assert.equal(body.data.deletion.phase,'purging');assert.equal(body.data.deletion.canCancel,false);assert.equal(JSON.stringify(body).includes('remote_authorization_id'),false);
  assert.equal((await f.call(oldSid)).status,401);
 }finally{await f.db.close();}
});
test('policy changing between authenticated overview and phase read refuses stale pending details',async()=>{
 const f=await fixture();try{
  f.setBefore(async()=>{f.setBefore(null);await f.db.query('update public.codevalanche_account_state set policy_version=policy_version+1 where user_id=$1',[uid]);});
  const response=await f.call();assert.equal(response.status,503);const body=await response.json();assert.equal(body.ok,false);assert.equal(body.data,undefined);
 }finally{await f.db.close();}
});
