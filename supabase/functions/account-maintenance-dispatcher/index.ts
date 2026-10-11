import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { assertMaintenance } from "../_shared/maintenanceAuth.ts";
import { dispatchMaintenance } from "../_shared/maintenanceDispatcher.ts";
import { createScopedWorkerService } from "../_shared/workerDatabase.ts";
import { AccountError } from "../_shared/accountContract.ts";
import { createNotificationChannel } from "../_shared/notificationChannel.ts";
import { createBoundedServiceFetch } from "../_shared/serviceFetch.ts";
Deno.serve(async (req) => {
  try {
    assertMaintenance(req, Deno.env.get("ACCOUNT_DISPATCHER_TOKEN"));
    if (req.method !== "POST") return new Response(null, { status: 405 });
    if (Deno.env.get("ACCOUNT_DISPATCHER_ENABLED") !== "true") {
      return Response.json({ state: "disabled", selected: 0, results: [] });
    }
    const deadline = performance.now() + 20000;
    const options = {
      env: (name: string) => Deno.env.get(name),
      createClient,
      remainingMs: () => deadline - performance.now(),
    };
    const reader = createScopedWorkerService("dispatcher", options);
    const result = await dispatchMaintenance({
      service: reader,
      workerService: async (queue: string) =>
        createScopedWorkerService(
          queue === "expiry" ? "operation" : queue,
          options,
        ),
      enabled: true,
      channel: createNotificationChannel(
        options.env,
        createBoundedServiceFetch({ remainingMs: options.remainingMs }),
      ),
      erasureEnabled:
        Deno.env.get("ACCOUNT_ERASURE_EXECUTION_ENABLED") === "true",
      limit: 10,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
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
