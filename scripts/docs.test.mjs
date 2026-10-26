import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { LOCALES, MARKETING_PAGES } from '../src/locales/manifest.js';
import { renderTranslatedHtml } from './localization.mjs';

export const topics = ['installation', 'first-start', 'claude-code', 'codex', 'first-task', 'approvals', 'stop-resume', 'files', 'git', 'terminal', 'browser', 'conversations', 'import', 'automations', 'settings', 'updates', 'uninstall', 'faq', 'troubleshooting'];
const root = new URL('../', import.meta.url);

test('every guide topic is registered and fully translated in all 17 languages', async () => {
  const titles = new Map(LOCALES.map(l => [l.tag, new Set()]));
  const descriptions = new Map(LOCALES.map(l => [l.tag, new Set()]));
  for (const slug of ['', ...topics]) {
    const route = `/docs/${slug ? `${slug}/` : ''}`;
    const page = MARKETING_PAGES.find(p => p.path === route);
    assert.ok(page, `Missing guide page: ${route}`);
    const source = await readFile(new URL(`src/${page.file}`, root), 'utf8');
    assert.match(source, /<ol\b/, `${route} needs numbered steps`);
    assert.match(source, /data-doc-contents/, `${route} needs contents`);
    assert.match(source, /rel="next"/, `${route} needs a next page`);
    assert.match(source, /(?:src="\/assets\/shots\/|<template data-doc-screenshot=)/, `${route} needs a real capture or inert slot`);
    for (const locale of LOCALES) {
      const catalog = JSON.parse(await readFile(new URL(`src/locales/${locale.slug || 'en'}.json`, root), 'utf8'));
      const html = locale.tag === 'en' ? source : renderTranslatedHtml(source, catalog, locale.tag);
      const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
      const desc = html.match(/name="description" content="([^"]+)"/)?.[1];
      assert.ok(title && !titles.get(locale.tag).has(title), `${locale.tag} duplicate/missing title ${route}`);
      assert.ok(desc && !descriptions.get(locale.tag).has(desc), `${locale.tag} duplicate/missing description ${route}`);
      titles.get(locale.tag).add(title); descriptions.get(locale.tag).add(desc);
    }
  }
});

const guide = await import('./docs.mjs').catch(() => null);
const { rewriteLocalizedLinks } = await import('./locale-export.mjs');
const { readdir } = await import('node:fs/promises');
async function sourceFixture() {
  const documents = new Map();
  const files = new Set((await readdir(new URL('src/', root), {recursive:true})).map(file=>`/${file}`));
  for (const locale of LOCALES) {
    const catalog=JSON.parse(await readFile(new URL(`src/locales/${locale.slug || 'en'}.json`,root),'utf8'));
    for (const page of MARKETING_PAGES) {
      const source=await readFile(new URL(`src/${page.file}`,root),'utf8');
      const html=page.path.startsWith('/docs/') && locale.tag!=='en' ? renderTranslatedHtml(source,catalog,locale.tag) : source;
      documents.set(`${locale.slug ? `/${locale.slug}`:''}${page.path}`,rewriteLocalizedLinks(html,locale.tag));
    }
  }
  return {documents,files};
}

test('guide validation rejects missing localized pages, dead links and fragments', async () => {
  assert.equal(typeof guide?.validateGuide,'function','guide link validator exists');
  const fixture=await sourceFixture();
  fixture.documents.set('/docs/', fixture.documents.get('/docs/').replace('</article>', '<a href="/account/">Account</a></article>'));
  assert.doesNotThrow(()=>guide.validateGuide(fixture));
  const missing=new Map(fixture.documents); missing.delete('/ro/docs/git/');
  assert.throws(()=>guide.validateGuide({...fixture,documents:missing}),/missing.*ro\/docs\/git/i);
  for (const href of ['/docs/nonexistent/', '/docs/files/#absent', '/assets/shots/missing.webp']) {
    const broken=new Map(fixture.documents);
    broken.set('/docs/',broken.get('/docs/').replace('</article>',`<a href="${href}">Broken</a></article>`));
    assert.throws(()=>guide.validateGuide({...fixture,documents:broken}),/dead link|missing fragment/i,href);
  }
});

test('search indexes contain only localized page content, never shared navigation or hidden slots', async () => {
  assert.equal(typeof guide?.guideSearchIndex,'function','build-time search index exists');
  const index=guide.guideSearchIndex(new Map([['/docs/example/', '<html><head><title>Example</title><meta name="description" content="Unique summary"></head><body><nav>Navigation noise</nav><main><article><ol><li>Searchable steps</li></ol><template>Capture pending</template></article></main></body></html>']]));
  assert.deepEqual(index,[{url:'/docs/example/',title:'Example',description:'Unique summary',text:'Searchable steps'}]);
});

const analyticsRoute = await import('../src/marketing-analytics.js').catch(()=>null);
test('guide routes and navigation targets share the registered docs analytics identity', async () => {
  assert.equal(typeof analyticsRoute?.marketingAnalyticsPageId,'function');
  const { PAGES } = await import('../src/analytics/core/registry.js');
  for (const locale of LOCALES) for (const slug of ['',...topics]) {
    const route=`${locale.slug?`/${locale.slug}`:''}/docs/${slug?`${slug}/`:''}`;
    for(const alias of [route,`${route}index.html`,route.slice(0,-1)]) {
      const id=analyticsRoute.marketingAnalyticsPageId(alias);
      assert.equal(id,'docs');
      assert.ok(PAGES.codevalanche.includes(id));
    }
  }
  assert.equal(analyticsRoute.marketingAnalyticsPageId('/ro/agents/'),'agents');
  assert.equal(analyticsRoute.marketingAnalyticsPageId('/account/authorize/'),undefined);
});
