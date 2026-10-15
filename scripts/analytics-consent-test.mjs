import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

let receiptCount=0,revokeCount=0,optionalCount=0;let holdIssue=false,resolveIssue,refuseRevoke=false;const revokedProofs=[];
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/issue') {
  receiptCount++;if(holdIssue)await new Promise(r=>{resolveIssue=r;});
  const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({receiptId:crypto.randomUUID(),siteId:body.siteId,policyVersion:body.policyVersion,generation:body.generation,purposes:body.purposes,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+180*86400000).toISOString(),collectionToken:'test_collection_capability_123456789',revocationProof:'test_revocation_capability_123456789'}));return;
 }
 if(url.pathname==='/revoke'){const chunks=[];for await(const c of req)chunks.push(c);revokedProofs.push(JSON.parse(Buffer.concat(chunks)));revokeCount++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({revoked:!refuseRevoke}));return;}
 if(url.pathname==='/optional'){optionalCount++;res.end('ok');return;}
 if(url.pathname.endsWith('.js')){try{res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('../src'+url.pathname,import.meta.url)));}catch{res.writeHead(404);res.end();}return;}
 res.setHeader('Content-Type','text/html');res.end('<button id="before">Before</button><main>Public page</main><script type="module">import {createConsentManager} from "/analytics/core/consent.js";import {mountConsentUI} from "/analytics/consent-ui.js";window.manager=createConsentManager({siteId:"codevalanche",policyVersion:"2026-10-15",now:()=>window.testNow??Date.now(),transport:{issueReceipt:async body=>(await fetch("/issue",{method:"POST",body:JSON.stringify(body)})).json(),revokeReceipt:async body=>(await fetch("/revoke",{method:"POST",body:JSON.stringify(body)})).json()}});window.sendOptional=async()=>{const lease=manager.getCollectionContext();if(!lease)return false;await fetch("/optional",{method:"POST",signal:lease.signal});return true;};window.ui=mountConsentUI({manager:window.manager});window.ready=true;</script>');
}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});
const context=await browser.newContext();
async function ready(page,url=origin){await page.goto(url);await page.waitForFunction(()=>window.ready);}
try {
 if(!process.argv.includes('--cookies-only'))for(const failedKey of ['pending','preference','all-writes']){
  const failureContext=await browser.newContext(),writer=await failureContext.newPage();await ready(writer);await writer.evaluate(()=>manager.setConsent({websiteAnalytics:true}));
  const reader=await failureContext.newPage();await ready(reader);
  await writer.evaluate(()=>{window.oldLease=manager.getCollectionContext();localStorage.setItem(manager.keys.queue,'[{"old":true}]');localStorage.setItem('sb-auth-token','signed-in');document.cookie='auth_session=essential; Path=/';});
  await reader.evaluate(()=>{window.oldLease=manager.getCollectionContext();});
  await failureContext.setOffline(true);
  const failure=await writer.evaluate(async failedKey=>{
   const original=Storage.prototype.setItem;window.restoreStorage=()=>Storage.prototype.setItem=original;
   Storage.prototype.setItem=function(key,value){if(failedKey==='all-writes'||key===manager.keys[failedKey])throw new DOMException('Quota exhausted','QuotaExceededError');return original.call(this,key,value);};
   let rejected=false;try{await manager.setConsent({websiteAnalytics:false});}catch{rejected=true;}
   return {rejected,aborted:oldLease.signal.aborted,fresh:manager.getCollectionContext(),ack:manager.acceptAck({generation:oldLease.generation},oldLease),state:manager.getState()};
  },failedKey);
  assert.equal(failure.rejected,false,`${failedKey}: withdrawal must tolerate rejected storage`);
  assert.equal(failure.aborted,true,`${failedKey}: cached lease aborted before persistence`);assert.equal(failure.fresh,null);assert.equal(failure.ack,false);assert.equal(failure.state.websiteAnalytics,false);
  await reader.waitForFunction(()=>oldLease.signal.aborted);assert.equal(await reader.evaluate(()=>manager.getCollectionContext()),null);
  await reader.waitForFunction(()=>['pending','recovery'].some(k=>localStorage.getItem(manager.keys[k])));
  assert.equal(await writer.evaluate(()=>localStorage.getItem(manager.keys.receipt)),null);assert.equal(await writer.evaluate(()=>localStorage.getItem(manager.keys.identity)),null);assert.equal(await writer.evaluate(()=>localStorage.getItem(manager.keys.queue)),null);
  assert.equal(await writer.evaluate(()=>localStorage.getItem('sb-auth-token')),'signed-in');assert.equal(await writer.evaluate(()=>document.cookie.includes('auth_session=essential')),true);
  const proofs=await writer.evaluate(()=>['pending','recovery'].flatMap(k=>JSON.parse(localStorage.getItem(manager.keys[k])??'[]')));
  assert.ok(proofs.length>0,`${failedKey}: minimal proof durably recovered`);for(const p of proofs)assert.deepEqual(Object.keys(p).sort(),['capability','generation','receiptId']);
  await writer.evaluate(()=>restoreStorage());await failureContext.setOffline(false);assert.equal(await writer.evaluate(()=>manager.retryRevocations()),true);
  await writer.reload();await writer.waitForFunction(()=>window.ready);assert.equal(await writer.evaluate(()=>manager.getCollectionContext()),null);await failureContext.close();
 }
 if(!process.argv.includes('--cookies-only')){
  // With no peer and every write denied, the live manager must retain the proof
  // in memory and use that exact minimal proof once storage/network recover.
  const loneContext=await browser.newContext(),lone=await loneContext.newPage();await ready(lone);await lone.evaluate(()=>manager.setConsent({websiteAnalytics:true}));
  const receiptId=await lone.evaluate(()=>{window.oldLease=manager.getCollectionContext();return oldLease.receiptId;});await loneContext.setOffline(true);
  await lone.evaluate(async()=>{const original=Storage.prototype.setItem;window.restoreStorage=()=>Storage.prototype.setItem=original;Storage.prototype.setItem=()=>{throw new DOMException('All storage denied','QuotaExceededError');};await manager.setConsent({websiteAnalytics:false});});
  assert.equal(await lone.evaluate(()=>oldLease.signal.aborted),true);assert.equal(await lone.evaluate(()=>manager.getCollectionContext()),null);assert.equal(await lone.evaluate(()=>localStorage.getItem(manager.keys.receipt)),null);
  assert.equal(await lone.evaluate(()=>localStorage.getItem(manager.keys.pending)),null);assert.equal(await lone.evaluate(()=>localStorage.getItem(manager.keys.recovery)),null);
  await lone.evaluate(()=>restoreStorage());await loneContext.setOffline(false);assert.equal(await lone.evaluate(()=>manager.retryRevocations()),true);
  const used=revokedProofs.find(p=>p.receiptId===receiptId);assert.ok(used);assert.deepEqual(Object.keys(used).sort(),['capability','generation','receiptId']);await loneContext.close();
  const lostContext=await browser.newContext(),lost=await lostContext.newPage();await ready(lost);await lost.evaluate(()=>manager.setConsent({websiteAnalytics:true}));refuseRevoke=true;
  await lost.evaluate(async()=>{Storage.prototype.setItem=()=>{throw new DOMException('All storage denied','QuotaExceededError');};await manager.setConsent({websiteAnalytics:false});});
  await lost.reload();await lost.waitForFunction(()=>window.ready);refuseRevoke=false;
  assert.equal(await lost.evaluate(()=>manager.retryRevocations()),false);const issueBefore=receiptCount;await lost.evaluate(()=>manager.setConsent({websiteAnalytics:true}));
  assert.equal(receiptCount,issueBefore,'unresolved cookie debt cannot be bypassed after lost in-memory proof');assert.equal(await lost.evaluate(()=>manager.getCollectionContext()),null);assert.equal(await lost.evaluate(()=>manager.getState().state),'pending_revoke');await lostContext.close();
 }
 if(!process.argv.includes('--failures-only')){
  const cookieContext=await browser.newContext(),cookiePage=await cookieContext.newPage();await ready(cookiePage);
  await cookiePage.evaluate(()=>manager.setConsent({websiteAnalytics:false}));
  const cookie=(await cookieContext.cookies()).find(c=>c.name==='codevalanche_consent');assert.ok(cookie,'essential choice cookie exists');
  const saved=JSON.parse(decodeURIComponent(cookie.value));assert.equal(saved.value.policyVersion,'2026-10-15');assert.equal(saved.value.state,'denied');
  assert.equal(cookie.domain,'127.0.0.1');assert.equal(cookie.path,'/');assert.equal(cookie.sameSite,'Lax');assert.ok(Math.abs(cookie.expires-Date.now()/1000-180*86400)<10);
  await ready(cookiePage,origin+'/nested/public.html');assert.equal(await cookiePage.evaluate(()=>manager.getState().state),'denied');
  const distinct=await cookieContext.newPage();await ready(distinct,origin.replace('127.0.0.1','localhost'));assert.equal(await distinct.evaluate(()=>manager.getState().state),'unknown');
  await cookiePage.evaluate(()=>manager.setConsent({websiteAnalytics:true}));await cookieContext.setOffline(true);await cookiePage.evaluate(()=>manager.setConsent({websiteAnalytics:false}));
  const withdrawn=(await cookieContext.cookies()).find(c=>c.name==='codevalanche_consent');assert.equal(JSON.parse(decodeURIComponent(withdrawn.value)).value.state,'pending_revoke');
  assert.equal(withdrawn.value.includes('capability'),false);assert.equal(withdrawn.value.includes('receiptId'),false);
  await cookieContext.setOffline(false);await cookiePage.evaluate(()=>manager.retryRevocations());
  const priorPolicy={...JSON.parse(decodeURIComponent(withdrawn.value)),value:{...JSON.parse(decodeURIComponent(withdrawn.value)).value,policyVersion:'previous-policy',state:'denied'}};
  await cookieContext.addCookies([{...withdrawn,value:encodeURIComponent(JSON.stringify(priorPolicy))}]);await cookiePage.reload();await cookiePage.waitForFunction(()=>window.ready);assert.equal(await cookiePage.evaluate(()=>manager.getState().state),'unknown');
  // Native browser expiry physically removes a choice; stale localStorage cannot restore it.
  await cookieContext.addCookies([{...withdrawn,expires:Date.now()/1000-1}]);await cookiePage.reload();await cookiePage.waitForFunction(()=>window.ready);
  assert.equal((await cookieContext.cookies()).some(c=>c.name==='codevalanche_consent'),false);assert.equal(await cookiePage.evaluate(()=>manager.getState().state),'unknown');assert.equal(await cookiePage.evaluate(()=>manager.getCollectionContext()),null);
  await cookieContext.close();
  // Real HTTPS cookie engine: Secure and host-only across sibling/subdomain hosts.
  const secureContext=await browser.newContext();await secureContext.route('https://**/*',async route=>{const request=route.request(),response=await fetch(origin+new URL(request.url()).pathname,{method:request.method(),body:request.postData()??undefined});await route.fulfill({status:response.status,contentType:response.headers.get('content-type')??'text/html',body:await response.text()});});
  const securePage=await secureContext.newPage();await ready(securePage,'https://codevalanche.test/');await securePage.evaluate(()=>manager.setConsent({websiteAnalytics:false}));
  const secureChoice=(await secureContext.cookies('https://codevalanche.test/')).find(c=>c.name==='codevalanche_consent');assert.ok(secureChoice.secure);assert.equal(secureChoice.domain,'codevalanche.test');
  const subdomain=await secureContext.newPage();await ready(subdomain,'https://sub.codevalanche.test/');assert.equal(await subdomain.evaluate(()=>document.cookie.includes('codevalanche_consent=')),false);assert.equal(await subdomain.evaluate(()=>manager.getState().state),'unknown');
  const sibling=await secureContext.newPage();await ready(sibling,'https://radovar.test/');assert.equal(await sibling.evaluate(()=>document.cookie.includes('codevalanche_consent=')),false);await secureContext.close();
 }
 if(process.argv.includes('--failures-only')||process.argv.includes('--cookies-only')){console.log('PASS consent focused cookie/storage regression');}else{
 receiptCount=0;revokeCount=0;optionalCount=0;
 const page=await context.newPage();await ready(page);
 await page.evaluate(()=>{localStorage.setItem('sb-auth-token','signed-in');document.cookie='auth_session=essential; Path=/';});
 assert.equal(await page.evaluate(()=>manager.getCollectionContext()),null);
 assert.equal(await page.evaluate(()=>sendOptional()),false);assert.equal(optionalCount,0);
 assert.equal(receiptCount,0);assert.equal(await page.evaluate(()=>localStorage.length),1);
 await page.getByRole('button',{name:'Decline',exact:true}).click();
 assert.equal(receiptCount,0);assert.equal(await page.evaluate(()=>manager.getCollectionContext()),null);
 assert.equal(await page.evaluate(()=>sendOptional()),false);assert.equal(optionalCount,0);
 assert.equal(await page.evaluate(()=>localStorage.getItem('sb-auth-token')),'signed-in');
 await page.getByRole('button',{name:'Manage cookies',exact:true}).click();
 await page.getByRole('button',{name:'Personalize',exact:true}).click();
 assert.equal(await page.getByRole('checkbox',{name:'Account analytics'}).isEnabled(),false);
 await page.getByRole('checkbox',{name:'Website analytics'}).check();await page.getByRole('button',{name:'Save preferences'}).click();
 await page.waitForFunction(()=>manager.getCollectionContext()!==null);
 const first=await page.evaluate(()=>{const c=manager.getCollectionContext();localStorage.setItem(manager.keys.queue,'[{"optional":"old"}]');window.lease=c;return c;});
 assert.equal(first.accountAnalytics,false);
 assert.equal(await page.evaluate(()=>sendOptional()),true);assert.equal(optionalCount,1);
 const other=await context.newPage();await ready(other);
 await context.setOffline(true);
 await other.evaluate(()=>manager.setConsent({websiteAnalytics:false}));
 await page.waitForFunction(()=>manager.getState().state==='pending_revoke');
 assert.equal(await page.evaluate(()=>manager.getCollectionContext()),null);
 assert.equal(await page.evaluate(()=>manager.acceptAck({generation:lease.generation},lease)),false);
 assert.equal(await page.evaluate(()=>lease.signal.aborted),true);
 assert.equal(await page.evaluate(()=>sendOptional()),false);assert.equal(optionalCount,1);
 const stored=await page.evaluate(()=>Object.fromEntries(Object.entries(localStorage).filter(([k])=>k.startsWith('owned_analytics:'))));
 assert.equal(stored['owned_analytics:codevalanche:queue'],undefined);
 assert.equal(stored['owned_analytics:codevalanche:identity'],undefined);
 assert.equal(stored['owned_analytics:codevalanche:receipt'],undefined);
 const pending=JSON.parse(stored['owned_analytics:codevalanche:pending']);
 assert.deepEqual(Object.keys(pending[0]).sort(),['capability','generation','receiptId']);
 assert.equal(await page.evaluate(()=>document.cookie.includes('auth_session=essential')),true);
 await page.evaluate(()=>manager.setConsent({websiteAnalytics:true}));
 assert.equal(await page.evaluate(()=>manager.getState().state),'pending_revoke');assert.equal(await page.evaluate(()=>manager.getState().websiteAnalytics),false);
 const beforeReconnect=receiptCount;await context.setOffline(false);await other.evaluate(()=>manager.retryRevocations());
 await page.waitForFunction(()=>manager.getState().state==='withdrawn');assert.equal(receiptCount,beforeReconnect);
 await other.evaluate(()=>manager.setConsent({websiteAnalytics:true,accountAnalytics:true}));
 const second=await other.evaluate(()=>manager.getCollectionContext());assert.notEqual(second.anonymousId,first.anonymousId);assert.equal(second.accountAnalytics,false);
 assert.ok(revokeCount>=1);
 // A late issuance result after withdrawal is revoked, never adopted.
 await other.evaluate(()=>manager.setConsent({websiteAnalytics:false}));holdIssue=true;
 await other.evaluate(()=>{window.grant=manager.setConsent({websiteAnalytics:true});});
 while(!resolveIssue)await new Promise(r=>setTimeout(r,10));
 await page.evaluate(()=>manager.setConsent({websiteAnalytics:false}));holdIssue=false;resolveIssue();
 await other.evaluate(()=>window.grant);assert.equal(await other.evaluate(()=>manager.getCollectionContext()),null);
 // Escape and tab wrap restore focus; mount works on a page without existing CMP markup.
 await page.getByRole('button',{name:'Manage cookies',exact:true}).click();await page.getByRole('button',{name:'Personalize',exact:true}).click();
 await page.getByRole('button',{name:'Close preferences'}).focus();await page.keyboard.press('Shift+Tab');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Save preferences');
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Manage cookies');
 await page.getByRole('button',{name:'Manage cookies',exact:true}).click();await page.getByRole('button',{name:'Personalize',exact:true}).click();await page.getByRole('button',{name:'Close preferences'}).click();
 assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Manage cookies');
 // Separate origin has no preference/identity or account consent.
 const isolated=await context.newPage();await ready(isolated,origin.replace('127.0.0.1','localhost'));
 assert.equal(await isolated.evaluate(()=>manager.getState().state),'unknown');assert.equal(await isolated.evaluate(()=>manager.getCollectionContext()),null);
 // Exercise actual storage lifetime behavior with an injected clock, no sleeps.
 const lifetime=await context.newPage();await ready(lifetime,origin.replace('127.0.0.1','localhost'));
 await lifetime.evaluate(()=>manager.setConsent({websiteAnalytics:true}));
 const life1=await lifetime.evaluate(()=>{window.baseTime=Date.now();window.testNow=baseTime;return manager.getCollectionContext();});
 const life2=await lifetime.evaluate(()=>{window.testNow=baseTime+30*60000;return manager.getCollectionContext();});
 assert.equal(life2.anonymousId,life1.anonymousId);assert.notEqual(life2.sessionId,life1.sessionId);
 const life3=await lifetime.evaluate(()=>{window.testNow=baseTime+30*86400000;return manager.getCollectionContext();});
 assert.notEqual(life3.anonymousId,life1.anonymousId);
 const life4=await lifetime.evaluate(()=>{let lease;for(let minutes=20;minutes<=1460;minutes+=20){window.testNow=baseTime+30*86400000+minutes*60000;lease=manager.getCollectionContext();}return lease;});
 assert.equal(life4.anonymousId,life3.anonymousId);assert.notEqual(life4.sessionId,life3.sessionId);
 await lifetime.evaluate(()=>{window.testNow=baseTime+181*86400000;});assert.equal(await lifetime.evaluate(()=>manager.getCollectionContext()),null);
 assert.equal(await lifetime.evaluate(()=>localStorage.getItem(manager.keys.identity)),null);
 assert.equal(await lifetime.evaluate(()=>localStorage.getItem(manager.keys.receipt)),null);
 assert.equal(await lifetime.evaluate(()=>manager.getState().websiteAnalytics),false);
 // Legacy accepted never silently grants the current policy or account purpose.
 const legacyContext=await browser.newContext();await legacyContext.addCookies([{name:'codevalanche_consent',value:'accepted',url:origin}]);
 await legacyContext.addInitScript(()=>localStorage.setItem('codevalanche_analytics_installation','legacy_optional_id'));
 const legacy=await legacyContext.newPage();await ready(legacy);assert.equal(await legacy.evaluate(()=>manager.getState().state),'unknown');assert.equal(await legacy.evaluate(()=>manager.getCollectionContext()),null);assert.equal(await legacy.evaluate(()=>localStorage.getItem('codevalanche_analytics_installation')),null);await legacyContext.close();
 const declinedContext=await browser.newContext();await declinedContext.addCookies([{name:'codevalanche_consent',value:'declined',url:origin}]);
 const declined=await declinedContext.newPage();await ready(declined);assert.equal(await declined.evaluate(()=>manager.getState().state),'denied');assert.equal(await declined.evaluate(()=>manager.getCollectionContext()),null);await declinedContext.close();
 const corruptContext=await browser.newContext(),corrupt=await corruptContext.newPage();await ready(corrupt);await corrupt.evaluate(()=>manager.setConsent({websiteAnalytics:true}));
 await corrupt.evaluate(()=>{const receipt=JSON.parse(localStorage.getItem(manager.keys.receipt));receipt.expiresAt='invalid';localStorage.setItem(manager.keys.receipt,JSON.stringify(receipt));});
 assert.equal(await corrupt.evaluate(()=>manager.getCollectionContext()),null);await corruptContext.close();
 console.log('PASS consent browser: quota failures, essential host-only180d cookie, refusal, cross-tab/offline revoke, minimal proof, late ACK/issue, identity rotation, Auth isolation, focus, origin isolation');
 }
} finally {await browser.close();server.close();}
