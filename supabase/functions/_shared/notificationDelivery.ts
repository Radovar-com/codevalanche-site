import { operationRpc } from "./operationJobs.ts";
const allowed = new Set([
  "userId",
  "eventType",
  "occurredAt",
  "provider",
  "verified",
  "sourceVersion",
]);
export async function deliverNotification(id: string, { store, channel }: any) {
  const leaseId = crypto.randomUUID(), job = await store.claim(id, leaseId);
  if (!job) return { id, state: "pending" };
  const payload = job.payload || {};
  if (Object.keys(payload).some((k) => !allowed.has(k))) {
    return store.settle(id, leaseId, {
      state: "dead_letter",
      errorCode: "invalid_payload",
    });
  }
  if (!channel) {
    return store.settle(id, leaseId, {
      state: "not_configured",
      errorCode: "channel_not_configured",
    });
  }
  try {
    const receipt = await channel.send(payload, { idempotencyKey: id });
    if (!receipt?.id) throw new Error("delivery_unconfirmed");
    return store.settle(id, leaseId, {
      state: "delivered",
      receiptId: receipt.id,
      errorCode: null,
    });
  } catch {
    return store.settle(id, leaseId, {
      state: job.attempts >= 8 ? "dead_letter" : "retry",
      errorCode: "delivery_unconfirmed",
      retryAfterSeconds: Math.min(
        3600,
        30 * 2 ** Math.max(0, job.attempts - 1),
      ),
    });
  }
}
export function notificationStore(service: any) {
  return {
    claim: async (id: string, leaseId: string) => {
      const r = await operationRpc(service, "codevalanche_notification_claim", {
        p_id: id,
        p_lease_id: leaseId,
      });
      return r ? { id: r.id, attempts: r.attempts, payload: r.payload } : null;
    },
    settle: async (id: string, leaseId: string, patch: any) => {
      const r = await operationRpc(
        service,
        "codevalanche_notification_settle",
        {
          p_id: id,
          p_lease_id: leaseId,
          p_state: patch.state,
          p_receipt_id: patch.receiptId || null,
          p_retry_after: patch.retryAfterSeconds || null,
        },
      );
      return { id, state: r.state };
    },
  };
}
