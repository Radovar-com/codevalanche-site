# Codevalanche hosting and edge cutover checklist

**Status:** Preparation only. No deployment, DNS, Cloudflare, or Supabase changes have been made.

## Read-only checks

- `https://codevalanche.com/` returned HTTP 200 with `Server: GitHub.com`.
- The apex currently resolved to GitHub Pages addresses `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, and `185.199.111.153`.
- `https://www.codevalanche.com/` redirected to the apex.
- `https://cata009.github.io/codevalanche-site/` redirected to `https://codevalanche.com/`.
- `https://radovar-com.github.io/codevalanche-site/` returned HTTP 404.

These results suggest that the public custom domain may still be attached to the personal GitHub Pages site even though the company repository exists. Confirm the company Pages deployment and domain attachment before selecting an edge upstream.

## Required before staging the Worker

1. Confirm the company repository's Pages site is enabled and identify the URL that serves the exported files without redirecting back to `codevalanche.com`.
2. Set Worker `SITE_ORIGIN` and, if needed, `SITE_BASE_PATH` only to that verified origin. They are intentionally absent from `wrangler.toml`.
3. Test a staging hostname or isolated Worker preview for English and all locale routes, assets, sitemap, CSP, response headers, and country redirects.
4. Keep `HSTS_ENABLED=false` until apex, `www`, account, and any other affected hostnames are confirmed HTTPS.

## Account continuity checks

- Keep `https://codevalanche.com` as the public and account origin during the cutover.
- Preserve `/account/`, `/account/authorize/`, and `/account/signed-in/`.
- Preserve the validated `authorization_id` callback parameter, Google OAuth return, password recovery flow, Supabase project, and existing Auth allowlists.
- Do not migrate or recreate user accounts. The repository move does not move Supabase Auth data.

## Production approval boundary

Cloudflare proxying, Worker route attachment, GoDaddy nameserver changes, GitHub Pages domain reassignment, and production deployment remain separate actions. Review the verified upstream and staging results first; obtain the user's explicit final approval before changing production DNS or publishing the new company Pages deployment.
