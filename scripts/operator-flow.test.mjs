import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { operatorStep, accessSummary, OPERATOR_STEPS } from '../src/account/operatorFlow.js'

test('the connection card maps every state to one of the three steps', () => {
  assert.deepEqual(OPERATOR_STEPS, ['Sign in', 'Security code', 'Done'])
  assert.equal(operatorStep(), 1)
  assert.equal(operatorStep({ securityCode: true }), 2)
  assert.equal(operatorStep({ consent: true }), 3)
  assert.equal(operatorStep({ consent: true, securityCode: true }), 3)
})

test('requested access reads as plain words and never hides an unknown scope', () => {
  assert.deepEqual(accessSummary('openid email profile'), { sentence: '{client} will see your name and email address.', other: [] })
  assert.deepEqual(accessSummary('openid email'), { sentence: '{client} will see your email address.', other: [] })
  assert.deepEqual(accessSummary('profile'), { sentence: '{client} will see your name.', other: [] })
  assert.deepEqual(accessSummary('openid'), { sentence: '{client} will only confirm that it is you.', other: [] })
  assert.deepEqual(accessSummary('openid email email phone'), { sentence: '{client} will see your email address.', other: ['phone'] })
  assert.deepEqual(accessSummary(undefined), { sentence: '{client} will only confirm that it is you.', other: [] })
})

test('every plain access sentence and step label is in all site locales', async () => {
  const sentences = [...new Set(['openid email profile', 'openid email', 'profile', 'openid'].map(scope => accessSummary(scope).sentence))]
  const { LOCALES } = await import('../src/locales/manifest.js')
  for (const locale of LOCALES) {
    const catalog = JSON.parse(await readFile(`src/locales/${locale.slug || 'en'}.json`, 'utf8'))
    for (const key of [...sentences, ...OPERATOR_STEPS, 'It also asks for: {scope}', 'Start again']) assert.equal(typeof catalog[key], 'string', `${locale.tag}: ${key}`)
  }
})

test('both account pages carry one connection card: steps, inline failure, one primary consent action', async () => {
  for (const file of ['src/account/index.html', 'src/account/authorize/index.html']) {
    const html = await readFile(file, 'utf8')
    assert.match(html, /<ol class="op-steps" id="operator-steps" aria-label="Connection progress" hidden>/)
    assert.match(html, /<section class="op-failure" id="operator-failure" role="alert" hidden>[\s\S]*?id="operator-restart"/)
    const consent = html.match(/<section id="consent" hidden>[\s\S]*?<\/section>/)[0]
    assert.equal(consent.match(/cr-btn-primary/g).length, 1)
    assert.match(consent, /<button class="quiet" id="deny"/)
    assert.doesNotMatch(html, /native-mfa-kicker|Requested access/)
  }
})
