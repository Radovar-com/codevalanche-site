# Codevalanche localization, security, and discovery implementation plan

## Execution contract

- Base: reuse the existing linked worktree at `_worktrees/owned-analytics-site-20261015` on branch `codex/owned-analytics-site-20261015`, whose company remote is `Radovar-com/codevalanche-site`. It contains the 52-commit auth/analytics cleanup requested for inclusion and lacks one newer company-main structured-data commit. Preserve its history, incorporate that structured-data improvement without squashing, and do not push the pending branch.
- Preserve the pre-existing untracked `AGENTS.md` and `docs/account-data-retention.md`; do not discard or overwrite them.
- Keep `codevalanche.com`, the current Supabase project, account callbacks, user data, and owned-analytics contracts unchanged.
- Do not push, deploy, modify Cloudflare/DNS, alter Supabase settings, or enable analytics during implementation. A production DNS/Worker cutover remains a separate user-approved step.
- The user asked that translations be authored in this task. Do not call a translation vendor or require an API key; keep complete locale catalogs in the repository and generate static pages from them.

## Task 1: Reconcile and preserve the existing analytics/auth work

**Inspect:** `AGENTS.md`, `src/account-funnel.js`, `src/site.js`, `src/account/app.js`, `src/account/helpers.js`, the `codex/owned-analytics-site-20261015` branch/worktree, and the shared analytics contract referenced by the instructions.

- Identify the authoritative analytics implementation and generated assets before editing any marketing or account DOM.
- Compare the branch's homepage schema with `origin/main` and carry over the newer Radovar/Codevalanche Organization/SoftwareApplication/WebSite graph without overwriting the analytics branch's content.
- Keep existing action/section IDs, consent behavior, and callback behavior intact. Reuse the existing consent-gated `navigation_used` event for footer language links by mapping locale-prefixed paths to existing canonical page IDs. Do not add an action ID, backend contract change, or locale/user data to the payload.
- Confirm that signup, sign-in, email confirmation, password reset, Google OAuth, and desktop authorization still use the same origin and callback path.
- Update the approved plan/spec documents in this worktree so its branch and limits remain recorded beside the code. Keep the parent `main` checkout's user files untouched.

**Files:** inspection first; any later analytics source changes stay in their authoritative source files and are rebuilt through the existing generator, never edited in generated output.

## Task 2: Define locale catalogs and the static generation boundary

**Create:** `src/locales/manifest.js`, `src/locales/en.json`, `scripts/translate-site.mjs`, and a translation glossary/resource file.

**Modify:** `package.json` and the build scripts to expose explicit locale-sync and locale-validation commands.

- Use `src/locales/manifest.js` as the shared source for the 17 footer languages, route slugs, display labels, and direction. Keep English at `/`; use lowercase URL slugs `/ar/`, `/de/`, `/es/`, `/fr/`, `/hi/`, `/id/`, `/it/`, `/ja/`, `/ko/`, `/pt-br/`, `/ro/`, `/ru/`, `/tr/`, `/vi/`, `/zh-hans/`, `/zh-hant/` while retaining proper BCP 47 casing in HTML and metadata.
- Use stable keys for all visible strings and attributes. Include page text, navigation/footer, cookie/consent UI, changelog, privacy/terms, account screens and dynamic status/error strings, image alternatives, accessible labels, titles and social metadata.
- Author a complete translation catalog for each supported locale from the reviewed English source. Keep all locale files key-complete and reject incomplete catalogs; never fall back silently to English in production.
- Generate Arabic pages with `lang="ar"` and `dir="rtl"`; keep other locales LTR. Preserve product names, URLs, event IDs, callback parameters, structured values, and analytics definitions while translating surrounding copy.

**Validation:** test catalog completeness, placeholder consistency, language tags, and output rendering without external translation requests.

## Task 3: Generate localized static pages and preserve English navigation

**Modify:** `scripts/build.mjs`, `src/index.html`, `src/changelog.html`, `src/privacy.html`, `src/terms.html`, `src/partials/header.html`, `src/styles.css`, `src/site.js`, and account page/UI sources as identified in Task 1.

- Generate locale-prefixed static directories for every page and preserve the original English paths.
- Turn only the existing footer language picker into links that carry the current page to its equivalent route. Do not add a header or secondary selector. The English link removes the locale segment; if there is no equivalent, it links to `/`.
- Use a separate language-preference value for translated account UI. Keep `/account/`, `/account/authorize/`, `/account/signed-in/`, and the existing `authorization_id` contract unchanged.
- Update the website privacy copy for the essential routing/language preference cookie, without changing analytics consent or creating analytics identifiers.
- Preserve all existing analytics markers and semantics on generated locale copies. Locale links use the existing footer navigation instrumentation and canonical page IDs; no new tracker, registry entry, or duplicate event.

**Validation:** catalog-built output contains each locale/page pair, correct `lang`/`dir`, translated dynamic messages, working page-preserving language links, and the unchanged account callback path.

## Task 4: Add first-visit country routing at the edge

**Create:** `workers/site-edge/src/index.ts` and `workers/site-edge/wrangler.toml` (or the equivalent minimal Worker files chosen after checking repository conventions).

- Read Cloudflare's country value and use a reviewed country-to-locale map: Italy maps to `it`; unsupported or ambiguous countries default to English unless explicitly mapped.
- Redirect only first-time HTML `GET`/`HEAD` navigation. Respect direct locale URLs, set a one-year routing-checked marker on localized and root responses, and maintain the separate explicit language preference.
- Return temporary redirects with `Cache-Control: private, no-store`; preserve relevant path/query state. Never redirect assets, API requests, account/auth callbacks, or non-navigation methods.
- Proxy normal requests only to a verified static-site origin and add only the approved response security headers. Leave `SITE_ORIGIN` unset until the company GitHub Pages origin is confirmed; do not make the Worker the account/auth backend.
- Do not deploy the Worker or change nameservers/DNS in this task.

**Validation:** simulate mapped, unsupported, direct-locale, repeated-root, manual-prefix-removal, and account/callback requests without calling production services.

## Task 5: Reconcile SEO, structured data, sitemap, and AI discovery

**Modify:** metadata in `src/*.html`, `src/sitemap.xml`, `src/robots.txt`, and the build pipeline.

**Create:** `src/llms.txt`, `scripts/build-llms-full.mjs`, and `scripts/seo-export-test.mjs` as appropriate.

- Give each indexable locale route a localized title, description, canonical URL, Open Graph/Twitter data, and reciprocal `hreflang` alternatives.
- Extend the existing Organization/SoftwareApplication/WebSite Schema.org graph consistently to localized pages without duplicating nodes; use route-level WebPage/breadcrumb data only where it adds accurate information.
- Include every indexable English/localized page in the sitemap and exclude account/auth routes. Keep robots rules correct for public and private-intent routes.
- Generate the full AI-discovery text from approved public website content and link it through a concise `llms.txt`. Never include account/profile data or private Company OS material.

**Validation:** build-time SEO check confirms every indexable exported page has one canonical, correct locale alternates, valid social metadata, and a matching sitemap entry.

## Task 6: Harden exported HTML, response headers, and the deployment workflow

**Create or adapt:** `scripts/postbuild-security.mjs` and its regression checks.

**Modify:** `.github/workflows/deploy-pages.yml` and the Worker response path.

- Add a post-build CSP derived from final HTML script hashes. Keep the policy strict while explicitly accounting for configured Supabase/API origins and consent-gated analytics; unknown external script origins fail closed.
- Add response-only protections at the Cloudflare edge, including frame restrictions, `X-Content-Type-Options`, referrer policy, and HSTS after all affected hostnames are verified HTTPS. Do not claim a CSP meta tag supplies response-only headers.
- Pin GitHub Actions to reviewed commit SHAs and the Node patch version; retain `npm ci`, existing account-contract validation, and add export security/locale/SEO gates.
- Review the locked production and development dependency tree for known advisories and add an `npm audit` gate at the agreed severity; keep lockfile-pinned dependency installation.
- Keep deployment triggers and permissions least-privilege. Do not add deploy credentials to source.

**Validation:** tests use fixture HTML and local Worker requests; the build rejects unknown script origins, missing CSP, incomplete locales, and inconsistent SEO output.

## Task 7: End-to-end readiness review without production cutover

- Run the project build and only the relevant account, marketing, localization, SEO, and security checks after the implementation plan is approved.
- Inspect the static output for all 17 locales, English fallbacks, RTL Arabic, relative navigation, sitemap/canonical/`hreflang`, CSP, and response headers.
- Run the existing mocked account/browser checks for sign-in, create account, email confirmation, password reset, Google OAuth, desktop authorization, and session return. Use an existing staging test account for any live smoke check; do not create or delete production users.
- Check that analytics consent and existing event semantics remain unchanged and that missing/incomplete locale catalogs cannot publish partial translations.
- Produce a cutover checklist with required Cloudflare zone/DNS records, the currently live Pages attachment, the verified company static origin, and the exact auth URLs/origins to preserve. Stop before changing DNS or deploying to production.
- Record the substantial visual redesign as a separate follow-up. This phase should add only the footer language links and RTL support needed by localization, preserving the current design system elsewhere.

## User decisions and approval gates

1. **Country map:** implement the approved default of mapping only unambiguous supported primary languages; ask for any multilingual-country exceptions before adding them.
2. **Static origin:** verify that GitHub Pages is enabled for the company repository and confirm its stable upstream URL before setting `SITE_ORIGIN`.
3. **Production cutover:** after staging review, ask separately before activating Cloudflare proxying or changing GoDaddy nameservers.

The recommended execution method is native execution in this thread because account callbacks, translation generation, analytics markers, and SEO exports share files and contracts. The plan does not authorize a push, DNS change, or production deploy.
