import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';

const root = path.resolve(process.env.TOUR_DIST || 'dist');
const output = path.resolve(process.env.TOUR_ARTIFACTS || path.join(tmpdir(), 'codevalanche-tour'));
const baseline = process.argv.includes('--baseline');
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const file = path.resolve(root, `.${url.pathname}${url.pathname.endsWith('/') ? 'index.html' : ''}`);
  if (!file.startsWith(root + path.sep)) { res.writeHead(400); res.end(); return; }
  try {
    const data = await readFile(file);
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' })[path.extname(file)] || 'text/html; charset=utf-8');
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
const errors = [];
try {
  browser = await chromium.launch({ headless: true });
  for (const locale of ['en', 'ro', 'ar']) for (const theme of ['light', 'dark']) for (const width of baseline ? [1440, 390] : [1440, 1024, 1001, 900, 861, 768, 390, 320]) {
    const page = await browser.newPage({ viewport: { width, height: width > 900 ? 1000 : 844 }, reducedMotion: 'reduce', hasTouch: width <= 768 });
    await page.route('https://**/*', route => route.abort());
    await page.addInitScript(theme => {
      localStorage.setItem('codevalanche_theme', theme);
      window.cspViolations = [];
      document.addEventListener('securitypolicyviolation', e => window.cspViolations.push(e.violatedDirective));
    }, theme);
    page.on('pageerror', error => errors.push(error.message));
    const prefix = locale === 'en' ? '' : `/${locale}`;
    const screenshot = async name => {
      if ([1440, 390].includes(width)) {
        await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); });
        await page.screenshot({ path: path.join(output, `${name}-${locale}-${theme}-${width}.png`), fullPage: true, style: '.site-header { position: relative; }' });
      }
    };
    const settle = async () => {
      await page.waitForFunction(() => window.CodevalancheAnalytics?.consentManager);
      await page.evaluate(() => window.CodevalancheAnalytics.setConsent({ websiteAnalytics: false }));
      await page.evaluate(() => document.fonts.ready);
    };
    await page.goto(origin + prefix + '/');
    await settle();
    await screenshot('home');
    if (baseline) { await page.close(); continue; }
    await page.locator('main a[href$="/tour/"]').click();
    await page.waitForURL(origin + prefix + '/tour/');
    await settle();
    const tabs = page.locator('[role="tab"]');
    const panels = page.locator('[data-tour-panel]');
    await tabs.first().waitFor({ timeout: 3000 });
    const headerFits = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.brand, .desktop-nav, .nav-actions, .mobile-nav')].filter(el => el.getClientRects().length).map(el => el.getBoundingClientRect()).sort((a, b) => a.x - b.x);
      return boxes.every((box, i) => box.x >= 0 && box.right <= innerWidth && (!i || boxes[i - 1].right <= box.x));
    });
    assert.equal(headerFits, true, `${locale}/${width}: header controls fit without overlap`);
    const active = async n => {
      assert.equal(await tabs.nth(n).getAttribute('aria-selected'), 'true');
      assert.equal(await panels.nth(n).isVisible(), true);
      assert.equal(await page.locator('[data-tour-panel]:visible').count(), 1);
      await panels.nth(n).locator('img').evaluate(img => img.decode());
    };
    await active(0);
    assert.equal(await page.locator('[data-tour-previous]').getAttribute('aria-disabled'), 'true');
    await page.locator('[data-tour-previous]').focus(); await page.keyboard.press('Enter'); await active(0);
    // Automatic tab activation follows the visual arrow direction in RTL.
    await tabs.first().focus();
    await page.keyboard.press(locale === 'ar' ? 'ArrowLeft' : 'ArrowRight');
    await active(1);
    assert.equal(await tabs.nth(1).evaluate(el => el === document.activeElement), true);
    await page.keyboard.press('End'); await active(5);
    await page.keyboard.press('Home'); await active(0);
    await page.keyboard.press(locale === 'ar' ? 'ArrowRight' : 'ArrowLeft'); await active(5);
    await page.keyboard.press('Home'); await active(0);
    await screenshot('tour-step-1');
    if (width <= 768) {
      const image = panels.first().locator('.tour-image-link');
      await image.scrollIntoViewIfNeeded();
      const box = await image.boundingBox();
      const session = await page.context().newCDPSession(page);
      const start = locale === 'ar' ? box.x + 30 : box.x + box.width - 30;
      const end = locale === 'ar' ? box.x + box.width - 30 : box.x + 30;
      const y = box.y + Math.min(100, box.height / 2);
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: start, y }] });
      for (let i = 1; i <= 5; i++) await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start + (end - start) * i / 5, y }] });
      await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await active(1);
      assert.equal(new URL(page.url()).pathname, prefix + '/tour/', 'swipe does not open the screenshot');
      await tabs.first().click();
      // A vertical gesture and a cancelled touch must leave the step alone.
      await panels.first().locator('.tour-image-link').dispatchEvent('pointerdown', { pointerId: 20, pointerType: 'touch', clientX: 100, clientY: 200 });
      await panels.first().locator('.tour-image-link').dispatchEvent('pointerup', { pointerId: 20, pointerType: 'touch', clientX: 105, clientY: 300 });
      await active(0);
      await panels.first().locator('.tour-image-link').dispatchEvent('pointerdown', { pointerId: 21, pointerType: 'touch', clientX: 300, clientY: 200 });
      await panels.first().locator('.tour-image-link').dispatchEvent('pointercancel', { pointerId: 21, pointerType: 'touch' });
      await panels.first().locator('.tour-image-link').dispatchEvent('pointerup', { pointerId: 21, pointerType: 'touch', clientX: 100, clientY: 200 });
      await active(0);
      await session.detach();
    }
    for (let i = 1; i < 6; i++) {
      await page.locator('[data-tour-next]').click(); await active(i);
      await screenshot(`tour-step-${i + 1}`);
    }
    assert.equal(await page.locator('[data-tour-next]').getAttribute('aria-disabled'), 'true');
    await page.locator('[data-tour-next]').focus(); await page.keyboard.press('Enter'); await active(5);
    await page.locator('[data-tour-previous]').click(); await active(4);
    await tabs.last().click(); await active(5);
    assert.equal(await page.locator('main a[href$="/download/"]').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${locale}/${theme}/${width} overflow`);
    assert.deepEqual(await page.evaluate(() => window.cspViolations), []);
    await page.locator('[data-theme-toggle]').click();
    assert.match(await panels.last().locator('img').getAttribute('src'), theme === 'light' ? /dark/ : /light/);
    await page.locator('[data-theme-toggle]').click();
    for (const tag of ['en', 'ro', 'ar']) assert.equal(await page.locator(`.lang-picker a[data-locale="${tag}"]`).getAttribute('href'), `${tag === 'en' ? '' : '/' + tag}/tour/`);
    await page.locator('main a[href$="/download/"]').click();
    await page.waitForURL(origin + prefix + '/download/');
    await page.close();
  }
  if (!baseline) {
    // A delayed enhancement must not push the first capture down after paint.
    const delayed = await browser.newPage({ viewport: { width: 390, height: 844 } });
    let releaseModule;
    const moduleReady = new Promise(resolve => { releaseModule = resolve; });
    await delayed.route('**/tour/tour.js*', async route => { await moduleReady; await route.continue(); });
    const navigation = delayed.goto(origin + '/tour/');
    await delayed.locator('.tour-panel').first().waitFor();
    await delayed.evaluate(() => document.fonts.ready);
    const before = await delayed.locator('.tour-panels').boundingBox();
    releaseModule();
    await navigation;
    await delayed.locator('[role="tab"]').first().waitFor();
    const after = await delayed.locator('.tour-panels').boundingBox();
    assert.ok(Math.abs(before.y - after.y) <= 1, 'enhancement reserves step-navigation space');
    await delayed.close();
    const page = await browser.newPage({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    await page.goto(origin + '/tour/');
    assert.equal(await page.locator('[data-tour-panel]:visible').count(), 6);
    assert.equal(await page.locator('[data-tour-tabs]').isVisible(), false);
    assert.equal(await page.locator('[data-tour-controls]').isVisible(), false);
    assert.equal(await page.locator('main a[href="/download/"]').isVisible(), true);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(baseline ? 'PASS baseline screenshot matrix (12 home views)' : 'PASS tour: 48 locale/theme/viewport combinations, keyboard, touch/RTL, cancellation, boundaries, theme images, localized download, strict CSP, no-JS fallback');
  console.log(`Screenshots: ${output}`);
} finally { await browser?.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
