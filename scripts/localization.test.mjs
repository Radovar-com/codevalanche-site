import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MARKETING_PAGES } from '../src/locales/manifest.js';
import { collectSiteStrings } from './translate-site.mjs';

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

test('source extraction includes every registered product page, shared partial and explicit account source once', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'codevalanche-route-strings-'));
  const write = async (relativePath, content) => {
    const output = path.join(root, 'src', relativePath);
    await mkdir(path.dirname(output), { recursive: true });
    await writeFile(output, content);
  };
  try {
    const files = new Set([...MARKETING_PAGES.map(page => page.file), 'agents/index.html', 'features/multiple-accounts/index.html', 'account.html', 'account/index.html', 'account/authorize/index.html', 'account/signed-in/index.html']);
    for (const file of files) await write(file, `<html><head><title>Source ${file}</title></head><body><!-- site-header --><p>Repeated shared text.</p><!-- site-footer --></body></html>`);
    await write('partials/header.html', '<header><nav>Shared header text.</nav></header>');
    await write('partials/footer.html', '<footer><div class="footer-bottom">Shared footer text.<details class="lang-picker"><summary>Language</summary><ul class="lang-grid"><li>English <em>this site</em></li></ul></details></div></footer>');
    await write('locales/runtime-strings.en.json', '["Runtime phrase.", "Repeated shared text."]');
    const strings = await collectSiteStrings(root);
    for (const file of files) assert.ok(strings.includes(`Source ${file}`), file);
    for (const phrase of ['Shared header text.', 'Shared footer text.', 'Runtime phrase.', 'Repeated shared text.']) assert.equal(strings.filter(value => value === phrase).length, 1, phrase);
    assert.equal(new Set(strings).size, strings.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
