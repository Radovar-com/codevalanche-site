import test from 'node:test';
import assert from 'node:assert/strict';

const moduleUnderTest = await import('../src/locales/runtime.js').catch(() => null);
import { LOCALES, MARKETING_PAGES } from '../src/locales/manifest.js';

test('locale runtime validates the saved preference against the supported manifest', () => {
  assert.equal(typeof moduleUnderTest?.getPreferredLocale, 'function', 'locale preference reader exists');
  assert.equal(moduleUnderTest.getPreferredLocale('theme=dark; codevalanche_language=pt-br').tag, 'pt-BR');
  assert.equal(moduleUnderTest.getPreferredLocale('codevalanche_language=../../account').tag, 'en');
  assert.equal(moduleUnderTest.getPreferredLocale('').tag, 'en');
  assert.equal(moduleUnderTest.getPreferredLocale('codevalanche_language=fr', '/it/privacy.html').tag, 'it');
  assert.equal(moduleUnderTest.getPreferredLocale('codevalanche_language=it', '/privacy.html').tag, 'en');
  assert.equal(moduleUnderTest.getPreferredLocale('codevalanche_language=it', '/account/').tag, 'it');
});

test('every registered marketing route overrides a conflicting language cookie', () => {
  assert.equal(moduleUnderTest.getPreferredLocale('codevalanche_language=fr', '/ar/features/multiple-accounts/index.html').tag, 'ar');
  assert.equal(moduleUnderTest.getPreferredLocale('codevalanche_language=it', '/docs/').tag, 'en');
  for (const page of MARKETING_PAGES) {
    for (const locale of LOCALES) {
      const pathname = `${locale.slug ? `/${locale.slug}` : ''}${page.path}`;
      assert.equal(moduleUnderTest.getPreferredLocale('codevalanche_language=fr', pathname).tag, locale.tag, pathname);
    }
  }
});

function runtimeDocument(pathname, hrefs = []) {
  const origin = 'https://codevalanche.com';
  const anchors = hrefs.map(href => ({
    href: new URL(href, origin).href,
    hasAttribute: () => false,
    getAttribute: () => href,
  }));
  const root = {
    lang: 'en', dir: 'ltr',
    querySelectorAll: selector => selector === 'a[href]' ? anchors : [],
    removeAttribute() {},
  };
  return { documentElement: root, cookie: 'codevalanche_language=fr', location: { origin, pathname, protocol: 'https:' }, createTreeWalker: () => ({ nextNode: () => false }), anchors };
}

test('runtime link rewriting preserves directory identity, query/hash and account links', () => {
  const document = runtimeDocument('/ar/docs/', ['/features/multiple-accounts/index.html?from=docs#selection', '/agents?source=nav#codex', '#review', '/account/authorize/?next=/docs/#callback', 'https://example.com/agents/']);
  moduleUnderTest.localizeDocument(document, {}, LOCALES.find(locale => locale.tag === 'ar'));
  assert.equal(document.documentElement.dir, 'rtl');
  assert.equal(document.anchors[0].href, '/ar/features/multiple-accounts/?from=docs#selection');
  assert.equal(document.anchors[1].href, '/ar/agents/?source=nav#codex');
  assert.equal(document.anchors[2].href, 'https://codevalanche.com/#review');
  assert.equal(document.anchors[3].href, 'https://codevalanche.com/account/authorize/?next=/docs/#callback');
  assert.equal(document.anchors[4].href, 'https://example.com/agents/');
});

test('catalog request failure retains server-rendered Arabic page and saves its locale', async () => {
  const document = runtimeDocument('/ar/features/multiple-accounts/index.html');
  const requested = [];
  const state = await moduleUnderTest.initializeLocale(document, async url => {
    requested.push(url);
    throw new Error('Unavailable');
  });
  assert.deepEqual(requested, ['/locales/ar.json']);
  assert.equal(state.status, 'unavailable');
  assert.equal(state.locale.tag, 'ar');
  assert.equal(document.documentElement.lang, 'ar');
  assert.equal(document.documentElement.dir, 'rtl');
  assert.match(document.cookie, /^codevalanche_language=ar;.*; Secure$/);
});

test('locale catalogs use build metadata as their cache key and normal cache validation', async () => {
  for (const revision of ['0123456789abcdef', undefined]) {
    const document = runtimeDocument('/ar/docs/');
    document.documentElement.dataset = { assetRevision: revision };
    let request;
    await moduleUnderTest.initializeLocale(document, async (url, options) => {
      request = { url, cache: options.cache };
      return { ok: true, json: async () => ({}) };
    });
    assert.equal(request.url, `/locales/ar.json${revision ? `?v=${revision}` : ''}`);
    assert.equal(request.cache, 'default');
  }
});

test('locale runtime translates complete phrases and keeps interpolated values intact', () => {
  assert.equal(typeof moduleUnderTest?.translateText, 'function', 'safe translation helper exists');
  const catalog = {
    'Hello there.': 'Hola.',
    '{client} wants to access your Codevalanche account.': '{client} quiere acceder a tu cuenta de Codevalanche.',
  };
  assert.equal(moduleUnderTest.translateText('  Hello there.  ', catalog), '  Hola.  ');
  assert.equal(moduleUnderTest.translateText('{client} wants to access your Codevalanche account.', catalog, { client: 'Company OS' }), 'Company OS quiere acceder a tu cuenta de Codevalanche.');
  assert.equal(moduleUnderTest.translateText('Uncatalogued copy', catalog), 'Uncatalogued copy');
});
