import {chromium} from 'playwright';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

// Real account HTML, bundled app and unmodified production SDK. Only the Auth,
// account and collector HTTP services are synthetic; no live provider traffic.
const bundle=await build({entryPoints:['src/account/app.js'],bundle:true,write:false,format:'esm',target:'es2022'});
let actor='a',granted=false,generation=1,holdReceipt=false,releaseReceipt,collectorMode='ready';
const posts=[],logoutCalls=[],receipts=[],failures=[],errors=[];
const user=()=>({id:actor==='a'?'11111111-1111-4111-8111-111111111111':'22222222-2222-4222-8222-222222222222',aud:'authenticated',role:'authenticated',email:`${actor}@example.test`,user_metadata:{},app_metadata:{provider:'email'},identities:[{provider:'email'}],created_at:new Date().toISOString()});
const json=(res,body,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(body));};
const server=createServer(async(req,res)=>{
 try{
  const pathname=new URL(req.url,'http://localhost').pathname;
  if(pathname==='/config.js'){res.setHeader('Content-Type','text/javascript');res.end(`window.CODEVALANCHE_CONFIG={supabaseUrl:location.origin,accountOrigin:location.origin,supabasePublishableKey:'fixture_public'};window.CODEVALANCHE_ANALYTICS={enabled:true,baseUrl:location.origin+'/collector',pageVersion:'test_1'};`);return;}
  if(pathname==='/account/app.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
  if(pathname.startsWith('/auth/')||pathname.startsWith('/functions/')||pathname.startsWith('/collector/')){
   let raw='';for await(const part of req)raw+=part;const body=raw?JSON.parse(raw):{};
   if(pathname.includes('/auth/v1/token')){json(res,{access_token:`fixture_${actor}`,refresh_token:`refresh_${actor}`,token_type:'bearer',expires_in:3600,user:user()});return;}
   if(pathname.includes('/auth/v1/logout')){logoutCalls.push({actor,at:Date.now()});json(res,{});return;}
   if(pathname.includes('/auth/v1/user')){json(res,user());return;}
   if(pathname.startsWith('/functions/')){
    if(body.action==='analytics.consent'){granted=body.analytics;generation++;json(res,{apiVersion:2,ok:true,requestId:body.requestId,data:{analyticsConsent:granted,consentGeneration:generation}});return;}
    json(res,{user:{displayName:actor,bio:''},sessions:[],analyticsConsent:granted,consentGeneration:generation});return;
   }
   if(req.method==='DELETE'){json(res,{revoked:true});return;}
   if(pathname.endsWith('/receipts')){
    receipts.push(body);if(holdReceipt)await new Promise(resolve=>{releaseReceipt=resolve;});
    json(res,{receiptId:crypto.randomUUID(),...body,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),collectionToken:'fixture_collection_capability_123456789',revocationProof:'fixture_revocation_capability_123456789'});return;
   }
   posts.push({body,authorization:req.headers.authorization,at:Date.now()});
   if(collectorMode==='hang')return;
   json(res,{acceptedIds:body.events.map(event=>event.event_id),duplicateIds:[],rejected:[],generation:body.generation,receivedAt:new Date().toISOString(),retryAfterMs:null});return;
  }
  const name=pathname.endsWith('/')?pathname+'index.html':pathname;
  res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/html');res.end(await readFile('src'+name));
 }catch(error){json(res,{message:error.message},500);}
}).listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
const browser=await chromium.launch({headless:true}),page=await browser.newPage();page.on('pageerror',error=>errors.push(error.message));
const check=(name,actual,expected)=>{try{assert.deepEqual(actual,expected);console.log('PASS '+name);}catch(error){failures.push(name);console.log('FAIL '+name+': '+error.message);}};
const queued=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('owned_analytics:codevalanche:account:queue')??'[]').map(entry=>entry.event));
const editCount=async()=> (await queued()).filter(event=>event.event_name==='profile_edit_started').length;
const ready=()=>page.waitForFunction(()=>localStorage.getItem('owned_analytics:codevalanche:account:identity')!==null);
const focus=async()=>{await page.locator('#bio').focus();await page.locator('#display-name').focus();await page.waitForTimeout(40);};
const signIn=async()=>{await page.locator('#email').fill(`${actor}@example.test`);await page.locator('#password').fill('fixture_password');await page.locator('#auth-submit').click();await page.locator('#profile:not([hidden])').waitFor();};
const choose=async value=>{await page.locator('#analytics-consent').setChecked(value);await page.locator('#analytics-save').click();await page.getByText(value?'Account activity analytics accepted.':'Account activity analytics stopped. Queued events from earlier consent are refused.',{exact:true}).waitFor();};
try{
 await page.goto(`http://127.0.0.1:${server.address().port}/account/`);await signIn();await focus();check('refused real focus creates no edit',await editCount(),0);
 holdReceipt=true;await choose(true);await focus();check('unready real focus creates no edit',await editCount(),0);
 await page.waitForFunction(()=>document.getElementById('analytics-save').disabled===false);const receiptDeadline=Date.now()+3000;while(!releaseReceipt&&Date.now()<receiptDeadline)await new Promise(resolve=>setTimeout(resolve,10));assert.ok(releaseReceipt,'real app must request A receipt');holdReceipt=false;releaseReceipt();await ready();
 check('grant does not replay earlier focus',await editCount(),0);
 await page.evaluate(()=>{window.originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='owned_analytics:codevalanche:account:identity')throw new DOMException('Fixture unavailable','SecurityError');return window.originalStorageSet.call(this,key,value);};});
 await focus();check('unavailable identity storage does not consume edit',await editCount(),0);await page.evaluate(()=>{Storage.prototype.setItem=window.originalStorageSet;delete window.originalStorageSet;});
 await focus();check('genuine later focus after readiness records edit',await editCount(),1);await focus();check('multiple profile fields record once per scope',await editCount(),1);
 await choose(false);await focus();await choose(true);await ready();check('regrant does not replay earlier focus',await editCount(),0);await focus();check('regrant rearms actual form edit',await editCount(),1);
 const previousIdentity=await page.evaluate(()=>JSON.parse(localStorage.getItem('owned_analytics:codevalanche:account:identity')).anonymousId);
 const before=posts.length;collectorMode='hang';
 // Exercise the real SDK lifecycle listener to establish an actual uncompleted
 // fetch, without navigating away from the real logout control under test.
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));
 const postDeadline=Date.now()+3000;while(posts.length===before&&Date.now()<postDeadline)await new Promise(resolve=>setTimeout(resolve,10));check('collector request is genuinely pending before logout',posts.length>before,true);
 const clickedAt=Date.now();await page.locator('#logout').click();await page.getByText('Signed out.',{exact:true}).waitFor({timeout:3000});await page.waitForTimeout(120);
 check('hanging optional collector does not delay core logout',logoutCalls.length,1);check('core logout completes within bound',Date.now()-clickedAt<3000,true);
 // This source is deliberately unmeasured in the report contract, rather than
 // retaining a dead event or weakening withdrawal abort for terminal delivery.
 check('unqualified logout producer emits no misleading event',posts.slice(before).some(post=>post.body.events.some(event=>event.event_name==='logout_clicked')),false);
 check('logout immediately removes old A identity',await page.evaluate(()=>localStorage.getItem('owned_analytics:codevalanche:account:identity')),null);check('logout leaves no old A queue',await queued(),[]);
 actor='b';collectorMode='ready';await signIn();await ready();await focus();check('account B receives its own real edit scope',await editCount(),1);
 const freshEvents=await queued();check('account B never inherits terminal/logout events',freshEvents.some(event=>event.event_name==='logout_clicked'),false);check('account B identity differs',await page.evaluate(previous=>JSON.parse(localStorage.getItem('owned_analytics:codevalanche:account:identity')).anonymousId!==previous,previousIdentity),true);
 check('actual page has no uncaught errors',errors,[]);
 if(failures.length)throw new Error(`${failures.length} real UI lifecycle regressions: ${failures.join(', ')}`);
 console.log('PASS real account UI lifecycle: refusal/unready/storage recovery/grant/regrant, once-only edit scope, explicit unmeasured logout producer, account switch and immediate purge. No terminal delivery or hosted authorization/ACK qualification is claimed.');
}finally{releaseReceipt?.();await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
