import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
const cache = await import('./asset-cache.mjs').catch(() => null);

async function fixture(run) {
  const root = await mkdtemp(path.join(tmpdir(), 'codevalanche-cache-'));
  const put = async (name, text) => { await mkdir(path.dirname(path.join(root, name)), { recursive: true }); await writeFile(path.join(root, name), text); };
  try {
    await put('index.html', '<html><head><link rel="stylesheet" href="/styles.css"><script src="/config.js"></script></head><body><script type="module" src="/site.js"></script><script type="module" src="/locales/bootstrap.js"></script></body></html>');
    await put('ar/features/multiple-accounts/index.html', '<html><head><link rel="stylesheet" href="/styles.css"></head><body><script type="module" src="/site.js"></script></body></html>');
    await put('account/index.html', '<html><head><link href="/account/account.css?v=old" rel="stylesheet"></head><body><script src="/account/app.js?v=old" type="module"></script><script src="/config.js?v=old"></script></body></html>');
    await put('styles.css', 'body { color: teal; }');
    await put('config.js', 'window.CONFIG = {};');
    await put('site.js', "void import('./account-funnel.js').catch(() => {});");
    await put('account-funnel.js', "import { locale } from './locales/runtime.js'; import './analytics/owned-analytics.js'; import 'https://example.com/external.js'; export { locale }; ");
    await put('locales/bootstrap.js', "import { locale } from './runtime.js'; console.log(locale);");
    await put('locales/runtime.js', "import { pages } from './manifest.js'; export const locale = pages;");
    await put('locales/manifest.js', 'export const pages = [];');
    await put('locales/ar.json', '{"Hello":"مرحبا"}');
    await put('analytics/owned-analytics.js', '/* generated SDK: preserve exact bytes */\nexport const sdk = true;\n');
    await put('account/app.js', '/* compiled account */\nwindow.ACCOUNT = true;\n');
    await put('account/account.css', 'body { color: black; }');
    await run(root, put);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('asset stamping versions real entry assets and the whole literal module graph with shared identity', async () => {
  assert.equal(typeof cache?.versionSiteAssets, 'function');
  await fixture(async root => {
    const sdk = await readFile(path.join(root, 'analytics/owned-analytics.js'));
    const account = await readFile(path.join(root, 'account/app.js'));
    const { revision, htmlFiles } = await cache.versionSiteAssets(root);
    assert.match(revision, /^[a-f0-9]{16}$/);
    assert.equal(htmlFiles, 3);
    for (const name of ['index.html', 'ar/features/multiple-accounts/index.html', 'account/index.html']) assert.match(await readFile(path.join(root, name), 'utf8'), new RegExp(`data-asset-revision="${revision}"`));
    const home = await readFile(path.join(root, 'index.html'), 'utf8');
    assert.ok(home.includes(`/site.js?v=${revision}`));
    assert.ok(home.includes(`/styles.css?v=${revision}`));
    assert.ok((await readFile(path.join(root, 'site.js'), 'utf8')).includes(`./account-funnel.js?v=${revision}`));
    assert.ok((await readFile(path.join(root, 'account-funnel.js'), 'utf8')).includes(`./locales/runtime.js?v=${revision}`));
    assert.ok((await readFile(path.join(root, 'locales/bootstrap.js'), 'utf8')).includes(`./runtime.js?v=${revision}`));
    assert.ok((await readFile(path.join(root, 'locales/runtime.js'), 'utf8')).includes(`./manifest.js?v=${revision}`));
    assert.ok((await readFile(path.join(root, 'account-funnel.js'), 'utf8')).includes(`./analytics/owned-analytics.js?v=${revision}`));
    assert.ok((await readFile(path.join(root, 'account-funnel.js'), 'utf8')).includes('https://example.com/external.js'));
    assert.deepEqual(await readFile(path.join(root, 'analytics/owned-analytics.js')), sdk);
    assert.deepEqual(await readFile(path.join(root, 'account/app.js')), account);
    const accountHash = createHash('sha256').update(account).digest('hex').slice(0, 16);
    assert.ok((await readFile(path.join(root, 'account/index.html'), 'utf8')).includes(`/account/app.js?v=${accountHash}`));
  });
});

test('build revision is deterministic and invalidates when only a dependency or catalog changes', async () => {
  assert.equal(typeof cache?.versionSiteAssets, 'function');
  const revisions = [];
  for (const changed of [null, null, 'locales/manifest.js', 'locales/ar.json']) await fixture(async (root, put) => {
    if (changed) await put(changed, changed.endsWith('.json') ? '{"Hello":"أهلا"}' : 'export const pages = ["agents"];');
    revisions.push((await cache.versionSiteAssets(root)).revision);
  });
  assert.equal(revisions[0], revisions[1]);
  assert.notEqual(revisions[0], revisions[2]);
  assert.notEqual(revisions[0], revisions[3]);
});

test('asset stamping preserves external URLs, missing files, query/hash, and non-asset links', async () => {
  assert.equal(typeof cache?.versionSiteAssets, 'function');
  await fixture(async (root, put) => {
    await put('edges.html', '<html><head><link rel="stylesheet" href="/styles.css?theme=paper#top"><link rel="stylesheet" href="https://example.com/styles.css"><script src="/missing.js"></script></head><body><a href="/site.js">Source</a><script src="https://codevalanche.com/site.js"></script></body></html>');
    await put('edges.js', "import './missing.js'; const value = './locales/runtime.js'; export { pages } from './locales/manifest.js?source=edges#part'; console.log(value);");
    const { revision } = await cache.versionSiteAssets(root);
    const html = await readFile(path.join(root, 'edges.html'), 'utf8');
    assert.ok(html.includes(`/styles.css?theme=paper&amp;v=${revision}#top`));
    assert.ok(html.includes('href="https://example.com/styles.css"'));
    assert.ok(html.includes('src="/missing.js"'));
    assert.ok(html.includes('href="/site.js"'));
    assert.ok(html.includes(`src="https://codevalanche.com/site.js?v=${revision}"`));
    const script = await readFile(path.join(root, 'edges.js'), 'utf8');
    assert.match(script, /import ["']\.\/missing\.js["']/);
    assert.ok(script.includes('./locales/runtime.js"') || script.includes("'./locales/runtime.js'"));
    assert.ok(script.includes(`./locales/manifest.js?source=edges&v=${revision}#part`));
  });
});
test('font revisions match CSS and preload URLs and invalidate when font bytes change', async () => {
  const revisions = [];
  for (const bytes of ['first font', 'updated font']) await fixture(async (root, put) => {
    await put('assets/fonts/heading.woff2', bytes);
    await put('styles.css', '@font-face{font-family:Heading;src:url(/assets/fonts/heading.woff2) format("woff2")}');
    await put('index.html', '<html><head><link rel="preload" href="/assets/fonts/heading.woff2" as="font" crossorigin><link rel="stylesheet" href="/styles.css"></head></html>');
    const { revision } = await cache.versionSiteAssets(root);
    revisions.push(revision);
    assert.ok((await readFile(path.join(root, 'styles.css'), 'utf8')).includes(`/assets/fonts/heading.woff2?v=${revision}`));
    assert.ok((await readFile(path.join(root, 'index.html'), 'utf8')).includes(`/assets/fonts/heading.woff2?v=${revision}`));
  });
  assert.notEqual(revisions[0], revisions[1]);
});
