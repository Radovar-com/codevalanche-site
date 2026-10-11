import { createScopedWorkerService } from "../_shared/workerDatabase.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { assertMaintenance } from "../_shared/maintenanceAuth.ts";
import { processErasure } from "../_shared/erasureJob.ts";
import { AccountError } from "../_shared/accountContract.ts";
import { remoteErasureFromEnvironment } from "../_shared/remoteErasureClient.ts";
import { importJWK, SignJWT } from "npm:jose@6.2.12";
Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response(null, { status: 405 });
    assertMaintenance(req, Deno.env.get("ACCOUNT_ERASURE_WORKER_TOKEN"));
    const service = createScopedWorkerService("erasure", {
      env: (name: string) => Deno.env.get(name),
      createClient,
    });
    await service.ensure();
    const body = await req.json();
    if (
      body.execute === true &&
      Deno.env.get("ACCOUNT_ERASURE_EXECUTION_ENABLED") !== "true"
    ) throw new AccountError("worker_not_configured", 503);
    if (body.execute === true) {
      service.remoteErase = remoteErasureFromEnvironment({
        env: (name: string) => Deno.env.get(name),
        signToken: async (payload: any, key: any) =>
          new SignJWT(payload).setProtectedHeader({ alg: "EdDSA" }).sign(
            await importJWK(key, "EdDSA"),
          ),
      });
    }
    return Response.json(
      await processErasure(body.jobId, {
        execute: body.execute === true,
        service,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return Response.json({
      error: {
        code: error instanceof AccountError
          ? error.code
          : "account_service_unavailable",
      },
    }, { status: error instanceof AccountError ? error.status : 503 });
  }
});
