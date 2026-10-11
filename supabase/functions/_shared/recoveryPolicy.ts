import { AccountError } from "./accountContract.ts";
// Supabase recovery uses OTP, not a reliably distinct recovery claim. Conservatively restrict
// OTP/invite/signup/magiclink sessions until a fresh primary password/OAuth sign-in is proven.
export function isRestrictedRecovery(claims: any) {
  const methods = Array.isArray(claims?.amr) ? claims.amr : [];
  return !methods.some((m: any) =>
    ["password", "oauth", "sso/saml"].includes(m.method)
  );
}
export function assertRecoveryOperation(claims: any, operation: string) {
  if (
    isRestrictedRecovery(claims) &&
    ![
      "account.overview",
      "get-account",
      "security.activity",
      "sign-out-current",
    ].includes(operation)
  ) throw new AccountError("recovery_restricted", 403);
}
