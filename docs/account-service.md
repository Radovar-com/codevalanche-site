# Account service and website analytics

Edit `src/config.js` before publishing, then run `npm run build`. All values in this file are public. Leave origins blank until a real service is deployed. No secret or OAuth credential belongs in the static website.

- `accountOrigin`: HTTPS origin hosting the central `/account` UI. Sign-in remains on that origin, so the website never receives tokens or credentials. The site account page shows an availability message and hides its sign-in link when unconfigured.
- `apiOrigin`: HTTPS origin receiving `POST /api/codevalanche/accounts/events`. The service must allow the website origin (including `https://codevalanche.com`) in CORS for POST and Content-Type preflight. Localhost HTTP origins are supported for local testing only.
- `CODEVALANCHE_RELEASE_MANIFEST`: build-generated public view of the server-owned qualified release manifest. Empty assets retain release-in-preparation labels. Native links use the owned gateway; see [owned download evidence](owned-download-evidence.md) for operational evidence, registry and retention semantics.
- `CODEVALANCHE_ANALYTICS.measurementId`: existing optional GA adapter; the placeholder remains inactive.

First-party requests contain exactly `{ eventId, eventName, platform, installationId, consent: true }`. IDs are random UUIDs. Event names are `website_view` and `download_clicked`; platforms are `web`, `windows`, `macos`, `linux`, `ios`, `android`. Mac architecture selection normalizes to `macos`. The optional API `appVersion` field is omitted because the website does not know the installed version.

There is no URL, query, email, account ID, or form data in the event. Requests omit credentials and referrers, use JSON and keepalive, and never block navigation or retry. Failed events can be lost. A click is not evidence of a completed download or installation. Browser and app installations are separate identifiers; the static website does not stitch identity across devices.

Explicit `codevalanche_consent=accepted` is required before any event or analytics installation identifier is created. The existing consent controls dispatch `codevalanche-consent`; first-party collection reads the cookie again on every event. Withdrawal deletes `codevalanche_analytics_installation` from localStorage. The next acceptance starts a new identifier. Previously received events are not deleted by withdrawal.

Run `npm test` for consent, payload and origin boundary tests. Run `npm run build` to generate the GitHub Pages output. This change does not deploy the service or configure live origins.

Security headers: `scripts/build.mjs` writes a Content Security Policy `<meta>` into every page (inline scripts allowed only by their exact hash; account pages may talk only to Supabase and Cloudflare Turnstile). Framing protection (`frame-ancestors`), HSTS and the other headers need HTTP headers, which GitHub Pages cannot send: they are prepared in `cloudflare/security-headers.mjs` and applied by the Worker in `cloudflare/wrangler.toml` once the domain is proxied by Cloudflare (or by `dist/_headers` when built with `CODEVALANCHE_HEADERS_FILE=1` for Cloudflare Pages). Browser checks: `node scripts/csp-browser-test.mjs` and `node scripts/account-captcha-browser-test.mjs` after `npm run build`.
