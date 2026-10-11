import { AccountError, resultEnvelope, uuid } from "./accountContract.ts";
const fields = [
  "consentGeneration",
  "nativeGeneration",
  "occurredAt",
  "outcome",
  "policyVersion",
  "projectId",
  "receiptId",
  "runId",
  "sessionId",
  "userId",
];
function validateReceipt(receipt: any, now: number) {
  if (
    !receipt || typeof receipt !== "object" || Array.isArray(receipt) ||
    Object.keys(receipt).sort().join(",") !== fields.join(",") ||
    !["receiptId", "userId", "sessionId"].every((k) =>
      uuid.test(receipt[k] || "")
    ) ||
    !["consentGeneration", "nativeGeneration", "policyVersion"].every((k) =>
      Number.isSafeInteger(receipt[k]) && receipt[k] > 0
    ) || !["runId", "projectId"].every((k) =>
      typeof receipt[k] === "string" &&
      /^[a-zA-Z0-9_-]{1,128}$/.test(receipt[k])
    ) || !["success", "failed", "cancelled"].includes(receipt.outcome) ||
    typeof receipt.occurredAt !== "string" ||
    !Number.isFinite(Date.parse(receipt.occurredAt)) ||
    new Date(receipt.occurredAt).toISOString() !== receipt.occurredAt ||
    Date.parse(receipt.occurredAt) > now + 300000 ||
    Date.parse(receipt.occurredAt) < now - 86400000
  ) throw new AccountError("invalid_fields", 400);
  return receipt;
}
async function readBody(req: Request) {
  const reader = req.body?.getReader(), chunks: Uint8Array[] = [];
  let size = 0, timer: any;
  const read = async () => {
    if (reader) {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.length;
        if (size > 4096) {
          void reader.cancel();
          throw new AccountError("invalid_fields", 413);
        }
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
  try {
    return await Promise.race([
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
}
export function createNativeLedgerHandler(
  { configuration, service, verifyJwt, now = Date.now }: any,
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
      if (req.headers.get("cookie") || req.headers.get("origin")) {
        throw new AccountError("native_worker_required", 401);
      }
      const key = configuration?.verificationKey;
      if (
        configuration?.qualified !== true ||
        typeof configuration.issuer !== "string" ||
        !configuration.issuer.startsWith("https://") ||
        configuration.audience !== "codevalanche-native-ledger" ||
        typeof configuration.subject !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(configuration.subject) || !key ||
        key.kty !== "OKP" || key.crv !== "Ed25519" ||
        typeof key.x !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(key.x) ||
        "d" in key || "k" in key
      ) throw new AccountError("worker_not_configured", 503);
      const token = req.headers.get("authorization")?.match(/^Bearer (\S+)$/i)
        ?.[1];
      if (!token || token.length > 8192) {
        throw new AccountError("native_worker_required", 401);
      }
      let claims: any;
      try {
        const verified = await verifyJwt(token, configuration);
        claims = verified.payload ?? verified;
      } catch {
        throw new AccountError("native_worker_required", 401);
      }
      if (
        claims.iss !== configuration.issuer ||
        claims.aud !== configuration.audience ||
        claims.sub !== configuration.subject ||
        claims.role !== "native_ledger_worker" ||
        claims.scope !== "analytics:native:ingest" ||
        typeof claims.jti !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(claims.jti) ||
        !Number.isSafeInteger(claims.iat) ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= now() / 1000 ||
        claims.exp <= claims.iat || claims.exp - claims.iat > 60 ||
        claims.iat > now() / 1000 + 1
      ) throw new AccountError("native_worker_required", 401);
      if (!req.headers.get("content-type")?.startsWith("application/json")) {
        throw new AccountError("invalid_fields", 400);
      }
      const body: any = await readBody(req);
      if (
        !body ||
        Object.keys(body).sort().join(",") !==
          "action,apiVersion,request,requestId" ||
        body.apiVersion !== 2 || body.action !== "analytics.native.ingest" ||
        typeof body.requestId !== "string" ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(body.requestId)
      ) throw new AccountError("invalid_fields", 400);
      requestId = body.requestId;
      const receipt = validateReceipt(body.request, now());
      if (fields.some((k) => claims[k] !== receipt[k])) {
        throw new AccountError("native_binding_mismatch", 403);
      }
      // Public x is 32 bytes; hash those bytes, matching the producer qualification contract.
      const raw = Uint8Array.from(
        atob(key.x.replace(/-/g, "+").replace(/_/g, "/") + "="),
        (c) => c.charCodeAt(0),
      );
      const keyFingerprint = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", raw)),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("");
      if (claims.exp <= now() / 1000) {
        throw new AccountError("native_worker_required", 401);
      }
      const result = await service.rpc("codevalanche_ingest_native_ledger", {
        p_receipt: receipt,
        p_issuer: configuration.issuer,
        p_subject: configuration.subject,
        p_key_fingerprint: keyFingerprint,
        p_expires_at: new Date(claims.exp * 1000).toISOString(),
      });
      if (result.error) {
        if (result.error.message === "native_receipt_conflict") {
          throw new AccountError("native_receipt_conflict", 409);
        }
        throw new AccountError("account_service_unavailable", 503);
      }
      const row = result.data?.[0];
      if (row?.accepted !== true) {
        throw new AccountError("native_receipt_refused", 403);
      }
      return respond({
        receiptId: receipt.receiptId,
        accepted: true,
        duplicate: row.duplicate === true,
        sourceQuality: "native_ledger",
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
