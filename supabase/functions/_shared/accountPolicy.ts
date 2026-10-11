import { AccountError, checked } from "./accountContract.ts";
import type { AccountPolicy, Principal } from "./accountContract.ts";
import { reconcileSuspensionExpiry } from "./suspensionExpiry.ts";
export function policyFromState(state: any): AccountPolicy {
  return {
    status: state?.status === "deletion_pending"
      ? "deletion_pending"
      : state?.blocked
      ? "suspended"
      : state?.status || "active",
    suspendedUntil: state?.suspended_until ?? null,
    policyVersion: state?.policy_version ?? 1,
    limits: {
      enabled: state?.remote_enabled ?? false,
      maxHosts: state?.max_hosts ?? 3,
      maxControllers: state?.max_controllers ?? 5,
      maxConcurrentRuns: state?.max_concurrent_runs ?? 2,
    },
  };
}
export async function readAccountPolicy(userId: string, service: any) {
  let state: any = checked(
    await service.from("codevalanche_account_state").select("*").eq(
      "user_id",
      userId,
    ).maybeSingle(),
  );
  if (
    state?.status === "suspended" && state.suspended_until &&
    Date.parse(state.suspended_until) <= Date.now()
  ) {
    await reconcileSuspensionExpiry(userId, service);
    state = checked(
      await service.from("codevalanche_account_state").select("*").eq(
        "user_id",
        userId,
      ).maybeSingle(),
    );
  }
  return policyFromState(state);
}
export function assertAccountOperation(
  principal: Principal,
  policy: AccountPolicy,
  operation: string,
  { recovery = false }: any = {},
) {
  if (policy.status === "deleted") {
    throw new AccountError("session_revoked", 401);
  }
  if (policy.status === "suspended") {
    throw new AccountError("account_suspended", 403);
  }
  if (
    policy.status === "deletion_pending" &&
    ![
      "account.overview",
      "account.deletion.cancel",
      "security.activity",
      "get-account",
      "cancel-deletion",
      "sign-out-current",
    ].includes(operation)
  ) throw new AccountError("account_deletion_pending", 403);
  if (
    recovery &&
    !["account.overview", "get-account", "sign-out-current"].includes(operation)
  ) throw new AccountError("recovery_restricted", 403);
  if (operation.startsWith("remote.") && !principal.emailVerified) {
    throw new AccountError("email_verification_required", 403);
  }
}
