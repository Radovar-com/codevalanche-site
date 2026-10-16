import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const workerModule = await import('../workers/site-edge/src/index.js').catch(() => null);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('edge Worker bundles with the shared locale manifest', async () => {
  const result = await build({
    entryPoints: [path.join(root, 'workers/site-edge/src/index.js')],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: ['es2022'],
    write: false,
  });
  assert.equal(result.errors.length, 0);
  assert.match(result.outputFiles[0].text, /codevalanche_route_checked/);
});

function makeRequest(path, { country = 'US', method = 'GET', accept = 'text/html', cookie = '' } = {}) {
  const request = new Request(`https://codevalanche.com${path}`, {
    method,
    headers: { accept, ...(cookie ? { cookie } : {}) },
  });
  Object.defineProperty(request, 'cf', { value: { country } });
  return request;
}

function makeEnv(recorded) {
  return {
    SITE_ORIGIN: 'https://radovar-com.github.io',
    SITE_BASE_PATH: '/codevalanche-site',
    fetch: async request => {
      recorded.push(request.url);
      return new Response('<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src &#39;self&#39;; script-src &#39;self&#39;"></head><body>ok</body></html>', {
        headers: { 'content-type': 'text/html; charset=utf-8' },
      });
    },
  };
}

test('first HTML visit from Italy redirects the requested marketing path once', async () => {
  assert.equal(typeof workerModule?.default?.fetch, 'function', 'edge Worker fetch handler exists');
  const requested = [];
  const response = await workerModule.default.fetch(makeRequest('/changelog.html?source=footer', { country: 'IT' }), makeEnv(requested));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), 'https://codevalanche.com/it/changelog.html?source=footer');
  assert.match(response.headers.get('set-cookie') ?? '', /codevalanche_route_checked=1/);
  assert.match(response.headers.get('set-cookie') ?? '', /codevalanche_language=it/);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(requested, []);
});

test('direct locale and manual English root visits do not geo-redirect', async () => {
  const requested = [];
  const env = makeEnv(requested);
  const localized = await workerModule.default.fetch(makeRequest('/it/', { country: 'IT' }), env);
  assert.equal(localized.status, 200);
  assert.match(localized.headers.get('set-cookie') ?? '', /codevalanche_language=it/);
  assert.equal(requested[0], 'https://radovar-com.github.io/codevalanche-site/it/');

  const english = await workerModule.default.fetch(makeRequest('/', { country: 'IT', cookie: 'codevalanche_route_checked=1' }), env);
  assert.equal(english.status, 200);
  assert.match(english.headers.get('set-cookie') ?? '', /codevalanche_language=en/);
  assert.equal(requested[1], 'https://radovar-com.github.io/codevalanche-site/');

  const selectedEnglish = await workerModule.default.fetch(makeRequest('/terms.html', { country: 'IT', cookie: 'codevalanche_language=fr' }), env);
  assert.equal(selectedEnglish.status, 200);
  assert.match(selectedEnglish.headers.get('set-cookie') ?? '', /codevalanche_language=en/);
  assert.equal(requested[2], 'https://radovar-com.github.io/codevalanche-site/terms.html');
});

test('unsupported countries, account callbacks, assets, APIs, and non-navigation methods pass through', async () => {
  const requested = [];
  const env = makeEnv(requested);
  const cases = [
    makeRequest('/', { country: 'CH' }),
    makeRequest('/account/authorize/?authorization_id=valid', { country: 'IT' }),
    makeRequest('/account.html', { country: 'IT' }),
    makeRequest('/assets/app.js', { country: 'IT', accept: '*/*' }),
    makeRequest('/api/events', { country: 'IT' }),
    makeRequest('/', { country: 'IT', method: 'POST' }),
  ];
  for (const request of cases) {
    const response = await workerModule.default.fetch(request, env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
  }
  assert.equal(requested.length, cases.length);
  assert.match(requested[1], /\/codevalanche-site\/account\/authorize\//);
  assert.match(requested[2], /\/codevalanche-site\/account\.html/);
});

test('HTML responses get response security headers and inherit the generated CSP', async () => {
  const response = await workerModule.default.fetch(makeRequest('/'), makeEnv([]));
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.equal(response.headers.get('content-security-policy'), "default-src 'self'; script-src 'self'");
});

test('edge Worker refuses to proxy through an unverified or missing static origin', async () => {
  await assert.rejects(
    workerModule.default.fetch(makeRequest('/terms.html', { cookie: 'codevalanche_route_checked=1' }), { fetch: async () => new Response('unexpected') }),
    /SITE_ORIGIN must be configured to a verified static origin/,
  );
});
