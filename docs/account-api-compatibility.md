# Account API compatibility rule

The `codevalanche-account` Edge Function is called by clients we cannot update on our schedule: installed desktop builds (oldest supported: **0.2.9426**, installed 15 Oct 2026) and cached copies of the account website. This page is the rule every change to the function must follow.

## Version fields

- `apiVersion` (request and response): the protocol. Desktop 0.2.9426 sends `apiVersion: 2` and rejects any reply whose `apiVersion` is not exactly `2`, or whose `requestId` differs from the one it sent. Requests without `apiVersion` use the flat v1 shape (website `get-account`, `request-deletion`, `cancel-deletion`, legacy desktop reads).
- `apiRevision` (v2 responses only, from revision 1): an integer that grows by one with every additive change inside v2. Clients may use it to detect a feature; none may require it.

| apiRevision | Change |
|---|---|
| (absent) | v2 as shipped with desktop 0.2.9426 |
| 1 | `sessions.revoke` also ends the Auth session (`providerSession` in the result); new action `account.export` (recent sign-in or authenticator check, like a deletion request; `413 export_too_large` above 20 MiB) |

## Rules

1. Never change `apiVersion: 2` in replies, never remove or rename an action, field, error code or alias that a supported client sends or reads. Desktop 0.2.9426 uses: `account.overview`, `profile.update`, `sessions.revoke`, `sessions.revoke-others`, `feedback.submit`, `analytics.consent`, `event.submit`, and reads `ok`, `data`, `error.code`, `requestId`.
2. New behaviour is additive: a new optional reply field, a new action, or a stricter server-side effect that returns the same success shape (for example revocation now also ends the Auth session; the reply is still `{ ok: true, ... }`). Bump `apiRevision` and add a row above.
3. New actions use a dotted v2 name; v1 requests with a dotted action stay refused (`Canonical operations require API v2`).
4. Unknown `apiVersion` values stay refused with 400 and no write.
5. A breaking change needs `apiVersion: 3` served next to v2, and v2 stays until the oldest supported desktop build no longer sends it (checked against the update feed's minimum version), never earlier.
6. Database migrations are new files only and additive (`create … if not exists`, new functions, new columns with defaults). An applied migration is never edited.
7. Every change ships with a test that sends the 0.2.9426 request shape and checks the reply it expects (`supabase/tests/account-contract-v2.test.mjs`, `supabase/tests/account-rights-retention.test.mjs`).
