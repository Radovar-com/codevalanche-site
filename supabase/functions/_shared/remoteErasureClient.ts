import { AccountError, uuid } from "./accountContract.ts";
import { createBoundedServiceFetch } from "./serviceFetch.ts";
export function createRemoteErasureClient(
  {
    configuration,
    signToken,
    fetcher = fetch,
    remainingMs,
    now = () => Date.now(),
  }: any,
) {
  let endpoint: URL;
  try {
    endpoint = new URL(configuration?.endpoint);
  } catch {
    throw new AccountError("worker_not_configured", 503);
  }
  if (
    endpoint.protocol !== "https:" || endpoint.username || endpoint.password ||
    endpoint.search || endpoint.hash || !configuration.issuer ||
    !configuration.subject || !configuration.signingKey?.d ||
    configuration.signingKey.kty !== "OKP" ||
    configuration.signingKey.crv !== "Ed25519"
  ) throw new AccountError("worker_not_configured", 503);
  const fetchBounded = createBoundedServiceFetch({
    fetcher,
    remainingMs,
    timeoutMs: 8000,
    maxResponseBytes: 65536,
  });
  return async (binding: any) => {
    if (
      !["operationId", "jobId", "userId"].every((k) =>
        uuid.test(binding[k] || "")
      ) || !["generation", "policyVersion"].every((k) =>
        Number.isSafeInteger(binding[k]) && binding[k] > 0
      )
    ) throw new AccountError("invalid_fields", 400);
    const issued = Math.floor(now() / 1000),
      payload = {
        ...binding,
        iss: configuration.issuer,
        aud: "codevalanche-remote-erasure",
        sub: configuration.subject,
        role: "remote_erasure_worker",
        scope: "remote:erase",
        jti: crypto.randomUUID(),
        iat: issued,
        exp: issued + 60,
      };
    const token = await signToken(payload, configuration.signingKey);
    const response = await fetchBounded(endpoint.href, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(binding),
    });
    if (!response.ok) {
      throw new AccountError("account_service_unavailable", 503);
    }
    const receipt = await response.json();
    for (
      const key of [
        "operationId",
        "jobId",
        "userId",
        "generation",
        "policyVersion",
      ]
    ) {
      if (receipt?.[key] !== binding[key]) {
        throw new AccountError("remote_erasure_receipt_mismatch", 503);
      }
    }
    if (
      receipt.state !== "completed" || !uuid.test(receipt.receiptId || "") ||
      receipt.metadataPurged !== true || receipt.localFilesTouched !== false
    ) throw new AccountError("remote_erasure_pending", 503);
    return receipt;
  };
}
export function remoteErasureFromEnvironment(
  { env, signToken, fetcher, remainingMs }: any,
) {
  let signingKey: any;
  try {
    signingKey = JSON.parse(
      env("ACCOUNT_REMOTE_ERASURE_SIGNING_JWK") || "null",
    );
  } catch {
    throw new AccountError("worker_not_configured", 503);
  }
  return createRemoteErasureClient({
    configuration: {
      endpoint: env("ACCOUNT_REMOTE_ERASURE_SERVICE_URL"),
      issuer: env("ACCOUNT_REMOTE_ERASURE_WORKER_ISSUER"),
      subject: env("ACCOUNT_REMOTE_ERASURE_WORKER_SUBJECT"),
      signingKey,
    },
    signToken,
    fetcher,
    remainingMs,
  });
}
