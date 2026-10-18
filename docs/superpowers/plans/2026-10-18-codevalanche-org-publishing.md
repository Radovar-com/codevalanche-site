# Codevalanche Organization Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Root serializes production settings, DNS, commits and cutover; workers own explicitly assigned source or read-only audit files.

**Goal:** Make Radovar-com/codevalanche-site the only production website publisher and retain the personal repository as a read-only, recoverable archive.

**Architecture:** Predeploy the identical static site in the organization, then reassign the Pages custom domain and the www DNS target. Keep Cloudflare and Supabase intact; archive the old publisher after real acceptance.

**Tech Stack:** Existing pinned Node24/static export, GitHub Actions/Pages/OIDC, Cloudflare Free and unchanged Supabase account service.

**Spec:** ../specs/2026-10-18-codevalanche-org-publishing.md

## Global Constraints

- Preserve disabled analytics, native navigation, consent, account v1 URLs and deployed function version3.
- No new credential values in files/logs/chat; user enters any required new secret in GitHub.
- Never modify desktop application/repositories/releases; retain excluded links as documented dependencies.
- Archive personal site repository after acceptance; never delete that repository or rewrite history.
- Preserve Full (strict), security/disable-RUM rules, mail records, existing permissions and private rollback evidence.
- User has explicitly authorized implementation, publication and archive; do not add a repeated plan-approval gate.

## Review Focus

- Similar commits can contain different files: compare immutable tree IDs before mutation.
- Project preview has root-relative assets: qualify the artifact at the project prefix without publishing a broken asset-prefix change.
- Custom domains cannot be attached atomically to two repositories; old binding/certificate may not transfer. Predeploy and prepare rollback before release.
- A public website response may still come from the old publisher or cached DNS. Verify organization deployment plus bytes/revision and current authoritative DNS.
- Disabling old publishing must preserve rollback, source/history, mail/account endpoints and excluded desktop repositories.

### Task1: Dependency inventory and rollback baseline — read-only workers/root

Files: private `.superpowers/security-20261018/migration-source-inventory.md`, `migration-hosting-before.json`, rollback notes; public summary in `docs/codevalanche-publishing-migration-20261018.md`.

- [x] Compare both main tree IDs and capture Pages, environment, Actions, hooks and secret-name metadata without values.
- [x] Finish active-versus-historical dependency classification and exact reversible setting payloads.
- [x] Record current public SDK/revision, strict headers, account function and mail/DNS baseline; identify pending old resolver caches separately.

### Task2: Organization-only publication gate — source worker

Files: `.github/workflows/deploy-pages.yml`, `scripts/workflow-security.test.mjs`.

- [x] Add a failing repository/ref/event matrix: organization main push/manual may deploy; personal, PR, fork and non-main may not.
- [x] Run focused tests red, change only the deployment repository guard to `Radovar-com/codevalanche-site`, run green and inspect the two-file diff.
- [x] Root commits source/spec/plan/runbook, creates and attaches the organization PR; merge only after exact-head required checks pass. No personal mirror synchronization.

### Task3: Bootstrap and predeploy organization Pages — root

- [x] With existing authorized admin access, POST organization `/pages` with `build_type:workflow`, without cname. Create `github-pages` environment restricted to main; no custom deployment secret.
- [x] Let the reviewed organization main workflow publish once; check successful deployment ID and built artifact identity.
- [x] Verify default project URL HTML and each required asset at its project-prefixed path, documenting expected root-relative preview limitations.

### Task4: Domain handoff and acceptance — root

- [x] Read back original binding and rollback preimage immediately before cutover. Clear personal cname, assign organization cname consecutively.
- [x] Change only Cloudflare www target from `cata009.github.io` to `Radovar-com.github.io`; preserve proxy and all other record values.
- [x] Verify trusted origin TLS and custom-domain response identity; organization HTTPS enforcement remained enabled with an approved certificate. No rollback needed and no validation weakened.
- [x] Check homepage, account, security/privacy and native paths; compare SDK/config and account function version/source. Recheck public mail RRsets without claiming authenticated production flows or SMTP delivery.
- [x] Run strict public monitor from the canonical organization; all five pages passed with zero injected external scripts. Save sanitized readback and fresh public-DNS proof after retirement.

### Task5: Retire personal publishing and report — root/reviewer

- [x] Only after Task4 succeeds, disable personal Pages and its publishing workflow, then archive `cata009/codevalanche-site`; verify archived/read-only. Preserve code/history and rollback settings.
- [x] Search active website configuration for remaining personal publishing dependencies; document historical references, archive links and excluded desktop dependencies without modifying them.
- [x] Prepare the plain Romanian operational report: what moved, what remains, proof of the real publisher, exact rollback and verification limits. No later automatic deletion. Root delivers its link with the final response after documentation closure checks.
