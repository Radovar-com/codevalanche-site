import { AccountError, checked, uuid } from "./accountContract.ts";
import { readClaims } from "../codevalanche-account/validation.mjs";
import type { Principal } from "./accountContract.ts";
import { isRestrictedRecovery } from "./recoveryPolicy.ts";
// getUser validates this exact access token remotely; decoding never substitutes signature verification.
export async function authenticateAccount(
  req: Request,
  options: any,
): Promise<Principal> {
  return (await authenticateAccountContext(req, options)).principal;
}
export async function authenticateAccountContext(
  req: Request,
  { service, issuer, clientIds = [], now }: any,
) {
  const currentTime = () => now === undefined ? Date.now() : now;
  const token = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token || token.length > 12000) {
    throw new AccountError("sign_in_required", 401);
  }
  const { data, error } = await service.auth.getUser(token);
  const user = data?.user;
  if (error) {
    if (error.code === "user_banned") {
      throw new AccountError("account_suspended", 403);
    }
    // The Auth SDK reports a missing/revoked provider session as this named 400.
    if (
      [401, 403].includes(error.status) ||
      (error.status === 400 && error.name === "AuthSessionMissingError")
    ) {
      throw new AccountError("sign_in_required", 401);
    }
    throw new AccountError("account_service_unavailable", 503);
  }
  if (!user) throw new AccountError("sign_in_required", 401);
  let claims: any;
  try {
    claims = readClaims(token);
  } catch {
    throw new AccountError("sign_in_required", 401);
  }
  if (
    !uuid.test(user.id) || claims.sub !== user.id ||
    !uuid.test(claims.session_id || "") || claims.iss !== issuer ||
    claims.aud !== "authenticated" || claims.role !== "authenticated" ||
    !Number.isFinite(claims.exp) || claims.exp <= currentTime() / 1000 ||
    (claims.token_use !== undefined && claims.token_use !== "access") ||
    (claims.client_id !== undefined &&
      (!clientIds.includes(claims.client_id) ||
        typeof claims.client_id !== "string"))
  ) throw new AccountError("sign_in_required", 401);
  const sessions = checked(
    await service.rpc("codevalanche_sessions", { p_user_id: user.id }),
  ) as any[];
  if (
    !Array.isArray(sessions) ||
    !sessions.some((s) => s.id === claims.session_id)
  ) throw new AccountError("session_revoked", 401);
  if (claims.exp <= currentTime() / 1000) {
    throw new AccountError("sign_in_required", 401);
  }
  const amr = Array.isArray(claims.amr) ? claims.amr : [];
  const times = amr.filter((m: any) =>
    m.method === "totp" && Number.isFinite(m.timestamp) && m.timestamp > 0 &&
    m.timestamp <= currentTime() / 1000
  ).map((m: any) => m.timestamp);
  const principal: Principal = {
    userId: user.id,
    sessionId: claims.session_id,
    clientId: claims.client_id ?? null,
    aal: claims.aal === "aal2" ? "aal2" : "aal1",
    mfaVerifiedAt: times.length
      ? new Date(Math.max(...times) * 1000).toISOString()
      : null,
    emailVerified: !!user.email_confirmed_at,
  };
  return {
    principal,
    user,
    sessions,
    claims,
    token,
    recovery: isRestrictedRecovery(claims),
  };
}
