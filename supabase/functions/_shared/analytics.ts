import { AccountError, uuid } from "./accountContract.ts";
import { operationRpc } from "./operationJobs.ts";
export async function acceptAnalyticsEvent(
  principal: any,
  event: any,
  consentGeneration: number,
  service: any,
) {
  const keys = [
    "eventId",
    "eventName",
    "platform",
    "appVersion",
    "installationId",
    "occurredAt",
    "outcome",
    "runId",
    "projectId",
    "source",
    "receiptId",
  ];
  if (
    !event || Object.keys(event).some((k) => !keys.includes(k)) ||
    !uuid.test(event.eventId || "") || !uuid.test(event.installationId || "") ||
    ![
      "app_opened",
      "login_succeeded",
      "provider_connected",
      "first_success",
      "run_finished",
      "remote_connected",
      "remote_reconnect",
    ].includes(event.eventName) ||
    !["web", "windows", "macos", "linux", "ios", "android"].includes(
      event.platform,
    ) || typeof event.appVersion !== "string" || event.appVersion.length > 64 ||
    !Number.isFinite(Date.parse(event.occurredAt)) ||
    Date.parse(event.occurredAt) > Date.now() + 300000 ||
    Date.now() - Date.parse(event.occurredAt) > 86400000 ||
    !Number.isInteger(consentGeneration) || consentGeneration < 1 ||
    (event.outcome !== undefined &&
      !["success", "failed", "cancelled"].includes(event.outcome)) ||
    (event.source !== undefined &&
      !["client", "native_ledger"].includes(event.source)) ||
    ["runId", "projectId"].some((k) =>
      event[k] !== undefined &&
      (typeof event[k] !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(event[k]))
    ) || (event.receiptId !== undefined && !uuid.test(event.receiptId))
  ) throw new AccountError("invalid_fields", 400);
  const row = await operationRpc(service, "codevalanche_accept_analytics", {
    p_user_id: principal.userId,
    p_event: event,
    p_consent_generation: consentGeneration,
  });
  return { accepted: row?.accepted === true };
}
export async function summarizeUserActivity(
  { actor, userId, from, to, timeZone = "UTC" }: any,
  service: any,
) {
  if (
    actor.userId !== userId &&
    !["owner", "accounts_admin", "support_readonly"].includes(actor.role)
  ) throw new AccountError("account_forbidden", 403);
  if (
    !uuid.test(userId || "") || !Number.isFinite(Date.parse(from)) ||
    !Number.isFinite(Date.parse(to)) || Date.parse(from) >= Date.parse(to) ||
    Date.parse(to) - Date.parse(from) > 366 * 86400000 ||
    typeof timeZone !== "string" || timeZone.length > 100
  ) throw new AccountError("invalid_fields", 400);
  const row = await operationRpc(service, "codevalanche_analytics_summary", {
    p_user_id: userId,
    p_from: from,
    p_to: to,
    p_timezone: timeZone,
  });
  return row.summary;
}
