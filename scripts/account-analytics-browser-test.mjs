import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,['scripts/build-analytics.mjs']);
const sent=[],receipts=[];
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/collector/')){
  let data='';for await(const c of req)data+=c;const body=JSON.parse(data);res.setHeader('Content-Type','application/json');
  if(req.method==='DELETE'){res.end('{"revoked":true}');return;}
  if(url.pathname.endsWith('/receipts')){receipts.push(body);if(body.purposes.accountAnalytics)assert.ok(req.headers.authorization);res.end(JSON.stringify({receiptId:crypto.randomUUID(),...body,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),collectionToken:'test_collection_capability_123456789',revocationProof:'test_revocation_capability_123456789'}));return;}
  sent.push({body,authorization:req.headers.authorization});res.end(JSON.stringify({acceptedIds:body.events.map(e=>e.event_id),duplicateIds:[],rejected:[],generation:body.generation,receivedAt:new Date().toISOString(),retryAfterMs:null}));return;
 }
 if(url.pathname.endsWith('.js')){res.setHeader('Content-Type','text/javascript');res.end(await readFile('src'+url.pathname));return;}
 res.setHeader('Content-Type','text/html');res.end('<main>Account fixture</main><script type="module">import {createAccountAnalytics} from "/account/analytics.js";window.capture=createAccountAnalytics({config:{enabled:true,baseUrl:location.origin+"/collector",pageVersion:"test_1"}});window.session={user:{id:"actor_a"},access_token:"fixture_current_token",expires_at:Date.now()/1000+3600};window.account={analyticsConsent:true,consentGeneration:7};window.ready=true;</script>');
}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
const browser=await chromium.launch({headless:true});const page=await browser.newPage();
try{
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready);
 await page.evaluate(()=>capture.update({session,account}));
 assert.equal(await page.evaluate(()=>capture.track('profile_edit_started',{edit_area_id:'profile'}).queued),true,'A must run with W unknown/refused');
 await page.evaluate(()=>capture.flush());assert.ok(sent.length);assert.ok(receipts.every(r=>r.purposes.accountAnalytics&&!r.purposes.websiteAnalytics));
 assert.ok(sent.some(r=>r.body.events.some(e=>e.event_name==='profile_edit_started')));
 assert.equal(await page.evaluate(()=>localStorage.getItem('owned_analytics:codevalanche:identity')),null);
 assert.ok(sent.every(r=>r.authorization==='Bearer fixture_current_token'));
 assert.equal(JSON.stringify(sent.map(r=>r.body)).includes('actor_a'),false);assert.equal(JSON.stringify(sent.map(r=>r.body)).includes('fixture_current_token'),false);
 const old=await page.evaluate(()=>{capture.track('profile_save_submitted',{operation_id:crypto.randomUUID()});return Object.values(localStorage).join('');});assert.ok(!old.includes('fixture_current_token'));
 const before=sent.length;await page.evaluate(()=>{capture.suspend();session={...session,user:{id:'actor_b'},access_token:'fixture_b'};});await page.evaluate(()=>capture.flush());assert.equal(sent.length,before);
 await page.evaluate(()=>capture.update({session,account:{...account,analyticsConsent:false}}));assert.equal(await page.evaluate(()=>capture.track('profile_edit_started',{edit_area_id:'profile'}).queued),false);
 await page.evaluate(()=>capture.update({session,account:{...account,consentGeneration:9}}));await page.evaluate(()=>capture.flush());
 assert.ok(sent.slice(before).every(r=>r.authorization==='Bearer fixture_b'));
 assert.equal(sent.slice(before).some(r=>r.body.events.some(e=>e.event_name==='profile_save_submitted')),false,'A queue must not transfer to B');
 await page.evaluate(async()=>{const {createAnalyticsClient}=await import('/analytics/owned-analytics.js');window.marketing=createAnalyticsClient({siteId:'codevalanche',baseUrl:location.origin+'/collector'});await marketing.setConsent({websiteAnalytics:true});marketing.startPage({pageId:'home'});for(let i=0;i<80;i++)marketing.track('faq_toggled',{faq_id:'privacy',expanded:true});await marketing.whenQueueSettled();for(let i=0;i<80;i++)capture.track('profile_edit_started',{edit_area_id:'profile'});});
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('owned_analytics:codevalanche:account:queue')??'[]').length>0);
 const sizes=await page.evaluate(()=>['owned_analytics:codevalanche:queue','owned_analytics:codevalanche:account:queue'].map(k=>JSON.parse(localStorage.getItem(k)??'[]').length));
 assert.ok(sizes[0]>0&&sizes[1]>0);assert.ok(sizes[0]+sizes[1]<=100,`combined persisted W+A cap: ${sizes}`);
 const wid=await page.evaluate(()=>JSON.parse(localStorage.getItem('owned_analytics:codevalanche:identity')).anonymousId);
 await page.evaluate(()=>capture.update({session,account:{...account,analyticsConsent:false}}));
 assert.equal(await page.evaluate(()=>marketing.track('faq_toggled',{faq_id:'privacy',expanded:true}).queued),true,'W grant survives A refusal');
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('owned_analytics:codevalanche:identity')).anonymousId),wid);
 await page.evaluate(()=>capture.update({session:{...session,expires_at:Date.now()/1000+0.05},account}));
 await page.waitForFunction(()=>localStorage.getItem('owned_analytics:codevalanche:account:identity')===null);
 assert.equal(await page.evaluate(()=>capture.track('profile_edit_started',{edit_area_id:'profile'}).queued),false);
 await page.evaluate(()=>{marketing.dispose();const first=JSON.parse(localStorage.getItem('owned_analytics:codevalanche:queue'))[0];localStorage.setItem('owned_analytics:codevalanche:queue',JSON.stringify(Array.from({length:100},()=>({...first,queuedAt:Date.now()-86400001,event:{...first.event,event_id:crypto.randomUUID()}}))));});
 await page.evaluate(()=>capture.update({session,account:{...account,consentGeneration:11}}));
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('owned_analytics:codevalanche:account:queue')??'[]').length>0,null,{timeout:2000});
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('owned_analytics:codevalanche:queue')??'[]').length),0);
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('owned_analytics:codevalanche:identity')).anonymousId),wid);
 console.log('PASS account SDK: independent W/A choice, header-only current session, no identity/JWT in queue, logout/switch purge, P4 refusal and regrant');
}finally{await browser.close();await new Promise(r=>server.close(r));}
