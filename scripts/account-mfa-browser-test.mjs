// Browser check of two-step verification on the built account page (dist/),
// with Supabase Auth and the account function faked by Playwright routes:
// nothing reaches a real project. Run: node scripts/build.mjs && node scripts/account-mfa-browser-test.mjs
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

const server = createServer(async (req, res) => { try { let name = new URL(req.url, 'http://localhost').pathname; if (name.endsWith('/')) name += 'index.html'; const data = await readFile(path.join(process.cwd(), 'dist', name)); res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : 'text/html'); res.end(data) } catch { res.statusCode = 404; res.end() } }).listen(0, '127.0.0.1')
await new Promise(r => server.once('listening', r))
const origin = `http://127.0.0.1:${server.address().port}`
const factorId = '55555555-5555-4555-8555-555555555555'
const verifiedFactor = { id: factorId, factor_type: 'totp', status: 'verified', friendly_name: 'Phone', created_at: '2026-10-16T00:00:00Z', updated_at: '2026-10-16T00:00:00Z' }
const jwt = (aal) => ['e30', Buffer.from(JSON.stringify({ sub: '11111111-1111-4111-8111-111111111111', aal, amr: [{ method: 'password', timestamp: 1 }], exp: Math.floor(Date.now() / 1000) + 3600, session_id: '22222222-2222-4222-8222-222222222222' })).toString('base64url'), 'sig'].join('.')
const state = { factors: [verifiedFactor], aal: 'aal1', remaining: 8, calls: [] }
const user = () => ({ id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'test@example.test', email_confirmed_at: new Date().toISOString(), user_metadata: { display_name: 'Test' }, app_metadata: { provider: 'email' }, identities: [{ provider: 'email' }], factors: state.factors, created_at: new Date().toISOString() })
const session = () => ({ access_token: jwt(state.aal), refresh_token: 'refresh', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: user() })
const RECOVERY = 'k4m9x-7qp2a'

async function wire(page) {
  await page.route('https://hvevaxsfeyiikjhcsafi.supabase.co/**', async route => {
    const url = new URL(route.request().url()), method = route.request().method()
    const reply = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (url.pathname.endsWith('/auth/v1/settings')) return reply({ external: { google: false } })
    if (url.pathname.endsWith('/auth/v1/token')) { if (url.searchParams.get('grant_type') === 'password') state.aal = 'aal1'; return reply(session()) }
    if (url.pathname.endsWith('/auth/v1/user')) return reply(user())
    if (url.pathname.endsWith('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' })
    let m
    if (url.pathname.endsWith('/auth/v1/factors') && method === 'POST') { state.factors = [...state.factors, { id: 'pending-factor', factor_type: 'totp', status: 'unverified', friendly_name: 'x' }]; return reply({ id: 'pending-factor', type: 'totp', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' } }) }
    if ((m = url.pathname.match(/\/auth\/v1\/factors\/([^/]+)\/challenge$/))) return reply({ id: 'challenge-1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 })
    if ((m = url.pathname.match(/\/auth\/v1\/factors\/([^/]+)\/verify$/))) {
      const { code } = route.request().postDataJSON()
      if (code !== '123456') return reply({ code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' }, 422)
      state.factors = state.factors.map(f => f.id === m[1] ? { ...f, status: 'verified' } : f); state.aal = 'aal2'
      return reply(session())
    }
    if ((m = url.pathname.match(/\/auth\/v1\/factors\/([^/]+)$/)) && method === 'DELETE') { state.factors = state.factors.filter(f => f.id !== m[1]); return reply({ id: m[1] }) }
    if (url.pathname.includes('/auth/v1/oauth/authorizations/')) return reply({ authorization_id: 'test-consent-123', client: { name: 'Codevalanche Desktop' }, scope: 'openid email', redirect_uri: 'http://127.0.0.1/cb', user: user() })
    if (url.pathname.endsWith('/functions/v1/codevalanche-account')) {
      const body = route.request().postDataJSON(); state.calls.push(body.action)
      const enabled = state.factors.some(f => f.status === 'verified')
      if (enabled && state.aal !== 'aal2' && !['mfa-recovery-redeem', 'sign-out-current'].includes(body.action)) return reply({ error: 'MFA required', mfaRequired: true }, 401)
      if (body.action === 'get-account') return reply({ user: { displayName: 'Test', bio: '' }, sessions: [{ current: true, createdAt: new Date().toISOString() }], deletion: null, mfa: { enabled, factors: state.factors.filter(f => f.status === 'verified').map(f => ({ id: f.id })), recoveryCodesRemaining: enabled ? state.remaining : 0 } })
      if (body.action === 'mfa-recovery-redeem') { if (body.code.replace(/[\s-]/g, '').toLowerCase() !== RECOVERY.replace('-', '')) return reply({ error: 'Invalid recovery code' }, 400); state.factors = []; return reply({ ok: true, mfa: { enabled: false } }) }
      if (body.action === 'mfa-recovery-codes') { state.remaining = 10; return reply({ codes: Array.from({ length: 10 }, (_, i) => `aaaa${i}-bbbbb`) }) }
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
  // 3. Lost authenticator: a recovery code from a fresh sign-in turns it off.
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
  state.aal = 'aal1'; await signIn(); await page.getByRole('heading', { name: 'Two-step verification', exact: true }).waitFor()
  await page.getByRole('button', { name: 'Use a recovery code instead' }).click()
  await page.getByLabel('Recovery code').fill('wrong-code1'); await page.getByRole('button', { name: 'Use recovery code', exact: true }).click()
  await page.getByText('That recovery code is not valid or was already used.', { exact: true }).waitFor()
  await page.getByLabel('Recovery code').fill(' K4M9X 7QP2A '); await page.getByRole('button', { name: 'Use recovery code', exact: true }).click()
  await page.getByRole('heading', { name: 'Your account', exact: true }).waitFor()
  await page.getByText('Off. Add an authenticator app for a second step at sign-in.', { exact: true }).waitFor()
  // 4. Turning it on: QR + key, a code, then the recovery codes.
  await page.getByRole('button', { name: 'Turn on two-step verification' }).click()
  await page.getByText('JBSWY3DPEHPK3PXP', { exact: true }).waitFor(); assert.match(await page.locator('#mfa-qr').getAttribute('src'), /^data:image\/svg\+xml/)
  await page.locator('#mfa-enroll-code').fill('123456'); await page.getByRole('button', { name: 'Confirm and turn on' }).click()
  await page.getByText('aaaa9-bbbbb', { exact: true }).waitFor(); await page.getByText('Two-step verification is on.', { exact: true }).waitFor()
  await page.getByText('On. Recovery codes left: 10.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'I saved my recovery codes', exact: true }).click()
  // 5. Turning it off.
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Turn off two-step verification' }).click()
  await page.getByText('Two-step verification is off.', { exact: true }).waitFor()
  // 6. Desktop consent waits for the second step.
  state.factors = [verifiedFactor]; state.aal = 'aal1'
  await page.getByRole('button', { name: 'Sign out', exact: true }).click(); await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
  await page.goto(`${origin}/account/authorize/?authorization_id=test-consent-123`); await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor(); await signIn()
  await page.getByRole('heading', { name: 'Two-step verification', exact: true }).waitFor()
  assert.equal(await page.locator('#consent').isHidden(), true, 'no consent before the second step')
  await page.locator('#mfa-challenge-code').fill('123456'); await page.getByRole('button', { name: 'Verify', exact: true }).click()
  await page.getByText('Codevalanche Desktop wants to access your Codevalanche account.', { exact: true }).waitFor()
  await page.close()
  // 7. Romanian browser: the second step speaks Romanian.
  state.factors = [verifiedFactor]; state.aal = 'aal1'
  const ro = await browser.newPage({ locale: 'ro-RO' }); ro.on('pageerror', e => errors.push(e.message)); await wire(ro)
  await ro.goto(`${origin}/account/`); await ro.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
  await ro.getByLabel('Email', { exact: true }).fill('test@example.test'); await ro.getByLabel('Password', { exact: true }).fill('test-password'); await ro.getByRole('button', { name: 'Sign in', exact: true }).click()
  await ro.getByRole('heading', { name: 'Verificare în doi pași', exact: true }).waitFor()
  await ro.getByRole('button', { name: 'Folosește un cod de recuperare' }).waitFor()
  await ro.screenshot({ path: '../_build/account-mfa-challenge-ro.png', fullPage: true })
  assert.deepEqual(errors, [])
  console.log('PASS browser mock: MFA challenge before account and desktop consent, wrong/valid TOTP, recovery codes shown once, recovery code sign-in, enable with QR, disable, mobile width, Romanian texts; no page errors')
} catch (error) { for (const p of browser.contexts().flatMap(c => c.pages())) console.log('STATE', await p.locator('#status').textContent().catch(() => '?'), JSON.stringify(state.calls), errors); throw error } finally { await browser.close(); server.close() }
