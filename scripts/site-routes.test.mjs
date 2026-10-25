import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parse } from 'parse5';
import { LOCALES } from '../src/locales/manifest.js';
const routeModule = await import('../src/locales/manifest.js').catch(() => null);

test('locale manifest matches all 17 languages already listed in the footer', async () => {
  const html = await readFile(new URL('../src/partials/footer.html', import.meta.url), 'utf8');
  const document = parse(html);
  const find = (node, predicate) => {
    if (predicate(node)) return node;
    for (const child of node.childNodes ?? []) { const result = find(child, predicate); if (result) return result; }
    return null;
  };
  const text = node => node.nodeName === '#text' ? node.value ?? '' : (node.childNodes ?? []).map(text).join('');
  const list = find(document, node => node.tagName === 'ul' && node.attrs?.some(attribute => attribute.name === 'class' && attribute.value.split(/\s+/).includes('lang-grid')));
  const items = (list?.childNodes ?? []).filter(node => node.tagName === 'li');
  assert.equal(items.length, 17);
  assert.equal(LOCALES.length, 17);
  for (const item of items) {
    const code = find(item, node => node.tagName === 'em');
    const rawCode = text(code ?? { childNodes: [] }).trim();
    const locale = rawCode === 'this site' ? LOCALES[0] : LOCALES.find(entry => entry.slug === rawCode.toLowerCase());
    assert.ok(locale, `footer code ${rawCode} exists in locale manifest`);
    const label = item.childNodes.filter(node => node !== code && node.nodeName === '#text').map(node => node.value).join('').trim();
    assert.equal(label, locale.label);
  }
});

test('locale-prefixed marketing paths resolve to existing canonical page IDs', () => {
  assert.equal(typeof routeModule?.resolveMarketingRoute, 'function', 'site route resolver exists');
  const { resolveMarketingRoute } = routeModule;
  assert.deepEqual(resolveMarketingRoute('/it/'), { locale: 'it', pathname: '/', pageId: 'home' });
  assert.deepEqual(resolveMarketingRoute('/it/changelog.html'), { locale: 'it', pathname: '/changelog.html', pageId: 'changelog' });
  assert.deepEqual(resolveMarketingRoute('/zh-hant/privacy.html'), { locale: 'zh-Hant', pathname: '/privacy.html', pageId: 'privacy' });
  assert.deepEqual(resolveMarketingRoute('/terms.html'), { locale: 'en', pathname: '/terms.html', pageId: 'terms' });
});

test('unknown pages and account callbacks are not treated as localized marketing routes', () => {
  assert.equal(typeof routeModule?.resolveMarketingRoute, 'function', 'site route resolver exists');
  const { resolveMarketingRoute } = routeModule;
  assert.equal(resolveMarketingRoute('/it/not-a-page.html'), null);
  assert.equal(resolveMarketingRoute('/account/authorize/'), null);
  assert.equal(resolveMarketingRoute('/account/signed-in/'), null);
});

test('footer locale targets preserve the current route and English strips the locale prefix', () => {
  assert.equal(routeModule.localizedMarketingPath('/it/changelog.html', 'de'), '/de/changelog.html');
  assert.equal(routeModule.localizedMarketingPath('/it/privacy.html', 'en'), '/privacy.html');
  assert.equal(routeModule.localizedMarketingPath('/it/not-a-page.html', 'en'), '/');
  assert.equal(routeModule.localizedMarketingPath('/account/authorize/', 'it'), '/');
  assert.equal(routeModule.localizedMarketingPath('/account.html', 'it'), '/');
});

const directoryPages = [
  ['/how-it-works/', 'how_it_works'], ['/agents/', 'agents'],
  ['/features/multiple-accounts/', 'multiple_accounts'], ['/local-ai/', 'local_ai'],
  ['/docs/', 'docs'], ['/download/', 'download'], ['/download/verify/', 'download_verify'], ['/security/', 'security'],
];

test('directory routes and index aliases retain their canonical slash in every locale', () => {
  for (const [pathname, pageId] of directoryPages) {
    for (const locale of LOCALES) {
      const prefix = locale.slug ? `/${locale.slug}` : '';
      for (const alias of [pathname, pathname.slice(0, -1), `${pathname}index.html`]) {
        assert.deepEqual(routeModule.resolveMarketingRoute(`${prefix}${alias}`), { locale: locale.tag, pathname, pageId }, `${prefix}${alias}`);
        assert.equal(routeModule.localizedMarketingPath(`${prefix}${alias}`, 'ar'), `/ar${pathname}`);
        assert.equal(routeModule.localizedMarketingPath(`${prefix}${alias}`, 'en'), pathname);
      }
    }
  }
});

test('page registry lists exactly twelve unique canonical public routes and source files', () => {
  const pages = routeModule.MARKETING_PAGES;
  assert.equal(pages.length, 12);
  for (const key of ['path', 'file', 'pageId']) assert.equal(new Set(pages.map(page => page[key])).size, pages.length, `unique ${key}`);
  for (const [pathname, pageId] of directoryPages) {
    assert.deepEqual(pages.find(page => page.pageId === pageId), { path: pathname, file: `${pathname.slice(1)}index.html`, pageId, priority: '0.8' });
  }
});

test('home aliases, legacy html routes and account boundaries retain their prior meaning', () => {
  for (const alias of ['/', '/index.html', '/it', '/it/', '/it/index.html']) {
    assert.equal(routeModule.resolveMarketingRoute(alias)?.pathname, '/');
  }
  assert.deepEqual(routeModule.resolveMarketingRoute('/ar/account.html'), { locale: 'ar', pathname: '/account.html', pageId: 'account_entry_legacy' });
  for (const pathname of ['/account/', '/account/index.html', '/account/authorize/', '/it/account/authorize/', '/ar/account/signed-in/index.html', '/unknown/', '/it/agents/extra/', '/it/features//multiple-accounts/', '/it/agents/index.html/extra']) {
    assert.equal(routeModule.resolveMarketingRoute(pathname), null, pathname);
  }
});
