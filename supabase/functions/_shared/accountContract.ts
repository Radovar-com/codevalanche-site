/**
 * Additive revision inside API v2. apiVersion stays 2 for as long as any
 * supported client (installed desktop 0.2.9426 and later, the account website)
 * checks `apiVersion === 2`; new optional fields and new actions bump only
 * this number. Rules: docs/account-api-compatibility.md.
 *   1 = sessions.revoke also ends the Auth session; account.export.
 */
export const ACCOUNT_API_REVISION = 1;
export type ApiResult<T> = {
  apiVersion: 2;
  apiRevision: number;
  ok: true;
  data: T;
  requestId: string;
} | {
  apiVersion: 2;
  apiRevision: number;
  ok: false;
  error: { code: string; message: string; retryAfterSeconds?: number };
  requestId: string;
};
export type Principal = {
  userId: string;
  sessionId: string;
  clientId: string | null;
  aal: "aal1" | "aal2";
  mfaVerifiedAt: string | null;
  emailVerified: boolean;
};
export type AccountStatus =
  | "active"
  | "suspended"
  | "deletion_pending"
  | "deleted";
export type RemoteLimits = {
  enabled: boolean;
  maxHosts: number;
  maxControllers: number;
  maxConcurrentRuns: number;
};
export type AccountPolicy = {
  status: AccountStatus;
  suspendedUntil: string | null;
  policyVersion: number;
  limits: RemoteLimits;
};
export const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class AccountError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message = code) {
    super(message);
    this.code = code;
    this.status = status;
  }
}
export function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new AccountError("account_service_unavailable", 503);
  return result.data;
}
export function resultEnvelope(
  body: any,
  requestId: string,
  status: number,
): ApiResult<any> {
  if (status < 400) {
    return { apiVersion: 2, apiRevision: ACCOUNT_API_REVISION, ok: true, data: body, requestId };
  }
  const code = typeof body.code === "string" ? body.code : ({
    400: "invalid_fields",
    401: "sign_in_required",
    403: "account_forbidden",
    404: "not_found",
    409: "operation_conflict",
    429: "rate_limited",
    503: "account_service_unavailable",
  } as Record<number, string>)[status] || "invalid_fields";
  return {
    apiVersion: 2,
    apiRevision: ACCOUNT_API_REVISION,
    ok: false,
    error: {
      code,
      message: body.message || "Account request could not be completed",
      ...(status === 429 ? { retryAfterSeconds: 60 } : {}),
    },
    requestId,
  };
}
