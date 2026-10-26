import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES, MARKETING_PAGES, localizedMarketingPath } from '../src/locales/manifest.js';
import { buildLocalizedSitemap } from './locale-export.mjs';
import * as seo from './seo-export-test.mjs';

const origin = 'https://codevalanche.com';
const sitemapWith = locations => `<urlset>${locations.map(location => `<url><loc>${location}</loc></url>`).join('')}</urlset>`;

test('sitemap validation accepts all 221 public locations including localized multiple-accounts', () => {
  const sitemap = buildLocalizedSitemap();
  assert.equal(/account|authorize|signed-in/i.test(sitemap), true, 'the historical whole-XML guard reproduces the false positive');
  assert.equal(typeof seo.validateSitemapLocations, 'function');
  const canonicalUrls = new Set(MARKETING_PAGES.flatMap(page => LOCALES.map(locale => new URL(localizedMarketingPath(page.path, locale.tag), origin).href)));
  assert.equal(canonicalUrls.size, 221);
  assert.doesNotThrow(() => seo.validateSitemapLocations(sitemap, canonicalUrls));
});

test('sitemap validation checks URL pathname instead of words in XML, query, or fragment', () => {
  assert.equal(typeof seo.validateSitemapLocations, 'function');
  const url = `${origin}/features/multiple-accounts/?from=account#signed-in`;
  const sitemap = `${sitemapWith([url])}<!-- account authorize signed-in -->`;
  assert.doesNotThrow(() => seo.validateSitemapLocations(sitemap, new Set([url])));
});

test('sitemap validation rejects actual private account, callback and operator pathnames in every locale', () => {
  assert.equal(typeof seo.validateSitemapLocations, 'function');
  const privateRoutes = ['/account', '/account/', '/account/index.html', '/account.html', '/account/authorize/', '/account/authorize/index.html', '/account/signed-in/', '/account/signed-in/index.html', '/authorize/', '/signed-in/', '/admin-accounts/', '/admin-accounts/index.html', '/insights/', '/insights/index.html'];
  for (const locale of LOCALES) {
    for (const pathname of privateRoutes) {
      const url = `${origin}${locale.slug ? `/${locale.slug}` : ''}${pathname}`;
      assert.throws(() => seo.validateSitemapLocations(sitemapWith([url]), new Set([url])), /sitemap contains an account route/, url);
    }
  }
});

test('sitemap validation keeps exact canonical membership and count checks', () => {
  assert.equal(typeof seo.validateSitemapLocations, 'function');
  const home = `${origin}/`;
  const agents = `${origin}/agents/`;
  const canonicalUrls = new Set([home, agents]);
  assert.throws(() => seo.validateSitemapLocations(sitemapWith([home]), canonicalUrls), /sitemap route count/);
  assert.throws(() => seo.validateSitemapLocations(sitemapWith([home, home]), canonicalUrls), /sitemap is missing/);
  assert.throws(() => seo.validateSitemapLocations(sitemapWith([home, `${origin}/unexpected/`]), canonicalUrls), /sitemap is missing/);
  assert.doesNotThrow(() => seo.validateSitemapLocations(sitemapWith([agents, home]), canonicalUrls));
});

test('complete export validation rejects a removed alternate, sitemap route, or untranslated route schema', async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const path = await import('node:path');
  const { applyLocalizedMetadata } = await import('./locale-export.mjs');
  const root = await mkdtemp(path.join(tmpdir(), 'seo-export-'));
  const put = async (file, html) => { await mkdir(path.dirname(path.join(root, file)), {recursive:true}); await writeFile(path.join(root, file), html); };
  try {
    for (const page of MARKETING_PAGES) for (const locale of LOCALES) {
      const html = `<html><head><title>${locale.tag} ${page.pageId}</title><meta name="description" content="${locale.tag} ${page.pageId}"><link rel="canonical" href="${origin}${page.path}"><meta http-equiv="Content-Security-Policy" content="script-src 'self'"></head><body><script src="/locales/bootstrap.js"></script></body></html>`;
      await put(path.join(locale.slug, page.file), applyLocalizedMetadata(html, page.path, locale.tag));
    }
    await put('sitemap.xml', buildLocalizedSitemap());
    await put('robots.txt', 'Disallow: /account/\nDisallow: /admin-accounts/\nDisallow: /insights/\nSitemap: https://codevalanche.com/sitemap.xml');
    await put('llms.txt', '/llms-full.txt /sitemap.xml');
    await put('llms-full.txt', '## page\n'.repeat(MARKETING_PAGES.length * LOCALES.length));
    assert.equal((await seo.validateSeoExport(root)).publicPages, MARKETING_PAGES.length * LOCALES.length);
    const home = await readFile(path.join(root, 'index.html'), 'utf8');
    await put('index.html', home.replace(/<link rel="alternate" hreflang="ar"[^>]+>/, ''));
    await assert.rejects(seo.validateSeoExport(root), /hreflang links/);
    await put('index.html', home);
    await put('sitemap.xml', buildLocalizedSitemap().replace(/\s*<url>[\s\S]*?<\/url>/, ''));
    await assert.rejects(seo.validateSeoExport(root), /sitemap route count/);
  } finally { await rm(root, {recursive:true,force:true}); }
});
