import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { allowedOrigin, normalizeProfile } from "./validation.mjs";
import { authenticateAccountContext } from "../_shared/accountPrincipal.ts";
import {
  assertAccountOperation,
  policyFromState,
} from "../_shared/accountPolicy.ts";
import {
  AccountError,
  checked,
  resultEnvelope,
  uuid,
} from "../_shared/accountContract.ts";
import { readCredentialStamp } from "../_shared/credentialStamp.ts";
import {
  assertAssurance,
  assertRecentAuthentication,
} from "../_shared/assurancePolicy.ts";
import {
  authorizeAdmin,
  isAdminMutation,
} from "../_shared/adminAuthorization.ts";
import {
  readAdminDirectory,
  readAdminUserDetail,
} from "../_shared/adminDirectory.ts";
import { requestAccountOperation } from "../_shared/accountLifecycle.ts";
import { cancelErasure, requestErasure } from "../_shared/erasureJob.ts";
import { accountReadout } from "../_shared/accountReadouts.ts";
import { recordAccountRefusal } from "../_shared/securityEvent.ts";
import { reconcileSuspensionExpiry } from "../_shared/suspensionExpiry.ts";
import { projectBinding } from "../_shared/projectBindings.ts";
import { persistProfileWithOutcome, readOwnedProfile } from "../_shared/profileOutcome.ts";
import { operatorOAuthConsent, operatorOAuthEvidence } from "../_shared/operatorOAuthProof.ts";
import { validateAccountRequest } from "./schemas.mjs";
import { generateRecoveryCodes, hashRecoveryCode, mfaGate, normalizeRecoveryCode, verifiedTotpFactors } from "./mfa.mjs";
import { redeemMfaRecovery } from "../_shared/mfaRecovery.ts";
import { exportAccount } from "../_shared/accountExport.ts";
import { createGatewayRetryFetch } from "../_shared/serviceFetch.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const service = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: { fetch: createGatewayRetryFetch() },
});
const operatorOAuthClientIds = (Deno.env.get("ACCOUNT_OPERATOR_OAUTH_CLIENT_IDS") || "").split(",").filter(id =>
  id && (Deno.env.get("ACCOUNT_OAUTH_CLIENT_IDS") || "").split(",").includes(id));
Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
  if (!allowedOrigin(origin)) {
    return new Response(JSON.stringify({ error: "Origin not allowed" }), {
      status: 403,
      headers,
    });
  }
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  let v2 = false, requestId = crypto.randomUUID();
  let verifiedPrincipal: any = null;
  const respond = (body: unknown, status = 200) =>
    new Response(
      JSON.stringify(v2 ? resultEnvelope(body, requestId, status) : body),
      { status, headers },
    );
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (!["POST", "GET"].includes(req.method)) {
    return respond({ error: "Method not allowed" }, 405);
  }
  try {
    let body: any = { action: "get-account" };
    if (req.method === "POST") {
      if (!req.headers.get("content-type")?.startsWith("application/json")) {
        return respond({ error: "JSON required" }, 415);
      }
      const reader = req.body?.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > 16384) {
            await reader.cancel();
            return respond({ error: "Request too large" }, 413);
          }
          chunks.push(value);
        }
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      try {
        body = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        return respond({ error: "Invalid JSON" }, 400);
      }
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return respond({ error: "Invalid body" }, 400);
      }
    }
    v2 = body.apiVersion === 2;
    if (body.requestId !== undefined) {
      if (
        typeof body.requestId !== "string" || body.requestId.length < 1 ||
        body.requestId.length > 128 || !/^[a-zA-Z0-9_-]+$/.test(body.requestId)
      ) return respond({ code: "invalid_fields" }, 400);
      requestId = body.requestId;
    }
    if (body.apiVersion !== undefined && !v2) {
      return respond({ error: "Unsupported API version" }, 400);
    }
    if (typeof body.action !== "string") {
      return respond({ code: "invalid_fields" }, 400);
    }
    if (
      body.action === "remote.policy.evidence" &&
      Object.keys(body).some((key) =>
        !["apiVersion", "action", "requestId"].includes(key)
      )
    ) throw new AccountError("invalid_fields", 400);
    if (!v2 && body.action.includes(".")) {
      return respond({
        code: "invalid_fields",
        message: "Canonical operations require API v2",
      }, 400);
    }
    const { principal, user, sessions, claims, token, recovery } =
      await authenticateAccountContext(req, {
        service,
        issuer: `${url.replace(/\/$/, "")}/auth/v1`,
        clientIds: (Deno.env.get("ACCOUNT_OAUTH_CLIENT_IDS") || "").split(",")
          .filter(Boolean),
      });
    verifiedPrincipal = principal;
    // Every action (v1 names and v2 operations) is shape-checked before it runs
    // (schemas.mjs); a refusal touches no account table and no Auth admin API.
    const invalid = validateAccountRequest(body);
    if (invalid) return respond({ error: invalid.error }, invalid.status);
    if (body.action === "export-account" && Object.keys(body).some(key => !["action", "apiVersion", "requestId"].includes(key))) {
      throw new AccountError("invalid_fields", 400);
    }
    // Two-step verification: a user with a verified authenticator needs an aal2 session (mfa.mjs).
    const mfaRefusal = mfaGate({ user, claims, action: body.action, enforceOAuth: Deno.env.get("CODEVALANCHE_MFA_ENFORCE_OAUTH_AAL2") === "true" });
    if (mfaRefusal) return respond(v2 ? { ...mfaRefusal.body, code: "mfa_required" } : mfaRefusal.body, mfaRefusal.status);
    const totpFactors = verifiedTotpFactors(user) as { id: string; friendly_name?: string; created_at?: string }[];
    // Every administrator read or change is journaled first; without the journal entry nothing is returned.
    const journal = async (action: string, rowCount: number | null, targetUserId: string | null = null, detail: Record<string, unknown> = {}) => {
      checked(await service.from("codevalanche_admin_access_log").insert({ actor_id: user.id, action, target_user_id: targetUserId, row_count: rowCount, detail }));
    };
    let state = checked(
      await service.from("codevalanche_account_state").select("*").eq(
        "user_id",
        user.id,
      ).maybeSingle(),
    );
    if (
      state?.status === "suspended" && state.suspended_until &&
      Date.parse(state.suspended_until) <= Date.now()
    ) {
      await reconcileSuspensionExpiry(user.id, service);
      state = checked(
        await service.from("codevalanche_account_state").select("*").eq(
          "user_id",
          user.id,
        ).maybeSingle(),
      );
    }
    const policy = policyFromState(state);
    const operatorConsent = ["operator.oauth.details", "operator.oauth.approve"].includes(body.action);
    const operatorClaim = body.action === "operator.oauth.claim";
    const operatorRead = body.action.startsWith("admin.") && !isAdminMutation(body.action);
    let operatorEvidence: any = null;
    if (operatorConsent || operatorClaim) {
      const fields = operatorClaim ? ["stateHash", "codeHash", "codeVerifier"] : ["authorizationId"];
      if (!v2 || !uuid.test(requestId) || Object.keys(body).some(key => !["action", "apiVersion", "requestId", ...fields].includes(key))) {
        throw new AccountError("invalid_fields", 400);
      }
    }
    // The recovery exception is assembled only for the explicitly scoped
    // operator read/claim, with the current primary-parent proof and native MFA.
    // Ordinary consumer operations retain their original recovery predicate.
    if (recovery && (operatorRead || operatorClaim)) {
      operatorEvidence = await operatorOAuthEvidence(service, principal, claims, operatorClaim ? body : undefined, operatorOAuthClientIds);
    }
    assertAccountOperation(principal, policy, body.action, { recovery: recovery && !operatorEvidence });
    if (operatorClaim) {
      if (!operatorEvidence) throw new AccountError("recovery_restricted", 403);
      return respond({ claimed: true });
    }
    if (operatorConsent) {
      if (checked(await service.rpc("codevalanche_rate_limit", {p_bucket:`operator-consent:${principal.userId}`,p_limit:20})) === false) {
        throw new AccountError("rate_limited", 429);
      }
      return respond(await operatorOAuthConsent({service,principal,claims,token,authorizationId:body.authorizationId,
        decision:body.action === "operator.oauth.approve" ? "approve" : "details",url,
        apikey:Deno.env.get("SUPABASE_ANON_KEY"),clientIds:(Deno.env.get("ACCOUNT_OAUTH_CLIENT_IDS") || "").split(",").filter(Boolean),operatorClientIds:operatorOAuthClientIds,origin,fetchImpl:fetch}));
    }
    const restrictedCancellation = state?.status === "deletion_pending" &&
      ["account.deletion.cancel", "cancel-deletion"].includes(body.action);
    if (
      user.banned_until && new Date(user.banned_until) > new Date() &&
      !restrictedCancellation
    ) throw new AccountError("account_suspended", 403);
    if (body.action === "remote.policy.evidence") {
      const evidence = await readCredentialStamp(service, principal);
      if (
        !evidence.qualified || !evidence.sessionActive ||
        !Number.isSafeInteger(evidence.policyVersion) ||
        evidence.policyVersion < 1 ||
        !Number.isSafeInteger(evidence.verifiedFactorCount) ||
        evidence.verifiedFactorCount < 0
      ) throw new AccountError("account_service_unavailable", 503);
      if (evidence.currentStatus === "deletion_pending") {
        throw new AccountError("account_deletion_pending", 403);
      }
      if (evidence.currentStatus !== "active" || evidence.blocked) {
        throw new AccountError("account_suspended", 403);
      }
      return respond({
        userId: principal.userId,
        sessionId: principal.sessionId,
        policyVersion: evidence.policyVersion,
        qualified: true,
        verifiedFactorCount: evidence.verifiedFactorCount,
        credentialChangedAt: evidence.credentialChangedAt,
        recoveryOnly: evidence.recoveryOnly,
        sessionActive: true,
      });
    }
    if (
      body.userId !== undefined && !body.action.startsWith("admin") &&
      body.userId !== user.id
    ) return respond({ code: "account_forbidden" }, 403);
    if (
      !checked(
        await service.rpc("codevalanche_rate_limit", {
          p_bucket: `account:${user.id}`,
          p_limit: 60,
        }),
      )
    ) return respond({ code: "rate_limited" }, 429);
    const aliases: Record<string, string> = {
      "account.overview": "get-account",
      "profile.update": "update-profile",
      "sessions.revoke": "revoke-session",
      "sessions.revoke-others": "sign-out-others",
      "account.deletion.request": "request-deletion",
      "account.deletion.cancel": "cancel-deletion",
      "feedback.submit": "feedback",
    };
    if (v2) body.action = aliases[body.action] || body.action;
    if (
      v2 && body.action === "update-profile" &&
      Object.keys(body).some((k) =>
        !["action", "apiVersion", "requestId", "displayName", "bio"].includes(k)
      )
    ) return respond({ code: "invalid_fields" }, 400);
    const saveState = async (
      patch: Record<string, unknown>,
      targetId = user.id,
    ) => {
      checked(
        await service.from("codevalanche_account_state").upsert({
          user_id: targetId,
        }, { onConflict: "user_id", ignoreDuplicates: true }),
      );
      checked(
        await service.from("codevalanche_account_state").update({
          ...patch,
          updated_at: new Date().toISOString(),
        }).eq("user_id", targetId),
      );
    };
    const adminAliases: Record<string, string> = {
      "admin-list-users": "admin.users.list",
      "admin-block-user": "admin.account.suspend",
      "admin-unblock-user": "admin.account.reactivate",
      "admin-feedback": "admin.feedback.list",
      "admin-analytics": "admin.analytics.summary",
    };
    const operation = adminAliases[body.action] || body.action;
    if (operation.startsWith("admin.")) {
      const rowCount = (result: any) => {
        for (const key of ["rows", "users", "feedback", "events", "items"]) if (Array.isArray(result?.[key])) return result[key].length;
        return null;
      };
      // The journal table (migration 202610160301) names the five administrator
      // actions of the first account page; a v2 operation with the same meaning is
      // journaled under that name, with the operation itself in detail.operation.
      // Other v2 administrator operations are recorded by codevalanche_admin_audit.
      const journalAction = Object.keys(adminAliases).find((name) => adminAliases[name] === operation);
      const adminRespond = async (result: any, status = 200) => {
        if (status < 400 && journalAction) await journal(journalAction, rowCount(result), typeof body.userId === "string" ? body.userId : null, { operation, ...(Number.isInteger(body.page) ? { page: body.page } : {}) });
        return respond(result, status);
      };
      const membership = checked(
        await service.from("codevalanche_admin_memberships").select(
          "role,active",
        ).eq("user_id", user.id).maybeSingle(),
      ) as any;
      if (
        !membership?.active ||
        !["owner", "accounts_admin", "support_readonly"].includes(
          membership.role,
        )
      ) throw new AccountError("administrator_required", 403);
      const evidence = operatorEvidence || await readCredentialStamp(service, principal);
      const admin = await authorizeAdmin(
        principal,
        operation,
        body.userId || null,
        { service, evidence },
      );
      if (
        isAdminMutation(operation) &&
        !checked(
          await service.rpc("codevalanche_rate_limit", {
            p_bucket: `admin:${principal.userId}`,
            p_limit: 30,
          }),
        )
      ) throw new AccountError("rate_limited", 429);
      if (operation === "admin.operator.session") {
        return await adminRespond({ principal, role: admin.role });
      }
      if (operation === "admin.deletion.get") {
        if (!uuid.test(body.jobId || "")) {
          throw new AccountError("invalid_fields", 400);
        }
        const job = checked(
          await service.from("codevalanche_account_erasure_jobs").select(
            "job_id,operation_id,user_id,state,due_at,purge_started_at,storage_cleaned_at,auth_delete_started_at,auth_deleted_at,completed_at,attempts",
          ).eq("job_id", body.jobId).maybeSingle(),
        );
        if (!job) throw new AccountError("not_found", 404);
        if (body.userId && body.userId !== job.user_id) {
          throw new AccountError("account_forbidden", 403);
        }
        return await adminRespond({
          jobId: job.job_id,
          operationId: job.operation_id,
          userId: job.user_id,
          state: job.state,
          dueAt: job.due_at,
          purgeStartedAt: job.purge_started_at,
          storageCleanedAt: job.storage_cleaned_at,
          authDeleteStartedAt: job.auth_delete_started_at,
          authDeletedAt: job.auth_deleted_at,
          completedAt: job.completed_at,
          attempts: job.attempts,
          localFilesTouched: false,
        });
      }
      const readout = await accountReadout(operation, body, {
        principal,
        service,
        admin,
      });
      if (readout !== null) return await adminRespond(readout);
      if (operation === "admin.users.list") {
        return await adminRespond(await readAdminDirectory(service, body));
      }
      if (operation === "admin.users.detail") {
        return await adminRespond(await readAdminUserDetail(service, body.userId));
      }
      if (operation === "admin.deletion.request") {
        return await adminRespond(
          await requestErasure({
            userId: body.userId,
            actorId: principal.userId,
            operationId: body.operationId,
            confirmation: body.confirmation,
          }, service),
          202,
        );
      }
      if (
        [
          "admin.account.suspend",
          "admin.account.reactivate",
          "admin.limits.update",
          "admin.sessions.revoke",
        ].includes(operation)
      ) {
        const result: any = await requestAccountOperation({
          ...body,
          actorId: principal.userId,
          action: operation,
        }, service);
        if (operation === "admin.account.suspend" && result?.state !== "failed") {
          // Banned (or the ban is queued) first, then every app session, Auth
          // session and refresh token of the target is cut.
          const cut = checked(await service.rpc("codevalanche_revoke_all_sessions", { p_user_id: body.userId })) as { app_revoked?: number; auth_sessions_deleted?: number; refresh_tokens_deleted?: number; auth_revoked?: boolean } | null;
          result.sessions = { appRevoked: Number(cut?.app_revoked) || 0, authSessionsDeleted: Number(cut?.auth_sessions_deleted) || 0, refreshTokensDeleted: Number(cut?.refresh_tokens_deleted) || 0, authRevoked: cut?.auth_revoked === true };
        }
        return await adminRespond(result, result.state === "completed" ? 200 : 202);
      }
      if (operation === "admin.operations.get") {
        if (!uuid.test(body.operationId || "")) {
          throw new AccountError("invalid_fields", 400);
        }
        const row = checked(
          await service.from("codevalanche_operation_jobs").select(
            "operation_id,state,action,user_id,attempts,updated_at,error_code",
          ).eq("operation_id", body.operationId).maybeSingle(),
        );
        if (!row) throw new AccountError("not_found", 404);
        return await adminRespond({
          operationId: row.operation_id,
          state: row.state,
          action: row.action,
          userId: row.user_id,
          attempts: row.attempts,
          updatedAt: row.updated_at,
          errorCode: row.error_code,
        });
      }
      return await adminRespond({ code: "operation_not_available" }, 503);
    }
    if (operation === "security.mfa.remove-authorize") {
      const evidence = await readCredentialStamp(service, principal);
      assertAssurance(principal, { purpose: "mfa.remove", evidence });
      return respond({ ok: true });
    }
    const readout = await accountReadout(operation, body, {
      principal,
      service,
    });
    if (readout !== null) return respond(readout);
    const binding = await projectBinding(operation, body, {
      principal,
      policy,
      service,
    });
    if (binding !== null) return respond(binding);
    if (body.action === "export-account") {
      try { return respond(await exportAccount(service, principal)); }
      catch (error) {
        if (error instanceof AccountError && error.code === "rate_limited") {
          headers["Retry-After"] = "300";
          return respond({ code: "rate_limited", retryAfterSeconds: 300 }, 429);
        }
        throw error;
      }
    }
    switch (body.action) {
      case "get-account": {
        const profile = await readOwnedProfile(service, user);
        const name = profile.display_name;
        return respond({
          id: user.id,
          userId: user.id,
          sub: user.id,
          session_id: claims.session_id,
          email: user.email,
          email_verified: !!user.email_confirmed_at,
          display_name: name,
          name,
          user: {
            id: user.id,
            email: user.email,
            displayName: name,
            bio: profile.bio,
            emailVerified: !!user.email_confirmed_at,
          },
          signInMethods: (user.identities || []).map((
            i: { identity_id?: string; provider: string; created_at?: string },
          ) => ({
            id: i.identity_id,
            provider: i.provider,
            createdAt: i.created_at,
          })),
          sessions: sessions.map((s) => ({
            id: s.id,
            createdAt: s.created_at,
            lastSeenAt: s.updated_at,
            userAgent: s.user_agent || "Unknown device",
            current: s.id === claims.session_id,
          })),
          deletion: state?.deletion_scheduled_for
            ? { scheduledFor: state.deletion_scheduled_for, status: "pending" }
            : null,
          dataExport: { schemaVersion: 1, cooldownSeconds: 300 },
          analyticsConsent: state?.analytics_consent || false,
          consentGeneration: state?.consent_generation || 1,
          policy,
          mfa: {
            enabled: totpFactors.length > 0,
            factors: totpFactors.map((f) => ({ id: f.id, friendlyName: f.friendly_name || "", createdAt: f.created_at })),
            recoveryCodesRemaining: totpFactors.length ? Number(checked(await service.rpc("codevalanche_mfa_recovery_remaining", { p_user_id: user.id })) || 0) : 0,
          },
          ...(v2 ? { principal } : {}),
        });
      }
      case "update-profile": {
        let patch;
        try {
          patch = normalizeProfile(body);
        } catch {
          return respond({ error: "Invalid profile" }, 400);
        }
        return respond(await persistProfileWithOutcome({principal,validatedChanges:patch,requestId:body.requestId,consentGeneration:state?.consent_generation},service));
      }
      case "sign-out-current":
      case "sign-out-others": {
        const result = await service.auth.admin.signOut(
          token,
          body.action === "sign-out-current" ? "local" : "others",
        );
        if (result.error) throw new Error("Sign out failed");
        return respond({ ok: true });
      }
      case "revoke-session": {
        if (
          !uuid.test(body.sessionId || "") ||
          !sessions.some((s) => s.id === body.sessionId)
        ) return respond({ error: "Session not found" }, 404);
        checked(
          await service.from("codevalanche_revoked_sessions").upsert({
            session_id: body.sessionId,
            user_id: user.id,
          }),
        );
        return respond({ ok: true });
      }
      case "mfa-recovery-codes": {
        // Shown once; only hashes are stored. Replaces any earlier codes.
        if (!totpFactors.length) return respond({ error: "MFA not enabled" }, 400);
        assertAssurance(principal, { purpose: "mfa.recovery.replace", evidence: await readCredentialStamp(service, principal) });
        const codes = generateRecoveryCodes();
        const hashes = await Promise.all(codes.map((code: string) => hashRecoveryCode(user.id, normalizeRecoveryCode(code))));
        checked(await service.rpc("codevalanche_mfa_recovery_replace", { p_user_id: user.id, p_code_hashes: hashes }));
        return respond({ codes });
      }
      case "mfa-recovery-redeem": {
        // Lost authenticator: one unused recovery code removes the authenticator from this account.
        if (!checked(await service.rpc("codevalanche_rate_limit", { p_bucket: `mfa-recovery:${user.id}`, p_limit: 5 }))) return respond({ error: "Too many requests" }, 429);
        const code = normalizeRecoveryCode(body.code);
        if (!code || !await redeemMfaRecovery(service, user.id, await hashRecoveryCode(user.id, code))) return respond({ error: "Invalid recovery code" }, 400);
        return respond({ ok: true, mfa: { enabled: false } });
      }
      case "mfa-disable": {
        const factor = (user.factors || []).find((f: { id: string; factor_type: string }) => f.id === body.factorId && f.factor_type === "totp");
        if (!factor) return respond({ error: "Factor not found" }, 404);
        assertAssurance(principal, { purpose: "mfa.remove", evidence: await readCredentialStamp(service, principal) });
        const result = await service.auth.admin.mfa.deleteFactor({ id: factor.id, userId: user.id });
        if (result.error) throw new Error("Factor removal failed");
        if (!totpFactors.some((f) => f.id !== factor.id)) checked(await service.rpc("codevalanche_mfa_recovery_clear", { p_user_id: user.id }));
        return respond({ ok: true });
      }
      case "request-deletion": {
        if (body.confirmation !== "DELETE") {
          return respond({ error: "Type DELETE to confirm" }, 400);
        }
        assertRecentAuthentication(principal, {
          claims,
          evidence: await readCredentialStamp(service, principal),
        });
        const job = await requestErasure({
          userId: user.id,
          actorId: user.id,
          operationId: body.operationId || crypto.randomUUID(),
          confirmation: body.confirmation,
        }, service);
        return respond({
          ok: true,
          ...job,
          deletion: { scheduledFor: job.dueAt, status: "pending" },
        }, 202);
      }
      case "cancel-deletion": {
        assertRecentAuthentication(principal, {
          claims,
          evidence: await readCredentialStamp(service, principal),
        });
        return respond({
          ok: true,
          ...await cancelErasure(principal, service),
        });
      }
      case "consent":
        return respond({
          code: "invalid_fields",
          message:
            "Accept account-attributed analytics through analytics.consent v2",
        }, 400);
      case "feedback": {
        if (
          !["bug", "idea", "general"].includes(body.category) ||
          typeof body.message !== "string" || !body.message.trim() ||
          body.message.length > 4000
        ) return respond({ error: "Invalid feedback" }, 400);
        if (
          !checked(
            await service.rpc("codevalanche_rate_limit", {
              p_bucket: `feedback:${user.id}`,
              p_limit: 3,
            }),
          )
        ) return respond({ error: "Too many requests" }, 429);
        checked(
          await service.from("codevalanche_feedback").insert({
            user_id: user.id,
            category: body.category,
            message: body.message.trim(),
          }),
        );
        return respond({ ok: true });
      }
      case "event": {
        return respond({
          code: "invalid_fields",
          message:
            "Identified activity requires event.submit API v2 and the current consent generation",
        }, 400);
      }
      default:
        return respond({ error: "Unknown action" }, 400);
    }
  } catch (error) {
    if (error instanceof AccountError) {
      if (verifiedPrincipal) {
        await recordAccountRefusal(service, verifiedPrincipal, error.code)
          .catch(() => undefined);
      }
      return respond({ code: error.code, error: error.message }, error.status);
    }
    return respond({ error: "Account service unavailable" }, 503);
  }
});
