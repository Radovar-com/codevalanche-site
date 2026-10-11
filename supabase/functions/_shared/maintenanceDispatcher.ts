import { AccountError, checked } from "./accountContract.ts";
import { reconcileOperation } from "./accountLifecycle.ts";
import { reconcileSuspensionExpiry } from "./suspensionExpiry.ts";
import { processErasure } from "./erasureJob.ts";
import {
  deliverNotification,
  notificationStore,
} from "./notificationDelivery.ts";
export async function dispatchMaintenance(
  {
    service,
    workerService,
    enabled = false,
    erasureEnabled = false,
    channel = null,
    limit = 10,
    monoNow = () => performance.now(),
    budgetMs = 20000,
  }: any,
) {
  if (!enabled) return { state: "disabled", selected: 0, results: [] };
  if (
    !Number.isInteger(limit) || limit < 1 || limit > 25 ||
    !Number.isFinite(budgetMs) || budgetMs < 1 || budgetMs > 30000
  ) throw new AccountError("invalid_fields", 400);
  if (typeof workerService !== "function") {
    throw new AccountError("worker_not_configured", 503);
  }
  const start = monoNow();
  const jobs = checked(
    await service.rpc("codevalanche_due_maintenance", { p_limit: limit }),
  ) as any[];
  const results: any[] = [];
  for (const job of jobs) {
    const current = monoNow();
    if (
      !Number.isFinite(current) || current < start ||
      current - start >= budgetMs
    ) break;
    try {
      if (job.queue === "erasure" && !erasureEnabled) {
        results.push({
          queue: job.queue,
          id: job.id,
          state: "execution_disabled",
        });
        continue;
      }
      const worker = await workerService(job.queue);
      const result = job.queue === "operation"
        ? await reconcileOperation(job.id, worker)
        : job.queue === "expiry"
        ? await reconcileSuspensionExpiry(job.user_id, worker)
        : job.queue === "erasure"
        ? await processErasure(job.id, { execute: true, service: worker })
        : job.queue === "notification"
        ? await deliverNotification(job.id, {
          store: notificationStore(worker),
          channel,
        })
        : { state: "unsupported" };
      results.push({ queue: job.queue, id: job.id, state: result.state });
    } catch {
      results.push({ queue: job.queue, id: job.id, state: "pending" });
    }
  }
  return {
    state: "completed_batch",
    selected: jobs.length,
    processed: results.length,
    results,
  };
}
