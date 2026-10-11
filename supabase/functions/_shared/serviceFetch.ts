import { AccountError } from "./accountContract.ts";
export function createBoundedServiceFetch(
  {
    fetcher = fetch,
    timeoutMs = 8000,
    remainingMs = () => Infinity,
    maxResponseBytes = 2097152,
  }: any = {},
) {
  return async (input: any, init: any = {}) => {
    const duration = Math.min(timeoutMs, remainingMs());
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new AccountError("worker_budget_exceeded", 503);
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (init.signal?.aborted) abort();
    init.signal?.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(abort, duration);
    try {
      const response = await fetcher(input, {
        ...init,
        signal: controller.signal,
        redirect: "error",
      });
      const reader = response.clone().body?.getReader();
      let bytes = 0;
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          bytes += value.length;
          if (bytes > maxResponseBytes) {
            controller.abort();
            await reader.cancel().catch(() => undefined);
            throw new AccountError("account_service_unavailable", 503);
          }
        }
      }
      return response;
    } finally {
      clearTimeout(timer);
      init.signal?.removeEventListener("abort", abort);
    }
  };
}
