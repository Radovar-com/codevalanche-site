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
  await enrichActivity(service, page);
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
      ? { jobId:row.erasure_job_id??null,scheduledFor: row.deletion_scheduled_for, status: "pending" }
      : null,
  };
}
export async function readAdminUserDetail(service: any, userId: string) {
  if (typeof userId !== "string" || !uuid.test(userId)) throw new AccountError("invalid_fields", 400);
  const rows = checked(
    await service.rpc("codevalanche_admin_user_detail", { p_user_id: userId }),
  ) as any[];
  if (!rows?.length) throw new AccountError("not_found", 404);
  if (rows[0].id !== userId.toLowerCase()) throw new AccountError("account_service_unavailable", 503);
  const data = mapDirectoryUser(rows[0]);
  await enrichActivity(service, [data]);
  Object.assign(data.user, await readSignInMethods(service, data.user.id));
  const sessions = checked(
    await service.rpc("codevalanche_sessions", { p_user_id: userId }),
  );
  return { ...data, sessions };
}

function stamp(value: any) {
  if (typeof value !== "string" || value.length > 35 ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value) || !Number.isFinite(Date.parse(value))) return null;
  const canonical = new Date(value).toISOString();
  return canonical.slice(0,19) === value.slice(0,19) ? canonical : null;
}
async function enrichActivity(service: any, users: any[]) {
  if (!users.length) return;
  let rows: any[] = [];
  try {
    const result = await service.rpc("codevalanche_user_activity_latest", { p_user_ids: users.map(row => row.user.id) });
    if (!result.error && Array.isArray(result.data)) rows = result.data;
  } catch { /* Optional source remains explicitly unavailable. */ }
  for (const data of users) {
    const matches = rows.map(r => r?.activity).filter(r => r?.userId === data.user.id);
    const source = matches.length === 1 ? matches[0] : null;
    const valid = source && typeof source.consent === "boolean" &&
      (source.lastMeaningfulActivity === null || stamp(source.lastMeaningfulActivity)) &&
      (source.watermark === null || stamp(source.watermark));
    const activity = valid ? {
      userId: data.user.id, consent: source.consent,
      lastMeaningfulActivity: source.consent ? stamp(source.lastMeaningfulActivity) : null,
      watermark: source.consent ? stamp(source.watermark) : null,
      sourceQuality: { activity: source.consent ? "consented_observation" : "unavailable" },
      populationCoverage: { scope: "retained_consented_observations", nativeOutcomes: "acceptance_proven_owned_receipts", allNativeRunsCovered: false },
    } : { userId: data.user.id, consent: null, lastMeaningfulActivity: null, watermark: null,
      sourceQuality: { activity: "unavailable" }, populationCoverage: { scope: "unknown" } };
    Object.assign(data.user, { lastMeaningfulActivity: activity.lastMeaningfulActivity, activity });
  }
}
async function readSignInMethods(service: any, userId: string) {
  const unavailable = { signInMethods: null, signInMethodsCoverage: { source: "auth_admin", status: "unavailable" } };
  if (typeof service.auth?.admin?.getUserById !== "function") return unavailable;
  try {
    const result = await service.auth.admin.getUserById(userId), user = result.data?.user;
    if (result.error || user?.id !== userId || !Array.isArray(user.identities) || user.identities.length > 100) return unavailable;
    const methods = user.identities.map((identity: any) => {
      if (!identity || typeof identity.id !== "string" || identity.id.length > 128 || !identity.id ||
        typeof identity.provider !== "string" || !identity.provider || identity.provider.length > 64 ||
        identity.provider.trim() !== identity.provider || /[\u0000-\u001f\u007f]/.test(identity.provider) ||
        (identity.user_id !== undefined && identity.user_id !== userId) || !stamp(identity.created_at)) throw Error("invalid_identity");
      return { id: identity.id, provider: identity.provider, createdAt: stamp(identity.created_at) };
    });
    return { signInMethods: methods, signInMethodsCoverage: { source: "auth_admin", status: "available" } };
  } catch { return unavailable; }
}
