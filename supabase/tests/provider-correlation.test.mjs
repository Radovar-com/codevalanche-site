import test from "node:test";
import assert from "node:assert/strict";
import { createSqlFixture } from "./sqlHarness.mjs";
import {
  reconcileOperation,
  requestAccountOperation,
} from "../functions/_shared/accountLifecycle.ts";
const actor = "11111111-1111-4111-8111-111111111111",
  userId = "22222222-2222-4222-8222-222222222222";
async function fixture(qualified = true) {
  const db = await createSqlFixture();
  await db.exec(
    "alter table auth.users add column raw_app_meta_data jsonb default '{}'::jsonb",
  );
  await db.exec(
    "grant usage on schema auth to supabase_auth_admin;grant select,update on auth.users to supabase_auth_admin",
  );
  await db.query("insert into auth.users(id) values($1),($2)", [actor, userId]);
  await db.query(
    "insert into public.codevalanche_admin_memberships(user_id,role) values($1,'owner')",
    [actor],
  );
  if (qualified) {
    await db.exec(
      "update public.codevalanche_auth_correlation_config set qualified=true",
    );
  }
  const service = {
    authCorrelationQualified: qualified,
    rpc: async (name, args = {}) => {
      try {
        const keys = Object.keys(args);
        return {
          data: (await db.query(
            `select * from public.${name}(${
              keys.map((k, i) => `${k}=>$${i + 1}`).join(",")
            })`,
            keys.map((k) => args[k]),
          )).rows,
          error: null,
        };
      } catch (error) {
        return { data: null, error };
      }
    },
    auth: { admin: { updateUserById: async () => ({ error: null }) } },
  };
  const fields = (action = "admin.account.suspend") => ({
    actorId: actor,
    userId,
    operationId: crypto.randomUUID(),
    action,
    reasonCode: "test",
    reason: "Synthetic Auth correlation",
    until: action === "admin.account.suspend"
      ? new Date(Date.now() + 600000).toISOString()
      : null,
  });
  const commitProvider = async (id, patch) => {
    await db.exec("set role supabase_auth_admin;begin");
    try {
      await db.query(
        "update auth.users set raw_app_meta_data=raw_app_meta_data||$1::jsonb where id=$2",
        [patch.app_metadata, id],
      );
      await db.query("update auth.users set banned_until=$1 where id=$2", [
        patch.ban_duration === "none"
          ? null
          : new Date(Date.now() + 600000).toISOString(),
        id,
      ]);
      await db.exec("commit");
    } catch (e) {
      await db.exec("rollback");
      throw e;
    } finally {
      await db.exec("reset role");
    }
    return { data: { user: { id } }, error: null };
  };
  return { db, service, fields, commitProvider };
}
test("empty Auth success response cannot confirm a legacy provider write", async () => {
  const f = await fixture(false);
  try {
    const op = await requestAccountOperation(f.fields(), f.service);
    assert.equal(
      (await reconcileOperation(op.operationId, f.service)).state,
      "pending",
    );
    const row = (await f.db.query(
      "select provider_state from public.codevalanche_operation_jobs",
    )).rows[0];
    assert.equal(row.provider_state, "unknown");
  } finally {
    await f.db.close();
  }
});
test("actual Auth transaction receipt survives a lost HTTP response and finishes without second mutation", async () => {
  const f = await fixture();
  try {
    const op = await requestAccountOperation(f.fields(), f.service);
    let writes = 0;
    f.service.auth.admin.updateUserById = async (...args) => {
      writes++;
      await f.commitProvider(...args);
      throw Error("synthetic response lost after commit");
    };
    const r = await reconcileOperation(op.operationId, f.service);
    assert.equal(r.state, "completed");
    await reconcileOperation(op.operationId, f.service);
    assert.equal(writes, 1);
    const a = (await f.db.query(
      "select * from public.codevalanche_auth_operation_attempts",
    )).rows[0];
    assert.equal(a.state, "committed");
    assert.equal(a.user_id, userId);
    assert.equal(
      (await f.db.query(
        "select raw_app_meta_data from auth.users where id=$1",
        [userId],
      )).rows[0].raw_app_meta_data.codevalanche_operation_v1,
      undefined,
    );
  } finally {
    await f.db.close();
  }
});
test("crash before request is fenced in SQL before a fresh attempt; old request later cannot mutate Auth", async () => {
  const f = await fixture();
  try {
    const op = await requestAccountOperation(f.fields(), f.service),
      lease = crypto.randomUUID();
    await f.db.query(
      "select * from public.codevalanche_claim_operation($1,$2)",
      [op.operationId, lease],
    );
    const old = (await f.db.query(
      "select * from public.codevalanche_prepare_correlated_operation($1,$2)",
      [op.operationId, lease],
    )).rows[0];
    await f.db.exec(
      "update public.codevalanche_operation_jobs set lease_until=now()-interval '1 second'",
    );
    f.service.auth.admin.updateUserById = f.commitProvider;
    assert.equal(
      (await reconcileOperation(op.operationId, f.service)).state,
      "completed",
    );
    await assert.rejects(
      () =>
        f.commitProvider(userId, {
          app_metadata: { codevalanche_operation_v1: old.binding },
          ban_duration: "none",
        }),
      /operation_conflict/,
    );
    assert.deepEqual(
      (await f.db.query(
        "select state from public.codevalanche_auth_operation_attempts order by created_at",
      )).rows.map((x) => x.state),
      ["fenced", "committed"],
    );
  } finally {
    await f.db.close();
  }
});
test("timeout followed by a new worker fences the held request before retry, and late old callback cannot confirm replacement", async () => {
  const f = await fixture();
  try {
    const op = await requestAccountOperation(f.fields(), f.service);
    let saved, writes = 0;
    f.service.auth.admin.updateUserById = async (id, patch) => {
      saved = patch;
      writes++;
      throw Error("synthetic timeout before Auth transaction");
    };
    assert.equal(
      (await reconcileOperation(op.operationId, f.service)).state,
      "pending",
    );
    f.service.auth.admin.updateUserById = async (...args) => {
      writes++;
      return f.commitProvider(...args);
    };
    assert.equal(
      (await reconcileOperation(op.operationId, f.service)).state,
      "completed",
    );
    await assert.rejects(
      () => f.commitProvider(userId, saved),
      /operation_conflict/,
    );
    assert.equal(writes, 2);
  } finally {
    await f.db.close();
  }
});
test("policy changed before Auth commit rejects the marked request and cannot unban after cancel/deletion", async () => {
  const f = await fixture();
  try {
    await f.db.query(
      "insert into public.codevalanche_account_state(user_id,status,blocked) values($1,'suspended',true)",
      [userId],
    );
    const op = await requestAccountOperation(
      f.fields("admin.account.reactivate"),
      f.service,
    );
    f.service.auth.admin.updateUserById = async (id, patch) => {
      await f.db.exec(
        "update public.codevalanche_account_state set status='deletion_pending',policy_version=policy_version+1",
      );
      return f.commitProvider(id, patch);
    };
    assert.notEqual(
      (await reconcileOperation(op.operationId, f.service)).state,
      "completed",
    );
    assert.equal(
      (await f.db.query(
        "select status,blocked from public.codevalanche_account_state where user_id=$1",
        [userId],
      )).rows[0].status,
      "deletion_pending",
    );
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_auth_operation_attempts where state='committed'",
      )).rows[0].count,
      0,
    );
  } finally {
    await f.db.close();
  }
});
test("missing qualification or disabled receipt trigger cannot dispatch or fence an uncertain request", async () => {
  const f = await fixture();
  try {
    const op = await requestAccountOperation(f.fields(), f.service);
    await f.db.exec(
      "alter table auth.users disable trigger codevalanche_auth_operation_commit",
    );
    let writes = 0;
    f.service.auth.admin.updateUserById = async () => {
      writes++;
      return { error: null };
    };
    await assert.rejects(
      () => reconcileOperation(op.operationId, f.service),
      /worker_not_configured|account_service_unavailable/,
    );
    assert.equal(writes, 0);
  } finally {
    await f.db.close();
  }
});
test("actual Supabase SDK HTTP timeout + competing worker fence prevents old ban arriving after successful unban", async () => {
  const { createServer } = await import("node:http"),
    { once } = await import("node:events"),
    { createClient } = await import("@supabase/supabase-js"),
    { createBoundedServiceFetch } = await import(
      "../functions/_shared/serviceFetch.ts"
    );
  const f = await fixture();
  let release, started, lateDone;
  const startedPromise = new Promise((r) => started = r),
    released = new Promise((r) => release = r),
    late = new Promise((r) => lateDone = r);
  let requests = 0, applied = 0, refused = 0;
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.method, "PUT");
      assert.equal(req.url, `/auth/v1/admin/users/${userId}`);
      let text = "";
      for await (const chunk of req) text += chunk;
      const patch = JSON.parse(text), ordinal = ++requests;
      if (ordinal === 1) {
        started();
        await released;
      }
      try {
        await f.commitProvider(userId, patch);
        applied++;
        const user = (await f.db.query(
          "select id,banned_until,raw_app_meta_data from auth.users where id=$1",
          [userId],
        )).rows[0];
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(user));
      } catch (error) {
        refused++;
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            message: "Synthetic Auth transaction refused",
            code: "unexpected_failure",
          }),
        );
      }
      if (ordinal === 1) lateDone();
    } catch (error) {
      res.writeHead(500);
      res.end("{}");
      lateDone();
    }
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const url = `http://127.0.0.1:${server.address().port}`,
      client = createClient(url, "synthetic-app-owned-test-key", {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: createBoundedServiceFetch({ timeoutMs: 120 }) },
      });
    f.service.auth = {
      admin: {
        updateUserById: client.auth.admin.updateUserById.bind(
          client.auth.admin,
        ),
      },
    };
    const fields = f.fields(),
      op = await requestAccountOperation(fields, f.service),
      first = reconcileOperation(op.operationId, f.service);
    await startedPromise;
    assert.equal((await first).state, "pending");
    assert.equal(applied, 0);
    assert.equal(
      (await reconcileOperation(op.operationId, f.service)).state,
      "completed",
    );
    assert.equal(applied, 1);
    const unban = await requestAccountOperation(
      f.fields("admin.account.reactivate"),
      f.service,
    );
    assert.equal(
      (await reconcileOperation(unban.operationId, f.service)).state,
      "completed",
    );
    release();
    await late;
    assert.equal(requests, 3);
    assert.equal(applied, 2);
    assert.equal(refused, 1);
    assert.equal(
      (await f.db.query("select banned_until from auth.users where id=$1", [
        userId,
      ])).rows[0].banned_until,
      null,
    );
    assert.equal(
      (await f.db.query(
        "select status from public.codevalanche_account_state where user_id=$1",
        [userId],
      )).rows[0].status,
      "active",
    );
  } finally {
    release();
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
    await f.db.close();
  }
});
test("receipt claims cannot be forged by worker boolean or customer RPC, and tampered marker aborts Auth transaction", async () => {
  const f = await fixture();
  try {
    const op = await requestAccountOperation(f.fields(), f.service),
      lease = crypto.randomUUID();
    await f.db.query(
      "select * from public.codevalanche_claim_operation($1,$2)",
      [op.operationId, lease],
    );
    const p = (await f.db.query(
      "select * from public.codevalanche_prepare_correlated_operation($1,$2)",
      [op.operationId, lease],
    )).rows[0];
    await assert.rejects(
      () =>
        f.db.query(
          "select * from public.codevalanche_record_operation_provider($1,$2,true,false)",
          [op.operationId, lease],
        ),
      /operation_conflict/,
    );
    await assert.rejects(
      () =>
        f.commitProvider(userId, {
          app_metadata: {
            codevalanche_operation_v1: { ...p.binding, userId: actor },
          },
          ban_duration: "none",
        }),
      /operation_conflict/,
    );
    await f.db.exec("set role authenticated");
    await assert.rejects(
      () =>
        f.db.query(
          "select * from public.codevalanche_prepare_correlated_operation($1,$2)",
          [op.operationId, lease],
        ),
      /permission denied/,
    );
    await assert.rejects(
      () =>
        f.db.query("select * from public.codevalanche_auth_operation_attempts"),
      /permission denied/,
    );
    await f.db.exec("reset role");
    assert.equal(
      (await f.db.query(
        "select state from public.codevalanche_auth_operation_attempts",
      )).rows[0].state,
      "prepared",
    );
  } finally {
    await f.db.close();
  }
});

test("held old worker continuation cannot record or settle the replacement claim after fencing", async () => {
  const f = await fixture();
  let release;
  const held = new Promise((r) => release = r),
    started = new Promise((r) => {
      f.service.auth.admin.updateUserById = async (id, patch) => {
        r();
        await held;
        return f.commitProvider(id, patch);
      };
    });
  try {
    const op = await requestAccountOperation(f.fields(), f.service),
      old = reconcileOperation(op.operationId, f.service);
    await started;
    await f.db.exec(
      "update public.codevalanche_operation_jobs set lease_until=now()-interval '1 second'",
    );
    f.service.auth.admin.updateUserById = f.commitProvider;
    assert.equal(
      (await reconcileOperation(op.operationId, f.service)).state,
      "completed",
    );
    release();
    const result = await old;
    assert.equal(result.errorCode, "provider_attempt_superseded");
    assert.equal(
      (await f.db.query(
        "select state,provider_state from public.codevalanche_operation_jobs",
      )).rows[0].state,
      "completed",
    );
  } finally {
    release();
    await f.db.close();
  }
});
test("final SQL settlement refuses forged success without receipt and actor withdrawal after committed Auth await", async () => {
  const f = await fixture();
  try {
    const op = await requestAccountOperation(f.fields(), f.service),
      lease = crypto.randomUUID();
    await f.db.query(
      "select * from public.codevalanche_claim_operation($1,$2)",
      [op.operationId, lease],
    );
    await f.db.query(
      "select * from public.codevalanche_prepare_correlated_operation($1,$2)",
      [op.operationId, lease],
    );
    assert.equal(
      (await f.db.query(
        "select * from public.codevalanche_settle_operation($1,$2,true)",
        [op.operationId, lease],
      )).rows[0].state,
      "pending",
    );
    f.service.auth.admin.updateUserById = async (...args) => {
      const result = await f.commitProvider(...args);
      await f.db.query(
        "update public.codevalanche_admin_memberships set active=false where user_id=$1",
        [actor],
      );
      return result;
    };
    assert.equal(
      (await reconcileOperation(op.operationId, f.service)).state,
      "failed",
    );
    assert.equal(
      (await f.db.query(
        "select status from public.codevalanche_account_state where user_id=$1",
        [userId],
      )).rows[0].status,
      "suspended",
    );
  } finally {
    await f.db.close();
  }
});
test("old unmarked indeterminate request cannot be upgraded or inferred from current user state when qualification turns on", async () => {
  const f = await fixture(false);
  try {
    const op = await requestAccountOperation(f.fields(), f.service);
    assert.equal(
      (await reconcileOperation(op.operationId, f.service)).state,
      "pending",
    );
    await f.db.exec(
      "update public.codevalanche_auth_correlation_config set qualified=true",
    );
    f.service.authCorrelationQualified = true;
    let writes = 0;
    f.service.auth.admin.updateUserById = async () => {
      writes++;
      return {
        data: { user: { id: userId, banned_until: null } },
        error: null,
      };
    };
    const result = await reconcileOperation(op.operationId, f.service);
    assert.equal(result.errorCode, "provider_result_unknown");
    assert.equal(writes, 0);
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_auth_operation_attempts",
      )).rows[0].count,
      0,
    );
  } finally {
    await f.db.close();
  }
});

test("canonical deadline tampering cannot extend the marked ban, and Auth transaction rollback never leaves a commit receipt", async () => {
  const f = await fixture();
  try {
    const op = await requestAccountOperation(f.fields(), f.service),
      lease = crypto.randomUUID();
    await f.db.query(
      "select * from public.codevalanche_claim_operation($1,$2)",
      [op.operationId, lease],
    );
    const p = (await f.db.query(
      "select * from public.codevalanche_prepare_correlated_operation($1,$2)",
      [op.operationId, lease],
    )).rows[0];
    await f.db.exec(
      "update public.codevalanche_account_state set suspended_until=now()-interval '1 second' where user_id='22222222-2222-4222-8222-222222222222'",
    );
    await assert.rejects(
      () =>
        f.commitProvider(userId, {
          app_metadata: { codevalanche_operation_v1: p.binding },
          ban_duration: "600s",
        }),
      /operation_conflict/,
    );
    assert.equal(
      (await f.db.query(
        "select state from public.codevalanche_auth_operation_attempts",
      )).rows[0].state,
      "prepared",
    );
    assert.equal(
      (await f.db.query("select banned_until from auth.users where id=$1", [
        userId,
      ])).rows[0].banned_until,
      null,
    );
  } finally {
    await f.db.close();
  }
});
test("foreign user and incompatible ban response stay indeterminate in the legacy HTTP path", async () => {
  for (
    const response of [{
      id: actor,
      banned_until: new Date(Date.now() + 600000).toISOString(),
    }, { id: userId, banned_until: null }]
  ) {
    const f = await fixture(false);
    try {
      const op = await requestAccountOperation(f.fields(), f.service);
      f.service.auth.admin.updateUserById = async () => ({
        data: { user: response },
        error: null,
      });
      assert.equal(
        (await reconcileOperation(op.operationId, f.service)).state,
        "pending",
      );
      assert.equal(
        (await f.db.query(
          "select provider_state from public.codevalanche_operation_jobs",
        )).rows[0].provider_state,
        "unknown",
      );
    } finally {
      await f.db.close();
    }
  }
});
test("unban accepts provider omitted nullable banned_until only with the exact returned target user", async () => {
  const f = await fixture(false);
  try {
    await f.db.query(
      "insert into public.codevalanche_account_state(user_id,status,blocked) values($1,'suspended',true)",
      [userId],
    );
    const op = await requestAccountOperation(
      f.fields("admin.account.reactivate"),
      f.service,
    );
    f.service.auth.admin.updateUserById = async () => ({
      data: { user: { id: userId } },
      error: null,
    });
    assert.equal(
      (await reconcileOperation(op.operationId, f.service)).state,
      "completed",
    );
  } finally {
    await f.db.close();
  }
});

test("qualified timed intent that expires after timeout can finish only after old attempt is fenced, without another ban", async () => {
  const f = await fixture();
  try {
    const fields = {
        ...f.fields(),
        until: new Date(Date.now() + 400).toISOString(),
      },
      op = await requestAccountOperation(fields, f.service);
    let writes = 0, saved;
    f.service.auth.admin.updateUserById = async (id, patch) => {
      writes++;
      saved = patch;
      throw Error("synthetic transport unknown");
    };
    f.service.auth.admin.getUserById = async () => ({
      data: { user: { id: userId, banned_until: null } },
      error: null,
    });
    assert.equal(
      (await reconcileOperation(op.operationId, f.service)).state,
      "pending",
    );
    await new Promise((r) => setTimeout(r, 500));
    assert.equal(
      (await reconcileOperation(op.operationId, f.service)).state,
      "completed",
    );
    assert.equal(writes, 1);
    assert.equal(
      (await f.db.query(
        "select state from public.codevalanche_auth_operation_attempts",
      )).rows[0].state,
      "fenced",
    );
    await assert.rejects(
      () => f.commitProvider(userId, saved),
      /operation_conflict/,
    );
    assert.equal(
      (await f.db.query(
        "select status from public.codevalanche_account_state where user_id=$1",
        [userId],
      )).rows[0].status,
      "active",
    );
  } finally {
    await f.db.close();
  }
});

test("deadline passing between SQL preparation and Auth dispatch never emits 0s/none, in legacy or correlated mode", async () => {
  for (const qualified of [false, true]) {
    const f = await fixture(qualified);
    try {
      const fields = {
          ...f.fields(),
          until: new Date(Date.now() + 300).toISOString(),
        },
        op = await requestAccountOperation(fields, f.service),
        rpc = f.service.rpc;
      let writes = 0;
      f.service.rpc = async (name, args) => {
        const r = await rpc(name, args);
        if (
          name === "codevalanche_prepare_operation_provider" ||
          name === "codevalanche_prepare_correlated_operation"
        ) await new Promise((r) => setTimeout(r, 400));
        return r;
      };
      f.service.auth.admin.updateUserById = async () => {
        writes++;
        throw Error("must not dispatch expired intent");
      };
      f.service.auth.admin.getUserById = async () => ({
        data: { user: { id: userId, banned_until: null } },
        error: null,
      });
      assert.equal(
        (await reconcileOperation(op.operationId, f.service)).state,
        "completed",
      );
      assert.equal(writes, 0);
      assert.equal(
        (await f.db.query(
          "select provider_state from public.codevalanche_operation_jobs",
        )).rows[0].provider_state,
        "not_needed",
      );
    } finally {
      await f.db.close();
    }
  }
});
