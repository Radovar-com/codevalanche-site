import test from 'node:test';import assert from 'node:assert/strict';
import {recoveryCallback,exchangeRecovery,validateNewPassword,recoveryNotice,emailLinkCallback,exchangeEmailLink,emailLinkFragment} from '../src/account/recovery.js';
test('recovery callback permits exact hosted route and clears tokens without external redirect',()=>{const result=recoveryCallback('https://codevalanche.com/account/?token_hash=opaque&type=recovery&redirect_to=https://evil.test');assert.equal(result.tokenHash,'opaque');assert.equal(result.cleanUrl,'/account/?flow=recovery');assert.throws(()=>recoveryCallback('https://evil.test/account/?token_hash=x&type=recovery'),/recovery_invalid_or_expired/)});
test('exchange is provider recovery OTP, expired or reused tokens become generic error',async()=>{let options;const client={auth:{verifyOtp:async o=>{options=o;return {data:{session:{user:{id:'test'}}},error:null}}}};assert.ok((await exchangeRecovery(client,'opaque')).session);assert.deepEqual(options,{type:'recovery',token_hash:'opaque'});client.auth.verifyOtp=async()=>({error:{message:'private account details'}});await assert.rejects(()=>exchangeRecovery(client,'spent'),/recovery_invalid_or_expired/)});
test('new passwords preserve Unicode and reject less than twelve characters without truncation',()=>{assert.throws(()=>validateNewPassword('elevenchars'),/12/);assert.equal(validateNewPassword('🔒'.repeat(12)),'🔒'.repeat(12));assert.throws(()=>validateNewPassword('🔒'.repeat(11)),/12/);assert.equal(validateNewPassword('x'.repeat(1000)),'x'.repeat(1000))});
test('reset notice reveals no account existence',()=>assert.equal(recoveryNotice(true),recoveryNotice(false)));
test('email links accept only exact account-page token hashes for recovery, invite and email change',()=>{
 for(const [type,clean] of [['recovery','/account/?flow=recovery'],['invite','/account/?flow=invite'],['email_change','/account/']]){const r=emailLinkCallback(`https://codevalanche.com/account/?token_hash=opaque&type=${type}`);assert.deepEqual(r,{type,tokenHash:'opaque',cleanUrl:clean})}
 assert.equal(emailLinkCallback('http://127.0.0.1:4197/account/?token_hash=x&type=invite',{allowLoopback:true}).type,'invite')
 for(const href of ['https://evil.test/account/?token_hash=x&type=invite','http://127.0.0.1:4197/account/?token_hash=x&type=invite','https://codevalanche.com/other/?token_hash=x&type=invite','https://codevalanche.com/account/?token_hash=x&type=signup','https://codevalanche.com/account/?token_hash=x&type=magiclink','https://codevalanche.com/account/?type=invite','https://codevalanche.com/account/?token_hash=a&token_hash=b&type=invite','https://codevalanche.com/account/?token_hash=a&type=invite&type=recovery',`https://codevalanche.com/account/?token_hash=${'x'.repeat(4097)}&type=invite`])assert.throws(()=>emailLinkCallback(href),e=>['email_link_invalid_or_expired','recovery_invalid_or_expired'].includes(e.code),href)
});
test('email link exchange: session only for the verified user, pending email change has no session, errors are generic',async()=>{
 const user={id:'u1',role:'authenticated'},session={access_token:'a',user}
 const client=answer=>({auth:{verifyOtp:async o=>{client.last=o;return answer}}})
 let c=client({data:{session,user},error:null});assert.equal((await exchangeEmailLink(c,'invite','h')).state,'session');assert.deepEqual(client.last,{type:'invite',token_hash:'h'})
 c=client({data:{session:null,user:null},error:null});assert.equal((await exchangeEmailLink(c,'email_change','h')).state,'pending')
 await assert.rejects(()=>exchangeEmailLink(client({data:{session:null,user:null},error:null}),'invite','h'),e=>e.code==='email_link_invalid_or_expired'&&!e.stored)
 await assert.rejects(()=>exchangeEmailLink(client({data:{session:null,user},error:null}),'email_change','h'),e=>e.code==='email_link_invalid_or_expired')
 await assert.rejects(()=>exchangeEmailLink(client({data:{session,user:{id:'other'}},error:null}),'email_change','h'),e=>e.code==='email_link_invalid_or_expired'&&e.stored===true)
 await assert.rejects(()=>exchangeEmailLink(client({data:{session:{access_token:'a',user:{id:'u1',role:'service_role'}},user:null},error:null}),'invite','h'),e=>e.stored===true)
 await assert.rejects(()=>exchangeEmailLink(client({data:{user:null,session:null},error:{message:'private details'}}),'email_change','h'),e=>e.code==='email_link_invalid_or_expired'&&!/private/.test(e.message))
 await assert.rejects(()=>exchangeEmailLink(client({data:{session,user},error:null}),'signup','h'),e=>e.code==='email_link_invalid_or_expired')
 await assert.rejects(()=>exchangeEmailLink(client({data:{user:null,session:null},error:{message:'x'}}),'recovery','h'),e=>e.code==='recovery_invalid_or_expired')
});
test('fragments from older links are classified, never adopted',()=>{
 assert.equal(emailLinkFragment('#access_token=a&refresh_token=b&type=invite'),'outdated')
 assert.equal(emailLinkFragment('#message=Confirmation+link+accepted&sb='),'pending')
 assert.equal(emailLinkFragment('#error=access_denied&error_code=otp_expired'),'invalid')
 assert.equal(emailLinkFragment(''),null);assert.equal(emailLinkFragment('#section'),null)
});
