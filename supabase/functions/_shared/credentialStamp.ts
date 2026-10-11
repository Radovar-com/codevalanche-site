import { checked } from "./accountContract.ts";
export async function readCredentialStamp(service: any, principal: any) {
  const rows = checked(
    await service.rpc("codevalanche_credential_evidence", {
      p_user_id: principal.userId,
      p_session_id: principal.sessionId,
    }),
  ) as any[];
  const row = rows?.[0];
  return {
    qualified: row?.qualified === true,
    verifiedFactorCount: row?.verified_factor_count ?? 0,
    credentialChangedAt: row?.credential_changed_at ?? null,
    recoveryOnly: row?.recovery_only !== false,
    policyVersion: row?.policy_version ?? null,
    currentStatus: row?.current_status ?? null,
    blocked: row?.blocked !== false,
    sessionActive: row?.session_active === true,
  };
}
