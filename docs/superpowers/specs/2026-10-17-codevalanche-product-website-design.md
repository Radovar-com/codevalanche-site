# Codevalanche product website redesign

**Status:** The user approved the visual direction and this written specification on 17 October 2026, then authorized autonomous implementation. A later explicit instruction, “aprob publica direct”, authorizes publication after the final checks through the existing deployment path. DNS, Cloudflare and account-provider changes remain outside this release.

## Purpose and success

Help developers understand what Codevalanche does, inspect credible examples, choose a supported way to work, and reach an honest installation or release-status destination. The site should make a Windows workspace with connected agents, separate accounts, local-model options and inspectable changes understandable without presenting ordinary category features as exclusive inventions.

The approved direction is related to Radovar: restrained editorial typography, warm surfaces, the existing Codevalanche wave mark and a teal accent. Actual product evidence occupies the first screen. Eight substantial product/education pages replace the current dependence on one long landing page; existing legal, changelog and account routes remain functional.

Primary audience: developers evaluating a desktop environment for AI-assisted coding, including people who already pay for Claude Code or Codex and people investigating local models. The first release remains truthful about public installer availability.

Success means a visitor can answer: What is this? Which agents/accounts can I use? What happens to my code? Can I install it now? What do I do first? These are usability criteria, not claims of measured conversion uplift.

## Starting point and preserved work

- Repository: `Radovar-com/codevalanche-site`; starting commit `0588481b688d55c998257422d5ec63b3148bc7e4`, matching remote main at inspection.
- Existing isolated checkout: `_worktrees/owned-analytics-site-20261015`; redesign branch `codex/codevalanche-website-redesign-20261017` preserves the complete preceding history.
- Keep static HTML/CSS/JavaScript and esbuild. Extend existing build, partials and locale tooling rather than migrating frameworks.
- Keep the existing Supabase project, account service v1, callbacks, auth policy, account translations and privacy boundaries. No database reset or identity migration.
- Retain the approved localization/security design from `2026-10-16-codevalanche-localization-security-discovery-design.md`. This specification is the separate visual/product-content follow-up contemplated there; it does not approve a Cloudflare or DNS cutover.
- Preserve 17 locales, Arabic RTL, the footer-only language picker, all established `.html` URLs and homepage fragment targets.
- Preserve SDK/CMP semantics and generated distribution provenance. Analytics remains disabled in previews and in any release lacking qualified collector configuration.

## Evidence and copy policy

The user-supplied benchmark is a strategy input. Its early criticism of missing real screenshots is superseded by the current website. Its proposed control-plane language is too close to super.engineering's existing positioning. Agents, subscriptions and parallel work are shared category capabilities; differentiation must come from explicit behavior and useful demonstrations.

Supported source claims include Claude Code/Codex subscription connections, separate accounts for those two agents, local models and localhost-compatible endpoints, multiple active conversations, file review, supported guarded Undo operations, runtime-specific permission modes and budgeted Claude/Codex conversation handoff. Source presence is not public installer qualification.

Do not claim automatic quota pooling/rotation, universal agent support, perfect context preservation, unlimited parallelism, a universal permission sandbox, all writes waiting for approval, unrestricted Undo or fully offline cloud-agent work. Grok and development-only DeepSeek Harness do not enter the public supported-agent strip. API providers and coding-agent integrations are distinct categories.

Existing screenshots show a sample task named “Show trip times in hours”, an approval request and provider settings. They are real application surfaces illustrating that example. A screenshot of an assistant saying tests pass does not independently certify a continuous run or test result. No existing screenshot demonstrates two connected subscription accounts; describe the supported behavior and add such a capture only when genuinely available. Do not fabricate connected status, live activity, testimonials, adoption numbers or benchmarks.

## Visual design

### Shared system

- Reuse the existing self-hosted serif and sans families, tightening display scale and vertical rhythm. Editorial serif carries short headings; sans carries actions, body text and product explanations.
- Preserve the wave logo and brand name. Use the existing teal family as one accent, warm paper in light mode and a coherent near-black surface in dark mode. Real app screenshots retain their own correct theme.
- Use an asymmetric grid with a readable text column and a larger product column. Avoid repeated identical three-card rows, decorative landscape imagery and fake terminals.
- Header stays sticky with a restrained scrolled state. Primary navigation is Product, How it works, Agents, Docs, plus the existing Sign in and a manifest-aware release action. Product links to the homepage product section. Changelog moves into the resource/footer paths while its route remains unchanged.
- Keep ordinary, clear buttons without decorative diagonal arrows. Maintain keyboard focus, adequate hit areas and visible active-page treatment. Keep language and theme controls in the footer.
- Motion clarifies state: short opacity/transform transitions and deliberate screenshot changes on selection. No scroll hijacking, automatic tour cycling or motion that delays access. Respect reduced motion and preserve layout when fonts/images load.

### First screen

At desktop sizes, headline/body/actions occupy approximately five columns and the product image seven. The image must show meaningful application detail in the initial 1366 × 768 and 1440 × 900 viewport. It must not begin below a large block of empty space.

On mobile, stack short copy, actions and the product image. At 390 × 844, a meaningful portion of the product image and the primary action should be visible without scrolling once any consent overlay is dismissed. At 320 px and with longer translations, prioritize readable content and working controls over forcing an arbitrary fold height. Use no fixed-height clipping.

Approved headline:

> From prompt to a change you understand.

Body:

> Work with Claude Code, Codex and supported local models in one Windows app. Choose a connected account, follow progress and inspect the changes.

The phrase “Choose a connected account” applies where the integration supports account selection. Detailed pages name Claude Code and Codex explicitly.

## Page architecture and content

Eight core pages are the homepage plus seven new directory routes. Existing changelog, privacy and terms add three more canonical public pages; together they produce 11 × 17 = 187 localized public page variants. Account routes are separate and remain noindex.

| URL | Page title | Core job |
| --- | --- | --- |
| `/` | Codevalanche | Explain the product, show the workspace and lead to the next useful action |
| `/how-it-works/` | How Codevalanche works | Explain one concrete task from brief through inspected result |
| `/agents/` | Agents and connections | Explain supported agents, setup requirements and integration differences |
| `/features/multiple-accounts/` | Multiple Claude Code and Codex accounts | Explain account separation and selection without confusing website login |
| `/local-ai/` | Local AI in Codevalanche | Explain supported local execution, setup choices and hardware/provider limits |
| `/docs/` | Getting started | Provide an actionable early-access quickstart and troubleshooting |
| `/download/` | Download and release status | Give qualified availability, installation requirements and the next step |
| `/security/` | Security and data boundaries | Explain local files, connected providers, credentials, permissions and review limits |

### Homepage

1. **Hero:** the copy above, a real reviewed-task image, primary demonstration action and concise release-status text.
2. **One example:** a visual sequence of Brief, Execution, Approval and Review. Existing imagery may show discrete states of the sample task; call it an example, not a live demo or a verified continuous recording. Each state changes the visible crop, explanation and caption. Provide an accessible static reading order and deep links to How it works.
3. **Agent and connection choice:** distinguish subscription agents, API connections and local models. Short summaries link to Agents and Local AI. Specific setup/availability details live on those pages.
4. **Accounts and continuity:** “Keep work and personal accounts separate.” Explain supported Claude/Codex account selection; link to Multiple accounts. A separate paragraph explains supported handoff with bounded carried context, without promising quota pooling.
5. **Progress, permission and review:** show actual task status and the exact approval surface. Explain the difference between granting a command permission and reviewing edits. Keep parallel-conversation claims proportionate.
6. **Start and availability:** three clear steps: obtain a qualified build when available; connect a supported agent/model; open a project and try a small task. Link to Docs and the manifest-driven release destination.
7. **Questions and footer:** concise answers to account requirements, subscriptions versus API charges, code leaving the PC, local hardware, supported systems and current download availability. Include support, legal, company, changelog, cookies, language and theme access.

Preserve historical anchors and semantic sections. Where a historical section becomes shorter or moves into the overview, retain a meaningful corresponding summary and link rather than leaving an empty marker. Keep the exact page-to-section map consistent with final DOM content.

### How it works

Headline: **Give the task a brief. Follow it through.**

Explain the sample request to show trip durations as hours and minutes. Four chapters show opening the project, choosing a connected agent/model, following execution and any approval request, then inspecting changed files and the diff. Captions distinguish an assistant summary from independent test evidence. Include what to do when a task needs input, needs permission or needs another pass. Show no synthetic live console or invented results. End with links to the quickstart, supported agents and release status.

### Agents

Headline: **Choose the agent. Understand the connection.**

Use separate sections for subscription coding agents, API providers and local runtimes. The source-supported agent matrix names Codex, Claude Code, Gemini CLI and ZCode, with release qualification clearly separated from source integration. Codex is bundled in the inspected implementation; the others require an external installation. Show requirements, supported authentication, account selection where verified, runtime-specific permissions and limitations. Do not infer equivalent tools or multiple-account support for every provider from a logo.

Provide Codex and Claude Code setup sections with stable anchors, linked from Docs. They do not require thin separate agent pages in this first release. Explain that provider subscriptions/usage charges are the user's own. Link Local AI and Multiple accounts in context.

### Multiple accounts

Headline: **Keep work and personal accounts separate.**

Explain separate Claude/Codex sign-ins and exact account selection for a run. Distinguish the Codevalanche website account from provider credentials. Explain connection status, unfinished sign-in, supported connection capacity and what happens when a provider reports a limit. Do not imply automatic account cycling or pooled quotas. Document supported handoff as a separate action with bounded transferred context. Use a genuine multi-account capture if obtainable; otherwise use clear text and existing relevant settings imagery labeled accurately.

### Local AI

Headline: **A local model, on the machine you choose.**

Explain the built-in local runtime, LM Studio and compatible local OpenAI-style servers, with compatibility and configuration boundaries. Show the actual local-model selection surface. Explain that memory, model size and hardware affect suitability; avoid a universal RAM or performance promise without release-specific evidence. Distinguish model download/setup from inference and distinguish local inference from choosing a cloud agent. Troubleshooting covers server reachability, model compatibility and inadequate resources. Link to privacy/security and quickstart guidance.

### Docs

Headline: **Start with one small change.**

Provide a complete early-access quickstart: check release status and supported platform; install a qualified build when available; connect a supported agent/account or local runtime; open a disposable example project; write a narrow request; inspect activity and permission requests; read the diff and test/check the result. Installation/download steps must reflect the manifest's actual availability.

Separate task-oriented instructions from reference sections. Include troubleshooting for missing external runtime, incomplete provider sign-in, provider limits, local-server connection failure, waiting-for-approval status and recovery/resume limitations. Link to current support channels. Do not publish commands that have not been checked against the chosen release/setup. No dead-end “coming soon” articles.

### Download

Headline when unavailable: **Codevalanche for Windows. Public installer in preparation.**

One shared renderer reads the server-owned manifest for this page and the retained homepage download summary. Do not hardcode a local developer build, substitute a schema version for an app version, or turn a build folder into a public release.

When unavailable, show the status first and offer the product walkthrough, quickstart and support contact. No disabled button pretending to start a download, fake waitlist or newly created email collection service. macOS/Linux are not downloadable and are not presented as imminent without qualified roadmap evidence.

When a qualified Windows asset exists, show its approved platform, architecture and download source, plus only verified requirements/install steps. Display version, size, checksum or other optional details only when reviewed release metadata actually supplies them; the current manifest does not define those display fields. Omit absent fields rather than deriving a version from a schema version, release ID or filename. This first implementation retains build-time embedded manifest delivery and introduces no release-lookup service or unreviewed manifest extension. The native download link uses the approved gateway/asset and retains download metadata. Other qualified platforms can appear only when present in that manifest and supported by their release evidence.

### Security

Headline: **Know what stays local. Know what you connect.**

Explain the repository on disk, provider context sent when using cloud agents, local inference boundaries, provider credentials and isolated account configuration, website account versus agent authentication, runtime-specific permission modes and review/Undo limits. Distinguish the embedded browser from remote access. Android remains a separately qualified preview with concrete limits, not a broadly available remote product. Link to the existing legal/privacy information and security contact. Do not imply audited certification, universal isolation or absolute non-exfiltration.

## Availability and action behavior

| State | Homepage primary action | Secondary/release action | Measurement meaning |
| --- | --- | --- | --- |
| No qualified installer, current state | See how it works → `/how-it-works/` | Windows release status → `/download/` | Navigation or release interest, not a download |
| Qualified Windows installer | Native approved Download for Windows link | See how it works → `/how-it-works/` | Dedicated download click intent, never claimed as completed install |
| Non-Windows visitor without a qualified platform | See how it works | Available releases → `/download/` | Useful navigation; no false compatible installer |
| Missing/invalid embedded release configuration | Keep useful product/docs navigation | Explain release information is unavailable | No dependency on account or analytics APIs; no invented download target |

The manifest is embedded at build time, not fetched from account or analytics services. A valid empty manifest means installer in preparation; missing or malformed configuration means release information unavailable. Availability text sits beside actions rather than being discovered only after a long scroll. Do not require website sign-in to view product education. Existing sign-in/account flows keep their current service contract.

## Architecture and data flow

### Pages and localization

Extend `MARKETING_PAGES` as the single source for source file, canonical route and page ID. Fix directory route normalization together with additions: `/agents`, `/agents/` and `/agents/index.html` resolve consistently, including localized and nested feature paths, while existing `.html` URLs retain their canonical form.

Use existing shared partial injection and recursive export. Derive runtime marketing membership and translation source files from the same registry instead of adding another hardcoded page allowlist. Preserve query/hash during legitimate language-link rewriting and keep account callback normalization separate.

Every in-scope public string, alt text, metadata value and accessible label has English plus the existing 16 complete catalogs. Production builds fail on missing translations; no silent English fallback or pretend translated page. Preserve language context for all new routes, Arabic logical layout, CJK line breaks and expanded text. Existing account translation keys and consent copy remain intact except shared navigation strings that genuinely change.

### Analytics and consent

Add page IDs `how_it_works`, `agents`, `multiple_accounts`, `local_ai`, `docs`, `download` and `security` to the shared browser/backend registry. Extend section registries and `PAGE_SECTION_SCOPE` for actual opportunities on each page. Retain existing IDs for unchanged semantic actions and preserve historical IDs in the catalogs. These are additive identifiers, not a new event schema or a reason to reset data/retention.

Keep a single CMP/client, website W independent of account A/P4, and functioning refusal/revocation. Preserve native navigation and exactly one semantic action for download, account entry or contact. A release-status visit is not `download_clicked`. Product tour selection emits only a registered semantic selection on a real state change. Add `task_brief`, `task_execution` and `command_approval` feature/selection identifiers for the new task-tour meanings, with matching browser/backend registries and fixtures. Retain `review` only for the same review meaning; do not relabel historical `project`, `agents` or `local_first` events as new workflow steps. Keep the existing event shape. Do not collect DOM text, prompts, account emails or raw URLs.

Bump pageVersion for this material redesign without changing metric definitionVersion. Regenerate/check the common SDK and paired Radovar distribution when the shared registry changes; do not manually edit bundles. Carry paired source updates into delivery without publishing unrelated Radovar visual changes. Maintain collector disabled/configuration truth throughout preview; activation is a separate qualified operation.

### SEO, security and delivery

Reuse the current locale SEO generator: route-specific titles/descriptions/canonicals, Open Graph/Twitter, reciprocal hreflang and x-default, sitemap and structured public page metadata. Homepage title is Codevalanche; interior pages use their topic and Codevalanche. Preserve branded social artwork and favicon. Account/auth routes stay noindex.

Update the discovery index with the new public routes. Comparisons, pricing, broad research/blog hubs and speculative roadmap pages are outside this first release. They require factual substance and a separate verified content brief.

Build final HTML before CSP hashes, retaining charset and all existing approved origins. New interactive modules remain first-party. No new tracker, CDN script, translation service, analytics provider or framework dependency is required. This design does not activate the prepared Cloudflare worker, change DNS, publish a release artifact or modify Supabase settings.

## Acceptance and verification

1. Desktop/mobile, both themes: useful product evidence and primary action near the top; no horizontal overflow or clipped content at 320, 390, 768, 1024 and 1440 px. Verify longer translations and RTL, not just English screenshots.
2. All eight core pages contain substantive, factual content and useful next steps. Existing legal/changelog/account routes and homepage anchors continue working.
3. Current empty manifest produces honest unavailable status everywhere. A local qualified-manifest fixture proves the alternative native download link/metadata state. No fixture enables production telemetry or exposes a real unqualified installer.
4. Route tests cover directory aliases, nested paths and locale equivalents. Locale checks cover all 187 public page variants, complete catalogs, reciprocal language links and correct metadata; account pages retain their previous contracts.
5. Browser tests cover keyboard tour navigation, focus, mobile menu, theme persistence, language switching with context, cookie controls and native links. Tour/images remain understandable without animation; ordinary navigation and downloads work without analytics.
6. Analytics tests validate exact page/section attribution, denominator scope, one event per action, consent gates and failures. Shared SDK distributions match their generated manifests.
7. Run existing appropriate build/localization/marketing/security/SEO checks and affected account-navigation regressions. Account backend tests expand only if a real account integration change requires them.
8. Lighthouse targets are at least 90 Performance and 95 Accessibility/SEO/Best Practices on representative mobile pages. Record actual results and conditions; targets are not guaranteed scores or real-user Core Web Vitals. Browser errors, dead links, broken primary actions and incorrect product claims are release blockers even if a score is high.
9. Deliver a local preview, screenshots at desktop/mobile sizes in both themes, source commits and a concise report of measured checks and remaining limits. Production publication requires the separate requested review/release step; no DNS/provider activation is bundled into design approval.

## Design review

The user-approved concept is fully represented: Radovar-related identity, visible product on the first screen, demonstrative task flow and the eight specified pages. The written specification makes availability, source-versus-release proof, localization, route normalization and analytics continuity explicit. The user approved this document and the autonomous execution method; direct publication was subsequently authorized without a DNS/provider cutover.
