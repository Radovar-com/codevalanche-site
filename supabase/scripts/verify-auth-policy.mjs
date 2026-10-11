import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const callbackOrigins=['https://codevalanche.com','https://www.codevalanche.com','https://account.codevalanche.com'];
export function validateAuthPolicy(snapshot={}) {
 const missingControls=[];
 const requireControl=(ok,name)=>{if(!ok)missingControls.push(name)};
 requireControl(snapshot.captchaEnabled===true,'provider_captcha');
 requireControl(Number.isInteger(snapshot.passwordMinLength)&&snapshot.passwordMinLength>=15,'password_minimum');
 requireControl(Number.isInteger(snapshot.recoveryExpirySeconds)&&snapshot.recoveryExpirySeconds>0&&snapshot.recoveryExpirySeconds<=900,'recovery_15_minutes');
 requireControl(snapshot.customSmtpConfigured===true,'custom_smtp_delivery');
 requireControl(snapshot.leakedPasswordProtection===true,'leaked_password_protection');
 const rates=snapshot.rateLimits;
 requireControl(rates&&['emailSent','tokenVerify','signIn'].every(k=>Number.isInteger(rates[k])&&rates[k]>0&&rates[k]<=10000),'provider_rate_limits');
 requireControl(Number.isInteger(rates?.tokenRefresh)&&rates.tokenRefresh>=150,'refresh_capacity');
 requireControl(Array.isArray(snapshot.redirectAllowlist)&&snapshot.redirectAllowlist.length>0&&snapshot.redirectAllowlist.every(value=>{try{const u=new URL(value);return callbackOrigins.includes(u.origin)&&u.pathname==='/account/'&&!u.search&&!u.hash&&!value.includes('*')}catch{return false}}),'exact_redirect_allowlist');
 requireControl(Array.isArray(snapshot.oauthClients)&&snapshot.oauthClients.length>=3&&new Set(snapshot.oauthClients).size===snapshot.oauthClients.length,'distinct_oauth_clients');
 requireControl(snapshot.trustedIngress===true,'trusted_ingress_qualification');
 return {ok:missingControls.length===0,missingControls};
}
export function publicAuthError(error={}) {
 if(error.status===429)return {code:'rate_limited',...(Number.isFinite(error.retryAfterSeconds)?{retryAfterSeconds:Math.max(1,Math.min(3600,error.retryAfterSeconds))}:{})};
 return {code:'invalid_credentials'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
 const file=process.argv[2];if(!file){console.error('Usage: verify-auth-policy.mjs SANITIZED_SNAPSHOT.json');process.exitCode=2}
 else {const result=validateAuthPolicy(JSON.parse(await readFile(file,'utf8')));console.log(JSON.stringify(result));process.exitCode=result.ok?0:1}
}
