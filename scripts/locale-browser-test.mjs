import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = path.resolve('dist');
const italian = JSON.parse(await readFile(path.resolve('src/locales/it.json'), 'utf8'));
const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://localhost');
  const relative = url.pathname.endsWith('/') ? `${url.pathname.slice(1)}index.html` : url.pathname.slice(1);
  const file = path.resolve(root, relative);
  if (!file.startsWith(`${root}${path.sep}`)) { response.writeHead(400); response.end(); return; }
  try {
    const body = await readFile(file);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8' };
    response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(body);
  } catch { response.writeHead(404); response.end('Not found'); }
}).listen(0, '127.0.0.1');

await new Promise(resolve => server.once('listening', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.route('https://**/*', route => route.abort());
await page.route('https://hvevaxsfeyiikjhcsafi.supabase.co/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) }));

try {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Decline', exact: true }).click();
  await page.locator('.lang-picker summary').click();
  await page.locator('.lang-picker a[data-locale="it"]').click();
  await page.waitForURL('**/it/');
  assert.equal(await page.locator('html').getAttribute('lang'), 'it');
  assert.equal(await page.locator('.lang-picker summary').getAttribute('aria-label'), null);
  assert.match(await page.locator('.lang-picker summary').ariaSnapshot(), /Italiano/);
  assert.equal(await page.locator('.lang-picker a[data-locale="en"]').getAttribute('href'), '/');
  assert.equal((await page.context().cookies(origin)).find(cookie => cookie.name === 'codevalanche_language')?.value, 'it');

  await page.goto(`${origin}/`);
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal((await page.context().cookies(origin)).find(cookie => cookie.name === 'codevalanche_language')?.value, 'en');

  await page.goto(`${origin}/it/terms.html`);
  assert.equal(await page.locator('html').getAttribute('lang'), 'it');
  assert.equal(await page.locator('.lang-picker a[data-locale="en"]').getAttribute('href'), '/terms.html');

  await page.goto(`${origin}/account/`);
  await page.getByRole('heading', { name: italian['Sign in'], exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'it');
  assert.equal(await page.getByRole('link', { name: italian.Privacy, exact: true }).getAttribute('href'), '/it/privacy.html');
  await page.getByRole('button', { name: italian['Create account'], exact: true }).click();
  await page.getByRole('heading', { name: italian['Create your account'], exact: true }).waitFor();

  const firstVisitPage = await browser.newPage();
  firstVisitPage.on('pageerror', error => errors.push(error.message));
  await firstVisitPage.route('https://**/*', route => route.abort());
  await firstVisitPage.goto(`${origin}/it/`);
  await firstVisitPage.getByRole('heading', { name: italian['Your analytics choice'], exact: true }).waitFor();
  await firstVisitPage.getByRole('button', { name: italian['Accept analytics'], exact: true }).waitFor();
  await firstVisitPage.close();

  assert.deepEqual(errors, []);
  console.log('PASS browser locale flow: footer switch, English return, page-preserving routes, cookie preference and account UI');
} finally {
  await browser.close();
  server.close();
}
