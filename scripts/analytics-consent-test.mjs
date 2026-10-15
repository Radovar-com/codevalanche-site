import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

let receiptCount=0,revokeCount=0,optionalCount=0;let holdIssue=false,resolveIssue;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/issue') {
  receiptCount++;if(holdIssue)await new Promise(r=>{resolveIssue=r;});
  const chunks=[];for await(const c of req)chunks.push(c);const body=JSON.parse(Buffer.concat(chunks));
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({receiptId:crypto.randomUUID(),siteId:body.siteId,policyVersion:body.policyVersion,generation:body.generation,purposes:body.purposes,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+180*86400000).toISOString(),collectionToken:'test_collection_capability_123456789',revocationProof:'test_revocation_capability_123456789'}));return;
 }
 if(url.pathname==='/revoke'){revokeCount++;res.setHeader('Content-Type','application/json');res.end('{"revoked":true}');return;}
 if(url.pathname==='/optional'){optionalCount++;res.end('ok');return;}
 if(url.pathname.endsWith('.js')){try{res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('../src'+url.pathname,import.meta.url)));}catch{res.writeHead(404);res.end();}return;}
 res.setHeader('Content-Type','text/html');res.end('<button id="before">Before</button><main>Public page</main><script type="module">import {createConsentManager} from "/analytics/core/consent.js";import {mountConsentUI} from "/analytics/consent-ui.js";window.manager=createConsentManager({siteId:"codevalanche",policyVersion:"2026-10-15",now:()=>window.testNow??Date.now(),transport:{issueReceipt:async body=>(await fetch("/issue",{method:"POST",body:JSON.stringify(body)})).json(),revokeReceipt:async body=>(await fetch("/revoke",{method:"POST",body:JSON.stringify(body)})).json()}});window.sendOptional=async()=>{const lease=manager.getCollectionContext();if(!lease)return false;await fetch("/optional",{method:"POST",signal:lease.signal});return true;};window.ui=mountConsentUI({manager:window.manager});window.ready=true;</script>');
}).listen(0,'127.0.0.1');
await new Promise(r=>server.once('listening',r));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});
const context=await browser.newContext();
async function ready(page,url=origin){await page.goto(url);await page.waitForFunction(()=>window.ready);}
try {
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
 console.log('PASS consent browser: refusal, cross-tab/offline revoke, minimal proof, late ACK/issue, identity rotation, Auth isolation, focus, origin isolation');
} finally {await browser.close();server.close();}
