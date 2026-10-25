import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {chromium} from 'playwright';

// Characterize the current external-delivery boundary using only intercepted traffic.
// A manifest proves eligibility, not click-time availability or completed transfer.
const bundle = await build({entryPoints:['src/download-experience.js'],bundle:true,write:false,format:'iife',globalName:'downloads'});
const target = 'https://artifacts.example.test/fixture.exe';
const manifest = {version:1,gatewayBaseUrl:'https://site.example.test/download-redirect/v1',allowedOrigins:['https://artifacts.example.test'],assets:[{siteId:'codevalanche',platform:'windows',architecture:'x64',releaseId:'fixture',artifactId:'fixture',qualified:true,targetUrl:target}]};
const browser = await chromium.launch();
try {
  for (const status of [404,503]) {
    const context = await browser.newContext();
    try {
      await context.route('**/*',route=>route.fulfill({body:'<!doctype html><html><body>Local fixture</body></html>',contentType:'text/html'}));
      await context.route(target,route=>route.fulfill({status,body:`<!doctype html><html><body>Provider fixture error ${status}</body></html>`,contentType:'text/html'}));
      const page = await context.newPage();
      await page.goto('https://site.example.test/download/started/?platform=windows-x64');
      await page.setContent('<main data-download-started><div data-started-ok>Starting</div><div data-started-missing hidden>Unavailable</div></main>');
      await page.addScriptTag({content:bundle.outputFiles[0].text});
      const delivered = page.waitForResponse(response=>response.url()===target);
      await page.evaluate(manifest=>downloads.startRequestedDownload(document,manifest,{delay:0}),manifest);
      assert.equal((await delivered).status(),status);
      await page.waitForURL(target);
      await page.waitForLoadState('domcontentloaded');
      assert.equal(await page.locator('[data-started-missing]').count(),0,'navigation leaves the site fallback behind');
      assert.match(await page.locator('body').textContent(),/Provider fixture error/);
    } finally {await context.close();}
  }
  console.log('PASS local characterization: external asset 404/503 replaces the thank-you page; click-time availability remains unmeasured.');
} finally {await browser.close();}
