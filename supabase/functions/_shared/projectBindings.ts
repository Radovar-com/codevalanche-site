import { AccountError } from "./accountContract.ts";
const opaque = /^[a-zA-Z0-9_-]{1,128}$/, projectId = /^prj_[a-f0-9]{32}$/;
export async function projectBinding(
  operation: string,
  body: any,
  { principal, policy, service }: any,
) {
  if (
    !["project.binding.register", "project.binding.get"].includes(operation)
  ) return null;
  const fields = Object.keys(body).filter((k) =>
    !["action", "apiVersion", "requestId"].includes(k)
  ).sort();
  if (
    operation === "project.binding.register"
      ? (fields.join(",") !== "localAlias" ||
        typeof body.localAlias !== "string" || !opaque.test(body.localAlias))
      : (fields.length !== 1 ||
        !(fields[0] === "projectId"
          ? typeof body.projectId === "string" && projectId.test(body.projectId)
          : fields[0] === "localAlias" && typeof body.localAlias === "string" &&
            opaque.test(body.localAlias)))
  ) throw new AccountError("invalid_fields", 400);
  const result = await service.rpc(
    operation === "project.binding.register"
      ? "codevalanche_project_register"
      : "codevalanche_project_lookup",
    {
      p_user_id: principal.userId,
      p_session_id: principal.sessionId,
      p_policy_version: policy.policyVersion,
      ...(operation === "project.binding.register"
        ? { p_local_alias: body.localAlias }
        : {
          p_project_id: body.projectId ?? null,
          p_local_alias: body.localAlias ?? null,
        }),
    },
  );
  if (result.error) {
    const message = String(result.error.message || "");
    const code = [
      "invalid_fields",
      "session_revoked",
      "account_suspended",
      "account_forbidden",
      "recovery_restricted",
      "project_binding_policy_changed",
    ].find((c) => message.includes(c));
    throw new AccountError(
      code ?? "account_service_unavailable",
      code === "invalid_fields"
        ? 400
        : code === "session_revoked"
        ? 401
        : code
        ? 403
        : 503,
    );
  }
  const row = result.data?.[0];
  if (!row) throw new AccountError("not_found", 404);
  if (
    row.owner_user_id !== principal.userId || !projectId.test(row.project_id) ||
    !opaque.test(row.local_alias) || row.binding_version !== 1 ||
    (body.localAlias !== undefined && row.local_alias !== body.localAlias) ||
    (body.projectId !== undefined && row.project_id !== body.projectId)
  ) throw new AccountError("account_service_unavailable", 503);
  return {
    projectId: row.project_id,
    ownerUserId: principal.userId,
    localAlias: row.local_alias,
    bindingVersion: 1,
    createdAt: row.created_at,
    ownership: "account_metadata",
    physicalRootVerified: false,
    nativeExecutionVerified: false,
    producerQualified: false,
  };
}
