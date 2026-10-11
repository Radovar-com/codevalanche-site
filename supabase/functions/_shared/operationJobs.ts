import { AccountError } from "./accountContract.ts";
export async function operationRpc(service: any, name: string, args: any) {
  const result = await service.rpc(name, args);
  if (result.error) {
    const code = [
      "invalid_fields",
      "account_forbidden",
      "administrator_required",
      "last_owner_protected",
      "operation_conflict",
      "account_deletion_pending",
      "not_found",
    ].find((c) => String(result.error.message || "").includes(c));
    throw new AccountError(
      code || "account_service_unavailable",
      code === "invalid_fields"
        ? 400
        : code === "not_found"
        ? 404
        : ["operation_conflict", "last_owner_protected"].includes(code || "")
        ? 409
        : code
        ? 403
        : 503,
    );
  }
  return result.data?.[0] ?? null;
}
