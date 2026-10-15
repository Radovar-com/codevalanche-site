import {AccountError,checked,uuid} from './accountContract.ts';
import {readCredentialStamp} from './credentialStamp.ts';
import {assertAssurance,assertCurrentAssurance} from './assurancePolicy.ts';

const HEX=/^[0-9a-f]{64}$/;
async function digest(value:string){return new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));}
const hex=(bytes:Uint8Array)=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const base64url=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
function scalar(data:any){return Array.isArray(data)?data[0]?.codevalanche_operator_oauth_context??data[0]?.codevalanche_operator_oauth_store??data[0]:data;}
export async function operatorOAuthEvidence(service:any,principal:any,claims:any,claim?:any,operatorClientIds:string[]=[]){
 const methods=Array.isArray(claims?.amr)?claims.amr:[];
 if(!principal.clientId||!operatorClientIds.includes(principal.clientId)||!methods.some((m:any)=>m.method==='oauth_provider/authorization_code')||
 methods.some((m:any)=>!['oauth_provider/authorization_code','totp'].includes(m.method)||!Number.isFinite(m.timestamp)||m.timestamp<=0||m.timestamp>Date.now()/1000))throw new AccountError('recovery_restricted',403);
 const evidence=await readCredentialStamp(service,principal);
 // This temporary object only runs the unchanged MFA/stamp checks. It becomes
 // returnable authority exclusively after the private proof RPC succeeds.
 const assembled={...evidence,recoveryOnly:false};
 if(claim)assertAssurance(principal,{purpose:'operator.oauth.claim',evidence:assembled});
 else assertCurrentAssurance(principal,{evidence:assembled});
 const args:any={p_user_id:principal.userId,p_session_id:principal.sessionId,p_client_id:principal.clientId};
 if(claim){
  if(!HEX.test(claim.stateHash??'')||!HEX.test(claim.codeHash??'')||typeof claim.codeVerifier!=='string'||!/^[A-Za-z0-9._~-]{43,128}$/.test(claim.codeVerifier))throw new AccountError('invalid_fields',400);
  args.p_state_hash=claim.stateHash;args.p_code_hash=claim.codeHash;
  // Verifier is never stored, reflected in a DTO, or sent to analytics.
  args.p_pkce_challenge=base64url(await digest(claim.codeVerifier));
 }
 const rows=checked(await service.rpc('codevalanche_operator_oauth_evidence',args)) as any;
 if(rows?.[0]?.qualified!==true)throw new AccountError('recovery_restricted',403);
 return assembled;
}

export async function operatorOAuthConsent({service,principal,claims,token,authorizationId,decision,url,apikey,clientIds,operatorClientIds=[],origin,fetchImpl=fetch}:any){
 if(typeof authorizationId!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(authorizationId))throw new AccountError('invalid_fields',400);
 const context=scalar(checked(await service.rpc('codevalanche_operator_oauth_context',{
  p_user_id:principal.userId,p_session_id:principal.sessionId,p_authorization_id:authorizationId,p_client_ids:operatorClientIds.filter((id:string)=>clientIds.includes(id)),
 })));
 if(context?.operator===false)return {operator:false};
 if(context?.operator!==true||!clientIds.includes(context.clientId)||!apikey||!origin)throw new AccountError('account_service_unavailable',503);
 const primary=(Array.isArray(claims.amr)?claims.amr:[]).filter((m:any)=>['password','oauth','sso/saml'].includes(m.method)&&Number.isFinite(m.timestamp)&&m.timestamp>0&&m.timestamp<=Date.now()/1000);
 const primaryAt=Math.max(...primary.map((m:any)=>m.timestamp*1000));
 if(!Number.isFinite(primaryAt)||(context.credentialStamp&&primaryAt<=Date.parse(context.credentialStamp)))throw new AccountError('reauthentication_required',401);
 let expected:URL;
 try{expected=new URL(context.redirectUri);if(expected.username||expected.password||expected.hash||expected.search)throw 0;}catch{throw new AccountError('account_service_unavailable',503);}
 const path=`/auth/v1/oauth/authorizations/${encodeURIComponent(authorizationId)}`+(decision==='approve'?'/consent':'');
 let response:Response,data:any;
 try{
  response=await fetchImpl(new URL(path,url),{method:decision==='approve'?'POST':'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{apikey,Authorization:`Bearer ${token}`,Origin:origin,'Content-Type':'application/json'},...(decision==='approve'?{body:JSON.stringify({action:'approve'})}:{})});
  data=await response.json();
 }catch{throw new AccountError('account_service_unavailable',503);}
 if(!response.ok)throw new AccountError(response.status>=500?'account_service_unavailable':'account_forbidden',response.status>=500?503:403);
 if(data?.redirect_url){
  let redirect:URL;
  try{
   redirect=new URL(data.redirect_url);
   if(redirect.origin!==expected.origin||redirect.pathname!==expected.pathname||redirect.hash||redirect.username||redirect.password||[...redirect.searchParams.keys()].some(k=>!['code','state'].includes(k))||redirect.searchParams.getAll('code').length!==1||redirect.searchParams.getAll('state').length!==1||redirect.searchParams.get('state')!==context.state||!uuid.test(redirect.searchParams.get('code')??''))throw 0;
  }catch{throw new AccountError('account_service_unavailable',503);}
  const stateHash=hex(await digest(context.state)),codeHash=hex(await digest(redirect.searchParams.get('code')!));
  // Provider success followed by storage failure deliberately returns no
  // redirect/proof. Restart the authorization; never manufacture a receipt.
  const stored=scalar(checked(await service.rpc('codevalanche_operator_oauth_store',{
   p_user_id:principal.userId,p_session_id:principal.sessionId,p_authorization_id:authorizationId,p_client_id:context.clientId,
   p_state_hash:stateHash,p_code_hash:codeHash,p_credential_stamp:context.credentialStamp??null,
  })));
  if(stored!==true)throw new AccountError('account_service_unavailable',503);
  return {operator:true,redirect_url:redirect.href};
 }
 if(decision==='approve'||typeof data?.client?.name!=='string'||typeof data?.scope!=='string')throw new AccountError('account_service_unavailable',503);
 return {operator:true,client:{name:data.client.name.slice(0,200)},scope:data.scope.slice(0,500)};
}
