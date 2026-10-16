# Codevalanche edge Worker

The Worker implements first-visit language routing, a static-origin proxy, and response security headers. It is not attached to a production route and has not been deployed.

## Required origin configuration

Before previewing or deploying the proxy, set `SITE_ORIGIN` to a verified HTTPS static origin and set `SITE_BASE_PATH` if that origin serves this project below a path. Do not use `https://codevalanche.com` as the upstream: that is the public hostname the Worker will serve. The current company Pages default URL returned 404 during read-only verification, so the Worker intentionally has no default origin and refuses to proxy without one.

## Routing behavior

- Redirects only first-time `GET` or `HEAD` HTML requests for public marketing routes.
- Uses the reviewed `COUNTRY_LOCALE` map; unsupported and ambiguous countries remain in English.
- Preserves the request path and query when redirecting to a locale route.
- Sets separate one-year cookies for routing completion and the selected language.
- Never redirects account/auth callbacks, the legacy account redirect, API paths, assets, or non-navigation methods.
- Sets HSTS only when `HSTS_ENABLED=true`, after every affected hostname has been verified for HTTPS.

Run the local request simulations with `node --test scripts/site-edge.test.mjs`. Production routing and DNS remain a separate cutover step.
