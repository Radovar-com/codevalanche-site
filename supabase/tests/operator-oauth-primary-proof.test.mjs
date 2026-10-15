import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createSqlFixture} from './sqlHarness.mjs';
import {loadHandler,request,validClaims,userId,sessionId} from './handlerHarness.mjs';
import {operatorOAuthConsent} from '../functions/_shared/operatorOAuthProof.ts';
import {authorizeWebsiteReport} from '../functions/_shared/websiteAnalyticsAuthorization.ts';
const clientId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',oauthSession='33333333-3333-4333-8333-333333333333';
const hash=value=>createHash('sha256').update(value).digest('hex');
const authorizationId='actual-provider-authorization',state='s'.repeat(43),verifier='v'.repeat(64),code='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',authorizationUuid='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const challenge=createHash('sha256').update(verifier).digest('base64url');
const proof={stateHash:hash(state),codeHash:hash(code),codeVerifier:verifier};
const parentClaims=()=>({...validClaims(),aal:'aal2',amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)-4},{method:'totp',timestamp:Math.floor(Date.now()/1000)-1}]});
const delegated=()=>({...validClaims(),session_id:oauthSession,client_id:clientId,aal:'aal2',amr:[{method:'oauth_provider/authorization_code',timestamp:Math.floor(Date.now()/1000)-4},{method:'totp',timestamp:Math.floor(Date.now()/1000)-1}]});
async function fixture(){
 const db=await createSqlFixture();
 await db.exec('alter table auth.sessions add column oauth_client_id uuid;alter table auth.sessions add column aal text;create table auth.oauth_authorizations(id uuid primary key,authorization_id text,client_id uuid,user_id uuid,redirect_uri text,scope text,state text,code_challenge text,code_challenge_method text,status text,authorization_code text,expires_at timestamptz);');
 await db.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[userId]);
 await db.query("insert into auth.sessions(id,user_id,oauth_client_id,aal) values($1,$3,null,'aal2'),($2,$3,$4,'aal2')",[sessionId,oauthSession,userId,clientId]);
 await db.query("insert into auth.mfa_factors(id,user_id,status,factor_type) values(gen_random_uuid(),$1,'verified','totp')",[userId]);
 await db.query("update public.codevalanche_account_state set credential_changed_at=now()-interval '1 day' where user_id=$1",[userId]);
 await db.query("insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,'password'),($1,'totp'),($2,'oauth_provider/authorization_code'),($2,'totp')",[sessionId,oauthSession]);
 await db.query("insert into public.codevalanche_admin_memberships(user_id,role) values($1,'support_readonly')",[userId]);
 const user={id:userId,email_confirmed_at:'2026-10-11',user_metadata:{},app_metadata:{},identities:[]};
 const service={auth:{getUser:async()=>({data:{user},error:null})},rpc:async(name,args={})=>{try{const keys=Object.keys(args);return {data:(await db.query(`select * from public.${name}(${keys.map((k,i)=>`${k}=>$${i+1}`).join(',')})`,keys.map(k=>args[k]))).rows,error:null}}catch(error){return {data:null,error}}},from:table=>({columns:'*',filters:[],select(cols){this.columns=cols;return this},eq(key,value){this.filters.push([key,value]);return this},async maybeSingle(){return {data:(await db.query(`select ${this.columns} from public.${table} where ${this.filters.map(([key],i)=>`${key}=$${i+1}`).join(' and ')} limit 1`,this.filters.map(([,value])=>value))).rows[0]||null,error:null}},insert:async()=>({data:null,error:null})})};
 const provider=async(input,init)=>{
  assert.equal(init.headers.Authorization,'Bearer exact-verified-parent');assert.equal(init.redirect,'error');
  const path=new URL(input).pathname;
  if(path.endsWith('/consent')){await db.query("update auth.oauth_authorizations set status='approved',user_id=$1,authorization_code=$2 where authorization_id=$3",[userId,code,authorizationId]);return Response.json({redirect_url:`http://127.0.0.1:39876/api/codevalanche/accounts/operator/callback?code=${code}&state=${state}`});}
  return Response.json({client:{name:'Company OS'},scope:'openid email profile'});
 };
 const consent=async(decision='approve',fetchImpl=provider,overrides={})=>{
  const result=await operatorOAuthConsent({service,principal:{userId,sessionId,clientId:null,aal:'aal2',mfaVerifiedAt:new Date(Date.now()-1000).toISOString(),emailVerified:true},claims:parentClaims(),token:'exact-verified-parent',authorizationId,decision,url:'https://example.supabase.co',apikey:'test-public',clientIds:[clientId],operatorClientIds:[clientId],origin:'https://codevalanche.com',fetchImpl,...overrides});
  if(result.redirect_url){
   // Models provider code exchange, which creates the client session AFTER
   // the first-party response has persisted its actual-code proof.
   await db.query('update auth.sessions set created_at=clock_timestamp() where id=$1',[oauthSession]);
   await db.query("update auth.mfa_amr_claims set created_at=clock_timestamp(),updated_at=clock_timestamp() where session_id=$1",[oauthSession]);
  }
  return result;
 };
 await db.query("insert into auth.oauth_authorizations(id,authorization_id,client_id,redirect_uri,scope,state,code_challenge,code_challenge_method,status,expires_at) values($1,$2,$3,'http://127.0.0.1:39876/api/codevalanche/accounts/operator/callback','openid email profile',$4,$5,'s256','pending',now()+interval '5 minutes')",[authorizationUuid,authorizationId,clientId,state,challenge]);
 const handler=await loadHandler(service,{clientIds:[clientId],operatorClientIds:[clientId]});
 const claim=(fields=proof,claims=delegated())=>handler(request('operator.oauth.claim',{apiVersion:2,requestId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',...fields},claims));
 return {db,service,user,provider,consent,handler,claim};
}
test('observed provider authorization-code AMR can authorize an operator read only with server-attested primary proof',async()=>{
 const f=await fixture();try{
  // Isolates the existing handler gate first; the proof RPC is exercised with
  // real SQL below once its additive migration exists.
  const rpc=f.service.rpc;f.service.rpc=async(name,args)=>name==='codevalanche_operator_oauth_evidence'?{data:[{qualified:true}],error:null}:rpc(name,args);
  const handler=await loadHandler(f.service,{clientIds:[clientId],operatorClientIds:[clientId]});
  const response=await handler(request('admin.operator.session',{apiVersion:2,requestId:'observed-provider-amr'},delegated()));
  assert.equal(response.status,200);assert.equal((await response.json()).data.principal.clientId,clientId);
 }finally{await f.db.close()}
});
test('real SQL primary code receipt, private PKCE claim, admin read and report authorization compose without changing ordinary recovery',async()=>{
 const f=await fixture();try{
  const pre=await f.service.rpc('codevalanche_operator_oauth_context',{p_user_id:userId,p_session_id:sessionId,p_authorization_id:authorizationId,p_client_ids:[clientId]});assert.equal(pre.error,null,pre.error?.message);
  assert.deepEqual(await f.consent('details'),{operator:true,client:{name:'Company OS'},scope:'openid email profile'});
  const approved=await f.consent();assert.equal(new URL(approved.redirect_url).searchParams.get('code'),code);
  const stored=(await f.db.query('select * from public.codevalanche_operator_oauth_proofs')).rows[0];assert.equal(stored.pkce_challenge,challenge);assert.equal(stored.code_hash,proof.codeHash);assert.equal(JSON.stringify(stored).includes(verifier),false);assert.equal(stored.oauth_session_id,null);
  // Provider consumes/deletes its authorization row during actual code exchange.
  await f.db.query('delete from auth.oauth_authorizations');
  const before=await f.handler(request('admin.operator.session',{apiVersion:2,requestId:'before-proof'},delegated()));assert.equal(before.status,403);
  let r=await f.claim();assert.equal(r.status,200);assert.deepEqual((await r.json()).data,{claimed:true});
  r=await f.claim();assert.equal(r.status,200,'same final-session retry is idempotent');
  r=await f.handler(request('admin.operator.session',{apiVersion:2,requestId:'after-proof'},delegated()));assert.equal(r.status,200);
  const actor=await authorizeWebsiteReport(request('unused',{},delegated()),{service:f.service,issuer:'https://example.supabase.co/auth/v1',clientIds:[clientId],operatorClientIds:[clientId]});assert.equal(actor.actorId,userId);
  r=await f.handler(request('profile.update',{apiVersion:2,requestId:'consumer',displayName:'Should remain restricted'},delegated()));assert.equal(r.status,403);assert.equal((await r.json()).error.code,'recovery_restricted');
  const evidence=(await f.db.query('select * from public.codevalanche_credential_evidence($1,$2)',[userId,oauthSession])).rows[0];assert.equal(evidence.recovery_only,true,'ordinary provider evidence is unchanged');
 }finally{await f.db.close()}
});
test('claim rejects missing, wrong, swapped and malformed PKCE/state/code without consuming a valid receipt',async()=>{
 const f=await fixture();try{await f.consent();
  for(const patch of [{codeVerifier:undefined},{codeVerifier:'x'.repeat(64)},{stateHash:hash('wrong')},{codeHash:hash('wrong')},{codeVerifier:'!'.repeat(64)},{codeVerifier:'v'.repeat(129)}]){
   const r=await f.claim({...proof,...patch});assert.ok([400,403].includes(r.status),JSON.stringify(patch));
   assert.equal((await f.db.query('select oauth_session_id from public.codevalanche_operator_oauth_proofs')).rows[0].oauth_session_id,null);
  }
  assert.equal((await f.claim()).status,200);
 }finally{await f.db.close()}
});
test('recovery, OTP, invite, signup, magiclink and TOTP-only primary parents never mint an operator receipt',async()=>{
 const f=await fixture();try{
  for(const method of ['otp','recovery','invite','signup','magiclink','totp','oauth_provider/authorization_code']){
   await f.db.query('update auth.mfa_amr_claims set authentication_method=$1 where session_id=$2',[method,sessionId]);
   await assert.rejects(()=>f.consent(),/recovery_restricted/);
   assert.equal((await f.db.query('select count(*)::int n from public.codevalanche_operator_oauth_proofs')).rows[0].n,0);
  }
 }finally{await f.db.close()}
});
test('old primary authentication after credential rotation cannot prepare even if a primary method remains',async()=>{
 const f=await fixture();try{
  await assert.rejects(()=>f.consent('details',f.provider,{claims:{...parentClaims(),amr:[{method:'password',timestamp:Math.floor(Date.now()/1000)-2*86400}]}}),/reauthentication_required/);
  await f.db.query('update public.codevalanche_account_state set credential_changed_at=clock_timestamp() where user_id=$1',[userId]);await assert.rejects(()=>f.consent(),/reauthentication_required/);assert.equal((await f.db.query('select count(*)::int n from public.codevalanche_operator_oauth_proofs')).rows[0].n,0)
 }finally{await f.db.close()}
});
test('provider success and database persistence failure returns no redirect or receipt',async()=>{
 const f=await fixture();try{const rpc=f.service.rpc;f.service.rpc=async(name,args)=>name==='codevalanche_operator_oauth_store'?{error:{code:'08006'},data:null}:rpc(name,args);await assert.rejects(()=>f.consent(),/account_service_unavailable/);assert.equal((await f.db.query('select count(*)::int n from public.codevalanche_operator_oauth_proofs')).rows[0].n,0)}finally{await f.db.close()}
});
test('every operator read rechecks live parent, final provider session, role, factor, expiry and credential stamp',async()=>{
 const f=await fixture();try{await f.consent();assert.equal((await f.claim()).status,200);
  const changes=[
   ['parent revoked','insert into public.codevalanche_revoked_sessions(session_id,user_id) values($1,$2)',[sessionId,userId]],
   ['parent deleted','delete from auth.sessions where id=$1',[sessionId]],
   ['parent expired',"update auth.sessions set not_after=now()-interval '1 second' where id=$1",[sessionId]],
   ['parent no primary',"update auth.mfa_amr_claims set authentication_method='otp' where session_id=$1",[sessionId]],
   ['parent AAL downgraded',"update auth.sessions set aal='aal1' where id=$1",[sessionId]],
   ['OAuth revoked','insert into public.codevalanche_revoked_sessions(session_id,user_id) values($1,$2)',[oauthSession,userId]],
   ['OAuth expired',"update auth.sessions set not_after=now()-interval '1 second' where id=$1",[oauthSession]],
   ['OAuth client changed',"update auth.sessions set oauth_client_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' where id=$1",[oauthSession]],
   ['native AAL downgraded',"update auth.sessions set aal='aal1' where id=$1",[oauthSession]],
   ['native TOTP removed',"delete from auth.mfa_amr_claims where session_id=$1 and authentication_method='totp'",[oauthSession]],
   ['native recovery mixed',"insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,'otp')",[oauthSession]],
   ['factor removed','delete from auth.mfa_factors where user_id=$1',[userId]],
   ['role withdrawn','update public.codevalanche_admin_memberships set active=false where user_id=$1',[userId]],
   ['account blocked','update public.codevalanche_account_state set blocked=true where user_id=$1',[userId]],
   ['provider banned',"update auth.users set banned_until=now()+interval '1 day' where id=$1",[userId]],
   ['stamp rotated','update public.codevalanche_account_state set credential_changed_at=clock_timestamp() where user_id=$1',[userId]],
   ['grant expired',"update public.codevalanche_operator_oauth_proofs set grant_expires_at=now()-interval '1 second'",[]],
  ];
  for(const [name,sql,args] of changes){await f.db.exec('begin');try{await f.db.query(sql,args);const r=await f.handler(request('admin.operator.session',{apiVersion:2,requestId:'guard'},delegated()));assert.ok(r.status>=400,name)}finally{await f.db.exec('rollback')}}
  const r=await f.handler(request('admin.operator.session',{apiVersion:2,requestId:'guards-restored'},delegated()));assert.equal(r.status,200);
 }finally{await f.db.close()}
});
test('claim cannot bind a preexisting or foreign client session and replay cannot change a bound session',async()=>{
 const f=await fixture();try{await f.consent();
  await f.db.exec('begin');await f.db.query("update auth.sessions set created_at=now()-interval '1 hour' where id=$1",[oauthSession]);assert.equal((await f.claim()).status,403);await f.db.exec('rollback');
  await f.db.exec('begin');await f.db.query("update auth.sessions set oauth_client_id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' where id=$1",[oauthSession]);assert.equal((await f.claim()).status,403);await f.db.exec('rollback');
  assert.equal((await f.claim()).status,200);
  const other='ffffffff-ffff-4fff-8fff-ffffffffffff';await f.db.query("insert into auth.sessions(id,user_id,oauth_client_id,aal) values($1,$2,$3,'aal2')",[other,userId,clientId]);await f.db.query("insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,'oauth_provider/authorization_code'),($1,'totp')",[other]);
  assert.equal((await f.claim(proof,{...delegated(),session_id:other})).status,403);assert.equal((await f.db.query('select oauth_session_id from public.codevalanche_operator_oauth_proofs')).rows[0].oauth_session_id,oauthSession);
 }finally{await f.db.close()}
});
test('unclaimed expiry and qualified maintenance physically prune proof material',async()=>{
 const f=await fixture();try{await f.consent();await f.db.query("update public.codevalanche_operator_oauth_proofs set claim_deadline=now()-interval '1 second'");assert.equal((await f.claim()).status,403);const result=(await f.db.query('select public.wa_prune_website_analytics(now()) result')).rows[0].result;assert.equal(result.operatorProofs,1);assert.equal((await f.db.query('select count(*)::int n from public.codevalanche_operator_oauth_proofs')).rows[0].n,0)}finally{await f.db.close()}
});
test('generic approved mobile clients retain ordinary consent without becoming operator clients',async()=>{
 const f=await fixture();try{await f.db.query('delete from public.codevalanche_admin_memberships');await f.db.query("update auth.sessions set aal='aal1' where id=$1",[sessionId]);let calls=0;
  const result=await operatorOAuthConsent({service:f.service,principal:{userId,sessionId,clientId:null},claims:parentClaims(),token:'primary',authorizationId,decision:'details',url:'https://example.supabase.co',apikey:'test-public',clientIds:[clientId],operatorClientIds:[],origin:'https://codevalanche.com',fetchImpl:async()=>{calls++;throw Error('must not call provider')}});
  assert.deepEqual(result,{operator:false});assert.equal(calls,0);
  const genericHandler=await loadHandler(f.service,{clientIds:[clientId]});assert.equal((await genericHandler(request('admin.operator.session',{apiVersion:2,requestId:'generic-client'},delegated()))).status,403);
 }finally{await f.db.close()}
});
test('operator allowlist removal invalidates a previously bound proof even while the client remains generically approved',async()=>{
 const f=await fixture();try{await f.consent();assert.equal((await f.claim()).status,200);const revoked=await loadHandler(f.service,{clientIds:[clientId],operatorClientIds:[]});assert.equal((await revoked(request('admin.operator.session',{apiVersion:2,requestId:'operator-removed'},delegated()))).status,403)}finally{await f.db.close()}
});
test('raw proof rows and capability RPCs are inaccessible to anonymous and authenticated roles',async()=>{
 const f=await fixture();try{for(const role of ['anon','authenticated']){
  await f.db.exec(`set role ${role}`);try{
   await assert.rejects(()=>f.db.query('select * from public.codevalanche_operator_oauth_proofs'),/permission denied/);
   await assert.rejects(()=>f.db.query('select * from public.codevalanche_operator_oauth_evidence($1,$2,$3)',[userId,oauthSession,clientId]),/permission denied/);
   await assert.rejects(()=>f.db.query('select public.codevalanche_operator_oauth_context($1,$2,$3,$4)',[userId,sessionId,authorizationId,[clientId]]),/permission denied/);
   await assert.rejects(()=>f.db.query('select public.codevalanche_operator_oauth_prune()'),/permission denied/);
  }finally{await f.db.exec('reset role')}
 }}finally{await f.db.close()}
});
test('actual consent handler uses the verified parent bearer for provider details and approval',async()=>{
 const f=await fixture();try{const seen=[];
  const handler=await loadHandler(f.service,{clientIds:[clientId],operatorClientIds:[clientId],fetchImpl:async(input,init)=>{
   const claims=JSON.parse(Buffer.from(init.headers.Authorization.split(' ')[1].split('.')[1],'base64url'));
   assert.equal(claims.session_id,sessionId);assert.equal(claims.client_id,undefined);assert.equal(claims.amr[0].method,'password');assert.notEqual(init.headers.Authorization,'Bearer test');seen.push(new URL(input).pathname);
   return f.provider(input,{...init,headers:{...init.headers,Authorization:'Bearer exact-verified-parent'}});
  }});
  const invoke=action=>handler(request(action,{apiVersion:2,requestId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',authorizationId},parentClaims()));
  let r=await invoke('operator.oauth.details');assert.equal(r.status,200);assert.equal((await r.json()).data.operator,true);
  r=await invoke('operator.oauth.approve');assert.equal(r.status,200);assert.ok((await r.json()).data.redirect_url);assert.equal(seen.length,2);
  r=await handler(request('operator.oauth.details',{apiVersion:2,requestId:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',authorizationId,primaryVerified:true},parentClaims()));assert.equal(r.status,400);
 }finally{await f.db.close()}
});
test('provider redirect substitution, code mismatch and mid-flight parent changes cannot persist proof',async()=>{
 const f=await fixture();try{
  for(const redirect of [`https://evil.test/callback?code=${code}&state=${state}`,`http://127.0.0.1:39876/api/codevalanche/accounts/operator/callback?code=${code}&state=wrong`,`http://127.0.0.1:39876/api/codevalanche/accounts/operator/callback?code=${code}&state=${state}&extra=raw`]){
   await assert.rejects(()=>f.consent('approve',async()=>Response.json({redirect_url:redirect})),/account_service_unavailable/);
  }
  for(const mutation of ["update auth.oauth_authorizations set authorization_code='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'",'update public.codevalanche_admin_memberships set active=false',"update public.codevalanche_account_state set credential_changed_at=clock_timestamp()"]){
   await f.db.exec('begin;savepoint provider_attempt');try{
    await assert.rejects(()=>f.consent('approve',async(input,init)=>{const r=await f.provider(input,init);await f.db.exec(mutation);return r}),/account_service_unavailable|administrator_required|reauthentication_required/);
    await f.db.exec('rollback to savepoint provider_attempt');
    assert.equal((await f.db.query('select count(*)::int n from public.codevalanche_operator_oauth_proofs')).rows[0].n,0);
   }finally{await f.db.exec('rollback')}
  }
 }finally{await f.db.close()}
});
test('claim keeps native final MFA, strict credential precision and signed AMR restrictions',async()=>{
 const f=await fixture();try{await f.consent();const current=delegated();
  for(const claims of [{...current,aal:'aal1'},{...current,amr:[current.amr[0]]},{...current,amr:[...current.amr,{method:'otp',timestamp:Math.floor(Date.now()/1000)}]},{...current,amr:[current.amr[0],{method:'totp',timestamp:Math.floor(Date.now()/1000)-301}]},{...current,amr:[current.amr[0],{method:'totp',timestamp:Math.floor(Date.now()/1000)+100}]}]){
   assert.ok((await f.claim(proof,claims)).status>=400);
  }
  assert.equal((await f.db.query('select oauth_session_id from public.codevalanche_operator_oauth_proofs')).rows[0].oauth_session_id,null);assert.equal((await f.claim()).status,200);
 }finally{await f.db.close()}
});
test('bound delegated proof does not authorize admin mutations, remote enrollment or account attribution',async()=>{
 const f=await fixture();try{await f.consent();assert.equal((await f.claim()).status,200);await f.db.query("update public.codevalanche_admin_memberships set role='owner' where user_id=$1",[userId]);
  for(const action of ['admin.account.suspend','remote.enroll','event.submit','security.mfa.remove-authorize']){const r=await f.handler(request(action,{apiVersion:2,requestId:'out-of-scope'},delegated()));assert.equal(r.status,403);assert.equal((await r.json()).error.code,'recovery_restricted')}
 }finally{await f.db.close()}
});
test('native AAL1 parent receives only a factor hint before provider autoapproval can create a doomed proof',async()=>{
 const f=await fixture();try{
  await f.db.query("update auth.sessions set aal='aal1' where id=$1",[sessionId]);await f.db.query("delete from auth.mfa_amr_claims where session_id=$1 and authentication_method='totp'",[sessionId]);let providerCalls=0;
  const result=await f.consent('details',async()=>{providerCalls++;return Response.json({client:{name:'Company OS'},scope:'openid'})},{principal:{userId,sessionId,clientId:null,aal:'aal1',mfaVerifiedAt:null,emailVerified:true},claims:{...validClaims()}});
  assert.deepEqual(result,{operator:true,parentMfaRequired:true});assert.equal(providerCalls,0);assert.equal((await f.db.query('select count(*)::int n from public.codevalanche_operator_oauth_proofs')).rows[0].n,0);
 }finally{await f.db.close()}
});
test('actual native guard forbidden after role withdrawal returns 403 while unknown RPC failures remain 503',async()=>{
 const f=await fixture();try{await f.consent();assert.equal((await f.claim()).status,200);await f.db.query('update public.codevalanche_admin_memberships set active=false where user_id=$1',[userId]);
  const response=await f.handler(request('admin.operator.session',{apiVersion:2,requestId:'withdrawn-role'},delegated()));assert.equal(response.status,403);assert.equal((await response.json()).error.code,'administrator_required');
  await f.db.query('update public.codevalanche_admin_memberships set active=true where user_id=$1',[userId]);const rpc=f.service.rpc;
  for(const error of [{code:'08006',message:'forbidden'},{code:'P0001',message:'unknown_guard'},{code:'P0001',message:'constructor'},{message:'network_failure'}]){
   f.service.rpc=async(name,args)=>name==='codevalanche_operator_oauth_evidence'?{data:null,error}:rpc(name,args);
   assert.equal((await f.handler(request('admin.operator.session',{apiVersion:2,requestId:'unknown-rpc'},delegated()))).status,503);
  }
 }finally{await f.db.close()}
});
test('stepping up the native parent before approval survives the provider AAL1 pruning rule',async()=>{
 const f=await fixture();try{
  await f.db.query("update auth.sessions set aal='aal1' where id=$1",[sessionId]);await f.db.query("delete from auth.mfa_amr_claims where session_id=$1 and authentication_method='totp'",[sessionId]);
  const hint=await f.consent('details');assert.deepEqual(hint,{operator:true,parentMfaRequired:true});
  // Even a server-side attempt to bypass the metadata hint cannot persist an
  // AAL1-parent capability: the existing store calls the strengthened helper.
  await f.provider('https://example.supabase.co/auth/v1/oauth/authorizations/x/consent',{headers:{Authorization:'Bearer exact-verified-parent'},redirect:'error'});
  const denied=await f.service.rpc('codevalanche_operator_oauth_store',{p_user_id:userId,p_session_id:sessionId,p_authorization_id:authorizationId,p_client_id:clientId,p_state_hash:proof.stateHash,p_code_hash:proof.codeHash,p_credential_stamp:(await f.db.query('select credential_changed_at from public.codevalanche_account_state where user_id=$1',[userId])).rows[0].credential_changed_at});assert.equal(denied.error?.code,'P0001');assert.equal(denied.error?.message,'mfa_required');
  await f.db.query("update auth.sessions set aal='aal2' where id=$1",[sessionId]);await f.db.query("insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,'totp')",[sessionId]);
  await f.consent();await f.db.query("delete from auth.sessions where user_id=$1 and aal='aal1' and id<>$2",[userId,oauthSession]);
  assert.equal((await f.db.query('select count(*)::int n from public.codevalanche_operator_oauth_proofs')).rows[0].n,1);assert.equal((await f.claim()).status,200);
 }finally{await f.db.close()}
});
test('signed parent AAL1 or a TOTP not newer than the credential stamp cannot reach provider autoapproval',async()=>{
 const f=await fixture();try{let calls=0;
  const fetchImpl=async()=>{calls++;throw Error('provider must remain untouched')};
  for(const principal of [{userId,sessionId,clientId:null,aal:'aal1',mfaVerifiedAt:null,emailVerified:true},{userId,sessionId,clientId:null,aal:'aal2',mfaVerifiedAt:new Date(Date.now()-2*86400000).toISOString(),emailVerified:true}])assert.deepEqual(await f.consent('details',fetchImpl,{principal}),{operator:true,parentMfaRequired:true});
  assert.equal(calls,0);assert.equal((await f.db.query('select count(*)::int n from public.codevalanche_operator_oauth_proofs')).rows[0].n,0);
 }finally{await f.db.close()}
});
