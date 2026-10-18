// Independent legacy guards: no staged schema, membership or analytics RPCs.
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const primaryMethods=new Set(['password','oauth','sso/saml']);
const recoveryMethods=new Set(['otp','recovery','magiclink','invite','signup']);
const adminActions=new Set(['admin-list-users','admin-block-user','admin-unblock-user','admin-feedback','admin-analytics']);
const noFields=new Set(['get-account','sign-out-current','sign-out-others','cancel-deletion','admin-feedback','admin-analytics']);
const controls=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const singleLineControls=/[\u0000-\u001f\u007f-\u009f]/;
const text=(value,max,singleLine=false)=>typeof value==='string'&&value.length<=max&&!(singleLine?singleLineControls:controls).test(value);

// Decoding supplies claims only AFTER getUser verifies the exact signed token.
export function validateLegacyClaims(claims,userId,issuer,now=Date.now()) {
 const audience=claims?.aud;
 const validAudience=audience==='authenticated'||(Array.isArray(audience)&&audience.every(value=>typeof value==='string')&&audience.includes('authenticated'));
 return Boolean(claims&&uuid.test(userId||'')&&claims.sub===userId&&uuid.test(claims.session_id||'')
  &&claims.iss===issuer&&validAudience&&claims.role==='authenticated'
  &&Number.isFinite(claims.exp)&&claims.exp>now/1000
  &&(claims.token_use===undefined||claims.token_use==='access')
  &&(claims.nbf===undefined||(Number.isFinite(claims.nbf)&&claims.nbf<=now/1000)));
}

export function validateLegacyRequest(body) {
 const invalid=error=>({status:400,body:{error}});
 if(!body||typeof body!=='object'||Array.isArray(body))return invalid('Invalid body');
 const action=body.action;
 if(typeof action!=='string'||action.length>64)return invalid('Unknown action');
 if(noFields.has(action))return null;
 switch(action){
  case 'update-profile':
   if((body.displayName!==undefined&&!text(body.displayName,80,true))||(body.bio!==undefined&&!text(body.bio,500)))return invalid('Invalid profile');break;
  case 'revoke-session': if(typeof body.sessionId!=='string'||!uuid.test(body.sessionId))return {status:404,body:{error:'Session not found'}};break;
  case 'request-deletion': if(body.confirmation!==undefined&&!text(body.confirmation,32,true))return invalid('Type DELETE to confirm');break;
  case 'consent': if(typeof body.analytics!=='boolean')return invalid('Invalid consent');break;
  case 'feedback': if(!['bug','idea','general'].includes(body.category)||!text(body.message,4000)||!body.message.trim())return invalid('Invalid feedback');break;
  case 'event': if(typeof body.eventId!=='string'||!uuid.test(body.eventId)||!['website_view','download_clicked','app_opened'].includes(body.eventName)||!['web','windows','macos','linux','ios','android'].includes(body.platform)||(body.consent!==undefined&&typeof body.consent!=='boolean'))return invalid('Invalid event');break;
  case 'admin-list-users': if(body.page!==undefined&&(!Number.isInteger(body.page)||body.page<1||body.page>10000))return invalid('Invalid page');break;
  case 'admin-block-user': case 'admin-unblock-user': if(typeof body.userId!=='string'||!uuid.test(body.userId))return invalid('Invalid target user');break;
 }
 // Extra client fields retain their historical ignored semantics.
 return null;
}

export function legacyActionRefusal(user,claims,action,now=Date.now()) {
 const seconds=now/1000;
 const amr=Array.isArray(claims?.amr)?claims.amr:[];
 const valid=entry=>entry&&Number.isFinite(entry.timestamp)&&entry.timestamp>0&&entry.timestamp<=seconds;
 const primary=amr.filter(entry=>valid(entry)&&primaryMethods.has(entry.method));
 const recoveryOnly=!primary.length&&amr.some(entry=>entry&&recoveryMethods.has(entry.method));
 if(recoveryOnly&&!['get-account','sign-out-current'].includes(action))return {status:403,body:{error:'recovery_restricted',code:'recovery_restricted'}};
 const recent=entries=>entries.some(entry=>seconds-entry.timestamp<=300);
 const verifiedFactors=Array.isArray(user?.factors)?user.factors.filter(factor=>factor?.factor_type==='totp'&&factor.status==='verified'):[];
 const verifiedTotp=verifiedFactors.length>0;
 const requireMfa=()=>{
  if(!verifiedTotp||claims.aal!=='aal2')return {status:401,body:{error:'MFA required',code:'mfa_required',mfaRequired:true}};
  // GoTrue may update updated_at during ordinary verification, after the
  // token's whole-second AMR. It is not a credential-change stamp. Stable
  // creation times fence replacement factors; in-place secret changes require
  // the explicit credential-stamp model of the separately staged backend.
  const factorTimes=verifiedFactors.map(factor=>typeof factor.created_at==='string'?Date.parse(factor.created_at):NaN);
  const contextValid=factorTimes.every(value=>Number.isFinite(value)&&value>0&&value<=now);
  const mfa=amr.filter(entry=>valid(entry)&&entry.method==='totp');
  if(!contextValid||!mfa.some(entry=>seconds-entry.timestamp<=300&&entry.timestamp*1000>Math.max(...factorTimes)))return {status:401,body:{error:'reauthentication_required',code:'reauthentication_required'}};
  return null;
 };
 if(adminActions.has(action)){
  // app_metadata is controlled by Auth administrators, never profile input.
  if(user?.app_metadata?.codevalanche_admin!==true)return {status:403,body:{error:'Administrator required'}};
  if(!primary.length)return {status:401,body:{error:'reauthentication_required',code:'reauthentication_required'}};
  return requireMfa();
 }
 if(['request-deletion','cancel-deletion'].includes(action)){
  if(!primary.length)return {status:401,body:{error:'reauthentication_required',code:'reauthentication_required'}};
  if(verifiedTotp)return requireMfa();
  if(!recent(primary))return {status:401,body:{error:'reauthentication_required',code:'reauthentication_required'}};
 }
 return null;
}
