// Two-step verification (TOTP + recovery codes), the administrator read journal
// and cutting the sessions of a blocked user, through the real handler source
// with the Supabase service boundary faked (nothing reaches a real project).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import * as validation from '../functions/codevalanche-account/validation.mjs';
import * as schemas from '../functions/codevalanche-account/schemas.mjs';
import * as mfa from '../functions/codevalanche-account/mfa.mjs';

const userId='11111111-1111-4111-8111-111111111111', sessionId='22222222-2222-4222-8222-222222222222';
const targetId='44444444-4444-4444-8444-444444444444', factorId='55555555-5555-4555-8555-555555555555';
const verifiedFactor={id:factorId,factor_type:'totp',status:'verified',friendly_name:'Phone',created_at:'2026-10-16T00:00:00Z'};

let user, env, calls, inserts, failInsert, feedbackRows, recoveryStore;
function reset() {
 user={id:userId,email:'test@example.test',email_confirmed_at:'2026-09-08',user_metadata:{},app_metadata:{},identities:[],factors:[]};
 env={}; calls=[]; inserts=[]; failInsert=false; feedbackRows=[{id:'f1',message:'hi'},{id:'f2',message:'there'}]; recoveryStore=new Map();
}
reset();
const query=(table)=>{
 const q={table,select(){return q},eq(){return q},order(){return q},
  limit:async()=>{calls.push(['read',table]);return {data:table==='codevalanche_feedback'?feedbackRows:[],error:null}},
  maybeSingle:async()=>({data:{blocked:false},error:null}),
  upsert:async()=>({data:null,error:null}),update(){return q},
  insert:async(row)=>{calls.push(['insert',table]);if(failInsert)return {data:null,error:new Error('down')};inserts.push({table,row});return {data:null,error:null}}};
 return q;
};
const db={
 auth:{getUser:async()=>({data:{user},error:null}),admin:{
  mfa:{deleteFactor:async({id,userId:owner})=>{calls.push(['deleteFactor',id,owner]);return {data:{id},error:null}}},
  updateUserById:async(id,patch)=>{calls.push(['ban',id,patch.ban_duration]);return {error:null}},
 }},
 rpc:async(name,args)=>{
  calls.push(['rpc',name,args]);
  if(name==='codevalanche_sessions')return {data:[{id:sessionId}],error:null};
  if(name==='codevalanche_rate_limit')return {data:true,error:null};
  if(name==='codevalanche_mfa_recovery_replace'){recoveryStore=new Map(args.p_code_hashes.map(h=>[h,false]));return {data:10,error:null}}
  if(name==='codevalanche_mfa_recovery_consume'){const ok=recoveryStore.get(args.p_code_hash)===false;if(ok)recoveryStore.set(args.p_code_hash,true);return {data:ok,error:null}}
  if(name==='codevalanche_mfa_recovery_remaining')return {data:[...recoveryStore.values()].filter(v=>!v).length,error:null};
  if(name==='codevalanche_mfa_recovery_clear'){const n=recoveryStore.size;recoveryStore.clear();return {data:n,error:null}}
  if(name==='codevalanche_revoke_all_sessions')return {data:{app_revoked:2,auth_sessions_deleted:2,refresh_tokens_deleted:3,auth_revoked:true},error:null};
  return {data:null,error:new Error('unexpected rpc '+name)};
 },
 from:(table)=>query(table),
};
let handler;
const source=await readFile(new URL('../functions/codevalanche-account/index.ts',import.meta.url),'utf8');
const runnable=stripTypeScriptTypes(source.replace(/^import .*;\r?\n/gm,''));
const local={...validation,...schemas,...mfa};
const names=[...source.matchAll(/^import \{([^}]+)\} from '\.\/[^']+';/gm)].flatMap(m=>m[1].split(',').map(n=>n.trim()).filter(Boolean));
new Function('createClient','Deno',...names,runnable)(()=>db,{env:{get:(name)=>env[name]},serve:fn=>{handler=fn}},...names.map(n=>local[n]));
const jwt=(claims)=>`e30.${Buffer.from(JSON.stringify({sub:userId,session_id:sessionId,...claims})).toString('base64url')}.signature`;
const request=(action,extras={},claims={aal:'aal1'})=>new Request('https://example.test',{method:'POST',headers:{authorization:`Bearer ${jwt(claims)}`,'content-type':'application/json',origin:'https://codevalanche.com'},body:JSON.stringify({action,...extras})});
const AAL2={aal:'aal2'};

test('a user with a verified authenticator is refused at aal1 and answered at aal2',async()=>{
 reset(); user.factors=[verifiedFactor];
 const refused=await handler(request('get-account'));
 assert.equal(refused.status,401); assert.deepEqual(await refused.json(),{error:'MFA required',mfaRequired:true});
 const ok=await handler(request('get-account',{},AAL2)); const body=await ok.json();
 assert.equal(ok.status,200); assert.equal(body.mfa.enabled,true); assert.deepEqual(body.mfa.factors.map(f=>f.id),[factorId]);
 assert.equal(body.userId,userId,'desktop aliases unchanged');
});

test('users without an authenticator are unchanged at aal1 (installed clients keep working)',async()=>{
 reset(); const r=await handler(request('get-account')); const body=await r.json();
 assert.equal(r.status,200); assert.equal(body.mfa.enabled,false); assert.equal(body.mfa.recoveryCodesRemaining,0);
});

test('sign-out and recovery stay possible before the authenticator',async()=>{
 reset(); user.factors=[verifiedFactor]; db.auth.admin.signOut=async()=>({error:null});
 assert.equal((await handler(request('sign-out-current'))).status,200);
 assert.equal((await handler(request('mfa-recovery-redeem',{code:'00000-00000'}))).status,400,'wrong code is a plain refusal, not "MFA required"');
});

test('OAuth client tokens at aal1 keep working until the operator enforces them',async()=>{
 reset(); user.factors=[verifiedFactor]; const claims={aal:'aal1',client_id:'codevalanche-desktop'};
 assert.equal((await handler(request('get-account',{},claims))).status,200);
 env.CODEVALANCHE_MFA_ENFORCE_OAUTH_AAL2='true';
 assert.equal((await handler(request('get-account',{},claims))).status,401);
});

test('recovery codes: only at aal2 with a verified authenticator; shown once, stored hashed',async()=>{
 reset();
 assert.equal((await handler(request('mfa-recovery-codes',{},AAL2))).status,400,'no authenticator, no codes');
 user.factors=[verifiedFactor];
 assert.equal((await handler(request('mfa-recovery-codes'))).status,401,'aal1 cannot mint codes');
 assert.equal((await handler(request('mfa-recovery-codes',{},{aal:'aal1',client_id:'x'}))).status,401,'nor can an OAuth client token at aal1');
 const r=await handler(request('mfa-recovery-codes',{},AAL2)); const body=await r.json();
 assert.equal(r.status,200); assert.equal(body.codes.length,10); assert.equal(new Set(body.codes).size,10);
 for(const code of body.codes)assert.match(code,/^[0-9a-hjkmnp-tv-z]{5}-[0-9a-hjkmnp-tv-z]{5}$/);
 const stored=calls.find(c=>c[1]==='codevalanche_mfa_recovery_replace')[2];
 assert.equal(stored.p_user_id,userId); assert.equal(stored.p_code_hashes.length,10);
 for(const h of stored.p_code_hashes){assert.match(h,/^[0-9a-f]{64}$/);for(const code of body.codes)assert.ok(!h.includes(code.replace('-','')))}
 const after=await (await handler(request('get-account',{},AAL2))).json(); assert.equal(after.mfa.recoveryCodesRemaining,10);
});

test('a recovery code removes the authenticator once, from an aal1 session',async()=>{
 reset(); user.factors=[verifiedFactor,{id:'66666666-6666-4666-8666-666666666666',factor_type:'totp',status:'unverified'}];
 const codes=(await (await handler(request('mfa-recovery-codes',{},AAL2))).json()).codes;
 calls=[];
 assert.equal((await handler(request('mfa-recovery-redeem',{code:'zzzzz-zzzzz'}))).status,400);
 assert.equal(calls.filter(c=>c[0]==='deleteFactor').length,0,'a wrong code removes nothing');
 const typed=codes[3].toUpperCase().replace('-',' ');
 const ok=await handler(request('mfa-recovery-redeem',{code:typed}));
 assert.equal(ok.status,200); assert.deepEqual(await ok.json(),{ok:true,mfa:{enabled:false}});
 assert.deepEqual(calls.filter(c=>c[0]==='deleteFactor').map(c=>[c[1],c[2]]),[[factorId,userId],['66666666-6666-4666-8666-666666666666',userId]]);
 assert.ok(calls.some(c=>c[1]==='codevalanche_mfa_recovery_clear'),'the other codes belonged to the removed authenticator');
 assert.equal((await handler(request('mfa-recovery-redeem',{code:codes[3]}))).status,400,'a code works once');
});

test('recovery attempts are rate limited per user',async()=>{
 reset(); user.factors=[verifiedFactor];
 await handler(request('mfa-recovery-redeem',{code:'00000-00000'}));
 assert.ok(calls.some(c=>c[1]==='codevalanche_rate_limit'&&c[2].p_bucket===`mfa-recovery:${userId}`&&c[2].p_limit<=5));
});

test('turning two-step verification off needs aal2 and the user own factor',async()=>{
 reset(); user.factors=[verifiedFactor];
 assert.equal((await handler(request('mfa-disable',{factorId}))).status,401);
 assert.equal((await handler(request('mfa-disable',{factorId:targetId},AAL2))).status,404);
 assert.equal(calls.filter(c=>c[0]==='deleteFactor').length,0);
 const r=await handler(request('mfa-disable',{factorId},AAL2));
 assert.equal(r.status,200); assert.deepEqual(calls.filter(c=>c[0]==='deleteFactor').map(c=>c[1]),[factorId]);
 assert.ok(calls.some(c=>c[1]==='codevalanche_mfa_recovery_clear'));
});

test('admin-feedback reads are journaled with actor and row count before data is returned',async()=>{
 reset(); user.app_metadata={codevalanche_admin:true};
 const r=await handler(request('admin-feedback')); const body=await r.json();
 assert.equal(r.status,200); assert.equal(body.feedback.length,2);
 const entry=inserts.find(i=>i.table==='codevalanche_admin_access_log');
 assert.ok(entry,'journal entry written'); assert.equal(entry.row.actor_id,userId); assert.equal(entry.row.action,'admin-feedback'); assert.equal(entry.row.row_count,2);
});

test('no journal, no feedback: a failed journal write withholds the rows',async()=>{
 reset(); user.app_metadata={codevalanche_admin:true}; failInsert=true;
 const r=await handler(request('admin-feedback')); const body=await r.json();
 assert.equal(r.status,503); assert.equal(body.feedback,undefined);
});

test('admin-block-user cuts every session and refresh token of the target; unblock does not',async()=>{
 reset(); user.app_metadata={codevalanche_admin:true};
 const r=await handler(request('admin-block-user',{userId:targetId})); const body=await r.json();
 assert.equal(r.status,200); assert.equal(body.ok,true); assert.equal(body.sessions.authRevoked,true); assert.equal(body.sessions.appRevoked,2);
 const cut=calls.find(c=>c[1]==='codevalanche_revoke_all_sessions'); assert.deepEqual(cut[2],{p_user_id:targetId});
 const ban=calls.findIndex(c=>c[0]==='ban'); assert.ok(ban>=0 && ban<calls.indexOf(cut),'banned first, so no sign-in races the cut');
 assert.ok(inserts.some(i=>i.table==='codevalanche_admin_access_log'&&i.row.action==='admin-block-user'&&i.row.target_user_id===targetId));
 calls=[];
 assert.equal((await handler(request('admin-unblock-user',{userId:targetId}))).status,200);
 assert.ok(!calls.some(c=>c[1]==='codevalanche_revoke_all_sessions'));
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
 for(const name of ['codevalanche_mfa_recovery_replace','codevalanche_mfa_recovery_consume','codevalanche_mfa_recovery_remaining','codevalanche_mfa_recovery_clear','codevalanche_revoke_all_sessions'])assert.match(source,new RegExp(`'${name}'`),`handler uses ${name}`);
});
