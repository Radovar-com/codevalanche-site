# Codevalanche localization, security, and discovery design

**Status:** Design approved; implementation is in progress on the existing analytics/auth worktree.

## Goal

Extend Codevalanche's existing static website with first-visit country routing, complete translations for the 17 languages already listed in its footer, and the security, search, and AI-discovery safeguards established on Radovar. The user asked that translations be authored in this task and built from local catalogs. Preserve the current public domain and account service throughout the work.

## Verified starting point

- The company repository already exists as the public `Radovar-com/codevalanche-site` repository. Its `main` includes the local checkout's history plus a newer homepage structured-data commit. No repository recreation or history copy is required.
- Read-only endpoint checks found that the live apex is served by GitHub Pages, the personal Pages URL redirects to `codevalanche.com`, and the company repository's default Pages URL returns 404. This suggests the public domain may still be attached to the personal Pages configuration. The Worker origin must stay unset until the company Pages origin and domain attachment are confirmed.
- The local checkout is now fast-forwarded to the company repository's `main` tip and `origin` points to `Radovar-com/codevalanche-site`; the former personal remote is retained as `personal`. No push or deployment occurred. Pre-existing untracked `AGENTS.md` and `docs/account-data-retention.md` remain untouched and must be preserved.
- The existing `owned-analytics-site` worktree contains the prior account/auth and owned-analytics cleanup the user asked to include. It is 52 commits ahead of company `main` and lacks the latest `main` commit; no PR was found. Use that existing worktree as the implementation base, preserve its history, and reconcile the company-main structured-data addition without squashing or publishing the pending work.
- The site is built from static files in `src/` into `dist/` and deployed with GitHub Pages. The source contains homepage, changelog, privacy, terms, account, OAuth authorization, and signed-in pages.
- The footer already lists English plus Arabic, German, Spanish, French, Hindi, Indonesian, Italian, Japanese, Korean, Brazilian Portuguese, Romanian, Russian, Turkish, Vietnamese, Simplified Chinese, and Traditional Chinese. The website content and all current routes are English; those footer entries are explanatory text rather than links.
- Account UI supports sign-in, create account, email confirmation, password reset, Google sign-in, profile and session management, and a desktop authorization return. Supabase Auth and its account service are independent from the Git repository. `authCallback()` normalizes callbacks to `/account/` and preserves the validated `authorization_id`.
- The local repository instructions require preserving analytics event identifiers, consent behavior, and generated/shared analytics integrations. They also warn that analytics work may exist on a separate worktree/branch; inspect that state before changing page markup.
- Radovar's current site is a static Next export. Its reusable safeguards include a post-build hash-based CSP, SHA-pinned GitHub Actions, an exact Node runtime, per-route metadata/schema, sitemap checks, robots rules, and generated `llms.txt` / `llms-full.txt` discovery files.

## Approved design

### Repository and account continuity

1. Treat `Radovar-com/codevalanche-site` as canonical. Do not create another repository or rewrite history. The local main checkout is aligned to that remote; implementation uses the existing analytics worktree so the account/auth and analytics cleanup is carried forward. Preserve all untracked user files and do not publish the pending branch during preparation.
2. Do not move or migrate the Supabase project, accounts, or account data. Keep `https://codevalanche.com`, `accountOrigin`, canonical account callback paths, and existing OAuth/redirect allowlists unchanged unless a documented verification finds a required correction.
3. Keep sign-in, create-account, confirmation, password reset, and desktop OAuth flows available in every supported language. Translate their visible UI while retaining the current callback path and validated authorization parameter contract.
4. Preserve the existing consent and owned-analytics behavior, identifiers, and registry integration. Reuse the existing consent-gated `navigation_used` footer event for locale links by canonicalizing locale-prefixed paths to the current page IDs. Do not add an event, contract ID, tracker, or locale/user data to its payload.

### Static localization and language selection

1. Keep English at `/`. Generate static locale directories for the other 16 locales at build time: `/ar/`, `/de/`, `/es/`, `/fr/`, `/hi/`, `/id/`, `/it/`, `/ja/`, `/ko/`, `/pt-br/`, `/ro/`, `/ru/`, `/tr/`, `/vi/`, `/zh-hans/`, and `/zh-hant/`.
2. Keep one English source catalog and complete target-language catalogs in the repository. The build generates the static locale pages locally without contacting a translation service. Fail the production build if any visible string or placeholder is missing rather than silently shipping English in a localized page.
3. Translate all user-facing content: marketing pages, changelog, legal pages, shared header/footer, consent controls and messages, account UI and errors, accessibility labels, image alternatives, and page metadata. Preserve product names and protected terminology through a glossary. Render correct `lang` and direction metadata, including RTL Arabic.
4. Reuse only the existing footer language picker; do not add a selector to the header or another page area. Turn its language list into links. Preserve the current content path when switching language. The English link removes the locale prefix; manually removing `/it/` from a localized route therefore resolves to the equivalent English route. If the English equivalent does not exist, return to `/`.
5. The user selected in-task authorship for the translations. No external translation provider or API key is required.

### Country routing

1. Keep GitHub Pages as the static content origin and add a Cloudflare Worker in front of the custom domain for country lookup, redirect handling, and response security headers. Configure its static origin only after the company Pages URL is verified; do not bake in the personal custom domain or a 404 origin.
2. On the first HTML navigation to an English route, use the edge country code and an explicit country-to-locale map. Redirect supported countries to the equivalent locale route (Italy to `/it/`). Unsupported or unmapped countries stay at the English path.
3. Use a first-party one-year routing-state cookie to prevent repeat redirects. Direct locale URLs are respected. The Worker must mark a visit as checked on localized pages too, so stripping `/it/` returns to English without a redirect loop. Keep the routing-state marker separate from the selected-language preference; the English root updates the latter to English. The language selector's explicit choice must also be respected.
4. Do not redirect assets, API calls, account/OAuth callbacks, or non-GET/HEAD requests. Do not cache country-specific redirects as shared responses; return a temporary redirect with private/no-store caching.
5. The one-locale-per-country map needs an explicit rule for multilingual countries. Recommended default: map only countries with an unambiguous supported primary language; leave ambiguous or unsupported countries at `/` until an explicit mapping is agreed.

### Security, SEO, and discovery

1. Adapt Radovar's post-build CSP generation to Codevalanche's real inline scripts, Supabase/API origins, and consent-gated analytics. Derive script hashes from final built HTML, keep external sources blocked unless explicitly configured, and fail the build on unknown external script origins.
2. Add actual response headers at the Cloudflare edge (including frame restrictions, MIME sniffing protection, referrer policy, and HSTS only after all affected hostnames are verified HTTPS). A CSP meta tag alone cannot replace response headers such as `frame-ancestors`.
3. Pin GitHub Actions to reviewed commit SHAs, pin the Node patch version, retain `npm ci`, and add build-time checks for exported HTML, CSP presence, locale coverage, metadata, and sitemap consistency.
4. Give every indexable English and localized page its own canonical URL, title, description, Open Graph/Twitter metadata, and reciprocal `hreflang` alternatives. Generate sitemap entries for all localized equivalents and keep account/auth pages `noindex`.
5. Keep a coherent Schema.org graph for Radovar, Codevalanche, and the website; add route-level WebPage/breadcrumb data where appropriate without duplicating graph nodes. Generate `llms-full.txt` from approved public content and maintain `llms.txt` as its concise discovery index.
6. Keep English as the source of truth for product facts. Translation catalogs must preserve structured values, URLs, event IDs, analytics definitions, and callback parameters.

## Rollout and safety boundaries

1. Prepare changes on the company repository's existing history and validate static output while the current production site remains live.
2. Keep the current GitHub Pages custom-domain configuration and Supabase project intact until the locale routes, translation completeness, account flows, analytics markers, SEO output, and security policy are reviewed.
3. Cloudflare activation requires an active zone, a verified company Pages origin and proxied DNS. The recorded setup has GoDaddy managing the domain; changing authoritative nameservers or production DNS is a separate cutover and requires the user's explicit final approval after the staged Worker and DNS records are ready.
4. Do not deploy, change DNS, modify Supabase settings/migrations, move user data, enable analytics, or publish an incomplete translation set as part of preparation.
5. Keep a substantial visual redesign as a separate follow-up after localization and technical hardening are stable; this work may add the language selector and RTL support but should preserve the existing visual system.

## Acceptance criteria

- Existing Codevalanche users can continue sign-in, create-account, email confirmation, password reset, Google OAuth, and desktop authorization through the same domain and backend.
- Each of the 17 listed languages has complete static output for every in-scope public and account UI string; generated pages use correct language/direction metadata and contain no missing-string fallback.
- The footer language selector works, preserves page context, and provides English routes by stripping the locale prefix. Direct locale URLs are never overridden.
- First visit from a mapped country redirects once to the matching locale with no prompt; unmapped countries remain English; subsequent manual navigation to `/` does not bounce back.
- Localized canonicals, social metadata, structured data, sitemap and `hreflang` references are internally consistent; account/auth pages remain non-indexable.
- Exported HTML has the intended CSP; edge responses have the approved security headers; workflows reject unknown external scripts and incomplete generated output.
- Existing analytics consent, markers, registries, event semantics, and backend contract remain intact.
- Footer language links reuse the existing consent-gated navigation event, send no locale/user payload, and do not duplicate navigation or download events.
- DNS and production publication remain unchanged until the user approves the final cutover.

## Open decisions before implementation

1. Confirm the recommended country-map rule for multilingual countries, or provide exceptions.
2. After staging and review, explicitly approve or decline moving authoritative DNS/proxying to Cloudflare for the production Worker.
