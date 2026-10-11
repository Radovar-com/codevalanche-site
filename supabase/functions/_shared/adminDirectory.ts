import { AccountError, checked, uuid } from "./accountContract.ts";
import { policyFromState } from "./accountPolicy.ts";
export async function readAdminDirectory(service: any, fields: any) {
  const limit = fields.limit ?? 50;
  if (
    !Number.isInteger(limit) || limit < 1 || limit > 100 ||
    typeof (fields.search ?? "") !== "string" ||
    (fields.search || "").length > 200 ||
    (fields.cursor && !uuid.test(fields.cursor))
  ) throw new AccountError("invalid_fields", 400);
  const rows = checked(
    await service.rpc("codevalanche_admin_directory", {
      p_search: fields.search || "",
      p_after: fields.cursor || null,
      p_limit: limit + 1,
    }),
  ) as any[];
  const page = rows.slice(0, limit).map(mapDirectoryUser);
  return {
    users: page,
    pagination: {
      nextCursor: rows.length > limit ? page.at(-1)?.user.id : null,
      hasMore: rows.length > limit,
      limit,
    },
    coverage: { source: "supabase_auth", total: null },
  };
}
export function mapDirectoryUser(row: any) {
  return {
    user: {
      id: row.id,
      email: row.email,
      displayName: row.display_name || "",
      bio: row.bio || "",
      emailVerified: !!row.email_confirmed_at,
      createdAt: row.created_at,
      lastSignInAt: row.last_sign_in_at,
      lastMeaningfulActivity: null,
    },
    policy: policyFromState(row),
    sessionSummary: { activeCount: Number(row.session_count || 0) },
    deletion: row.deletion_scheduled_for
      ? { scheduledFor: row.deletion_scheduled_for, status: "pending" }
      : null,
  };
}
export async function readAdminUserDetail(service: any, userId: string) {
  if (!uuid.test(userId || "")) throw new AccountError("invalid_fields", 400);
  const rows = checked(
    await service.rpc("codevalanche_admin_user_detail", { p_user_id: userId }),
  ) as any[];
  if (!rows?.length) throw new AccountError("not_found", 404);
  const data = mapDirectoryUser(rows[0]);
  const sessions = checked(
    await service.rpc("codevalanche_sessions", { p_user_id: userId }),
  );
  return { ...data, sessions };
}
