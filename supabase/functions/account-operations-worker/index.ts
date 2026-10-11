import { createScopedWorkerService } from "../_shared/workerDatabase.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { assertMaintenance } from "../_shared/maintenanceAuth.ts";
import { reconcileOperation } from "../_shared/accountLifecycle.ts";
import { AccountError } from "../_shared/accountContract.ts";
import { reconcileSuspensionExpiry } from "../_shared/suspensionExpiry.ts";
Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response(null, { status: 405 });
    assertMaintenance(req, Deno.env.get("ACCOUNT_OPERATIONS_WORKER_TOKEN"));
    const service = createScopedWorkerService("operation", {
      env: (name: string) => Deno.env.get(name),
      createClient,
    });
    await service.ensure();
    if (Number(req.headers.get("content-length") || 0) > 1024) {
      return new Response(null, { status: 413 });
    }
    const body = await req.json();
    const result = body.task === "expire-suspension"
      ? await reconcileSuspensionExpiry(body.userId, service)
      : await reconcileOperation(body.operationId, service);
    return Response.json(result, {
      status: result.state === "completed" ? 200 : 202,
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
