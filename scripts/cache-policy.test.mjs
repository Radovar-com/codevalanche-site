import test from 'node:test';
import assert from 'node:assert/strict';
import edge from '../workers/site-edge/src/index.js';
const cache = await import('../cloudflare/cache-policy.mjs').catch(() => ({}));
const request = (path, options) => new Request(`https://codevalanche.com${path}`, options);
test('only successful public versioned assets receive immutable caching', () => {
  assert.equal(typeof cache.withAssetCache, 'function');
  const policy = (url, status = 200, headers = {}, options) => cache.withAssetCache(new Response(null, { status, headers }), request(url, options)).headers.get('cache-control');
  for (const file of ['styles.css', 'site.js', 'assets/fonts/newsreader-latin.woff2']) {
    assert.equal(policy(`/${file}?v=0123456789abcdef`), 'public, max-age=31536000, immutable');
    assert.equal(policy(`/${file}`), 'public, max-age=3600, must-revalidate');
    assert.equal(policy(`/${file}?v=wrong`), 'public, max-age=3600, must-revalidate');
    assert.equal(policy(`/${file}?v=0123456789abcdef`, 404), 'no-store');
    assert.equal(policy(`/${file}?v=0123456789abcdef`, 200, { 'set-cookie': 'session=fixture' }), 'private, no-store');
    assert.equal(policy(`/${file}?v=0123456789abcdef`, 200, { 'cache-control': 'private, no-store' }), 'private, no-store');
    assert.equal(policy(`/${file}?v=0123456789abcdef`, 200, {}, { headers: { authorization: 'Bearer fixture' } }), 'private, no-store');
  }
  for (const url of ['/', '/ro/docs/', '/account/', '/account.html', '/sitemap.xml', '/llms.txt']) assert.equal(policy(url), 'no-cache');
});
test('edge locale cookies and redirects cannot be stored in shared HTML caches', async () => {
  const env = { SITE_ORIGIN: 'https://origin.example.test', fetch: async () => new Response('<meta http-equiv="Content-Security-Policy" content="script-src &#39;self&#39;">', {headers:{'content-type':'text/html', 'cache-control':'public, max-age=600'}}) };
  const response = await edge.fetch(request('/ro/', {headers:{accept:'text/html'}}), env);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.ok(response.headers.has('set-cookie'));
  assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
});
test('edge assets use the same cache policy as the pass-through worker', async () => {
  const env = { SITE_ORIGIN: 'https://origin.example.test', fetch: async () => new Response('body{}', {headers:{'content-type':'text/css'}}) };
  const response = await edge.fetch(request('/styles.css?v=0123456789abcdef'), env);
  assert.equal(response.headers.get('cache-control'), 'public, max-age=31536000, immutable');
});
