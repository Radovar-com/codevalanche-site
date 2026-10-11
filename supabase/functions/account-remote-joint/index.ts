import { createClient } from "npm:@supabase/supabase-js@2.116.0";
import { createRemoteJointPolicyHandler } from "../_shared/remoteJointPolicy.ts";

const url = Deno.env.get("SUPABASE_URL") || "";
const service = createClient(
  url,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "",
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
Deno.serve(createRemoteJointPolicyHandler({
  service,
  issuer: `${url.replace(/\/$/, "")}/auth/v1`,
  clientIds: (Deno.env.get("ACCOUNT_OAUTH_CLIENT_IDS") || "").split(",").filter(
    Boolean,
  ),
  enabled: Deno.env.get("ACCOUNT_REMOTE_JOINT_QUALIFIED") === "true",
}));
