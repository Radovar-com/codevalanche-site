import { AccountError, uuid } from "./accountContract.ts";
import { operationRpc } from "./operationJobs.ts";
import { securityCoverage } from "./securityEvent.ts";

export function sourceInsightsEnabled() {
  return typeof Deno !== "undefined" &&
    Deno.env.get("ACCOUNT_SOURCE_INSIGHTS_ENABLED") === "true";
}

export function validateSourceWindow(body: any) {
  if (
    !uuid.test(body.userId || "") || typeof body.from !== "string" || typeof body.to !== "string" || !Number.isFinite(Date.parse(body.from)) ||
    !Number.isFinite(Date.parse(body.to)) || Date.parse(body.from) >= Date.parse(body.to) ||
    Date.parse(body.to) - Date.parse(body.from) > 90 * 86400000 ||
    typeof body.timeZone !== "string" || body.timeZone.length > 100
  ) throw new AccountError("invalid_fields", 400);
  try { new Intl.DateTimeFormat("en", { timeZone: body.timeZone }); }
  catch { throw new AccountError("invalid_fields", 400); }
}

export async function readSourceInsights(body: any, service: any, activity: any) {
  const row = await operationRpc(service, "codevalanche_source_insights", {
    p_user_id: body.userId,
    p_from: body.from,
    p_to: body.to,
    p_timezone: body.timeZone,
  });
  if (!row?.insights) throw new AccountError("account_service_unavailable", 503);
  const result = row.insights;
  const coverage = securityCoverage(result.security.coverage);
  return {
    ...result,
    status: "ready",
    window: { from: body.from, to: body.to, timeZone: body.timeZone, bounds: "[from,to)" },
    security: { ...result.security, coverage, totalLoginFailures: null },
    activity: {
      ...result.activity,
      verifiedSuccessfulRuns: activity.analyticsConsent ? activity.successfulRuns : null,
      verifiedFailedRuns: activity.analyticsConsent ? activity.failedRuns : null,
      verifiedCancelledRuns: activity.analyticsConsent ? activity.cancelledRuns : null,
      sourceQuality: activity.sourceQuality,
      allNativeRunsCovered: false,
      historicalAnonymousMerged: false,
      actualNativeProducer: "unqualified",
    },
  };
}
