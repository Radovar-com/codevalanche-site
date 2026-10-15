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
    typeof userId !== "string" || !uuid.test(userId) ||
    typeof from !== "string" || typeof to !== "string" || !Number.isFinite(Date.parse(from)) ||
    !Number.isFinite(Date.parse(to)) || Date.parse(from) >= Date.parse(to) ||
    Date.parse(to) - Date.parse(from) > 366 * 86400000 ||
    typeof timeZone !== "string" || timeZone.length > 100
  ) throw new AccountError("invalid_fields", 400);
  try { new Intl.DateTimeFormat("en", { timeZone }).format(); }
  catch { throw new AccountError("invalid_fields", 400); }
  const row = await operationRpc(service, "codevalanche_user_activity_readout", {
    p_user_id: userId,
    p_from: from,
    p_to: to,
    p_timezone: timeZone,
  });
  const summary = row?.summary;
  if (!summary || summary.userId !== userId.toLowerCase() ||
    Date.parse(summary.from) !== Date.parse(from) || Date.parse(summary.to) !== Date.parse(to) ||
    summary.timeZone !== timeZone || typeof summary.analyticsConsent !== "boolean" ||
    !Array.isArray(summary.daily) || summary.daily.length > 368 ||
    (summary.analyticsConsent !== true && summary.daily.length !== 0) ||
    summary.daily.some((day: any, i: number) => !day || typeof day.day !== "string" ||
      !/^\d{4}-\d\d-\d\d$/.test(day.day) ||
      !Number.isFinite(Date.parse(day.day)) || new Date(day.day).toISOString().slice(0,10) !== day.day ||
      (i > 0 && summary.daily[i-1].day >= day.day) ||
      ![0,1].includes(day.activeUsers) ||
      [day.eventCount,day.appOpened].some(v => !Number.isSafeInteger(v) || v < 0) ||
      day.appOpened > day.eventCount ||
      [day.completed,day.failed,day.cancelled].some(v => v !== null && (!Number.isSafeInteger(v) || v < 0))))
    throw new AccountError("account_service_unavailable", 503);
  return summary;
}
