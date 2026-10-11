import { AccountError } from "./accountContract.ts";
export function assertMaintenance(
  req: Request,
  configuredSecret: string | undefined,
) {
  if (!configuredSecret || configuredSecret.length < 32) {
    throw new AccountError("worker_not_configured", 503);
  }
  const supplied =
    req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1] || "";
  let difference = supplied.length ^ configuredSecret.length;
  for (let i = 0; i < configuredSecret.length; i++) {
    difference |= configuredSecret.charCodeAt(i) ^
      (supplied.charCodeAt(i) || 0);
  }
  if (difference !== 0) throw new AccountError("account_forbidden", 403);
}
