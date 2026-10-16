// Cloudflare Worker in front of the static site (GitHub Pages origin): passes
// every request through unchanged and adds the security headers. It never
// rewrites bodies, caches or redirects. Deploy: see cloudflare/wrangler.toml.
import { withSecurityHeaders } from './security-headers.mjs'

export default {
  async fetch(request) {
    return withSecurityHeaders(await fetch(request))
  },
}
