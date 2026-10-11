import { createScopedWorkerService } from "../_shared/workerDatabase.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { assertMaintenance } from "../_shared/maintenanceAuth.ts";
import { importSecurityEvents } from "../_shared/securityEvent.ts";
import { AccountError, checked } from "../_shared/accountContract.ts";
Deno.serve(async (req) => {
  try {
    assertMaintenance(req, Deno.env.get("ACCOUNT_SECURITY_IMPORT_TOKEN"));
    const service = createScopedWorkerService("security", {
      env: (name: string) => Deno.env.get(name),
      createClient,
    });
    await service.ensure();
    if (req.method !== "POST") return new Response(null, { status: 405 });
    const state = checked(
      await service.from("codevalanche_provider_event_cursor").select("cursor")
        .eq("source", "provider_audit").maybeSingle(),
    ) as { cursor: string | null } | null;
    let cursor = { createdAt: null, id: null };
    if (state?.cursor) cursor = JSON.parse(state.cursor);
    const rows = checked(
      await service.rpc("codevalanche_read_provider_audit", {
        p_after: cursor.createdAt,
        p_after_id: cursor.id,
        p_limit: 100,
      }),
    ) as any[];
    if (!rows.length) {
      return Response.json({
        imported: 0,
        coverage: "source_empty_or_unavailable",
      }, { headers: { "Cache-Control": "no-store" } });
    }
    const last = rows.at(-1);
    const imported = await importSecurityEvents(
      service,
      rows,
      JSON.stringify({ createdAt: last.created_at, id: last.id }),
    );
    return Response.json({ imported, coverage: "provider_audit_partial" }, {
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
