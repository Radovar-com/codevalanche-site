# Maintaining the Codevalanche product website

The product website uses the existing static HTML/CSS/JavaScript build. Its marketing pages, locales, download behavior and owned analytics are connected. A visual change is complete only when the changed user flows still work and their semantics remain correct.

## Pages and translations

- `src/locales/manifest.js` is the public page registry. Keep route, source file, stable page ID and locale equivalents together. Directory routes accept their registered slash, no-slash and index aliases; account callbacks stay outside marketing resolution.
- `scripts/build.mjs` and `scripts/marketing-partials.mjs` inject shared navigation/footer. Keep homepage section links in-page and mark current navigation accurately on detail pages.
- New English prose, metadata, alt text and accessible labels require `node scripts/translate-site.mjs extract`, then complete updates to the other sixteen catalogs. Retain existing translations by unchanged source key and remove stale keys. Run `node scripts/translate-site.mjs check` before the full build.
- `CODEVALANCHE_PREVIEW_ENGLISH_ONLY=1` is for local iteration only. It must not be used for a publishable build or reported as full localization verification.
- The footer language picker preserves the current page. Keep Arabic RTL and long/CJK text readable, and keep the account callback contract independent of marketing locale paths.
- Keep `scripts/asset-cache.mjs` after bundling and before CSP generation. It versions stylesheet/script entries and their shared module graph together; locale catalog requests use the document revision. Entry-only versioning can leave returning visitors on an older dependency or translation catalog. Preserve the generated SDK bytes and final account/config content hashes, and run the asset-cache/runtime regressions when changing this step.

## Product facts and evidence

- Runtime support in the desktop source is different from qualification of a public installer. Do not publish a local developer EXE merely because it exists.
- Separate subscription coding agents, API providers and local inference. Do not imply all integrations have identical tools, sign-in or multiple-account behavior.
- Multiple-account and handoff claims must name supported integrations and preserve their limits. Avoid promises of automatic quota pooling, unlimited connections or perfect transferred context.
- Permissions belong to the selected runtime and mode. Some modes write directly. Review and guarded Undo do not imply every operation waits for approval or that every external effect is reversible.
- Existing screenshots illustrate a sample task and real settings surfaces. Provider rows marked Not connected are not evidence of connected accounts. Assistant text saying tests pass is not independent test evidence. Never fabricate live activity, testimonials, release metadata or adoption figures.

## Release actions

- The shared approved manifest is `supabase/functions/_shared/download-manifest.json`, embedded at build time. `src/downloads.js` and `src/release-actions.js` render native qualified actions independently of analytics and account APIs.
- Valid empty configuration means public installer in preparation. Invalid or missing configuration means release information unavailable. Keep all availability sentences under the shared `[data-release-status]` hook and release headlines under `[data-release-heading]` where appropriate.
- `[data-release-primary]` starts as useful native fallback navigation. Only a qualified, compatible asset may replace it with a real download link. Preserve platform/release/artifact/architecture metadata on actual links.
- Never infer application version from manifest schema version, release ID or filename. Optional file details require reviewed release metadata.
- A release-status visit is navigation. A download click is intent. Neither proves installation, activation or login.

## Analytics and accounts

Read [the redesign analytics playbook](owned-analytics-redesign.md) and the canonical repository AGENTS instructions before changing controls or sections.

- The same meaning keeps the same identifier. A new page/section/selection requires synchronized browser registry, backend contract and metric scope changes; HTML attributes alone do not register it.
- Task-tour selections use `task_brief`, `task_execution`, `command_approval` and the existing `review` meaning. Do not reuse historical `project`, `agents` or `local_first` meanings for different workflow stages.
- `PAGE_SECTION_SCOPE` must match actual final markup, including the common measured footer. Do not remove opportunities merely because no exposure event was received.
- Keep one CMP/client, website W separate from account A/P4, functional refusal/revocation, native navigation and one semantic event per action. Optional SDK failure must not break the site.
- Bump pageVersion for material presentation changes without silently changing metric definitionVersion. Regenerate and check both Codevalanche and Radovar SDK distributions when their shared registry changes.
- Keep the real activation state. Preview does not enable public collection, alter the account service, change Supabase data or authorize a DNS/provider cutover.

## Verification

Run the affected routing/release/catalog tests, full locale check/build, `scripts/marketing-browser-test.mjs`, `scripts/product-website-browser-test.mjs`, `scripts/locale-browser-test.mjs` and `scripts/website-analytics-test.mjs` as appropriate to the change. Use explicit local fixtures for auth/telemetry/download state tests; do not send synthetic events to production.

Check representative desktop/mobile light/dark and RTL/CJK output. Preserve the old homepage anchors and `.html` routes. Report actual measured checks and limitations. Preview completion and production publication are separate delivery steps.
