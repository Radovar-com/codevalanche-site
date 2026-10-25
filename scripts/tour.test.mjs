import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { parse } from 'parse5';
import { LOCALES, MARKETING_PAGES, resolveMarketingRoute, localizedMarketingPath } from '../src/locales/manifest.js';
import { extractTranslationUnits } from './localization.mjs';
import { PAGES } from '../src/analytics/core/registry.js';
import { PAGE_REGISTRY } from '../supabase/functions/_shared/websiteAnalyticsContract.ts';
import { PAGE_SECTION_SCOPE } from '../supabase/functions/_shared/metricDefinitions.ts';
const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const attr = (node, key) => node.attrs?.find(a => a.name === key)?.value;
const find = (node, predicate) => [...(predicate(node) ? [node] : []), ...(node.childNodes ?? []).flatMap(child => find(child, predicate))];

test('tour is a localized public route with canonical aliases and analytics scope', () => {
  assert.ok(MARKETING_PAGES.some(page => page.path === '/tour/' && page.file === 'tour/index.html'));
  for (const locale of LOCALES) for (const alias of ['/tour', '/tour/', '/tour/index.html']) {
    const prefix = locale.slug ? `/${locale.slug}` : '';
    assert.deepEqual(resolveMarketingRoute(prefix + alias), { locale: locale.tag, pathname: '/tour/', pageId: 'tour' });
    assert.equal(localizedMarketingPath(prefix + alias, 'ro'), '/ro/tour/');
  }
  assert.ok(PAGES.codevalanche.includes('tour'));
  assert.ok(PAGE_REGISTRY.codevalanche.includes('tour'));
  assert.deepEqual(PAGE_SECTION_SCOPE.codevalanche.tour, ['hero', 'workflow', 'download', 'footer']);
});

test('six readable tour steps use only existing responsive captures and one final download CTA', async () => {
  const html = await read('src/tour/index.html');
  const document = parse(html);
  const panels = find(document, node => attr(node, 'data-tour-panel') !== undefined);
  assert.equal(panels.length, 6);
  for (const panel of panels) {
    assert.equal(attr(panel, 'hidden'), undefined, 'no-JS visitors see every step');
    assert.equal(find(panel, node => node.tagName === 'h2').length, 1);
    assert.equal(find(panel, node => node.tagName === 'p').length, 1);
    const images = find(panel, node => node.tagName === 'img');
    assert.equal(images.length, 1);
    for (const image of images) {
      assert.ok(attr(image, 'width') && attr(image, 'height') && attr(image, 'alt'));
      assert.match(attr(image, 'src'), /^\/assets\/shots\/[\w-]+\.webp$/);
    }
    const sources = find(panel, node => attr(node, 'srcset'));
    if (attr(panel, 'id') === 'tour-brief') {
      assert.equal(attr(images[0], 'src'), '/assets/shots/task-brief.webp', 'the written message is preserved; the existing crop omits it');
      assert.equal(sources.length, 0);
      continue;
    }
    assert.ok(sources.length > 0);
    for (const source of sources) {
      assert.match(attr(source, 'srcset'), /-640\.webp 640w/);
      assert.match(attr(source, 'srcset'), /-960\.webp 960w/);
      for (const candidate of attr(source, 'srcset').split(',')) await access(new URL(`../src${candidate.trim().split(' ')[0]}`, import.meta.url));
    }
  }
  const main = find(document, node => node.tagName === 'main')[0];
  const download = find(main, node => node.tagName === 'a' && attr(node, 'href') === '/download/');
  assert.equal(download.length, 1);
  assert.equal(find(main, node => ['video', 'iframe'].includes(node.tagName)).length, 0);
});

test('tour copy and controls have real translations in every catalog', async () => {
  const units = extractTranslationUnits(await read('src/tour/index.html'));
  const source = JSON.parse(await read('src/locales/en.json'));
  for (const locale of LOCALES) {
    const catalog = JSON.parse(await read(`src/locales/${locale.slug || 'en'}.json`));
    for (const unit of units) {
      assert.ok(source[unit], `source: ${unit}`);
      assert.ok(catalog[unit]?.trim(), `${locale.tag}: ${unit}`);
    }
    if (locale.tag !== 'en') for (const unit of ['See the app in action', 'Keep the project in view', 'Previous step', 'Next step']) {
      assert.notEqual(catalog[unit], unit, `${locale.tag} does not fall back to English`);
    }
  }
});

test('desktop menu, phone menu and discreet homepage link lead to the tour', async () => {
  const header = parse(await read('src/partials/header.html'));
  assert.equal(find(header, node => node.tagName === 'a' && attr(node, 'href') === '/tour/').length, 2);
  const home = parse(await read('src/index.html'));
  assert.equal(find(home, node => node.tagName === 'a' && attr(node, 'href') === '/tour/').length, 1);
  assert.equal(find(home, node => node.tagName === 'script' && attr(node, 'src')?.startsWith('/tour/')).length, 0, 'tour script stays off the homepage');
});
