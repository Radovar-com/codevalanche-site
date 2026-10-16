import test from 'node:test';
import assert from 'node:assert/strict';

const moduleUnderTest = await import('../src/locales/runtime.js').catch(() => null);

test('locale runtime validates the saved preference against the supported manifest', () => {
  assert.equal(typeof moduleUnderTest?.getPreferredLocale, 'function', 'locale preference reader exists');
  assert.equal(moduleUnderTest.getPreferredLocale('theme=dark; codevalanche_language=pt-br').tag, 'pt-BR');
  assert.equal(moduleUnderTest.getPreferredLocale('codevalanche_language=../../account').tag, 'en');
  assert.equal(moduleUnderTest.getPreferredLocale('').tag, 'en');
  assert.equal(moduleUnderTest.getPreferredLocale('codevalanche_language=fr', '/it/privacy.html').tag, 'it');
  assert.equal(moduleUnderTest.getPreferredLocale('codevalanche_language=it', '/privacy.html').tag, 'en');
  assert.equal(moduleUnderTest.getPreferredLocale('codevalanche_language=it', '/account/').tag, 'it');
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
