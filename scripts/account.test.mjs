import { test } from 'node:test'
import assert from 'node:assert/strict'
import { safeError, identityLabels } from '../src/account/helpers.js'
import { readFileSync } from 'node:fs'
test('auth errors never expose server messages or supplied HTML', () => {
  assert.equal(safeError({message:'<img src=x onerror=alert(1)>',code:'unknown'}), 'Unable to complete this request. Please try again.')
  assert.equal(safeError({code:'invalid_credentials'}), 'Email or password is incorrect.')
})
test('methods show only actual identities and deduplicate providers', () => {
  assert.deepEqual(identityLabels([]), [])
  assert.deepEqual(identityLabels([{provider:'email'},{provider:'email'},{provider:'github'}]), ['Email and password','GitHub'])
})
test('account uses PKCE, no raw HTML rendering and hosted bundle', () => {
  const app = readFileSync(new URL('../src/account/app.js',import.meta.url),'utf8')
  assert.match(app,/flowType: 'pkce'/); assert.doesNotMatch(app,/innerHTML|insertAdjacentHTML/)
  assert.match(app,/confirmation: 'DELETE'/); assert.match(app,/getAuthorizationDetails/)
  const html = readFileSync(new URL('../src/account/index.html',import.meta.url),'utf8')
  assert.doesNotMatch(html, /https:\/\/.*\.js/)
})

test('Google callback preserves only validated consent context on same origin', async () => {
  const { authCallback } = await import('../src/account/helpers.js')
  assert.equal(authCallback('https://codevalanche.com/account/authorize/?authorization_id=abc-123_xyz&redirect_to=https://evil.test&code=secret&flow=recovery').href, 'https://codevalanche.com/account/?authorization_id=abc-123_xyz')
  for (const id of ['https://evil.test','../bad','<script>', 'x'.repeat(201)]) {
    assert.equal(authCallback('https://codevalanche.com/account/?authorization_id='+encodeURIComponent(id)).href, 'https://codevalanche.com/account/')
  }
})

test('new passwords need at least 12 characters; existing shorter passwords can still sign in', async () => {
  const { passwordProblem, MIN_PASSWORD_LENGTH } = await import('../src/account/helpers.js')
  assert.equal(MIN_PASSWORD_LENGTH, 12)
  for (const mode of ['signup', 'update']) {
    assert.equal(passwordProblem('x'.repeat(11), mode), 'Use at least 12 characters for your password.')
    assert.equal(passwordProblem('x'.repeat(12), mode), '')
  }
  assert.equal(passwordProblem('short', 'signin'), '')
  assert.equal(passwordProblem('', 'reset'), '')
  assert.equal(safeError({ code: 'weak_password' }), 'Choose a stronger password with at least 12 characters.')
  const html = readFileSync(new URL('../src/account/index.html', import.meta.url), 'utf8')
  assert.doesNotMatch(html, /id="password"[^>]*minlength="8"/, 'the sign-in field must not reject passwords the server accepts')
  const app = readFileSync(new URL('../src/account/app.js', import.meta.url), 'utf8')
  assert.match(app, /passwordProblem\(password, mode\)/)
  assert.match(app, /MIN_PASSWORD_LENGTH/)
})

test('Turnstile turns on only with a well-formed public site key', async () => {
  const { turnstileSiteKey, captchaModes } = await import('../src/account/helpers.js')
  assert.equal(turnstileSiteKey({}), '')
  assert.equal(turnstileSiteKey({ turnstileSiteKey: '' }), '')
  assert.equal(turnstileSiteKey({ turnstileSiteKey: '<script>' }), '')
  assert.equal(turnstileSiteKey({ turnstileSiteKey: '0x4AAAAAAAexampleSiteKey01' }), '0x4AAAAAAAexampleSiteKey01')
  assert.equal(turnstileSiteKey({ turnstileSiteKey: '1x00000000000000000000AA' }), '1x00000000000000000000AA')
  // Supabase Auth checks the token on sign-in, sign-up and reset once CAPTCHA is on.
  assert.deepEqual([...captchaModes].sort(), ['reset', 'signin', 'signup'])
  assert.equal(safeError({ code: 'captcha_failed' }), 'The security check did not pass. Please try again.')
  const app = readFileSync(new URL('../src/account/app.js', import.meta.url), 'utf8')
  for (const call of ['signInWithPassword', 'signUp', 'resetPasswordForEmail', 'resend']) assert.match(app, new RegExp(`${call}\\([^)]*captchaToken`), `${call} forwards the CAPTCHA token`)
  const config = readFileSync(new URL('../src/config.js', import.meta.url), 'utf8')
  assert.match(config, /turnstileSiteKey: ""/, 'the site key ships empty until Mihai creates it')
})
