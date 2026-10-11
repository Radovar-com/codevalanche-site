const origins=['https://codevalanche.com','https://www.codevalanche.com','https://account.codevalanche.com']
export const recoveryNotice=()=> 'If an account exists for this email, you will receive instructions.'
export function validateNewPassword(password) {
 if(typeof password!=='string'||Array.from(password).length<15)throw new Error('Choose a password with at least 15 characters.')
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
