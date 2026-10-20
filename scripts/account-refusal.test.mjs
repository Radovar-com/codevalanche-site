import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import * as helpers from '../src/account/helpers.js'

test('account errors normalize the actual string envelope and distinguish suspension, revocation and outage', () => {
  assert.equal(typeof helpers.normalizeAccountError, 'function')
  assert.equal(helpers.normalizeAccountError({ error: 'Account blocked' }, 403).code, 'account_suspended')
  assert.equal(helpers.normalizeAccountError({ error: { code: 'account_suspended' } }, 403).code, 'account_suspended')
  assert.equal(helpers.normalizeAccountError({ error: 'Origin not allowed' }, 403).code, 'account_forbidden')
  assert.equal(helpers.normalizeAccountError({ error: 'Session revoked' }, 401).code, 'session_not_found')
  assert.equal(helpers.normalizeAccountError({ error: 'Account service unavailable' }, 503).code, 'account_service_unavailable')
  assert.equal(helpers.normalizeAccountError({ error: 'Too many requests' }, 429).code, 'over_request_rate_limit')
  assert.doesNotMatch(helpers.safeError({ code: 'unknown', message: '<script>private SQL</script>' }), /SQL|script/)
  for (const code of ['__proto__', 'constructor']) assert.equal(helpers.safeError({ code }), 'Unable to complete this request. Please try again.')
  assert.throws(() => helpers.normalizeAccountProfile({ displayName: 'x'.repeat(81) }))
})

test('signup and profile fields share the backend limit of 80 characters', async () => {
  const html = await readFile(new URL('../src/account/index.html', import.meta.url), 'utf8')
  for (const id of ['name', 'display-name']) assert.match(html.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))[0], /maxlength="80"/)
})

let browserPromise
const browser = () => browserPromise ??= chromium.launch({ headless: true })
after(async () => { if (browserPromise) await (await browserPromise).close() })
let bundlePromise
async function bundle() {
  return bundlePromise ??= build({ entryPoints: ['src/account/app.js'], bundle: true, write: false, format: 'esm', target: 'es2022',
    plugins: [{ name: 'fixture-auth-io', setup(builder) {
      builder.onResolve({ filter: /^@supabase\/supabase-js$/ }, () => ({ path: 'fixture-auth', namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const createClient = () => window.__fixtureClient; export class NavigatorLockAcquireTimeoutError extends Error {}' }))
    } }] }).then(result => result.outputFiles[0].text)
}

async function fixture(t, initialStatus = 200, errorOverride) {
  const html = await readFile(new URL('../src/account/index.html', import.meta.url), 'utf8'), source = await bundle()
  const server = createServer((request, response) => {
    if (request.url.startsWith('/account/app.js')) { response.setHeader('Content-Type', 'text/javascript'); response.end(source); return }
    if (request.url === '/account/' || request.url.startsWith('/account/?')) { response.setHeader('Content-Type', 'text/html'); response.end(html); return }
    response.writeHead(404); response.end()
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const context = await (await browser()).newContext()
  t.after(async () => { await context.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  await context.addInitScript(() => {
    const user = { id: 'fixture-user', email: 'fixture@example.test', user_metadata: { display_name: 'Unverified metadata' }, identities: [{ provider: 'email' }] }
    const state = { session: { access_token: 'fixture-access', user }, listener: null, signOuts: 0, completedReads: 0 }
    window.__fixtureState = state
    window.CODEVALANCHE_CONFIG = { supabaseUrl: 'https://account.fixture.invalid', supabasePublishableKey: 'fixture-public', accountServer: 'v2' }
    window.__fixtureClient = { auth: {
      getSession: async () => ({ data: { session: state.session }, error: null }),
      onAuthStateChange(listener) { state.listener = listener },
      signOut: async () => { state.signOuts++; state.session = null; state.listener?.('SIGNED_OUT', null); return { error: null } },
      oauth: { getAuthorizationDetails: async () => ({ data: { client: { name: 'Fixture app' }, scope: 'openid' }, error: null }) },
    } }
    const originalFetch = window.fetch
    window.fetch = async (...args) => {
      const response = await originalFetch(...args)
      const originalJson = response.json.bind(response)
      response.json = async () => { const value = await originalJson(); state.completedReads++; return value }
      return response
    }
  })
  let status = initialStatus, mutationStatus, releaseRead, heldRead
  const calls = []
  await context.route('https://account.fixture.invalid/**', async route => {
    const body = route.request().postDataJSON(), callStatus = body.action === 'get-account' ? status : mutationStatus ?? status
    calls.push(body)
    if (heldRead && body.action === 'get-account') { const held = heldRead; heldRead = null; await held }
    const error = errorOverride ?? (callStatus === 403 ? 'Account blocked' : callStatus === 401 ? 'Session revoked' : 'Account service unavailable')
    await route.fulfill({ status: callStatus, contentType: 'application/json', body: JSON.stringify(callStatus === 200
      ? { user: { displayName: 'Verified profile', bio: 'Fixture bio' }, sessions: [], deletion: null } : { error }) })
  })
  const page = await context.newPage()
  async function settle() { await page.waitForFunction(() => window.__fixtureState.completedReads > 0); await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0))) }
  await page.goto(`http://127.0.0.1:${server.address().port}/account/`)
  await settle()
  return { page, calls, settle, status(value) { status = value }, mutationStatus(value) { mutationStatus = value },
    holdRead() { heldRead = new Promise(resolve => { releaseRead = resolve }); return () => { heldRead = null; releaseRead() } } }
}

test('a blocked account never exposes editable profile and remains able to sign out', async t => {
  const { page } = await fixture(t, 403)
  assert.equal(await page.locator('#profile').isVisible(), false)
  assert.equal(await page.locator('#account-state').isVisible(), true)
  assert.match(await page.locator('#account-state').innerText(), /suspended|blocked/i)
  assert.equal(await page.locator('#account-state-logout').isEnabled(), true)
})

test('a revoked account session returns to sign-in and hides profile operations', async t => {
  const { page } = await fixture(t, 401)
  assert.equal(await page.locator('#profile').isVisible(), false)
  assert.equal(await page.locator('#auth').isVisible(), true)
  assert.equal(await page.evaluate(() => window.__fixtureState.session), null)
})

test('an outage preserves the renewable session, gates mutations and offers a working retry', async t => {
  const f = await fixture(t, 503), { page } = f
  assert.equal(await page.locator('#profile').isVisible(), false)
  assert.equal(await page.evaluate(() => window.__fixtureState.signOuts), 0)
  assert.equal(await page.evaluate(() => !!window.__fixtureState.session), true)
  f.status(200)
  await page.locator('#account-state-retry').click()
  await page.locator('#profile').waitFor({ state: 'visible' })
  assert.equal(await page.locator('#display-name').inputValue(), 'Verified profile')
})

test('a suspension received while saving closes the previously verified profile', async t => {
  const f = await fixture(t), { page } = f
  await page.locator('#profile').waitFor({ state: 'visible' })
  f.mutationStatus(403)
  // Save appears once a field differs from the saved profile.
  await page.locator('#display-name').fill('Edited name')
  await page.locator('#profile-form button[type=submit]').click()
  await page.waitForFunction(() => window.__fixtureState.completedReads >= 2)
  assert.equal(await page.locator('#profile').isVisible(), false)
  assert.equal(await page.locator('#account-state').isVisible(), true)
})

test('an unknown 403 gates account operations without declaring the account banned', async t => {
  const { page } = await fixture(t, 403, 'Origin not allowed')
  assert.equal(await page.locator('#profile').isVisible(), false)
  assert.match(await page.locator('#account-state-title').innerText(), /temporarily unavailable/i)
  assert.equal(await page.evaluate(() => window.__fixtureState.signOuts), 0)
})

test('logout invalidates a held account read before its late profile response', async t => {
  const f = await fixture(t), { page } = f, release = f.holdRead()
  await page.evaluate(() => window.__fixtureState.listener('TOKEN_REFRESHED', window.__fixtureState.session))
  await page.waitForFunction(() => !document.getElementById('account-state').hidden)
  await page.locator('#account-state-logout').click()
  release(); await page.waitForFunction(() => window.__fixtureState.completedReads >= 2)
  assert.equal(await page.locator('#profile').isVisible(), false)
  assert.equal(await page.locator('#auth').isVisible(), true)
})

test('a refusal from the old bearer cannot suspend the newly verified session of the same user', async t => {
  const f = await fixture(t), { page } = f
  f.status(403); const release = f.holdRead()
  await page.evaluate(() => window.__fixtureState.listener('TOKEN_REFRESHED', window.__fixtureState.session))
  await page.waitForFunction(() => !document.getElementById('account-state').hidden)
  while (f.calls.length < 2) await new Promise(resolve => setImmediate(resolve))
  f.status(200)
  await page.evaluate(() => {
    const state = window.__fixtureState
    state.session = { ...state.session, access_token: 'fixture-new-bearer' }
    state.listener('TOKEN_REFRESHED', state.session)
  })
  await page.locator('#profile').waitFor({ state: 'visible' })
  release(); await page.waitForFunction(() => window.__fixtureState.completedReads >= 3)
  assert.equal(await page.locator('#profile').isVisible(), true)
  assert.equal(await page.locator('#account-state').isVisible(), false)
})
