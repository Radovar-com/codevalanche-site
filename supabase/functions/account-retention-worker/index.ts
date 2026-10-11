import { createScopedWorkerService } from "../_shared/workerDatabase.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { assertMaintenance } from "../_shared/maintenanceAuth.ts";
import { AccountError, checked } from "../_shared/accountContract.ts";
Deno.serve(async (req) => {
  try {
    assertMaintenance(req, Deno.env.get("ACCOUNT_RETENTION_WORKER_TOKEN"));
    const service = createScopedWorkerService("retention", {
      env: (name: string) => Deno.env.get(name),
      createClient,
    });
    await service.ensure();
    if (req.method !== "POST") return new Response(null, { status: 405 });
    if (Deno.env.get("ACCOUNT_RETENTION_EXECUTION_ENABLED") !== "true") {
      throw new AccountError("worker_not_configured", 503);
    }
    const security = checked(await service.rpc("codevalanche_retention_sweep"));
    const analytics = checked(
      await service.rpc("codevalanche_analytics_retention"),
    );
    return Response.json({ security, analytics }, {
      headers: { "Cache-Control": "no-store" },
    });
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
