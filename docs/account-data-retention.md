# Account data: deletion, retention and export

This is the written rule for what the account service (`supabase/`) keeps, for how long, and what happens when a person deletes their account or asks for their data. The code that applies it is named next to each rule. Changing a period means changing the SQL function and this page in the same commit.

## Account deletion

1. `request-deletion` / `account.deletion.request` (typed confirmation `DELETE`, recent sign-in) creates an erasure job (`codevalanche_account_erasure_jobs`) due **30 days** later. All sessions are revoked at once; the person can sign in again and cancel until the job starts.
2. When the job is due, `account-erasure-worker` (run by `account-maintenance-dispatcher`, behind `ACCOUNT_ERASURE_EXECUTION_ENABLED`) removes the person's storage objects, deletes account-attributed activity and notifications, deletes the Auth user (every table that references `auth.users` cascades), records the remote purge receipt and finally deletes the remaining application rows (account state, feedback, events, revocations, credential events, rate-limit buckets).
3. The erasure job row itself stays as the receipt that the deletion happened. It holds only UUIDs and timestamps, no email or content.

## Retention periods (accounts that still exist)

| Data | Table | Kept for | Applied by |
|---|---|---|---|
| Account events (website/app opened, download clicked) | `codevalanche_events` | 90 days | `codevalanche_account_retention` |
| Account-attributed activity, native run receipts | `codevalanche_analytics_v2`, `codevalanche_native_ledger_receipts` | 90 days | `codevalanche_analytics_retention` |
| Feedback text | `codevalanche_feedback` | 730 days after it was sent | `codevalanche_account_retention` |
| Security log | `codevalanche_security_events` | IP removed after 7 days, row deleted after 90 days | `codevalanche_retention_sweep` |
| Credential change events | `codevalanche_credential_events` | 90 days | `codevalanche_retention_sweep` |
| Administrator audit | `codevalanche_admin_audit` | 365 days | `codevalanche_retention_sweep` |
| Finished operation and suspension-expiry jobs | `codevalanche_operation_jobs`, `codevalanche_suspension_expiry_jobs` | 365 days after they finished | `codevalanche_account_retention` |
| Revocation rows whose Auth session no longer exists | `codevalanche_revoked_sessions` | 30 days (longer than any access token) | `codevalanche_account_retention` |
| Rate-limit buckets | `codevalanche_rate_limits` | 2 minutes after their one-minute window | `codevalanche_account_retention`, `codevalanche_rate_limits_prune` |
| Website analytics | `wa_*` | see [owned analytics report definitions](owned-analytics-report-definitions.md) | `wa_prune_website_analytics` |

Logs are deleted, not anonymised: none of these tables keeps a copy without the user id. The security log and the administrator audit are kept for the periods above even after an account is erased, because they protect the service and the other accounts; they hold UUIDs, event names and outcomes, never passwords, tokens or message content.

The account-service periods are a proposal by the implementer (W7-SRV-ACCOUNT, 16 Oct 2026), aligned with the periods the service already used. The owner can change any of them; the privacy policy must state the final values.

All retention functions run from `account-retention-worker` (POST, worker token, `ACCOUNT_RETENTION_EXECUTION_ENABLED=true`). The operator schedules it **once a day**.

`codevalanche_account_retention` deletes at most 10,000 rows per table per call (migration `202610160002`) and returns `more: true` while a table may still hold expired rows. The worker repeats the call up to 20 times per run (`ACCOUNT_RETENTION_MAX_PASSES`). Each call is its own short transaction, so a large first backlog shrinks on every run instead of hitting `statement_timeout`. A run that stops at the bound reports `account.more: true`, and the next daily run continues.

## Data export (right of access and portability)

`account.export` (API v2) or `export-data` (v1) returns one JSON document for the signed-in person: format `codevalanche-account-export/v1`, their Auth identity (email, sign-in methods, live sessions) and every application row about them (`codevalanche_account_export`): account state, profile, feedback, events, activity, revocations, credential and security events, account actions taken on them, deletion requests, notifications, projects, run receipts and website consent bindings. Identifiers of other people (for example the administrator who acted) are left out. Each list is capped at 50,000 rows (`limitPerList`). A person may start 2 exports per minute. Export stays available while a deletion is pending.

The document is the whole dossier (email, sessions, IP addresses of recent security events), so the export asks for the same proof as a deletion request (`assertRecentAuthentication`): a sign-in in the last 5 minutes or, when an authenticator is enrolled, an authenticator check in the last 5 minutes. Otherwise the answer is `401 reauthentication_required` or `403 mfa_required`. Recovery sessions are refused. The whole document is capped at 20 MiB in the database (`maxBytes`, migration `202610160002`); above it the call answers `413 export_too_large` and support provides the copy by hand.

Suspended accounts get `403 account_suspended` for the export, as for every other account action (`assertAccountOperation`). Whether a suspended person may still download their data (the right of access does not end with a suspension) is an owner decision. Until it is taken, support answers such requests by hand.

## Revoking one session

`sessions.revoke` / `revoke-session` calls `codevalanche_revoke_session`, which, in one transaction, records the revocation and deletes the session from `auth.sessions` (its refresh tokens are removed with it). The result field `providerSession` is `provider_ended`, `already_ended`, or `application_only` when the database role may not delete Auth sessions on that project; in that last case the application still refuses the session, and the operator must fix the grant.
