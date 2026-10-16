/** Live, destructive-to-own-fixtures-only integration smoke. Node >=22. No emails. */
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const required = name => {const value=process.env[name];if(!value)throw new Error(`Missing ${name}`);return value;};
const base=required('SUPABASE_URL').replace(/\/$/, '');
if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(base))throw new Error('Expected hosted Supabase project URL');
const publicKey=required('SUPABASE_PUBLISHABLE_KEY');
const serviceKey=required('SUPABASE_SERVICE_ROLE_KEY');
if(process.argv.length>2)throw new Error('No fixture persistence or command-line secrets supported');
const fixtures=[],checks=[],cleanupFailures=[];
const marker=`cv-smoke-${randomUUID()}`;
async function call(path,{method='GET',body,token,key=publicKey}={}) {
 const headers={apikey:key,'content-type':'application/json'};
 if(token)headers.authorization=`Bearer ${token}`;
 const response=await fetch(`${base}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const text=await response.text();let data;try{data=JSON.parse(text)}catch{data=null}
 return {status:response.status,data};
}
const admin=(path,options={})=>call(`/auth/v1/admin${path}`,{...options,key:serviceKey,token:serviceKey});
const account=(token,action,body={})=>call('/functions/v1/codevalanche-account',{method:'POST',token,body:{action,...body}});
function expect(response,status,label) {assert.equal(response.status,status,`${label}: unexpected HTTP status`);checks.push(label);return response.data;}
async function createFixture(label,isAdmin=false) {
 const email=`${marker}-${label}@example.test`,password=`Cv!${randomBytes(30).toString('base64url')}9a`;
 const result=await admin('/users',{method:'POST',body:{email,password,email_confirm:true,user_metadata:{integration_fixture:marker,codevalanche_admin:true},app_metadata:isAdmin?{codevalanche_admin:true}:{}}});
 const data=result.data;const user=data?.user||data;
 assert.match(user?.id||'',/^[0-9a-f-]{36}$/i,'Admin create returned no user UUID');
 const fixture={id:user.id,email,password};fixtures.push(fixture);expect(result,200,`create ${label} fixture`);return fixture;
}
async function login(fixture) {
 const data=expect(await call('/auth/v1/token?grant_type=password',{method:'POST',body:{email:fixture.email,password:fixture.password}}),200,'fixture password sign-in');
 assert.equal(typeof data.access_token,'string');fixture.refreshToken=data.refresh_token;return data.access_token;
}
let failure;
try {
 const alice=await createFixture('alice'),bob=await createFixture('bob'),administrator=await createFixture('admin',true);
 const a=await login(alice),a2=await login(alice),b=await login(bob),adm=await login(administrator);
 const initial=expect(await account(a,'get-account'),200,'verified account');assert.equal(initial.user.id,alice.id);assert.equal(initial.sub,alice.id);
 const second=expect(await account(a2,'get-account'),200,'second session'),other=expect(await account(b,'get-account'),200,'second user');
 expect(await account(a,'update-profile',{displayName:'Integration Alice',bio:'Disposable integration fixture',userId:bob.id}),200,'update own profile');
 assert.equal(expect(await account(a,'get-account'),200,'read own profile').user.displayName,'Integration Alice');
 assert.notEqual(expect(await account(b,'get-account'),200,'other profile isolated').user.displayName,'Integration Alice');
 expect(await account(a,'admin-list-users'),403,'user metadata cannot grant administrator');
 expect(await account(a,'revoke-session',{sessionId:other.session_id}),404,'cannot revoke foreign session');
 expect(await account(b,'get-account'),200,'foreign session remains usable');
 expect(await account(a,'revoke-session',{sessionId:second.session_id}),200,'revoke own secondary session');
 expect(await account(a2,'get-account'),401,'revoked JWT rejected immediately');
 expect(await account(a,'get-account'),200,'unrevoked current session remains usable');
 for(const token of [undefined,a]) {
  for(const table of ['codevalanche_account_state','codevalanche_feedback','codevalanche_events','codevalanche_revoked_sessions','codevalanche_rate_limits']) {
   const r=await call(`/rest/v1/${table}?select=*&limit=1`,{token});assert.ok([401,403].includes(r.status),`Direct ${table} read unexpectedly allowed`);
  }
  const r=await call('/rest/v1/rpc/codevalanche_sessions',{method:'POST',token,body:{p_user_id:bob.id}});assert.ok([401,403,404].includes(r.status),'Direct sessions RPC unexpectedly allowed');
 }
 checks.push('anonymous and authenticated tables/RPC inaccessible');
 const bobRefresh=bob.refreshToken;
 const blocked=expect(await account(adm,'admin-block-user',{userId:bob.id}),200,'administrator blocks fixture');
 assert.equal(blocked?.sessions?.authRevoked,true,'Block did not delete the Auth sessions');checks.push('block deletes Auth sessions and refresh tokens');
 const blockedResponse=await account(b,'get-account');assert.ok([401,403].includes(blockedResponse.status),'Block did not deny existing JWT');checks.push('block denies existing JWT');
 const refreshed=await call('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:bobRefresh}});assert.ok(refreshed.status>=400,'Blocked refresh token still mints tokens');checks.push('blocked refresh token refused');
 expect(await account(adm,'admin-unblock-user',{userId:bob.id}),200,'administrator unblocks fixture');
 expect(await account(b,'get-account'),401,'session cut by the block stays cut after unblock');
 const bobAgain=await login(bob);
 expect(await account(bobAgain,'get-account'),200,'unblocked user signs in again');
 const journalRead=await call(`/rest/v1/codevalanche_admin_access_log?select=action,target_user_id&actor_id=eq.${administrator.id}&target_user_id=eq.${bob.id}`,{key:serviceKey,token:serviceKey});
 assert.ok(journalRead.status===200 && ['admin-block-user','admin-unblock-user'].every(action=>journalRead.data?.some(row=>row.action===action)),'Block/unblock not journaled');checks.push('admin actions journaled');
 const thirdToken=await login(alice);
 expect(await account(a,'sign-out-others'),200,'sign out other provider sessions');
 expect(await account(thirdToken,'get-account'),401,'provider revoked JWT denied');
 expect(await account(a,'sign-out-current'),200,'sign out current provider session');
 expect(await account(a,'get-account'),401,'current provider session revoked');
} catch(error) {
 // Never print provider response bodies, tokens, passwords or exception internals.
 failure=error instanceof assert.AssertionError ? String(error.message).split('\n')[0] : 'Smoke operation failed (network, setup, or runtime)';
} finally {
 for(const fixture of fixtures.reverse()) {
  try {
   const existing=await admin(`/users/${fixture.id}`);
   const value=existing.data?.user||existing.data;
   if(existing.status!==200 || value?.user_metadata?.integration_fixture!==marker || value?.email!==fixture.email) {cleanupFailures.push(fixture.id);continue;}
   const deleted=await admin(`/users/${fixture.id}`,{method:'DELETE'});
   if(![200,204].includes(deleted.status))cleanupFailures.push(fixture.id);
  }catch{cleanupFailures.push(fixture.id)}
 }
 // Rate buckets deliberately contain no secret and have no FK; remove only exact fixture buckets.
 for(const fixture of fixtures)for(const prefix of ['account','feedback']) {
  try{await call(`/rest/v1/codevalanche_rate_limits?bucket=eq.${encodeURIComponent(`${prefix}:${fixture.id}`)}`,{method:'DELETE',key:serviceKey,token:serviceKey})}catch{}
 }
}
console.log(JSON.stringify({ok:!failure&&!cleanupFailures.length,checks,fixtureCount:fixtures.length,cleanedUp:fixtures.length-cleanupFailures.length,...(failure?{failure}:{}),...(cleanupFailures.length?{cleanupRequiredUserIds:cleanupFailures}:{})},null,2));
if(failure||cleanupFailures.length)process.exitCode=1;


