// Browser check of two-step verification on the built account page (dist/),
// with Supabase Auth and the account function faked by Playwright routes:
// nothing reaches a real project. Run: node scripts/build.mjs && node scripts/account-mfa-browser-test.mjs
// The full feature (recovery codes, turning it off) needs config.accountServer "v2";
// the served config.js is switched per page. Step 8 checks the "v1" page (current
// server): the sign-in challenge works, everything needing the v2 server is hidden.
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import { build } from 'esbuild'

// Compile the current account source in memory; never mutate the shared dist.
const accountBundle = (await build({ entryPoints: ['src/account/app.js'], bundle: true, write: false, format: 'esm', target: ['es2022'] })).outputFiles[0].text

const server = createServer(async (req, res) => { try { let name = new URL(req.url, 'http://localhost').pathname; if (name.endsWith('/')) name += 'index.html'; let data = name === '/account/app.js' ? accountBundle : await readFile(path.join(process.cwd(), 'dist', name)); if (name === '/config.js') { data = String(data).replace(/accountServer:\s*["']v1["']/, `accountServer: "${accountServer}"`); if (!data.includes(`accountServer: "${accountServer}"`)) throw new Error('config.js has no accountServer') } res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : 'text/html'); res.end(data) } catch { res.statusCode = 404; res.end() } }).listen(0, '127.0.0.1')
await new Promise(r => server.once('listening', r))
let accountServer = 'v2'
const origin = `http://127.0.0.1:${server.address().port}`
const factorId = '55555555-5555-4555-8555-555555555555'
const pendingFactorId = '66666666-6666-4666-8666-666666666666'
const verifiedFactor = { id: factorId, factor_type: 'totp', status: 'verified', friendly_name: 'Phone', created_at: '2026-10-16T00:00:00Z', updated_at: '2026-10-16T00:00:00Z' }
const jwt = (aal) => ['e30', Buffer.from(JSON.stringify({ sub: '11111111-1111-4111-8111-111111111111', aal, amr: [{ method: 'password', timestamp: 1 }], exp: Math.floor(Date.now() / 1000) + 3600, session_id: '22222222-2222-4222-8222-222222222222' })).toString('base64url'), 'sig'].join('.')
const state = { factors: [verifiedFactor], aal: 'aal1', remaining: 8, calls: [], needsEnrollmentStepup: false }
const user = () => ({ id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'test@example.test', email_confirmed_at: new Date().toISOString(), user_metadata: { display_name: 'Test' }, app_metadata: { provider: 'email' }, identities: [{ provider: 'email' }], factors: state.factors, created_at: new Date().toISOString() })
const session = () => ({ access_token: jwt(state.aal), refresh_token: 'refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: user() })
const RECOVERY = 'k4m9x-7qp2a'

async function wire(page) {
  await page.route('https://hvevaxsfeyiikjhcsafi.supabase.co/**', async route => {
    const url = new URL(route.request().url()), method = route.request().method()
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: {'x-supabase-api-version':'2024-01-01'}, body: JSON.stringify(body) })
    if (url.pathname.endsWith('/auth/v1/settings')) return reply({ external: { google: false } })
    if (url.pathname.endsWith('/auth/v1/token')) { if (url.searchParams.get('grant_type') === 'password') state.aal = 'aal1'; return reply(session()) }
    if (url.pathname.endsWith('/auth/v1/user')) return reply(user())
    if (url.pathname.endsWith('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' })
    let m
    if (url.pathname.endsWith('/auth/v1/factors') && method === 'POST') { state.needsEnrollmentStepup = true; state.factors = [...state.factors, { id: pendingFactorId, factor_type: 'totp', status: 'unverified', friendly_name: 'x' }]; return reply({ id: pendingFactorId, type: 'totp', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } }) }
    if ((m = url.pathname.match(/\/auth\/v1\/factors\/([^/]+)\/challenge$/))) return reply({ id: 'challenge-1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 })
    if ((m = url.pathname.match(/\/auth\/v1\/factors\/([^/]+)\/verify$/))) {
      const { code } = route.request().postDataJSON()
      if (!['123456', '234567'].includes(code)) return reply({ code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' }, 422)
      if (code === '234567' && state.factors.some(f => f.id === m[1] && f.status === 'verified')) state.needsEnrollmentStepup = false
      state.factors = state.factors.map(f => f.id === m[1] ? { ...f, status: 'verified' } : f); state.aal = 'aal2'
      return reply(session())
    }
    if ((m = url.pathname.match(/\/auth\/v1\/factors\/([^/]+)$/)) && method === 'DELETE') { state.factors = state.factors.filter(f => f.id !== m[1]); return reply({ id: m[1] }) }
    if (url.pathname.includes('/auth/v1/oauth/authorizations/')) return reply({ authorization_id: 'test-consent-123', client: { name: 'Codevalanche Desktop' }, scope: 'openid email', redirect_uri: 'http://127.0.0.1/cb', user: user() })
    if (url.pathname.endsWith('/functions/v1/codevalanche-account')) {
      const body = route.request().postDataJSON(); state.calls.push(body.action)
      if (body.action === 'operator.oauth.details') return reply({ apiVersion: 2, ok: true, requestId: body.requestId, data: { operator: false } })
      const enabled = state.factors.some(f => f.status === 'verified')
      if (enabled && state.aal !== 'aal2' && !['mfa-recovery-redeem', 'sign-out-current'].includes(body.action)) return reply({ error: 'MFA required', mfaRequired: true }, 401)
      if (body.action === 'get-account') return reply({ user: { displayName: 'Test', bio: '' }, sessions: [{ current: true, createdAt: new Date().toISOString() }], deletion: null, mfa: { enabled, factors: state.factors.filter(f => f.status === 'verified').map(f => ({ id: f.id })), recoveryCodesRemaining: enabled ? state.remaining : 0 } })
      if (body.action === 'mfa-recovery-redeem') { if (body.code.replace(/[\s-]/g, '').toLowerCase() !== RECOVERY.replace('-', '')) return reply({ error: 'Invalid recovery code' }, 400); state.factors = []; return reply({ ok: true, mfa: { enabled: false } }) }
      if (body.action === 'mfa-recovery-codes') { if (state.needsEnrollmentStepup) return reply({ error: 'reauthentication_required', code: 'reauthentication_required' }, 401); state.remaining = 10; return reply({ codes: Array.from({ length: 10 }, (_, i) => `aaaa${i}-bbbbb`) }) }
      if (body.action === 'mfa-disable') { state.factors = []; return reply({ ok: true }) }
      return reply({ ok: true })
    }
    return reply({})
  })
}

const browser = await chromium.launch({ headless: true })
const errors = []
try {
  const page = await browser.newPage({ locale: 'en-US' }); page.on('pageerror', e => errors.push(e.message)); await wire(page)
  const signIn = async () => {
    await page.getByLabel('Email', { exact: true }).fill('test@example.test'); await page.getByLabel('Password', { exact: true }).fill('test-password')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  }
  // 1. Sign-in with an authenticator: the challenge comes first, the account after the code.
  await page.goto(`${origin}/account/`); await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor(); await signIn()
  await page.getByRole('heading', { name: 'Two-step verification', exact: true }).waitFor()
  assert.equal(await page.locator('#profile').isHidden(), true, 'no account before the second step')
  await page.locator('#mfa-challenge-code').fill('12'); await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await page.locator('#status[data-error="true"]', { hasText: 'Enter the 6-digit code from your authenticator app.' }).waitFor()
  await page.locator('#mfa-challenge-code').fill('654321'); await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await page.getByText('That code did not work. Check the time on your phone and try again.', { exact: true }).waitFor()
  await page.locator('#mfa-challenge-code').fill('123 456'); await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await page.getByRole('heading', { name: 'Your account', exact: true }).waitFor()
  await page.getByText('On. Recovery codes left: 8.', { exact: true }).waitFor()
  // 2. New recovery codes are shown once.
  await page.getByRole('button', { name: 'New recovery codes', exact: true }).click()
  await page.getByText('aaaa0-bbbbb', { exact: true }).waitFor(); assert.equal(await page.locator('#mfa-codes li').count(), 10)
  await page.getByText('On. Recovery codes left: 10.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'I saved my recovery codes', exact: true }).click(); await page.locator('#mfa-codes-panel').waitFor({ state: 'hidden' })
  assert.equal(await page.locator('#mfa-codes li').count(), 0, 'codes leave the page')
  await page.setViewportSize({ width: 390, height: 844 }); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); await page.setViewportSize({ width: 1280, height: 900 })
  // (#logout: the account page also has a Sign out button on its unavailable/suspended panel.)
  // 3. Lost authenticator: a recovery code from a fresh sign-in turns it off.
  await page.locator('#logout').click(); await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
  state.aal = 'aal1'; await signIn(); await page.getByRole('heading', { name: 'Two-step verification', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Use a recovery code instead' }).click()
  await page.getByLabel('Recovery code').fill('wrong-code1'); await page.getByRole('button', { name: 'Use recovery code', exact: true }).click()
  await page.getByText('That recovery code is not valid or was already used.', { exact: true }).waitFor()
  await page.getByLabel('Recovery code').fill(' K4M9X 7QP2A '); await page.getByRole('button', { name: 'Use recovery code', exact: true }).click()
  await page.getByRole('heading', { name: 'Your account', exact: true }).waitFor()
  await page.getByText('Off. Add an authenticator app for a second step at sign-in.', { exact: true }).waitFor()
  // 4. The enrollment credential stamp is newer than its whole-second AMR.
  // A distinct explicit verification is required before recovery-code issuance.
  await page.getByRole('button', { name: 'Turn on two-step verification' }).click()
  await page.getByText('JBSWY3DPEHPK3PXP', { exact: true }).waitFor(); assert.match(await page.locator('#mfa-qr').getAttribute('src'), /^data:image\/svg\+xml/)
  const callsBeforeEnrollment = state.calls.filter(action => action === 'mfa-recovery-codes').length
  await page.locator('#mfa-enroll-code').fill('123456'); await page.getByRole('button', { name: 'Confirm and turn on' }).click()
  await page.getByText('Authenticator verified and added. Verify again with a new code before sensitive access.', { exact: true }).waitFor({timeout:5000})
  assert.equal(state.calls.filter(action => action === 'mfa-recovery-codes').length, callsBeforeEnrollment, 'enrollment alone must not request backup codes')
  await page.locator('#authenticator-verify').waitFor({state:'visible'})
  assert.equal(await page.locator('#mfa-factor-id').inputValue(), pendingFactorId)
  await page.locator('#mfa-code').fill('654321'); await page.locator('#mfa-form button[type="submit"]').click()
  await page.locator('#status[data-error="true"]').waitFor({timeout:5000})
  assert.equal(await page.locator('#authenticator-verify').isVisible(),true,'failed verification keeps its retry form available')
  assert.equal(state.calls.filter(action => action === 'mfa-recovery-codes').length,callsBeforeEnrollment)
  await page.locator('#mfa-code').fill('123456'); await page.locator('#mfa-form button[type="submit"]').click()
  await page.getByText('Authenticator verified and added. Verify again with a new code before sensitive access.', {exact:true}).waitFor({timeout:5000})
  assert.equal(await page.locator('#mfa-codes-panel').isHidden(),true,'server credential-stamp refusal never becomes backup success')
  assert.equal(await page.locator('#authenticator-verify').isVisible(),true,'same-stamp verification remains retryable')
  await page.locator('#mfa-code').fill('234567'); await page.locator('#mfa-form button[type="submit"]').click()
  await page.getByText('aaaa9-bbbbb', { exact: true }).waitFor({timeout:5000}); await page.getByText('Two-step verification is on.', { exact: true }).waitFor()
  await page.getByText('On. Recovery codes left: 10.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'I saved my recovery codes', exact: true }).click()
  // 5. Turning it off.
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Turn off two-step verification' }).click()
  await page.getByText('Two-step verification is off.', { exact: true }).waitFor()
  // 6. Desktop consent waits for the second step.
  state.factors = [verifiedFactor]; state.aal = 'aal1'
  await page.locator('#logout').click(); await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
  await page.goto(`${origin}/account/authorize/?authorization_id=test-consent-123`); await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor(); await signIn()
  await page.getByRole('heading', { name: 'Two-step verification', exact: true }).waitFor()
  assert.equal(await page.locator('#consent').isHidden(), true, 'no consent before the second step')
  await page.locator('#mfa-challenge-code').fill('123456'); await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await page.getByText('Codevalanche Desktop wants to access your Codevalanche account.', { exact: true }).waitFor()
  await page.close()
  // 7. Romanian page (the site language cookie): the second step speaks Romanian.
  state.factors = [verifiedFactor]; state.aal = 'aal1'
  const roContext = await browser.newContext({ locale: 'ro-RO' })
  await roContext.addCookies([{ name: 'codevalanche_language', value: 'ro', url: origin }])
  const ro = await roContext.newPage(); ro.on('pageerror', e => errors.push(e.message)); await wire(ro)
  await ro.goto(`${origin}/account/`); await ro.locator('#auth-form').waitFor()
  await ro.locator('#email').fill('test@example.test'); await ro.locator('#password').fill('test-password'); await ro.locator('#auth-submit').click()
  await ro.getByRole('heading', { name: 'Verificare în doi pași', exact: true }).waitFor()
  await ro.getByRole('button', { name: 'Folosește un cod de recuperare' }).waitFor()
  await ro.screenshot({ path: path.join(tmpdir(), 'account-mfa-challenge-ro.png'), fullPage: true })
  await roContext.close()
  // 8. Current server ("v1"): the sign-in challenge still guards the account, but
  // recovery codes, the recovery sign-in and turning it on/off are hidden, and no
  // v2-only action is ever sent.
  accountServer = 'v1'; state.factors = [verifiedFactor]; state.aal = 'aal1'; state.calls = []
  const v1 = await browser.newPage({ locale: 'en-US' }); v1.on('pageerror', e => errors.push(e.message)); await wire(v1)
  await v1.goto(`${origin}/account/`); await v1.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
  await v1.getByLabel('Email', { exact: true }).fill('test@example.test'); await v1.getByLabel('Password', { exact: true }).fill('test-password'); await v1.getByRole('button', { name: 'Sign in', exact: true }).click()
  await v1.getByRole('heading', { name: 'Two-step verification', exact: true }).waitFor()
  assert.equal(await v1.locator('#mfa-use-recovery').isHidden(), true, 'v1: no recovery-code sign-in')
  await v1.locator('#mfa-challenge-code').fill('123456'); await v1.getByRole('button', { name: 'Verify', exact: true }).click()
  await v1.getByRole('heading', { name: 'Your account', exact: true }).waitFor()
  for (const id of ['mfa-section', 'authenticator-section', 'analytics-section', 'activity-section']) assert.equal(await v1.locator(`#${id}`).isHidden(), true, `v1: #${id} hidden`)
  assert.deepEqual(state.calls.filter(a => !['get-account', 'sign-out-current'].includes(a)), [], 'v1: only current-server actions')
  await v1.close()
  assert.deepEqual(errors, [])
  console.log('PASS browser mock: MFA challenge before account and desktop consent, wrong/valid TOTP, recovery codes shown once, recovery code sign-in, enable with QR, disable, mobile width, Romanian texts (v2); v1 challenge only with v2 features hidden; no page errors')
} catch (error) { for (const p of browser.contexts().flatMap(c => c.pages())) console.log('STATE', await p.locator('#status').textContent().catch(() => '?'), JSON.stringify(state.calls), errors); throw error } finally { await browser.close(); server.close() }
