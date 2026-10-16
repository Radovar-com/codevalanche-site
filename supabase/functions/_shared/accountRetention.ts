import { checked } from "./accountContract.ts";

/**
 * Calls of the batched account retention per run. Each call is its own
 * statement and transaction and deletes at most one batch per table, so a
 * large backlog advances on every run and the rest waits for the next one.
 */
export const ACCOUNT_RETENTION_MAX_PASSES = 20;

/**
 * One retention pass of the account service (daily schedule, see
 * docs/account-data-retention.md): security/audit logs, account-attributed
 * activity and native receipts, then account events, feedback, revocation
 * rows, finished jobs and expired rate-limit rows.
 */
export async function runAccountRetention(service: any) {
  const security = checked(await service.rpc("codevalanche_retention_sweep"));
  const analytics = checked(
    await service.rpc("codevalanche_analytics_retention"),
  );
  const account: Record<string, unknown> = { passes: 0, more: false };
  for (let pass = 0; pass < ACCOUNT_RETENTION_MAX_PASSES; pass++) {
    const result = checked(
      await service.rpc("codevalanche_account_retention"),
    ) as Record<string, unknown> | null;
    account.passes = pass + 1;
    for (const [key, value] of Object.entries(result || {})) {
      if (key.endsWith("Deleted") && typeof value === "number") {
        account[key] = (typeof account[key] === "number" ? account[key] as number : 0) + value;
      } else if (key !== "more") account[key] = value;
    }
    account.more = result?.more === true;
    if (!account.more) break;
  }
  return { security, analytics, account };
}
