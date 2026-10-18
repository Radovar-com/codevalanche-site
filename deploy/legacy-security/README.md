# Compatible production-v1 security package

This isolated package starts from the downloaded production `codevalanche-account` function version 2 (September 8 legacy implementation). It keeps that function's existing action names, response shapes, five-table database contract, service-role access pattern and `@supabase/supabase-js@2.57.4` pin. It imports no staged `_shared` modules and needs no staged migrations. The normal repository `supabase/functions/codevalanche-account/index.ts` is a different, staged implementation and must not be deployed to legacy production by accident.

The candidate adds:

- Explicit issuer, subject, session UUID, audience, role, expiry, optional not-before and access-token-purpose validation after Auth verifies the exact token. Audience strings and standard arrays containing `authenticated` are supported. It does not invent an OAuth client allowlist.
- Fresh primary authentication for self-deletion scheduling/cancellation, or fresh verified TOTP/AAL2 when MFA is enrolled. Token refresh timestamps cannot replace authentication evidence.
- Fresh verified TOTP/AAL2 plus primary-auth evidence for all five administrator actions, including private reads. Administrator membership remains the legacy server-controlled `app_metadata` flag; user-editable metadata cannot grant it.
- MFA evidence must also strictly postdate the current verified factors' stable provider `created_at` values. Missing/invalid/future creation timestamps fail closed; a recently replaced factor cannot borrow an earlier factor's AMR. Generic `updated_at` is deliberately excluded: real hosted verification advanced it beyond the whole-second AMR even for genuine fresh TOTP. It is not a credential-change stamp.
- Restriction of authoritative OTP/recovery-only sessions to their own account read and sign-out. Ordinary legacy flows without recognized AMR remain unchanged, but missing/unknown evidence never authorizes administrator or deletion operations.
- Request field/type/control-character validation with the existing bounds. Extra client fields remain ignored; profile changes still use the original whitelist and authenticated user ID.
- Both block and unblock first set the existing application block and revoke every current target session through the existing sessions RPC and denylist table. An exact RPC count must match the returned rows, so provider truncation cannot silently leave sessions active. Provider errors or partial outcomes leave the application block set. Unblocking never restores an earlier token's application access.
- Private best-effort operational logs record only a bounded security action, status/outcome and server-generated request correlation ID. No principal/target ID, email, token, query or body is logged. These logs are not an immutable database audit journal; provider retention and operator access remain operational checks.

The scoped changes do not introduce MFA enrollment/recovery endpoints, account v2, memberships, analytics activation, Auth settings, SMTP, or database migrations. The isolated `supabase/config.toml` contains only function settings and must not be used as an Auth configuration push.

## Evidence and qualification

`tests/legacy-account.test.mjs` executes the actual candidate handler with a synthetic service boundary. Five new guard tests failed against the untouched downloaded function, then all nine tests passed after the initial guards. Review follow-ups added old-session block/unblock, partial-failure, exact-count, replacement-factor/metadata, privacy-log and real-provider timestamp regressions; the current candidate passes **15 tests**. `supabase/tests/legacy-security.test.mjs` includes these tests in the ordinary repository backend gate.

Operations independently checked real synthetic staging Auth tokens: password sign-in has string audience `authenticated`, exact project issuer, authenticated role, no `token_use`, AAL1 and password AMR; verified TOTP has AAL2 with fresh TOTP/password AMR; a provider-generated recovery link verified in memory without SMTP has AAL1/OTP AMR. Its fixtures were cleaned up. This provider-only evidence validates claim shape; it is not yet evidence that this candidate function passed hosted action tests.

Full hosted qualification belongs to the isolated function slug `codevalanche-account-security-qualification-20261018` on the identified staging project. Copy only this candidate's function directory to that slug in a temporary deployment workspace. Do not overwrite the existing shared staging account function. Operations owns synthetic accounts, API keys, deployment, action checks and cleanup; keep credentials/tokens out of files and reports.

The first candidate passed eleven hosted action cases with cleanup, but that receipt predates the review follow-ups above. Rerun qualification on the frozen final candidate, including exact RPC count support, old-token rejection after block/unblock and fresh versus replaced-factor MFA evidence. Do not transfer an earlier candidate's hosted pass to changed source.

A later candidate failed hosted positive MFA cases because it incorrectly treated generic factor `updated_at` as a credential stamp. Sanitized native-provider evidence showed stable `created_at` before AMR while `updated_at` was 556 ms after it. The final local regression reproduces that response ordering: fresh MFA succeeds, while proof predating a replacement factor still fails. This correction must receive a fresh hosted pass; the failed run is not a qualification result for release.

Production rollout requires successful candidate action checks, independent review, fresh source/service backup and a function-only deployment from this isolated package. Root/operations owns the decision and deployment; this worker has not deployed anything. Report unknown provider results honestly rather than claiming a failed call rolled back.

## Administrator enrollment boundary

Operations reports zero current production users with the legacy administrator flag, so the new gate does not lock out an existing flagged administrator in that inspected snapshot. This does not prove owner MFA enrollment. Before any future promotion, the owner must enroll and verify TOTP through a qualified Supabase SDK flow, confirm fresh AAL2/password-or-OAuth evidence and test the guarded action. The current v1 website hides the full staged MFA surface; do not silently switch it to v2 or grant an owner flag to bypass setup. An owner enrollment UI change requires its own compatible verification.

## Known limits retained from legacy

This is a bounded guard patch, not the staged lifecycle platform. A durable administrator audit database, durable deletion processing and broader managed-provider policies are not added here. The legacy function has no authoritative in-place factor-secret-change stamp; current provider verification, active sessions, stable factor creation and five-minute MFA freshness do not claim that extra guarantee. The main service-role key remains a privileged backend boundary. The staged backend's explicit credential stamp is unchanged; its fifteen-minute durable recovery fix and new migration apply to that backend only.
