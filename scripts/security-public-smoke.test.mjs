import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { PUBLIC_TARGETS, probePublicTarget, runPublicSmoke } from './security-public-smoke.mjs';

const inline = 'window.publicPageReady=true;';
const hash = createHash('sha256').update(inline).digest('base64');
const policy = `default-src 'none'; base-uri 'self'; object-src 'none'; script-src 'self' 'sha256-${hash}'; script-src-attr 'none'; frame-src 'none'`;
const html = `<html><head><meta charset="utf-8"><meta content="${policy}" http-equiv="Content-Security-Policy"><title>Public page</title><script>${inline}</script></head><body><script src="/site.js"></script></body></html>`;
const headers = {
  'content-type': 'text/html; charset=utf-8',
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'strict-transport-security': 'max-age=31536000',
  'content-security-policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; upgrade-insecure-requests",
};
const page = (method, options = {}) => new Response(method === 'HEAD' ? null : (options.body ?? html), { status: options.status ?? 200, headers: options.headers ?? headers });
const first = 'https://codevalanche.com/';

function runWorkflowGuard(ref, event, enabled) {
  const workflow = readFileSync(new URL('../.github/workflows/security-smoke.yml', import.meta.url), 'utf8');
  const lines = workflow.split(/\r?\n/);
  const start = lines.findIndex(line => line === '      - name: Enforce canonical main and literal scheduled opt-in');
  assert.ok(start >= 0, 'the workflow contains its case-sensitive guard');
  const run = lines.findIndex((line, index) => index > start && line === '        run: |');
  assert.ok(run > start);
  const script = [];
  for (let index = run + 1; index < lines.length; index++) {
    if (lines[index].trim() && !lines[index].startsWith('          ')) break;
    script.push(lines[index].slice(10));
  }
  const bash = process.platform === 'win32' ? path.join(process.env.ProgramFiles || 'C:/Program Files', 'Git/bin/bash.exe') : '/bin/bash';
  const result = spawnSync(bash, ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script.join('\n')], {
    encoding: 'utf8', timeout: 10_000, windowsHide: true,
    env: { PATH: process.env.PATH ?? '', SystemRoot: process.env.SystemRoot ?? '', GITHUB_REF: ref, EVENT_NAME: event, MONITOR_ENABLED: enabled },
  });
  assert.equal(result.error, undefined);
  return result.status;
}

test('the actual workflow shell guard permits canonical manual diagnostics and literal scheduled opt-in', () => {
  assert.equal(runWorkflowGuard('refs/heads/main', 'workflow_dispatch', ''), 0);
  assert.equal(runWorkflowGuard('refs/heads/main', 'workflow_dispatch', 'false'), 0);
  assert.equal(runWorkflowGuard('refs/heads/main', 'schedule', 'true'), 0);
});

test('the actual workflow shell guard rejects lookalike branches and nonliteral enable values', () => {
  for (const ref of ['refs/heads/Main', 'refs/heads/MAIN', 'refs/heads/feature']) assert.equal(runWorkflowGuard(ref, 'workflow_dispatch', 'true'), 1);
  for (const enabled of ['', 'false', 'TRUE', 'True', ' true', 'true ']) assert.equal(runWorkflowGuard('refs/heads/main', 'schedule', enabled), 1);
});

test('all fixed targets use only unauthenticated manual-redirect GET and HEAD', async () => {
  const calls = [];
  const result = await runPublicSmoke({ requireHeaders: true, fetchImpl: async (url, init) => { calls.push({ url, init }); return page(init.method); } });
  assert.equal(result.passed, true);
  assert.equal(calls.length, PUBLIC_TARGETS.length * 2);
  for (const { url, init } of calls) {
    assert.ok(PUBLIC_TARGETS.includes(url));
    assert.ok(['GET', 'HEAD'].includes(init.method));
    assert.equal(init.redirect, 'manual');
    assert.equal(init.credentials, 'omit');
    assert.equal(init.body, undefined);
    assert.equal(new Headers(init.headers).has('authorization'), false);
    assert.equal(new Headers(init.headers).has('cookie'), false);
  }
});

test('an off-allowlist redirect is rejected before contacting the destination', async () => {
  const urls = [];
  const result = await probePublicTarget(first, { fetchImpl: async (url) => { urls.push(url); return new Response(null, { status: 302, headers: { location: 'https://attacker.example/collect?private=value' } }); } });
  assert.equal(result.passed, false);
  assert.ok(result.issues.includes('get:redirect_outside_allowlist'));
  assert.ok(urls.every(url => url === first));
  assert.doesNotMatch(JSON.stringify(result), /attacker|private|collect/);
});

test('HTTPS redirects may not downgrade, add credentials, queries or fragments', async () => {
  for (const location of ['http://codevalanche.com/', 'https://user:password@codevalanche.com/', '/?token=private', '/#private']) {
    const urls = [];
    const result = await probePublicTarget(first, { fetchImpl: async url => { urls.push(url); return new Response(null, { status: 301, headers: { location } }); } });
    assert.equal(result.passed, false);
    assert.ok(urls.every(url => url === first));
    assert.ok(result.issues.includes('get:redirect_outside_allowlist'));
  }
});

test('a different approved page cannot silently replace the requested page', async () => {
  const result = await probePublicTarget(first, { fetchImpl: async (url, init) => url === first ? new Response(null, { status: 302, headers: { location: '/security/' } }) : page(init.method) });
  assert.equal(result.passed, false);
  assert.ok(result.issues.includes('get:canonical_target_changed'));
});

test('redirect loops terminate at a fixed request limit', async () => {
  let calls = 0;
  const result = await probePublicTarget(first, { fetchImpl: async () => { calls++; return new Response(null, { status: 307, headers: { location: '/' } }); } });
  assert.equal(result.passed, false);
  assert.ok(result.issues.includes('get:redirect_limit'));
  assert.ok(calls <= 12);
});

test('404 and 503 are failures even if their bodies contain a valid page policy', async () => {
  for (const status of [404, 503]) {
    const result = await probePublicTarget(first, { fetchImpl: async (_url, init) => page(init.method, { status }) });
    assert.equal(result.passed, false);
    assert.ok(result.issues.includes('get:unexpected_http_status'));
    assert.equal(result.get.status, status);
  }
});

test('HEAD failure cannot hide behind a successful GET', async () => {
  const result = await probePublicTarget(first, { fetchImpl: async (_url, init) => page(init.method, { status: init.method === 'HEAD' ? 405 : 200 }) });
  assert.equal(result.passed, false);
  assert.ok(result.issues.includes('head:unexpected_http_status'));
});

test('diagnostic inventory reports absent headers while the enforced mode fails them', async () => {
  const fetchImpl = async (_url, init) => page(init.method, { headers: { 'content-type': 'text/html' } });
  const inventory = await probePublicTarget(first, { fetchImpl });
  assert.equal(inventory.passed, true);
  assert.ok(inventory.get.headerIssues.includes('hsts_missing_or_short'));
  const enforced = await probePublicTarget(first, { fetchImpl, requireHeaders: true });
  assert.equal(enforced.passed, false);
  for (const issue of ['x_frame_options_not_deny', 'nosniff_missing', 'hsts_missing_or_short', 'header_csp_missing_or_weak']) assert.ok(enforced.issues.includes(`get:${issue}`));
});

test('short HSTS and permissive framing policies do not satisfy live header checks', async () => {
  const weak = { ...headers, 'strict-transport-security': 'max-age=0', 'x-frame-options': 'SAMEORIGIN', 'content-security-policy': "frame-ancestors 'self'; object-src 'none'; base-uri 'self'" };
  const result = await probePublicTarget(first, { requireHeaders: true, fetchImpl: async (_url, init) => page(init.method, { headers: weak }) });
  assert.equal(result.passed, false);
  assert.ok(result.issues.includes('get:hsts_missing_or_short'));
  assert.ok(result.issues.includes('get:header_csp_missing_or_weak'));
});

test('duplicate or malformed HSTS max-age directives cannot qualify enforcement', async () => {
  for (const value of ['max-age=31536000; max-age=oops', 'max-age=31536000; MAX-AGE=0', 'max-age=31536000; includeSubDomains; includeSubDomains', 'max-age=31536000; includeSubDomains=1', 'max-age=31536000=0']) {
    const result = await probePublicTarget(first, { requireHeaders: true, fetchImpl: async (_url, init) => page(init.method, { headers: { ...headers, 'strict-transport-security': value } }) });
    assert.equal(result.passed, false);
    assert.ok(result.issues.includes('get:hsts_missing_or_short'));
  }
});

test('HTTP security tokens and CSP directives do not accept non-ASCII whitespace', async () => {
  for (const [name, value, expected] of [
    ['content-security-policy', "frame-ancestors\u00a0'none'; object-src\u00a0'none'; base-uri\u00a0'self'", 'header_csp_missing_or_weak'],
    ['strict-transport-security', '\u00a0max-age\u00a0=\u00a031536000', 'hsts_missing_or_short'],
    ['x-frame-options', '\u00a0DENY\u00a0', 'x_frame_options_not_deny'],
    ['x-content-type-options', '\u00a0nosniff\u00a0', 'nosniff_missing'],
  ]) {
    const result = await probePublicTarget(first, { requireHeaders: true, fetchImpl: async (_url, init) => page(init.method, { headers: { ...headers, [name]: value } }) });
    assert.equal(result.passed, false);
    assert.ok(result.issues.includes(`get:${expected}`));
  }
});

test('multiple header policies retain a strict additive anti-framing policy', async () => {
  const additive = { ...headers, 'content-security-policy': `default-src 'self', ${headers['content-security-policy']}` };
  const result = await probePublicTarget(first, { requireHeaders: true, fetchImpl: async (_url, init) => page(init.method, { headers: additive }) });
  assert.equal(result.passed, true);
});

test('HTML requires one effective meta policy before executable scripts', async () => {
  for (const body of [html.replace(/<meta content="[^"]+" http-equiv="Content-Security-Policy">/, ''), html.replace('<head>', `<head><script>${inline}</script>`), html.replace('</head>', `<meta content="${policy}" http-equiv="Content-Security-Policy"></head>`)]) {
    const result = await probePublicTarget(first, { fetchImpl: async (_url, init) => page(init.method, { body }) });
    assert.equal(result.passed, false);
    assert.ok(result.issues.some(issue => issue.startsWith('html:csp_meta_')));
  }
});

test('CSP metadata in inert template or noscript content is not an active page policy', async () => {
  for (const container of ['template', 'noscript']) {
    const fake = `<${container}><meta content="${policy}" http-equiv="Content-Security-Policy"></${container}>`;
    const body = html.replace(`<meta content="${policy}" http-equiv="Content-Security-Policy">`, fake);
    const result = await probePublicTarget(first, { requireHeaders: true, fetchImpl: async (_url, init) => page(init.method, { body }) });
    assert.equal(result.passed, false);
    assert.ok(result.issues.includes('html:csp_meta_count'));
  }
});

test('unsafe-inline and an overriding broad script-src-elem are refused', async () => {
  for (const injected of [policy.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"), `${policy}; script-src-elem https:`]) {
    const result = await probePublicTarget(first, { fetchImpl: async (_url, init) => page(init.method, { body: html.replace(policy, injected) }) });
    assert.equal(result.passed, false);
    assert.ok(result.issues.includes('html:csp_script_sources_not_strict'));
  }
});

test('an external tracker script is rejected without fetching any script resources', async () => {
  const calls = [];
  const body = html.replace('</body>', '<script src="https://www.googletagmanager.com/gtag/js?id=G-PRIVATE"></script></body>');
  const result = await probePublicTarget(first, { fetchImpl: async (url, init) => { calls.push(url); return page(init.method, { body }); } });
  assert.equal(result.passed, false);
  assert.ok(result.issues.includes('html:external_script_origin_not_approved'));
  assert.ok(calls.every(url => url === first));
  assert.doesNotMatch(JSON.stringify(result), /G-PRIVATE/);
});

test('inline tracker injection is detected even when its hash was added to the meta policy', async () => {
  const tracker = "fetch('https://www.google-analytics.com/collect')";
  const trackerHash = createHash('sha256').update(tracker).digest('base64');
  const body = html.replace(policy, `${policy} 'sha256-${trackerHash}'`).replace('</body>', `<script>${tracker}</script></body>`);
  const result = await probePublicTarget(first, { fetchImpl: async (_url, init) => page(init.method, { body }) });
  assert.equal(result.passed, false);
  assert.ok(result.issues.includes('html:tracker_injection_detected'));
});

test('SVG script href and noscript tracking pixels remain visible to the source inventory', async () => {
  for (const injection of ['<svg><script href="https://www.googletagmanager.com/gtag/js"></script></svg>', '<noscript><img src="https://www.google-analytics.com/collect"></noscript>']) {
    const body = html.replace('</body>', `${injection}</body>`);
    const result = await probePublicTarget(first, { fetchImpl: async (_url, init) => page(init.method, { body }) });
    assert.equal(result.passed, false);
    assert.ok(result.issues.includes('html:tracker_injection_detected'));
  }
});

test('scripting-disabled fallback parsing cannot hide a script active in the real page', async () => {
  const body = html.replace('</body>', '<noscript><style></noscript><script src="https://attacker.example/hidden.js"></script></style></noscript></body>');
  const result = await probePublicTarget(first, { fetchImpl: async (_url, init) => page(init.method, { body }) });
  assert.equal(result.passed, false);
  assert.ok(result.issues.includes('html:external_script_origin_not_approved'));
});

test('a newly injected executable inline script must have its own matching CSP hash', async () => {
  const result = await probePublicTarget(first, { fetchImpl: async (_url, init) => page(init.method, { body: html.replace('</body>', '<script>window.injected=true</script></body>') }) });
  assert.equal(result.passed, false);
  assert.ok(result.issues.includes('html:inline_script_hash_missing'));
});

test('Turnstile is allowed only on the Codevalanche account page', async () => {
  const accountPolicy = `${policy}; script-src-elem 'self' 'sha256-${hash}' https://challenges.cloudflare.com`;
  const body = html.replace(policy, accountPolicy).replace('</body>', '<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script></body>');
  const account = await probePublicTarget('https://codevalanche.com/account/', { fetchImpl: async (_url, init) => page(init.method, { body }) });
  assert.equal(account.passed, true);
  const marketing = await probePublicTarget(first, { fetchImpl: async (_url, init) => page(init.method, { body }) });
  assert.equal(marketing.passed, false);
});

test('foreign base elements and inline event handlers cannot bypass script inventory', async () => {
  for (const body of [html.replace('<head>', '<head><base href="https://attacker.example/">'), html.replace('<body>', '<body onload="window.injected=true">')]) {
    const result = await probePublicTarget(first, { fetchImpl: async (_url, init) => page(init.method, { body }) });
    assert.equal(result.passed, false);
    assert.ok(result.issues.includes('html:external_base_origin') || result.issues.includes('html:inline_event_handler'));
  }
});

test('non-HTML pages and oversized decoded bodies fail safely', async () => {
  const nonHtml = await probePublicTarget(first, { fetchImpl: async (_url, init) => page(init.method, { headers: { ...headers, 'content-type': 'application/json' } }) });
  assert.equal(nonHtml.passed, false);
  assert.ok(nonHtml.issues.includes('html:content_type_not_html'));
  const oversized = await probePublicTarget(first, { fetchImpl: async (_url, init) => page(init.method, { body: 'x'.repeat(2 * 1024 * 1024 + 1) }) });
  assert.equal(oversized.passed, false);
  assert.ok(oversized.issues.includes('get:response_body_too_large'));
});

test('network errors never echo raw exceptions or arbitrary supplied URLs', async () => {
  const result = await probePublicTarget(first, { fetchImpl: async () => { throw new Error('Bearer private-key secret-url'); } });
  assert.equal(result.passed, false);
  assert.ok(result.issues.includes('get:request_failed'));
  assert.doesNotMatch(JSON.stringify(result), /Bearer|private|secret/);
  let called = false;
  await assert.rejects(probePublicTarget('https://attacker.example/', { fetchImpl: async () => { called = true; } }), /target_not_allowlisted/);
  assert.equal(called, false);
});
