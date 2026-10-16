// Two-step verification (TOTP + recovery codes), the administrator read journal
// and cutting the sessions of a suspended user, through the real handler source
// (handlerHarness) with the Supabase service boundary faked; the administrator
// cases run on the real migrations in PGlite (sqlHarness). Nothing reaches a real project.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as mfa from '../functions/codevalanche-account/mfa.mjs';
import {fixture,loadHandler,request,validClaims,userId,sessionId} from './handlerHarness.mjs';
import {createSqlFixture} from './sqlHarness.mjs';

const targetId='44444444-4444-4444-8444-444444444444', factorId='55555555-5555-4555-8555-555555555555';
const verifiedFactor={id:factorId,factor_type:'totp',status:'verified',friendly_name:'Phone',created_at:'2026-10-16T00:00:00Z'};
const seconds=()=>Math.floor(Date.now()/1000);
const aal2=()=>({...validClaims(),aal:'aal2',amr:[{method:'password',timestamp:seconds()-2},{method:'totp',timestamp:seconds()-1}]});
const source=await readFile(new URL('../functions/codevalanche-account/index.ts',import.meta.url),'utf8');

// A signed-in user; the recovery-code RPCs keep their codes in memory.
async function userFixture({env={}}={}) {
 const f=fixture(); f.user.factors=[]; f.calls=[]; f.recovery=new Map();
 const base=f.db.rpc;
 f.db.rpc=async(name,args)=>{
  f.calls.push(['rpc',name,args]);
  if(name==='codevalanche_mfa_recovery_replace'){f.recovery=new Map(args.p_code_hashes.map(h=>[h,false]));return {data:args.p_code_hashes.length,error:null}}
  if(name==='codevalanche_mfa_recovery_consume'){const ok=f.recovery.get(args.p_code_hash)===false;if(ok)f.recovery.set(args.p_code_hash,true);return {data:ok,error:null}}
  if(name==='codevalanche_mfa_recovery_remaining')return {data:[...f.recovery.values()].filter(v=>!v).length,error:null};
  if(name==='codevalanche_mfa_recovery_clear'){const n=f.recovery.size;f.recovery.clear();return {data:n,error:null}}
  return base(name,args);
 };
 f.db.auth.admin.mfa={deleteFactor:async({id,userId:owner})=>{f.calls.push(['deleteFactor',id,owner]);return {data:{id},error:null}}};
 f.handler=await loadHandler(f.db,{env});
 return f;
}

test('a user with a verified authenticator is refused at aal1 and answered at aal2',async()=>{
 const f=await userFixture(); f.user.factors=[verifiedFactor];
 const refused=await f.handler(request('get-account'));
 assert.equal(refused.status,401); assert.deepEqual(await refused.json(),{error:'MFA required',mfaRequired:true});
 const v2=await f.handler(request('account.overview',{apiVersion:2,requestId:'overview-aal1'}));
 assert.equal(v2.status,401); assert.equal((await v2.json()).error.code,'mfa_required','the v2 envelope names the refusal');
 const ok=await f.handler(request('get-account',{},aal2())); const body=await ok.json();
 assert.equal(ok.status,200); assert.equal(body.mfa.enabled,true); assert.deepEqual(body.mfa.factors.map(x=>x.id),[factorId]);
});

test('users without an authenticator are unchanged at aal1 (installed clients keep working)',async()=>{
 const f=await userFixture(); const r=await f.handler(request('get-account')); const body=await r.json();
 assert.equal(r.status,200); assert.equal(body.mfa.enabled,false); assert.equal(body.mfa.recoveryCodesRemaining,0);
});

test('sign-out and recovery stay possible before the authenticator',async()=>{
 const f=await userFixture(); f.user.factors=[verifiedFactor];
 assert.equal((await f.handler(request('sign-out-current'))).status,200);
 assert.equal((await f.handler(request('mfa-recovery-redeem',{code:'00000-00000'}))).status,400,'wrong code is a plain refusal, not "MFA required"');
});

test('OAuth client tokens at aal1 keep working until the operator enforces them',async()=>{
 const claims={...validClaims(),client_id:'mobile-approved'};
 const open=await userFixture(); open.user.factors=[verifiedFactor];
 assert.equal((await open.handler(request('get-account',{},claims))).status,200);
 const enforced=await userFixture({env:{CODEVALANCHE_MFA_ENFORCE_OAUTH_AAL2:'true'}}); enforced.user.factors=[verifiedFactor];
 assert.equal((await enforced.handler(request('get-account',{},claims))).status,401);
});

test('recovery codes: only at aal2 with a verified authenticator; shown once, stored hashed',async()=>{
 const f=await userFixture();
 assert.equal((await f.handler(request('mfa-recovery-codes',{},aal2()))).status,400,'no authenticator, no codes');
 f.user.factors=[verifiedFactor];
 assert.equal((await f.handler(request('mfa-recovery-codes'))).status,401,'aal1 cannot mint codes');
 assert.equal((await f.handler(request('mfa-recovery-codes',{},{...validClaims(),client_id:'mobile-approved'}))).status,401,'nor can an OAuth client token at aal1');
 const r=await f.handler(request('mfa-recovery-codes',{},aal2())); const body=await r.json();
 assert.equal(r.status,200); assert.equal(body.codes.length,10); assert.equal(new Set(body.codes).size,10);
 for(const code of body.codes)assert.match(code,/^[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$/);
 const stored=f.calls.find(c=>c[1]==='codevalanche_mfa_recovery_replace')[2];
 assert.equal(stored.p_user_id,userId); assert.equal(stored.p_code_hashes.length,10);
 for(const h of stored.p_code_hashes){assert.match(h,/^[0-9a-f]{64}$/);for(const code of body.codes)assert.ok(!h.includes(code.replace('-','')))}
 const after=await (await f.handler(request('get-account',{},aal2()))).json(); assert.equal(after.mfa.recoveryCodesRemaining,10);
});

test('a recovery code removes the authenticator once, from an aal1 session',async()=>{
 const f=await userFixture(); f.user.factors=[verifiedFactor,{id:'66666666-6666-4666-8666-666666666666',factor_type:'totp',status:'unverified'}];
 const codes=(await (await f.handler(request('mfa-recovery-codes',{},aal2()))).json()).codes;
 f.calls.length=0;
 assert.equal((await f.handler(request('mfa-recovery-redeem',{code:'zzzzz-zzzzz'}))).status,400);
 assert.equal(f.calls.filter(c=>c[0]==='deleteFactor').length,0,'a wrong code removes nothing');
 const typed=codes[3].toUpperCase().replace('-',' ');
 const ok=await f.handler(request('mfa-recovery-redeem',{code:typed}));
 assert.equal(ok.status,200); assert.deepEqual(await ok.json(),{ok:true,mfa:{enabled:false}});
 assert.deepEqual(f.calls.filter(c=>c[0]==='deleteFactor').map(c=>[c[1],c[2]]),[[factorId,userId],['66666666-6666-4666-8666-666666666666',userId]]);
 assert.ok(f.calls.some(c=>c[1]==='codevalanche_mfa_recovery_clear'),'the other codes belonged to the removed authenticator');
 assert.equal((await f.handler(request('mfa-recovery-redeem',{code:codes[3]}))).status,400,'a code works once');
});

test('recovery attempts are rate limited per user',async()=>{
 const f=await userFixture(); f.user.factors=[verifiedFactor];
 await f.handler(request('mfa-recovery-redeem',{code:'00000-00000'}));
 assert.ok(f.calls.some(c=>c[1]==='codevalanche_rate_limit'&&c[2].p_bucket===`mfa-recovery:${userId}`&&c[2].p_limit<=5));
});

test('turning two-step verification off needs aal2 and the user own factor',async()=>{
 const f=await userFixture(); f.user.factors=[verifiedFactor];
 assert.equal((await f.handler(request('mfa-disable',{factorId}))).status,401);
 assert.equal((await f.handler(request('mfa-disable',{factorId:targetId},aal2()))).status,404);
 assert.equal(f.calls.filter(c=>c[0]==='deleteFactor').length,0);
 const r=await f.handler(request('mfa-disable',{factorId},aal2()));
 assert.equal(r.status,200); assert.deepEqual(f.calls.filter(c=>c[0]==='deleteFactor').map(c=>c[1]),[factorId]);
 assert.ok(f.calls.some(c=>c[1]==='codevalanche_mfa_recovery_clear'));
});

// Administrators: membership, credential evidence and readouts are the real SQL.
// Scalar functions answer a value (as PostgREST does), set-returning ones rows.
const scalar=new Set(['codevalanche_revoke_all_sessions','codevalanche_mfa_recovery_replace','codevalanche_mfa_recovery_consume','codevalanche_mfa_recovery_remaining','codevalanche_mfa_recovery_clear']);
async function adminFixture(role){
 const db=await createSqlFixture();
 await db.query('insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now())',[userId,targetId]);
 await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessionId,userId]);
 await db.query("insert into auth.mfa_factors(id,user_id,status,factor_type) values(gen_random_uuid(),$1,'verified','totp')",[userId]);
 await db.query("update public.codevalanche_account_state set credential_changed_at=now()-interval '1 day' where user_id=$1",[userId]);
 await db.query("insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,'password')",[sessionId]);
 await db.query('insert into public.codevalanche_admin_memberships(user_id,role) values($1,$2)',[userId,role]);
 const calls=[]; let failJournal=false;
 const user={id:userId,email:'synthetic@example.test',email_confirmed_at:'2026-10-11',user_metadata:{},app_metadata:{},identities:[]};
 const service={
  auth:{getUser:async()=>({data:{user},error:null}),admin:{
   getUserById:async(id)=>({data:{user:{id,banned_until:null}},error:null}),
   updateUserById:async(id,patch)=>{calls.push(['ban',id,patch.ban_duration]);return {data:{user:{id,banned_until:new Date(Date.now()+3600000).toISOString()}},error:null}},
  }},
  rpc:async(name,args={})=>{
   calls.push(['rpc',name,args]);
   try{const keys=Object.keys(args);const rows=(await db.query(`select * from public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')})`,keys.map(k=>args[k]))).rows;return {data:scalar.has(name)?Object.values(rows[0]??{})[0]??null:rows,error:null}}catch(error){return {data:null,error}}
  },
  from:table=>({columns:'*',filters:[],select(cols){this.columns=cols;return this},eq(key,value){this.filters.push([key,value]);return this},
   async maybeSingle(){try{return {data:(await db.query(`select ${this.columns} from public.${table} where ${this.filters.map(([key],i)=>`${key}=$${i+1}`).join(' and ')} limit 1`,this.filters.map(([,value])=>value))).rows[0]||null,error:null}}catch(error){return {data:null,error}}},
   insert:async(row)=>{calls.push(['insert',table]);if(table!=='codevalanche_admin_access_log')return {data:null,error:null};if(failJournal)return {data:null,error:new Error('journal down')};
    try{const keys=Object.keys(row);await db.query(`insert into public.${table}(${keys.join(',')}) values(${keys.map((_,i)=>`$${i+1}`).join(',')})`,keys.map(k=>k==='detail'?JSON.stringify(row[k]):row[k]));return {data:null,error:null}}catch(error){return {data:null,error}}}}),
 };
 return {db,calls,service,handler:await loadHandler(service),failJournal:value=>{failJournal=value}};
}
const journalRows=async db=>(await db.query('select actor_id,action,target_user_id,row_count,detail from public.codevalanche_admin_access_log order by occurred_at')).rows;

test('administrator feedback reads are journaled with actor and row count before data is returned',async()=>{
 const f=await adminFixture('support_readonly');
 try{
  await f.db.query("insert into public.codevalanche_feedback(user_id,category,message) values($1,'bug','hi'),($1,'idea','there')",[targetId]);
  const r=await f.handler(request('admin.feedback.list',{apiVersion:2,requestId:'feedback-read'},aal2())); const body=await r.json();
  assert.equal(r.status,200,JSON.stringify(body));
  const rows=Object.values(body.data).find(Array.isArray);
  assert.equal(rows.length,2);
  const [entry]=await journalRows(f.db);
  assert.ok(entry,'journal entry written'); assert.equal(entry.actor_id,userId); assert.equal(entry.action,'admin-feedback','journaled under the action name the table accepts'); assert.equal(entry.row_count,2);
  assert.equal(entry.detail.operation,'admin.feedback.list');
  const insert=f.calls.findIndex(c=>c[0]==='insert'&&c[1]==='codevalanche_admin_access_log'); assert.ok(insert>=0);
 }finally{await f.db.close()}
});

test('no journal, no feedback: a failed journal write withholds the rows',async()=>{
 const f=await adminFixture('support_readonly');
 try{
  await f.db.query("insert into public.codevalanche_feedback(user_id,category,message) values($1,'bug','secret text')",[targetId]);
  f.failJournal(true);
  const r=await f.handler(request('admin.feedback.list',{apiVersion:2,requestId:'feedback-no-journal'},aal2())); const text=await r.text();
  assert.ok(r.status>=500,`status ${r.status}`); assert.ok(!text.includes('secret text'),'no feedback row leaves without a journal entry');
 }finally{await f.db.close()}
});

test('suspending a user cuts every session and refresh token of the target after the ban; reactivating does not',async()=>{
 const f=await adminFixture('owner');
 try{
  await f.db.query('insert into auth.sessions(id,user_id) values(gen_random_uuid(),$1),(gen_random_uuid(),$1)',[targetId]);
  await f.db.exec('create table if not exists auth.refresh_tokens(id bigserial primary key,user_id text,session_id uuid)');
  await f.db.query('insert into auth.refresh_tokens(user_id) values($1),($1),($1)',[targetId]);
  const fields={apiVersion:2,requestId:'suspend',userId:targetId,operationId:'77777777-7777-4777-8777-777777777777',reasonCode:'abuse',reason:'Synthetic review'};
  const r=await f.handler(request('admin.account.suspend',fields,aal2())); const body=await r.json();
  assert.ok([200,202].includes(r.status),JSON.stringify(body));
  assert.equal(body.data.sessions.authRevoked,true); assert.equal(body.data.sessions.authSessionsDeleted,2); assert.equal(body.data.sessions.refreshTokensDeleted,3);
  assert.equal((await f.db.query('select count(*)::int n from auth.sessions where user_id=$1',[targetId])).rows[0].n,0);
  const cut=f.calls.findIndex(c=>c[1]==='codevalanche_revoke_all_sessions'); assert.deepEqual(f.calls[cut][2],{p_user_id:targetId});
  const state=(await f.db.query('select status from public.codevalanche_account_state where user_id=$1',[targetId])).rows[0];
  assert.equal(state.status,'suspended','the application suspension is recorded before the cut');
  const suspendCall=f.calls.findIndex(c=>c[0]==='rpc'&&c[1]!=='codevalanche_revoke_all_sessions'&&/operation|suspend/.test(c[1]));
  assert.ok(suspendCall>=0&&suspendCall<cut,'suspended first, so no sign-in races the cut');
  assert.ok((await journalRows(f.db)).some(e=>e.action==='admin-block-user'&&e.detail.operation==='admin.account.suspend'&&e.target_user_id===targetId));
  // The suspension finishes (the provider ban is confirmed) before an owner can lift it.
  await f.db.query("update public.codevalanche_operation_jobs set state='completed' where operation_id=$1",[fields.operationId]);
  f.calls.length=0;
  const back=await f.handler(request('admin.account.reactivate',{...fields,requestId:'reactivate',operationId:'88888888-8888-4888-8888-888888888888'},aal2()));
  assert.ok([200,202].includes(back.status),await back.text());
  assert.ok(!f.calls.some(c=>c[1]==='codevalanche_revoke_all_sessions'));
 }finally{await f.db.close()}
});

test('recovery codes: format, typing tolerance and hashing',async()=>{
 const codes=mfa.generateRecoveryCodes(); assert.equal(codes.length,mfa.RECOVERY_CODE_COUNT);
 const code=codes[0]; const norm=mfa.normalizeRecoveryCode(code); assert.equal(norm.length,10);
 assert.equal(mfa.normalizeRecoveryCode(` ${code.toUpperCase()} `),norm);
 assert.equal(mfa.normalizeRecoveryCode('0O1IL-abcde'),'00111abcde','Crockford look-alikes are accepted');
 for(const bad of ['', 'abc', 'uuuuu-uuuuu', 'x'.repeat(40), 42, null])assert.equal(mfa.normalizeRecoveryCode(bad),'');
 const h=await mfa.hashRecoveryCode(userId,norm); assert.match(h,/^[0-9a-f]{64}$/);
 assert.notEqual(h,await mfa.hashRecoveryCode(targetId,norm),'bound to the user');
});

test('migration: recovery codes and journal are service-only; the session cut deletes Auth sessions and refresh tokens',async()=>{
 const sql=await readFile(new URL('../migrations/202610160301_mfa_recovery_admin_audit_session_cut.sql',import.meta.url),'utf8');
 for(const table of ['codevalanche_mfa_recovery_codes','codevalanche_admin_access_log'])assert.ok(sql.includes(`alter table public.${table} enable row level security`),table);
 assert.match(sql,/revoke all on public\.codevalanche_mfa_recovery_codes, public\.codevalanche_admin_access_log from public, anon, authenticated/);
 assert.match(sql,/grant select, insert on public\.codevalanche_admin_access_log to service_role;/,'journal is append-only for the service');
 assert.doesNotMatch(sql,/grant[^;]*(update|delete)[^;]*codevalanche_admin_access_log/i);
 const cut=sql.slice(sql.indexOf('create function public.codevalanche_revoke_all_sessions'));
 assert.match(cut,/security definer set search_path = ''/);
 assert.match(cut,/insert into public\.codevalanche_revoked_sessions/);
 assert.match(cut,/delete from auth\.refresh_tokens where user_id = p_user_id::text/);
 assert.match(cut,/delete from auth\.sessions where user_id = p_user_id/);
 for(const fn of ['codevalanche_mfa_recovery_replace(uuid, text[])','codevalanche_mfa_recovery_consume(uuid, text)','codevalanche_mfa_recovery_remaining(uuid)','codevalanche_mfa_recovery_clear(uuid)','codevalanche_revoke_all_sessions(uuid)']){
  assert.ok(sql.includes(`revoke all on function public.${fn} from public, anon, authenticated;`),fn);
  assert.ok(sql.includes(`grant execute on function public.${fn} to service_role;`),fn);
 }
 assert.match(sql,/code_hash ~ '\^\[0-9a-f\]\{64\}\$'/,'only hashes fit the column');
 for(const name of ['codevalanche_mfa_recovery_replace','codevalanche_mfa_recovery_consume','codevalanche_mfa_recovery_remaining','codevalanche_mfa_recovery_clear','codevalanche_revoke_all_sessions'])assert.match(source,new RegExp(`["']${name}["']`),`handler uses ${name}`);
});
