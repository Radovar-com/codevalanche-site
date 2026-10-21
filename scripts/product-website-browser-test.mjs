import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { LOCALES } from '../src/locales/manifest.js';

const root = path.resolve('dist');
const output = path.resolve('.superpowers/sdd/codevalanche-product-website-redesign/qa');
await mkdir(output, { recursive: true });
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.webp':'image/webp', '.png':'image/png', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.txt':'text/plain' };
const server = createServer(async (request, response) => {
  try {
    let route = new URL(request.url, 'http://fixture').pathname;
    if (route.endsWith('/')) route += 'index.html';
    const target = path.resolve(root, `.${decodeURIComponent(route)}`);
    assert.ok(target.startsWith(root + path.sep));
    const body = await readFile(target);
    response.writeHead(200, { 'Content-Type': types[path.extname(target)] ?? 'application/octet-stream' });
    response.end(body);
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({headless:true});
const errors = [], checks = [];
const englishOnly = process.env.CODEVALANCHE_TEST_ENGLISH_ONLY === '1';
try {
  for (const width of [1440, 390]) for (const theme of ['light','dark']) {
    // A Linux visitor, the same on every machine that runs this test.
    const context = await browser.newContext({ viewport:{width,height:width === 1440 ? 900 : 844}, reducedMotion:'reduce', userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36' });
    await context.addInitScript(() => { Object.defineProperty(navigator, 'platform', {get: () => 'Linux x86_64'}); Object.defineProperty(navigator, 'userAgentData', {get: () => undefined}); });
    await context.route('https://**/*', route => route.abort());
    await context.addInitScript(theme => localStorage.setItem('codevalanche_theme', theme), theme);
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await page.evaluate(() => document.fonts.ready);
    const decline = page.getByRole('button', {name:'Decline',exact:true});
    if (await decline.isVisible()) await decline.click();
    await page.evaluate(() => scrollTo(0,0));
    assert.match((await page.locator('h1').innerText()).replace(/\s+/g,' '), /From prompt to a change you understand\./);
    const image = page.locator('.hero .shot-img').filter({visible:true}).first();
    assert.ok(await image.evaluate(element => element.complete && element.naturalWidth > 0));
    const box = await image.boundingBox();
    assert.ok(box.y < (width === 1440 ? 550 : 720), `Product visible near primary action, ${width}/${theme}, y=${box.y}`);
    const primary = page.locator('.hero .hero-actions [data-release-primary]');
    assert.equal(new URL(await primary.getAttribute('href'), origin).pathname, '/download/', 'Other systems see the download options');
    assert.equal(await page.locator('.hero [data-download-platform]').count(), 0, 'Only Windows PCs get the installer in the hero');
    for (const id of ['top','product-principle','product','accounts','parallel','workflow','showcase','details','companion','privacy','download','proof','faq','footer']) {
      assert.equal(await page.locator(`[id="${id}"]`).count(),1,`Existing fragment ${id} preserved exactly once`);
    }
    await page.screenshot({path:path.join(output, `home-${width}-${theme}.png`)});
    const tabs = page.locator('.feature-tab');
    assert.equal(await tabs.count(),4);
    await tabs.nth(2).click();
    assert.equal(await tabs.nth(2).getAttribute('aria-selected'),'true');
    await tabs.nth(2).press('End');
    assert.equal(await tabs.nth(3).getAttribute('aria-selected'),'true');
    await tabs.nth(3).press('Home');
    assert.equal(await tabs.nth(0).getAttribute('aria-selected'),'true');
    await page.evaluate(() => document.documentElement.setAttribute('dir','rtl'));
    await tabs.nth(0).press('ArrowLeft');
    assert.equal(await tabs.nth(1).getAttribute('aria-selected'),'true','Horizontal RTL tour follows its visual direction');
    await page.evaluate(() => document.documentElement.setAttribute('dir','ltr'));
    assert.equal(await page.locator('.feature-panel:not([hidden])').count(),1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    checks.push({width,theme,heroImageY:box.y,keyboardTour:'pass'});
    await context.close();
  }
  const context = await browser.newContext({reducedMotion:'reduce'});
  await context.route('https://**/*', route => route.abort());
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  for (const route of ['/', '/how-it-works/', '/agents/', '/features/multiple-accounts/', '/local-ai/', '/docs/', '/download/', '/security/']) {
    const response = await page.goto(origin + route);
    assert.equal(response.status(),200,route);
    assert.equal(await page.locator('h1').count(),1,route);
    assert.ok((await page.locator('main').innerText()).length > 500, `${route} has substantive content`);
    assert.equal(await page.locator('.nav-signin').getAttribute('href'),'/account/');
    assert.ok(await page.locator('[data-open-consent]').count() > 0);
  }
  for (const route of englishOnly ? [] : ['/ro/agents/','/ar/features/multiple-accounts/','/ja/how-it-works/','/de/download/']) {
    const response = await page.goto(origin + route);
    assert.equal(response.status(),200,route);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), route);
    const english = page.locator('.lang-grid a[data-locale="en"]');
    assert.equal(new URL(await english.getAttribute('href'),origin).pathname, route.replace(/^\/[a-z-]+/,''));
  }
  for (const [index,locale] of (englishOnly ? [] : LOCALES.filter(locale => locale.slug)).entries()) {
    const catalog = JSON.parse(await readFile(`src/locales/${locale.slug}.json`,'utf8'));
    await page.setViewportSize({width:390,height:844});
    await page.emulateMedia({colorScheme:index % 2 ? 'dark' : 'light'});
    await page.goto(`${origin}/${locale.slug}/`);
    await page.waitForFunction(tag => window.CodevalancheLocale?.locale.tag === tag && window.CodevalancheLocale.status === 'ready',locale.tag);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('html').getAttribute('lang'),locale.tag);
    assert.equal(await page.locator('html').getAttribute('dir'),locale.dir);
    assert.equal((await page.locator('h1').innerText()).replace(/\s+/g,' '),catalog['From prompt to a change you understand.'].replace(/\s+/g,' '));
    const decline = page.getByRole('button',{name:catalog.Decline,exact:true});
    if (await decline.isVisible()) await decline.click();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),`${locale.tag} mobile layout fits`);
    const signIn = await page.locator('.nav-signin').boundingBox();
    assert.ok(signIn.x >= 0 && signIn.x + signIn.width <= 390,`${locale.tag} sign-in remains accessible`);
    if (['ro','ar','hi','ja'].includes(locale.slug)) await page.screenshot({path:path.join(output,`home-390-${locale.slug}.png`)});
  }
  await context.close();
  const failed = await browser.newContext({reducedMotion:'reduce', userAgent:'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'});
  await failed.addInitScript(() => { Object.defineProperty(navigator, 'platform', {get: () => 'Linux x86_64'}); Object.defineProperty(navigator, 'userAgentData', {get: () => undefined}); });
  await failed.route('https://**/*', route => route.abort());
  await failed.route('**/account-funnel.js', route => route.abort());
  const pageWithoutAnalytics = await failed.newPage();
  await pageWithoutAnalytics.goto(origin);
  await pageWithoutAnalytics.locator('.feature-tab').nth(1).click();
  assert.equal(await pageWithoutAnalytics.locator('.feature-tab').nth(1).getAttribute('aria-selected'),'true');
  await pageWithoutAnalytics.locator('.hero .hero-actions [data-release-primary]').click();
  await pageWithoutAnalytics.waitForURL(origin + '/download/#platforms');
  await failed.close();
  assert.deepEqual(errors,[],'No ordinary browser exceptions');
  await writeFile(path.join(output,'product-browser-results.json'),JSON.stringify({status:'passed',checks,routes:8,localeDeepLinks:englishOnly ? 0 : 4,renderedLanguages:englishOnly ? 1 : LOCALES.length,sdkFailure:'pass',englishPreviewOnly:englishOnly},null,2));
  console.log(`PASS product website${englishOnly ? ' (English preview only)' : ''}: first-screen evidence; truthful CTA; preserved anchors; keyboard tour; eight pages; ${englishOnly ? 'locale checks pending' : 'locale deep links'}; SDK-failure navigation.`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
