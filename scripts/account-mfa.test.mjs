import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { MFA_STRINGS, mfaLocaleFor, mfaText, totpCodeFrom } from '../src/account/mfa-i18n.js'
import { EMAIL_LOCALES } from '../src/account/helpers.js'
import {createAccountSecurity} from '../src/account/security.js'

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
  assert.ok(render.indexOf('needsMfa()') >= 0 && render.indexOf('needsMfa()') < render.indexOf('showConsent('), 'challenge before the desktop consent')
  assert.ok(render.indexOf('needsMfa()') < render.indexOf("api('get-account')"), 'challenge before the account')
  assert.ok(render.indexOf('needsMfa()') < render.indexOf("setMode('update')"), 'challenge before choosing a new password')
  assert.match(app, /challengeAndVerify\(\{ factorId: factor\.id, code \}\)/)
  assert.match(app, /api\('mfa-recovery-redeem'/)
  assert.match(app, /api\('mfa-recovery-codes'\)/)
  assert.match(app, /api\('mfa-disable'/)
  assert.doesNotMatch(app, /innerHTML|insertAdjacentHTML/)
})

// TOTP state machine used by the v2 account page (security.js).
test('TOTP enrollment is pending until provider verifies a challenge',async()=>{const calls=[];const client={auth:{mfa:{enroll:async()=>({data:{id:'factor',totp:{qr_code:'qr',secret:'secret'}},error:null}),challenge:async o=>{calls.push(o);return {data:{id:'challenge'},error:null}},verify:async o=>{calls.push(o);return {data:{session:'provider'},error:null}},unenroll:async()=>({error:null})}}};const s=createAccountSecurity(client);await s.enroll();assert.equal(s.state().verified,false);await s.verify('123456');assert.equal(s.state().verified,true);assert.deepEqual(calls,[{factorId:'factor'},{factorId:'factor',challengeId:'challenge',code:'123456'}])});
test('cancel removes only unverified pending enrollment and clears secret',async()=>{let factor;const s=createAccountSecurity({auth:{mfa:{enroll:async()=>({data:{id:'pending',totp:{secret:'secret'}},error:null}),unenroll:async o=>{factor=o.factorId;return {error:null}}}}});await s.enroll();await s.cancel();assert.equal(factor,'pending');assert.equal(s.state().factor,null)});
test('recovery cannot enroll or unenroll a factor',async()=>{let calls=0;const s=createAccountSecurity({auth:{mfa:{enroll:async()=>{calls++},unenroll:async()=>{calls++}}}},{isRecovery:()=>true});await assert.rejects(()=>s.enroll(),/recovery_restricted/);await assert.rejects(()=>s.remove('factor'),/recovery_restricted/);assert.equal(calls,0)});
test('wrong code leaves factor unverified and offers retry',async()=>{const s=createAccountSecurity({auth:{mfa:{enroll:async()=>({data:{id:'pending'},error:null}),challenge:async()=>({data:{id:'c'},error:null}),verify:async()=>({error:{code:'mfa_verification_failed'}})}}});await s.enroll();await assert.rejects(()=>s.verify('000000'));assert.equal(s.state().verified,false)});
test('first enrollment verification tells UI a distinct fresh step-up is still required',async()=>{const s=createAccountSecurity({auth:{mfa:{enroll:async()=>({data:{id:'pending'},error:null}),challenge:async()=>({data:{id:'c'},error:null}),verify:async()=>({data:{},error:null})}}});await s.enroll();await s.verify('123456');assert.equal(s.state().requiresFreshVerification,true);await s.verify('234567','pending');assert.equal(s.state().requiresFreshVerification,false)});

test('the published config retains v1 and its exact legacy actions alongside scoped operator consent', async () => {
  const { accountServerVersion, V1_ACCOUNT_ACTIONS } = await import('../src/account/helpers.js')
  const config = read('../src/config.js')
  assert.match(config, /accountServer:\s*"v1"/)
  assert.match(config, /operatorOAuth:\s*true/)
  assert.match(config, /turnstileSiteKey:\s*""/)
  assert.doesNotMatch(config, /captchaSiteKey|measurementId|CODEVALANCHE_DOWNLOADS/)
  assert.equal(accountServerVersion({}), 'v1'); assert.equal(accountServerVersion({ accountServer: 'v2' }), 'v2'); assert.equal(accountServerVersion({ accountServer: 'v3' }), 'v1')
  // Exactly the user actions the live account function answers (its switch on main).
  assert.deepEqual([...V1_ACCOUNT_ACTIONS].sort(), ['cancel-deletion', 'consent', 'event', 'feedback', 'get-account', 'request-deletion', 'revoke-session', 'sign-out-current', 'sign-out-others', 'update-profile'])
  const app = read('../src/account/app.js')
  // account-sdk-lifecycle.test.mjs exercises the real guard before and after
  // classification: only details and classified approve are exceptions to v1.
  for (const id of ['analytics-section', 'activity-section']) assert.match(app, new RegExp(`'${id}'`), `${id} is gated on v2`)
})
