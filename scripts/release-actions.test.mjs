import test from 'node:test';
import assert from 'node:assert/strict';
import checkedInManifest from '../supabase/functions/_shared/download-manifest.json' with {type:'json'};
const module=await import('../src/release-actions.js').catch(()=>({}));
export const approvedManifest={version:1,gatewayBaseUrl:'https://downloads.example.org/functions/v1/download-redirect/v1',allowedOrigins:['https://artifacts.example.org'],assets:[{siteId:'codevalanche',platform:'windows',architecture:'x64',releaseId:'fixture_release',artifactId:'fixture_windows',qualified:true,targetUrl:'https://artifacts.example.org/not-an-app-version-99.exe'}]};
test('shared release state distinguishes unavailable configuration from an empty approved manifest',()=>{
 assert.equal(typeof module.releaseState,'function','shared release state is implemented');
 for(const manifest of [undefined,null,{}, {...approvedManifest,version:2},{...approvedManifest,assets:{}},{...approvedManifest,assets:[null]},{...approvedManifest,assets:[{}]},{...approvedManifest,gatewayBaseUrl:'javascript:alert(1)'}])assert.equal(module.releaseState(manifest).status,'unavailable');
 assert.equal(module.releaseState({...approvedManifest,assets:[]}).status,'preparation');
 assert.notEqual(module.releaseState(checkedInManifest).status,'unavailable','the actual embedded manifest is valid');
 assert.equal(module.releaseState(approvedManifest).status,'available');
 assert.equal(module.releaseState({...approvedManifest,assets:[{...approvedManifest.assets[0],qualified:false}]}).status,'preparation');
});
test('only identified compatible Windows desktops receive the primary installer action',()=>{
 assert.equal(typeof module.releaseState,'function');
 const windows={userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',platform:'Win32'};
 assert.equal(module.releaseState(approvedManifest,windows).primary?.architecture,'x64');
 for(const visitor of [{},{userAgent:'unknown',platform:''},{userAgent:'Windows Phone Android',platform:'Win32'},{userAgent:'Mozilla/5.0 (iPhone)',platform:'iPhone'},{userAgent:'Mozilla/5.0 (Macintosh)',platform:'MacIntel'},{userAgent:'Linux x86_64',platform:'Linux x86_64'},{...windows,userAgentData:{platform:'Windows',mobile:true}},{userAgent:'Windows NT 10.0; ARM64',platform:'Win32'}])assert.equal(module.releaseState(approvedManifest,visitor).primary,null,JSON.stringify(visitor));
 const arm={...approvedManifest,assets:[{...approvedManifest.assets[0],architecture:'arm64'}]};
 assert.equal(module.releaseState(arm,windows).primary,null,'unknown Windows architecture cannot imply arm64 compatibility');
 assert.equal(module.releaseState({...approvedManifest,allowedOrigins:['https://unapproved.example.org']},windows).primary,null);
 assert.equal(module.releaseState({...approvedManifest,assets:[...approvedManifest.assets,...approvedManifest.assets]},windows).primary,null,'ambiguous release routes fail closed');
});

test('malformed or insecure asset targets are unavailable independently of release qualification',()=>{
 for(const targetUrl of ['not a URL','http://artifacts.example.org/fixture.exe','https://user:secret@artifacts.example.org/fixture.exe','https://artifacts.example.org/fixture.exe?token=x','https://artifacts.example.org/fixture.exe#fragment']){
  for(const qualified of [true,false]){
   const manifest={...approvedManifest,assets:[{...approvedManifest.assets[0],targetUrl,qualified}]};
   assert.deepEqual(module.releaseState(manifest),{status:'unavailable',links:{},primary:null},targetUrl);
  }
 }
 const validUnapproved={...approvedManifest,assets:[{...approvedManifest.assets[0],targetUrl:'https://unapproved.example.org/fixture.exe'}]};
 assert.equal(module.releaseState(validUnapproved).status,'preparation','syntactically secure targets still require server-owned origin qualification');
 assert.deepEqual(module.releaseState(validUnapproved).links,{});
});
