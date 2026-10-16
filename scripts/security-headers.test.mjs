import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { SECURITY_HEADERS, headersFile, withSecurityHeaders, pageContentSecurityPolicy } from '../cloudflare/security-headers.mjs'
import { addContentSecurityPolicyMeta, inlineScriptHashes, publicConfigValue } from './page-csp.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'src')
const config = readFileSync(path.join(src, 'config.js'), 'utf8')
function pages(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) return name === 'partials' ? [] : pages(full)
    return name.endsWith('.html') ? [full] : []
  })
}
const directive = (policy, name) => policy.split(/;\s*/).find(d => d.startsWith(`${name} `))?.split(' ').slice(1) ?? null

test('headers for Cloudflare: HSTS, no framing, no sniffing', () => {
  assert.match(SECURITY_HEADERS['Strict-Transport-Security'], /^max-age=31536000/)
  assert.deepEqual(directive(SECURITY_HEADERS['Content-Security-Policy'], 'frame-ancestors'), ["'none'"])
  assert.equal(SECURITY_HEADERS['X-Frame-Options'], 'DENY')
  assert.equal(SECURITY_HEADERS['X-Content-Type-Options'], 'nosniff')
  // The header policy must not restrict scripts: the per-page meta policy owns that,
  // and two script policies would intersect and block the hashed inline scripts.
  assert.equal(directive(SECURITY_HEADERS['Content-Security-Policy'], 'script-src'), null)
  const file = headersFile()
  assert.match(file, /^\/\*$/m)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.ok(file.includes(`  ${name}: ${value}\n`), name)
})

test('the Worker keeps the origin response and adds the headers', async () => {
  const response = withSecurityHeaders(new Response('hello', { status: 404, headers: { 'content-type': 'text/plain', 'x-origin': '1' } }))
  assert.equal(response.status, 404)
  assert.equal(await response.text(), 'hello')
  assert.equal(response.headers.get('x-origin'), '1')
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(response.headers.get(name), value)
  const worker = readFileSync(path.join(root, 'cloudflare/worker.mjs'), 'utf8')
  assert.match(worker, /withSecurityHeaders\(await fetch\(request\)\)/)
  const wrangler = readFileSync(path.join(root, 'cloudflare/wrangler.toml'), 'utf8')
  assert.match(wrangler, /^main = "worker\.mjs"$/m)
  assert.match(wrangler, /^workers_dev = false$/m)
  assert.doesNotMatch(wrangler, /^\s*\[vars\]|api_token|secret\s*=|account_id\s*=\s*"[0-9a-f]{32}"/m, 'no secrets or account ids in wrangler config')
})

test('every page gets a meta CSP that allows exactly its own inline scripts', () => {
  const supabaseUrl = publicConfigValue(config, 'supabaseUrl')
  assert.match(supabaseUrl, /^https:\/\//)
  const all = pages(src)
  assert.ok(all.length >= 8, `${all.length} pages`)
  for (const file of all) {
    const relative = path.relative(src, file).split(path.sep).join('/')
    const html = readFileSync(file, 'utf8')
    const out = addContentSecurityPolicyMeta(html, { relative, supabaseUrl, apiOrigin: '' })
    const metas = [...out.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/g)]
    assert.equal(metas.length, 1, relative)
    assert.ok(out.indexOf(metas[0][0]) < out.search(/<script/) || !/<script/.test(out), `${relative}: CSP comes before any script`)
    const policy = metas[0][1]
    const scripts = directive(policy, 'script-src')
    assert.ok(!scripts.includes("'unsafe-inline'") && !scripts.includes("'unsafe-eval'"), relative)
    for (const hash of inlineScriptHashes(html)) assert.ok(scripts.includes(`'sha256-${hash}'`), `${relative}: inline script allowed by hash`)
    assert.deepEqual(directive(policy, 'object-src'), ["'none'"])
    const account = relative.startsWith('account/') || relative === 'account.html'
    if (account) {
      assert.ok(scripts.includes('https://challenges.cloudflare.com'), `${relative}: Turnstile script`)
      assert.deepEqual(directive(policy, 'frame-src'), ['https://challenges.cloudflare.com'])
      assert.deepEqual(directive(policy, 'connect-src'), ["'self'", new URL(supabaseUrl).origin])
      assert.deepEqual(directive(policy, 'style-src'), ["'self'"])
    } else {
      assert.ok(directive(policy, 'connect-src').includes("'self'"))
      assert.deepEqual(directive(policy, 'frame-src'), ["'none'"])
    }
  }
})

test('the build writes the meta CSP into every page and _headers only on request', () => {
  const build = readFileSync(path.join(root, 'scripts/build.mjs'), 'utf8')
  assert.match(build, /addContentSecurityPolicyMeta\(html, \{ relative, supabaseUrl, apiOrigin \}\)/)
  assert.match(build, /CODEVALANCHE_HEADERS_FILE === "1"/)
  assert.throws(() => addContentSecurityPolicyMeta('<html><head></head></html>', { relative: 'x.html' }), /charset/)
  // Line endings do not change the hash: the browser parser normalizes them first.
  assert.deepEqual(inlineScriptHashes('<script>\r\na()\r\n</script>'), inlineScriptHashes('<script>\na()\n</script>'))
  // A configured API origin for website events is allowed; a non-HTTPS one is not.
  const withApi = pageContentSecurityPolicy({ account: false, apiOrigin: 'https://api.example.test/path' })
  assert.ok(directive(withApi, 'connect-src').includes('https://api.example.test'))
  assert.ok(!directive(pageContentSecurityPolicy({ account: false, apiOrigin: 'http://evil.test' }), 'connect-src').includes('http://evil.test'))
})
