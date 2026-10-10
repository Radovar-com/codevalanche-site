import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from 'playwright'

let browserPromise, bundlePromise
after(async () => { if (browserPromise) await (await browserPromise).close() })
const USER_A = { id: '11111111-1111-4111-8111-111111111111', email: 'a@example.test', aud: 'authenticated', role: 'authenticated',
  user_metadata: { display_name: 'A' }, app_metadata: { provider: 'email' }, identities: [{ provider: 'email' }] }
const USER_B = { ...USER_A, id: '22222222-2222-4222-8222-222222222222', email: 'b@example.test', user_metadata: { display_name: 'B' } }
const sessionFor = (user, expired = false) => ({ access_token: `fixture-${user.id}`, refresh_token: `refresh-${user.id}`,
  token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + (expired ? -60 : 3600), user })
async function bundle() {
  return bundlePromise ??= readFile('src/account/app.js', 'utf8').then(source => build({
    stdin: { contents: source.replace('const client = createClient(', 'const client = window.__sdkClient = createClient('),
      resolveDir: new URL('../src/account/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'), sourcefile: 'app.js' },
    bundle: true, write: false, format: 'esm', target: 'es2022',
  }).then(result => result.outputFiles[0].text))
}
async function until(page, check) {
  for (let i = 0; i < 24; i++) { if (await page.evaluate(check)) return; await page.clock.runFor(4000); await new Promise(resolve => setTimeout(resolve, 10)) }
  throw new Error('actual SDK lifecycle did not settle')
}
async function fixture(t, { status = 200, expired = false, query = '' } = {}) {
  const [html, source] = await Promise.all([readFile('src/account/index.html', 'utf8'), bundle()])
  const server = createServer((request, response) => {
    if (request.url.startsWith('/account/app.js')) { response.setHeader('Content-Type', 'text/javascript'); response.end(source) }
    else if (request.url.startsWith('/account/')) { response.setHeader('Content-Type', 'text/html'); response.end(html) }
    else { response.writeHead(404); response.end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  browserPromise ??= chromium.launch({ headless: true })
  const context = await (await browserPromise).newContext(), page = await context.newPage()
  t.after(async () => { await context.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  await context.addInitScript(session => {
    window.CODEVALANCHE_CONFIG = { supabaseUrl: 'https://account.fixture.invalid', supabasePublishableKey: 'fixture-public' }
    if (!localStorage.getItem('fixture-seeded')) { localStorage.setItem('sb-account-auth-token', JSON.stringify(session)); localStorage.setItem('fixture-seeded', 'yes') }
    if (location.search.includes('code=')) localStorage.setItem('sb-account-auth-token-code-verifier', JSON.stringify('fixture-pkce-verifier'))
  }, sessionFor(USER_A, expired))
  await page.clock.install()
  let accountStatus = status, refreshStatus = 200, releaseLogout, heldLogout
  const calls = []
  await context.route('https://account.fixture.invalid/**', async route => {
    const request = route.request(), url = new URL(request.url()), body = request.postData() ? request.postDataJSON() : {}
    calls.push({ path: url.pathname, grant: url.searchParams.get('grant_type'), body })
    let result, responseStatus = 200
    if (url.pathname.endsWith('/logout')) {
      if (heldLogout) await heldLogout
      result = {}
    } else if (url.pathname.endsWith('/token')) {
      if (url.searchParams.get('grant_type') === 'refresh_token' && refreshStatus !== 200) { responseStatus = refreshStatus; result = { msg: 'temporarily unavailable' } }
      else result = sessionFor(body.email === USER_B.email ? USER_B : USER_A)
    } else if (url.pathname.endsWith('/user')) result = request.headers().authorization?.includes(USER_B.id) ? USER_B : USER_A
    else if (url.pathname.includes('/oauth/authorizations/')) result = { authorization_id: 'fixture-consent', client: { name: 'Fixture app' }, scope: 'openid', user: USER_A }
    else if (url.pathname.includes('/functions/')) {
      responseStatus = accountStatus
      const user = request.headers().authorization?.includes(USER_B.id) ? USER_B : USER_A
      result = accountStatus === 200 ? { user: { displayName: user.user_metadata.display_name, bio: '' }, sessions: [], deletion: null }
        : { error: accountStatus === 401 ? 'Session revoked' : accountStatus === 403 ? 'Account blocked' : 'Account service unavailable' }
    } else result = {}
    await route.fulfill({ status: responseStatus, contentType: 'application/json', body: JSON.stringify(result) })
  })
  const origin = `http://127.0.0.1:${server.address().port}`
  return { page, calls, origin, load: () => page.goto(`${origin}/account/${query}`),
    async openPeer(peerQuery = '', { ignoreStorageEvents = false } = {}) {
      const peer = await context.newPage()
      if (ignoreStorageEvents) await peer.addInitScript(() => window.addEventListener('storage', event => event.stopImmediatePropagation()))
      await peer.clock.install(); await peer.goto(`${origin}/account/${peerQuery}`); return peer
    },
    status(value) { accountStatus = value }, refreshStatus(value) { refreshStatus = value },
    holdLogout() { heldLogout = new Promise(resolve => { releaseLogout = resolve }); return () => { heldLogout = null; releaseLogout() } } }
}

test('actual SDK late logout cannot clear a newer sign-in', async t => {
  const f = await fixture(t, { status: 401 }), release = f.holdLogout()
  await f.load(); await until(f.page, () => !document.getElementById('auth').hidden || !document.getElementById('account-state').hidden)
  await until(f.page, () => window.__sdkClient != null)
  await f.page.clock.runFor(0)
  assert.equal(await f.page.locator('#auth-submit').isEnabled(), false, 'signin must wait until destructive SDK cleanup settles')
  release(); f.status(200)
  await until(f.page, () => !document.getElementById('auth').hidden && !document.getElementById('auth-submit').disabled)
  await f.page.locator('#email').fill(USER_B.email); await f.page.locator('#password').fill('fixture-password')
  await f.page.locator('#auth-submit').click()
  await until(f.page, () => !document.getElementById('profile').hidden)
  assert.equal(await f.page.locator('#profile-email').innerText(), USER_B.email)
})

test('actual SDK initial refresh outage preserves credentials and exposes a working Retry', async t => {
  const f = await fixture(t, { expired: true }); f.refreshStatus(503)
  await f.load(); await until(f.page, () => document.getElementById('account-state-title').textContent === 'Account temporarily unavailable' && !document.getElementById('account-state-retry').disabled)
  assert.equal(await f.page.locator('#account-state-retry').isVisible(), true)
  assert.equal(await f.page.evaluate(() => !!localStorage.getItem('sb-account-auth-token')), true)
  f.refreshStatus(200); await f.page.locator('#account-state-retry').click()
  await until(f.page, () => !document.getElementById('profile').hidden)
})

test('actual SDK recovery form closes after a newly received suspension', async t => {
  const f = await fixture(t, { query: '?flow=recovery' }); await f.load()
  await until(f.page, () => !document.getElementById('auth').hidden && document.getElementById('auth-submit').textContent === 'Save password')
  f.status(403)
  await f.page.evaluate(async () => { await window.__sdkClient.auth.refreshSession() })
  await until(f.page, () => !document.getElementById('account-state').hidden)
  assert.equal(await f.page.locator('#auth').isVisible(), false)
  assert.equal(f.calls.filter(call => call.path.endsWith('/user') && call.body.password).length, 0)
})

test('actual SDK password recovery preserves validated authorization context across reload', async t => {
  const f = await fixture(t, { query: '?authorization_id=fixture-consent&flow=recovery' }); await f.load()
  await until(f.page, () => !document.getElementById('auth').hidden && document.getElementById('auth-submit').textContent === 'Save password')
  await f.page.locator('#password').fill('fixture-new-password'); await f.page.locator('#auth-submit').click()
  await until(f.page, () => document.getElementById('status').textContent.includes('Password updated'))
  assert.equal(new URL(f.page.url()).searchParams.get('authorization_id'), 'fixture-consent')
  assert.equal(new URL(f.page.url()).searchParams.get('flow'), null)
  await f.page.reload(); await until(f.page, () => !document.getElementById('consent').hidden)
})

test('actual SDK stale peer snapshot cannot replace the currently stored session view', async t => {
  const f = await fixture(t); await f.load(); await until(f.page, () => !document.getElementById('profile').hidden)
  await f.page.evaluate(async () => { await window.__sdkClient.auth.signInWithPassword({ email: 'b@example.test', password: 'fixture-password' }) })
  await until(f.page, () => document.getElementById('profile-email').textContent === 'b@example.test')
  await f.page.evaluate(old => {
    const peer = new BroadcastChannel('sb-account-auth-token')
    peer.postMessage({ event: 'TOKEN_REFRESHED', session: old }); setTimeout(() => peer.close(), 1000)
  }, sessionFor(USER_A))
  for (let i = 0; i < 4; i++) { await f.page.clock.runFor(0); await new Promise(resolve => setTimeout(resolve, 10)) }
  assert.equal(await f.page.locator('#profile').isVisible(), true)
  assert.equal(await f.page.locator('#profile-email').innerText(), USER_B.email)
})

test('actual SDK refresh after failed expired-token logout cannot resurrect the withdrawn view or its next boot', async t => {
  const f = await fixture(t); await f.load(); await until(f.page, () => !document.getElementById('profile').hidden)
  f.refreshStatus(503)
  await f.page.evaluate(() => { const session = JSON.parse(localStorage.getItem('sb-account-auth-token')); session.expires_at = 1; localStorage.setItem('sb-account-auth-token', JSON.stringify(session)) })
  await f.page.locator('#logout').click()
  await until(f.page, () => document.getElementById('status').dataset.error === 'true' && !document.getElementById('auth-submit').disabled)
  assert.equal(await f.page.evaluate(() => !!localStorage.getItem('sb-account-auth-token')), true)
  f.refreshStatus(200)
  await f.page.evaluate(async () => { await window.__sdkClient.auth._autoRefreshTokenTick() })
  for (let i = 0; i < 4; i++) { await f.page.clock.runFor(0); await new Promise(resolve => setTimeout(resolve, 10)) }
  assert.equal(await f.page.locator('#profile').isVisible(), false)
  await f.page.reload()
  await until(f.page, () => window.__sdkClient != null)
  assert.equal(await f.page.locator('#profile').isVisible(), false)
})

test('actual SDK explicit PKCE callback consumes the code and retains authorization context on reload', async t => {
  const f = await fixture(t, { query: '?code=fixture-pkce&authorization_id=fixture-consent' })
  await f.load(); await until(f.page, () => !document.getElementById('consent').hidden)
  assert.equal(f.calls.some(call => call.grant === 'pkce'), true)
  assert.equal(new URL(f.page.url()).searchParams.get('code'), null)
  assert.equal(new URL(f.page.url()).searchParams.get('authorization_id'), 'fixture-consent')
  await f.page.reload(); await until(f.page, () => !document.getElementById('consent').hidden)
  assert.equal(f.calls.filter(call => call.grant === 'pkce').length, 1)
})

for (const view of ['profile', 'consent']) test(`actual SDK peer logout immediately withdraws the other tab's ${view} through pending and complete cleanup`, async t => {
  const f = await fixture(t)
  await f.load(); await until(f.page, () => !document.getElementById('profile').hidden)
  const peer = await f.openPeer(view === 'consent' ? '?authorization_id=fixture-consent' : '')
  await until(peer, () => !document.getElementById(location.search ? 'consent' : 'profile').hidden)
  const release = f.holdLogout()
  await f.page.locator('#logout').click()
  await peer.waitForFunction(() => localStorage.getItem('codevalanche-account-logout-intent') === 'pending')
  for (let i = 0; i < 3; i++) { await peer.clock.runFor(0); await new Promise(resolve => setTimeout(resolve, 10)) }
  assert.equal(await peer.locator(`#${view}`).isVisible(), false, 'peer must withdraw the account view while SDK logout is still pending')
  assert.equal(await peer.locator('#profile-form button').isEnabled(), false, 'peer profile mutations must be disabled immediately')
  release()
  await until(f.page, () => document.getElementById('status').textContent === 'Signed out.')
  for (let i = 0; i < 3; i++) { await peer.clock.runFor(0); await new Promise(resolve => setTimeout(resolve, 10)) }
  assert.equal(await peer.evaluate(() => localStorage.getItem('sb-account-auth-token')), null)
  assert.equal(await peer.locator('#profile').isVisible(), false)
  assert.equal(await peer.locator('#consent').isVisible(), false)
  assert.equal(await peer.locator('#auth').isVisible(), true)
  assert.equal(await peer.locator('#auth-submit').isEnabled(), true)
})

test('actual SDK logout event withdraws a peer account view when storage notifications are unavailable', async t => {
  const f = await fixture(t)
  await f.load(); await until(f.page, () => !document.getElementById('profile').hidden)
  const peer = await f.openPeer('', { ignoreStorageEvents: true })
  await until(peer, () => !document.getElementById('profile').hidden)
  await f.page.locator('#logout').click()
  await until(f.page, () => document.getElementById('status').textContent === 'Signed out.')
  for (let i = 0; i < 3; i++) { await peer.clock.runFor(0); await new Promise(resolve => setTimeout(resolve, 10)) }
  assert.equal(await peer.locator('#profile').isVisible(), false, 'SDK SIGNED_OUT must withdraw a peer view independently of storage notifications')
  assert.equal(await peer.locator('#profile-form button').isEnabled(), false)
  assert.equal(await peer.locator('#auth').isVisible(), true)
})

test('actual SDK sign-in deadline includes a streamed partial JSON body and releases the credential lock for retry', async t => {
  const [html, source] = await Promise.all([readFile('src/account/index.html', 'utf8'), bundle()])
  let tokenRequests = 0, bodyStarted
  const partialBody = new Promise(resolve => { bodyStarted = resolve })
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    response.setHeader('Content-Type', 'application/json')
    if (url.pathname === '/account/app.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(source) }
    else if (url.pathname.startsWith('/account/')) { response.setHeader('Content-Type', 'text/html'); response.end(html) }
    else if (url.pathname.endsWith('/token')) {
      tokenRequests++
      if (tokenRequests === 1) { response.flushHeaders(); response.write('{"access_token":'); bodyStarted() }
      else response.end(JSON.stringify(sessionFor(USER_A)))
    } else if (url.pathname.endsWith('/user')) response.end(JSON.stringify(USER_A))
    else if (url.pathname.includes('/functions/')) response.end(JSON.stringify({ user: { displayName: 'A', bio: '' }, sessions: [], deletion: null }))
    else response.end('{}')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  browserPromise ??= chromium.launch({ headless: true })
  const context = await (await browserPromise).newContext(), page = await context.newPage()
  t.after(async () => { await context.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  await context.addInitScript(url => { window.CODEVALANCHE_CONFIG = { supabaseUrl: url, supabasePublishableKey: 'fixture-public' } }, origin)
  await page.clock.install(); await page.goto(`${origin}/account/`)
  await until(page, () => !document.getElementById('auth').hidden && !document.getElementById('auth-submit').disabled)
  await page.locator('#email').fill(USER_A.email); await page.locator('#password').fill('fixture-password')
  await page.locator('#auth-submit').click(); await partialBody
  await page.clock.runFor(16000); await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(await page.locator('#auth-submit').isEnabled(), true, 'partial JSON must time out and release the sign-in action')
  assert.equal(await page.locator('#status').getAttribute('data-error'), 'true')
  assert.equal(await page.evaluate(() => localStorage.getItem('sb-127-auth-token')), null)
  await page.locator('#auth-submit').click()
  await until(page, () => !document.getElementById('profile').hidden)
  assert.equal(await page.locator('#profile-email').innerText(), USER_A.email)
  assert.equal(tokenRequests, 2, 'retry must acquire the credential lock and finish a fresh sign-in')
})

test('actual app Google settings deadline includes a streamed partial body and permits another click', async t => {
  const [html, source] = await Promise.all([readFile('src/account/index.html', 'utf8'), bundle()])
  let settingsRequests = 0, bodyStarted
  const partialBody = new Promise(resolve => { bodyStarted = resolve })
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1')
    response.setHeader('Content-Type', 'application/json')
    if (url.pathname === '/account/app.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(source) }
    else if (url.pathname.startsWith('/account/')) { response.setHeader('Content-Type', 'text/html'); response.end(html) }
    else if (url.pathname.endsWith('/settings')) {
      settingsRequests++
      if (settingsRequests === 1) { response.flushHeaders(); response.write('{"external":'); bodyStarted() }
      else response.end(JSON.stringify({ external: { google: false } }))
    } else response.end('{}')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  browserPromise ??= chromium.launch({ headless: true })
  const context = await (await browserPromise).newContext(), page = await context.newPage()
  t.after(async () => { await context.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  await context.addInitScript(url => { window.CODEVALANCHE_CONFIG = { supabaseUrl: url, supabasePublishableKey: 'fixture-public' } }, origin)
  await page.clock.install(); await page.goto(`${origin}/account/`)
  await until(page, () => !document.getElementById('auth').hidden && !document.getElementById('google-signin').disabled)
  await page.locator('#google-signin').click(); await partialBody
  await page.clock.runFor(8000); await new Promise(resolve => setTimeout(resolve, 30))
  assert.equal(await page.locator('#google-signin').isEnabled(), true, 'unfinished settings JSON must release the Google action after its deadline')
  assert.equal(await page.locator('#auth-submit').isEnabled(), true, 'email sign-in must remain usable after a Google settings timeout')
  assert.equal(await page.locator('#status').getAttribute('data-error'), 'true')
  assert.match(await page.locator('#status').innerText(), /try again/i)
  assert.equal(await page.evaluate(() => localStorage.getItem('sb-127-auth-token')), null)
  await page.locator('#google-signin').click()
  await until(page, () => document.getElementById('status').textContent.includes('Google sign-in is not available yet') && !document.getElementById('google-signin').disabled)
  assert.equal(settingsRequests, 2, 'a new click must finish a fresh settings request after timeout')
})
