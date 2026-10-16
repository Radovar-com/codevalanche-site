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
  // Turnstile (the reviewed Cloudflare challenge origin) is allowed on account pages only.
  await mkdir(path.join(root, 'account', 'nested'), { recursive: true });
  await mkdir(path.join(root, 'nested'));
  const script = 'window.theme = "dark";';
  const page = `<!doctype html><html><head><meta charset="utf-8"><title>Test</title></head><body><script>${script}</script><script type="application/ld+json">{"@type":"Thing"}</script><script src="/app.js"></script></body></html>`;
  await writeFile(path.join(root, 'account', 'nested', 'index.html'), page);
  await writeFile(path.join(root, 'nested', 'index.html'), page);

  await moduleUnderTest.applyPostbuildSecurity(root);
  const expectedHash = createHash('sha256').update(script).digest('base64');
  for (const [relative, account] of [[path.join('account', 'nested', 'index.html'), true], [path.join('nested', 'index.html'), false]]) {
    const html = await readFile(path.join(root, relative), 'utf8');
    const csp = html.match(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/)?.[1];
    assert.ok(csp);
    assert.match(csp, new RegExp(`sha256-${expectedHash}`));
    assert.match(csp, /frame-ancestors 'none'/);
    assert.equal((html.match(/http-equiv="Content-Security-Policy"/g) ?? []).length, 1);
    assert.ok(html.indexOf('<meta charset="utf-8">') < html.indexOf('Content-Security-Policy'), 'the charset stays first');
    assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'), 'the policy precedes every script');
    if (account) {
      assert.match(csp, /script-src [^;]*https:\/\/challenges\.cloudflare\.com/);
      assert.match(csp, /frame-src https:\/\/challenges\.cloudflare\.com/);
      assert.match(csp, /style-src 'self';/);
    } else {
      assert.doesNotMatch(csp, /challenges\.cloudflare\.com/);
      assert.match(csp, /frame-src 'none'/);
    }
  }
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

test('post-build security hashes fixed inserted <style> text for account pages and refuses computed text', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'codevalanche-csp-style-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(path.join(root, 'account'));
  await writeFile(path.join(root, 'account', 'index.html'), '<html><head><meta charset="utf-8"></head><body></body></html>');
  const text = '[data-x]{color:red}';
  await writeFile(path.join(root, 'panel.js'), `const style=document.createElement('style');style.textContent=\`${text}\`;document.head.append(style)`);
  await moduleUnderTest.applyPostbuildSecurity(root);
  const csp = (await readFile(path.join(root, 'account', 'index.html'), 'utf8')).match(/content="([^"]+)"/)[1];
  assert.match(csp, new RegExp(`style-src 'self' 'sha256-${createHash('sha256').update(text).digest('base64').replace(/[+/]/g, '\$&')}';`));
  assert.doesNotMatch(csp, /style-src[^;]*unsafe-inline/);
  await writeFile(path.join(root, 'panel.js'), "const style=document.createElement('style');style.textContent=`[data-x]{color:${color}}`");
  await assert.rejects(moduleUnderTest.applyPostbuildSecurity(root), /not a fixed template/);
});
