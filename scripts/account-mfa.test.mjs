import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MFA_STRINGS, mfaLocaleFor, mfaText, totpCodeFrom } from '../src/account/mfa-i18n.js'
import { EMAIL_LOCALES } from '../src/account/helpers.js'

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('two-step verification texts exist in every account language, with the same keys and placeholders', () => {
  assert.deepEqual(Object.keys(MFA_STRINGS).sort(), [...EMAIL_LOCALES].sort())
  const keys = Object.keys(MFA_STRINGS.en).sort()
  for (const locale of Object.keys(MFA_STRINGS)) {
    assert.deepEqual(Object.keys(MFA_STRINGS[locale]).sort(), keys, locale)
    for (const key of keys) {
      assert.ok(MFA_STRINGS[locale][key].trim(), `${locale}.${key} is filled`)
      assert.deepEqual(MFA_STRINGS[locale][key].match(/\{\w+\}/g) || [], MFA_STRINGS.en[key].match(/\{\w+\}/g) || [], `${locale}.${key} placeholders`)
    }
  }
  for (const key of keys.filter(k => !['secretLabel'].includes(k))) assert.notEqual(MFA_STRINGS.ro[key], MFA_STRINGS.en[key], `ro.${key} is translated`)
})

test('the page language follows the browser, falling back to English', () => {
  assert.equal(mfaLocaleFor(['ro-RO', 'en']), 'ro')
  assert.equal(mfaLocaleFor(['de-DE']), 'en')
  assert.equal(mfaLocaleFor([]), 'en')
  assert.equal(mfaText('ro', 'stateOn', { n: 7 }), 'Pornită. Coduri de recuperare rămase: 7.')
  assert.equal(mfaText('xx', 'verify'), 'Verify')
})

test('authenticator codes: six digits, spaces ignored', () => {
  assert.equal(totpCodeFrom(' 123 456 '), '123456')
  for (const bad of ['12345', '1234567', 'abcdef', '', null, undefined]) assert.equal(totpCodeFrom(bad), '')
})

test('both account entry pages carry the same two-step markup, and every label has a text', () => {
  const index = read('../src/account/index.html'), authorize = read('../src/account/authorize/index.html')
  assert.equal(authorize, index, 'the desktop consent page needs the same challenge as the account page')
  const keys = [...index.matchAll(/data-mfa="(\w+)"/g)].map(m => m[1])
  assert.ok(keys.length >= 15, `found ${keys.length} translated elements`)
  for (const key of keys) assert.ok(Object.hasOwn(MFA_STRINGS.en, key), `${key} has a text`)
  for (const id of ['mfa-challenge', 'mfa-challenge-form', 'mfa-recovery-form', 'mfa-section', 'mfa-enroll', 'mfa-codes-panel']) assert.match(index, new RegExp(`id="${id}"`))
})

test('the account page challenges before the account, consent and password change, and never renders HTML', () => {
  const app = read('../src/account/app.js')
  const render = app.slice(app.indexOf('async function render('))
  assert.ok(render.indexOf('needsMfa()') < render.indexOf('showConsent()'), 'challenge before the desktop consent')
  assert.ok(render.indexOf('needsMfa()') < render.indexOf("setMode('update')"), 'challenge before choosing a new password')
  assert.match(app, /challengeAndVerify\(\{ factorId: factor\.id, code \}\)/)
  assert.match(app, /api\('mfa-recovery-redeem'/)
  assert.match(app, /api\('mfa-recovery-codes'\)/)
  assert.match(app, /api\('mfa-disable'/)
  assert.doesNotMatch(app, /innerHTML|insertAdjacentHTML/)
})
