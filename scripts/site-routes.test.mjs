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
