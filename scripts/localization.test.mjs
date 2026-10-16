import test from 'node:test';
import assert from 'node:assert/strict';

const moduleUnderTest = await import('./localization.mjs').catch(() => null);
const fixture = '<!doctype html><html lang="en"><head><title>About</title><meta name="description" content="A clear description."></head><body><a href="/terms.html" aria-label="Open menu"> Hello <strong>world</strong> </a><img src="/mark.svg" alt="Company mark"><input placeholder="Email"><code>task/session-refresh</code><script>const message = "Do not translate code";</script></body></html>';

test('localization extracts visible text and approved translated attributes only', () => {
  assert.equal(typeof moduleUnderTest?.extractTranslationUnits, 'function', 'HTML string extractor exists');
  assert.deepEqual(moduleUnderTest.extractTranslationUnits(fixture), [
    'About', 'A clear description.', 'Open menu', 'Hello', 'world', 'Company mark', 'Email',
  ]);
});

test('localization renders complete catalogs while preserving URLs, code and scripts', () => {
  assert.equal(typeof moduleUnderTest?.renderTranslatedHtml, 'function', 'HTML translation renderer exists');
  const catalog = {
    About: 'Acerca de',
    'A clear description.': 'Una descripción clara.',
    'Open menu': 'Abrir menú',
    Hello: 'Hola',
    world: 'mundo',
    'Company mark': 'Marca de la empresa',
    Email: 'Correo electrónico',
  };
  const html = moduleUnderTest.renderTranslatedHtml(fixture, catalog, 'es');
  assert.match(html, /<title>Acerca de<\/title>/);
  assert.match(html, /content="Una descripción clara\."/);
  assert.match(html, /href="\/terms\.html" aria-label="Abrir menú"/);
  assert.match(html, /alt="Marca de la empresa"/);
  assert.match(html, /placeholder="Correo electrónico"/);
  assert.match(html, /<code>task\/session-refresh<\/code>/);
  assert.match(html, /const message = "Do not translate code"/);
  assert.match(html, /<html lang="es"/);
});

test('localization refuses an incomplete target catalog instead of falling back to English', () => {
  assert.equal(typeof moduleUnderTest?.renderTranslatedHtml, 'function', 'HTML translation renderer exists');
  assert.throws(() => moduleUnderTest.renderTranslatedHtml(fixture, { About: 'Acerca de' }, 'es'), /incomplete translation catalog.*world/i);
});
