// New passwords follow the same 12-character minimum as Supabase Auth (supabase/config.toml).
import { MIN_PASSWORD_LENGTH } from './helpers.js'
const origins=['https://codevalanche.com','https://www.codevalanche.com','https://account.codevalanche.com']
export const recoveryNotice=()=> 'If an account exists for this email, you will receive instructions.'
export function validateNewPassword(password) {
 if(typeof password!=='string'||Array.from(password).length<MIN_PASSWORD_LENGTH)throw new Error(`Choose a password with at least ${MIN_PASSWORD_LENGTH} characters.`)
 return password
}
export function recoveryCallback(href,{allowLoopback=false}={}) {
 const url=new URL(href)
 if(!origins.includes(url.origin)&&!(allowLoopback&&['127.0.0.1','localhost'].includes(url.hostname)))throw new Error('recovery_invalid_or_expired')
 if(url.pathname!=='/account/'||url.searchParams.get('type')!=='recovery'||!url.searchParams.get('token_hash')||url.searchParams.get('token_hash').length>4096)throw new Error('recovery_invalid_or_expired')
 return {tokenHash:url.searchParams.get('token_hash'),cleanUrl:'/account/?flow=recovery'}
}
export async function exchangeRecovery(client,tokenHash) {
 const {data,error}=await client.auth.verifyOtp({type:'recovery',token_hash:tokenHash})
 if(error||!data?.session)throw Object.assign(new Error('recovery_invalid_or_expired'),{code:'recovery_invalid_or_expired'})
 return data
}
// Invitation and email-change emails link here with ?token_hash=...&type=invite|email_change
// (supabase/templates/email-templates.mjs). The hash is verified by an explicit POST,
// never from the URL alone, and the URL is cleaned before anything else runs.
export const EMAIL_LINK_TYPES=Object.freeze(['recovery','invite','email_change'])
export function emailLinkCallback(href,{allowLoopback=false}={}) {
 const url=new URL(href),type=url.searchParams.get('type'),tokenHash=url.searchParams.get('token_hash')
 const code=type==='recovery'?'recovery_invalid_or_expired':'email_link_invalid_or_expired'
 const invalid=()=>Object.assign(new Error(code),{code})
 if(!origins.includes(url.origin)&&!(allowLoopback&&['127.0.0.1','localhost'].includes(url.hostname)))throw invalid()
 if(url.pathname!=='/account/'||!EMAIL_LINK_TYPES.includes(type)||!tokenHash||tokenHash.length>4096||url.searchParams.getAll('token_hash').length!==1||url.searchParams.getAll('type').length!==1)throw invalid()
 return {type,tokenHash,cleanUrl:type==='email_change'?'/account/':`/account/?flow=${type==='invite'?'invite':'recovery'}`}
}
// Returns 'session' when the provider answered with a session for the user it
// verified, 'pending' for the first of the two email-change confirmations (no
// session, nothing to update yet). Anything else is a generic invalid link.
export async function exchangeEmailLink(client,type,tokenHash) {
 const code=type==='recovery'?'recovery_invalid_or_expired':'email_link_invalid_or_expired'
 const invalid=()=>Object.assign(new Error(code),{code})
 if(!EMAIL_LINK_TYPES.includes(type))throw invalid()
 const {data,error}=await client.auth.verifyOtp({type,token_hash:tokenHash})
 if(error)throw invalid()
 const session=data?.session
 if(!session){ if(type==='email_change'&&!data?.user)return {state:'pending',data}; throw invalid() }
 // The SDK has already stored a returned session: flag it so the page clears it.
 if(!session.access_token||!session.user?.id||session.user.role!=='authenticated'||(data.user&&data.user.id!==session.user.id))throw Object.assign(invalid(),{stored:true})
 return {state:'session',data}
}
// Auth material or provider errors left in a fragment by an older email link:
// never adopted as a session, only reported. The caller clears the fragment first.
export function emailLinkFragment(hash) {
 const params=new URLSearchParams(String(hash||'').replace(/^#/,''))
 if(params.has('error')||params.has('error_code'))return 'invalid'
 if(params.has('access_token')||params.has('refresh_token'))return 'outdated'
 if(params.has('message'))return 'pending'
 return null
}
