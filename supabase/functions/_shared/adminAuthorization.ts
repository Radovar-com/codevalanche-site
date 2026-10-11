import { AccountError, checked } from "./accountContract.ts";
import { assertAssurance, assertCurrentAssurance } from "./assurancePolicy.ts";
const reads = new Set([
  "admin.operator.session",
  "admin.users.list",
  "admin.users.detail",
  "admin.security.list",
  "admin.audit.list",
  "admin.analytics.summary",
  "admin.notifications.list",
  "admin.feedback.list",
  "admin.operations.get",
  "admin.deletion.get",
]);
export function isAdminMutation(operation: string) {
  return !reads.has(operation);
}
export async function authorizeAdmin(
  principal: any,
  operation: string,
  targetUserId: string | null,
  { service, evidence, now = Date.now() }: any,
) {
  const membership = checked(
    await service.from("codevalanche_admin_memberships").select("role,active")
      .eq("user_id", principal.userId).maybeSingle(),
  ) as any;
  if (
    !membership?.active ||
    !["owner", "accounts_admin", "support_readonly"].includes(
      membership.role,
    ) || (!reads.has(operation) && membership.role === "support_readonly")
  ) throw new AccountError("administrator_required", 403);
  if (reads.has(operation)) {
    assertCurrentAssurance(principal, { now, evidence });
  } else assertAssurance(principal, { purpose: operation, now, evidence });
  if (!reads.has(operation) && targetUserId === principal.userId) {
    throw new AccountError("account_forbidden", 403);
  }
  return { actorId: principal.userId, role: membership.role };
}
