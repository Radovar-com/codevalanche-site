import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const layout = await import('./download-layout.mjs').catch(() => ({}));
const manifest = {version:1,gatewayBaseUrl:'https://downloads.example.test/functions/v1/download-redirect/v1',allowedOrigins:['https://artifacts.example.test'],assets:[{siteId:'codevalanche',platform:'windows',architecture:'x64',releaseId:'fixture_release',artifactId:'fixture_windows',qualified:true,targetUrl:'https://artifacts.example.test/fixture.exe'}]};

test('phone controls have their final native labels before locale I/O and retain them on catalog failure', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'download-layout-'));
  t.after(() => rm(root, {recursive:true,force:true}));
  const catalogs = new Map();
  for (const lang of ['en','ro','ar']) {
    const catalog = lang === 'en' ? {} : JSON.parse(await readFile(`src/locales/${lang}.json`, 'utf8'));
    catalogs.set(lang,catalog);
    const file=path.join(root,lang==='en'?'':lang,'download/index.html');await mkdir(path.dirname(file),{recursive:true});
    await writeFile(file,`<!doctype html><html lang="${lang}" dir="${lang==='ar'?'rtl':'ltr'}"><head><meta charset="utf-8"><script>window.CODEVALANCHE_RELEASE_MANIFEST=${JSON.stringify(manifest)}</script></head><body><main><section id="hero"><div data-download-landing><a data-release-primary href="/download/">${catalog['Download for Windows']??'Download for Windows'}</a><p data-detected hidden></p><button data-copy-link hidden>${catalog['Copy the link for your PC']??'Copy the link for your PC'}</button><p data-copy-status></p></div></section></main></body></html>`);
  }
  if (layout.prepareDownloadLayout) await layout.prepareDownloadLayout(root, manifest);
  const bundle=(await build({entryPoints:['src/downloads.js'],bundle:true,write:false,format:'iife'})).outputFiles[0].text;
  const server=createServer(async(req,res)=>{try{const pathname=new URL(req.url,'http://fixture').pathname;res.setHeader('content-type',pathname==='/downloads.js'?'text/javascript':'text/html');res.end(pathname==='/downloads.js'?bundle:await readFile(path.join(root,pathname,'index.html')));}catch{res.writeHead(404);res.end();}}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>{server.closeAllConnections();server.close();});
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());
  for(const lang of ['en','ro','ar']){
    const context=await browser.newContext({viewport:{width:412,height:823},userAgent:'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/151.0.0.0 Mobile Safari/537.36'});
    const external=[];await context.route('https://**/*',r=>{external.push(r.request().url());return r.abort();});
    const page=await context.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/${lang==='en'?'':lang+'/'}download/`);
    const catalog=catalogs.get(lang),expected=catalog['You are on a phone. Codevalanche runs on a Windows PC, and the phone app is coming soon.']??'You are on a phone. Codevalanche runs on a Windows PC, and the phone app is coming soon.';
    assert.equal(await page.locator('[data-detected]').innerText(),expected,lang+' first paint');
    assert.equal(await page.locator('[data-copy-link]').isVisible(),true);
    assert.equal(await page.locator('[data-download-landing]').getAttribute('data-counted'),null,'layout pass never counts a visit');
    assert.equal(await page.locator('[data-release-primary]').innerText(),catalog['Coming soon for phones']??'Coming soon for phones');
    await page.evaluate(()=>{window.CodevalancheLocale={status:'unavailable',translate:text=>text};});
    await page.addScriptTag({url:`http://127.0.0.1:${server.address().port}/downloads.js`});
    assert.equal(await page.locator('[data-detected]').innerText(),expected,lang+' catalog unavailable');
    assert.deepEqual(external,[],'prepaint does not contact services or count downloads');
    await context.close();
  }
});

test('consent is translated before its first visible frame when the locale catalog is delayed', async t => {
  const bundle=(await build({entryPoints:['src/account-funnel.js'],bundle:true,write:false,format:'esm'})).outputFiles[0].text;
  const catalog=await readFile('src/locales/ro.json','utf8');let release;const gate=new Promise(r=>{release=r;});
  const server=createServer(async(req,res)=>{const url=new URL(req.url,'http://fixture');res.setHeader('content-type',url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.json')?'application/json':'text/html');if(url.pathname==='/funnel.js')return res.end(bundle);if(url.pathname==='/locales/ro.json'){await gate;return res.end(catalog);}res.end('<!doctype html><html lang="ro"><head><meta charset="utf-8"></head><body><main>Codevalanche</main><script type="module" src="/funnel.js"></script></body></html>');}).listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  t.after(()=>{release();server.closeAllConnections();server.close();});
  const browser=await chromium.launch({headless:true});t.after(()=>browser.close());const page=await browser.newPage();await page.route('https://**/*',r=>r.abort());
  const requested=page.waitForRequest(r=>r.url().includes('/locales/ro.json'));
  await page.goto(`http://127.0.0.1:${server.address().port}/ro/download/`,{waitUntil:'commit'});await requested;
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.equal(await page.locator('[data-owned-consent]').count(),0,'no English banner paints while locale is pending');
  release();await page.waitForFunction(()=>window.CodevalancheAnalytics);
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(r)));
  assert.equal(await page.locator('.cmp-banner h2').innerText(),JSON.parse(catalog)['Your analytics choice']);
});
