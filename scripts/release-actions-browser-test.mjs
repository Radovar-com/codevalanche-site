// Local source fixture: never builds shared dist or contacts real services.
import {chromium} from 'playwright';
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import emptyManifest from '../supabase/functions/_shared/download-manifest.json' with {type:'json'};
const manifest={version:1,gatewayBaseUrl:'https://downloads.example.org/functions/v1/download-redirect/v1',allowedOrigins:['https://artifacts.example.org'],assets:[{siteId:'codevalanche',platform:'windows',architecture:'x64',releaseId:'fixture_release',artifactId:'fixture_windows',qualified:true,targetUrl:'https://artifacts.example.org/not-an-app-version-99.exe'}]};
const bundle=(await build({entryPoints:['src/downloads.js'],bundle:true,write:false,format:'iife'})).outputFiles[0].text;
const funnel=(await build({entryPoints:['src/account-funnel.js'],bundle:true,write:false,format:'esm'})).outputFiles[0].text;
const recorded=[],external=[],errors=[];
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname==='/broken-funnel.js'){res.writeHead(503,{'content-type':'text/javascript'});res.end('');return;}
 if(url.pathname==='/downloads.js'||url.pathname==='/funnel.js'){res.setHeader('content-type','text/javascript');res.end(url.pathname==='/downloads.js'?bundle:funnel);return;}
 if(url.pathname==='/collector/consent/receipts'){
  const chunks=[];for await(const part of req)chunks.push(part);const body=JSON.parse(Buffer.concat(chunks));
  res.setHeader('content-type','application/json');res.end(JSON.stringify({receiptId:crypto.randomUUID(),...body,issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),collectionToken:'fixture_collection_capability_123456',revocationProof:'fixture_revocation_capability_123456'}));return;
 }
 if(url.pathname==='/collector/events'){
  const chunks=[];for await(const part of req)chunks.push(part);const body=JSON.parse(Buffer.concat(chunks));recorded.push(...body.events);
  res.setHeader('content-type','application/json');res.end(JSON.stringify({acceptedIds:body.events.map(e=>e.event_id),duplicateIds:[],rejected:[],generation:body.generation,receivedAt:new Date().toISOString(),retryAfterMs:null}));return;
 }
 if(url.pathname==='/locales/ro.json'){res.setHeader('content-type','application/json');res.end(JSON.stringify({'Download for Windows':'Descarcă pentru Windows','Download':'Descarcă','Public installer in preparation.':'Instalator public în pregătire.','Release information is unavailable.':'Informațiile despre versiune nu sunt disponibile.','Windows installer available.':'Instalator Windows disponibil.'}));return;}
 if(url.pathname==='/runtime-strings'){res.end(await readFile('src/locales/runtime-strings.en.json'));return;}
 const mode=url.searchParams.get('mode');const config=mode==='missing'?'undefined':mode==='invalid'?'{}':JSON.stringify(mode==='empty'?emptyManifest:manifest);
 res.setHeader('content-type','text/html');res.end(`<!doctype html><html lang=en><head><script>window.CODEVALANCHE_RELEASE_MANIFEST=${config};window.CODEVALANCHE_ANALYTICS={enabled:true,baseUrl:location.origin+'/collector',pageVersion:'fixture_release'};</script>${mode==='late'?'':'<script src=/downloads.js></script>'}</head><body><main><h1 data-release-heading>Codevalanche for Windows. Public installer in preparation.</h1><section class=hero><a id=primary data-release-primary href=/how-it-works/#example>See how it works</a><p data-release-status>Static truthful release status</p></section><section id=download><article data-dl-platform=windows><span class=dl-card-state>Public installer in preparation.</span></article><article data-dl-platform=mac-arm><span class=dl-card-state>Unavailable</span></article></section></main><button data-open-consent>Manage cookies</button><script type=module src=${mode==="brokenanalytics"?"/broken-funnel.js":"/funnel.js"}></script>${mode==='late'?'<script>addEventListener("load",()=>{const s=document.createElement("script");s.src="/downloads.js";document.body.append(s)})</script>':''}</body></html>`);
}).listen(0,'127.0.0.1');
await new Promise(resolve=>server.once('listening',resolve));
const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch({headless:true});
async function visit(mode='empty',userAgent='Mozilla/5.0 (Windows NT 10.0; Win64; x64)',locale='en'){
 const context=await browser.newContext({userAgent});
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort();}return route.continue();});
 await context.addInitScript(()=>Object.defineProperty(navigator,'platform',{value:''}));
 if(locale==='ro')await context.addCookies([{name:'codevalanche_language',value:'ro',url:origin}]);
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin+`${locale==='ro'?'/ro/':'/'}?mode=${mode}`);await page.waitForFunction(broken=>(broken||window.CodevalancheAnalytics)&&window.CODEVALANCHE_DOWNLOAD_LINKS,mode==='brokenanalytics');return {context,page};
}
try{
 for(const [mode,status] of [['empty','Public installer in preparation.'],['missing','Release information is unavailable.'],['invalid','Release information is unavailable.']]){
  const {context,page}=await visit(mode);assert.equal(await page.locator('p[data-release-status]').textContent(),status);
  assert.equal(await page.locator('#primary').getAttribute('href'),'/how-it-works/#example');assert.equal(await page.locator('#primary').textContent(),'See how it works');
  assert.equal(await page.locator('[data-download-platform]').count(),0);
  assert.equal(await page.locator('[data-dl-platform=windows] .dl-card-state').textContent(),status);
  assert.equal(await page.locator('[data-release-heading]').textContent(),mode==='empty'?'Codevalanche for Windows. Public installer in preparation.':'Codevalanche for Windows. Release information is unavailable.');
  await page.evaluate(()=>CodevalancheAnalytics.setConsent({websiteAnalytics:true}));await page.locator('#primary').focus();await page.keyboard.press('Enter');await page.waitForURL('**/how-it-works/#example');
  // The real click handler's lifecycle delivery survives native navigation.
  await page.waitForFunction(()=>window.CodevalancheAnalytics);await page.evaluate(()=>CodevalancheAnalytics.flush());
  assert.equal(recorded.filter(e=>e.event_name==='download_clicked').length,0,'fallback navigation must never count as a download');await context.close();
 }
 for(const mode of ['approved','late']){
  const {context,page}=await visit(mode);await page.waitForFunction(()=>document.querySelector('#primary').hasAttribute('data-download-platform'));
  const link=page.locator('#primary');assert.equal(await link.textContent(),'Download for Windows');assert.equal(await link.getAttribute('href'),manifest.gatewayBaseUrl+'/codevalanche/windows/fixture_release/fixture_windows');
  for(const [key,value] of Object.entries({platform:'windows',release:'fixture_release',artifact:'fixture_windows',architecture:'x64'}))assert.equal(await link.getAttribute('data-download-'+key),value);
  assert.equal(await page.locator('[data-dl-platform=windows] a.dl-card-state').count(),1);assert.equal(await page.locator('[data-dl-platform=mac-arm] a').count(),0);
  assert.equal(await page.locator('[data-dl-platform=windows] [data-release-details]').textContent(),'Windows · x64 · downloads.example.org');
  assert.equal(await page.locator('[data-release-heading]').textContent(),'Codevalanche for Windows.');
  assert.equal(await page.locator('p[data-release-status]').textContent(),'Windows installer available.');assert.equal(await page.locator('body').textContent().then(x=>x.includes('99')),false,'no inferred filename version');
  await page.evaluate(()=>CodevalancheAnalytics.setConsent({websiteAnalytics:true}));const before=recorded.filter(e=>e.event_name==='download_clicked').length;
  await page.evaluate(()=>{document.addEventListener('click',event=>event.preventDefault(),{once:true});document.querySelector('#primary').click();});await page.evaluate(()=>CodevalancheAnalytics.flush());
  assert.equal(recorded.filter(e=>e.event_name==='download_clicked').length,before+1,'one real click produces one semantic download intent');await context.close();
 }
 for(const ua of ['unknown','Mozilla/5.0 (Macintosh; Intel Mac OS X)','Mozilla/5.0 (Linux x86_64)','Mozilla/5.0 (iPhone)','Mozilla/5.0 (Linux; Android 14)','Mozilla/5.0 (Windows Phone; Android)']){
  const {context,page}=await visit('approved',ua);assert.equal(await page.locator('#primary').getAttribute('href'),'/how-it-works/#example');assert.equal(await page.locator('#primary').getAttribute('data-download-platform'),null);assert.equal(await page.locator('[data-dl-platform=windows] a').count(),1,'other visitors can inspect explicitly identified Windows release information');await context.close();
 }
 const {context,page}=await visit('approved',undefined,'ro');await page.waitForFunction(()=>window.CodevalancheLocale?.locale.tag==='ro');assert.equal(await page.locator('#primary').textContent(),'Descarcă pentru Windows');assert.equal(await page.locator('p[data-release-status]').textContent(),'Instalator Windows disponibil.');await context.close();
 const broken=await visit('brokenanalytics');assert.equal(await broken.page.locator('#primary').getAttribute('data-download-platform'),'windows');assert.equal(await broken.page.evaluate(()=>window.CodevalancheAnalytics),undefined);await broken.context.close();
 assert.deepEqual(external,[],'fixtures cannot request external auth, telemetry or artifacts');assert.deepEqual(errors,[]);
 console.log('PASS shared release source browser fixture: DOM ready/late, empty/missing/invalid/approved, Windows compatibility, native metadata, fallback and download event semantics, locale refresh, no external requests');
}finally{await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
