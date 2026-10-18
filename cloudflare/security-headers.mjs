// Security headers for codevalanche.com, in one place.
//
// - SECURITY_HEADERS: sent as HTTP headers when Cloudflare sits in front of the
//   site (worker.mjs) or when the site is served by Cloudflare Pages (_headers).
//   GitHub Pages cannot send custom headers, so these only apply once Cloudflare
//   is in front.
// - pageContentSecurityPolicy(): the per-page CSP that scripts/build.mjs writes
//   into every page as <meta http-equiv>. It works on any host, including GitHub
//   Pages today. A meta CSP cannot carry frame-ancestors, so framing protection
//   and HSTS need the headers.
// The browser applies both policies; the header policy only adds what a meta
// policy cannot express, so the two never contradict each other.

export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'
const ANALYTICS_SCRIPT = ['https://www.googletagmanager.com']
const ANALYTICS_CONNECT = ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://www.googletagmanager.com']
const ANALYTICS_IMG = ['https://*.google-analytics.com', 'https://*.googletagmanager.com']

export const HEADER_CONTENT_SECURITY_POLICY = "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'; upgrade-insecure-requests"

export const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': HEADER_CONTENT_SECURITY_POLICY,
  // One year, without includeSubDomains/preload until every subdomain is HTTPS-only.
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
})

/** Cloudflare Pages `_headers` file content. */
export function headersFile() {
  return ['# Generated from cloudflare/security-headers.mjs. Edit that file, not this one.', '/*', ...Object.entries(SECURITY_HEADERS).map(([name, value]) => `  ${name}: ${value}`), ''].join('\n')
}

/** Adds the security headers to a response that passes through Cloudflare. */
export function withSecurityHeaders(response) {
  const result = new Response(response.body, response)
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    // Browsers enforce both policies; retain any stricter upstream script rules.
    if (name === 'Content-Security-Policy' && result.headers.has(name)) result.headers.append(name, value)
    else result.headers.set(name, value)
  }
  return result
}

function origin(value) {
  try { const url = new URL(value); return url.protocol === 'https:' || url.hostname === '127.0.0.1' || url.hostname === 'localhost' ? url.origin : '' } catch { return '' }
}

/**
 * CSP for one page. Account pages talk only to Supabase and Turnstile;
 * marketing pages may load the consented analytics adapter.
 */
export function pageContentSecurityPolicy({ account, inlineScriptHashes = [], supabaseUrl = '', apiOrigin = '' }) {
  const hashes = inlineScriptHashes.map(hash => `'sha256-${hash}'`)
  const connect = ["'self'", ...[supabaseUrl, apiOrigin].map(origin).filter(Boolean)]
  const directives = account
    ? {
        'default-src': ["'self'"],
        'script-src': ["'self'", TURNSTILE_ORIGIN, ...hashes],
        'style-src': ["'self'"],
        'img-src': ["'self'", 'data:'],
        'font-src': ["'self'"],
        'connect-src': connect,
        'frame-src': [TURNSTILE_ORIGIN],
        'object-src': ["'none'"],
        'base-uri': ["'none'"],
        'form-action': ["'self'"],
      }
    : {
        'default-src': ["'self'"],
        'script-src': ["'self'", ...ANALYTICS_SCRIPT, ...hashes],
        // Marketing pages use style attributes; scripts stay strict.
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', ...ANALYTICS_IMG],
        'font-src': ["'self'"],
        'connect-src': [...new Set([...connect, ...ANALYTICS_CONNECT])],
        'frame-src': ["'none'"],
        'object-src': ["'none'"],
        'base-uri': ["'self'"],
        'form-action': ["'self'"],
      }
  return Object.entries(directives).map(([name, values]) => `${name} ${[...new Set(values)].join(' ')}`).join('; ')
}
