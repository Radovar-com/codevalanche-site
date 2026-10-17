# Codevalanche product website implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver and publish the approved eight-page, product-first Codevalanche website after full checks, preserving accounts, 17 locales and analytics semantics.

**Architecture:** Extend the existing static marketing registry, shared partials and locale pipeline. Keep the same download manifest, account service and consent-gated SDK; share a first-party download renderer between home and the download page. Workstreams own disjoint files; root coordinates English-content freeze, generated catalogs, integrated builds and preview.

**Tech Stack:** Existing HTML/CSS/JavaScript, esbuild, parse5, Playwright and local JSON translation catalogs; existing project dependencies and lockfile.

**Spec:** `docs/superpowers/specs/2026-10-17-codevalanche-product-website-design.md` (approved by user on 17 October 2026).

## Global constraints

- Eight core routes: `/`, `/how-it-works/`, `/agents/`, `/features/multiple-accounts/`, `/local-ai/`, `/docs/`, `/download/`, `/security/`. Preserve existing `.html` and account routes and homepage fragment targets.
- New page IDs: `how_it_works`, `agents`, `multiple_accounts`, `local_ai`, `docs`, `download`, `security`. New tour IDs: `task_brief`, `task_execution`, `command_approval`; retain `review` for the same review meaning.
- Homepage headline: “From prompt to a change you understand.” Body: “Work with Claude Code, Codex and supported local models in one Windows app. Choose a connected account, follow progress and inspect the changes.”
- Preserve wave logo, self-hosted fonts, warm paper/teal identity, footer language/theme controls, reduced-motion behavior and keyboard access. No decorative diagonal-arrow button styling.
- All 17 locales stay complete; fail on missing/stale catalog entries. Do not contact translation APIs or silently fall back to English. Arabic remains RTL.
- Existing valid empty embedded manifest means installer in preparation. Missing/invalid embedded manifest means release information unavailable. Do not publish local developer installers, invent release metadata or create a release lookup service.
- No Supabase/account service changes, DNS/Cloudflare activation, new tracker or analytics activation. No new product dependencies. Keep website W and account A/P4 independent. The user's later direct-publication instruction authorizes the existing deployment path after verification.
- Preserve other workers' changes. Workers do not build shared dist or commit concurrently; root performs integrated builds and serial commits after ownership-scoped verification.

## Review focus

- Deep nested locale paths and `/index.html` aliases must preserve the intended page and query/hash.
- A disabled or broken analytics leaf cannot break navigation, login, product tour or download status.
- Empty/invalid/qualified release configurations must never generate a misleading or unapproved download link.
- New tour meanings must not overwrite historical feature IDs or double-count selections/download intent.
- Long translations, Arabic RTL and 320 px screens must keep actionable controls and readable image/context.

## Execution

The user explicitly authorized writing the plan and autonomous implementation through preview, then requested direct publication. Independent tasks 1–3 run in parallel on disjoint ownership, while root handles task 4. Task 5 starts only when English source freezes. Root serializes Git staging/commits and final generation to avoid shared-index/output races. Publication uses the canonical company source repository and the existing personal Pages deployment mirror; the domain attachment and DNS remain intact.

### Task 1: Directory routes and locale plumbing

**Owner:** route/localization worker. **Files:** `src/locales/manifest.js`, `src/locales/runtime.js`, `scripts/translate-site.mjs`, `scripts/build.mjs`, `scripts/locale-export.test.mjs`, `scripts/locale-runtime.test.mjs`, `scripts/localization.test.mjs`, relevant new routing tests. Do not edit catalogs, HTML pages, shared CSS, account source, analytics registries or generated output.

**Interfaces:** MARKETING_PAGES adds `{path,file,pageId,priority}` for the seven new directory routes; source file is the route's `index.html`. `resolveMarketingRoute(pathname)` returns the existing `{locale,pathname,pageId}` shape with canonical directory slash retained. `localizedMarketingPath(pathname,targetLocale)` preserves the equivalent page. Derive runtime page membership and translation source lists from the manifest. Shared partial injection should mark current route in navigation and preserve home hash-only links.

- [ ] Add failing routing tests for English/locale/nested paths, slash/no-slash/index aliases, query/hash rewriting and unchanged `.html`/account behavior; run and observe failure.
- [ ] Implement normalization and central page membership without broadening account callback rules. Update extraction source registration additively, retaining explicit account files.
- [ ] Replace hardcoded sitemap count 68 with the registry-derived expectation; assert new directory paths and 187 canonical variants.
- [ ] Run affected locale unit tests, report red/green evidence and changed files. Do not run integrated build or write catalogs; route-source HTML is produced concurrently.
- [ ] Root reviews/commits the scoped task after integration; worker writes a report to this plan's scratch directory.

### Task 2: Seven substantive product pages

**Owner:** content/pages worker. **Files:** create `src/how-it-works/index.html`, `src/agents/index.html`, `src/features/multiple-accounts/index.html`, `src/local-ai/index.html`, `src/docs/index.html`, `src/download/index.html`, `src/security/index.html`; create `src/product-pages.css`. Update `src/llms.txt`. Do not edit homepage, shared styles/partials, scripts, registries, catalogs or dist.

**Interfaces:** Each source page has one H1, factual metadata, standard site-header/site-footer comment slots, `/styles.css` and `/product-pages.css`, existing theme bootstrap, and bottom config.js/downloads.js/site.js includes in current order. Use root-relative source links; locale build rewrites them. Main content uses stable classes `product-page`, `page-intro`, `page-body`, `page-section`, `page-grid`, `page-aside`, `page-figure`, `page-next` and semantic analytics markers. Reuse existing CSS tokens, real assets and accessible native HTML. No per-page inline scripts. Download page uses renderer hooks from Task 3.

- [ ] Follow the approved per-page headlines/content in the spec. Reuse exact existing well-translated factual phrases where natural, without making pages duplicate summaries or reducing substance. Keep new prose concise and useful; preserve absolute-claim limits.
- [ ] Build an editorial detail-page layout with relevant real product images, concrete setup/limitations and useful next links. Distinguish agent integrations/API providers/local inference and website account/provider accounts.
- [ ] Use measured IDs from Task 3: page sections are existing registered semantic IDs where meaning matches; any genuinely needed new section is coordinated with that worker before use. Add no arbitrary analytics tag.
- [ ] Download page contains `data-release-status`, optional `data-release-primary`, `data-dl-platform="windows"` with a `.dl-card-state` status child, plus docs/walkthrough fallback links. Do not hardcode a downloadable artifact or version.
- [ ] Run source parsing/link existence checks when other workers' routes are ready; root handles final build/browser checks. Report total new translatable strings and needed additional screenshot evidence, without claiming invented connected status.

### Task 3: Analytics continuity and shared release actions

**Owner:** analytics/download worker. **Files:** `src/analytics/core/registry.js`, `supabase/functions/_shared/websiteAnalyticsContract.ts`, `supabase/functions/_shared/metricDefinitions.ts`, `src/downloads.js`, new `src/release-actions.js`, `scripts/analytics-page-catalog.test.mjs`, relevant new release-action tests/browser fixture, `src/locales/runtime-strings.en.json`. Own paired generated SDK/manifest only after source stabilizes. Do not edit homepage/site.js/shared styles/partials/new HTML/catalogs/build.mjs/account service.

**Interfaces:** Register all new page/tour IDs above and map each page's sections to actual markup. Existing feature_selected event shape stays unchanged. Expose shared native release rendering from downloads.js after establishing `window.CODEVALANCHE_DOWNLOAD_LINKS`, using `DOMContentLoaded` safely. Hooks: `[data-release-primary]` is an existing fallback anchor to `/how-it-works/` that becomes an approved native Windows download only when qualified and compatible; `[data-release-status]` starts with truthful static status; `[data-dl-platform] .dl-card-state` becomes a native link only for approved matching entries. Existing homepage download inline script will be removed by root. Translate dynamic labels via current locale runtime; include new dynamic strings in runtime-strings.en.json before source freeze.

- [ ] Add failing contract/catalog tests for the seven routes/new tour IDs, unchanged historical IDs, exact scopes and malformed identifiers.
- [ ] Add failing behavior checks for empty/missing/invalid embedded config and an explicit approved-manifest fixture, including unknown/mobile/non-Windows user agents and no event emitted as download for a fallback navigation.
- [ ] Implement shared rendering using existing `downloadLinks` qualification, no network service, no inline HTML injection and no misleading inferred app version. Preserve native href and `data-download-platform/release/artifact/architecture` on actual links. On non-Windows keep useful release information; don't guess unsupported downloadable compatibility.
- [ ] Keep the SDK/config disabled, pageVersion update delegated to root, and account W/P4 untouched. Coordinate the page-section map with Task 2 and root.
- [ ] Regenerate/check C SDK and the existing Radovar distribution pair in `_worktrees/owned-analytics-radovar-20261015`, preserving unrelated Radovar edits. Test affected common contracts/SDK behavior; report hashes, tests and exact R files changed. Do not deploy or commit shared R files without root coordination.

### Task 4: Homepage and shared presentation

**Owner:** root. **Files:** `src/index.html`, `src/styles.css`, `src/site.js`, `src/partials/header.html`, `src/partials/footer.html`, `src/config.js`, affected marketing browser tests and new product-tour browser checks. Do not edit task 1–3 owned source concurrently.

**Interfaces:** Use Task 3 renderer hooks and IDs. Retain current home fragment targets and meaningful section markers. New workflow states map to `task_brief`, `task_execution`, `command_approval`, `review`; keep historic project/agents/local_first meanings on relevant preserved selections if retained. Shared nav links use the new directory routes; account link remains `/account/`.

- [ ] Add failing browser assertions for product visible in the first viewport, honest prelaunch CTA destination, keyboard tour state transitions, no duplicate feature event and native links surviving SDK failure. Unit tests are not required for static copy/CSS alone.
- [ ] Recompose hero into text/product columns, apply approved copy and availability, and make the real product image visible near the action. Keep theme twins/responsive sources and meaningful alt/captions.
- [ ] Tighten the homepage story, preserve all historical anchors/semantic IDs with actual content, link to the new detail pages and remove false universal approval claims, including metadata.
- [ ] Add accessible four-state task tour, concise useful FAQs, shared page navigation and clear footer resources. Remove old homepage inline download renderer and use shared downloads.js. Keep account/consent controls functional.
- [ ] Set pageVersion to `codevalanche_product_20261017`; retain analytics enabled:false and baseUrl empty. Finish English text before task 5 and record a source-freeze fingerprint.

### Task 5: Complete translation catalogs

**Owner:** translation workers in disjoint language groups after English freeze. **Files:** `src/locales/en.json` (root generates), then individual locale JSON files only. Root retains source/build ownership. No external translator service.

**Interfaces:** Run extract once after tasks 1–4 English text is stable. Reuse all existing approved translations by identical source key, remove stale keys, and author translations for genuinely new keys with preserved product/provider names/placeholders. Do not put English into translated entries as a shortcut or split source text unnaturally to evade translation.

- [ ] Root extracts the exact final source catalog and creates a new/missing-key report for each locale. Worker groups own disjoint JSON files and read this frozen catalog.
- [ ] Translate all new strings and metadata in Arabic, German, Spanish, French, Hindi, Indonesian, Italian, Japanese, Korean, Brazilian Portuguese, Romanian, Russian, Turkish, Vietnamese, Simplified Chinese and Traditional Chinese. Preserve placeholders and semantics of availability and consent.
- [ ] Validate each owned catalog structurally, scan untranslated prose and placeholder changes, and report language QA limits honestly. Root runs locales:check and actual rendered RTL/CJK/long-language checks after integration.
- [ ] Freeze is lifted only through root; any later English changes get an explicit synchronized translation correction before final build.

### Task 6: Integrated quality and preview delivery

**Owner:** root with independent code review. **Files:** affected existing marketing/locale/analytics browser checks, targeted new product website integration test, saved QA artifacts and delivery report. Source fixes follow ownership where practical.

- [ ] Run locales:check, full static build and affected routing/locale/download/catalog tests; inspect actual CSP/SEO output for all187 public variants and unchanged noindex account routes. Pin any real regression before rerunning.
- [ ] Run actual production-output browser checks for all core pages, desktop/mobile, light/dark, keyboard, language/deep-link context, W consent, returning preferences, disabled/failed SDK, download states and unchanged account navigation.
- [ ] Run owned website analytics regression with explicit local-only fixtures and check C/R generated SDK identity. Do not send real analytics or auth mutations to production.
- [ ] Capture desktop/mobile light/dark evidence and representative Lighthouse results. Report actual scores; fix material findings and broken actions rather than chasing noise.
- [ ] Request an independent review of the exact branch diff from starting commit0588481, with spec and test evidence. Resolve important findings, then commit final coordinated sources/catalogs/tests serially.
- [ ] Keep the loopback preview at port4280 available. After verified checks and review, integrate the source through a company-repository PR and fast-forward the existing personal deployment mirror to the same main commit; verify its Pages workflow and live domain. Open the published result in the in-app browser. Report what is ready, tested and still unavailable. Do not change DNS or activate external services.
