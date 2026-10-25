import test from 'node:test';
import assert from 'node:assert/strict';
import { LOCALES, MARKETING_PAGES } from '../src/locales/manifest.js';

const moduleUnderTest = await import('./locale-export.mjs').catch(() => null);
const fixture = '<!doctype html><html lang="en"><head><title>Terms | Codevalanche</title><link rel="canonical" href="https://codevalanche.com/terms.html"><meta property="og:url" content="https://codevalanche.com/terms.html"><meta name="description" content="Website terms."></head><body><a href="/privacy.html?source=footer#choice">Privacy</a><a href="/account/">Your account</a><footer><div class="footer-bottom"><span>Copyright</span></div></footer><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","@id":"https://codevalanche.com/#website","url":"https://codevalanche.com/"}]}</script></body></html>';
const pickerFixture = '<!doctype html><html lang="en"><head></head><body><footer><div class="footer-bottom"><span>Copyright</span><details class="lang-picker"><summary aria-label="Language: English"><svg></svg> English <b>17 in the app</b></summary><div><ul class="lang-grid"><li class="is-site">English <em>this site</em></li><li>Italiano <em>it</em></li></ul></div></details></div></footer></body></html>';

test('localized links preserve route, query and fragment while leaving account callbacks intact', () => {
  assert.equal(typeof moduleUnderTest?.rewriteLocalizedLinks, 'function', 'localized link rewriter exists');
  const html = moduleUnderTest.rewriteLocalizedLinks(fixture, 'it');
  assert.match(html, /href="\/it\/privacy\.html\?source=footer#choice"/);
  assert.match(html, /href="\/account\/"/);
});

test('localized metadata sets canonical, language alternates and route WebPage data', () => {
  assert.equal(typeof moduleUnderTest?.applyLocalizedMetadata, 'function', 'localized SEO metadata builder exists');
  const html = moduleUnderTest.applyLocalizedMetadata(fixture, '/terms.html', 'it');
  assert.match(html, /<html lang="it" dir="ltr">/);
  assert.match(html, /rel="canonical" href="https:\/\/codevalanche\.com\/it\/terms\.html"/);
  assert.match(html, /property="og:url" content="https:\/\/codevalanche\.com\/it\/terms\.html"/);
  assert.match(html, /property="og:title" content="Terms \| Codevalanche"/);
  assert.match(html, /property="og:description" content="Website terms\."/);
  assert.match(html, /name="twitter:title" content="Terms \| Codevalanche"/);
  assert.match(html, /hreflang="en" href="https:\/\/codevalanche\.com\/terms\.html"/);
  assert.match(html, /hreflang="it" href="https:\/\/codevalanche\.com\/it\/terms\.html"/);
  assert.match(html, /hreflang="x-default" href="https:\/\/codevalanche\.com\/terms\.html"/);
  assert.match(html, /"@type":"WebPage"/);
  assert.match(html, /"inLanguage":"it"/);
});

test('sitemap lists all 17 locale routes for public pages and omits account paths', () => {
  assert.equal(typeof moduleUnderTest?.buildLocalizedSitemap, 'function', 'localized sitemap builder exists');
  const xml = moduleUnderTest.buildLocalizedSitemap();
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.equal(locations.length, MARKETING_PAGES.length * LOCALES.length);
  assert.equal(locations.length, 204);
  assert.equal(new Set(locations).size, 204);
  for (const route of ['/how-it-works/', '/agents/', '/features/multiple-accounts/', '/local-ai/', '/docs/', '/download/', '/security/']) {
    for (const locale of LOCALES) assert.ok(locations.includes(`https://codevalanche.com${locale.slug ? `/${locale.slug}` : ''}${route}`));
  }
  assert.match(xml, /https:\/\/codevalanche\.com\/zh-hant\/terms\.html/);
  assert.doesNotMatch(xml, /\/account(?:\.html|\/)/);
  assert.match(xml, /hreflang="pt-BR"/);
});

test('directory links preserve query, hash and nested page identity in both locale directions', () => {
  const fixture = '<a href="/it/features/multiple-accounts/index.html?from=docs#selection">Accounts</a><a href="/agents?source=nav#codex">Agents</a><a href="#review">Review</a><a href="/account/authorize/?next=/agents/#callback">Sign in</a><a href="https://example.com/agents/">External</a>';
  const arabic = moduleUnderTest.rewriteLocalizedLinks(fixture, 'ar');
  assert.match(arabic, /href="\/ar\/features\/multiple-accounts\/\?from=docs#selection"/);
  assert.match(arabic, /href="\/ar\/agents\/\?source=nav#codex"/);
  assert.match(arabic, /href="#review"/);
  assert.match(arabic, /href="\/account\/authorize\/\?next=\/agents\/#callback"/);
  assert.match(arabic, /href="https:\/\/example.com\/agents\/"/);
  const english = moduleUnderTest.rewriteLocalizedLinks(arabic, 'en');
  assert.match(english, /href="\/features\/multiple-accounts\/\?from=docs#selection"/);
  assert.match(english, /href="\/agents\/\?source=nav#codex"/);
});

test('nested directory metadata and language picker retain canonical page and RTL context', () => {
  const canonical = '/features/multiple-accounts/';
  const metadata = moduleUnderTest.applyLocalizedMetadata(fixture, `${canonical}index.html`, 'ar');
  assert.match(metadata, /<html lang="ar" dir="rtl">/);
  assert.match(metadata, /rel="canonical" href="https:\/\/codevalanche.com\/ar\/features\/multiple-accounts\/"/);
  const footer = moduleUnderTest.rewriteFooterLanguageLinks(pickerFixture, canonical, 'it');
  assert.match(footer, /href="\/it\/features\/multiple-accounts\/" data-locale="it" aria-current="page"/);
  assert.match(footer, /href="\/features\/multiple-accounts\/" data-locale="en"/);
});

test('footer picker links preserve page context and mark only the active locale', () => {
  assert.equal(typeof moduleUnderTest?.ensureLanguagePicker, 'function', 'shared footer picker installer exists');
  assert.equal(typeof moduleUnderTest?.rewriteFooterLanguageLinks, 'function', 'footer picker link builder exists');
  const withPicker = moduleUnderTest.ensureLanguagePicker(fixture, pickerFixture);
  const html = moduleUnderTest.rewriteFooterLanguageLinks(withPicker, '/privacy.html', 'it');
  assert.match(html, /href="\/privacy\.html" data-locale="en"/);
  assert.match(html, /href="\/it\/privacy\.html" data-locale="it" aria-current="page"/);
  assert.match(html, /class="is-site">/);
  assert.match(html, /aria-label="Italiano"/);
  assert.equal((html.match(/class="lang-picker"/g) ?? []).length, 1);
});

test('rewriting an already-linked footer picker keeps exactly one link per locale', () => {
  assert.equal(typeof moduleUnderTest?.rewriteFooterLanguageLinks, 'function', 'footer link rewriter exists');
  const english = moduleUnderTest.rewriteFooterLanguageLinks(pickerFixture, '/', 'en');
  const italian = moduleUnderTest.rewriteFooterLanguageLinks(english, '/', 'it');
  assert.equal((italian.match(/data-locale="[^"]+"/g) ?? []).length, 2);
  assert.equal((italian.match(/aria-current="page"/g) ?? []).length, 1);
  assert.match(italian, /href="\/it\/" data-locale="it" aria-current="page"/);
  assert.match(italian, /href="\/" data-locale="en"/);
});
