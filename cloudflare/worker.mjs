// Cloudflare Worker in front of the static site (GitHub Pages origin): passes
// every request through unchanged and adds the security headers. It never
// rewrites bodies or redirects. Deploy: see cloudflare/wrangler.toml.
import { withAssetCache } from './cache-policy.mjs'
import { withSecurityHeaders } from './security-headers.mjs'

export default {
  async fetch(request) {
    return withAssetCache(withSecurityHeaders(await fetch(request)), request)
  },
}
