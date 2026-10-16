// Browser check for the 12-character minimum and the Cloudflare Turnstile
// wiring on the account page. Run after `npm run build`:
//   node scripts/account-captcha-browser-test.mjs
// Turnstile and Supabase are faked; nothing leaves the machine.
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

const TEST_SITE_KEY = '1x00000000000000000000AA' // Cloudflare's public "always passes" test key
let withSiteKey = false
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html')
    let data = await readFile(path.join(process.cwd(), 'dist', name))
    if (name === '/config.js' && withSiteKey) data = Buffer.from(String(data).replace('turnstileSiteKey: ""', `turnstileSiteKey: "${TEST_SITE_KEY}"`))
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.svg') ? 'image/svg+xml' : 'text/html')
    res.end(data)
  } catch { res.statusCode = 404; res.end() }
}).listen(0, '127.0.0.1')
await new Promise(r => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`

const fakeTurnstile = `window.turnstile = { n: 0, resets: 0,
  render(el, opts) { const id = 'w' + (++this.n); const b = document.createElement('button'); b.type = 'button'; b.textContent = 'Verify ' + id; b.onclick = () => opts.callback('token-' + id + '-' + Date.now()); el.append(b); return id },
  reset() { this.resets++ } }`

const browser = await chromium.launch({ headless: true })
const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'test@example.test', email_confirmed_at: new Date().toISOString(), user_metadata: {}, app_metadata: { provider: 'email' }, identities: [{ provider: 'email' }], created_at: new Date().toISOString() }
async function open(siteKey) {
  withSiteKey = siteKey
  const page = await browser.newPage({ locale: 'ro-RO' })
  const errors = [], authCalls = [], turnstileLoads = []
  page.on('pageerror', e => errors.push(e.message))
  await page.route('https://challenges.cloudflare.com/**', async route => { turnstileLoads.push(route.request().url()); await route.fulfill({ status: 200, contentType: 'text/javascript', body: fakeTurnstile }) })
  await page.route('https://hvevaxsfeyiikjhcsafi.supabase.co/**', async route => {
    const url = route.request().url(); const body = route.request().postDataJSON?.() ?? null
    if (/\/auth\/v1\/(signup|token|recover)/.test(url)) authCalls.push({ url, body })
    if (url.includes('/signup')) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...user, identities: [] }) })
    if (url.includes('/recover')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    if (url.includes('/token')) return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }) })
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await page.goto(`${base}/account/`)
  await page.getByRole('heading', { name: 'Sign in', exact: true }).waitFor()
  return { page, errors, authCalls, turnstileLoads }
}

try {
  // No site key: no widget, no third-party script, flows unchanged.
  {
    const { page, errors, authCalls, turnstileLoads } = await open(false)
    assert.equal(await page.locator('#captcha').isHidden(), true)
    await page.getByLabel('Email', { exact: true }).fill('test@example.test')
    await page.getByLabel('Password', { exact: true }).fill('short') // older accounts may have short passwords
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByText('Email or password is incorrect.', { exact: true }).waitFor()
    assert.equal(authCalls.length, 1, 'sign-in with a short existing password still reaches Auth')
    assert.equal(authCalls[0].body.gotrue_meta_security?.captcha_token, undefined)
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await page.getByLabel('Email', { exact: true }).fill('new@example.test')
    await page.getByLabel('Password', { exact: true }).fill('elevenchars')
    await page.getByText('Your Codevalanche account. Use a password with at least 12 characters.', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    // The browser's own (localized) validation stops the form first ...
    assert.equal(await page.locator('#password').evaluate(el => el.validity.tooShort), true)
    // ... and the page's check stops it when native validation is bypassed.
    await page.locator('#auth-form').evaluate(form => form.dispatchEvent(new Event('submit', { cancelable: true })))
    await page.getByText('Use at least 12 characters for your password.', { exact: true }).waitFor()
    assert.equal(authCalls.length, 1, 'a too-short new password never reaches Auth')
    await page.getByLabel('Password', { exact: true }).fill('twelve-chars')
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    await page.getByText('Check your email to confirm your account, then return here to sign in.', { exact: true }).waitFor()
    assert.equal(authCalls[1].body.data.locale, 'ro', 'the confirmation email follows the browser language')
    assert.deepEqual(turnstileLoads, [])
    assert.deepEqual(errors, [])
    await page.close()
  }
  // With a site key: the widget appears and its token goes to Auth, once per attempt.
  {
    const { page, errors, authCalls, turnstileLoads } = await open(true)
    await page.getByRole('button', { name: 'Verify w1' }).waitFor()
    assert.equal(await page.locator('#captcha').isVisible(), true)
    await page.getByLabel('Email', { exact: true }).fill('test@example.test')
    await page.getByLabel('Password', { exact: true }).fill('whatever-password')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByText('Complete the security check, then try again.', { exact: true }).waitFor()
    assert.equal(authCalls.length, 0, 'no Auth call without a CAPTCHA token')
    await page.getByRole('button', { name: 'Verify w1' }).click()
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await page.getByText('Email or password is incorrect.', { exact: true }).waitFor()
    assert.match(authCalls[0].body.gotrue_meta_security.captcha_token, /^token-w1-/)
    assert.equal(await page.evaluate(() => window.turnstile.resets), 1, 'the single-use token is reset after the attempt')
    await page.getByRole('button', { name: 'Forgot password?' }).click()
    await page.getByLabel('Email', { exact: true }).fill('test@example.test')
    await page.getByRole('button', { name: 'Verify w1' }).click()
    await page.getByRole('button', { name: 'Send reset link' }).click()
    await page.getByText('If an account exists for this email, a reset link is on its way. Open it in this browser.', { exact: true }).waitFor()
    assert.match(authCalls[1].url, /\/recover/)
    assert.match(authCalls[1].body.gotrue_meta_security.captcha_token, /^token-w1-/)
    assert.equal(turnstileLoads.length, 1)
    assert.match(turnstileLoads[0], /^https:\/\/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit$/)
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log('PASS captcha/password browser mock: no key = no widget and no third-party script; short existing password still signs in; new password < 12 refused before Auth; locale sent; with key the token is required, sent and reset (sign-in, reset)')
} finally { await browser.close(); server.close() }
