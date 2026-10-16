import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const moduleUnderTest = await import('./postbuild-security.mjs').catch(() => null);

test('post-build CSP hashes executable inline scripts and permits only configured origins', async t => {
  assert.equal(typeof moduleUnderTest?.applyPostbuildSecurity, 'function', 'post-build security pass exists');
  const root = await mkdtemp(path.join(tmpdir(), 'codevalanche-csp-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'nested'));
  const script = 'window.theme = "dark";';
  await writeFile(path.join(root, 'nested', 'index.html'), `<!doctype html><html><head><title>Test</title></head><body><script>${script}</script><script type="application/ld+json">{"@type":"Thing"}</script><script src="/app.js"></script></body></html>`);

  await moduleUnderTest.applyPostbuildSecurity(root);
  const html = await readFile(path.join(root, 'nested', 'index.html'), 'utf8');
  const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
  const expectedHash = createHash('sha256').update(script).digest('base64');
  assert.ok(csp);
  assert.match(csp, new RegExp(`sha256-${expectedHash}`));
  assert.match(csp, /https:\/\/challenges\.cloudflare\.com/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.equal((html.match(/http-equiv="Content-Security-Policy"/g) ?? []).length, 1);
});

test('post-build security rejects unreviewed external script origins', async t => {
  assert.equal(typeof moduleUnderTest?.applyPostbuildSecurity, 'function', 'post-build security pass exists');
  const root = await mkdtemp(path.join(tmpdir(), 'codevalanche-csp-reject-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'index.html'), '<html><head></head><body><script src="https://unknown.example/tracker.js"></script></body></html>');
  await assert.rejects(moduleUnderTest.applyPostbuildSecurity(root), /unreviewed external script origin/i);
});

test('post-build security rejects inline event attributes because script-src-attr is locked down', async t => {
  assert.equal(typeof moduleUnderTest?.applyPostbuildSecurity, 'function', 'post-build security pass exists');
  const root = await mkdtemp(path.join(tmpdir(), 'codevalanche-csp-inline-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'index.html'), '<html><head></head><body><button onclick="run()">Run</button></body></html>');
  await assert.rejects(moduleUnderTest.applyPostbuildSecurity(root), /inline event handler/i);
});

test('post-build security checks dynamically inserted external script URLs', async t => {
  assert.equal(typeof moduleUnderTest?.applyPostbuildSecurity, 'function', 'post-build security pass exists');
  const root = await mkdtemp(path.join(tmpdir(), 'codevalanche-csp-dynamic-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'index.html'), '<html><head></head><body></body></html>');
  await writeFile(path.join(root, 'app.js'), 'const script = document.createElement("script"); script.src = "https://unknown.example/widget.js";');
  await assert.rejects(moduleUnderTest.applyPostbuildSecurity(root), /unreviewed dynamic script origin/i);
});

test('post-build security permits the reviewed Cloudflare challenge script origin', async t => {
  assert.equal(typeof moduleUnderTest?.applyPostbuildSecurity, 'function', 'post-build security pass exists');
  const root = await mkdtemp(path.join(tmpdir(), 'codevalanche-csp-reviewed-dynamic-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(path.join(root, 'index.html'), '<html><head></head><body></body></html>');
  await writeFile(path.join(root, 'app.js'), "const script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';");
  await moduleUnderTest.applyPostbuildSecurity(root);
});
