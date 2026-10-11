import {
  AccountError,
  checked,
  resultEnvelope,
  uuid,
} from "./accountContract.ts";
function binding(value: any) {
  if (
    !value || typeof value !== "object" || Array.isArray(value) ||
    Object.keys(value).sort().join(",") !==
      "generation,jobId,operationId,policyVersion,userId" ||
    !["operationId", "jobId", "userId"].every((k) =>
      uuid.test(value[k] || "")
    ) ||
    !["generation", "policyVersion"].every((k) =>
      Number.isSafeInteger(value[k]) && value[k] > 0
    )
  ) throw new AccountError("invalid_fields", 400);
  return value;
}
export function createRemoteErasureAuthorityHandler(
  { configuration, service, verifyJwt, now = () => Date.now() }: any,
) {
  return async (req: Request) => {
    let requestId = crypto.randomUUID();
    const respond = (data: any, status = 200) =>
      Response.json(resultEnvelope(data, requestId, status), {
        status,
        headers: { "Cache-Control": "no-store" },
      });
    try {
      if (req.method !== "POST") {
        return respond({ code: "invalid_fields" }, 405);
      }
      if (req.headers.get("origin") || req.headers.get("cookie")) {
        throw new AccountError("erasure_worker_required", 401);
      }
      if (
        !configuration?.issuer ||
        configuration.audience !== "codevalanche-remote-erasure" ||
        !configuration.subject || !configuration.verificationKey ||
        configuration.verificationKey.d || configuration.verificationKey.k ||
        configuration.verificationKey.kty !== "OKP" ||
        configuration.verificationKey.crv !== "Ed25519"
      ) throw new AccountError("worker_not_configured", 503);
      const token = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)
        ?.[1];
      if (!token || token.length > 8192) {
        throw new AccountError("erasure_worker_required", 401);
      }
      let verified: any;
      try {
        verified = await verifyJwt(token, configuration);
      } catch {
        throw new AccountError("erasure_worker_required", 401);
      }
      const claims = verified.payload ?? verified;
      if (
        claims.iss !== configuration.issuer ||
        claims.aud !== configuration.audience ||
        claims.sub !== configuration.subject ||
        claims.role !== "remote_erasure_worker" ||
        claims.scope !== "remote:erase" || typeof claims.jti !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(claims.jti) ||
        !Number.isFinite(claims.iat) || !Number.isFinite(claims.exp) ||
        claims.exp <= now() / 1000 || claims.exp <= claims.iat ||
        claims.exp - claims.iat > 60 || claims.iat > now() / 1000 + 1
      ) throw new AccountError("erasure_worker_required", 401);
      if (!req.headers.get("content-type")?.startsWith("application/json")) {
        throw new AccountError("invalid_fields", 400);
      }
      const reader = req.body?.getReader();
      let size = 0;
      const chunks: Uint8Array[] = [];
      const read = async () => {
        if (reader) {
          while (true) {
            const part = await reader.read();
            if (part.done) break;
            size += part.value.length;
            if (size > 4096) throw new AccountError("invalid_fields", 413);
            chunks.push(part.value);
          }
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.length;
        }
        return JSON.parse(new TextDecoder().decode(bytes));
      };
      let timer: any;
      let body: any;
      try {
        body = await Promise.race([
          read(),
          new Promise((_, reject) => {
            timer = setTimeout(() => {
              void reader?.cancel();
              reject(new AccountError("account_service_unavailable", 503));
            }, 5000);
          }),
        ]);
      } catch (error) {
        if (error instanceof AccountError) throw error;
        throw new AccountError("invalid_fields", 400);
      } finally {
        clearTimeout(timer);
      }
      if (
        !body ||
        Object.keys(body).sort().join(",") !==
          "action,apiVersion,request,requestId" ||
        body.apiVersion !== 2 || body.action !== "remote.erasure.authorize" ||
        typeof body.requestId !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(body.requestId)
      ) throw new AccountError("invalid_fields", 400);
      requestId = body.requestId;
      const request = binding(body.request);
      for (
        const key of [
          "operationId",
          "jobId",
          "userId",
          "generation",
          "policyVersion",
        ]
      ) {
        if (claims[key] !== request[key]) {
          throw new AccountError("erasure_binding_mismatch", 403);
        }
      }
      if (claims.exp <= now() / 1000) {
        throw new AccountError("erasure_worker_required", 401);
      }
      const rows = checked(
        await service.rpc("codevalanche_remote_erasure_authorize", {
          p_operation_id: request.operationId,
          p_job_id: request.jobId,
          p_user_id: request.userId,
          p_generation: request.generation,
          p_policy_version: request.policyVersion,
        }),
      ) as any[];
      const row = rows?.[0];
      if (!row?.allowed) throw new AccountError("erasure_not_authorized", 403);
      if (claims.exp <= now() / 1000) {
        throw new AccountError("erasure_worker_required", 401);
      }
      return respond({
        ...request,
        allowed: true,
        state: "purging",
        authDeleted: true,
        dueAt: row.due_at,
        authorizationId: row.authorization_id,
      });
    } catch (error) {
      return respond({
        code: error instanceof AccountError
          ? error.code
          : "account_service_unavailable",
      }, error instanceof AccountError ? error.status : 503);
    }
  };
}
