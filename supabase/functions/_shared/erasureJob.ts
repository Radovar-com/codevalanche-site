import { AccountError, checked, uuid } from "./accountContract.ts";
import { operationRpc } from "./operationJobs.ts";
export async function requestErasure(
  { userId, actorId, operationId, confirmation }: any,
  service: any,
) {
  if (
    !uuid.test(userId || "") || !uuid.test(actorId || "") ||
    !uuid.test(operationId || "") || confirmation !== "DELETE"
  ) throw new AccountError("invalid_fields", 400);
  const row = await operationRpc(service, "codevalanche_request_erasure", {
    p_user_id: userId,
    p_actor_id: actorId,
    p_operation_id: operationId,
  });
  if (!["queued", "purging"].includes(row.state)) {
    throw new AccountError("operation_conflict", 409);
  }
  return { jobId: row.job_id, dueAt: row.due_at, state: row.state };
}
export async function cancelErasure(principal: any, service: any) {
  const row = await operationRpc(service, "codevalanche_cancel_erasure", {
    p_user_id: principal.userId,
  });
  return { state: row.state };
}
export async function processErasure(
  jobId: string,
  { execute = false, service }: any,
) {
  if (!uuid.test(jobId || "")) throw new AccountError("invalid_fields", 400);
  if (!execute) {
    const row = await operationRpc(service, "codevalanche_erasure_inspect", {
      p_job_id: jobId,
    });
    return {
      jobId,
      state: row?.state || "not_found",
      execute: false,
      dueAt: row?.due_at,
      storageCount: row?.storage_count ?? null,
    };
  }
  const leaseId = crypto.randomUUID();
  const row = await operationRpc(service, "codevalanche_erasure_claim", {
    p_job_id: jobId,
    p_lease_id: leaseId,
  });
  if (!row || row.decision !== "claimed") {
    return { jobId, state: row?.decision || "blocked" };
  }
  const advance = async (step: string) =>
    operationRpc(service, "codevalanche_erasure_advance", {
      p_job_id: jobId,
      p_lease_id: leaseId,
      p_step: step,
    });
  try {
    if (!row.storage_cleaned_at) {
      for (let batch = 0; batch < 10000; batch++) {
        const objects = checked(
          await service.rpc("codevalanche_erasure_storage", {
            p_user_id: row.user_id,
          }),
        ) as any[];
        if (!objects.length) {
          await advance("storage_cleaned");
          break;
        }
        const buckets = [...new Set(objects.map((o) => o.bucket_id))];
        for (const bucket of buckets) {
          await advance("heartbeat");
          const response = await service.storage.from(bucket).remove(
            objects.filter((o) => o.bucket_id === bucket).map((o) => o.name),
          );
          if (response.error) throw response.error;
        }
        if (batch === 9999) throw new Error("storage_pending");
      }
    }
    const binding = await advance("auth_delete_started");
    const existing = await service.auth.admin.getUserById(row.user_id);
    if (
      existing.error && existing.error.status !== 404 &&
      existing.error.code !== "user_not_found"
    ) throw existing.error;
    if (existing.data?.user) {
      await advance("heartbeat");
      const removed = await service.auth.admin.deleteUser(row.user_id);
      if (removed.error) throw removed.error;
    } else if (!binding?.auth_delete_started_at) {
      throw new Error("binding_missing");
    }
    const confirmation = await service.auth.admin.getUserById(row.user_id);
    if (
      confirmation.data?.user ||
      (confirmation.error && confirmation.error.status !== 404 &&
        confirmation.error.code !== "user_not_found")
    ) throw new Error("auth_delete_unconfirmed");
    const deleted = await advance("auth_deleted");
    if (!deleted.remote_receipt_id) {
      if (typeof service.remoteErase !== "function") {
        throw new Error("remote_erasure_unconfigured");
      }
      await advance("heartbeat");
      const binding = {
        operationId: deleted.operation_id,
        jobId: deleted.job_id,
        userId: deleted.user_id,
        generation: deleted.remote_generation,
        policyVersion: deleted.erasure_policy_version,
      };
      const receipt = await service.remoteErase(binding);
      await advance("heartbeat");
      await operationRpc(service, "codevalanche_record_remote_erasure", {
        p_job_id: jobId,
        p_lease_id: leaseId,
        p_receipt: receipt,
      });
    }
    const finished = await advance("completed");
    return { jobId, state: finished.state };
  } catch {
    await advance("retry").catch(() => undefined);
    return { jobId, state: "pending" };
  }
}
