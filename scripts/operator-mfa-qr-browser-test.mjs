// Built-site browser acceptance. All accounts, codes and QR data are synthetic.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const dist=path.resolve('dist'),svg=await readFile('scripts/fixtures/native-mfa-qr.svg','utf8');
const syntheticKey='JBSWY3DPEHPK3PXP';
const output=process.env.MFA_QR_PREVIEW_DIR||path.join(tmpdir(),'companyos-mfa-qr-preview');
await mkdir(output,{recursive:true});
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://fixture'),name=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
 const file=path.resolve(dist,'.'+name);if(!file.startsWith(dist+path.sep))throw new Error('outside_dist');
 let data=await readFile(file);
 if(name==='/config.js')data=Buffer.from(data+'\nwindow.CODEVALANCHE_CONFIG.supabasePublishableKey="fixture-public";window.CODEVALANCHE_ANALYTICS={enabled:false,baseUrl:""};');
 res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':name.endsWith('.svg')?'image/svg+xml':'text/html');res.end(data);
 }catch{res.writeHead(404);res.end();}}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});
const errors=[];
try{
 for(const [label,viewport,colorScheme,locale] of [['desktop-light',{width:1280,height:1000},'light','en'],['desktop-dark',{width:1280,height:1000},'dark','en'],['mobile-ro',{width:390,height:844},'dark','ro']]){
  const context=await browser.newContext({viewport,colorScheme,reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(5000);page.on('pageerror',e=>errors.push(e.message));
  let counter=0,factors=[{id:'old-pending',factor_type:'totp',status:'unverified',friendly_name:'Codevalanche authenticator'}];const removed=[];
  const user=()=>({id:'11111111-1111-4111-8111-111111111111',email:'demo@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{display_name:'Preview'},identities:[{provider:'email'}],factors});
  const session={access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:user()};
  await context.addCookies([{name:'codevalanche_language',value:locale,url:origin}]);
  await context.addInitScript(value=>localStorage.setItem('sb-hvevaxsfeyiikjhcsafi-auth-token',JSON.stringify(value)),session);
  await context.route('**/*',async route=>{
   const request=route.request(),url=new URL(request.url());if(url.origin===origin)return route.continue();
   if(url.hostname!=='hvevaxsfeyiikjhcsafi.supabase.co')return route.abort();
   const body=request.postData()?request.postDataJSON():{};
   let data={},status=200;
   if(url.pathname.endsWith('/user'))data=user();
   else if(url.pathname.includes('/functions/'))data=body.action==='operator.oauth.details'?{apiVersion:2,ok:true,requestId:body.requestId,data:{operator:true,parentMfaRequired:true}}:{user:{displayName:'Preview',bio:''},sessions:[],deletion:null};
   else if(url.pathname.endsWith('/factors')&&request.method()==='POST'){const id='new-pending-'+(++counter);factors.push({id,factor_type:'totp',status:'unverified',friendly_name:body.friendly_name});data={id,type:'totp',totp:{secret:syntheticKey,qr_code:svg}};}
   else if(request.method()==='DELETE'&&url.pathname.includes('/factors/')){const id=url.pathname.split('/').at(-1);removed.push(id);factors=factors.filter(x=>x.id!==id);data={id};}
   await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(origin+'/account/authorize/?authorization_id=synthetic-preview');
  await page.getByRole('button',{name:locale==='ro'?'Refuză':'Decline',exact:true}).click();
  await page.locator('#authenticator-add').click();await page.locator('#authenticator-qr').waitFor({state:'visible',timeout:5000});
  await page.locator('#authenticator-qr').evaluate(image=>image.decode());
  assert.equal(await page.locator('#authenticator-secret').isVisible(),false);
  assert.equal(await page.locator('#authenticator-manual').getAttribute('open'),null);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,label+': no horizontal overflow');
  assert.ok(removed.includes('old-pending'),'explicit fresh setup invalidates the unfinished old factor');
  if(locale==='ro'){assert.equal(await page.locator('#native-mfa-title').textContent(),'Adaugă un cod de securitate');assert.match(await page.locator('#authenticator-setup').innerText(),/Scanează codul QR/);}
  await page.screenshot({path:path.join(output,label+'.png'),fullPage:true});
  await page.locator('#authenticator-restart').click();await page.waitForFunction(()=>document.getElementById('mfa-factor-id').value==='new-pending-2');
  assert.ok(removed.includes('new-pending-1'),'restart invalidates its predecessor');
  await page.locator('#authenticator-manual summary').click();assert.equal(await page.locator('#authenticator-secret').textContent(),syntheticKey);
  await page.locator('#mfa-code').fill('123456');await page.locator('#mfa-cancel').click();await page.waitForFunction(()=>!document.getElementById('authenticator-add').disabled);
  assert.equal(await page.locator('#authenticator-qr').getAttribute('src'),null);assert.equal(await page.locator('#authenticator-secret').textContent(),'');assert.equal(await page.locator('#mfa-code').inputValue(),'');assert.ok(removed.includes('new-pending-2'));
  await context.close();
 }
 assert.deepEqual(errors,[]);console.log('PASS built operator QR: decoded provider image, light/dark/mobile Romanian, no overflow, private manual alternative, scoped restart and cancellation; all synthetic');
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
