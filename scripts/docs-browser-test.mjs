// Run after npm run build. Captures are CI artifacts, never source files.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GUIDE_PAGES } from './docs.mjs';

const root = path.resolve('dist');
const captures = process.env.CODEVALANCHE_DOCS_CAPTURES || path.join(tmpdir(), 'codevalanche-docs-captures');
await mkdir(captures, { recursive: true });
const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png', '.svg':'image/svg+xml', '.webp':'image/webp', '.woff2':'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = path.resolve(root, `.${decodeURIComponent(url.pathname).replace(/\/$/, '/index.html')}`);
    if (!file.startsWith(`${root}${path.sep}`)) { res.writeHead(400); res.end(); return; }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404); res.end(); }
}).listen(0, '127.0.0.1');
await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const failures = [];
try {
  for (const locale of ['en', 'ro', 'ar']) for (const theme of ['light', 'dark']) for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport:{width,height:1000}, reducedMotion:'reduce' });
    await context.addInitScript(theme => localStorage.setItem('codevalanche_theme',theme),theme);
    await context.addCookies([{name:'codevalanche_consent',value:'declined',url:origin}]);
    const page = await context.newPage();
    const prefix=locale==='en'?'':`/${locale}`;
    const requests=[];
    page.on('pageerror', error => failures.push(error.message));
    page.on('console',message=>{ if (/Content Security Policy/i.test(message.text()) && !/frame-ancestors.*ignored/.test(message.text())) failures.push(message.text()); });
    page.on('response',response=>{if(response.url().startsWith(origin)&&response.status()>=400) failures.push(`${response.status()} ${new URL(response.url()).pathname}`);});
    page.on('request',request=>requests.push(request.url()));
    await page.route('https://**/*',route=>route.abort());
    for (const guide of GUIDE_PAGES) {
      await page.goto(`${origin}${prefix}${guide.path}`);
      const query=page.locator('#guide-query');
      await query.waitFor({state:'visible'});
      await page.waitForFunction(()=>!document.querySelector('#guide-query').disabled);
      assert.equal(await page.evaluate(()=>document.documentElement.lang),locale);
      assert.equal(await page.evaluate(()=>document.documentElement.dir),locale==='ar'?'rtl':'ltr');
      assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Overflow ${locale}/${theme}/${width}${guide.path}`);
      assert.equal(await page.locator('[data-doc-contents] a[aria-current="page"]').count(),1);
      await page.waitForFunction(()=>!!window.CodevalancheConsent,null,{timeout:5000});
      await page.locator('footer [data-open-consent]').click();
      assert.equal(await page.locator('.cmp-overlay').isVisible(),true);
      await page.locator('.cmp-card button').first().click();
      assert.equal(await page.locator('.cmp-overlay').isHidden(),true);
      for(const image of await page.locator('.guide-article img').all()) {
        await image.scrollIntoViewIfNeeded();
        await image.evaluate(img=>img.decode());
        assert.ok(await image.evaluate(img=>img.naturalWidth>0));
      }
    }
    await page.goto(`${origin}${prefix}/docs/first-task/`);
    await page.waitForFunction(()=>!document.querySelector('#guide-query').disabled);
    await page.evaluate(()=>document.fonts.ready);
    const query=page.locator('#guide-query');
    await query.fill('Windows');
    assert.ok(await page.locator('#guide-results a').count()>0);
    assert.ok((await page.locator('#guide-results a').first().getAttribute('href')).startsWith(`${prefix}/docs/`));
    await query.fill('zzzz-no-such-topic');
    assert.equal(await page.locator('#guide-results').isHidden(),true);
    assert.equal(await page.locator('[data-doc-status]').textContent(),await page.locator('[data-doc-empty]').textContent());
    await query.fill('<img src=x onerror=alert(1)>');
    assert.equal(await page.locator('#guide-results img').count(),0);
    await query.fill('');
    assert.equal(await page.locator('[data-doc-status]').textContent(),'');
    const language=locale==='en'?'ro':'en';
    await page.locator('.lang-picker').evaluate(el=>el.open=true);
    await page.locator(`.lang-picker a[data-locale="${language}"]`).click();
    assert.equal(new URL(page.url()).pathname,`${language==='en'?'':`/${language}`}/docs/first-task/`);
    await page.goto(`${origin}${prefix}/docs/first-task/`);
    await page.waitForFunction(()=>!document.querySelector('#guide-query').disabled);
    await page.locator('.guide-article img').evaluate(img=>img.decode());
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:path.join(captures,`${locale}-${width===1440?'desktop':'phone'}-${theme}.png`),fullPage:true});
    // Ordinary links provide keyboard navigation and keep the chosen locale.
    await page.locator('a[rel="next"]').focus();
    await page.keyboard.press('Enter');
    await page.waitForURL(`${origin}${prefix}/docs/approvals/`);
    assert.equal(new URL(page.url()).pathname,`${prefix}/docs/approvals/`);
    assert.equal(requests.some(url=>/zzzz-no-such-topic|onerror|guide-query/.test(url)),false,'queries stay in memory');
    await context.close();
  }
  // Native contents and links remain usable with JavaScript disabled.
  const noJS=await browser.newContext({javaScriptEnabled:false});
  const page=await noJS.newPage();
  await page.goto(`${origin}/ro/docs/`);
  assert.equal(await page.locator('[data-doc-search]').isHidden(),true);
  await page.locator('[data-doc-contents] a[href="/ro/docs/installation/"]').click();
  assert.equal(new URL(page.url()).pathname,'/ro/docs/installation/');
  await noJS.close();
  // A missing or malformed static index shows the translated fallback.
  for (const mode of ['missing','invalid']) {
    const context=await browser.newContext();const page=await context.newPage();
    await page.route('**/search-index.json',route=>mode==='missing'?route.fulfill({status:404,body:''}):route.fulfill({json:{invalid:true}}));
    await page.goto(`${origin}/ar/docs/`);
    await page.waitForFunction(()=>document.querySelector('[data-doc-status]').textContent.length>0);
    assert.equal(await page.locator('[data-doc-status]').textContent(),await page.locator('[data-doc-error]').textContent());
    assert.equal(await page.locator('[data-doc-contents]').isVisible(),true);
    await context.close();
  }
  assert.deepEqual(failures,[]);
  console.log(`PASS: ${GUIDE_PAGES.length} guide pages × 12 locale/theme/viewport combinations; search, keyboard, language switching, no-JS and index failure fallback; 12 screenshots.`);
} finally { await browser.close(); server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
