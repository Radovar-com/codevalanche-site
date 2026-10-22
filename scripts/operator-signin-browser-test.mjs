// Built-site acceptance of the Company OS connection card in every state, desktop and phone.
// All accounts, tokens, codes and QR data are synthetic; Supabase is answered by route fixtures.
// OPERATOR_SIGNIN_DIST picks another build (a "before" capture), OPERATOR_SIGNIN_CAPTURE_ONLY=1
// takes the screenshots without the assertions, OPERATOR_SIGNIN_PREVIEW_DIR is where they go.
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const dist=path.resolve(process.env.OPERATOR_SIGNIN_DIST||'dist'),captureOnly=process.env.OPERATOR_SIGNIN_CAPTURE_ONLY==='1';
const output=process.env.OPERATOR_SIGNIN_PREVIEW_DIR||path.join(tmpdir(),'companyos-signin-preview');
const svg=await readFile('scripts/fixtures/native-mfa-qr.svg','utf8');
await mkdir(output,{recursive:true});
const USER='11111111-1111-4111-8111-111111111111';
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
const token=aal=>`${b64({alg:'HS256',typ:'JWT'})}.${b64({sub:USER,aal,role:'authenticated',session_id:'22222222-2222-4222-8222-222222222222',exp:Math.floor(Date.now()/1000)+3600})}.c3ludGhldGlj`;
const verified=[{id:'fixture-factor',factor_type:'totp',status:'verified',friendly_name:'Codevalanche authenticator'}];
const fail=(status,code)=>({status,body:{apiVersion:2,ok:false,error:{code}}});
const SCENARIOS=[
 {name:'sign-in',session:null},
 {name:'security-code',session:{aal:'aal1',factors:verified}},
 {name:'add-code',session:{aal:'aal1',factors:[]},details:{operator:true,parentMfaRequired:true}},
 {name:'enter-code',session:{aal:'aal2',factors:verified},details:{operator:true,parentMfaRequired:true}},
 {name:'consent',session:{aal:'aal2',factors:verified},details:{operator:true,client:{name:'Company OS'},scope:'openid email profile'}},
 {name:'sign-in-again',session:{aal:'aal2',factors:verified},details:fail(401,'reauthentication_required')},
 {name:'expired',session:{aal:'aal2',factors:verified},details:fail(400,'authorization_not_found')},
 {name:'not-admin',session:{aal:'aal2',factors:verified},details:fail(403,'account_forbidden')},
];
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://fixture');
 if(url.pathname==='/companyos-callback-fixture'){res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>callback</title>');}
 const name=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname,file=path.resolve(dist,'.'+name);
 if(!file.startsWith(dist+path.sep))throw new Error('outside_dist');
 let data=await readFile(file);
 if(name==='/config.js')data=Buffer.from(data+'\nwindow.CODEVALANCHE_CONFIG.supabasePublishableKey="fixture-public";window.CODEVALANCHE_ANALYTICS={enabled:false,baseUrl:""};');
 res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.json')?'application/json':name.endsWith('.svg')?'image/svg+xml':'text/html');res.end(data);
}catch{res.writeHead(404);res.end();}}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true}),errors=[];
const visiblePrimaries=page=>page.evaluate(()=>[...document.querySelectorAll('#stage .cr-btn-primary')].filter(b=>b.offsetParent!==null).map(b=>b.id||b.textContent.trim()));
const currentStep=page=>page.evaluate(()=>{const s=document.getElementById('operator-steps');return s&&!s.hidden?Number(s.querySelector('[aria-current=step]')?.dataset.step):0});
const statusText=page=>page.evaluate(()=>document.getElementById('status').textContent);
try{
 for(const [label,viewport,locale] of [['desktop',{width:1280,height:900},'en'],['mobile',{width:390,height:844},'ro']]){
  for(const scenario of SCENARIOS){
   const context=await browser.newContext({viewport,colorScheme:'dark',reducedMotion:'reduce'}),page=await context.newPage();page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(`${scenario.name}: ${e.message}`));
   const calls=[];
   const user=()=>({id:USER,email:'demo@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{display_name:'Preview'},identities:[{provider:'email'}],factors:scenario.session?.factors||[]});
   await context.addCookies([{name:'codevalanche_language',value:locale,url:origin}]);
   if(scenario.session)await context.addInitScript(value=>localStorage.setItem('sb-hvevaxsfeyiikjhcsafi-auth-token',JSON.stringify(value)),{access_token:token(scenario.session.aal),refresh_token:'fixture-refresh',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:user()});
   await context.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());if(url.origin===origin)return route.continue();
    if(url.hostname!=='hvevaxsfeyiikjhcsafi.supabase.co')return route.abort();
    const body=request.postData()?request.postDataJSON():{};let data={},status=200;
    if(url.pathname.endsWith('/user'))data=user();
    else if(url.pathname.endsWith('/settings'))data={external:{google:true}};
    else if(url.pathname.includes('/functions/')){
     calls.push(body.action);
     if(body.action==='operator.oauth.details'){const d=scenario.details;if(d?.status){status=d.status;data=d.body}else data={apiVersion:2,ok:true,requestId:body.requestId,data:d}}
     else if(body.action==='operator.oauth.approve')data={apiVersion:2,ok:true,requestId:body.requestId,data:{redirect_url:origin+'/companyos-callback-fixture'}};
     else data={user:{displayName:'Preview',bio:''},sessions:[],deletion:null};
    }
    else if(url.pathname.endsWith('/factors')&&request.method()==='POST')data={id:'new-pending',type:'totp',totp:{secret:'JBSWY3DPEHPK3PXP',qr_code:svg}};
    else if(url.pathname.endsWith('/logout'))status=204;
    await route.fulfill({status,contentType:'application/json',body:status===204?'':JSON.stringify(data)});
   });
   await page.goto(origin+'/account/authorize/?authorization_id=synthetic-preview');
   const decline=page.getByRole('button',{name:locale==='ro'?'Refuză':'Decline',exact:true});
   await decline.click({timeout:4000}).catch(()=>{});
   const ready={'sign-in':'#auth','security-code':'#mfa-challenge','add-code':'#authenticator-add','enter-code':'#mfa-step-up','consent':'#consent','sign-in-again':'#operator-reauth','expired':'#operator-failure','not-admin':'#operator-failure'}[scenario.name];
   if(captureOnly)await page.waitForTimeout(2500);else await page.locator(ready).waitFor({state:'visible'});
   const shot=name=>page.screenshot({path:path.join(output,`${label}-${name}.png`),fullPage:true});
   await shot(scenario.name);
   if(!captureOnly){
    const ro=locale==='ro',where=`${label} ${scenario.name}`;
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,where+': no horizontal overflow');
    assert.notEqual(await page.evaluate(()=>getComputedStyle(document.getElementById('status')).position),'fixed',where+': messages stay inside the card');
    assert.doesNotMatch(await page.locator('#stage').innerText(),/[{}]|openid|_required|_forbidden/,where+': no JSON, scopes or codes on screen');
    const primaries=await visiblePrimaries(page);
    if(scenario.name==='sign-in'){assert.equal(await currentStep(page),1);assert.deepEqual(primaries,['auth-submit']);assert.equal(await page.locator('#auth-description').textContent(),ro?'Intră în contul tău Codevalanche ca să-l conectezi.':'Sign in with your Codevalanche account to connect it.');}
    if(scenario.name==='security-code'){assert.equal(await currentStep(page),2);assert.equal(primaries.length,1);}
    if(scenario.name==='add-code'){
     assert.equal(await currentStep(page),2);assert.deepEqual(primaries,['authenticator-add']);assert.equal(await page.locator('#native-mfa-title').textContent(),ro?'Adaugă un cod de securitate':'Add a security code');
     assert.equal(await page.locator('#consent').isVisible(),false);assert.equal(await statusText(page),'');
     await page.locator('#authenticator-add').click();await page.locator('#authenticator-qr').waitFor({state:'visible'});await page.locator('#authenticator-qr').evaluate(image=>image.decode());
     assert.deepEqual(await visiblePrimaries(page),[await page.locator('#mfa-form button[type=submit]').evaluate(b=>b.id||b.textContent.trim())]);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,where+': QR fits');
     await shot('add-code-qr');
    }
    if(scenario.name==='enter-code'){assert.equal(await currentStep(page),2);assert.deepEqual(primaries,['mfa-step-up']);assert.equal(await page.locator('#native-mfa-title').textContent(),ro?'Introdu codul de securitate':'Enter your security code');}
    if(scenario.name==='consent'){
     assert.equal(await currentStep(page),3);assert.deepEqual(primaries,['approve']);
     assert.equal(await page.locator('#consent .cr-page-title').textContent(),ro?'Conectează Company OS':'Connect Company OS');
     assert.equal(await page.locator('#consent-client').textContent(),ro?'Company OS va vedea numele și adresa ta de email.':'Company OS will see your name and email address.');
     assert.equal(await page.locator('#consent-scope').isVisible(),false);assert.equal(await page.locator('#authenticator-section').isVisible(),false);
     await page.locator('#approve').click();await page.waitForURL(origin+'/companyos-callback-fixture');assert.ok(calls.includes('operator.oauth.approve'));
    }
    if(scenario.name==='sign-in-again'){
     assert.equal(await currentStep(page),1);assert.deepEqual(primaries,['operator-reauth']);
     for(const id of ['#account-state-retry','#account-state-logout'])assert.equal(await page.locator(id).isVisible(),false,where+' '+id);
     assert.equal(await statusText(page),'',where+': no toast');
     await page.locator('#operator-reauth').click();await page.locator('#auth').waitFor({state:'visible'});assert.equal(await currentStep(page),1);
    }
    if(['expired','not-admin'].includes(scenario.name)){
     assert.deepEqual(primaries,['operator-restart']);assert.equal(await statusText(page),'');
     for(const id of ['#consent','#account-state','#authenticator-section','#auth'])assert.equal(await page.locator(id).isVisible(),false,where+' '+id);
     const before=calls.filter(c=>c==='operator.oauth.details').length;
     await page.locator('#operator-restart').click();
     if(scenario.name==='expired'){await page.waitForFunction(n=>document.getElementById('operator-failure').hidden===false&&n>0,before);await page.waitForTimeout(300);assert.ok(calls.filter(c=>c==='operator.oauth.details').length>before,'Start again asks for the request again');}
     else{await page.locator('#auth').waitFor({state:'visible'});assert.equal(await page.locator('#operator-failure').isVisible(),false);}
    }
   }
   await context.close();
  }
 }
 assert.deepEqual(errors,[]);
 console.log(`${captureOnly?'CAPTURED':'PASS'} Company OS connection card: ${SCENARIOS.length} states on desktop (en) and phone (ro), one primary action each, steps, inline failures, no toast or JSON; screenshots in ${output}`);
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
