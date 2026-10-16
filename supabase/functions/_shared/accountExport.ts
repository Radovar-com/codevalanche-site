import { AccountError, checked } from "./accountContract.ts";

/** Format tag of the export document; bump only with a written migration note. */
export const ACCOUNT_EXPORT_FORMAT = "codevalanche-account-export/v1";
/** Exports a person may start per minute (one bucket per account). */
export const ACCOUNT_EXPORT_PER_MINUTE = 2;

/**
 * Everything the account service holds about the signed-in person, as one JSON
 * document (GDPR right of access / portability). Auth-owned identity fields
 * come from the verified Auth user and the live session list; application rows
 * come from the service-role-only `codevalanche_account_export` RPC.
 */
export async function buildAccountExport(
  { user, sessions, currentSessionId }: {
    user: any;
    sessions: any[];
    currentSessionId: string;
  },
  service: any,
  now = new Date(),
) {
  if (!user?.id) throw new AccountError("sign_in_required", 401);
  const result = await service.rpc("codevalanche_account_export", {
    p_user_id: user.id,
  });
  // The database refuses a document above its byte cap before sending it
  // (migration 202610160002), so a very large account gets a clear 413
  // instead of an Edge Function that runs out of memory.
  if (/export_too_large/.test(String(result?.error?.message ?? ""))) {
    throw new AccountError("export_too_large", 413);
  }
  const stored = checked(result) as Record<string, unknown> | null;
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    throw new AccountError("account_service_unavailable", 503);
  }
  return {
    format: ACCOUNT_EXPORT_FORMAT,
    generatedAt: now.toISOString(),
    user: {
      id: user.id,
      email: user.email ?? null,
      emailConfirmedAt: user.email_confirmed_at ?? null,
      phone: user.phone || null,
      createdAt: user.created_at ?? null,
      lastSignInAt: user.last_sign_in_at ?? null,
      // Only what the person or the sign-in provider put there. Server-owned
      // app_metadata (roles, flags) is exported as-is because it is about them.
      userMetadata: user.user_metadata ?? {},
      appMetadata: user.app_metadata ?? {},
    },
    signInMethods: (user.identities || []).map((
      i: { identity_id?: string; provider: string; created_at?: string; last_sign_in_at?: string; identity_data?: { email?: string } },
    ) => ({
      id: i.identity_id ?? null,
      provider: i.provider,
      email: i.identity_data?.email ?? null,
      createdAt: i.created_at ?? null,
      lastSignInAt: i.last_sign_in_at ?? null,
    })),
    sessions: (sessions || []).map((s: any) => ({
      id: s.id,
      createdAt: s.created_at ?? null,
      lastSeenAt: s.updated_at ?? null,
      userAgent: s.user_agent || null,
      current: s.id === currentSessionId,
    })),
    stored,
  };
}
