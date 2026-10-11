import { AccountError, uuid } from "./accountContract.ts";
import { operationRpc } from "./operationJobs.ts";
import { reconcileSuspensionExpiry } from "./suspensionExpiry.ts";
const actions = [
  "admin.account.suspend",
  "admin.account.reactivate",
  "admin.limits.update",
  "admin.sessions.revoke",
];
export async function requestAccountOperation(fields: any, service: any) {
  if (
    !uuid.test(fields.actorId || "") || !uuid.test(fields.userId || "") ||
    !uuid.test(fields.operationId || "") || !actions.includes(fields.action) ||
    typeof fields.reasonCode !== "string" ||
    !/^[a-z0-9_.-]{1,64}$/.test(fields.reasonCode) ||
    typeof fields.reason !== "string" || !fields.reason.trim() ||
    fields.reason.length > 1000
  ) throw new AccountError("invalid_fields", 400);
  if (
    fields.until !== undefined && fields.until !== null &&
    (typeof fields.until !== "string" ||
      !Number.isFinite(Date.parse(fields.until)))
  ) throw new AccountError("invalid_fields", 400);
  if (fields.action === "admin.limits.update") {
    const l = fields.limits;
    if (
      !l || typeof l.enabled !== "boolean" ||
      !["maxHosts", "maxControllers", "maxConcurrentRuns"].every((k) =>
        Number.isInteger(l[k]) && l[k] >= 0 && l[k] <= 10000
      ) || Object.keys(l).some((k) =>
        !["enabled", "maxHosts", "maxControllers", "maxConcurrentRuns"]
          .includes(k)
      )
    ) {
      throw new AccountError("invalid_fields", 400);
    }
  }
  const row = await operationRpc(service, "codevalanche_request_operation", {
    p_actor_id: fields.actorId,
    p_user_id: fields.userId,
    p_operation_id: fields.operationId,
    p_action: fields.action,
    p_reason_code: fields.reasonCode,
    p_reason: fields.reason.trim(),
    p_until: fields.until ?? null,
    p_limits: fields.limits ?? null,
  });
  return { operationId: row.operation_id, state: row.state };
}
export async function reconcileOperation(operationId: string, service: any) {
  if (!uuid.test(operationId || "")) {
    throw new AccountError("invalid_fields", 400);
  }
  const leaseId = crypto.randomUUID();
  const job = await operationRpc(service, "codevalanche_claim_operation", {
    p_operation_id: operationId,
    p_lease_id: leaseId,
  });
  if (!job) return { operationId, state: "pending" };
  if (job.state === "completed" || job.state === "failed") {
    return { operationId, state: job.state };
  }
  const preparation = await operationRpc(
    service,
    "codevalanche_prepare_operation_provider",
    { p_operation_id: operationId, p_lease_id: leaseId },
  );
  if (preparation?.decision === "superseded") {
    return { operationId, state: "failed" };
  }
  if (preparation?.decision === "indeterminate") {
    return {
      operationId,
      state: "pending",
      errorCode: "provider_result_unknown",
    };
  }
  let success = false;
  try {
    if (preparation?.allowed && job.action === "admin.account.suspend") {
      const until = job.parameters?.until;
      if (!until || Date.parse(until) > Date.now()) {
        const seconds = until
          ? Math.ceil((Date.parse(until) - Date.now()) / 1000)
          : 876000 * 3600;
        const r = await service.auth.admin.updateUserById(job.user_id, {
          ban_duration: `${seconds}s`,
        });
        if (r.error) throw r.error;
      }
    } else if (
      preparation?.allowed && job.action === "admin.account.reactivate"
    ) {
      const r = await service.auth.admin.updateUserById(job.user_id, {
        ban_duration: "none",
      });
      if (r.error) throw r.error;
    }
    if (preparation?.allowed) {
      await operationRpc(service, "codevalanche_record_operation_provider", {
        p_operation_id: operationId,
        p_attempt_id: leaseId,
        p_confirmed: true,
        p_rejected: false,
      });
    }
    success = true;
  } catch (error: any) {
    if (preparation?.allowed) {
      await operationRpc(service, "codevalanche_record_operation_provider", {
        p_operation_id: operationId,
        p_attempt_id: leaseId,
        p_confirmed: false,
        p_rejected: [400, 401, 403, 404, 422].includes(error?.status),
      });
    }
    success = false;
  }
  const settled = await operationRpc(service, "codevalanche_settle_operation", {
    p_operation_id: operationId,
    p_lease_id: leaseId,
    p_success: success,
  });
  if (
    settled?.state === "completed" && job.action === "admin.account.suspend" &&
    job.parameters?.until && Date.parse(job.parameters.until) <= Date.now()
  ) await reconcileSuspensionExpiry(job.user_id, service);
  return { operationId, state: settled?.state || "pending" };
}
