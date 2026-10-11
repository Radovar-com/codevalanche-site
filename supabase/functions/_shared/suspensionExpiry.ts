import { AccountError, uuid } from "./accountContract.ts";
import { operationRpc } from "./operationJobs.ts";
export async function reconcileSuspensionExpiry(userId: string, service: any) {
  if (!uuid.test(userId || "")) throw new AccountError("invalid_fields", 400);
  const leaseId = crypto.randomUUID();
  const job = await operationRpc(
    service,
    "codevalanche_claim_suspension_expiry",
    { p_user_id: userId, p_lease_id: leaseId },
  );
  if (!job) return { state: "pending" };
  let providerExpired = false;
  try {
    const result = await service.auth.admin.getUserById(userId);
    const current = result.data?.user;
    if (!result.error && current?.id === userId) {
      const until = current.banned_until;
      providerExpired = !until ||
        Number.isFinite(Date.parse(until)) && Date.parse(until) <= Date.now();
    }
  } catch {
    providerExpired = false;
  }
  // Timed Auth bans expire at provider. Never issue ban_duration:none for an old expiry job:
  // a delayed unban could otherwise overwrite a later provider suspension.
  const settled = await operationRpc(
    service,
    "codevalanche_settle_suspension_expiry",
    { p_id: job.id, p_lease_id: leaseId, p_provider_expired: providerExpired },
  );
  return { state: settled.state };
}
