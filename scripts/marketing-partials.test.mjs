import test from 'node:test';
import assert from 'node:assert/strict';

const moduleUnderTest = await import('./marketing-partials.mjs').catch(() => null);
const partial = '<header><a class="brand" href="/">Brand</a><nav><a href="/#product">Product</a><a href="/agents/" aria-current="page">Agents</a><a href="/features/multiple-accounts/index.html">Accounts</a><a href="/account/">Sign in</a></nav><div class="mobile-nav-panel"><a href="/features/multiple-accounts/">Accounts</a><a href="/#review">Review</a></div></header>';

test('partial injection marks current nested directory aliases in desktop and mobile navigation', () => {
  assert.equal(typeof moduleUnderTest?.prepareMarketingPartial, 'function');
  const html = moduleUnderTest.prepareMarketingPartial(partial, '/features/multiple-accounts/');
  assert.match(html, /href="\/features\/multiple-accounts\/index.html" aria-current="page"/);
  assert.match(html, /href="\/features\/multiple-accounts\/" aria-current="page"/);
  assert.match(html, /href="\/agents\/">Agents/);
  assert.match(html, /href="\/#product">Product/);
  assert.match(html, /href="\/account\/">Sign in/);
  assert.equal((html.match(/aria-current="page"/g) ?? []).length, 2);
});

test('homepage partial injection preserves in-page fragment links without marking them as page navigation', () => {
  assert.equal(typeof moduleUnderTest?.prepareMarketingPartial, 'function');
  const html = moduleUnderTest.prepareMarketingPartial(partial, '/');
  assert.match(html, /href="#product"/);
  assert.match(html, /href="#review"/);
  assert.doesNotMatch(html, /href="#[^"]+" aria-current/);
});
