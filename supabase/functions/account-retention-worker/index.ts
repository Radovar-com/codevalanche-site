import { createScopedWorkerService } from "../_shared/workerDatabase.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { assertMaintenance } from "../_shared/maintenanceAuth.ts";
import { AccountError } from "../_shared/accountContract.ts";
import { runAccountRetention } from "../_shared/accountRetention.ts";
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
    return Response.json(await runAccountRetention(service), {
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
