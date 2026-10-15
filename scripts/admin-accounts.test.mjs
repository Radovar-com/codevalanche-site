import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { build } from 'esbuild'
import { chromium } from 'playwright'
import { prepareAccountCommand, projectAdminOperation, projectAdminUser } from '../src/admin-accounts/adminAccountModel.js'

const A = '11111111-1111-4111-8111-111111111111', B = '22222222-2222-4222-8222-222222222222'
const ACTOR = '33333333-3333-4333-8333-333333333333', OP = '44444444-4444-4444-8444-444444444444'
const fields = { userId: A, operationId: OP, reasonCode: 'support_request', reason: 'Synthetic local review', until: null }
const operator = { role: 'accounts_admin', userId: ACTOR }

test('account command preparation preserves UUID and existing fields without enabling submission', () => {
  const draft = prepareAccountCommand('admin.account.suspend', fields, operator)
  assert.equal(draft.submission, 'unavailable')
  assert.equal(draft.authOutcome, 'unknown')
  assert.deepEqual(draft.fields, fields)
  assert.throws(() => prepareAccountCommand('admin.account.suspend', { ...fields, userId: 'alice' }, operator), /invalid_fields/)
  assert.throws(() => prepareAccountCommand('admin.account.suspend', fields, { ...operator, role: 'support_readonly' }), /administrator_required/)
  assert.throws(() => prepareAccountCommand('admin.account.suspend', { ...fields, userId: ACTOR }, operator), /account_forbidden/)
})

test('limit and deletion drafts use existing service fields and preserve local files', () => {
  const limits = { enabled: false, maxHosts: 3, maxControllers: 5, maxConcurrentRuns: 2 }
  const limited = prepareAccountCommand('admin.limits.update', { ...fields, limits }, operator)
  assert.deepEqual(limited.fields, { userId: A, operationId: OP, reasonCode: fields.reasonCode, reason: fields.reason, limits })
  const deletion = prepareAccountCommand('admin.deletion.request', { ...fields, confirmation: 'DELETE' }, operator)
  assert.deepEqual(deletion.fields, { userId: A, operationId: OP, confirmation: 'DELETE' })
  assert.equal(deletion.localFilesTouched, false)
  assert.throws(() => prepareAccountCommand('admin.deletion.request', fields, operator), /confirmation_required/)
})

test('completed admin records never establish completed Auth effects and contradictory identities are refused', () => {
  for (const [state, phase] of [['pending', 'pending'], ['completed', 'unknown'], ['failed', 'rejected']]) {
    const result = projectAdminOperation({ operationId: OP, userId: A, action: 'admin.account.suspend', state }, { operationId: OP, userId: A, action: 'admin.account.suspend' })
    assert.equal(result.phase, phase)
    assert.equal(result.authOutcome, 'unknown')
    assert.doesNotMatch(result.message, /successfully banned|Auth confirmed|account deleted/i)
  }
  assert.throws(() => projectAdminOperation({ operationId: OP, userId: B, action: 'admin.account.suspend', state: 'completed' }, { operationId: OP, userId: A, action: 'admin.account.suspend' }), /response_invalid/)
})

test('admin readout projects only public limit fields and rejects malformed deletion state', () => {
  const account = { user: { id: A, displayName: 'Alice', email: 'a@example.test' }, policy: { status: 'active', limits: { enabled: false, maxHosts: 3, maxControllers: 5, maxConcurrentRuns: 2, internalDetails: 'synthetic private field' } }, deletion: null }
  assert.deepEqual(Object.keys(projectAdminUser(account, A).policy.limits), ['enabled', 'maxHosts', 'maxControllers', 'maxConcurrentRuns'])
  assert.throws(() => projectAdminUser({ ...account, deletion: { status: 'completed', scheduledFor: '2026-10-15T00:00:00Z' } }, A), /response_invalid/)
})

let browserPromise, bundlePromise
after(async () => { if (browserPromise) await (await browserPromise).close() })
async function fixture(t, { enabled = true, role = 'accounts_admin' } = {}) {
  bundlePromise ??= build({ stdin: { contents: "import { mountAdminAccounts } from './src/admin-accounts/adminAccounts.js'; window.panel = mountAdminAccounts({host:document.getElementById('host'),...window.fixtureConfig})", resolveDir: process.cwd() }, bundle: true, write: false, format: 'esm', target: 'es2022' }).then(result => result.outputFiles[0].text)
  const [source, css] = await Promise.all([bundlePromise, readFile('src/admin-accounts/adminAccounts.css', 'utf8')])
  const server = createServer((request, response) => {
    if (request.url === '/panel.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(source) }
    else if (request.url === '/panel.css') { response.setHeader('Content-Type', 'text/css'); response.end(css) }
    else { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/panel.css"><main id="host"></main><script type="module" src="/panel.js"></script>') }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  browserPromise ??= chromium.launch({ headless: true })
  const context = await (await browserPromise).newContext(), page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  t.after(async () => { await context.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); assert.deepEqual(pageErrors, [], 'mounted admin panel has no page errors') })
  await context.addInitScript(({ enabled, role, A, B, ACTOR, OP }) => {
    const user = id => ({ user: { id, displayName: id === A ? 'Alice' : 'Bob', email: id === A ? 'a@example.test' : 'b@example.test' }, policy: { status: id === A && state.deletionJob ? 'deletion_pending' : 'active', limits: { enabled: false, maxHosts: 3, maxControllers: 5, maxConcurrentRuns: 2 } }, sessions: [], sessionSummary: { activeCount: 0 }, deletion: id === A && state.deletionJob ? { jobId: state.deletionJob, status: 'pending', scheduledFor: '2026-10-15T00:00:00Z' } : null })
    const state = window.fixtureState = { calls: [], selectedInsights: null, heldUser: null, release: null, operationState: 'completed', failOperation: false, failInsights: false, deletionJob: null }
    window.fixtureConfig = { enabled, insightsWindow: { from: '2026-10-01T00:00:00Z', to: '2026-10-13T00:00:00Z', timeZone: 'Europe/Bucharest' }, onInsights: async params => { if (state.failInsights) throw new Error('synthetic host callback failure'); state.selectedInsights = params }, request: async (action, fields) => {
      state.calls.push({ action, fields })
      if (action === 'admin.operator.session') return { role, principal: { userId: ACTOR } }
      if (action === 'admin.users.list') return { users: [user(A), user(B)], pagination: { nextCursor: null, hasMore: false, limit: 50 }, coverage: { source: 'supabase_auth', total: null } }
      if (action === 'admin.users.detail') { if (state.heldUser === fields.userId) await new Promise(resolve => { state.release = resolve }); return user(fields.userId) }
      if (action === 'admin.operations.get') { if (state.failOperation) throw { code: 'account_service_unavailable', message: '<img private auth details>' }; return { operationId: OP, userId: A, action: 'admin.account.suspend', state: state.operationState } }
      if (action === 'admin.deletion.get') return { jobId: state.deletionJob, userId: A, state: 'completed', localFilesTouched: false }
      throw new Error('unexpected operation')
    } }
  }, { enabled, role, A, B, ACTOR, OP })
  await page.goto(`http://127.0.0.1:${server.address().port}/`)
  await page.evaluate(async () => { await window.panel.ready })
  return { page }
}

test('admin mount defaults to OFF and makes no request without explicit enablement', async t => {
  const { page } = await fixture(t, { enabled: false })
  assert.equal(await page.evaluate(() => window.fixtureState.calls.length), 0)
  assert.match(await page.locator('#host').innerText(), /administration is off/i)
})

test('operator directory and selected account link to SOL8 while commands remain preparation only', async t => {
  const { page } = await fixture(t)
  await page.getByRole('button', { name: 'Alice', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('[data-admin=selected-id]')?.textContent === '11111111-1111-4111-8111-111111111111')
  await page.getByRole('button', { name: 'View source insights' }).click()
  assert.deepEqual(await page.evaluate(() => window.fixtureState.selectedInsights), { userId: A, from: '2026-10-01T00:00:00Z', to: '2026-10-13T00:00:00Z', timeZone: 'Europe/Bucharest' })
  await page.getByLabel('Reason code', { exact: true }).fill('support_request'); await page.getByLabel('Reason', { exact: true }).fill('Synthetic local review')
  await page.getByRole('button', { name: 'Prepare request' }).click()
  assert.match(await page.locator('[data-admin=draft]').innerText(), /not submitted/i)
  assert.deepEqual(await page.evaluate(() => window.fixtureState.calls.map(call => call.action)), ['admin.operator.session', 'admin.users.list', 'admin.users.detail'])
  await page.setViewportSize({ width: 390, height: 844 })
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
  await page.screenshot({ path: 'D:/Codevalanche-Users-Builds-20261011/users-remainders-20261013/SOL7-admin-390.png', fullPage: true })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.screenshot({ path: 'D:/Codevalanche-Users-Builds-20261011/users-remainders-20261013/SOL7-admin-1280.png', fullPage: true })
})

test('support role can inspect an account and cannot prepare account mutations', async t => {
  const { page } = await fixture(t, { role: 'support_readonly' })
  await page.getByRole('button', { name: 'Alice', exact: true }).click()
  await page.waitForSelector('[data-admin=selected-id]')
  assert.equal(await page.getByRole('button', { name: 'Prepare request' }).isEnabled(), false)
})

test('a failed SOL8 host callback is observable without an unhandled page exception', async t => {
  const { page } = await fixture(t)
  await page.evaluate(async () => { await window.panel.select('11111111-1111-4111-8111-111111111111'); window.fixtureState.failInsights = true })
  await page.getByRole('button', { name: 'View source insights' }).click()
  await page.evaluate(() => new Promise(resolve => queueMicrotask(resolve)))
  assert.match(await page.locator('#host').innerText(), /Source insights could not be opened/)
  assert.doesNotMatch(await page.locator('#host').innerText(), /synthetic host callback failure/)
})

test('late account detail cannot replace a newer UUID selection and destroy withdraws the view', async t => {
  const { page } = await fixture(t)
  await page.evaluate(() => { window.fixtureState.heldUser = '11111111-1111-4111-8111-111111111111'; void window.panel.select(window.fixtureState.heldUser) })
  await page.waitForFunction(() => window.fixtureState.release !== null)
  await page.evaluate(async () => { await window.panel.select('22222222-2222-4222-8222-222222222222'); window.fixtureState.release() })
  await page.waitForFunction(() => document.querySelector('[data-admin=selected-id]')?.textContent === '22222222-2222-4222-8222-222222222222')
  assert.match(await page.locator('[data-admin=detail]').innerText(), /Bob/)
  await page.evaluate(() => window.panel.destroy())
  assert.equal(await page.locator('#host').innerText(), '')
})

test('completed and unavailable operation reads stay unconfirmed without an automatic retry', async t => {
  const { page } = await fixture(t)
  await page.clock.install()
  await page.evaluate(async () => { await window.panel.select('11111111-1111-4111-8111-111111111111'); await window.panel.observeOperation({ operationId: '44444444-4444-4444-8444-444444444444', userId: '11111111-1111-4111-8111-111111111111', action: 'admin.account.suspend' }) })
  assert.match(await page.locator('[data-admin=operation]').innerText(), /Auth outcome remains unconfirmed/i)
  await page.evaluate(async () => { window.fixtureState.failOperation = true; await window.panel.observeOperation({ operationId: '44444444-4444-4444-8444-444444444444', userId: '11111111-1111-4111-8111-111111111111', action: 'admin.account.suspend' }) })
  assert.match(await page.locator('[data-admin=operation]').innerText(), /unconfirmed/i)
  assert.doesNotMatch(await page.locator('#host').innerText(), /private auth|<img/)
  await page.clock.runFor(60000)
  assert.equal(await page.evaluate(() => window.fixtureState.calls.filter(call => call.action === 'admin.operations.get').length), 2)
  assert.equal(await page.evaluate(() => window.fixtureState.calls.some(call => ['admin.account.suspend', 'admin.account.reactivate', 'admin.limits.update', 'admin.deletion.request'].includes(call.action))), false)
})

test('deletion progression reads the selected canonical job and never declares provider erasure complete', async t => {
  const { page } = await fixture(t)
  await page.evaluate(async () => { window.fixtureState.deletionJob = '55555555-5555-4555-8555-555555555555'; await window.panel.select('11111111-1111-4111-8111-111111111111') })
  await page.getByRole('button', { name: 'Check deletion status' }).click()
  await page.waitForSelector('[data-admin=operation]')
  assert.match(await page.locator('[data-admin=operation]').innerText(), /record: completed.*Auth outcome remains unconfirmed/)
  assert.match(await page.locator('[data-admin=operation]').innerText(), /Local projects are preserved/)
  assert.deepEqual(await page.evaluate(() => window.fixtureState.calls.filter(call => call.action === 'admin.deletion.get')), [{ action: 'admin.deletion.get', fields: { jobId: '55555555-5555-4555-8555-555555555555', userId: A } }])
  assert.equal(await page.evaluate(() => window.fixtureState.calls.some(call => call.action === 'admin.deletion.request')), false)
})

test('built standalone admin entry defaults OFF with local modules and no provider requests', async t => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: process.cwd() })
  const assetRoot = path.resolve('dist/admin-accounts')
  const server = createServer(async (request, response) => {
    try {
      const name = new URL(request.url, 'http://127.0.0.1').pathname.split('/').at(-1) || 'index.html'
      if (!['index.html', 'page.js', 'adminAccounts.js', 'adminAccountModel.js', 'adminAccounts.css'].includes(name)) { response.writeHead(404); response.end(); return }
      const content = await readFile(path.join(assetRoot, name))
      response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html'); response.end(content)
    } catch { response.writeHead(404); response.end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  browserPromise ??= chromium.launch({ headless: true })
  const context = await (await browserPromise).newContext(), page = await context.newPage(), external = [], errors = []
  page.on('pageerror', error => errors.push(error.message))
  await context.route('**/*', route => { if (new URL(route.request().url()).hostname !== '127.0.0.1') { external.push('external request'); return route.abort() }; return route.continue() })
  t.after(async () => { await context.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) })
  await page.goto(`http://127.0.0.1:${server.address().port}/admin-accounts/`)
  await page.getByRole('heading', { name: 'Account administration', exact: true }).waitFor()
  assert.match(await page.locator('#admin-accounts').innerText(), /administration is off/i)
  assert.deepEqual(external, [])
  assert.deepEqual(errors, [])
})
