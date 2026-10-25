import test from 'node:test';
import assert from 'node:assert/strict';
import {ACCOUNT_REQUEST_SCHEMAS} from '../functions/codevalanche-account/schemas.mjs';
import {fixture,loadHandler,request,validClaims,userId} from './handlerHarness.mjs';

const additional = ['project.binding.register','project.binding.get','analytics.event','event.submit','analytics.summary','admin.operator.session','admin.users.list','admin.users.detail','admin.deletion.get','admin.deletion.request','admin.deletion.cancel','admin.account.suspend','admin.account.reactivate','admin.limits.update','admin.sessions.revoke','admin.operations.get','admin.notifications.ack','admin.security.list','admin.analytics.summary','admin.feedback.list','admin.feedback.update','admin.notifications.list','admin.audit.list'];
const actions = [...new Set([...Object.keys(ACCOUNT_REQUEST_SCHEMAS),...additional])];
const fields = {apiVersion:2,requestId:'33333333-3333-4333-8333-333333333333',authorizationId:'fixture-authorization'};

test('every account action requires a verified subject before reading account data',async()=>{
 const f=fixture();let reads=0;f.db.auth.getUser=async()=>({data:{user:null},error:{status:401}});
 f.db.rpc=async()=>{reads++;throw new Error('unexpected database access')};
 const handler=await loadHandler(f.db);
 for(const action of actions){const response=await handler(request(action,action==='remote.policy.evidence'?{apiVersion:2,requestId:fields.requestId}:fields));assert.equal(response.status,401,action);assert.equal((await response.json()).error.code,'sign_in_required',action)}
 assert.equal(reads,0);
});

test('a revoked current session cannot revoke the other sessions',async()=>{
 const f=fixture();f.active=false;let signouts=0;f.db.auth.admin.signOut=async()=>{signouts++;return {error:null}};
 const response=await (await loadHandler(f.db))(request('sessions.revoke-others',fields));
 assert.equal(response.status,401);assert.equal((await response.json()).error.code,'session_revoked');assert.equal(signouts,0);assert.deepEqual(f.writes,[]);
});

for(const action of ['operator.oauth.details','operator.oauth.approve'])test(`provider-banned subject cannot reach ${action} when the local policy is stale`,async()=>{
 const f=fixture();f.user.banned_until=new Date(Date.now()+3600000).toISOString();let consentReads=0;
 const rpc=f.db.rpc;f.db.rpc=async(name,args)=>{if(name==='codevalanche_operator_oauth_context'){consentReads++;return {data:{operator:false},error:null}}return rpc(name,args)};
 const response=await (await loadHandler(f.db))(request(action,action==='remote.policy.evidence'?{apiVersion:2,requestId:fields.requestId}:fields));
 assert.equal(response.status,403);assert.equal((await response.json()).error.code,'account_suspended');assert.equal(consentReads,0);
});

test('remote policy evidence respects the account rate limit before reading credential evidence',async()=>{
 const f=fixture();let credentialReads=0;const rpc=f.db.rpc;
 f.db.rpc=async(name,args)=>{if(name==='codevalanche_rate_limit')return {data:false,error:null};if(name.includes('credential'))credentialReads++;return rpc(name,args)};
 const response=await (await loadHandler(f.db))(request('remote.policy.evidence',{apiVersion:2,requestId:fields.requestId}));
 assert.equal(response.status,429);assert.equal((await response.json()).error.code,'rate_limited');assert.equal(credentialReads,0);
});

test('provider/database exceptions return no internal detail to either API version',async()=>{
 for(const apiVersion of [undefined,2]){const f=fixture();f.db.rpc=async()=>{throw new Error('private-database-detail')};const response=await (await loadHandler(f.db))(request('get-account',{apiVersion}));assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/private-database-detail/)}
});

test('a token that expires during the session lookup cannot reach an account mutation',async t=>{
 const f=fixture(),claims=validClaims(),initial=Date.now();const rpc=f.db.rpc;
 f.db.rpc=async(name,args)=>{const result=await rpc(name,args);if(name==='codevalanche_sessions')t.mock.method(Date,'now',()=>initial+7200000);return result};
 const response=await (await loadHandler(f.db))(request('profile.update',{...fields,displayName:'Edited'},claims));
 assert.equal(response.status,401);assert.deepEqual(f.writes,[]);
});

const validFields={
 'admin-block-user':{userId:'44444444-4444-4444-8444-444444444444'},'admin-unblock-user':{userId:'44444444-4444-4444-8444-444444444444'},
 'update-profile':{displayName:'Edited'},'profile.update':{displayName:'Edited'},
 'revoke-session':{sessionId:'22222222-2222-4222-8222-222222222222'},'sessions.revoke':{sessionId:'22222222-2222-4222-8222-222222222222'},
 'mfa-recovery-redeem':{code:'00000-00000'},'mfa-disable':{factorId:'55555555-5555-4555-8555-555555555555'},
 'request-deletion':{confirmation:'DELETE'},'account.deletion.request':{confirmation:'DELETE'},
 consent:{analytics:true},'analytics.consent':{analytics:true},
 feedback:{category:'bug',message:'Synthetic feedback'},'feedback.submit':{category:'bug',message:'Synthetic feedback'},
 event:{eventId:'33333333-3333-4333-8333-333333333333',eventName:'app_opened',platform:'web'},
 'operator.oauth.details':{authorizationId:'fixture-authorization'},'operator.oauth.approve':{authorizationId:'fixture-authorization'},
 'operator.oauth.claim':{stateHash:'a'.repeat(64),codeHash:'b'.repeat(64),codeVerifier:'c'.repeat(43)},
};

test('every account operation refuses a suspended subject, including readouts and legacy aliases',async()=>{
 const f=fixture();f.state={status:'suspended',blocked:true};const handler=await loadHandler(f.db),claims={...validClaims(),aal:'aal2'};
 for(const action of actions){
  const response=await handler(request(action,{apiVersion:2,requestId:fields.requestId,...validFields[action]},claims));
  assert.equal(response.status,403,action);assert.equal((await response.json()).error.code,'account_suspended',action);
 }
 assert.deepEqual(f.writes,[]);
});

test('ordinary account operations cannot use an explicit different user ID to read or mutate another account',async()=>{
 const f=fixture();const handler=await loadHandler(f.db);
 for(const action of ['get-account','update-profile','sessions.revoke','sessions.revoke-others','account.deletion.request','account.deletion.cancel','feedback.submit','analytics.summary','security.activity']){
  const response=await handler(request(action,{apiVersion:2,...validFields[action],userId:'44444444-4444-4444-8444-444444444444'}));
  assert.equal(response.status,403,action);assert.equal((await response.json()).error.code,'account_forbidden',action);
 }
 assert.deepEqual(f.writes,[]);
});

test('rate refusal stops every ordinary operation before its action-specific service effect',async()=>{
 const f=fixture(),rpc=f.db.rpc;let signouts=0;
 f.db.rpc=async(name,args)=>name==='codevalanche_rate_limit'?{data:false,error:null}:rpc(name,args);
 f.db.auth.admin.signOut=async()=>{signouts++;return {error:null}};
 const handler=await loadHandler(f.db),claims={...validClaims(),aal:'aal2'};
 for(const action of actions.filter(action=>!action.startsWith('operator.')&&action!=='remote.policy.evidence')){
  const response=await handler(request(action,{apiVersion:2,requestId:fields.requestId,...validFields[action]},claims));
  assert.equal(response.status,429,action);assert.equal((await response.json()).error.code,'rate_limited',action);
 }
 assert.equal(signouts,0);assert.deepEqual(f.writes,[]);
});

test('an operator claim rate refusal precedes recovery evidence and one-time proof access',async()=>{
 const f=fixture(),rpc=f.db.rpc;
 f.db.rpc=async(name,args)=>name==='codevalanche_rate_limit'?{data:false,error:null}:rpc(name,args);
 const claims={...validClaims(),client_id:'mobile-approved',aal:'aal2',amr:[{method:'oauth_provider/authorization_code',timestamp:Math.floor(Date.now()/1000)}]};
 const response=await (await loadHandler(f.db,{operatorClientIds:['mobile-approved']}))(request('operator.oauth.claim',{apiVersion:2,requestId:fields.requestId,...validFields['operator.oauth.claim']},claims));
 assert.equal(response.status,429);assert.equal((await response.json()).error.code,'rate_limited');
});

test('prototype property names are unknown actions, never inherited operation aliases',async()=>{
 const f=fixture(),handler=await loadHandler(f.db);
 for(const apiVersion of [undefined,2])for(const action of ['constructor','__proto__','toString','hasOwnProperty']){
  const response=await handler(request(action,{apiVersion}));assert.equal(response.status,400,`${apiVersion??1}: ${action}`);
  assert.doesNotMatch(await response.text(),/function|prototype|stack/);
 }
 assert.deepEqual(f.writes,[]);
});
