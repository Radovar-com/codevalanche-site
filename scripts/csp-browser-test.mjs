// Loads every built page in Chromium and fails on any Content Security Policy
// violation. Run after `npm run build`:  node scripts/csp-browser-test.mjs
// Supabase is faked; nothing leaves the machine.
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import assert from 'node:assert/strict'

const dist = path.join(process.cwd(), 'dist')
async function pages(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return (await Promise.all(entries.map(e => e.isDirectory() ? (e.name === 'partials' ? [] : pages(path.join(dir, e.name))) : [e.name.endsWith('.html') ? path.join(dir, e.name) : null]))).flat().filter(Boolean)
}
const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.html': 'text/html' }
const server = createServer(async (req, res) => {
  try {
    const name = new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html')
    const data = await readFile(path.join(dist, name))
    res.setHeader('Content-Type', types[path.extname(name)] || 'application/octet-stream')
    res.end(data)
  } catch { res.statusCode = 404; res.end() }
}).listen(0, '127.0.0.1')
await new Promise(r => server.once('listening', r))
const base = `http://127.0.0.1:${server.address().port}`
const browser = await chromium.launch({ headless: true })
const checked = []
try {
  for (const file of await pages(dist)) {
    const relative = path.relative(dist, file).split(path.sep).join('/')
    const page = await browser.newPage()
    const violations = [], errors = []
    page.on('console', m => { if (/Content Security Policy/i.test(m.text())) violations.push(m.text()) })
    page.on('pageerror', e => errors.push(e.message))
    await page.addInitScript(() => document.addEventListener('securitypolicyviolation', e => console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`)))
    await page.route('https://hvevaxsfeyiikjhcsafi.supabase.co/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    await page.goto(`${base}/${relative.replace(/index\.html$/, '')}`, { waitUntil: 'load' })
    await page.waitForTimeout(300)
    const meta = await page.locator('meta[http-equiv="Content-Security-Policy"]').count()
    assert.equal(meta, 1, `${relative}: one CSP meta`)
    assert.deepEqual(violations, [], `${relative}: no CSP violations`)
    assert.deepEqual(errors, [], `${relative}: no page errors`)
    checked.push(relative)
    await page.close()
  }
  console.log(`PASS CSP browser check on ${checked.length} pages: ${checked.join(', ')}`)
} finally { await browser.close(); server.close() }
