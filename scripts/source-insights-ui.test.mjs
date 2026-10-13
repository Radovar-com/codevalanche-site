import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const uid = '11111111-1111-4111-8111-111111111111';
const params = { userId: uid, from: '2026-10-24T21:00:00Z', to: '2026-10-25T04:00:00Z', timeZone: 'Europe/Bucharest' };
async function fixture(t) {
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/') { res.setHeader('Content-Type','text/html'); res.end('<link rel="stylesheet" href="/insights/insights.css"><main id="host"></main>'); return; }
      const url = new URL(req.url, 'http://localhost');
      if (!['/insights/sourceInsights.js','/insights/insights.css'].includes(url.pathname) && !/^\/assets\/fonts\/[A-Za-z0-9.-]+$/.test(url.pathname)) { res.writeHead(404); res.end(); return; }
      res.setHeader('Content-Type', url.pathname.endsWith('.js') ? 'text/javascript' : url.pathname.endsWith('.woff2') ? 'font/woff2' : 'text/css');
      res.end(await readFile(new URL(`../src${url.pathname}`, import.meta.url)));
    } catch { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ executablePath: process.env.ACCOUNT_CHROME_PATH || undefined, headless: true });
  const page = await browser.newPage();
  t.after(async () => { await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.evaluate(async ({params}) => {
    window.calls = [];
    window.responses = {
      'admin.analytics.summary': { sourceInsights: { status: 'ready', window: { ...params, bounds: '[from,to)' }, activity: { status: 'observed', observedEvents: 1102, observedRunSuccesses: 1101, verifiedSuccessfulRuns: null, actualNativeProducer: 'unqualified', allNativeRunsCovered: false, days: [{day:'2026-10-25',observedEvents:1102}], hours: [{startUtc:'2026-10-25T00:00:00Z',localHour:'2026-10-25 03:00',observedEvents:1101}] }, security: { observedLoginSuccesses: 1, observedLoginFailures: 1, observedPasswordRefusals: 1, lastLogin: null, coverage: {status:'coverage_incomplete'} }, notifications: {signupCreated:1,signupVerified:0,queued:0,retry:1,notConfigured:0,deadLetter:0,delivered:0}, audit: {recordedEvents:0} } },
      'admin.security.list': { events: [{eventId:'one',eventName:'<img src=x onerror="window.injected=true">',source:'provider_audit',outcome:'failed',occurredAt:params.from}], nextCursor:'second', hasMore:true },
      'admin.notifications.list': { items: [{id:'notice',event_type:'signup_created',state:'retry',created_at:params.from}], nextCursor:null, hasMore:false },
      'admin.audit.list': { items: [], nextCursor:null, hasMore:false },
    };
    window.request = async (operation, fields) => { window.calls.push({operation,fields}); return window.responses[operation]; };
    window.module = await import('/insights/sourceInsights.js');
  }, {params});
  return page;
}

test('panel stays disabled without opt-in and makes no operator requests', async t => {
  const page = await fixture(t);
  await page.evaluate(async params => { window.panel = await window.module.mountSourceInsights({host:document.querySelector('#host'),request:window.request,params}); }, params);
  assert.equal(await page.locator('#host').getAttribute('data-state'), 'disabled');
  assert.equal(await page.evaluate(() => window.calls.length), 0);
});

test('responsive panel preserves readable source labels and unknown consent at desktop and narrow widths', async t => {
  const page = await fixture(t);
  await page.evaluate(async params => {
    window.responses['admin.analytics.summary'].sourceInsights.activity.status = 'consent_disabled';
    window.responses['admin.analytics.summary'].sourceInsights.activity.observedEvents = null;
    window.responses['admin.analytics.summary'].sourceInsights.activity.days = [];
    window.responses['admin.analytics.summary'].sourceInsights.activity.hours = [];
    window.responses['admin.security.list'].events[0].eventName = 'login_failed';
    window.panel = await window.module.mountSourceInsights({host:document.querySelector('#host'),request:window.request,params,enabled:true});
  }, params);
  for (const width of [1280, 390]) {
    await page.setViewportSize({width,height:900});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator('[data-metric="observedEvents"]').textContent(), 'Unknown');
    assert.equal(await page.locator('[data-metric="observedRunSuccesses"]').textContent(), 'Unknown');
    assert.match(await page.locator('#host').textContent(), /consent is disabled/);
    if (process.env.ACCOUNT_INSIGHTS_OUTPUT) {
      await mkdir(process.env.ACCOUNT_INSIGHTS_OUTPUT,{recursive:true});
      await page.screenshot({path:`${process.env.ACCOUNT_INSIGHTS_OUTPUT}/SOL8-panel-${width}.png`,fullPage:true});
    }
  }
});

test('read-only panel distinguishes observed counts, unknown native proof, source coverage and escaped paged feeds', async t => {
  const page = await fixture(t);
  await page.evaluate(async params => { window.panel = await window.module.mountSourceInsights({host:document.querySelector('#host'),request:window.request,params,enabled:true}); }, params);
  assert.equal(await page.locator('[data-metric="observedEvents"]').textContent(), '1,102');
  assert.equal(await page.locator('[data-metric="verifiedSuccessfulRuns"]').textContent(), 'Unknown');
  assert.match(await page.locator('#host').textContent(), /Native producer: unqualified/);
  assert.match(await page.locator('#host').textContent(), /Coverage incomplete/);
  assert.match(await page.locator('#host').textContent(), /all stored dates/);
  assert.equal(await page.locator('#host img').count(), 0);
  const calls = await page.evaluate(() => window.calls);
  assert.deepEqual(calls.map(c => c.operation).sort(), ['admin.analytics.summary','admin.audit.list','admin.notifications.list','admin.security.list']);
  assert.equal(calls[0].fields.includeSources, true);
  await page.evaluate(() => { window.responses['admin.security.list'] = {events:[{eventId:'one',eventName:'duplicate'},{eventId:'two',eventName:'login_failed',source:'provider_audit',outcome:'failed'}],hasMore:false,nextCursor:null}; });
  await page.locator('[data-more="security"]').click();
  assert.equal(await page.locator('[data-feed="security"] tbody tr').count(), 2);
  assert.equal(await page.locator('[data-metric="observedEvents"]').textContent(), '1,102');
  assert.equal((await page.evaluate(() => window.calls.at(-1))).fields.cursor, 'second');
});

test('failed sources remain unknown and switching identity cannot restore an older response', async t => {
  const page = await fixture(t);
  await page.evaluate(async params => {
    window.panel = await window.module.mountSourceInsights({host:document.querySelector('#host'),request:(...args)=>window.request(...args),params,enabled:true});
    window.request = async (operation, fields) => {
      if (fields.userId === params.userId) return await new Promise(resolve => window.pending.push(() => resolve(window.responses[operation])));
      throw new Error('synthetic unavailable');
    };
    window.pending = [];
    window.older = window.panel.select(params);
    await window.panel.select({...params,userId:'22222222-2222-4222-8222-222222222222'});
    for (const release of window.pending) release();
    await window.older;
  }, params);
  assert.equal(await page.locator('[data-metric="observedEvents"]').textContent(), 'Unknown');
  assert.equal(await page.locator('[data-feed="security"] tbody tr').count(), 0);
  assert.match(await page.locator('#host').textContent(), /Source unavailable/);
  assert.equal(await page.evaluate(() => window.injected), undefined);
});
