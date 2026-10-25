import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {chromium} from 'playwright';
import {LOCALES} from '../src/locales/manifest.js';

const bundle = await build({entryPoints:['src/account-funnel.js'], bundle:true, write:false, format:'iife'});
test('the actual website consent integration refuses, grants and withdraws in every supported language', async () => {
  const browser = await chromium.launch();
  try {
    for (const locale of LOCALES) {
      const context = await browser.newContext();
      try {
        const calls = [], errors = [];
        const catalog = locale.slug ? JSON.parse(await readFile(`src/locales/${locale.slug}.json`, 'utf8')) : {};
        await context.route('**/*', async route => {
          const request = route.request(), url = new URL(request.url());
          if (url.origin === 'https://collector.example.test') {
            const body = request.postDataJSON();calls.push({path:url.pathname, body, headers:request.headers()});
            if (request.method() === 'DELETE') return route.fulfill({json:{revoked:true,generation:body.generation+1}});
            if (url.pathname.endsWith('/receipts')) return route.fulfill({json:{...body,receiptId:crypto.randomUUID(),issuedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+86400000).toISOString(),collectionToken:'fixture_collection_capability_123456',revocationProof:'fixture_revocation_capability_123456'}});
            return route.fulfill({json:{acceptedIds:body.events.map(e=>e.event_id),duplicateIds:[],rejected:[],generation:body.generation,receivedAt:new Date().toISOString(),retryAfterMs:null}});
          }
          if (url.pathname.startsWith('/locales/')) return route.fulfill({json:catalog});
          if (url.pathname === '/fixture.js') return route.fulfill({body:bundle.outputFiles[0].text,contentType:'text/javascript'});
          if (url.origin !== 'https://codevalanche.com') throw new Error('Unexpected external request');
          return route.fulfill({body:`<!doctype html><html lang="${locale.tag}"><body><h1>Fixture</h1><script>window.CODEVALANCHE_ANALYTICS={enabled:true,baseUrl:'https://collector.example.test/v1',pageVersion:'fixture'};</script><script src="/fixture.js"></script></body></html>`,contentType:'text/html'});
        });
        const page = await context.newPage();page.on('pageerror', e=>errors.push(e.message));
        await page.goto(`https://codevalanche.com/${locale.slug ? locale.slug+'/' : ''}`);
        await page.waitForFunction(()=>window.CodevalancheLocale && window.CodevalancheAnalytics);
        assert.equal(await page.locator('html').getAttribute('lang'),locale.tag);
        await page.waitForFunction(()=>document.querySelector('.cmp-actions button').textContent === (CodevalancheLocale.translate('Accept analytics')));
        assert.equal(calls.length,0,`${locale.tag}: no request before choice`);
        await page.locator('.cmp-actions button').nth(1).click();
        assert.equal(await page.evaluate(()=>CodevalancheAnalytics.consentManager.getCollectionContext()),null);
        assert.equal(calls.length,0,`${locale.tag}: refusal sends nothing`);
        assert.equal(await page.evaluate(()=>localStorage.getItem('owned_analytics:codevalanche:identity')),null);
        await page.locator('.cmp-manage').click();await page.locator('.cmp-actions button').nth(0).click();
        await page.waitForFunction(()=>CodevalancheAnalytics.getStatus()==='ready');
        await page.evaluate(()=>CodevalancheAnalytics.flush());
        assert.equal(calls.filter(c=>c.path.endsWith('/receipts')).length,1);
        assert.ok(calls.some(c=>c.body.events?.some(e=>e.event_name==='page_viewed')),locale.tag);
        for (const call of calls) assert.equal(call.headers.cookie,undefined);
        await page.locator('.cmp-manage').click();await page.locator('.cmp-actions button').nth(1).click();
        await page.waitForFunction(()=>CodevalancheAnalytics.consentManager.getState().state==='withdrawn');
        const before = calls.filter(c=>c.body.events).length;
        await page.evaluate(()=>CodevalancheAnalytics.flush());
        assert.equal(calls.filter(c=>c.body.events).length,before);
        assert.equal(await page.evaluate(()=>CodevalancheAnalytics.consentManager.getCollectionContext()),null);
        for (const key of ['identity','queue','receipt']) assert.equal(await page.evaluate(key=>localStorage.getItem('owned_analytics:codevalanche:'+key),key),null);
        assert.deepEqual(errors,[],locale.tag);
      } finally {await context.close();}
    }
  } finally {await browser.close();}
});
