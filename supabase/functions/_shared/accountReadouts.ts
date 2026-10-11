import { AccountError, checked, uuid } from "./accountContract.ts";
import { operationRpc } from "./operationJobs.ts";
import { acceptAnalyticsEvent, summarizeUserActivity } from "./analytics.ts";
import { securityCoverage } from "./securityEvent.ts";
import { readReadoutPage } from "./readoutCursor.ts";
export async function accountReadout(
  operation: string,
  body: any,
  { principal, service, admin }: any,
) {
  if (operation === "admin.deletion.cancel") {
    if (
      !uuid.test(body.userId || "") || !uuid.test(body.jobId || "") ||
      !uuid.test(body.operationId || "") ||
      typeof body.reasonCode !== "string" || typeof body.reason !== "string"
    ) throw new AccountError("invalid_fields", 400);
    const row = await operationRpc(
      service,
      "codevalanche_cancel_erasure_admin",
      {
        p_actor_id: principal.userId,
        p_user_id: body.userId,
        p_job_id: body.jobId,
        p_operation_id: body.operationId,
        p_reason_code: body.reasonCode,
        p_reason: body.reason,
      },
    );
    return {
      operationId: row.operation_id,
      state: row.state,
      jobId: row.job_id,
      erasureState: row.erasure_state,
    };
  }
  if (operation === "analytics.consent") {
    if (typeof body.analytics !== "boolean") {
      throw new AccountError("invalid_fields", 400);
    }
    const row = await operationRpc(service, "codevalanche_analytics_consent", {
      p_user_id: principal.userId,
      p_enabled: body.analytics,
    });
    if (!row) throw new AccountError("account_forbidden", 403);
    return {
      analyticsConsent: row.analytics_consent,
      consentGeneration: row.consent_generation,
    };
  }
  if (operation === "analytics.event" || operation === "event.submit") {
    return acceptAnalyticsEvent(
      principal,
      body.event,
      body.consentGeneration,
      service,
    );
  }
  if (
    operation === "analytics.summary" || operation === "admin.analytics.summary"
  ) {
    return summarizeUserActivity({
      actor: admin ? { userId: principal.userId, role: admin.role } : principal,
      userId: admin ? body.userId : principal.userId,
      from: body.from,
      to: body.to,
      timeZone: body.timeZone,
    }, service);
  }
  if (
    operation === "security.activity" || operation === "admin.security.list"
  ) {
    if (admin && body.userId !== undefined && !uuid.test(body.userId)) {
      throw new AccountError("invalid_fields", 400);
    }
    const page = await readReadoutPage(
      service,
      "security",
      body,
      admin ? (body.userId || null) : principal.userId,
    );
    const rows = page.rows;
    const cursor = checked(
      await service.from("codevalanche_provider_event_cursor").select("*").eq(
        "source",
        "provider_audit",
      ).maybeSingle(),
    ) as {
      provider_audit_enabled: boolean;
      password_hook_enabled: boolean;
      watermark: string | null;
    } | null;
    return {
      events: rows.map((r) => ({
        eventId: r.event_id,
        source: r.source,
        sourceEventId: r.source_event_id,
        occurredAt: r.occurred_at,
        receivedAt: r.received_at,
        userId: r.user_id,
        sessionId: r.session_id,
        eventName: r.event_name,
        outcome: r.outcome,
        reasonCode: r.reason_code,
        coverage: r.coverage,
      })),
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      coverage: securityCoverage({
        providerAuditEnabled: cursor?.provider_audit_enabled,
        passwordHookEnabled: cursor?.password_hook_enabled,
        watermark: cursor?.watermark,
      }),
    };
  }
  if (
    operation === "admin.notifications.list" ||
    operation === "admin.audit.list" || operation === "admin.feedback.list"
  ) {
    if (body.userId !== undefined && !uuid.test(body.userId)) {
      throw new AccountError("invalid_fields", 400);
    }
    const kind = operation === "admin.notifications.list"
      ? "notifications"
      : operation === "admin.audit.list"
      ? "audit"
      : "feedback";
    const page = await readReadoutPage(
      service,
      kind,
      body,
      body.userId || null,
    );
    return {
      items: page.rows,
      nextCursor: page.nextCursor,
      hasMore: page.hasMore,
      coverage: {
        scope: "application_store",
        emailChannel: "inspect_delivery_state",
        total: null,
      },
    };
  }
  if (operation === "admin.feedback.update") {
    if (
      !uuid.test(body.feedbackId || "") || !uuid.test(body.operationId || "") ||
      !["open", "triaged", "resolved"].includes(body.status) ||
      typeof body.reasonCode !== "string" || typeof body.reason !== "string"
    ) throw new AccountError("invalid_fields", 400);
    const row = await operationRpc(service, "codevalanche_feedback_update", {
      p_actor_id: principal.userId,
      p_feedback_id: body.feedbackId,
      p_status: body.status,
      p_operation_id: body.operationId,
      p_reason_code: body.reasonCode,
      p_reason: body.reason,
    });
    return { operationId: row.operation_id, state: row.state };
  }
  return null;
}
