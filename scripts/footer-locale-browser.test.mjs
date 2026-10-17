import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

// Exercise unbundled production site/locale code; never read or rebuild dist.
const root = path.resolve('src');
let server, browser, origin;
before(async () => {
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://fixture');
      if (url.pathname.endsWith('/')) {
        response.setHeader('Content-Type', 'text/html; charset=utf-8');
        response.end(`<!doctype html><html><head><meta charset="utf-8"></head><body>
          <div id="wrap" style="width:${url.searchParams.get('small') ? 400 : 800}px;height:300px"><canvas id="footer-canvas"></canvas></div>
          <script type="module">
            import { initializeLocale } from '/src/locales/runtime.js';
            window.finishLocale = () => initializeLocale();
            if (!new URL(location.href).searchParams.has('late')) await window.finishLocale();
            await import('/src/site.js');
            await document.fonts.ready;
            window.fixtureReady = true;
          </script></body></html>`);
        return;
      }
      // Optional telemetry is outside this focused fixture and must make no requests.
      if (url.pathname === '/src/account-funnel.js') {
        response.setHeader('Content-Type', 'text/javascript'); response.end('export {};'); return;
      }
      const relative = url.pathname.startsWith('/locales/') ? url.pathname : url.pathname.replace(/^\/src/, '');
      const target = path.resolve(root, `.${relative}`);
      assert.ok(target.startsWith(root + path.sep));
      const body = await readFile(target);
      response.setHeader('Content-Type', target.endsWith('.json') ? 'application/json' : 'text/javascript');
      response.end(body);
    } catch { response.writeHead(404); response.end(); }
  }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); });

async function fixture(route, reducedMotion = 'no-preference') {
  const context = await browser.newContext({ reducedMotion, viewport: { width: 1200, height: 800 } });
  const errors = [], external = [];
  await context.route('**/*', route => {
    if (new URL(route.request().url()).origin === origin) return route.continue();
    external.push(route.request().url()); return route.abort();
  });
  await context.addInitScript(() => {
    window.footerDraws = [];
    const fillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(text, x, y, ...args) {
      const result = fillText.call(this, text, x, y, ...args);
      window.footerDraws.push({ text, x, direction: this.direction, align: this.textAlign,
        width: this.canvas.width, textWidth: this.measureText(text).width });
      return result;
    };
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + route);
  await page.waitForFunction(() => window.fixtureReady);
  return { page, close: async () => {
    assert.deepEqual(errors, [], 'No page exceptions');
    assert.deepEqual(external, [], 'Only local source fixture requests');
    await context.close();
  }};
}

function assertDraws(draws, labels, rtl = false) {
  assert.ok(draws.length >= 2, 'Footer paints both text lines');
  assert.deepEqual(draws.slice(-2).map(draw => draw.text), labels);
  for (const draw of draws.slice(-2)) {
    assert.equal(draw.direction, rtl ? 'rtl' : 'ltr');
    assert.equal(draw.align, rtl ? 'right' : 'left');
    assert.equal(draw.x, rtl ? draw.width - 6 : 6);
    assert.ok(draw.textWidth > 0 && draw.textWidth <= draw.width - 24, 'Text fits the offscreen canvas');
    assert.ok(rtl ? draw.x - draw.textWidth >= 0 : draw.x + draw.textWidth <= draw.width, 'Text lies inside canvas');
  }
}

for (const [locale, labels, rtl] of [
  ['en', ['Agents.', 'One home.'], false],
  ['ro', ['Agenți.', 'Un singur loc.'], false],
  ['hi', ['एजेंट।', 'एक ही जगह।'], false],
  ['ar', ['الوكلاء.', 'مكان واحد.'], true],
]) test(`initial ${locale} footer uses localized labels and visible text anchors`, async () => {
  const f = await fixture(locale === 'en' ? '/' : `/${locale}/`);
  try { assertDraws(await f.page.evaluate(() => window.footerDraws), labels, rtl); }
  finally { await f.close(); }
});

test('late locale readiness repaints Arabic with RTL anchors', async () => {
  const f = await fixture('/ar/?late=1');
  try {
    assertDraws(await f.page.evaluate(() => window.footerDraws), ['Agents.', 'One home.']);
    await f.page.evaluate(async () => { window.footerDraws = []; await window.finishLocale(); });
    assertDraws(await f.page.evaluate(() => window.footerDraws), ['الوكلاء.', 'مكان واحد.'], true);
  } finally { await f.close(); }
});

test('theme and resize retain localized footer while small containers disable it', async () => {
  const f = await fixture('/ro/');
  try {
    await f.page.evaluate(() => { window.footerDraws = []; window.dispatchEvent(new CustomEvent('codevalanche-theme')); });
    assertDraws(await f.page.evaluate(() => window.footerDraws), ['Agenți.', 'Un singur loc.']);
    await f.page.evaluate(() => { document.querySelector('#wrap').style.width = '400px'; window.dispatchEvent(new Event('resize')); });
    await f.page.waitForFunction(() => !document.querySelector('#wrap').classList.contains('canvas-on'));
    await f.page.evaluate(() => { window.footerDraws = []; document.querySelector('#wrap').style.width = '600px'; window.dispatchEvent(new Event('resize')); });
    await f.page.waitForFunction(() => document.querySelector('#wrap').classList.contains('canvas-on'));
    assertDraws(await f.page.evaluate(() => window.footerDraws), ['Agenți.', 'Un singur loc.']);
  } finally { await f.close(); }
});

for (const [route, motion] of [['/ar/?small=1', 'no-preference'], ['/ar/', 'reduce']])
  test(`footer remains disabled for ${motion === 'reduce' ? 'reduced motion' : 'small containers'}`, async () => {
    const f = await fixture(route, motion);
    try {
      assert.deepEqual(await f.page.evaluate(() => window.footerDraws), []);
      assert.equal(await f.page.locator('#wrap').evaluate(wrap => wrap.classList.contains('canvas-on')), false);
    } finally { await f.close(); }
  });
