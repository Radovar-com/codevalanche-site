import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { importJWK, jwtVerify } from "npm:jose@6.2.12";
import { createScopedWorkerService } from "../_shared/workerDatabase.ts";
import { createRemoteErasureAuthorityHandler } from "../_shared/remoteErasureAuthority.ts";
Deno.serve(async (req) => {
  try {
    const configuration = {
      issuer: Deno.env.get("ACCOUNT_REMOTE_ERASURE_WORKER_ISSUER"),
      audience: "codevalanche-remote-erasure",
      subject: Deno.env.get("ACCOUNT_REMOTE_ERASURE_WORKER_SUBJECT"),
      verificationKey: JSON.parse(
        Deno.env.get("ACCOUNT_REMOTE_ERASURE_WORKER_PUBLIC_JWK") || "null",
      ),
    };
    const service = createScopedWorkerService("remoteErasureAuthority", {
      env: (name: string) => Deno.env.get(name),
      createClient,
    });
    return await createRemoteErasureAuthorityHandler({
      configuration,
      service,
      verifyJwt: async (token: string, config: any) =>
        jwtVerify(token, await importJWK(config.verificationKey, "EdDSA"), {
          issuer: config.issuer,
          audience: config.audience,
          algorithms: ["EdDSA"],
          requiredClaims: ["exp", "iat", "sub", "jti"],
        }),
    })(req);
  } catch {
    return Response.json({
      apiVersion: 2,
      ok: false,
      requestId: crypto.randomUUID(),
      error: {
        code: "account_service_unavailable",
        message: "Erasure authority is unavailable",
      },
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
});
