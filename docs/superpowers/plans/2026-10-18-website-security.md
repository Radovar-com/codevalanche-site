# Website Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Tasks below have disjoint ownership; root serializes builds, commits and deployment.

**Goal:** Harden and publish Codevalanche.com and Radovar.com with verifiable public, account and operational protections.

**Architecture:** Retain the existing static exports and account API. Add host-level headers, gated publication and targeted additive authentication fixes. Qualification uses identified staging first and read-back probes; no wholesale backend migration.

**Tech Stack:** Pinned Node24, static HTML/esbuild, Next static export, Supabase Auth/Postgres/Edge Functions, GitHub Actions/Pages and an authenticated edge/DNS administration surface.

**Spec:** ../specs/2026-10-18-website-security-design.md

## Global Constraints

- Preserve analytics enabled:false/baseUrl empty, v1 account selection, current page semantics, native actions and design.
- Never output/store credentials, raw PII or database dumps in source/public artifacts.
- No new costs, production restore/reset, blind config push or staged-to-production claim.
- Preserve existing work; use existing C/R worktrees and a new security branch.
- User explicitly approved autonomous implementation/publication; no repeated approval gate for already authorized work.

## Review Focus

- A healthy edge response must retain bytes/status/redirect/cache while adding real HTTP protections.
- Browser SDK unavailability/refusal must leave navigation and consent usable, including versioned URLs.
- Old MFA proof, new factor enrollment, partial provider failure and replay must fail closed with recoverable retries.
- PR builds must have no deployment privilege or dependence on cross-repo secrets; required checks must actually run.
- A backup or SQL fixture cannot be labeled a full restore without Auth/roles/config/storage qualification.

### Task1: Public hosting and publication protection — root

Files: cloudflare/security-headers.mjs,worker.mjs,wrangler.toml; .github/workflows/deploy-pages.yml; .gitignore; scripts/workflow-security.test.mjs and public security probes. R adapter owned by R worker.

- [ ] Add negative workflow/header tests, observe failures, implement least-privilege PR/build/deploy split and run affected suites.
- [ ] Apply/read back GitHub secret scanning, push protection and main branch rules after known check contexts exist.
- [ ] Identify live DNS/edge access; deploy a no-body-rewrite adapter and check real HTTPS/header/redirect/account responses. Keep explicit blocker if access is unavailable.

### Task2: MFA resilience and freshness — auth worker

Files: supabase/functions/codevalanche-account/mfa.mjs,index.ts, shared assurance helpers if necessary; one new migration; focused SQL/handler tests.

- [ ] Reproduce old proof acceptance and consumed-code/provider-failure cases.
- [ ] Implement existing freshness policy and durable actor-bound recovery snapshot/reconciliation, preserving v1/v2 DTOs.
- [ ] Prove stale/fresh, partial deletion, retry, new enrollment and replay behavior with real SQL plus provider fixtures.
- [ ] Identify deployed function/schema, qualify in staging and deploy only the reviewed compatible delta after backup; read back deployed source/config.

### Task3: Radovar CI and analytics continuity — R worker/root registry

Files: R .github/workflows/deploy.yml, app/analytics/config.ts, browser harness selectors and adapter tests; C src/analytics/core/registry.js and backend registries/metric scopes.

- [ ] Add failing asset/version/header assertions and implement reviewed manifest query plus BASE_PATH support.
- [ ] Gate PR/build on browser security/refusal, pinned shared fixture and dependency audit; deployment only from main/manual.
- [ ] Register research/research_wave_ai in both registries and actual section scope; regenerate/check identical SDK distributions and maintain disabled collection.
- [ ] Run type/export/browser suites, review exact diff and publish R through its canonical company repository.

### Task4: Operational evidence — ops worker

Files: ops/, scripts/security-operations*.mjs and tests, docs/security-operations-20261018.md.

- [ ] Identify live/staging projects and read effective config/migration/function/backup metadata through existing authenticated tooling.
- [ ] Implement protected backup and explicit isolated restore qualification with fail-closed target guards and red/green tests.
- [ ] Execute feasible real backup/restore evidence without exposing data, and document remaining off-device/config/provider limits.
- [ ] Provide repeatable public probes and incident/rollback procedure, with meaningful absence/failure states.

### Task5: Integrated review, publication and final report — root

- [ ] Reconcile source ownership; run affected tests, full C/R builds and browser scenarios; obtain independent scoped review.
- [ ] Commit exact sources, create/attach PRs, merge only after gates, publish both and verify new versions publicly.
- [ ] Read back GitHub/hosting/backend changes; record evidence and distinguish remaining unqualified controls.
- [ ] Deliver a Romanian report with actual completion, residual risks, commands and recovery/maintenance ownership.
