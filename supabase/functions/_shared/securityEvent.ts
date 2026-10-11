import { AccountError, checked, uuid } from "./accountContract.ts";
const userId = (value: any) =>
  typeof value === "string" && uuid.test(value) ? value : null;
export function normalizePasswordHook(
  input: any,
  now = new Date().toISOString(),
) {
  if (typeof input.valid !== "boolean") {
    throw new AccountError("invalid_fields", 400);
  }
  return {
    eventId: crypto.randomUUID(),
    source: "password_hook",
    sourceEventId: null,
    occurredAt: now,
    receivedAt: now,
    userId: userId(input.user_id),
    sessionId: null,
    eventName: input.valid ? "password_valid" : "password_invalid",
    outcome: input.valid ? "password_verified" : "password_refused",
    reasonCode: null,
    ip: null,
    coverage: { session: false, ip: false, unknownEmail: false },
  };
}
export function normalizeProviderEvent(
  input: any,
  now = new Date().toISOString(),
) {
  if (
    typeof input.id !== "string" || input.id.length < 1 ||
    input.id.length > 200 || !Number.isFinite(Date.parse(input.created_at))
  ) throw new AccountError("invalid_fields", 400);
  const uid = userId(input.user_id), sid = userId(input.session_id);
  const success = input.action === "login" && !!uid && !!sid;
  const eventName = success
    ? "login_succeeded"
    : input.action === "login_failed"
    ? "login_failed"
    : input.action === "token_refreshed"
    ? "token_refreshed"
    : "provider_observed";
  return {
    eventId: crypto.randomUUID(),
    source: "provider_audit",
    sourceEventId: input.id,
    occurredAt: new Date(input.created_at).toISOString(),
    receivedAt: now,
    userId: uid,
    sessionId: sid,
    eventName,
    outcome: success
      ? "success"
      : input.action === "login_failed"
      ? "failed"
      : "unconfirmed",
    reasonCode: null,
    ip: null,
    coverage: { session: !!sid, ip: false, unknownEmail: !uid },
  };
}
export function securityCoverage(
  {
    providerAuditEnabled = false,
    passwordHookEnabled = false,
    watermark = null,
    now = Date.now(),
  }: any = {},
) {
  const fresh = Number.isFinite(Date.parse(watermark)) &&
    now - Date.parse(watermark) >= 0 && now - Date.parse(watermark) <= 300000;
  return {
    status: providerAuditEnabled && passwordHookEnabled && fresh
      ? "qualified"
      : "coverage_incomplete",
    providerAuditEnabled,
    passwordHookEnabled,
    watermark,
    fresh,
    unknownEmailCoverage: "unqualified",
    ipCoverage: "unavailable",
  };
}
export async function importSecurityEvents(
  service: any,
  events: any[],
  cursor: string,
) {
  if (
    !Array.isArray(events) || events.length > 100 ||
    typeof cursor !== "string" || cursor.length > 200
  ) throw new AccountError("invalid_fields", 400);
  const normalized = events.map((e) => normalizeProviderEvent(e));
  return checked(
    await service.rpc("codevalanche_import_security_events", {
      p_events: normalized,
      p_cursor: cursor,
    }),
  );
}
export async function recordAccountRefusal(
  service: any,
  principal: any,
  code: string,
) {
  return checked(
    await service.from("codevalanche_security_events").insert({
      event_id: crypto.randomUUID(),
      source: "application_api",
      occurred_at: new Date().toISOString(),
      user_id: principal.userId,
      session_id: principal.sessionId,
      event_name: "account_refused",
      outcome: "refused",
      reason_code: code,
      coverage: { identity: "verified", ip: false },
    }),
  );
}
