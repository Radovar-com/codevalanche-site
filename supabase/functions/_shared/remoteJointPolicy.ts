import { authenticateAccountContext } from "./accountPrincipal.ts";
import {
  AccountError,
  checked,
  resultEnvelope,
  uuid,
} from "./accountContract.ts";

const canonicalUuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function exact(value: any, keys: string[]) {
  return value && typeof value === "object" && !Array.isArray(value) &&
    Object.keys(value).sort().join(",") === [...keys].sort().join(",");
}
function actor(value: any) {
  return exact(value, ["userId", "sessionId", "clientId"]) &&
    canonicalUuid.test(value.userId) && canonicalUuid.test(value.sessionId) &&
    (value.clientId === null ||
      (typeof value.clientId === "string" && value.clientId.length > 0 &&
        value.clientId.length <= 128));
}
async function boundedBody(req: Request) {
  const reader = req.body?.getReader();
  if (!reader) throw new AccountError("invalid_fields", 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 32768) {
        await reader.cancel();
        throw new AccountError("invalid_fields", 400);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new AccountError("invalid_fields", 400);
  }
}
function bind(context: any, expected: any) {
  const p = context.principal;
  if (
    p.userId !== expected.userId || p.sessionId !== expected.sessionId ||
    p.clientId !== expected.clientId || context.recovery
  ) throw new AccountError("account_forbidden", 403);
  // A recovery/OTP authentication newer than the primary sign-in is restricted,
  // even when the token still carries an older primary AMR entry.
  const amr = Array.isArray(context.claims.amr) ? context.claims.amr : [];
  const primary = Math.max(
    ...amr.filter((m: any) =>
      ["password", "oauth", "sso/saml"].includes(m.method) &&
      Number.isFinite(m.timestamp)
    ).map((m: any) => m.timestamp),
  );
  if (
    !Number.isFinite(primary) ||
    amr.some((m: any) =>
      ["otp", "recovery", "invite", "signup", "magiclink"].includes(m.method) &&
      (!Number.isFinite(m.timestamp) || m.timestamp >= primary)
    )
  ) throw new AccountError("account_forbidden", 403);
}
function stateMatches(state: any, principal: any) {
  return state &&
    exact(state, [
      "principal",
      "policy",
      "recoveryRestricted",
      "sessionActive",
      "mfaCurrent",
    ]) &&
    exact(state.principal, [
      "userId",
      "sessionId",
      "clientId",
      "aal",
      "mfaVerifiedAt",
      "emailVerified",
    ]) &&
    exact(state.policy, [
      "status",
      "suspendedUntil",
      "policyVersion",
      "limits",
    ]) &&
    exact(state.policy.limits, [
      "enabled",
      "maxHosts",
      "maxControllers",
      "maxConcurrentRuns",
    ]) &&
    state.principal.userId === principal.userId &&
    state.principal.sessionId === principal.sessionId &&
    state.principal.clientId === principal.clientId &&
    state.principal.aal === principal.aal &&
    Date.parse(state.principal.mfaVerifiedAt) ===
      Date.parse(principal.mfaVerifiedAt) &&
    state.principal.emailVerified === true && state.principal.aal === "aal2" &&
    state.sessionActive === true && state.recoveryRestricted === false &&
    state.mfaCurrent === true && state.policy.status === "active" &&
    Number.isSafeInteger(state.policy.policyVersion) &&
    state.policy.policyVersion > 0 &&
    state.policy.limits.enabled === true &&
    [
      state.policy.limits.maxHosts,
      state.policy.limits.maxControllers,
      state.policy.limits.maxConcurrentRuns,
    ].every((n) => Number.isSafeInteger(n) && n >= 0);
}
// Private fixed endpoint. Caller actor tuples are equality constraints only;
// all assurance originates from exact GoTrue-verified tokens and final joint SQL.
export function createRemoteJointPolicyHandler(
  { service, issuer, clientIds = [], enabled = false }: any,
) {
  return async (req: Request) => {
    let requestId = crypto.randomUUID();
    const respond = (data: any, status = 200) =>
      Response.json(
        resultEnvelope(data, requestId, status),
        { status, headers: { "Cache-Control": "no-store" } },
      );
    try {
      if (enabled !== true) {
        throw new AccountError("account_service_unavailable", 503);
      }
      const url = new URL(req.url);
      if (req.headers.has("origin") || req.headers.has("cookie")) {
        throw new AccountError("account_forbidden", 403);
      }
      if (
        req.method !== "POST" || url.protocol !== "https:" ||
        url.origin !== new URL(issuer).origin ||
        url.pathname !== "/functions/v1/account-remote-joint" || url.search ||
        url.hash ||
        !/^application\/json(?:\s*;.*)?$/i.test(
          req.headers.get("content-type") || "",
        )
      ) {
        throw new AccountError("invalid_fields", 400);
      }
      const body = await boundedBody(req);
      if (
        typeof body?.requestId === "string" &&
        canonicalUuid.test(body.requestId)
      ) {
        requestId = body.requestId;
      }
      if (
        !exact(body, [
          "apiVersion",
          "action",
          "requestId",
          "host",
          "controller",
          "controllerAccessToken",
        ]) ||
        body.apiVersion !== 2 || body.action !== "remote.policy.joint" ||
        typeof body.requestId !== "string" ||
        !canonicalUuid.test(body.requestId) ||
        !actor(body.host) || !actor(body.controller) ||
        typeof body.controllerAccessToken !== "string" ||
        !/^\S{1,12000}$/.test(body.controllerAccessToken)
      ) {
        throw new AccountError("invalid_fields", 400);
      }
      requestId = body.requestId;
      if (body.host.userId !== body.controller.userId) {
        throw new AccountError("account_forbidden", 403);
      }
      const options = { service, issuer, clientIds };
      const host = await authenticateAccountContext(req, options);
      bind(host, body.host);
      const controllerRequest = new Request(req.url, {
        headers: { Authorization: `Bearer ${body.controllerAccessToken}` },
      });
      const controller = await authenticateAccountContext(
        controllerRequest,
        options,
      );
      bind(controller, body.controller);
      const snapshotId = crypto.randomUUID();
      // LAST authorization await: one statement rereads BOTH original sessions,
      // current credential/factor/AMR/ban/policy/limits/stamp qualification together.
      const rows: any = checked(
        await service.rpc("codevalanche_remote_joint_policy", {
          p_user_id: host.principal.userId,
          p_snapshot_id: snapshotId,
          p_host_session_id: host.principal.sessionId,
          p_host_client_id: host.principal.clientId,
          p_host_aal: host.principal.aal,
          p_host_mfa_verified_at: host.principal.mfaVerifiedAt,
          p_host_expires_at: new Date(host.claims.exp * 1000).toISOString(),
          p_controller_session_id: controller.principal.sessionId,
          p_controller_client_id: controller.principal.clientId,
          p_controller_aal: controller.principal.aal,
          p_controller_mfa_verified_at: controller.principal.mfaVerifiedAt,
          p_controller_expires_at: new Date(controller.claims.exp * 1000)
            .toISOString(),
        }),
      );
      const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      if (!row || row.qualified !== true) {
        throw new AccountError("account_service_unavailable", 503);
      }
      const snapshot = row.snapshot;
      if (!snapshot) throw new AccountError("account_forbidden", 403);
      if (
        !exact(snapshot, ["source", "snapshotId", "host", "controller"]) ||
        snapshot.source !== "site_auth_sql_snapshot" ||
        snapshot.snapshotId !== snapshotId ||
        !uuid.test(snapshot.snapshotId) ||
        !stateMatches(snapshot.host, host.principal) ||
        !stateMatches(snapshot.controller, controller.principal) ||
        snapshot.host.policy.policyVersion !==
          snapshot.controller.policy.policyVersion
      ) {
        throw new AccountError("account_service_unavailable", 503);
      }
      return respond(snapshot);
    } catch (error) {
      // Never log tokens, raw requests, provider responses or errors.
      return respond({
        code: error instanceof AccountError
          ? error.code
          : "account_service_unavailable",
      }, error instanceof AccountError ? error.status : 503);
    }
  };
}
