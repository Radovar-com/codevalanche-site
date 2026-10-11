import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { importJWK, jwtVerify } from "npm:jose@6.2.12";
import { createScopedWorkerService } from "../_shared/workerDatabase.ts";
import { createNativeLedgerHandler } from "../_shared/nativeLedger.ts";
Deno.serve(async (req) => {
  try {
    const configuration = {
      qualified: Deno.env.get("ACCOUNT_NATIVE_LEDGER_QUALIFIED") === "true",
      issuer: Deno.env.get("ACCOUNT_NATIVE_LEDGER_WORKER_ISSUER"),
      audience: "codevalanche-native-ledger",
      subject: Deno.env.get("ACCOUNT_NATIVE_LEDGER_WORKER_SUBJECT"),
      verificationKey: JSON.parse(
        Deno.env.get("ACCOUNT_NATIVE_LEDGER_WORKER_PUBLIC_JWK") || "null",
      ),
    };
    const service = createScopedWorkerService("nativeLedger", {
      env: (name: string) => Deno.env.get(name),
      createClient,
    });
    return await createNativeLedgerHandler({
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
        code: "worker_not_configured",
        message: "Native receipt ingestion is unavailable",
      },
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
});
