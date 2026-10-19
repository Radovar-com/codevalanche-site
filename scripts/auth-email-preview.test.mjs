import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { parse } from 'parse5'
import {
  OWNERSHIP_MARKER, PREVIEW_FILENAMES, assertOwnedOutput, buildPreviewPages,
  evaluateTemplate, parsePreviewArguments, previewOutputPath, renderPreview,
  startPreviewServer, syntheticFixture, PREVIEW_LOGO_PATH, PREVIEW_LOGO_DARK_PATH,
} from './auth-email-preview.mjs'

test('preview fixtures stay synthetic and reject credentials or arbitrary confirmation URLs', () => {
  const fixture = syntheticFixture('ro')
  assert.deepEqual(Object.keys(fixture).sort(), ['ConfirmationURL', 'Data', 'Email', 'NewEmail', 'Token'])
  assert.equal(fixture.ConfirmationURL, 'https://example.invalid/preview/confirmation')
  for (const overrides of [
    { password: 'unsafe' }, { access_token: 'unsafe' }, { Data: { locale: 'ro', secret: 'unsafe' } },
    { Email: 'person@real.test' }, { ConfirmationURL: 'https://project.supabase.co/auth/v1/verify' },
    { ConfirmationURL: 'javascript:alert(1)' }, { Token: 'real-token' },
  ]) assert.throws(() => syntheticFixture('en', overrides), /fixture/)
})

test('strict evaluator supports repeated locale branches and HTML escaping without reparsing values', () => {
  const html = evaluateTemplate('{{ $locale := printf "%v" .Data.locale }}{{ if eq $locale "ro" }}RO{{ else }}EN{{ end }}|{{ if eq $locale "ro" }}doi{{ else }}two{{ end }}|{{ .Email }}',
    syntheticFixture('ro', { Email: '<b>"\'&+{{ .Token }}@example.invalid' }))
  assert.equal(html, 'RO|doi|&lt;b&gt;&#34;&#39;&amp;&#43;{{ .Token }}@example.invalid')
  assert.equal(renderPreview('confirmation', 'unexpected'), renderPreview('confirmation', 'en'))
})

test('strict evaluator rejects unknown actions and malformed control flow even in inactive branches', () => {
  for (const template of [
    '{{ .Password }}', '{{ .Email', '{{ }}', '{{ if eq $locale "ro" }}x{{ end }}',
    '{{ $locale := printf "%v" .Data.locale }}{{ if eq $locale "ro" }}{{ fetch "https://example.com" }}{{ end }}',
    '{{ else }}', '{{ end }}', '{{ $locale := printf "%v" .Data.locale }}{{ if eq $locale "ro" }}x',
    '{{ $locale := printf "%v" .Data.locale }}{{ if eq $locale "ro" }}x{{ else }}y{{ else }}z{{ end }}',
    '{{ $locale := printf "%v" .Data.locale }}{{ if eq $locale "ro" }}x{{ else }}y{{ else if eq $locale "en" }}z{{ end }}',
  ]) assert.throws(() => evaluateTemplate(template, syntheticFixture()), /template/)
})

test('gallery contains exactly six English mail pages and one passive index', () => {
  const pages = buildPreviewPages()
  assert.deepEqual([...pages.keys()].sort(), [...PREVIEW_FILENAMES].sort())
  assert.equal(pages.size, 7)
  for (const [name, html] of pages) {
    assert.ok(html.includes(OWNERSHIP_MARKER), name)
    assert.doesNotMatch(html, /<script\b|<form\b|\son\w+\s*=/i)
  }
  assert.match(pages.get('index.html'), /sandbox=""/)
  assert.match(pages.get('index.html'), /320px/)
  assert.match(pages.get('index.html'), /390px/)
  assert.match(pages.get('index.html'), /600px/)
  assert.doesNotMatch(pages.get('index.html'), /-ro\.html|Romanian|long reserved addresses|>RO</)
  assert.match(pages.get('index.html'), /src="confirmation-en.html"/)
})

test('email-change gallery uses readable reserved examples while long-address stress stays in tests', () => {
  const html = buildPreviewPages().get('email_change-en.html')
  const nodes = node => [node, ...(node.childNodes || []).flatMap(nodes)]
  const text = nodes(parse(html)).filter(node => node.nodeName === '#text').map(node => node.value).join(' ')
  const addresses = text.match(/[a-z-]+@(?:[a-z-]+\.)?example\.invalid/g) || []
  assert.equal(addresses.length, 2)
  for (const address of addresses) {
    const [local, domain] = address.split('@')
    assert.ok(local.length < 20)
    assert.equal(domain, 'example.invalid')
    assert.equal(syntheticFixture('en', { Email: address }).Email, address)
  }
  assert.doesNotMatch(html, /<script\b/i)
  const longEmail = `original-${'a'.repeat(55)}@preview-${'x'.repeat(55)}.example.invalid`
  assert.ok(renderPreview('email_change', 'en', {Email: longEmail}).includes(longEmail))
})

test('output and argument guards refuse arbitrary paths, hosts and unrelated file replacement', () => {
  assert.match(previewOutputPath('index.html').replaceAll('\\', '/'), /\/\.superpowers\/auth-email-preview-20261018\/index\.html$/)
  for (const name of ['../index.html', 'unrelated.html', 'confirmation-en.html/else', 'C:/secret']) {
    assert.throws(() => previewOutputPath(name), /filename/)
  }
  assert.equal(assertOwnedOutput('index.html', null), true)
  assert.equal(assertOwnedOutput('index.html', { regular: true, symlink: false, text: OWNERSHIP_MARKER }), true)
  for (const existing of [
    { regular: true, symlink: false, text: 'unrelated' },
    { regular: false, symlink: true, text: OWNERSHIP_MARKER },
    { regular: false, symlink: false, text: OWNERSHIP_MARKER },
  ]) assert.throws(() => assertOwnedOutput('index.html', existing), /output/)
  assert.deepEqual(parsePreviewArguments(['--serve', '--port', '4196']), { serve: true, port: 4196, help: false })
  for (const args of [['--host', '0.0.0.0'], ['--url', 'https://example.com'], ['--output', 'elsewhere'], ['--port', 'bad'], ['--port', '80'], ['--serve', '--serve']]) {
    assert.throws(() => parsePreviewArguments(args), /argument/)
  }
})

function request(port, path, { method = 'GET', host = `127.0.0.1:${port}` } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: { host } }, (res) => {
      const chunks = []
      res.on('data', chunk => { chunks.push(chunk) })
      res.on('end', () => { const bytes = Buffer.concat(chunks); resolve({ status: res.statusCode, headers: res.headers, body:bytes.toString('utf8'), bytes }) })
    })
    req.on('error', reject)
    req.end()
  })
}

test('loopback server serves fixed in-memory routes, forbids mutation/traversal and hostile Host', async () => {
  await assert.rejects(startPreviewServer({ port: 0, host: '0.0.0.0' }), /server/)
  const running = await startPreviewServer({ port: 0 })
  try {
    assert.equal(running.server.address().address, '127.0.0.1')
    const port = running.server.address().port
    const index = await request(port, '/')
    assert.equal(index.status, 200)
    assert.match(index.headers['content-security-policy'], /script-src 'none'/)
    assert.equal(index.headers['cache-control'], 'no-store')
    assert.match(index.headers['content-security-policy'], /img-src 'self'/)
    const logo = await request(port, PREVIEW_LOGO_PATH)
    assert.equal(logo.status, 200)
    assert.equal(logo.headers['content-type'], 'image/png')
    assert.deepEqual([...logo.bytes.subarray(0,8)], [137,80,78,71,13,10,26,10])
    assert.equal((await request(port, PREVIEW_LOGO_PATH, {method:'HEAD'})).bytes.length, 0)
    assert.equal((await request(port, PREVIEW_LOGO_PATH+'?extra=1')).status, 404)
    const darkLogo = await request(port, PREVIEW_LOGO_DARK_PATH)
    assert.equal(darkLogo.status, 200)
    assert.equal(darkLogo.headers['content-type'], 'image/png')
    assert.deepEqual([...darkLogo.bytes.subarray(0,8)], [137,80,78,71,13,10,26,10])
    const mail = await request(port, '/email_change-en.html')
    assert.equal(mail.status, 200)
    assert.match(mail.body, /Confirm your new email/)
    assert.equal((await request(port, '/confirmation-ro.html')).status, 404)
    assert.equal((await request(port, '/confirmation-en.html', { method: 'HEAD' })).body, '')
    assert.equal((await request(port, '/', { method: 'POST' })).status, 405)
    assert.equal((await request(port, '/', { host: 'attacker.invalid' })).status, 403)
    for (const path of ['/../package.json', '/%2e%2e/package.json', '/confirmation-en.html?secret=x', '//example.com/', '/unknown.html', 'https://example.com/']) {
      assert.notEqual((await request(port, path)).status, 200, path)
    }
  } finally { await running.close() }
})
