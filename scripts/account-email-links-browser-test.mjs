// Browser check of the invitation and email-change links against a mocked
// Supabase (no provider, no email): token-hash links are verified by POST, the
// URL is cleaned, fragments from older links are never adopted as a session.
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'
const server=createServer(async(req,res)=>{try { let name=new URL(req.url,'http://localhost').pathname; if(name.endsWith('/'))name+='index.html'; const data=await readFile(path.join(process.cwd(),'dist',name)); res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':name.endsWith('.json')?'application/json':'text/html');res.end(data) }catch{res.statusCode=404;res.end()}}).listen(0,'127.0.0.1')
await new Promise(r=>server.once('listening',r))
const origin=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({headless:true})
const now=()=>new Date().toISOString()
const person=(id,email)=>({id,aud:'authenticated',role:'authenticated',email,email_confirmed_at:now(),user_metadata:{},app_metadata:{provider:'email'},identities:[{provider:'email'}],created_at:now()})
const invited=person('22222222-2222-4222-8222-222222222222','invited@example.test')
const changed=person('33333333-3333-4333-8333-333333333333','new@example.test')
const session=user=>({access_token:`access-${user.id}`,refresh_token:'refresh-test',token_type:'bearer',expires_in:3600,user})
async function open(href,verify,current=changed){
  const page=await browser.newPage(), errors=[], calls=[]
  page.on('pageerror',e=>errors.push(e.message))
  await page.route('https://hvevaxsfeyiikjhcsafi.supabase.co/**',async route=>{
    const request=route.request(), url=new URL(request.url()), body=request.postDataJSON?.() ?? null
    calls.push({method:request.method(),path:url.pathname,body})
    let status=200, answer={}
    if(url.pathname==='/auth/v1/verify')[status,answer]=verify(body)
    else if(url.pathname==='/auth/v1/user'&&request.method()==='PUT')answer={...current,...(body?.email?{new_email:body.email}:{})}
    else if(url.pathname==='/auth/v1/user')answer=current
    else if(url.pathname==='/auth/v1/logout'){status=204;answer=null}
    else if(url.pathname.startsWith('/functions/'))answer={user:{displayName:'',bio:''},sessions:[{current:true,createdAt:now()}],deletion:null}
    await route.fulfill({status,contentType:'application/json',body:answer===null?'':JSON.stringify(answer)})
  })
  await page.goto(origin+href)
  return {page,errors,calls}
}
const stored=page=>page.evaluate(()=>Object.keys(localStorage).filter(key=>/^sb-.*-auth-token$/.test(key)&&localStorage.getItem(key)))
try {
  // 1. Invitation: verified by POST, URL cleaned, the invited user sets a first password.
  let t=await open('/account/?token_hash=invite-hash&type=invite',()=>[200,session(invited)],invited)
  await t.page.getByRole('heading',{name:'Set your password',exact:true}).waitFor()
  assert.equal(new URL(t.page.url()).search,'?flow=invite')
  assert.deepEqual(t.calls.find(c=>c.path==='/auth/v1/verify').body,{type:'invite',token_hash:'invite-hash',gotrue_meta_security:{}})
  await t.page.getByLabel('Password',{exact:true}).fill('a-new-password-123')
  await t.page.getByRole('button',{name:'Save password',exact:true}).click()
  await t.page.getByText('Your account is ready. Sign in with your new password.',{exact:true}).waitFor()
  await t.page.getByRole('heading',{name:'Sign in',exact:true}).waitFor()
  assert.equal(t.calls.find(c=>c.path==='/auth/v1/user'&&c.method==='PUT').body.password,'a-new-password-123')
  assert.deepEqual(await stored(t.page),[])
  assert.deepEqual(t.errors,[]); await t.page.close()

  // 2. First email-change confirmation: no session, nothing stored, guidance only.
  t=await open('/account/?token_hash=current-hash&type=email_change',()=>[200,{msg:'Confirmation link accepted. Please proceed to confirm link sent to the other email',code:200}])
  await t.page.getByText('Confirmed. Now open the link sent to your other email address to finish the change.',{exact:true}).waitFor()
  assert.equal(new URL(t.page.url()).pathname+new URL(t.page.url()).search,'/account/')
  await t.page.getByRole('heading',{name:'Sign in',exact:true}).waitFor()
  assert.deepEqual(await stored(t.page),[])
  assert.deepEqual(t.errors,[]); await t.page.close()

  // 3. Second confirmation: session for the verified user at the new address.
  t=await open('/account/?token_hash=new-hash&type=email_change',()=>[200,session(changed)])
  await t.page.getByRole('heading',{name:'Your account',exact:true}).waitFor()
  await t.page.getByText('Your email address is updated.',{exact:true}).waitFor()
  assert.equal(await t.page.locator('#profile-email').textContent(),'new@example.test')
  assert.equal(new URL(t.page.url()).search,'')
  // 4. The account page starts the next secure change; both addresses get a link.
  // The row shows the current address; the change action appears only once it differs.
  assert.equal(await t.page.getByLabel('Email address',{exact:true}).inputValue(),'new@example.test')
  assert.equal(await t.page.getByRole('button',{name:'Change email',exact:true}).isVisible(),false)
  await t.page.getByLabel('Email address',{exact:true}).fill('later@example.test')
  await t.page.getByRole('button',{name:'Change email',exact:true}).click()
  await t.page.getByText('Check both inboxes. Open the link sent to your current address and the one sent to the new address to finish the change.',{exact:true}).waitFor()
  const update=t.calls.filter(c=>c.path==='/auth/v1/user'&&c.method==='PUT')
  assert.equal(update.length,1); assert.equal(update[0].body.email,'later@example.test')
  await t.page.setViewportSize({width:390,height:844}); assert.equal(await t.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  assert.deepEqual(t.errors,[]); await t.page.close()

  // 5. An expired or reused link: generic message, nothing stored.
  t=await open('/account/?token_hash=spent&type=invite',()=>[403,{code:'otp_expired',error_code:'otp_expired',msg:'Token has expired or is invalid'}])
  await t.page.getByText('This email link is invalid or expired. Request a new link.',{exact:true}).waitFor()
  assert.equal(new URL(t.page.url()).search,'?flow=invite'); assert.deepEqual(await stored(t.page),[])
  await t.page.getByRole('heading',{name:'Sign in',exact:true}).waitFor()
  assert.deepEqual(t.errors,[]); await t.page.close()

  // 6. A provider session for a non-user role is refused and cleared.
  t=await open('/account/?token_hash=odd&type=invite',()=>[200,session({...invited,role:'service_role'})])
  await t.page.getByText('This email link is invalid or expired. Request a new link.',{exact:true}).waitFor()
  await t.page.waitForFunction(()=>!Object.keys(localStorage).some(key=>/^sb-.*-auth-token$/.test(key)&&localStorage.getItem(key)))
  assert.deepEqual(t.errors,[]); await t.page.close()

  // 7. Fragments from older links are cleared and never adopted.
  for(const [hash,text] of [['#access_token=fragment-access&refresh_token=fragment-refresh&type=invite','This email link is no longer supported. Request a new link.'],['#error=access_denied&error_code=otp_expired&error_description=expired','This email link is invalid or expired. Request a new link.'],['#message=Confirmation+link+accepted&sb=','Confirmed. Now open the link sent to your other email address to finish the change.']]){
    t=await open('/account/'+hash,()=>[500,{}])
    await t.page.getByText(text,{exact:true}).waitFor()
    assert.equal(new URL(t.page.url()).hash,''); assert.deepEqual(await stored(t.page),[])
    assert.equal(t.calls.some(c=>JSON.stringify(c).includes('fragment-')),false)
    assert.equal(t.calls.some(c=>c.path==='/auth/v1/verify'),false)
    assert.deepEqual(t.errors,[]); await t.page.close()
  }
  console.log('PASS browser mock: invitation sets a first password, two-step email change (pending and complete), change form, expired and odd links refused, older fragments cleared and never adopted; no page errors')
} finally { await browser.close(); server.close() }
