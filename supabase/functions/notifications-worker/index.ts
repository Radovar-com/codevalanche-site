import { createNotificationChannel } from "../_shared/notificationChannel.ts";
import { createScopedWorkerService } from "../_shared/workerDatabase.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { assertMaintenance } from "../_shared/maintenanceAuth.ts";
import {
  deliverNotification,
  notificationStore,
} from "../_shared/notificationDelivery.ts";
import { AccountError, uuid } from "../_shared/accountContract.ts";
Deno.serve(async (req) => {
  try {
    assertMaintenance(req, Deno.env.get("ACCOUNT_NOTIFICATION_WORKER_TOKEN"));
    const service = createScopedWorkerService("notification", {
      env: (name: string) => Deno.env.get(name),
      createClient,
    });
    await service.ensure();
    if (req.method !== "POST") return new Response(null, { status: 405 });
    const body = await req.json();
    if (!uuid.test(body.id || "")) {
      throw new AccountError("invalid_fields", 400);
    }
    const channel = createNotificationChannel((name: string) =>
      Deno.env.get(name)
    );
    return Response.json(
      await deliverNotification(body.id, {
        store: notificationStore(service),
        channel,
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
