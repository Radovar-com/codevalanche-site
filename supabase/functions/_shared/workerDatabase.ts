import { AccountError } from "./accountContract.ts";
import { createBoundedServiceFetch } from "./serviceFetch.ts";
const capabilities: Record<
  string,
  { role: string; databaseToken: string; authKey?: string }
> = {
  operation: {
    role: "codevalanche_operation_worker",
    databaseToken: "ACCOUNT_OPERATIONS_DATABASE_TOKEN",
    authKey: "ACCOUNT_OPERATIONS_AUTH_ADMIN_KEY",
  },
  erasure: {
    role: "codevalanche_erasure_worker",
    databaseToken: "ACCOUNT_ERASURE_DATABASE_TOKEN",
    authKey: "ACCOUNT_ERASURE_AUTH_ADMIN_KEY",
  },
  notification: {
    role: "codevalanche_notification_worker",
    databaseToken: "ACCOUNT_NOTIFICATION_DATABASE_TOKEN",
  },
  security: {
    role: "codevalanche_security_import_worker",
    databaseToken: "ACCOUNT_SECURITY_DATABASE_TOKEN",
  },
  retention: {
    role: "codevalanche_retention_worker",
    databaseToken: "ACCOUNT_RETENTION_DATABASE_TOKEN",
  },
  dispatcher: {
    role: "codevalanche_dispatcher_reader",
    databaseToken: "ACCOUNT_DISPATCHER_DATABASE_TOKEN",
  },
  remoteErasureAuthority: {
    role: "codevalanche_remote_erasure_authority",
    databaseToken: "ACCOUNT_REMOTE_ERASURE_AUTHORITY_DATABASE_TOKEN",
  },
};
export function createScopedWorkerService(
  kind: string,
  { env, createClient, remainingMs, fetcher, remoteErase }: any,
) {
  const capability = capabilities[kind];
  if (!capability) throw new AccountError("worker_not_configured", 503);
  const url = env("SUPABASE_URL"),
    publishable = env("SUPABASE_PUBLISHABLE_KEY"),
    databaseToken = env(capability.databaseToken);
  if (!url || !publishable || !databaseToken) {
    throw new AccountError("worker_not_configured", 503);
  }
  // PostgREST verifies this distinct signed worker-role token. A role label is never authority.
  const boundedFetch = createBoundedServiceFetch({ remainingMs, fetcher });
  const database = createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${databaseToken}` },
      fetch: boundedFetch,
    },
  });
  let qualification: Promise<void> | null = null;
  const ensure = () =>
    qualification ??= (async () => {
      const result = await database.rpc("codevalanche_worker_capability");
      if (
        result.error || result.data !== capability.role
      ) throw new AccountError("worker_not_configured", 503);
    })().catch((error) => {
      qualification = null;
      throw error;
    });
  const service: any = {
    ensure,
    rpc: async (name: string, args: any = {}) => {
      await ensure();
      return database.rpc(name, args);
    },
    from: (table: string) => database.from(table),
  };
  if (kind === "erasure" && remoteErase) service.remoteErase = remoteErase;
  if (capability.authKey) {
    const key = env(capability.authKey);
    if (!key) throw new AccountError("worker_not_configured", 503);
    const authClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: boundedFetch },
    });
    service.auth = {
      admin: kind === "operation"
        ? {
          getUserById: authClient.auth.admin.getUserById.bind(
            authClient.auth.admin,
          ),
          updateUserById: authClient.auth.admin.updateUserById.bind(
            authClient.auth.admin,
          ),
        }
        : {
          getUserById: authClient.auth.admin.getUserById.bind(
            authClient.auth.admin,
          ),
          deleteUser: authClient.auth.admin.deleteUser.bind(
            authClient.auth.admin,
          ),
        },
    };
    if (kind === "erasure") service.storage = authClient.storage;
  }
  return service;
}
