import { AccountError } from "./accountContract.ts";
import type { Principal } from "./accountContract.ts";

/** The subject/session/assurance come exclusively from authenticateAccountContext. */
export async function exportAccount(service: any, principal: Principal) {
  const { data, error } = await service.rpc("codevalanche_export_account", {
    p_user_id: principal.userId,
    p_session_id: principal.sessionId,
    p_aal: principal.aal,
  });
  if (error) {
    const code = String(error.message || "");
    const status = ({ rate_limited: 429, mfa_required: 401, session_revoked: 401, account_suspended: 403 } as Record<string, number>)[code];
    throw new AccountError(status ? code : "account_service_unavailable", status || 503);
  }
  if (data?.schemaVersion !== 1 || data?.account?.id !== principal.userId) {
    throw new AccountError("account_service_unavailable", 503);
  }
  return data;
}
