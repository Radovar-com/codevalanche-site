import { AccountError } from "./accountContract.ts";
import type { Principal } from "./accountContract.ts";
export function assertCurrentAssurance(
  principal: Principal,
  { now = Date.now(), evidence }: any,
): void {
  if (!evidence?.qualified) {
    throw new AccountError("account_service_unavailable", 503);
  }
  if (evidence.recoveryOnly) throw new AccountError("recovery_restricted", 403);
  if (!principal.emailVerified) {
    throw new AccountError("email_verification_required", 403);
  }
  if (principal.aal !== "aal2" || evidence.verifiedFactorCount < 1) {
    throw new AccountError("mfa_required", 403);
  }
  const verifiedAt = Date.parse(principal.mfaVerifiedAt || "");
  if (
    !Number.isFinite(verifiedAt) || verifiedAt > now ||
    (evidence.credentialChangedAt &&
      verifiedAt <= Date.parse(evidence.credentialChangedAt))
  ) throw new AccountError("reauthentication_required", 401);
}
export function assertAssurance(
  principal: Principal,
  { purpose, now = Date.now(), evidence }: any,
): void {
  assertCurrentAssurance(principal, { now, evidence });
  if (now - Date.parse(principal.mfaVerifiedAt || "") > 300000) {
    throw new AccountError("reauthentication_required", 401);
  }
}
export function assertRecentAuthentication(
  principal: Principal,
  { now = Date.now(), claims, evidence }: any,
): void {
  if (!evidence?.qualified) {
    throw new AccountError("account_service_unavailable", 503);
  }
  if (evidence.recoveryOnly) throw new AccountError("recovery_restricted", 403);
  if (evidence.verifiedFactorCount > 0) {
    return assertAssurance(principal, {
      purpose: "account.deletion.request",
      now,
      evidence,
    });
  }
  const methods = (Array.isArray(claims?.amr) ? claims.amr : []).filter((
    m: any,
  ) =>
    ["password", "oauth", "sso/saml"].includes(m.method) &&
    Number.isFinite(m.timestamp)
  );
  const authAt = Math.max(...methods.map((m: any) => m.timestamp * 1000));
  if (
    !Number.isFinite(authAt) || authAt > now || now - authAt > 300000 ||
    (evidence.credentialChangedAt &&
      authAt <= Date.parse(evidence.credentialChangedAt))
  ) throw new AccountError("reauthentication_required", 401);
}
