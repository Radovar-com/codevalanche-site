// Offline preview of the project's existing Go-template subset. Not a Go engine.
import http from 'node:http'
import { constants } from 'node:fs'
import { lstat, mkdir, open, readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { renderTemplate, actionUrl, SUBJECTS, TEMPLATE_KINDS, EMAIL_LOGO_URL, EMAIL_LOGO_DARK_URL } from '../supabase/templates/email-templates.mjs'

export const OWNERSHIP_MARKER = '<!-- Codevalanche Auth email local preview v1; synthetic fixtures only -->'
export const PREVIEW_LOCALES = Object.freeze(['en'])
export const PREVIEW_LOGO_PATH = '/assets/codevalanche-email-logo.png'
export const PREVIEW_LOGO_DARK_PATH = '/assets/codevalanche-email-logo-dark.png'
export const PREVIEW_FILENAMES = Object.freeze(['index.html', ...TEMPLATE_KINDS.flatMap(kind => PREVIEW_LOCALES.map(locale => `${kind}-${locale}.html`))])
const ROOT = fileURLToPath(new URL('../', import.meta.url))
const OUTPUT = path.join(ROOT, '.superpowers', 'auth-email-preview-20261018')
const CONFIRMATION_URL = 'https://example.invalid/preview/confirmation'
const TOKEN = '123456'
const FIELDS = ['Data', 'Email', 'NewEmail', 'Token', 'ConfirmationURL']

function plainFields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error('fixture_object_required')
  for (const key of Reflect.ownKeys(value)) {
    if (!allowed.includes(key) || !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')) throw new Error('fixture_field_forbidden')
  }
}

export function syntheticFixture(locale = 'en', overrides = {}) {
  plainFields(overrides, FIELDS)
  let selected = locale
  if (Object.hasOwn(overrides, 'Data')) {
    plainFields(overrides.Data, ['locale'])
    selected = overrides.Data.locale
  }
  const result = {
    Data: Object.freeze({ locale: typeof selected === 'string' && selected.length <= 256 ? selected : '' }),
    Email: 'recipient@example.invalid', NewEmail: 'new@example.invalid', Token: TOKEN, ConfirmationURL: CONFIRMATION_URL,
  }
  for (const field of ['Email', 'NewEmail']) {
    if (Object.hasOwn(overrides, field)) {
      if (typeof overrides[field] !== 'string' || overrides[field].length > 1024 || !/@(?:[a-z0-9-]+\.)*example\.invalid$/i.test(overrides[field])) throw new Error('fixture_reserved_email_required')
      result[field] = overrides[field]
    }
  }
  if (Object.hasOwn(overrides, 'Token') && overrides.Token !== TOKEN) throw new Error('fixture_synthetic_token_required')
  if (Object.hasOwn(overrides, 'ConfirmationURL') && overrides.ConfirmationURL !== CONFIRMATION_URL) throw new Error('fixture_synthetic_url_required')
  return Object.freeze(result)
}

function escapeHtml(value) {
  const substitutions = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&#34;', "'": '&#39;', '+': '&#43;', '\0': '\uFFFD' }
  return value.replace(/[&<>"'+\0]/g, c => substitutions[c])
}

export function evaluateTemplate(template, supplied = syntheticFixture()) {
  if (typeof template !== 'string' || template.length > 1_000_000) throw new Error('template_text_required')
  const fixture = syntheticFixture(undefined, supplied)
  let output = '', cursor = 0, declared = false
  const stack = []
  const active = () => stack.every(frame => frame.active)
  while (cursor < template.length) {
    const start = template.indexOf('{{', cursor)
    const text = template.slice(cursor, start === -1 ? template.length : start)
    // A closing delimiter outside an action is text in Go (and in CSS @media).
    if (active()) output += text
    if (start === -1) break
    const end = template.indexOf('}}', start + 2)
    if (end === -1 || template.slice(start + 2, end).includes('{{')) throw new Error('template_action_malformed')
    const action = template.slice(start + 2, end).trim()
    cursor = end + 2
    if (action === '$locale := printf "%v" .Data.locale') {
      if (declared || stack.length) throw new Error('template_locale_declaration_invalid')
      declared = true
      continue
    }
    const condition = /^(if|else if) eq \$locale "([a-z]{2}(?:-[A-Za-z]{2})?)"$/.exec(action)
    if (condition) {
      if (!declared) throw new Error('template_locale_undeclared')
      const matches = fixture.Data.locale === condition[2]
      if (condition[1] === 'if') stack.push({ active: matches, matched: matches, elseSeen: false })
      else {
        const frame = stack.at(-1)
        if (!frame || frame.elseSeen) throw new Error('template_else_if_invalid')
        frame.active = !frame.matched && matches
        frame.matched ||= matches
      }
    } else if (action === 'else') {
      const frame = stack.at(-1)
      if (!frame || frame.elseSeen) throw new Error('template_else_invalid')
      frame.active = !frame.matched
      frame.matched = true
      frame.elseSeen = true
    } else if (action === 'end') {
      if (!stack.length) throw new Error('template_end_invalid')
      stack.pop()
    } else if (/^\.(Email|NewEmail|Token|ConfirmationURL)$/.test(action)) {
      if (active()) output += escapeHtml(fixture[action.slice(1)])
    } else throw new Error('template_action_unsupported')
  }
  if (stack.length) throw new Error('template_if_unclosed')
  return output
}

export function renderPreview(kind, locale = 'en', overrides = {}) {
  // Only this exact reviewed brand asset is mapped to the local candidate.
  // Production keeps its own HTTPS URL; preview never fetches the live host.
  // Token-hash action links (invite, email change) preview as the same fixed
  // synthetic confirmation URL: the preview never builds a real account link.
  const template = renderTemplate(kind).replaceAll(actionUrl(kind), '{{ .ConfirmationURL }}')
  return evaluateTemplate(template, syntheticFixture(locale, overrides))
    .replaceAll(`src="${EMAIL_LOGO_URL}"`, `src="${PREVIEW_LOGO_PATH}"`)
    .replaceAll(`src="${EMAIL_LOGO_DARK_URL}"`, `src="${PREVIEW_LOGO_DARK_PATH}"`)
}

function gallery() {
  const groups = TEMPLATE_KINDS.map(kind => `<section><h2><a href="${kind}-en.html" target="mail-preview">${escapeHtml(SUBJECTS[kind])}</a></h2></section>`).join('\n')
  return `<!doctype html>\n${OWNERSHIP_MARKER}
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Codevalanche · Auth email preview</title>
<style>
:root{font-family:Arial,Helvetica,sans-serif;color:#252620;background:#f5f4ef}*{box-sizing:border-box}body{margin:0;padding:32px}h1{font:400 38px/1.1 Georgia,serif;margin:12px 0}p{line-height:1.5}.eyebrow{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#63645e}.intro{max-width:720px;color:#63645e}.layout{display:grid;grid-template-columns:240px minmax(0,1fr);gap:32px;margin-top:28px}nav section{padding:0 0 16px;border-bottom:1px solid #deddd5;margin-bottom:16px}h2{font-size:14px;line-height:1.5;margin:0}nav p{margin:6px 0 0}a{color:#0b5661;text-underline-offset:3px}fieldset{display:inline-block;border:1px solid #c8c9c0;border-radius:4px;margin:0 12px 18px 0;padding:10px 12px}legend{font-size:12px}label{font-size:13px;margin-right:8px;white-space:nowrap}input{accent-color:#0b5661}.preview-stage{max-width:100%;overflow:auto;background:#e9e8e0;border:1px solid #deddd5;border-radius:4px;padding:16px}.mail-frame{display:block;border:0;margin:0 auto;width:600px;max-width:100%;height:1000px;background:#faf9f5;color-scheme:light}.workspace:has(#size320:checked) .mail-frame{width:320px}.workspace:has(#size390:checked) .mail-frame{width:390px}.workspace:has(#theme-dark:checked) .mail-frame{color-scheme:dark;background:#12120f}.note{font-size:12px;color:#63645e}@media(max-width:800px){body{padding:20px}.layout{grid-template-columns:1fr}nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.preview-stage{padding:0}h1{font-size:30px}}
</style></head><body><div class="eyebrow">Local preview · synthetic fixtures</div><h1>Account email collection</h1><p class="intro">Six account emails, in English. Addresses, action links and the confirmation code are examples. The logo is served locally for this preview. This gallery sends no email and reads no account or provider settings.</p>
<div class="layout"><nav aria-label="Email type and language">${groups}</nav><main class="workspace">
<fieldset><legend>Frame width</legend><label><input id="size320" type="radio" name="size">320px</label><label><input id="size390" type="radio" name="size">390px</label><label><input id="size600" type="radio" name="size" checked>600px</label></fieldset>
<fieldset><legend>Color scheme</legend><label><input id="theme-light" type="radio" name="theme" checked>Light</label><label><input id="theme-dark" type="radio" name="theme">Dark</label></fieldset>
<div class="preview-stage"><iframe class="mail-frame" name="mail-preview" title="Synthetic Auth email preview" src="confirmation-en.html" sandbox=""></iframe></div><p class="note">The selected width is capped by your browser window. Dark mode requests the email's own dark color scheme; email clients may render it differently. Open a message link in a new tab to inspect the email alone. The action URL is a placeholder for the recipient's confirmation or reset link.</p>
</main></div></body></html>\n`
}

export function buildPreviewPages() {
  const pages = new Map([['index.html', gallery()]])
  for (const kind of TEMPLATE_KINDS) for (const locale of PREVIEW_LOCALES) {
    pages.set(`${kind}-${locale}.html`, `${OWNERSHIP_MARKER}\n${renderPreview(kind, locale)}`)
  }
  return pages
}

export function previewOutputPath(filename) {
  if (!PREVIEW_FILENAMES.includes(filename)) throw new Error('preview_filename_forbidden')
  return path.join(OUTPUT, filename)
}

export function assertOwnedOutput(filename, existing) {
  previewOutputPath(filename)
  if (existing && (!existing.regular || existing.symlink || !existing.text.startsWith(OWNERSHIP_MARKER) && !existing.text.startsWith(`<!doctype html>\n${OWNERSHIP_MARKER}`))) throw new Error('preview_output_unowned')
  return true
}

async function fixedDirectory(directory) {
  try { await mkdir(directory) } catch (error) { if (error.code !== 'EEXIST') throw error }
  const info = await lstat(directory)
  if (!info.isDirectory() || info.isSymbolicLink() || path.resolve(await realpath(directory)).toLowerCase() !== path.resolve(directory).toLowerCase()) throw new Error('preview_output_directory_unsafe')
}

export async function writePreviewGallery() {
  await fixedDirectory(path.join(ROOT, '.superpowers'))
  await fixedDirectory(OUTPUT)
  const pages = buildPreviewPages()
  // Check every known destination before writing. Unknown files are untouched.
  for (const filename of pages.keys()) {
    const target = previewOutputPath(filename)
    try {
      const info = await lstat(target)
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error('preview_output_unsafe')
      const handle = await open(target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0))
      try { assertOwnedOutput(filename, { regular: true, symlink: false, text: await handle.readFile('utf8') }) } finally { await handle.close() }
    } catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  for (const [filename, html] of pages) {
    const target = previewOutputPath(filename)
    let handle
    try { handle = await open(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600) }
    catch (error) {
      if (error.code !== 'EEXIST') throw error
      handle = await open(target, constants.O_RDWR | (constants.O_NOFOLLOW || 0))
      try {
        const info = await handle.stat()
        assertOwnedOutput(filename, { regular: info.isFile() && info.nlink === 1, symlink: false, text: await handle.readFile('utf8') })
        await handle.truncate(0)
        await handle.write(html, 0, 'utf8')
      } finally { await handle.close() }
      continue
    }
    try { await handle.writeFile(html, 'utf8') } finally { await handle.close() }
  }
  return { directory: OUTPUT, files: [...pages.keys()] }
}

export function parsePreviewArguments(args) {
  const parsed = { serve: false, port: 4196, help: false }, seen = new Set()
  for (let index = 0; index < args.length; index++) {
    const arg = args[index]
    if (!['--serve', '--port', '--help'].includes(arg) || seen.has(arg)) throw new Error('preview_argument_unknown_or_duplicate')
    seen.add(arg)
    if (arg === '--serve') parsed.serve = true
    if (arg === '--help') parsed.help = true
    if (arg === '--port') {
      const text = args[++index]
      if (!/^\d{4,5}$/.test(text || '') || Number(text) < 1024 || Number(text) > 65535) throw new Error('preview_argument_port_invalid')
      parsed.port = Number(text)
    }
  }
  return parsed
}

export async function startPreviewServer(options = {}) {
  if (!options || typeof options !== 'object' || Object.keys(options).some(key => key !== 'port')) throw new Error('preview_server_option_forbidden')
  const port = options.port ?? 4196
  if (!Number.isInteger(port) || port < 0 || port > 65535 || port !== 0 && port < 1024) throw new Error('preview_server_port_invalid')
  const pages = buildPreviewPages()
  const logos = new Map()
  for (const route of [PREVIEW_LOGO_PATH, PREVIEW_LOGO_DARK_PATH]) {
    const logoFile = path.join(ROOT, 'src', 'assets', path.basename(route))
    const logoInfo = await lstat(logoFile)
    if (!logoInfo.isFile() || logoInfo.isSymbolicLink() || logoInfo.nlink !== 1 || logoInfo.size > 65_536) throw new Error('preview_logo_file_unsafe')
    const logo = await readFile(logoFile)
    if (!logo.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) throw new Error('preview_logo_png_required')
    logos.set(route, logo)
  }
  const server = http.createServer((req, res) => {
    const actualPort = server.address().port
    const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' }
    const finish = (status, body = '') => { res.writeHead(status, headers); res.end(req.method === 'HEAD' ? '' : body) }
    if (req.headers.host !== `127.0.0.1:${actualPort}`) return finish(403)
    if (!['GET', 'HEAD'].includes(req.method)) { headers.Allow = 'GET, HEAD'; return finish(405) }
    if (logos.has(req.url)) { headers['Content-Type'] = 'image/png'; return finish(200, logos.get(req.url)) }
    const route = req.url === '/' ? 'index.html' : req.url?.slice(1)
    if (!req.url?.startsWith('/') || !PREVIEW_FILENAMES.includes(route) || req.url !== '/' && req.url !== `/${route}`) return finish(404)
    headers['Content-Security-Policy'] = `default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src 'self'; font-src 'none'; connect-src 'none'; frame-src 'self'; frame-ancestors ${route === 'index.html' ? "'none'" : "'self'"}; base-uri 'none'; form-action 'none'`
    finish(200, pages.get(route))
  })
  server.requestTimeout = 5000
  server.headersTimeout = 5000
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  return { server, url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
}

async function main() {
  const args = parsePreviewArguments(process.argv.slice(2))
  if (args.help) { console.log('Usage: node scripts/auth-email-preview.mjs [--serve] [--port 4196]\nWrites 7 synthetic preview pages only under .superpowers/auth-email-preview-20261018/. --serve binds 127.0.0.1 only and serves two fixed local brand PNG variants.'); return }
  const output = await writePreviewGallery()
  console.log(`Generated ${output.files.length} synthetic preview pages: .superpowers/auth-email-preview-20261018/`)
  if (args.serve) {
    const running = await startPreviewServer({ port: args.port })
    console.log(`Local Auth email preview: ${running.url}`)
    const stop = async () => { await running.close(); process.exitCode = 0 }
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => {
  console.error(error.code === 'EADDRINUSE' ? 'preview_server_port_in_use' : /^preview_|^fixture_|^template_/.test(error.message) ? error.message : 'preview_failed')
  process.exitCode = 1
})
