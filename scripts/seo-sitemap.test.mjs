import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES, MARKETING_PAGES, localizedMarketingPath } from '../src/locales/manifest.js';
import { buildLocalizedSitemap } from './locale-export.mjs';
import * as seo from './seo-export-test.mjs';

const origin = 'https://codevalanche.com';
const sitemapWith = locations => `<urlset>${locations.map(location => `<url><loc>${location}</loc></url>`).join('')}</urlset>`;

test('sitemap validation accepts all 204 public locations including localized multiple-accounts', () => {
  const sitemap = buildLocalizedSitemap();
  assert.equal(/account|authorize|signed-in/i.test(sitemap), true, 'the historical whole-XML guard reproduces the false positive');
  assert.equal(typeof seo.validateSitemapLocations, 'function');
  const canonicalUrls = new Set(MARKETING_PAGES.flatMap(page => LOCALES.map(locale => new URL(localizedMarketingPath(page.path, locale.tag), origin).href)));
  assert.equal(canonicalUrls.size, 204);
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
