import { checked } from "./accountContract.ts";

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
  const account = checked(
    await service.rpc("codevalanche_account_retention"),
  );
  return { security, analytics, account };
}
