import {chromium} from 'playwright'
import {createServer} from 'node:http'
import {readFile, mkdir} from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

// Every external request is intercepted; only the built local site is served.
const server=createServer(async(req,res)=>{
 try {
  let name=new URL(req.url,'http://localhost').pathname
  if(name.endsWith('/'))name+='index.html'
  const data=await readFile(path.join(process.cwd(),'dist',name))
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':'text/html')
  res.end(data)
 }catch{res.statusCode=404;res.end()}
}).listen(0,'127.0.0.1')
await new Promise(r=>server.once('listening',r))
const origin=`http://127.0.0.1:${server.address().port}`
const browser=await chromium.launch({headless:true})
const before=process.env.CODEVALANCHE_EXPORT_CAPTURE==='before'
const output=process.env.CODEVALANCHE_ACCOUNT_TEST_OUTPUT
const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'account@example.test',email_confirmed_at:'2026-10-01T00:00:00Z',identities:[{provider:'email'}],user_metadata:{},app_metadata:{provider:'email'}}
const exported={schemaVersion:1,exportedAt:'2026-10-25T12:00:00.000Z',account:{id:user.id,email:user.email},profile:{display_name:'Example account',bio:''},sessions:[],securityEvents:[],profileRequests:[],deletionRequests:[],feedback:[]}
try {
 if(output)await mkdir(output,{recursive:true})
 for(const locale of ['en','ar'])for(const width of [1280,390])for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:theme,acceptDownloads:true})
  const page=await context.newPage(),errors=[],calls=[]
  page.on('pageerror',e=>errors.push(e.message))
  let capability=true,fail=0,hold=false,release,wrongOwner=false
  await page.addInitScript(({user,theme})=>{
   localStorage.setItem('codevalanche_theme',theme)
   localStorage.setItem('sb-hvevaxsfeyiikjhcsafi-auth-token',JSON.stringify({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_at:Math.floor(Date.now()/1000)+3600,user,token_type:'bearer'}))
  },{user,theme})
  await context.route('**/*',async route=>{
   const url=route.request().url()
   if(url.startsWith(origin))return route.continue()
   if(url.includes('/functions/v1/codevalanche-account')){
    const call=route.request().postDataJSON();calls.push(call)
    if(call.action==='export-account'){
     if(hold)await new Promise(r=>release=r)
     return route.fulfill({status:fail||200,json:fail?{code:fail===429?'rate_limited':'account_service_unavailable'}:wrongOwner?{...exported,account:{id:'33333333-3333-4333-8333-333333333333'}}:exported})
    }
    return route.fulfill({json:{user:{id:user.id,displayName:'Example account',bio:''},sessions:[{id:'22222222-2222-4222-8222-222222222222',current:true,userAgent:'Mozilla/5.0 Chrome/130 Windows NT 10.0',createdAt:'2026-10-01T00:00:00Z'}],deletion:null,...(capability?{dataExport:{schemaVersion:1,cooldownSeconds:300}}:{})}})
   }
   if(url.includes('/auth/v1/user'))return route.fulfill({json:user})
   if(url.includes('/auth/v1/settings'))return route.fulfill({json:{external:{google:false}}})
   if(url.includes('/auth/v1/logout'))return route.fulfill({status:204,body:''})
   return route.abort()
  })
  await context.addCookies([{name:'codevalanche_language',value:locale,url:origin}])
  const accountUrl=`${origin}/account/`
  await page.goto(accountUrl)
  await page.locator('#profile').waitFor({state:'visible'})
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true)
  await page.locator('[data-owned-consent] .cmp-actions button').nth(1).click()
  if(output)await page.screenshot({path:path.join(output,`${before?'before':'after'}-${locale}-${width===390?'phone':'desktop'}-${theme}.png`),fullPage:true})
  if(!before){
   const button=page.getByRole('button',{name:locale==='ar'?'تنزيل بياناتي':'Download my data',exact:true})
   await button.waitFor()
   if(locale==='ar'){
    assert.equal(await page.locator('html').getAttribute('dir'),'rtl')
    await page.getByText('نزّل نسخة من بيانات حسابك بصيغة JSON.',{exact:true}).waitFor()
    assert.equal(await page.locator('#export-row').getByText('Download my data',{exact:true}).count(),0)
   }
   const downloadPromise=page.waitForEvent('download')
   await button.click()
   const download=await downloadPromise
   assert.equal(download.suggestedFilename(),'codevalanche-account-data-2026-10-25.json')
   assert.deepEqual(JSON.parse(await readFile(await download.path(),'utf8')),exported)
   assert.equal(await button.isVisible(),false)
   assert.equal(calls.filter(c=>c.action==='export-account').length,1)
   // Cooldown and absent server capability keep the action out of view.
   capability=false;await page.reload();await page.locator('#profile').waitFor({state:'visible'});assert.equal(await page.locator('#export-data').isVisible(),false)
   // Fresh page/session: server rate refusal never triggers a file download.
   capability=true;await page.reload();await button.waitFor();fail=429
   let downloads=0;page.on('download',()=>downloads++)
   await button.click();await page.locator('#status[data-error="true"]').waitFor();assert.equal(downloads,0);assert.equal(await button.isVisible(),false)
   fail=0;await page.reload();await button.waitFor();hold=true
   const pending=page.waitForRequest(req=>req.postData()?.includes('export-account'))
   await button.click();await pending;assert.equal(await button.isVisible(),false)
   release();await page.getByText(locale==='ar'?'تم تنزيل ملف بياناتك.':'Your data file has been downloaded.',{exact:true}).waitFor()
   if(locale==='en' && width===1280 && theme==='light'){
    hold=false;fail=503;await page.reload();await button.waitFor();downloads=0
    await button.click();await page.locator('#account-state').waitFor({state:'visible'});assert.equal(downloads,0)
    assert.ok(await page.evaluate(()=>localStorage.getItem('sb-hvevaxsfeyiikjhcsafi-auth-token')))
    fail=0;wrongOwner=true;await page.reload();await button.waitFor()
    await button.click();await page.locator('#account-state').waitFor({state:'visible'});assert.equal(downloads,0)
    wrongOwner=false;hold=true;await page.reload();await button.waitFor()
    const requested=page.waitForRequest(req=>req.postData()?.includes('export-account'))
    await button.click();await requested
    await page.evaluate(()=>{localStorage.setItem('codevalanche-account-logout-intent','complete');window.dispatchEvent(new StorageEvent('storage',{key:'codevalanche-account-logout-intent',newValue:'complete'}))})
    await page.locator('#auth').waitFor({state:'visible'})
    const response=page.waitForResponse(r=>r.request().postData()?.includes('export-account'))
    release();await (await response).finished();await page.evaluate(()=>new Promise(requestAnimationFrame))
    assert.equal(downloads,0);assert.equal(await button.isVisible(),false)
   }
  }
  assert.deepEqual(errors,[])
  await context.close()
 }
 console.log(before?'PASS before screenshots: desktop/phone, light/dark, English/Arabic':'PASS local build: JSON download, dated filename, capability, busy/cooldown, rate refusal, server/malformed failure, late logout response, Arabic RTL, desktop/phone, light/dark')
}catch(error){
 for(const context of browser.contexts())for(const page of context.pages())console.error('Export browser failure:',await page.locator('#status').textContent(),await page.locator('#account-state').textContent(),await page.locator('#profile').isVisible(),await page.locator('#auth').isVisible())
 throw error
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r))}
