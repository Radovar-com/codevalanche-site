import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {fixture,request,validClaims,userId,sessionId} from '../../../supabase/tests/handlerHarness.mjs';

const factorId='55555555-5555-4555-8555-555555555555';
const now=()=>Math.floor(Date.now()/1000);
const currentFactor=()=>({id:factorId,factor_type:'totp',status:'verified',created_at:new Date(Date.now()-86400000).toISOString(),updated_at:new Date(Date.now()-86400000).toISOString()});
const freshMfa=()=>({...validClaims(),aal:'aal2',amr:[{method:'password',timestamp:now()-10},{method:'totp',timestamp:now()-2}]});
async function legacyFixture() {
 const f=fixture();f.adminReads=0;f.audit=[];
 f.db.auth.admin.listUsers=async()=>{f.adminReads++;return {data:{users:[]},error:null}};
 f.db.auth.admin.signOut=async()=>{f.writes.push({signOut:true});return {error:null}};
 const file=new URL('../supabase/functions/codevalanche-account/index.ts',import.meta.url);
 let source=await readFile(file,'utf8');const names=[],values=[];
 for(const match of [...source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm)]){
  const module=match[2].startsWith('npm:')?{createClient:()=>f.db}:await import(new URL(match[2],file));
  for(const name of match[1].split(',').map(x=>x.trim()).filter(Boolean)){names.push(name);values.push(module[name])}
  source=source.replace(match[0],'');
 }
 new Function(...names,'Deno','console',stripTypeScriptTypes(source))(...values,{env:{get:key=>({SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'synthetic'})[key]},serve:handler=>{f.handler=handler}},{info:value=>f.audit.push(JSON.parse(value))});
 return f;
}

test('signed claim issuer, audience, role, expiry and access-token purpose fail closed even after getUser accepts',async()=>{
 const changes=[{iss:'https://foreign.supabase.co/auth/v1'},{aud:'anon'},{aud:['anon']},{role:'service_role'},{exp:now()-1},{exp:String(now()+3600)},{token_use:'refresh'},{sub:'44444444-4444-4444-8444-444444444444'},{session_id:'bad'}];
 for(const patch of changes){const f=await legacyFixture();const response=await f.handler(request('get-account',{}, {...validClaims(),...patch}));assert.equal(response.status,401,JSON.stringify(patch));assert.deepEqual(f.writes,[])}
});

test('legacy audience string and standard audience array remain compatible',async()=>{
 for(const aud of ['authenticated',['authenticated']]){const f=await legacyFixture();const response=await f.handler(request('get-account',{}, {...validClaims(),aud}));assert.equal(response.status,200);assert.equal((await response.json()).user.id,userId)}
});

test('legacy normal account/profile/session contracts remain scoped to the verified user',async()=>{
 const f=await legacyFixture();
 const response=await f.handler(request('get-account'));const body=await response.json();
 assert.equal(response.status,200);assert.equal(body.user.id,userId);assert.equal(body.session_id,sessionId);assert.equal(body.analyticsConsent,false);
 assert.equal((await f.handler(request('update-profile',{displayName:'Safe',bio:'Line one\nline two',unknownExtra:'ignored',userId:'44444444-4444-4444-8444-444444444444'}))).status,200);
 assert.equal(f.writes[0].id,userId);assert.equal(f.writes[0].patch.user_metadata.display_name,'Safe');assert.equal(f.writes[0].patch.user_metadata.userId,undefined);
 assert.equal((await f.handler(request('revoke-session',{sessionId:'44444444-4444-4444-8444-444444444444'}))).status,404);
 assert.equal((await f.handler(request('sign-out-current'))).status,200);
});

test('administrator private reads and mutations require fresh MFA backed by current provider factors',async()=>{
 for(const action of ['admin-list-users','admin-feedback','admin-analytics','admin-block-user','admin-unblock-user'])for(const proof of ['aal1','missing-amr','stale','future','no-factor']){
  const f=await legacyFixture();f.user.app_metadata={codevalanche_admin:true};f.user.factors=[currentFactor()];
  const claims=freshMfa();if(proof==='aal1')claims.aal='aal1';if(proof==='missing-amr')delete claims.amr;if(proof==='stale')claims.amr[1].timestamp=now()-3600;if(proof==='future')claims.amr[1].timestamp=now()+60;if(proof==='no-factor')f.user.factors=[];
  const response=await f.handler(request(action,{userId:'44444444-4444-4444-8444-444444444444'},claims));
  assert.ok([401,403].includes(response.status),`${action}/${proof}: ${response.status}`);assert.equal(f.adminReads,0);assert.deepEqual(f.writes,[]);
 }
});

test('fresh administrator MFA works and user-editable metadata cannot grant administrator authority',async()=>{
 const admin=await legacyFixture();admin.user.app_metadata={codevalanche_admin:true};admin.user.factors=[currentFactor()];
 assert.equal((await admin.handler(request('admin-list-users',{},freshMfa()))).status,200);assert.equal(admin.adminReads,1);
 const ordinary=await legacyFixture();ordinary.user.user_metadata={codevalanche_admin:true};ordinary.user.factors=admin.user.factors;
 assert.equal((await ordinary.handler(request('admin-list-users',{},freshMfa()))).status,403);assert.equal(ordinary.adminReads,0);
});

test('self deletion and cancellation require fresh primary authentication or current fresh MFA',async()=>{
 for(const action of ['request-deletion','cancel-deletion'])for(const amr of [undefined,[],[{method:'password',timestamp:now()-3600}],[{method:'password',timestamp:now()+60}]]){
  const f=await legacyFixture();const response=await f.handler(request(action,{confirmation:'DELETE'},{...validClaims(),amr}));assert.equal(response.status,401,action);assert.deepEqual(f.writes,[]);
 }
 const fresh=await legacyFixture();assert.equal((await fresh.handler(request('request-deletion',{confirmation:'DELETE'}))).status,200);
 const enrolled=await legacyFixture();enrolled.user.factors=[currentFactor()];
 assert.equal((await enrolled.handler(request('request-deletion',{confirmation:'DELETE'}))).status,401);assert.deepEqual(enrolled.writes,[]);
 assert.equal((await enrolled.handler(request('request-deletion',{confirmation:'DELETE'},freshMfa()))).status,200);
});

test('provider OTP-only recovery proof permits own read/signout but cannot perform sensitive writes',async()=>{
 const claims={...validClaims(),amr:[{method:'otp',timestamp:now()-1}]};
 const f=await legacyFixture();assert.equal((await f.handler(request('get-account',{},claims))).status,200);
 for(const action of ['update-profile','request-deletion','cancel-deletion','consent','feedback','admin-list-users']){
  const response=await f.handler(request(action,{displayName:'Example',confirmation:'DELETE',analytics:true,category:'general',message:'Example'},claims));assert.equal(response.status,403,action);
 }
 assert.deepEqual(f.writes,[]);assert.equal((await f.handler(request('sign-out-current',{},claims))).status,200);
});

test('legacy validation rejects control characters, wrong types and invalid administrative pagination before writes',async()=>{
 for(const [action,body]of [['update-profile',{displayName:'two\nlines'}],['update-profile',{bio:'bad\u0000value'}],['feedback',{category:'general',message:'bad\u0000value'}],['consent',{analytics:'yes'}],['admin-list-users',{page:0}]]){
  const f=await legacyFixture();assert.equal((await f.handler(request(action,body))).status,400,action);assert.deepEqual(f.writes,[]);
 }
});

test('exact-origin CORS and the existing body size ceiling are preserved',async()=>{
 const f=await legacyFixture();const foreign=request('get-account');foreign.headers.set('origin','https://evil.example');assert.equal((await f.handler(foreign)).status,403);
 const native=request('get-account');native.headers.delete('origin');assert.equal((await f.handler(native)).status,200);
 assert.equal((await f.handler(request('update-profile',{bio:'x'.repeat(17000)}))).status,413);
});

async function lifecycleFixture(){
 const f=await legacyFixture(),target='44444444-4444-4444-8444-444444444444',oldSession='77777777-7777-4777-8777-777777777777';
 const administrator=f.user;administrator.app_metadata={codevalanche_admin:true};administrator.factors=[currentFactor()];
 const targetUser={...structuredClone(administrator),id:target,app_metadata:{},factors:[]};
 const states=new Map([[userId,{blocked:false}],[target,{blocked:false}]]),revoked=new Set();
 f.failure=null;f.providerBan=null;f.order=[];
 f.db.rpc=async(name,args)=>{const data=name==='codevalanche_sessions'?[{id:args.p_user_id===target?oldSession:sessionId}].filter(row=>!revoked.has(row.id)):true;return {data,count:Array.isArray(data)?(f.returnedCount!==undefined?f.returnedCount:data.length):null,error:null}};
 f.db.from=table=>({id:null,select(){return this},eq(key,id){this.id=id;return this},maybeSingle:async function(){return {data:states.get(this.id),error:null}},
  upsert:async value=>{if(table==='codevalanche_revoked_sessions'){f.order.push('revoke');if(f.failure==='revoke')return {error:new Error('synthetic revoke unavailable')};for(const row of Array.isArray(value)?value:[value])revoked.add(row.session_id)}return {data:null,error:null}},
  update:patch=>({eq:async(key,id)=>{states.set(id,{...states.get(id),...patch});f.order.push(`blocked:${patch.blocked}`);return {error:null}}})});
 f.db.auth.admin.updateUserById=async(id,patch)=>{assert.equal(id,target);f.order.push(`provider:${patch.ban_duration}`);if(f.failure==='provider-before')return {error:new Error('synthetic provider unavailable')};f.providerBan=patch.ban_duration;return f.failure==='provider-after'?{error:new Error('synthetic response lost')}:{error:null}};
 f.adminAction=action=>{f.user=administrator;return f.handler(request(action,{userId:target},freshMfa()))};
 f.oldAccess=()=>{f.user=targetUser;return f.handler(request('get-account',{}, {...validClaims(),sub:target,session_id:oldSession}))};
 return {...f,states,revoked,target,oldSession,setFailure:value=>{f.failure=value},setCount:value=>{f.returnedCount=value},getOrder:()=>f.order,getProviderBan:()=>f.providerBan};
}

test('blocking and unblocking never restore the target previous account session',async()=>{
 const f=await lifecycleFixture();assert.equal((await f.oldAccess()).status,200);
 assert.equal((await f.adminAction('admin-block-user')).status,200);
 assert.ok(f.revoked.has(f.oldSession));assert.equal(f.states.get(f.target).blocked,true);
 assert.equal((await f.adminAction('admin-unblock-user')).status,200);
 assert.equal(f.states.get(f.target).blocked,false);
 assert.equal((await f.oldAccess()).status,401,'a still-valid old JWT stays revoked after unblock');
 assert.equal(f.getOrder()[0],'blocked:true');assert.ok(f.getOrder().indexOf('revoke')<f.getOrder().indexOf('provider:876000h'));
});

test('revocation or uncertain provider failure leaves legacy account blocked and refuses unblock',async()=>{
 for(const failure of ['revoke','provider-before','provider-after']){
  const f=await lifecycleFixture();f.setFailure(failure);
  assert.equal((await f.adminAction('admin-unblock-user')).status,503,failure);
  assert.equal(f.states.get(f.target).blocked,true,`${failure}: must not clear application block`);
  assert.ok([401,403].includes((await f.oldAccess()).status));
  if(failure==='revoke')assert.equal(f.getProviderBan(),null,'provider unban cannot precede durable revocation');
 }
});

test('an unknown or truncated exact session count cannot authorize provider unblocking',async()=>{
 for(const count of [null,2]){const f=await lifecycleFixture();f.setCount(count);assert.equal((await f.adminAction('admin-unblock-user')).status,503);assert.equal(f.states.get(f.target).blocked,true);assert.equal(f.getProviderBan(),null)}
});

test('administrator MFA must postdate current factor creation and invalid creation evidence fails closed',async()=>{
 for(const condition of ['replaced','same-second','missing-created','invalid-created','future-created']){
  const f=await legacyFixture();f.user.app_metadata={codevalanche_admin:true};const factor=currentFactor();f.user.factors=[factor];const claims=freshMfa();
  if(condition==='replaced'){claims.amr[1].timestamp=now()-120;factor.created_at=factor.updated_at=new Date(Date.now()-30000).toISOString()}
  if(condition==='same-second')factor.created_at=new Date(claims.amr[1].timestamp*1000+500).toISOString();
  if(condition==='missing-created')delete factor.created_at;
  if(condition==='invalid-created')factor.created_at='not a timestamp';
  if(condition==='future-created')factor.created_at=new Date(Date.now()+60000).toISOString();
  assert.equal((await f.handler(request('admin-list-users',{},claims))).status,401,condition);assert.equal(f.adminReads,0);
 }
});

test('private security logs contain only bounded action/result/correlation fields',async()=>{
 const f=await legacyFixture();f.user.app_metadata={codevalanche_admin:true};f.user.factors=[currentFactor()];
 const response=await f.handler(request('admin-list-users',{privateText:'NEVER_LOG_BODY'},freshMfa()));assert.equal(response.status,200);
 assert.equal(f.audit.length,1);const log=f.audit[0];
 assert.deepEqual(Object.keys(log).sort(),['action','event','outcome','requestId','status']);
 assert.equal(log.action,'admin-list-users');assert.equal(log.outcome,'succeeded');assert.equal(log.status,200);
 assert.match(log.requestId,/^[a-f0-9-]{36}$/);assert.equal(response.headers.get('x-request-id'),log.requestId);
 const serialized=JSON.stringify(log);for(const privateValue of [userId,sessionId,'test@example.test','NEVER_LOG_BODY'])assert.equal(serialized.includes(privateValue),false);
});

test('fresh MFA after stable factor creation remains valid when provider verification updates generic metadata',async()=>{
 for(const updated of ['advanced','omitted']){
  const f=await legacyFixture();f.user.app_metadata={codevalanche_admin:true};const factor=currentFactor();f.user.factors=[factor];const claims=freshMfa();
  if(updated==='advanced')factor.updated_at=new Date(claims.amr[1].timestamp*1000+500).toISOString();else delete factor.updated_at;
  assert.equal((await f.handler(request('admin-list-users',{},claims))).status,200,updated);assert.equal(f.adminReads,1);
 }
});
