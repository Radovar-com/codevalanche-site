import {chromium} from 'playwright';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {createDownloadRedirectHandler} from '../supabase/functions/download-redirect/index.ts';
import {releaseRegistry} from '../supabase/functions/_shared/downloadManifest.ts';
import {PREAUTH} from '../src/analytics/core/registry.js';
import {validateWebsiteEvent,validateContractDto} from '../supabase/functions/_shared/websiteAnalyticsContract.ts';
execFileSync(process.execPath,['scripts/build.mjs']);
const sdkManifest=JSON.parse(await readFile('dist/analytics/manifest.json','utf8'));
const downloadManifest={version:1,gatewayBaseUrl:'https://downloads.example.org/functions/v1/download-redirect/v1',allowedOrigins:['https://artifacts.example.org'],assets:[{siteId:'codevalanche',platform:'windows',architecture:'x64',releaseId:'fixture_1',artifactId:'fixture_windows',qualified:true,targetUrl:'https://artifacts.example.org/fixture.exe'}]};
const downloadRequests=[];const redirect=createDownloadRedirectHandler({manifest:downloadManifest,record:e=>downloadRequests.push(e)});
const receipts=new Map(),events=new Map(),requests=[],errors=[];let fixture=true,failReceipt=false;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local');res.setHeader('Content-Type','application/json');
 if(url.pathname==='/collector/consent/receipts'&&req.method==='POST'){
  if(failReceipt){res.writeHead(503);res.end('{}');return;}
  const b=JSON.parse(await text(req)),r={receiptId:crypto.randomUUID(),...b,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+180*86400000).toISOString(),collectionToken:'local_fixture_collection_capability_123',revocationProof:'local_fixture_revocation_capability_123'};assert.ok(validateContractDto('ConsentReceipt',r));receipts.set(r.receiptId,r);res.end(JSON.stringify(r));return;
 }
 if(url.pathname.startsWith('/collector/consent/receipts/')&&req.method==='DELETE'){res.end('{"revoked":true}');return;}
 if(url.pathname==='/collector/events'){
  const raw=await text(req),b=JSON.parse(raw);requests.push(b);assert.equal(req.headers.cookie,undefined);assert.ok(Buffer.byteLength(raw)<=32768);
  const acceptedIds=[],duplicateIds=[];for(const e of b.events){assert.equal(validateWebsiteEvent(e,{origin:'https://codevalanche.com',registry:releaseRegistry(downloadManifest),receivedAt:new Date().toISOString(),receipt:receipts.get(b.receiptId),surface:['account','account_authorize'].includes(e.page_id)&&PREAUTH.has(e.event_name)?'pre_auth':undefined}).accepted,true,JSON.stringify(e));if(events.has(e.event_id)){assert.deepEqual(events.get(e.event_id),e);duplicateIds.push(e.event_id);}else{events.set(e.event_id,e);acceptedIds.push(e.event_id);}}
  res.end(JSON.stringify({acceptedIds,duplicateIds,rejected:[],generation:b.generation,receivedAt:new Date().toISOString(),retryAfterMs:null}));return;
 }
 let pathname=url.pathname.endsWith('/')?url.pathname+'index.html':url.pathname;
 if(pathname==='/fixture-download'){res.setHeader('Content-Type','text/html');res.end('<h1>Local download fixture</h1>');return;}
 let data=await readFile(path.join('dist',pathname));
 // The shipped config points at the production collector; local runs never use it.
 if(pathname==='/config.js'&&!fixture)data=Buffer.from(data.toString()+"\nwindow.CODEVALANCHE_ANALYTICS={enabled:false,baseUrl:'',pageVersion:'codevalanche_product_20261017'};");
 if(pathname==='/config.js'&&fixture)data=Buffer.from(data.toString()+`\nwindow.CODEVALANCHE_ANALYTICS={enabled:true,baseUrl:'${origin}/collector',pageVersion:'local_fixture'};window.CODEVALANCHE_RELEASE_MANIFEST=${JSON.stringify(downloadManifest)};`);
 res.setHeader('Content-Type',pathname.endsWith('.js')?'text/javascript':pathname.endsWith('.css')?'text/css':pathname.endsWith('.svg')?'image/svg+xml':'text/html');res.end(data);
 }catch(error){if(req.url.startsWith('/collector'))errors.push(error.message);res.writeHead(404);res.end();}}).listen(0,'127.0.0.1');
async function text(req){const a=[];for await(const c of req)a.push(c);return Buffer.concat(a).toString();}
await new Promise(r=>server.once('listening',r));const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});
const sdkUrl=url=>url.origin===origin&&url.pathname==='/analytics/owned-analytics.js';
const configUrl=url=>url.origin===origin&&url.pathname==='/config.js';
async function localContext(options={}){const context=await browser.newContext(options);await context.route('https://**/*',route=>route.abort());await context.route('https://downloads.example.org/**',async route=>{const response=await redirect(new Request(route.request().url()));if(response.status===302)assert.equal(response.headers.get('location'),downloadManifest.assets[0].targetUrl);/* Playwright does not re-route fulfilled redirects: translate the synthetic artifact to the local fixture at the transport boundary. */await route.fulfill({status:response.status,headers:{...Object.fromEntries(response.headers),...(response.status===302?{location:origin+'/fixture-download'}:{})},body:await response.text()});});await context.route('https://artifacts.example.org/fixture.exe',route=>route.fulfill({status:302,headers:{location:origin+'/fixture-download'}}));return context;}
async function desktopContext(platform,options={}){
 const windows=platform==='Win32';
 const context=await localContext({...options,userAgent:`Mozilla/5.0 (${windows?'Windows NT 10.0; Win64; x64':'X11; Linux x86_64'}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36`});
 // All platform signals belong to this fixture, independently of the CI host.
 await context.addInitScript(value=>{Object.defineProperty(Navigator.prototype,'platform',{get:()=>value});Object.defineProperty(Navigator.prototype,'userAgentData',{get:()=>undefined});},platform);
 return context;
}
async function ready(page,url='/'){await page.goto(origin+url);await page.waitForFunction(()=>window.CodevalancheAnalytics?.consentManager,null,{timeout:3000});}
async function choose(page,enabled){await page.evaluate(v=>CodevalancheAnalytics.setConsent({websiteAnalytics:v}),enabled);}
async function flush(page){await page.evaluate(()=>CodevalancheAnalytics.flush());}
async function optionalAnalyticsFailures(){
 const originalFixture=fixture;fixture=false;
 try{for(const mode of ['aborted_sdk','throwing_bootstrap','held_sdk']){
  const context=await localContext({viewport:{width:390,height:844},reducedMotion:'reduce'}),page=await context.newPage(),pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
  let release;const gate=new Promise(resolve=>release=resolve),requestSeen=page.waitForRequest(request=>sdkUrl(new URL(request.url())),{timeout:3000});let sdkRequests=0;
  await context.route(sdkUrl,async route=>{sdkRequests++;if(mode==='aborted_sdk')await route.abort();else{if(mode==='held_sdk')await gate;await route.continue();}});
  if(mode==='throwing_bootstrap')await context.route(configUrl,async route=>{const response=await route.fetch();await route.fulfill({response,body:(await response.text())+"\nObject.defineProperty(window.CODEVALANCHE_ANALYTICS,'pageVersion',{get(){window.fixtureBootstrapAttempted=true;return 'invalid bootstrap/version';}});"});});
  try{
   await page.goto(origin,{waitUntil:'commit'});const sdkRequest=await requestSeen;assert.equal(new URL(sdkRequest.url()).searchParams.get('v'),await page.evaluate(()=>document.documentElement.dataset.assetRevision),'the actual SDK request uses this export revision');
   assert.equal(await page.evaluate(()=>CODEVALANCHE_ANALYTICS.enabled),false);
   if(mode==='throwing_bootstrap')await page.waitForFunction(()=>window.fixtureBootstrapAttempted===true);
   await page.locator('#tab-review').click();assert.equal(await page.locator('#tab-review').getAttribute('aria-selected'),'true',mode+': tabs initialize independently of optional analytics');assert.equal(await page.locator('#panel-review').isVisible(),true);
   const theme=await page.evaluate(()=>document.documentElement.dataset.theme);await page.locator('[data-theme-toggle]').click();assert.notEqual(await page.evaluate(()=>document.documentElement.dataset.theme),theme,mode+': theme works without analytics');
   await page.locator('.mobile-nav summary').click();await page.locator('.mobile-nav-panel').getByRole('link',{name:'Product',exact:true}).click();assert.equal(await page.locator('.mobile-nav').getAttribute('open'),null,mode+': mobile menu closes on native anchor navigation');assert.equal(new URL(page.url()).hash,'#product');
   if(mode==='held_sdk'){assert.equal(await page.evaluate(()=>typeof CodevalancheAnalytics),'undefined','core controls work before the optional asset resolves');const responseSeen=page.waitForResponse(response=>sdkUrl(new URL(response.url()))&&response.status()===200);release();const sdkResponse=await responseSeen;assert.equal(createHash('sha256').update(await sdkResponse.body()).digest('hex'),sdkManifest.sha256,'the versioned SDK response matches the reviewed manifest');await page.waitForFunction(()=>window.CodevalancheAnalytics?.consentManager);assert.equal(await page.locator('[data-owned-consent]').count(),1,'one successful bootstrap mounts exactly one CMP');}
   assert.equal(sdkRequests,1,mode+': one bootstrap request per document');
   // Ordinary full-document navigation is never gated on analytics readiness.
   await page.locator('.mobile-nav summary').click();await page.locator('.mobile-nav-panel a[href="/changelog.html"]').click();await page.waitForURL(origin+'/changelog.html');assert.equal(await page.locator('.nav-signin').getAttribute('href'),'/account/');
   assert.deepEqual(pageErrors,[],mode+': failed imports/bootstrap must not become unhandled exceptions');
  }finally{release();await context.close();}
 }
 console.log(`PASS optional analytics failure isolation: aborted SDK, throwing bootstrap, held SDK ${sdkManifest.sha256}; tabs/theme/mobile/native navigation and single bootstrap`);
 }finally{fixture=originalFixture;}
}
try{
 await optionalAnalyticsFailures();
 // A configured native link also works when the optional SDK cannot load.
 const isolated=await desktopContext('Win32',{reducedMotion:'reduce'});await isolated.route(sdkUrl,route=>route.abort());const isolatedPage=await isolated.newPage();await isolatedPage.goto(origin);const countBefore=downloadRequests.length;await isolatedPage.locator('[data-download-platform="windows"]').last().click();await isolatedPage.waitForURL(origin+'/fixture-download');/* The thank-you page fetches the file itself, without the gateway. */assert.equal(downloadRequests.length,countBefore);downloadRequests.length=0;await isolated.close();
 if(!process.argv.includes('--analytics-failure-only')){
 /* The download page offers its installer button to Windows PCs; CI runs on Linux. */const context=await desktopContext('Win32',{reducedMotion:'reduce'}),page=await context.newPage();let google=0;
 await context.addCookies([{name:'codevalanche_consent',value:'accepted',url:origin}]);await context.addInitScript(()=>localStorage.setItem('codevalanche_analytics_installation','legacy-not-an-owned-id'));
 context.on('request',r=>{if(/google-analytics|googletagmanager/.test(r.url()))google++;});
 await ready(page,'/?utm_source=newsletter&utm_medium=email&utm_campaign=fall_launch&email=private%40example.com&gclid=secret#access_token=private');
 // With a qualified installer the homepage is built in its release state: no "in preparation" text anywhere.
 assert.match(await page.locator('.hero-availability').textContent(),/^Version /);assert.equal(await page.locator('[data-release-status]').count(),0);assert.doesNotMatch(await page.locator('main').textContent(),/in preparation/i);
 assert.equal(requests.length,0);assert.equal(await page.evaluate(()=>CodevalancheAnalytics.consentManager.getState().state),'unknown');assert.equal(await page.evaluate(()=>localStorage.getItem('owned_analytics:codevalanche:identity')),null);
 await page.getByRole('button',{name:'Decline',exact:true}).click();await flush(page);assert.equal(requests.length,0);
 await page.locator('.cmp-manage').click();await page.getByRole('button',{name:'Accept analytics',exact:true}).click();await page.waitForFunction(()=>CodevalancheAnalytics.getStatus()==='ready');await flush(page);const session=[...events.values()].find(e=>e.event_name==='session_started');assert.equal(session.properties.attribution_kind,'campaign');assert.equal(session.context.acquisition_source,'newsletter');assert.equal(session.context.campaign,'fall_launch');assert.ok(!JSON.stringify([...events.values()]).includes('private'));
 await page.locator('#tab-review').click();await page.locator('#tab-review').click();await page.locator('.faq-list details').nth(2).locator('summary').click();await page.locator('.hero-release-link').focus();await flush(page);
 assert.equal([...events.values()].filter(e=>e.event_name==='feature_selected').length,1);assert.equal([...events.values()].filter(e=>e.event_name==='faq_toggled').length,1);
 for(const id of ['brief','execution','approval'])await page.locator('#tab-'+id).click();for(const id of ['product','agents','privacy','download'])await page.locator(`[data-analytics-faq="${id}"] summary`).click();await flush(page);
 assert.deepEqual([...new Set([...events.values()].filter(e=>e.event_name==='feature_selected').map(e=>e.properties.feature_id))].sort(),['command_approval','review','task_brief','task_execution']);assert.deepEqual([...new Set([...events.values()].filter(e=>e.event_name==='faq_toggled').map(e=>e.properties.faq_id))].sort(),['accounts','agents','download','privacy','product']);
 await page.locator('.hero-release-link').click();await page.waitForURL(origin+'/how-it-works/');await page.waitForFunction(()=>window.CodevalancheAnalytics?.consentManager);await flush(page);
 assert.ok([...events.values()].some(e=>e.event_name==='page_viewed'&&e.page_id==='how_it_works'));
 await page.locator('header .desktop-nav a[href="/how-it-works/"]').click();await page.waitForURL(origin+'/how-it-works/');await page.waitForFunction(()=>window.CodevalancheAnalytics?.consentManager);await flush(page);
 assert.ok([...events.values()].some(e=>e.event_name==='page_viewed'&&e.page_id==='how_it_works'));
 await page.locator('footer a[href="/download/"]').click();await page.waitForURL(origin+'/download/');await page.waitForFunction(()=>window.CodevalancheAnalytics?.consentManager);await flush(page);
 assert.ok([...events.values()].some(e=>e.event_name==='page_viewed'&&e.page_id==='download'));
 for(const placement of ['header','hero','footer'])assert.ok([...events.values()].some(e=>e.event_name==='navigation_used'&&e.properties.placement===placement));
 const beforeDownload=[...events.values()].filter(e=>e.event_name==='download_clicked').length;
 // Real link + ordinary native document navigation. No queue/flush barrier on this path.
 await page.locator('[data-download-platform="windows"]').last().click();await page.waitForURL(origin+'/fixture-download');
 await new Promise(r=>setTimeout(r,600));assert.equal([...events.values()].filter(e=>e.event_name==='download_clicked').length-beforeDownload,1);const clicked=[...events.values()].filter(e=>e.event_name==='download_clicked').at(-1);assert.equal(clicked.properties.release_id,'fixture_1');assert.equal(clicked.properties.artifact_id,'fixture_windows');assert.equal(clicked.properties.architecture,'x64');assert.equal(downloadRequests.filter(e=>e.eventName==='download_redirected').length,0);assert.ok(!JSON.stringify(downloadRequests).includes('receipt'));
 // Refusal preserves the same ordinary link and operational gateway request without W.
 await ready(page);await choose(page,false);const refusedRequests=requests.length;await page.locator('[data-download-platform="windows"]').last().click();await page.waitForURL(origin+'/fixture-download');assert.equal(requests.length,refusedRequests);assert.equal(downloadRequests.filter(e=>e.eventName==='download_redirected').length,0);
 for(const [route,id]of [['/agents/','agents'],['/features/multiple-accounts/','multiple_accounts'],['/local-ai/','local_ai'],['/docs/','docs'],['/security/','security']]){await ready(page,route);await choose(page,true);await flush(page);assert.ok([...events.values()].some(e=>e.event_name==='page_viewed'&&e.page_id===id),route+' has its registered page attribution');}
 await ready(page);await choose(page,true);await page.locator('.nav-signin').click();await page.waitForURL(origin+'/account/');await page.waitForFunction(()=>window.CodevalancheAnalytics?.consentManager);assert.ok([...events.values()].some(e=>e.event_name==='account_entry_clicked'&&e.properties.placement==='header'));
 await page.getByRole('button',{name:'Create account',exact:true}).click();await flush(page);assert.ok([...events.values()].some(e=>e.page_id==='account'&&e.event_name==='signup_started'));await page.getByRole('button',{name:'Back to sign in',exact:true}).click();await flush(page);assert.ok([...events.values()].some(e=>e.page_id==='account'&&e.event_name==='login_started'));assert.equal([...events.values()].some(e=>e.page_id==='account'&&e.event_name==='page_viewed'),false);
 await page.locator('.cmp-manage').click();await page.getByRole('button',{name:'Decline',exact:true}).click();const before=requests.length;await flush(page);assert.equal(requests.length,before);
 assert.equal(google,0);
 // Disabling a release must fence an already valid persisted grant, not merely a fresh visitor.
 await ready(page);await choose(page,true);await flush(page);fixture=false;await ready(page);assert.equal(await page.evaluate(()=>CodevalancheAnalytics.consentManager.getCollectionContext({touchActivity:false})),null,'disabled release must reject existing grants');const disabledExisting=requests.length;await flush(page);assert.equal(requests.length,disabledExisting);assert.equal(await page.evaluate(()=>CodevalancheAnalytics.getStatus()),'not_configured');await context.close();
 fixture=false;const disabled=await desktopContext('Win32',{viewport:{width:320,height:844},reducedMotion:'reduce'}),d=await disabled.newPage();await ready(d);await choose(d,true);assert.equal(await d.evaluate(()=>CodevalancheAnalytics.getStatus()),'not_configured');assert.ok(await d.locator('#download [data-download-platform="windows"]').count()>0,'configured status requires a real installer action');for(const href of await d.locator('[data-download-platform]').evaluateAll(links=>links.map(link=>link.getAttribute('href'))))assert.match(href,/^(https:\/\/codevalanche\.com)?\/(download-redirect\/v1\/|download\/started\/\?platform=windows-x64$)/,'production download links stay on codevalanche.com');assert.equal(await d.locator('#download').getAttribute('data-download-status'),'configured');assert.match(await d.locator('[data-owned-status]').first().innerText(),/not enabled/i);assert.equal(await d.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 for(const route of ['/privacy.html','/terms.html','/changelog.html','/account/','/account/authorize/']){await ready(d,route);assert.equal(await d.locator('[data-owned-consent]').count(),1);await d.locator('.cmp-manage').click();await d.locator('.cmp-actions button').last().click();assert.equal(await d.getByRole('dialog',{name:'Cookie preferences'}).isVisible(),true);await d.keyboard.press('Escape');}
 await disabled.close();
 const linux=await desktopContext('Linux x86_64',{reducedMotion:'reduce'}),linuxPage=await linux.newPage();await ready(linuxPage);
 const linuxCta=linuxPage.locator('#download a[data-release-primary]');assert.ok(await linuxCta.count()>0,'Linux retains a useful native download-options action');assert.equal(await linuxCta.first().getAttribute('data-download-platform'),null,'Linux primary CTA is navigation, not a compatible installer action');assert.equal(await linuxCta.first().getAttribute('href'),'/download/#platforms');
 assert.equal(await linuxPage.locator('#download .release-status-card [data-download-platform="windows"]').count(),1,'the explicitly labelled Windows release card remains available on Linux');
 assert.equal(await linuxPage.locator('#download').getAttribute('data-download-status'),'configured','final status reflects the real Windows release card after native hydration');
 const beforeLinuxEvents=events.size,beforeLinuxRequests=requests.length;await linuxCta.first().click();await linuxPage.waitForURL(origin+'/download/#platforms');assert.equal(requests.length,beforeLinuxRequests,'disabled analytics cannot gate or track the contextual navigation');assert.equal(events.size,beforeLinuxEvents);await linux.close();fixture=true;
 // New local source observations: no history backfill, normalized external referral, same-origin unknown.
 const acquisition=await localContext(),a=await acquisition.newPage();
 await ready(a,'/?utm_campaign=before_consent');await a.evaluate(()=>history.replaceState({},'', '/?utm_source=person%40example.com&utm_campaign=access_token'));
 await choose(a,true);await flush(a);let source=[...events.values()].filter(e=>e.event_name==='session_started').at(-1);assert.equal(source.properties.attribution_kind,'unknown');assert.equal(source.context.referrer_domain,'unknown');assert.equal(source.context.campaign,undefined);
 await a.goto(origin+'/privacy.html');await a.waitForFunction(()=>window.CodevalancheAnalytics?.consentManager);await flush(a);source=[...events.values()].filter(e=>e.event_name==='session_started').at(-1);assert.equal(source.properties.attribution_kind,'unknown');assert.equal(source.context.referrer_domain,'unknown');
 await a.goto(origin+'/',{referer:'https://NEWS.Example.org/private?email=secret@example.org'});await a.waitForFunction(()=>window.CodevalancheAnalytics?.consentManager);await flush(a);source=[...events.values()].filter(e=>e.event_name==='session_started').at(-1);assert.equal(source.properties.attribution_kind,'referrer');assert.equal(source.context.referrer_domain,'news.example.org');
 const peer=await acquisition.newPage();await ready(peer);await choose(peer,false);await a.waitForFunction(()=>CodevalancheAnalytics.consentManager.getState().websiteAnalytics===false);const afterPeer=requests.length;await flush(a);assert.equal(requests.length,afterPeer);await acquisition.close();
 failReceipt=true;const failed=await localContext(),f=await failed.newPage();await ready(f);await choose(f,true);assert.equal(await f.evaluate(()=>CodevalancheAnalytics.getStatus()),'unavailable');assert.match(await f.locator('[data-owned-status]').first().innerText(),/unavailable/i);await failed.close();
 const noStorage=await localContext();await noStorage.addInitScript(()=>{Storage.prototype.getItem=()=>{throw new DOMException('blocked','SecurityError')};Storage.prototype.setItem=()=>{throw new DOMException('blocked','SecurityError')};});const n=await noStorage.newPage();await ready(n);await n.locator('#tab-review').click();assert.equal(await n.locator('#panel-review').isVisible(),true);await choose(n,false);await noStorage.close();
 const forbidden=await localContext();await forbidden.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new DOMException('blocked','SecurityError')}}));const x=await forbidden.newPage();await ready(x);await x.locator('#tab-review').click();assert.equal(await x.locator('#panel-review').isVisible(),true);await choose(x,false);await forbidden.close();
 assert.deepEqual(errors,[]);console.log(`PASS website analytics integration: ${events.size} T1-validated events; GA zero; consent/default navigation/mobile/no-storage/disabled-provider`);
}
}finally{await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
