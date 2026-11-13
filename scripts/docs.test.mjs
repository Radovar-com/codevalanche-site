import assert from 'node:assert/strict';
import test from 'node:test';
import { hubIsCurrent } from './docs-hub.mjs';
import { DOCS_PAGES, checkLinks, docsSearchIndex, renderDocsPage } from './docs-render.mjs';

test('the committed docs hub matches the docs navigation', async () => {
  assert.equal(await hubIsCurrent(), true, 'run node scripts/docs-hub.mjs');
});

test('every docs page links only to docs pages that exist', () => {
  const known = new Set(DOCS_PAGES.map(page => page.path));
  for (const page of DOCS_PAGES) checkLinks(page, known);
});

test('every docs page has its own title, description, canonical and headings', () => {
  const titles = new Set();
  for (const page of DOCS_PAGES) {
    const html = renderDocsPage(page);
    const title = html.match(/<title>(.*?)<\/title>/)[1];
    assert.ok(!titles.has(title), `duplicate title ${title}`);
    titles.add(title);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://codevalanche.com${page.path}">`));
    assert.ok(page.description.length >= 70 && page.description.length <= 170, `${page.slug} description length`);
    assert.match(page.body, /<h2 id="/, `${page.slug} has no sections`);
    assert.equal((html.match(/<h1>/g) ?? []).length, 1, `${page.slug} must have one h1`);
  }
});

test('docs never claim what the site rules forbid', () => {
  for (const page of DOCS_PAGES) {
    const text = `${page.title} ${page.description} ${page.body}`;
    assert.doesNotMatch(text, /open[- ]source/i, `${page.slug} mentions open source`);
    assert.doesNotMatch(text, /\bfor free\b|\bis free\b|\bfree (?:plan|version|tier|trial|download)|\$\d|€\d|\bprice\b|\bpricing\b/i, `${page.slug} mentions price`);
  }
});

test('the search index covers every page', () => {
  assert.equal(docsSearchIndex().length, DOCS_PAGES.length);
});
