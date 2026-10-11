import test from 'node:test';
import assert from 'node:assert/strict';
import {createSqlFixture} from './sqlHarness.mjs';
import {loadHandler,request,validClaims,userId,sessionId} from './handlerHarness.mjs';

const target='33333333-3333-4333-8333-333333333333';
const operationId='44444444-4444-4444-8444-444444444444';
const claims=()=>({...validClaims(),aal:'aal2',amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)-2},{method:'totp',timestamp:Math.floor(Date.now()/1000)-1}]});
async function fixture(role='owner') {
  const db=await createSqlFixture();
  await db.query('insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now())',[userId,target]);
  await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
  await db.query("insert into auth.mfa_factors(id,user_id,status,factor_type) values(gen_random_uuid(),$1,'verified','totp')",[userId]);
  await db.query("update public.codevalanche_account_state set credential_changed_at=now()-interval '1 day' where user_id=$1",[userId]);
  await db.query("insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,'password')",[sessionId]);
  if(role) await db.query('insert into public.codevalanche_admin_memberships(user_id,role) values($1,$2)',[userId,role]);
  const notificationId=(await db.query("select id from public.codevalanche_notification_outbox where user_id=$1 and event_type='signup_created'",[target])).rows[0].id;
  const user={id:userId,email:'synthetic@example.test',email_confirmed_at:'2026-10-11',user_metadata:{},app_metadata:{},identities:[]};
  const service={
    auth:{getUser:async()=>({data:{user},error:null})},
    rpc:async(name,args={})=>{try {const keys=Object.keys(args);return {data:(await db.query(`select * from public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')})`,keys.map(k=>args[k]))).rows,error:null}}catch(error){return {data:null,error}}},
    from:table=>({columns:'*',filters:[],select(cols){this.columns=cols;return this},eq(key,value){this.filters.push([key,value]);return this},async maybeSingle(){try{return {data:(await db.query(`select ${this.columns} from public.${table} where ${this.filters.map(([key],i)=>`${key}=$${i+1}`).join(' and ')} limit 1`,this.filters.map(([,value])=>value))).rows[0]||null,error:null}}catch(error){return {data:null,error}}},insert:async()=>({data:null,error:null})}),
  };
  return {db,service,notificationId,handler:await loadHandler(service)};
}
const body=notificationId=>({apiVersion:2,requestId:'ack-correlated',notificationId,operationId});
async function acknowledge(f,fields=body(f.notificationId),identity=claims()) {return f.handler(request('admin.notifications.ack',fields,identity));}

test('actual owner inbox acknowledgement is durable and audited, without claiming email delivered',async()=>{
  const f=await fixture();try {
    const before=(await f.db.query('select state,attempts,receipt_id,lease_id from public.codevalanche_notification_outbox where id=$1',[f.notificationId])).rows[0];
    const reply=await acknowledge(f),data=await reply.json();assert.equal(reply.status,200);assert.equal(data.requestId,'ack-correlated');assert.equal(data.data.operationId,operationId);assert.equal(data.data.notificationId,f.notificationId);assert.equal(data.data.state,'completed');assert.equal(data.data.inboxState,'acknowledged');
    const after=(await f.db.query('select state,attempts,receipt_id,lease_id,inbox_state from public.codevalanche_notification_outbox where id=$1',[f.notificationId])).rows[0];assert.equal(after.inbox_state,'acknowledged');const {inbox_state,...delivery}=after;assert.deepEqual(delivery,before);
    const audit=(await f.db.query("select actor_id,user_id,outcome from public.codevalanche_admin_audit where operation_id=$1 and action='admin.notifications.ack'",[operationId])).rows;assert.deepEqual(audit,[{actor_id:userId,user_id:target,outcome:'completed'}]);
    const page=await f.handler(request('admin.notifications.list',{apiVersion:2,requestId:'after-ack',userId:target},claims()));assert.equal((await page.json()).data.items.find(n=>n.id===f.notificationId).inbox_state,'acknowledged');
  }finally {await f.db.close();}
});
test('lost acknowledgement replay is idempotent while changing notification conflicts',async()=>{
  const f=await fixture();try {assert.equal((await acknowledge(f)).status,200);assert.equal((await acknowledge(f)).status,200);assert.equal((await f.db.query('select count(*)::int n from public.codevalanche_admin_audit where operation_id=$1',[operationId])).rows[0].n,1);const second=(await f.db.query("select id from public.codevalanche_notification_outbox where user_id=$1 and event_type='signup_verified'",[target])).rows[0].id;assert.equal((await acknowledge(f,body(second))).status,409);assert.equal((await f.db.query('select inbox_state from public.codevalanche_notification_outbox where id=$1',[second])).rows[0].inbox_state,'available');}finally {await f.db.close();}
});
test('readonly and ordinary actors cannot acknowledge alerts or forge mutation flags',async()=>{
  for(const role of ['support_readonly',null]) {const f=await fixture(role);try {assert.equal((await acknowledge(f,{...body(f.notificationId),mutation:false,actorId:userId})).status,403);assert.equal((await f.db.query('select inbox_state from public.codevalanche_notification_outbox where id=$1',[f.notificationId])).rows[0].inbox_state,'available');}finally {await f.db.close();}}
});
test('acknowledgement keeps existing recent MFA requirement and rejects caller identity overrides',async()=>{
  const f=await fixture('accounts_admin');try {const old={...claims(),amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)-400},{method:'totp',timestamp:Math.floor(Date.now()/1000)-301}]};assert.equal((await acknowledge(f,body(f.notificationId),old)).status,401);assert.equal((await acknowledge(f,{...body(f.notificationId),actorId:target})).status,400);assert.equal((await acknowledge(f,{...body(f.notificationId),userId:target})).status,400);assert.equal((await acknowledge(f)).status,200);}finally {await f.db.close();}
});
test('current SQL authority refuses withdrawal between API assurance and the write',async()=>{
  for(const change of ["update public.codevalanche_admin_memberships set active=false where user_id=$1","delete from auth.mfa_factors where user_id=$1","insert into public.codevalanche_revoked_sessions(session_id,user_id) values('22222222-2222-4222-8222-222222222222',$1)"]) {
    const f=await fixture();try {const rpc=f.service.rpc;f.service.rpc=async(name,args)=>{if(name==='codevalanche_acknowledge_notification')await f.db.query(change,[userId]);return rpc(name,args)};const reply=await acknowledge(f);assert.equal(reply.status,403);assert.equal((await f.db.query('select inbox_state from public.codevalanche_notification_outbox where id=$1',[f.notificationId])).rows[0].inbox_state,'available');assert.equal((await f.db.query('select count(*)::int n from public.codevalanche_operation_jobs where operation_id=$1',[operationId])).rows[0].n,0);}finally {await f.db.close();}
  }
});
test('actual database customer/notification worker roles cannot call the acknowledgement RPC',async()=>{
  const f=await fixture();try {for(const role of ['anon','authenticated','codevalanche_notification_worker']) {await f.db.exec(`set role ${role}`);await assert.rejects(()=>f.db.query('select * from public.codevalanche_acknowledge_notification($1,$2,$3,$4,$5)',[userId,sessionId,new Date(Date.now()-1000).toISOString(),f.notificationId,operationId]),/permission denied/);await f.db.exec('reset role');}}finally {await f.db.close();}
});
test('notification and operation identifiers must be JSON string primitives before any acknowledgement RPC',async()=>{
  const f=await fixture();try {let writes=0;const rpc=f.service.rpc;f.service.rpc=async(name,args)=>{if(name==='codevalanche_acknowledge_notification')writes++;return rpc(name,args)};for(const field of ['notificationId','operationId']) {const fields=body(f.notificationId);fields[field]=[fields[field]];assert.equal((await acknowledge(f,fields)).status,400);}assert.equal(writes,0);}finally {await f.db.close();}
});
