// Owner-only release announcement emails, plus the public one-click unsubscribe.
// Owner actions need RELEASE_EMAIL_OPERATOR_TOKEN; nothing is mailed to readers
// unless RELEASE_EMAIL_SENDING_ENABLED=true and the campaign was approved.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { createScopedWorkerService } from "../_shared/workerDatabase.ts";
import { assertMaintenance } from "../_shared/maintenanceAuth.ts";
import { AccountError } from "../_shared/accountContract.ts";
import {
  createResendMailer,
  releaseEmailSettings,
  runReleaseAction,
  unsubscribe,
} from "../_shared/releaseAnnouncements.ts";

const PAGE_ORIGINS = new Set([
  "https://codevalanche.com",
  "https://www.codevalanche.com",
]);
const env = (name: string) => Deno.env.get(name);

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return PAGE_ORIGINS.has(origin)
    ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "content-type",
      "Vary": "Origin",
    }
    : {};
}

Deno.serve(async (req) => {
  const headers = { "Cache-Control": "no-store", ...cors(req) };
  try {
    if (req.method === "OPTIONS") return new Response(null, { headers });
    if (req.method !== "POST") return new Response(null, { status: 405 });
    const service = createScopedWorkerService("releaseEmail", {
      env,
      createClient,
    });
    const settings = releaseEmailSettings(env);
    const token = new URL(req.url).searchParams.get("unsubscribe");
    if (token !== null) {
      // RFC 8058 one-click (mail app button) or the site's confirm page.
      return Response.json(await unsubscribe(token, { service, settings }), {
        headers,
      });
    }
    assertMaintenance(req, env("RELEASE_EMAIL_OPERATOR_TOKEN"));
    const body = await req.json();
    return Response.json(
      await runReleaseAction(body, {
        service,
        settings,
        mailer: createResendMailer(env),
      }),
      { headers },
    );
  } catch (error) {
    return Response.json({
      error: {
        code: error instanceof AccountError
          ? error.code
          : "account_service_unavailable",
      },
    }, { status: error instanceof AccountError ? error.status : 503, headers });
  }
});
