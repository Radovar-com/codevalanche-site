# Security operations and recovery evidence — 18 October 2026

Production and staging remain separate. Publishing the websites or the minimal legacy account-function patch does not apply the staged account/analytics migration chain or enable public analytics. This document records operational evidence, a repeatable recovery workflow, and the limits still requiring qualification.

## Observed environments

| Evidence | Production `hvevaxsfeyiikjhcsafi` | Staging `umpybznthsfehmdvmfly` |
|---|---|---|
| Project identity | Codevalanche; active, eu-central-1 | codevalanche-analytics-test-20261015; active, eu-central-1; existing Free test project |
| PostgreSQL | 17.6 | 17.11 |
| Schema at the read-only checkpoint | Five legacy public tables; no migration ledger | 41 applied migrations; 41 public tables |
| Analytics retention | No `wa_maintenance_state` or `cron.job` | Scheduled job, logical state and latest scheduler run healthy; actual daily success `2026-10-18T02:17:00.549Z` |
| Provider backup metadata | No exposed completed restore point; PITR false | Same |
| Provider WAL flag | True; not evidence of an accessible restore point or a completed restore | Same |
| External alert delivery | Unverified | Unverified |

Local source contained additional unapplied migrations, including `202610160301` and `202610180001`, when inspected. They were **not applied** by this work. Never run an unreviewed bulk `db push`, migration repair, reset, password rotation or paid-feature activation as a consequence of this report.

Actual production authorization was queried separately from restore parity: all five tables have RLS enabled and FORCE RLS false; there are no table policies. Effective SELECT/INSERT/UPDATE/DELETE privileges are false for both `anon` and `authenticated`, including inherited grants, and neither client role is superuser or bypasses RLS. Both owned RPCs are SECURITY DEFINER with an empty search path: EXECUTE is denied to PUBLIC/anon/authenticated and granted to service_role. All eight assertions passed in `ops/security-operations-production-authorization-20261018.json`; `ops/security-operations-production-authorization.sql` is the metadata-only recheck. These are the actual legacy production controls, independently of the 41 staged migrations.

The existing Supabase CLI 2.117.0 authenticates through Windows Credential Manager target `Supabase CLI:supabase`. Read-only project, backup and fixed SQL probes use its normal credential handling. `ops/security-operations-auth.ps1` uses that existing credential in a short-lived process for a fixed Management API Auth GET; it outputs only permitted numeric/boolean settings and sanitized redirect URLs. No token, Auth key, response body, provider exception or user row belongs in an operational receipt.

## Provider password policy change

Both providers initially advertised a six-character minimum. The approved change set **only** `password_min_length` to 12, staging first and production after staging qualification. A direct staging Auth signup with a shorter password returned `422 weak_password`; a separate read-only query confirmed the synthetic address was absent from `auth.users`. No signup email or actual account creation was used to qualify this rejection.

Production readback at `2026-10-18T05:38:42Z` confirms 6 → 12. The staged first PATCH succeeded, but initial error-response parsing failed closed; a readback confirmed 12 and the corrected smoke passed before the production PATCH. The staging receipt therefore records an idempotent 12 → 12 readback. Existing password sign-in was not tested by weakening the setting.

The other observed controls were left unchanged: JWT lifetime 3,600 seconds, refresh rotation enabled with ten-second reuse interval, confirmation required, secure email change enabled, password-change reauthentication false, CAPTCHA false, HIBP false, TOTP enrollment/verification enabled, phone MFA disabled. Production still had the existing `https://codevalanche.com/account/**` redirect pattern. SMTP delivery, provider CAPTCHA and exact redirect tightening require separate flow qualification.

Receipts: `ops/security-operations-auth-production-20261018.json` and `ops/security-operations-auth-staging-20261018.json`.

## Hosted legacy candidate qualification

Only the owned staging function `codevalanche-account-security-qualification-20261018` was deployed. The existing shared staging account function was not overwritten. Each fixture used temporary admin-confirmed synthetic users; TOTP material, API keys, emails, user/session IDs and tokens stayed in process memory. Recovery claims were obtained through an admin-generated link and explicit verification, without SMTP delivery.

Actual verified native claims use string audience `authenticated`, the exact project Auth issuer, role `authenticated` and **no `token_use` field**. Password sessions have `aal1` and password AMR; verified TOTP has `aal2` with password/TOTP AMR; recovery OTP has `aal1` and OTP AMR.

The first candidate passed 11/11. An intermediate stricter candidate failed 14/21: generic factor `updated_at` advances during ordinary verification and can be later than the integer-second AMR timestamp. The live comparison confirmed the same factor across challenges, stable `created_at`, changed `updated_at`, and stable verified/TOTP status. The failure and provider receipts are retained; they do not qualify the corrected source.

The corrected three-file source, identified in `ops/security-operations-legacy-corrected-source-20261018.json`, passed **21/21** hosted checks at `2026-10-18T06:00:36Z`. Its receipt is `ops/security-operations-legacy-corrected-staging-20261018.json`. Checks include unauthenticated denial, own profile/current session, foreign-session denial, AAL1 admin denial, fresh native AAL2 admin access, factor replacement, old-factor token denial, exact RPC count support, block/unblock, both old sessions remaining denied after unblock, a newly authenticated session succeeding, fresh-primary deletion/cancellation and OTP-only deletion denial. Synthetic users/factors and owned rate buckets were deleted and absence checked. No production fixture, owner promotion or mail delivery occurred.

The provider itself rejected the old AAL2 token after the tested administrative factor replacement. That observation does not independently prove every application-side factor fence. Production had no `codevalanche_admin=true` users at its read-only checkpoint; the resulting vacuous “all admins enrolled” value is not owner MFA enrollment evidence. Production function publication belongs to the separate release receipt.

The isolated legacy production function was subsequently published at `2026-10-18T06:25:04Z`: `codevalanche-account` version 2 → 3, ACTIVE with `verify_jwt:false`. The fresh protected preimage matched the earlier version-2 backup byte for byte. The three-file candidate matched the 21/21 staging-qualified source after CRLF/EOF normalization; the only subsequent source commit was EOF formatting, `073f723ed26eec06b35e5a063d8b9a49a9836258`. Freshly downloaded production version-3 source matched all three candidate files **byte for byte** and matched that committed source after line-ending normalization.

Six unauthenticated/public negative checks passed both before and after deployment: missing GET/POST authorization and a synthetic invalid JWT return 401, disallowed Origin returns 403, unsupported PUT returns 405, canonical OPTIONS returns 204; expected denial bodies, no-store and CORS boundaries passed. No real production accounts, authenticated production sessions, mail or account/event writes were exercised. The post-deployment catalog remains five legacy tables without migration ledger, analytics maintenance or cron; only the function package `deploy/legacy-security` was deployed. Live public `config.js` still declares v1, production Auth and analytics disabled. No regression warranted rollback; protected old source and a deployable rollback configuration remain available.

Consolidated evidence: `ops/security-operations-legacy-production-release-20261018.json`, with separate preimage/source-readback, before/after function metadata, public negative smoke and post-deployment catalog receipts. This publishes the qualified legacy hardening; it does not deploy the staged modern package or qualify authenticated production flows.

## Backups and actual restore results

All data artifacts are outside Git in `%LOCALAPPDATA%/Codex/security-20261018/backups`, protected by an explicit ACL restricted to the current user, SYSTEM and Administrators. Files are AES-256-GCM encrypted with authenticated scope/project metadata. The random encryption key is protected by Windows DPAPI CurrentUser in `backup-key.dpapi`. This is a local protection mechanism, **not independently qualified off-device key recovery**.

| Artifact / test | Actual result | Limit |
|---|---|---|
| Staging native `pg_dump` custom archive | Captured read-only over `verify-full` TLS with PostgreSQL 17.11; encrypted size 832,081 bytes | Includes database objects/data accessible to the dump account; global role definitions, services/configuration, signing/encryption roots and Storage objects are separate |
| Native staging archive restore to bare local PostgreSQL 17.11 | Archive authenticated; actual restore failed `postgres_role_unavailable`; local server stopped | No full database/Auth restore claimed; compatible managed roles/extensions are not provisioned in the bare target |
| Production application snapshot | One read-only statement captured the five fixed legacy tables and actual owned columns, constraints, indexes, RLS, grants and functions after row/size bounds; encrypted size 15,425 bytes | No Auth rows, credentials, identities, factors, sessions or Storage objects |
| Production selected-scope native local restore | **Passed:** five tables, all row digests and owned schema/privileges/functions matched; production database not mutated | ID-only `auth.users` anchors and empty `auth.sessions` were explicit local scaffolding; not full Auth recovery. UTC timestamp presentation and SQL-function CRLF → LF were the only comparison normalizations |

Sanitized receipts are `ops/security-operations-backup-staging-20261018.json`, `ops/security-operations-restore-staging-20261018.json`, `ops/security-operations-backup-production-20261018.json`, and `ops/security-operations-restore-production-application-20261018.json`. Only encrypted artifacts, receipt metadata and the separately authorized private key-custody procedure may leave this machine. Never upload local PostgreSQL cluster directories, raw snapshots, process environments or DPAPI plaintext.

Actual artifact names and SHA-256 digests are in the backup receipts. The controller subsequently confirmed owner-only private Google Drive uploads and SHA-256 verification of the encrypted artifacts. Key custody remains local DPAPI; independent offline key escrow and recovery on another device are pending. `offDeviceRecoveryVerified:false` and `fullProjectRecoveryVerified:false` remain correct despite the off-site ciphertext copies.

Disposable native cluster servers were stopped. Their protected local directories were retained, and `cleanupComplete:false` is deliberate: automatic approval review rejected recursive deletion as “blocked by policy.” Some retained local drill clusters contain private application data. Do not expose, archive into a public artifact, or describe them as deleted.

## Repeatable commands

Use the repository-pinned runtime (CI Node 24.18.1); the local qualification runtime was Node 24.22.0. Point `SUPABASE_CLI` to the authenticated CLI executable if it is absent from PATH. Keep CLI debug logging off.

```powershell
node --test scripts/security-operations.test.mjs scripts/security-operations-auth-qualification.test.mjs
node scripts/security-operations.mjs
powershell.exe -NoProfile -NonInteractive -File ops/security-operations-auth.ps1 -ProjectRef hvevaxsfeyiikjhcsafi
```

Readiness exit 2 means evidence is incomplete; it is expected while full recovery and external alert delivery are unqualified. A provider outage becomes a bounded unavailable status, not a zero measured count. Logical maintenance failure and stale success are checked separately from SQL scheduler success. `--environment staging` or `--environment production` narrows the read-only probe.

```powershell
# Existing staging credential; no password is placed in an argument or printed.
powershell.exe -NoProfile -NonInteractive -File ops/security-operations-staging-backup.ps1 `
  -PasswordDpapiPath '<protected existing staging password.dpapi>'

# Existing authenticated CLI and local protected backup key, fixed production table scope.
powershell.exe -NoProfile -NonInteractive -File ops/security-operations-production-snapshot.ps1

# Never pass a remote target: the runner creates its own empty loopback database.
powershell.exe -NoProfile -NonInteractive -File ops/security-operations-local-restore.ps1 `
  -Artifact '<absolute protected production application .cvbak>' -ApplicationSnapshot

# Full archive restore is expected to refuse an incompatible bare target.
powershell.exe -NoProfile -NonInteractive -File ops/security-operations-local-restore.ps1 `
  -Artifact '<absolute protected staging .cvbak>'
```

Direct native capture supports only the policy-matched source host/user over port 5432 and `verify-full` TLS. Supply an approved absolute CA path with `SECURITY_SOURCE_PGSSLROOTCERT`; do not change to `require`, disable certificate verification, or rotate a provider database password to make a test pass. The Supabase CA URL was verified against its official Studio custom-content source. Neither the system nor the Git CA bundle trusted this private CA; the vendor CA succeeded. PostgreSQL 17.11 portable binaries were downloaded through the official PostgreSQL → EDB distribution path, outside the repository.

The archive restorer accepts only `127.0.0.1`, the generated `security_restore_<16 hex>` database name, an empty target with no other sessions, and an authenticated archive from the expected project. It authenticates the complete bounded archive before sending bytes to `pg_restore`, preserves owner/ACL statements, uses a single transaction and fails on the first error. No production restore mode exists. Application-snapshot restore uses the exact checked baseline and fixed table names; no raw values are emitted.

Re-running the hosted synthetic harness writes staging fixtures and requires the explicitly reviewed, isolated qualification slug to be deployed first. It is not a production health check:

```powershell
node ops/security-operations-auth-qualification.mjs
```

## Read-only public monitor

`scripts/security-public-smoke.mjs` sends only unauthenticated GET and HEAD to five fixed HTTPS URLs: both homepages, both `/security/` pages and Codevalanche `/account/`. It never submits forms, calls Auth or event endpoints, executes page JavaScript, fetches script assets, or sends cookies/tokens. Redirects are manual, bounded and restricted to the same fixed allowlist; insecure destinations, credentials, queries/fragments and replacing one canonical page with another fail. HTML response bodies are capped at 2 MiB decoded.

The source check requires one early strict meta CSP, hashes for executable inline scripts, no inline event handlers or unreviewed external script origins, and no known embedded/inline tracker injection. Turnstile is permitted only on the account page. This is an HTML/source smoke test, not browser execution or proof about every transitive script dependency.

```powershell
# Diagnostic inventory: missing HTTP headers are reported but do not fail this mode.
node scripts/security-public-smoke.mjs

# Release/monitoring gate: both GET and HEAD must expose the actual required headers.
node scripts/security-public-smoke.mjs --require-headers
```

Enforced mode verifies `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS with at least one-year max-age, and an actual HTTP CSP containing `frame-ancestors 'none'`, `object-src 'none'` and a restricted base URI. A meta CSP cannot substitute for these HTTP headers. Invalid statuses and source regressions fail both modes; raw bodies, redirect destinations and arbitrary provider errors are never echoed.

`.github/workflows/security-smoke.yml` provides manual runs and a six-hour schedule, scoped to canonical `Radovar-com/codevalanche-site` main, read-only repository permissions and checkout without persisted credentials. **The schedule remains disabled unless `SECURITY_PUBLIC_MONITOR_ENABLED` is exactly `true`.** Keep it absent/false until live header qualification, then enable it, dispatch enforced mode and read back the actual run result. Manual `inventory` is explicitly diagnostic. The workflow contains no deploy or write action. GitHub failure status does not prove an external notification was delivered.

## Remaining recovery and operations qualification

1. Complete independently recoverable offline encryption-key custody and prove decrypt recovery on another device. Owner-only cloud uploads and ciphertext SHA-256 checks are verified; a DPAPI file copied to cloud storage cannot supply independent key recovery.
2. Capture reviewed global roles without passwords, required platform/extension versions and custom managed-schema changes. Provision an isolated compatible Supabase target with outbound email/webhooks/cron disabled; do not fabricate extension stubs or omit failed statements. Restore the full staging archive there and compare data, RLS, grants, functions, sequences and Auth relationships. Then qualify real synthetic Auth login, MFA and recovery against the restored Auth service. Only that expanded evidence can qualify managed Auth/database recovery.
3. Qualify Storage object copies, Auth/OAuth/SMTP settings, signing/encryption-root access, Edge Function source/configuration and secret custody separately. Supabase database backups do not contain Storage object bytes. Production database credentials are not currently available to this workflow; the production snapshot is intentionally application-only.
4. Assign actual alert recipients and prove delivery for a failed job, a logical retention failure, a stale success, failed backup and quota/cost warnings. No external alert, cost monitor, scheduled backup or new production cron job was activated by these scripts.
5. After controller review, set an operational cadence for bounded captures and restore drills, plus retention for protected local and off-site artifacts. Keep each failed drill visible. Observing a healthy staging job cannot qualify production scheduling or provider log/backup retention.

References: [Supabase database backups](https://supabase.com/docs/guides/platform/backups), [CLI backup and restore scope](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore), [local restore](https://supabase.com/docs/guides/local-development/restoring-downloaded-backup), [TLS verification](https://supabase.com/docs/guides/platform/ssl-enforcement), [official Studio CA URL source](https://github.com/supabase/supabase/blob/master/apps/studio/hooks/custom-content/custom-content.json), [PostgreSQL Windows distributions](https://www.postgresql.org/download/windows/).
