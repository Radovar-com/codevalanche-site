import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import * as seo from './seo-export-test.mjs';
const links = await import('./check-internal-links.mjs').catch(() => ({}));
async function fixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'site-quality-'));
  const put = async (file, html) => { const target = path.join(root, file); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, html); };
  try { await run(root, put); } finally { await rm(root, { recursive: true, force: true }); }
}
test('a new indexable HTML page cannot silently escape sitemap and hreflang validation', async () => {
  assert.equal(typeof seo.validatePublicPageInventory, 'function');
  await fixture(async (root, put) => {
    await put('new-page/index.html', '<title>New page</title>');
    await assert.rejects(seo.validatePublicPageInventory(root), /unregistered indexable page.*new-page/);
  });
});
test('private noindex pages are excluded but a registered public page cannot become noindex', async () => {
  assert.equal(typeof seo.validatePublicPageInventory, 'function');
  await fixture(async (root, put) => {
    await put('account/index.html', '<meta name="robots" content="noindex, nofollow">');
    await seo.validatePublicPageInventory(root);
    await put('index.html', '<meta name="robots" content="noindex">');
    await assert.rejects(seo.validatePublicPageInventory(root), /public page.*noindex/);
  });
});
test('internal checker follows relative, absolute, encoded and localized links and resources', async () => {
  assert.equal(typeof links.checkInternalLinks, 'function');
  await fixture(async (root, put) => {
    await put('index.html', '<a href="/ro/docs/?from=home#intro">Docs</a><a href="https://codevalanche.com/ro/docs/">Docs</a><a href="mailto:public@example.test">Mail</a><a href="https://example.test/">External</a><a href="#top">Top</a>');
    await put('ro/docs/index.html', '<a href="../../">Home</a><img src="/assets/a%20b.svg" width="1" height="1"><link rel="stylesheet" href="/style.css?v=123"><source srcset="/assets/a%20b.svg 1x, /assets/a%20b.svg 2x">');
    await put('assets/a b.svg', '<svg/>');
    await put('style.css', 'body{background:url("/assets/a%20b.svg")}');
    const result = await links.checkInternalLinks(root);
    assert.equal(result.htmlFiles, 2);
    assert.deepEqual(result.broken, []);
    await put('ro/docs/index.html', '<a href="/missing/">Broken</a><img src="/missing.webp"><source srcset="/also-missing.webp 640w">');
    const broken = await links.checkInternalLinks(root);
    assert.deepEqual(broken.broken.map(item => item.target).sort(), ['/also-missing.webp', '/missing.webp', '/missing/']);
  });
});
test('CSS imports and nested resources cannot hide a broken dependency', async () => {
  assert.equal(typeof links.checkInternalLinks, 'function');
  await fixture(async (root, put) => {
    await put('index.html', '<link rel="stylesheet" href="/styles/main.css">');
    await put('styles/main.css', '@import "./font.css"; body { background: url(../missing.png); }');
    const { broken } = await links.checkInternalLinks(root);
    assert.deepEqual(broken.map(item => item.target).sort(), ['/missing.png', '/styles/font.css']);
  });
});
test('legacy account redirect explicitly prevents indexing of private service entry', async () => {
  const { readFile } = await import('node:fs/promises');
  assert.match(await readFile(new URL('../src/account.html', import.meta.url), 'utf8'), /<meta name="robots" content="noindex">/);
});
test('the labelled agents and models container exposes group semantics', async () => {
  const { readFile } = await import('node:fs/promises');
  const { parse } = await import('parse5');
  const html = parse(await readFile(new URL('../src/index.html', import.meta.url), 'utf8'));
  let group;
  const visit = node => {
    const attrs = new Map((node.attrs ?? []).map(attr => [attr.name, attr.value]));
    if (attrs.get('class')?.split(/\s+/).includes('hero-runtimes')) group = attrs;
    for (const child of node.childNodes ?? []) visit(child);
  };
  visit(html);
  assert.equal(group?.get('role'), 'group');
  assert.equal(group.get('aria-label'), 'Agents and models you can use');
});
