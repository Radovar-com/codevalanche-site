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
async function untilIO(page, check) {
  // Healthy asynchronous responses must settle in real time. Advancing the page
  // clock can otherwise fire an eight-second request deadline during fixture I/O.
  const deadline = Date.now() + 5000
  while (!await page.evaluate(check)) {
    assert.ok(Date.now() < deadline, 'actual SDK I/O did not settle within five real seconds')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
}
async function fixture(t, { status = 200, expired = false, query = '', authorizePage = false, responseDelayMs = 0 } = {}) {
  const [html, source] = await Promise.all([readFile(authorizePage ? 'src/account/authorize/index.html' : 'src/account/index.html', 'utf8'), bundle()])
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
    window.CODEVALANCHE_CONFIG = { supabaseUrl: 'https://account.fixture.invalid', supabasePublishableKey: 'fixture-public', accountServer: 'v2' }
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
      result = accountStatus === 200 ? body.action === 'operator.oauth.details' ? {apiVersion:2,ok:true,requestId:body.requestId,data:{operator:false}} : { user: { displayName: user.user_metadata.display_name, bio: '' }, sessions: [], deletion: null }
        : { error: accountStatus === 401 ? 'Session revoked' : accountStatus === 403 ? 'Account blocked' : 'Account service unavailable' }
    } else result = {}
    if (responseDelayMs) await new Promise(resolve => setTimeout(resolve, responseDelayMs))
    await route.fulfill({ status: responseStatus, contentType: 'application/json', body: JSON.stringify(result) })
  })
  const origin = `http://127.0.0.1:${server.address().port}`
  return { page, calls, origin, load: () => page.goto(`${origin}/account/${authorizePage ? 'authorize/' : ''}${query}`),
    async openPeer(peerQuery = '', { ignoreStorageEvents = false } = {}) {
      const peer = await context.newPage()
      if (ignoreStorageEvents) await peer.addInitScript(() => window.addEventListener('storage', event => event.stopImmediatePropagation()))
      await peer.clock.install(); await peer.goto(`${origin}/account/${peerQuery}`); return peer
    },
    status(value) { accountStatus = value }, refreshStatus(value) { refreshStatus = value },
    holdLogout() { heldLogout = new Promise(resolve => { releaseLogout = resolve }); return () => { heldLogout = null; releaseLogout() } } }
}

test('actual SDK late logout cannot clear a newer sign-in', async t => {
  const f = await fixture(t, { status: 401, responseDelayMs: 150 }), release = f.holdLogout()
  // Initial loading also shows account-state; observe the held SDK logout before
  // asserting the cleanup fence, without advancing healthy request deadlines.
  const logoutStarted = f.page.waitForRequest(request => new URL(request.url()).pathname === '/auth/v1/logout', { timeout: 5000 })
  await f.load(); await logoutStarted
  await untilIO(f.page, () => !document.getElementById('auth').hidden || !document.getElementById('account-state').hidden)
  await untilIO(f.page, () => window.__sdkClient != null)
  await f.page.clock.runFor(0)
  assert.equal(await f.page.locator('#auth-submit').isEnabled(), false, 'signin must wait until destructive SDK cleanup settles')
  release(); f.status(200)
  await untilIO(f.page, () => !document.getElementById('auth').hidden && !document.getElementById('auth-submit').disabled)
  await f.page.locator('#email').fill(USER_B.email); await f.page.locator('#password').fill('fixture-password')
  await f.page.locator('#auth-submit').click()
  await untilIO(f.page, () => !document.getElementById('profile').hidden)
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
  await f.page.reload(); await until(f.page, () => !document.getElementById('auth').hidden && document.getElementById('auth-submit').textContent === 'Sign in')
  assert.equal(await f.page.locator('#consent').isVisible(), false)
})

test('actual SDK MFA verification uses its public credential lock without nesting a second lock', async t => {
  const f = await fixture(t)
  await f.page.route('https://account.fixture.invalid/auth/v1/factors**', async route => {
    const url = route.request().url()
    const data = url.endsWith('/verify') ? sessionFor(USER_A) : url.endsWith('/challenge') ? { id: 'fixture-challenge' } : { id: 'fixture-factor', totp: { secret: 'synthetic-setup-secret' } }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await f.load(); await until(f.page, () => !document.getElementById('profile').hidden)
  await f.page.locator('#authenticator-add').click(); await until(f.page, () => !document.getElementById('authenticator-verify').hidden)
  await f.page.locator('#mfa-code').fill('123456'); await f.page.locator('#mfa-form button[type=submit]').click()
  await until(f.page, () => document.getElementById('status').textContent.includes('Authenticator verified'))
  assert.equal(await f.page.locator('#authenticator-secret').textContent(), '')
})

test('deletion pending exposes restricted cancellation and closes profile mutations', async t => {
  const f = await fixture(t)
  await f.page.route('https://account.fixture.invalid/functions/**', async route => {
    const body = route.request().postDataJSON()
    const result = body.action === 'cancel-deletion' ? { ok: true } : { user: { displayName: 'A', bio: '' }, sessions: [], policy: { status: 'deletion_pending' }, deletion: { scheduledFor: '2026-11-10T00:00:00Z' } }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(result) })
  })
  await f.load(); await until(f.page, () => document.getElementById('account-state-title').textContent === 'Account deletion pending')
  assert.equal(await f.page.locator('#profile').isVisible(), false)
  assert.equal(await f.page.locator('#account-state-cancel').isVisible(), true)
  assert.equal(await f.page.locator('#authenticator-add').isEnabled(), false)
})

test('accepted self deletion immediately closes profile mutations and cancellation reloads current policy', async t => {
  const f = await fixture(t)
  let deleted = false, cancelled = false
  const mutations = []
  await f.page.route('https://account.fixture.invalid/functions/**', async route => {
    const { action } = route.request().postDataJSON()
    let result, status = 200
    if (action === 'request-deletion') {
      mutations.push(action); deleted = true; status = 202
      result = { ok: true, jobId: '33333333-3333-4333-8333-333333333333', state: 'queued', dueAt: '2026-11-10T00:00:00Z', deletion: { scheduledFor: '2026-11-10T00:00:00Z', status: 'pending' } }
    } else if (action === 'cancel-deletion') {
      mutations.push(action); cancelled = true
      result = { ok: true, state: 'cancelled' }
    } else if (cancelled) { status = 403; result = { error: 'Account blocked' } }
    else result = { user: { id: USER_A.id, displayName: 'A', bio: '' }, sessions: [], policy: { status: deleted ? 'deletion_pending' : 'active' }, deletion: null }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(result) })
  })
  await f.load(); await until(f.page, () => !document.getElementById('profile').hidden)
  await f.page.locator('#delete-form').evaluate(form => form.closest('details').open = true)
  await f.page.locator('#delete-confirm').fill('DELETE'); await f.page.locator('#delete-form button').click()
  await until(f.page, () => document.getElementById('status').textContent.length > 0 && !document.getElementById('account-state-logout').disabled)
  assert.equal(await f.page.locator('#profile').isVisible(), false, 'accepted deletion must withdraw editable profile immediately')
  assert.equal(await f.page.locator('#account-state-title').innerText(), 'Account deletion pending')
  assert.equal(await f.page.locator('#profile-form button[type=submit]').isEnabled(), false)
  assert.equal(await f.page.locator('#account-state-cancel').isVisible(), true)
  assert.match(await f.page.locator('#account-state-description').innerText(), /Local projects are preserved/)
  await f.page.locator('#account-state-cancel').click()
  await until(f.page, () => document.getElementById('account-state-title').textContent === 'Account suspended' && !document.getElementById('account-state-logout').disabled)
  assert.equal(await f.page.locator('#profile').isVisible(), false, 'cancellation must not lift a separate suspension')
  assert.deepEqual(mutations, ['request-deletion', 'cancel-deletion'])
})

test('self deletion with an incomplete acceptance remains unconfirmed and offers a read-only retry', async t => {
  const f = await fixture(t)
  let mutationCount = 0
  await f.page.route('https://account.fixture.invalid/functions/**', async route => {
    const { action } = route.request().postDataJSON()
    if (action === 'request-deletion') mutationCount++
    await new Promise(resolve => setTimeout(resolve, 150))
    await route.fulfill({ status: action === 'request-deletion' ? 202 : 200, contentType: 'application/json', body: JSON.stringify(action === 'get-account'
      ? { user: { id: USER_A.id, displayName: 'A', bio: '' }, sessions: [], deletion: null } : { ok: true }) })
  })
  await f.load(); await untilIO(f.page, () => !document.getElementById('profile').hidden)
  await f.page.locator('#delete-form').evaluate(form => form.closest('details').open = true)
  await f.page.locator('#delete-confirm').fill('DELETE'); await f.page.locator('#delete-form button').click()
  await untilIO(f.page, () => document.getElementById('status').textContent.length > 0 && !document.getElementById('account-state-retry').disabled)
  assert.equal(await f.page.locator('#profile').isVisible(), false, 'an unconfirmed deletion must gate further mutations')
  assert.equal(await f.page.locator('#status').getAttribute('data-error'), 'true')
  assert.doesNotMatch(await f.page.locator('#status').innerText(), /recorded|deleted|cancelled/i)
  await f.page.locator('#account-state-retry').click()
  await untilIO(f.page, () => !document.getElementById('profile').hidden)
  assert.equal(mutationCount, 1, 'retry reads account state and must not submit deletion again')
})

test('deletion cancellation without a cancelled state cannot claim that deletion stopped', async t => {
  const f = await fixture(t)
  let cancels = 0
  await f.page.route('https://account.fixture.invalid/functions/**', async route => {
    const { action } = route.request().postDataJSON()
    if (action === 'cancel-deletion') cancels++
    await new Promise(resolve => setTimeout(resolve, 150))
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(action === 'get-account'
      ? { user: { id: USER_A.id, displayName: 'A', bio: '' }, sessions: [], policy: { status: 'deletion_pending' }, deletion: { scheduledFor: '2026-11-10T00:00:00Z' } } : { ok: true }) })
  })
  await f.load(); await untilIO(f.page, () => document.getElementById('account-state-title').textContent === 'Account deletion pending')
  await f.page.locator('#account-state-cancel').click()
  await untilIO(f.page, () => document.getElementById('status').textContent.length > 0 && !document.getElementById('account-state-retry').disabled)
  assert.equal(await f.page.locator('#status').getAttribute('data-error'), 'true', 'cancellation needs a confirmed cancelled state')
  assert.doesNotMatch(await f.page.locator('#status').innerText(), /deletion cancelled/i)
  assert.equal(await f.page.locator('#profile').isVisible(), false)
  await f.page.locator('#account-state-retry').click()
  await untilIO(f.page, () => document.getElementById('account-state-title').textContent === 'Account deletion pending')
  assert.equal(cancels, 1, 'retry must only read current deletion state')
})

test('an account read for a different UUID cannot populate the current profile', async t => {
  const f = await fixture(t)
  await f.page.route('https://account.fixture.invalid/functions/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ user: { id: USER_B.id, displayName: 'B', bio: 'other account' }, sessions: [], deletion: null }) }))
  await f.load(); await until(f.page, () => !document.getElementById('account-state-retry').disabled)
  assert.equal(await f.page.locator('#profile').isVisible(), false, 'response identity must match the current account UUID')
  assert.equal(await f.page.locator('#account-state-title').innerText(), 'Account temporarily unavailable')
  assert.equal(await f.page.evaluate(() => !!localStorage.getItem('sb-account-auth-token')), true)
})

test('a password reset response from the previous account cannot publish into the switched account', async t => {
  const f = await fixture(t)
  let release, started
  const held = new Promise(resolve => { release = resolve })
  const requested = new Promise(resolve => { started = resolve })
  const resetBodies = []
  await f.page.route('https://account.fixture.invalid/auth/v1/recover**', async route => {
    resetBodies.push(route.request().postDataJSON()); started(); await held
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
  await f.load(); await until(f.page, () => !document.getElementById('profile').hidden)
  await f.page.locator('#change-password').click(); await requested
  await f.page.evaluate(async () => { await window.__sdkClient.auth.signInWithPassword({ email: 'b@example.test', password: 'fixture-password' }) })
  await f.page.clock.runFor(0)
  await f.page.waitForFunction(() => document.getElementById('profile-email').textContent === 'b@example.test' && !document.getElementById('profile').hidden)
  release()
  await f.page.waitForFunction(() => !document.getElementById('change-password').disabled)
  assert.equal(await f.page.locator('#profile-email').innerText(), USER_B.email)
  assert.equal(await f.page.locator('#status').innerText(), '', 'old reset result must not claim delivery in the newer account view')
  assert.equal(resetBodies.length, 1)
  assert.equal(resetBodies[0].email, USER_A.email)
})

test('a late consent lookup failure cannot publish after logout', async t => {
  const f = await fixture(t, { query: '?authorization_id=fixture-consent' })
  let release, started
  const held = new Promise(resolve => { release = resolve })
  const requested = new Promise(resolve => { started = resolve })
  await f.page.route('https://account.fixture.invalid/auth/v1/oauth/authorizations/**', async route => {
    started(); await held
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'validation_failed', msg: 'synthetic expired authorization' }) })
  })
  const loaded = f.load()
  await requested
  await f.page.evaluate(async () => { await window.__sdkClient.auth.signOut({ scope: 'local' }) })
  await f.page.clock.runFor(0)
  await f.page.waitForFunction(() => !document.getElementById('auth').hidden)
  release(); await loaded
  await f.page.evaluate(() => new Promise(resolve => queueMicrotask(resolve)))
  assert.equal(await f.page.locator('#profile').isVisible(), false)
  assert.equal(await f.page.locator('#consent').isVisible(), false)
  assert.equal(await f.page.locator('#status').innerText(), '', 'an old consent error must not overwrite the signed-out view')
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
  const f = await fixture(t, { query: '?code=fixture-pkce&authorization_id=fixture-consent', responseDelayMs: 150 })
  await f.load(); await untilIO(f.page, () => !document.getElementById('consent').hidden)
  assert.equal(f.calls.some(call => call.grant === 'pkce'), true)
  assert.equal(new URL(f.page.url()).searchParams.get('code'), null)
  assert.equal(new URL(f.page.url()).searchParams.get('authorization_id'), 'fixture-consent')
  await f.page.reload(); await untilIO(f.page, () => !document.getElementById('consent').hidden)
  assert.equal(f.calls.filter(call => call.grant === 'pkce').length, 1)
})

for (const view of ['profile', 'consent']) test(`actual SDK peer logout immediately withdraws the other tab's ${view} through pending and complete cleanup`, async t => {
  const f = await fixture(t, { responseDelayMs: 150 })
  await f.load(); await untilIO(f.page, () => !document.getElementById('profile').hidden)
  const peer = await f.openPeer(view === 'consent' ? '?authorization_id=fixture-consent' : '')
  await untilIO(peer, () => !document.getElementById(location.search ? 'consent' : 'profile').hidden)
  const release = f.holdLogout()
  await f.page.locator('#logout').click()
  await peer.waitForFunction(() => localStorage.getItem('codevalanche-account-logout-intent') === 'pending')
  for (let i = 0; i < 3; i++) { await peer.clock.runFor(0); await new Promise(resolve => setTimeout(resolve, 10)) }
  assert.equal(await peer.locator(`#${view}`).isVisible(), false, 'peer must withdraw the account view while SDK logout is still pending')
  assert.equal(await peer.locator('#profile-form button[type=submit]').isEnabled(), false, 'peer profile mutations must be disabled immediately')
  release()
  await untilIO(f.page, () => document.getElementById('status').textContent === 'Signed out.')
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
  assert.equal(await peer.locator('#profile-form button[type=submit]').isEnabled(), false)
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
  await context.addInitScript(url => { window.CODEVALANCHE_CONFIG = { supabaseUrl: url, supabasePublishableKey: 'fixture-public', accountServer: 'v2' } }, origin)
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
      else setTimeout(() => response.end(JSON.stringify({ external: { google: false } })), 100)
    } else response.end('{}')
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  browserPromise ??= chromium.launch({ headless: true })
  const context = await (await browserPromise).newContext(), page = await context.newPage()
  t.after(async () => { await context.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  await context.addInitScript(url => { window.CODEVALANCHE_CONFIG = { supabaseUrl: url, supabasePublishableKey: 'fixture-public', accountServer: 'v2' } }, origin)
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
  // The retry uses real HTTP I/O; advancing fake time here could abort a healthy
  // response before the server has had time to send its body.
  const retryDeadline = Date.now() + 5000
  while (!await page.evaluate(() => document.getElementById('status').textContent.includes('Google sign-in is not available yet') && !document.getElementById('google-signin').disabled)) {
    assert.ok(Date.now() < retryDeadline, 'healthy Google settings retry must settle within five real seconds')
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  assert.equal(settingsRequests, 2, 'a new click must finish a fresh settings request after timeout')
})

test('operator consent preflight observes autoapproval before any browser provider details call',async t=>{
 const f=await fixture(t,{query:'?authorization_id=fixture-consent'});
 await f.page.route('https://account.fixture.invalid/functions/**',async route=>{
  const body=route.request().postDataJSON();if(body.action!=='operator.oauth.details')return route.fallback();
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({apiVersion:2,ok:true,requestId:body.requestId,data:{operator:true,redirect_url:f.origin+'/api/operator-test-callback?code=synthetic'}})});
 });
 await f.page.route(f.origin+'/api/operator-test-callback?code=synthetic',route=>route.fulfill({status:200,body:'Callback reached'}));
 await f.load();await f.page.waitForURL('**/api/operator-test-callback?code=synthetic');
 assert.equal(f.calls.some(c=>c.path.includes('/oauth/authorizations/')),false);
});

test('operator manual approval stays server mediated',async t=>{
 const f=await fixture(t,{query:'?authorization_id=fixture-consent'});let approve=0;
 await f.page.route('https://account.fixture.invalid/functions/**',async route=>{
  const body=route.request().postDataJSON();if(!body.action.startsWith('operator.oauth.'))return route.fallback();
  if(body.action==='operator.oauth.approve')approve++;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({apiVersion:2,ok:true,requestId:body.requestId,data:body.action==='operator.oauth.details'?{operator:true,client:{name:'Company OS'},scope:'openid email profile'}:{operator:true,redirect_url:f.origin+'/api/operator-test-callback?code=synthetic'}})});
 });
 await f.page.route(f.origin+'/api/operator-test-callback?code=synthetic',route=>route.fulfill({status:200,body:'Callback reached'}));
 await f.load();await f.page.locator('#consent').waitFor({state:'visible'});await f.page.locator('#approve').click();await f.page.waitForURL('**/api/operator-test-callback?code=synthetic');
 assert.equal(approve,1);assert.equal(f.calls.some(c=>c.path.includes('/oauth/authorizations/')),false);
});

test('failed operator preflight cannot fall back to browser autoapproval',async t=>{
 const f=await fixture(t,{query:'?authorization_id=fixture-consent'});
 await f.page.route('https://account.fixture.invalid/functions/**',async route=>{
  const body=route.request().postDataJSON();if(body.action!=='operator.oauth.details')return route.fallback();
  await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({apiVersion:2,ok:false,requestId:body.requestId,error:{code:'account_service_unavailable'}})});
 });
 await f.load();await f.page.waitForFunction(()=>document.getElementById('status').textContent.includes('connection request'));
 assert.equal(await f.page.locator('#consent').isVisible(),false);assert.equal(f.calls.some(c=>c.path.includes('/oauth/authorizations/')),false);
});

test('actual authorize page exposes parent MFA and resumes consent after a rejected code and a valid retry',async t=>{
 const f=await fixture(t,{query:'?authorization_id=fixture-consent',authorizePage:true});let parentVerified=false,verifyCalls=0,providerDetails=0;
 await f.page.route('https://account.fixture.invalid/functions/**',async route=>{
  const body=route.request().postDataJSON();if(body.action!=='operator.oauth.details')return route.fallback();
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({apiVersion:2,ok:true,requestId:body.requestId,data:parentVerified?{operator:true,client:{name:'Company OS'},scope:'openid'}:{operator:true,parentMfaRequired:true}})});
 });
 await f.page.route('https://account.fixture.invalid/auth/v1/user',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...USER_A,factors:[{id:'fixture-factor',factor_type:'totp',status:'verified'}]})}));
 await f.page.route('https://account.fixture.invalid/auth/v1/oauth/authorizations/**',async route=>{providerDetails++;return route.fallback()});
 await f.page.route('https://account.fixture.invalid/auth/v1/factors/**',async route=>{
  const isVerify=route.request().url().endsWith('/verify');if(isVerify)verifyCalls++;
  if(isVerify&&verifyCalls===1)return route.fulfill({status:400,contentType:'application/json',headers:{'x-supabase-api-version':'2024-01-01','access-control-expose-headers':'x-supabase-api-version'},body:JSON.stringify({code:'mfa_verification_failed',msg:'Synthetic wrong code'})});
  if(isVerify)parentVerified=true;
  return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(isVerify?sessionFor(USER_A):{id:'fixture-challenge'})});
 });
 await f.load();assert.equal(await f.page.locator('#authenticator-section').count(),1);
 await f.page.locator('#mfa-step-up').waitFor({state:'visible'});assert.equal(await f.page.locator('#consent').isVisible(),false);assert.equal(providerDetails,0);
 await f.page.locator('#mfa-step-up').click();await f.page.locator('#mfa-code').fill('000000');await f.page.locator('#mfa-form button[type=submit]').click();
 try{await until(f.page,()=>document.getElementById('status').textContent.includes('could not be verified'))}catch{throw new Error(`MFA retry status: ${await f.page.locator('#status').textContent()}; verify calls ${verifyCalls}`)}assert.equal(await f.page.locator('#consent').isVisible(),false);
 await f.page.locator('#mfa-code').fill('123456');await f.page.locator('#mfa-form button[type=submit]').click();await f.page.locator('#consent').waitFor({state:'visible'});
 assert.equal(verifyCalls,2);assert.equal(providerDetails,0);assert.equal(new URL(f.page.url()).searchParams.get('authorization_id'),'fixture-consent');
});

for(const authorizePage of [false,true])test(`${authorizePage?'authorize':'main social callback'} enrollment explains the credential change and offers explicit sign-in again without losing the request`,async t=>{
 const f=await fixture(t,{query:'?authorization_id=fixture-consent',authorizePage});let enrolled=false,freshPrimary=false,parentVerified=false;
 await f.page.route('https://account.fixture.invalid/functions/**',async route=>{
  const body=route.request().postDataJSON();if(body.action!=='operator.oauth.details')return route.fallback();
  const stale=enrolled&&!freshPrimary;
  await route.fulfill({status:stale?401:200,contentType:'application/json',body:JSON.stringify(stale?{apiVersion:2,ok:false,requestId:body.requestId,error:{code:'reauthentication_required'}}:{apiVersion:2,ok:true,requestId:body.requestId,data:parentVerified?{operator:true,client:{name:'Company OS'},scope:'openid'}:{operator:true,parentMfaRequired:true}})});
 });
 await f.page.route('https://account.fixture.invalid/auth/v1/token**',async route=>{freshPrimary=true;return route.fallback()});
 await f.page.route('https://account.fixture.invalid/auth/v1/user',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...USER_A,factors:enrolled?[{id:'fixture-factor',factor_type:'totp',status:'verified'}]:[]})}));
 await f.page.route('https://account.fixture.invalid/auth/v1/factors**',async route=>{
  const path=new URL(route.request().url()).pathname;
  let data;if(path.endsWith('/verify')){if(freshPrimary)parentVerified=true;enrolled=true;data=sessionFor(USER_A)}else if(path.endsWith('/challenge'))data={id:'fixture-challenge'};else data={id:'fixture-factor',totp:{secret:'synthetic-enrollment-secret'}};
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
 });
 await f.load();await f.page.locator('#authenticator-add').waitFor({state:'visible'});await f.page.locator('#authenticator-add').click();await f.page.locator('#mfa-code').fill('123456');await f.page.locator('#mfa-form button[type=submit]').click();
 await f.page.locator('#operator-reauth').waitFor({state:'visible'});assert.match(await f.page.locator('#account-state-description').textContent(),/security settings changed/i);assert.doesNotMatch(await f.page.locator('#status').textContent(),/Verify again with a new code/);
 await f.page.locator('#operator-reauth').click();await f.page.locator('#auth').waitFor({state:'visible'});assert.equal(new URL(f.page.url()).searchParams.get('authorization_id'),'fixture-consent');
 await f.page.locator('#email').fill(USER_A.email);await f.page.locator('#password').fill('fixture-password');await f.page.locator('#auth-submit').click();await f.page.locator('#mfa-step-up').waitFor({state:'visible'});
 await f.page.locator('#mfa-step-up').click();await f.page.locator('#mfa-code').fill('123456');await f.page.locator('#mfa-form button[type=submit]').click();await f.page.locator('#consent').waitFor({state:'visible'});assert.equal(parentVerified,true);
});
