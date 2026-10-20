import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {build} from 'esbuild';
import {chromium} from 'playwright';

test('actual account UI saves with both refused or capture unavailable, and emits only A intentions under P4 opt-in',async()=>{
 const html=await readFile('src/account/index.html','utf8');
 const bundle=await build({entryPoints:['src/account/app.js'],bundle:true,write:false,format:'esm',target:'es2022',plugins:[{name:'fixture-auth',setup(b){b.onResolve({filter:/^@supabase\/supabase-js$/},()=>({path:'auth',namespace:'fixture'}));b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const createClient=()=>window.fixtureAuth;export class NavigatorLockAcquireTimeoutError extends Error {}'}));}}]});
 const server=createServer((req,res)=>{res.setHeader('Content-Type',req.url.startsWith('/account/app.js')?'text/javascript':'text/html');res.end(req.url.startsWith('/account/app.js')?bundle.outputFiles[0].text:req.url==='/account/'?html:'');}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const browser=await chromium.launch({headless:true});
 try{for(const mode of ['refused','unavailable','granted']){
  const context=await browser.newContext(),page=await context.newPage(),events=[],receipts=[],calls=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  await context.addInitScript(()=>{
   const user={id:'11111111-1111-4111-8111-111111111111',email:'fixture@example.test',identities:[]},session={user,access_token:'fixture-auth-only',expires_at:Date.now()/1000+3600};
   window.CODEVALANCHE_CONFIG={supabaseUrl:'https://account.fixture.invalid',supabasePublishableKey:'public-fixture',accountServer:'v2'};
   window.CODEVALANCHE_ANALYTICS={enabled:true,baseUrl:'https://collector.fixture.invalid/v1',pageVersion:'test_1'};
   window.fixtureAuth={auth:{getSession:async()=>({data:{session},error:null}),onAuthStateChange(){},signOut:async()=>({error:null})}};
  });
  await context.route('https://collector.fixture.invalid/**',async route=>{
   const body=route.request().postDataJSON();assert.equal(route.request().headers().authorization,'Bearer fixture-auth-only');
   if(mode==='unavailable'){await route.fulfill({status:503,body:'{}'});return;}
   if(route.request().url().endsWith('/receipts')){receipts.push(body);await route.fulfill({json:{receiptId:crypto.randomUUID(),...body,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),collectionToken:'fixture_collection_capability_123456',revocationProof:'fixture_revocation_capability_123456'}});return;}
   events.push(...body.events);await route.fulfill({json:{acceptedIds:body.events.map(e=>e.event_id),duplicateIds:[],rejected:[],generation:body.generation,receivedAt:new Date().toISOString(),retryAfterMs:null}});
  });
  let release;const held=new Promise(r=>release=r);
  await context.route('https://account.fixture.invalid/functions/**',async route=>{
   const body=route.request().postDataJSON();calls.push(body);
   if(body.action==='profile.update'){await held;await route.fulfill({json:{apiVersion:2,ok:true,requestId:body.requestId,data:{ok:true}}});return;}
   await route.fulfill({json:{user:{id:'11111111-1111-4111-8111-111111111111',displayName:'Original',bio:''},sessions:[],policy:{status:'active'},analyticsConsent:mode!=='refused',consentGeneration:7}});
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/account/`);await page.locator('#profile').waitFor({state:'visible'});
  if(mode==='granted')await page.waitForFunction(()=>!!localStorage.getItem('owned_analytics:codevalanche:account:receipt'));
  await page.locator('#display-name').fill('Private edited name');await page.locator('#profile-form button[type=submit]').click();
  await page.waitForRequest(()=>false,{timeout:30}).catch(()=>{});
  while(!calls.some(c=>c.action==='profile.update'))await new Promise(r=>setTimeout(r,5));
  assert.notEqual(await page.locator('#status').textContent(),'Profile saved.');release();await page.getByText('Profile saved.',{exact:true}).waitFor();
  const save=calls.find(c=>c.action==='profile.update');assert.match(save.requestId,/^[0-9a-f-]{36}$/);assert.equal(save.displayName,'Private edited name');
  const queue=await page.evaluate(()=>JSON.parse(localStorage.getItem('owned_analytics:codevalanche:account:queue')??'[]'));
  if(mode==='granted'){assert.ok(receipts.every(r=>r.purposes.accountAnalytics&&!r.purposes.websiteAnalytics));assert.ok(queue.some(r=>r.event.event_name==='profile_save_submitted'&&r.event.properties.operation_id===save.requestId));assert.ok(!JSON.stringify(queue).includes('Private edited name'));assert.ok(!JSON.stringify(queue).includes('fixture-auth-only'));}
  else assert.equal(queue.length,0);
  assert.equal(await page.evaluate(()=>localStorage.getItem('owned_analytics:codevalanche:identity')),null);assert.deepEqual(errors,[]);await context.close();
 }}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
});
