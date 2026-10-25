import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadReleases } from './changelog.mjs';

const root = path.resolve('dist');
const screenshotDirectory = process.env.CODEVALANCHE_VERIFY_SCREENSHOTS;
if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, 'http://fixture');
    const target = path.resolve(root, `.${url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname}`);
    assert.ok(target.startsWith(root + path.sep));
    response.setHeader('Content-Type', types[path.extname(target)] ?? 'application/octet-stream');
    response.end(await readFile(target));
  } catch { response.writeHead(404).end(); }
}).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const errors = [], violations = [];
const browser = await chromium.launch({ headless: true });
const releases = await loadReleases(path.resolve('content/releases'));
let screenshots = 0;
try {
  for (const locale of ['en', 'ro', 'ar']) for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
    const prefix = locale === 'en' ? '' : `/${locale}`;
    const catalog = JSON.parse(await readFile(`src/locales/${locale}.json`, 'utf8'));
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 1000 : 844 }, reducedMotion: 'reduce', permissions: ['clipboard-read', 'clipboard-write'] });
    await context.route('https://**/*', route => route.abort());
    await context.addInitScript(theme => {
      localStorage.setItem('codevalanche_theme', theme);
      document.addEventListener('securitypolicyviolation', event => {
        if (event.disposition === 'enforce') window.__violations.push(`${event.violatedDirective}: ${event.blockedURI}`);
      });
      window.__violations = [];
    }, theme);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    assert.equal((await page.goto(`${origin}${prefix}/download/verify/`)).status(), 200);
    await page.waitForFunction(() => window.CodevalancheAnalytics);
    await page.evaluate(() => document.fonts.ready);
    const decline = page.getByRole('button', { name: catalog.Decline, exact: true });
    if (await decline.isVisible()) await decline.click();
    assert.equal(await page.locator('html').getAttribute('lang'), locale);
    assert.equal(await page.locator('html').getAttribute('dir'), locale === 'ar' ? 'rtl' : 'ltr');
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
    assert.equal(await page.locator('h1').innerText(), catalog['Verify your Windows download.']);
    const cards = page.locator('[data-verify-version]');
    assert.equal(await cards.count(), releases.length);
    for (const [index, release] of releases.entries()) {
      const card = cards.nth(index);
      assert.equal(await card.locator('.verify-hash').innerText(), release.installer.sha256);
      assert.equal(await card.locator('.verify-hash').evaluate(element => getComputedStyle(element).direction), 'ltr');
      const button = card.locator('[data-copy-command]');
      await button.focus();
      await page.keyboard.press('Enter');
      await card.locator('[data-copy-ok]').waitFor({ state: 'visible' });
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), await card.locator('.verify-command code').textContent());
    }
    // Each footer target must retain the verification page, including the English return.
    for (const [tag, slug] of [['en', ''], ['ro', '/ro'], ['ar', '/ar']]) {
      assert.equal(await page.locator(`.lang-grid a[data-locale="${tag}"]`).getAttribute('href'), `${slug}/download/verify/`);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${locale}/${width}/${theme}: no horizontal overflow`);
    violations.push(...await page.evaluate(() => window.__violations));
    await page.evaluate(() => {
      for (const status of document.querySelectorAll('[data-copy-ok]')) status.hidden = true;
      document.activeElement?.blur();
      scrollTo(0, 0);
    });
    if (screenshotDirectory) {
      await page.screenshot({ path: path.join(screenshotDirectory, `verify-${locale}-${width}-${theme}.png`), fullPage: true });
      screenshots++;
    }
    await page.goto(`${origin}${prefix}/download/#details`);
    const link = page.locator(`a[href="${prefix}/download/verify/"]`);
    assert.equal(await link.count(), 1);
    await link.scrollIntoViewIfNeeded();
    if (screenshotDirectory) {
      await page.screenshot({ path: path.join(screenshotDirectory, `download-link-${locale}-${width}-${theme}.png`) });
      screenshots++;
    }
    await link.click();
    await page.waitForURL(`${origin}${prefix}/download/verify/`);
    await context.close();
  }
  const context = await browser.newContext();
  await context.route('https://**/*', route => route.abort());
  const page = await context.newPage();
  await page.addInitScript(() => Object.defineProperty(navigator.clipboard, 'writeText', { value: async () => { throw new Error('Clipboard denied'); } }));
  await page.goto(`${origin}/ro/download/verify/`);
  const card = page.locator('[data-verify-version]').first();
  await card.locator('[data-copy-command]').click();
  await card.locator('[data-copy-failed]').waitFor({ state: 'visible' });
  assert.equal(await card.locator('[data-copy-ok]').isVisible(), false);
  assert.ok((await card.locator('.verify-command code').innerText()).startsWith('Get-FileHash '));
  await context.close();

  const noClipboard = await browser.newContext();
  await noClipboard.addInitScript(() => Object.defineProperty(navigator, 'clipboard', { value: undefined }));
  await noClipboard.route('https://**/*', route => route.abort());
  const manual = await noClipboard.newPage();
  await manual.goto(`${origin}/download/verify/`);
  assert.equal(await manual.locator('[data-copy-command]:visible').count(), 0);
  await noClipboard.close();

  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 320, height: 844 } });
  const staticPage = await noJs.newPage();
  await staticPage.goto(`${origin}/ar/download/verify/`);
  assert.equal(await staticPage.locator('[data-verify-version]').count(), releases.length);
  assert.equal(await staticPage.locator('[data-copy-command]:visible').count(), 0);
  assert.ok(await staticPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await noJs.close();
  assert.deepEqual(errors, []);
  assert.deepEqual(violations, []);
  console.log(`PASS verification: 12 locale/device/theme combinations; exact hashes; keyboard clipboard; failure/manual/no-JS paths; localized links; no overflow, page errors or CSP violations; ${screenshots} screenshots`);
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
