import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDownloadRedirectHandler} from '../functions/download-redirect/index.ts';
import {downloadCoverage,createDownloadEvidenceStore} from '../functions/_shared/downloadEvidence.ts';
import {reconcileReleaseAssetSnapshot,importReleaseAssetSnapshot} from '../functions/_shared/releaseAssetSnapshots.ts';
import {releaseRegistry} from '../functions/_shared/downloadManifest.ts';
import {downloadLinks} from '../functions/_shared/downloadManifest.js';
import {sanitizeEvent,validStoredEvent} from '../../src/analytics/core/sanitizer.js';

export const manifest={version:1,gatewayBaseUrl:'https://example.supabase.co/functions/v1/download-redirect/v1',allowedOrigins:['https://artifacts.example.org'],assets:[{siteId:'codevalanche',platform:'windows',architecture:'x64',releaseId:'fixture_1',artifactId:'fixture_windows',qualified:true,targetUrl:'https://artifacts.example.org/fixture.exe'}]};
const path='https://example.supabase.co/functions/v1/download-redirect/v1/codevalanche/windows/fixture_1/fixture_windows';
test('manifest maps native links and browser sanitizer to the same qualified registry',()=>{
 assert.equal(downloadLinks(manifest).windows.href,path);
 const properties={cta_id:'download',platform:'windows',architecture:'x64',release_id:'fixture_1',artifact_id:'fixture_windows',placement:'download'};
 assert.equal(sanitizeEvent('download_clicked',properties,{},'codevalanche'),null);
 assert.ok(sanitizeEvent('download_clicked',properties,{},'codevalanche',releaseRegistry(manifest)));
 assert.equal(sanitizeEvent('download_clicked',{...properties,artifact_id:'invented'}, {},'codevalanche',releaseRegistry(manifest)),null);
});
test('empty production manifest is honestly not configured',async()=>{
 const handler=createDownloadRedirectHandler();const response=await handler(new Request(path));
 assert.equal(response.status,404);assert.equal((await response.json()).status,'not_configured');
 assert.deepEqual(downloadCoverage(),{redirects:'not_configured',releaseProvider:'not_configured',transferServed:'not_configured',firstObservedOpens:'not_configured',activations:'not_configured',guestActivation:'unmeasured'});
});
test('provider delivery and native outages stay explicit and Guest activation stays unmeasured',()=>{
 const coverage=downloadCoverage({manifest,providerConfigured:true,providerAvailable:false,nativeQualified:true,nativeAvailable:false,deliveryQualified:true,deliveryAvailable:false});
 assert.equal(coverage.releaseProvider,'unavailable');assert.equal(coverage.transferServed,'unavailable');assert.equal(coverage.firstObservedOpens,'unavailable');assert.equal(coverage.activations,'unavailable');assert.equal(coverage.guestActivation,'unmeasured');
 assert.equal(downloadCoverage({manifest}).transferServed,'not_configured');
});
test('only exact qualified manifest routes redirect; never request-supplied targets',async()=>{
 const records=[];const handler=createDownloadRedirectHandler({manifest,record:e=>records.push(e)});
 for(const suffix of ['?url=https://evil.example','?target=https://artifacts.example.org/fixture.exe','/extra'])assert.equal((await handler(new Request(path+suffix))).status,400);
 assert.equal((await handler(new Request(path.replace('/windows/','/linux/')))).status,404);
 for(const targetUrl of ['javascript:alert(1)','https://evil.example/fixture.exe','https://artifacts.example.org/fixture.exe?token=private','https://x:password@artifacts.example.org/a'])assert.equal((await createDownloadRedirectHandler({manifest:{...manifest,assets:[{...manifest.assets[0],targetUrl}]}})(new Request(path))).status,404);
 const response=await handler(new Request(path,{headers:{'Range':'bytes=0-99','Cookie':'private','User-Agent':'private'}}));
 assert.equal(response.status,302);assert.equal(response.headers.get('location'),manifest.assets[0].targetUrl);assert.equal(response.headers.get('cache-control'),'no-store');
 assert.equal(records.at(-1).eventName,'download_redirected');assert.ok(!JSON.stringify(records).includes('private'));assert.equal(records.at(-1).releaseId,'fixture_1');
 assert.equal(records.at(-1).responseClass,'3xx');assert.equal(records.at(-1).normalizedError,null);
 assert.equal(Object.hasOwn(records.at(-1),'completed'),false);
 // A direct gateway request and a retry are separate requests, never unique people/files.
 await handler(new Request(path));assert.equal(records.filter(e=>e.eventName==='download_redirected').length,2);
 const head=await handler(new Request(path,{method:'HEAD'}));assert.equal(head.status,302);assert.equal(records.filter(e=>e.eventName==='download_redirected').length,2);
});
test('known download navigation survives failed or hung evidence collector',async()=>{
 for(const record of [()=>{throw new Error('private database failure');},()=>Promise.reject(new Error('private')),()=>new Promise(()=>{})]){
  const response=await Promise.race([createDownloadRedirectHandler({manifest,record})(new Request(path)),new Promise((_,reject)=>setTimeout(()=>reject(new Error('blocked redirect')),100))]);
  assert.equal(response.status,302);
 }
});
test('registry contains only trusted qualified IDs and D store accepts normalized evidence only',async()=>{
 assert.deepEqual(releaseRegistry(manifest),{release:['unknown','fixture_1'],artifact:['unknown','fixture_windows']});
 const calls=[];const store=createDownloadEvidenceStore({rpc:async(name,args)=>{calls.push({name,args});return {data:true,error:null};}});
 await store({eventName:'download_redirected',siteId:'codevalanche',platform:'windows',architecture:'x64',releaseId:'fixture_1',artifactId:'fixture_windows',observedAt:'2026-10-15T10:00:00.000Z',requestId:'11111111-1111-4111-8111-111111111111',targetUrl:'private',sessionId:'private'});
 assert.equal(calls[0].name,'wa_record_download_request');assert.ok(!JSON.stringify(calls).includes('private'));
});
const snapshot=(countTotal,extra={})=>({siteId:'codevalanche',source:'release_provider',releaseId:'fixture_1',artifactId:'fixture_windows',countTotal,observedAt:'2026-10-15T10:00:00.000Z',sourceWatermark:'2026-10-15T10:00:00.000Z',assetRemoved:false,...extra});
test('provider deltas are explicit baseline/reset/removal and never completion or negative downloads',()=>{
 assert.deepEqual(reconcileReleaseAssetSnapshot(null,snapshot(50)),{counterStatus:'baseline',countDelta:null});
 assert.deepEqual(reconcileReleaseAssetSnapshot(snapshot(50),snapshot(60)),{counterStatus:'measured',countDelta:10});
 assert.deepEqual(reconcileReleaseAssetSnapshot(snapshot(60),snapshot(4)),{counterStatus:'reset',countDelta:null});
 assert.deepEqual(reconcileReleaseAssetSnapshot(snapshot(60),snapshot(0,{assetRemoved:true})),{counterStatus:'asset_removed',countDelta:null});
 assert.deepEqual(reconcileReleaseAssetSnapshot(snapshot(60,{releaseId:'old'}),snapshot(70)),{counterStatus:'baseline',countDelta:null});
 assert.deepEqual(reconcileReleaseAssetSnapshot(snapshot(60,{assetRemoved:true}),snapshot(70)),{counterStatus:'baseline',countDelta:null});
 assert.throws(()=>reconcileReleaseAssetSnapshot(null,snapshot(-1)));
});
test('snapshot import uses durable serialized RPC and rejects unsafe input before call',async()=>{
 const calls=[];const service={rpc:async(name,args)=>{calls.push({name,args});return {data:{counterStatus:'baseline',countDelta:null,duplicate:false},error:null};}};
 assert.equal((await importReleaseAssetSnapshot(service,snapshot(20))).counterStatus,'baseline');
 assert.equal(calls[0].name,'wa_import_release_asset_snapshot');
 await assert.rejects(()=>importReleaseAssetSnapshot(service,snapshot(1,{artifactId:'https://private'})));
 assert.equal(calls.length,1);
});

test('provider adapter forwards unknown watermark unchanged and preserves explicit SQL freshness provenance',async()=>{
 const calls=[],result={counterStatus:'measured',countDelta:10,duplicate:false,sourceWatermark:null,sourceWatermarkHighWater:'2026-10-15T09:00:00.000Z',sourceFreshness:'unknown'};
 const service={rpc:async(name,args)=>{calls.push({name,args});return {data:result,error:null};}};
 const imported=await importReleaseAssetSnapshot(service,snapshot(110,{sourceWatermark:null}));
 assert.equal(calls[0].args.p_source_watermark,null);assert.deepEqual(imported,result);
 assert.notEqual(imported.sourceWatermark,snapshot(110).observedAt,'observation time must not become provider freshness');
});
