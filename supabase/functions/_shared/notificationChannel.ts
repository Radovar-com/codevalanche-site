import { AccountError } from "./accountContract.ts";
export function createNotificationChannel(
  env: (name: string) => string | undefined,
  fetcher = fetch,
) {
  const endpoint = env("ACCOUNT_NOTIFICATION_CHANNEL_URL"),
    token = env("ACCOUNT_NOTIFICATION_CHANNEL_TOKEN");
  if (!endpoint || !token) return null;
  const target = new URL(endpoint);
  if (target.protocol !== "https:" || target.username || target.password) {
    throw new AccountError("worker_not_configured", 503);
  }
  return {
    send: async (payload: any, { idempotencyKey }: any) => {
      const response = await fetcher(endpoint, {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("delivery_unconfirmed");
      const receipt = await response.json();
      if (
        typeof receipt?.id !== "string" || !receipt.id ||
        receipt.id.length > 200
      ) throw new Error("delivery_unconfirmed");
      return { id: receipt.id };
    },
  };
}
