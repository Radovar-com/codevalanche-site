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

// The API gateway turns the secret key into a short-lived token for PostgREST.
// Now and then PostgREST rejects that token at once (401, PGRST303) and accepts
// the same call a moment later. That rejection comes before the database runs
// anything, so one quiet retry is safe and keeps it from failing a sign-in.
export function createGatewayRetryFetch(
  { fetcher = fetch, delayMs = 150 }: any = {},
) {
  return async (input: any, init: any = {}) => {
    const response = await fetcher(input, init);
    if (
      response.status !== 401 ||
      !/PGRST303/.test(response.headers.get("proxy-status") || "") ||
      !/\/rest\/v1\//.test(String(input?.url ?? input)) ||
      (init.body != null && typeof init.body !== "string")
    ) return response;
    await response.body?.cancel().catch(() => undefined);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return fetcher(input, init);
  };
}
