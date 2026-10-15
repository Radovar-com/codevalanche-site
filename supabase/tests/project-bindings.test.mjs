import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { createSqlFixture } from "./sqlHarness.mjs";
import { issuer, loadHandler } from "./handlerHarness.mjs";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  sa = "33333333-3333-4333-8333-333333333333",
  sb = "44444444-4444-4444-8444-444444444444";
async function fixture() {
  const db = await createSqlFixture(), key = randomBytes(32);
  await db.query(
    "insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now())",
    [a, b],
  );
  await db.query(
    "insert into auth.sessions(id,user_id) values($1,$2),($3,$4)",
    [sa, a, sb, b],
  );
  await db.query(
    "insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,'password'),($2,'password')",
    [sa, sb],
  );
  const f = { db, before: null };
  const service = {
    auth: {
      getUser: async (token) => {
        try {
          const { payload } = await jwtVerify(token, key, {
            issuer,
            audience: "authenticated",
            algorithms: ["HS256"],
          });
          const user = (await db.query("select * from auth.users where id=$1", [
            payload.sub,
          ])).rows[0];
          return {
            data: {
              user: user
                ? { ...user, user_metadata: {}, identities: [] }
                : null,
            },
            error: null,
          };
        } catch {
          return { data: { user: null }, error: { status: 401 } };
        }
      },
    },
    rpc: async (name, args = {}) => {
      try {
        if (name.startsWith("codevalanche_project_") && f.before) {
          await f.before(name, args);
        }
        const keys = Object.keys(args);
        const rows = (await db.query(
          `select * from public.${name}(${
            keys.map((k, i) => `${k}=>$${i + 1}`).join(",")
          })`,
          keys.map((k) => args[k]),
        )).rows;
        return {
          data: name === "codevalanche_rate_limit"
            ? rows[0].codevalanche_rate_limit
            : rows,
          error: null,
        };
      } catch (error) {
        return { data: null, error };
      }
    },
    from: (table) => ({
      select() {
        return this;
      },
      eq(_k, id) {
        this.id = id;
        return this;
      },
      maybeSingle: async function () {
        return {
          data:
            (await db.query(`select * from public.${table} where user_id=$1`, [
              this.id,
            ])).rows[0] ?? null,
          error: null,
        };
      },
    }),
  };
  f.service = service;
  f.handler = await loadHandler(service);
  f.token = async (user = a, patch = {}) =>
    new SignJWT({
      sub: user,
      session_id: user === a ? sa : sb,
      role: "authenticated",
      aal: "aal1",
      amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }],
      ...patch,
    }).setProtectedHeader({ alg: "HS256" }).setIssuer(issuer).setAudience(
      "authenticated",
    ).setIssuedAt().setExpirationTime("1h").sign(key);
  f.call = async (action, body = {}, token) => {
    const bearer = token ?? await f.token();
    return f.handler(
      new Request("https://example.test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + bearer,
        },
        body: JSON.stringify({
          apiVersion: 2,
          action,
          requestId: "project-test",
          ...body,
        }),
      }),
    );
  };
  f.register = async (alias = "cws_local", token) => {
    const r = await f.call(
      "project.binding.register",
      { localAlias: alias },
      token,
    );
    assert.equal(r.status, 200);
    return (await r.json()).data;
  };
  return f;
}
test("authenticated own project registration is server-assigned stable peractor alias and persists after handler restart", async () => {
  const f = await fixture();
  try {
    const first = await f.register();
    assert.match(first.projectId, /^prj_[a-f0-9]{32}$/);
    assert.equal(first.ownerUserId, a);
    assert.equal(first.ownership, "account_metadata");
    assert.equal(first.physicalRootVerified, false);
    assert.equal(first.nativeExecutionVerified, false);
    assert.equal(first.producerQualified, false);
    assert.equal((await f.register()).projectId, first.projectId);
    f.handler = await loadHandler(f.service);
    const byId = await f.call("project.binding.get", {
      projectId: first.projectId,
    });
    assert.equal((await byId.json()).data.projectId, first.projectId);
    assert.equal(
      (await f.register("cws_local", await f.token(b))).projectId ===
        first.projectId,
      false,
    );
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_project_bindings",
      )).rows[0].count,
      2,
    );
  } finally {
    await f.db.close();
  }
});
test("concurrent actual handler registrations converge to one SQL alias binding without changing owner/qualification", async () => {
  const f = await fixture();
  try {
    const token = await f.token();
    const rows = await Promise.all(
      Array.from({ length: 6 }, () => f.register("same_alias", token)),
    );
    assert.equal(new Set(rows.map((x) => x.projectId)).size, 1);
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_project_bindings",
      )).rows[0].count,
      1,
    );
    assert.equal(
      (await f.db.query(
        "select analytics_consent from public.codevalanche_account_state where user_id=$1",
        [a],
      )).rows[0].analytics_consent,
      false,
    );
  } finally {
    await f.db.close();
  }
});
test("foreign IDs and missing lookups are uniformly404; caller owner/user/flags/path cannot register or mutate bindings", async () => {
  const f = await fixture();
  try {
    const own = await f.register(), other = await f.token(b);
    assert.equal(
      (await f.call("project.binding.get", { projectId: own.projectId }, other))
        .status,
      404,
    );
    assert.equal(
      (await f.call("project.binding.get", {
        projectId: "prj_" + "f".repeat(32),
      }, other)).status,
      404,
    );
    for (
      const body of [
        { localAlias: "new", ownerUserId: a },
        { localAlias: "new", userId: b },
        { localAlias: "new", qualified: true },
        { localAlias: "C:/private/project" },
        { localAlias: "../project" },
        { localAlias: "new", prompt: "private" },
      ]
    ) {
      assert.equal(
        (await f.call("project.binding.register", body, other)).status,
        400,
      );
    }
    assert.ok(
      (await f.call(
        "project.binding.delete",
        { projectId: own.projectId },
        other,
      )).status >= 400,
    );
    assert.equal(
      (await f.call("project.binding.get", {
        projectId: own.projectId,
        localAlias: "cws_local",
      })).status,
      400,
    );
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_project_bindings",
      )).rows[0].count,
      1,
    );
  } finally {
    await f.db.close();
  }
});
test("banned recovery revoked foreign-session and policy drift refuse before any project registration", async () => {
  const f = await fixture();
  try {
    assert.equal(
      (await f.call(
        "project.binding.register",
        { localAlias: "x" },
        await f.token(a, {
          amr: [{ method: "otp", timestamp: Math.floor(Date.now() / 1000) }],
        }),
      )).status,
      403,
    );
    assert.equal(
      (await f.call(
        "project.binding.register",
        { localAlias: "x" },
        await f.token(a, { session_id: sb }),
      )).status,
      401,
    );
    await f.db.query(
      "update auth.users set banned_until=now()+interval '1 hour' where id=$1",
      [a],
    );
    assert.equal(
      (await f.call("project.binding.register", { localAlias: "x" })).status,
      403,
    );
    await f.db.query("update auth.users set banned_until=null where id=$1", [
      a,
    ]);
    await f.db.query(
      "insert into public.codevalanche_revoked_sessions(user_id,session_id) values($1,$2)",
      [a, sa],
    );
    assert.equal(
      (await f.call("project.binding.register", { localAlias: "x" })).status,
      401,
    );
    await f.db.exec("delete from public.codevalanche_revoked_sessions");
    await f.db.query(
      "insert into public.codevalanche_account_state(user_id) values($1)",
      [a],
    );
    f.before = async () => {
      f.before = null;
      await f.db.query(
        "update public.codevalanche_account_state set policy_version=policy_version+1 where user_id=$1",
        [a],
      );
    };
    assert.equal(
      (await f.call("project.binding.register", { localAlias: "x" })).status,
      403,
    );
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_project_bindings",
      )).rows[0].count,
      0,
    );
  } finally {
    await f.db.close();
  }
});
test("customer/service/direct worker table access cannot forge mappings or invoke native ownership shortcut", async () => {
  const f = await fixture();
  try {
    await f.register();
    for (
      const role of [
        "anon",
        "authenticated",
        "service_role",
        "codevalanche_native_ledger_ingest_worker",
      ]
    ) {
      await f.db.exec("set role " + role);
      await assert.rejects(
        () => f.db.query("select * from public.codevalanche_project_bindings"),
        /permission denied/,
      );
      await assert.rejects(
        () => f.db.query("delete from public.codevalanche_project_bindings"),
        /permission denied/,
      );
      if (role !== "service_role") {
        await assert.rejects(
          () =>
            f.db.query(
              "select * from public.codevalanche_project_register($1,$2,1,'forged')",
              [a, sa],
            ),
          /permission denied/,
        );
      }
      if (role !== "codevalanche_native_ledger_ingest_worker") {
        await assert.rejects(() =>
          f.db.query(
            "select * from public.codevalanche_native_project_ownership($1,$2,$3,2,1,1)",
            [a, sa, "prj_" + "f".repeat(32)],
          ), /permission denied/);
      }
      await f.db.exec("reset role");
    }
  } finally {
    await f.db.close();
  }
});
test("dedicated native ownership lookup requires exact owner original session consent generation policy and binding version without qualification", async () => {
  const f = await fixture();
  try {
    const own = await f.register();
    await f.db.query(
      "update public.codevalanche_account_state set analytics_consent=true,consent_generation=2 where user_id=$1",
      [a],
    );
    await f.db.query(
      "insert into public.codevalanche_account_state(user_id,analytics_consent,consent_generation) values($1,true,2)",
      [b],
    );
    await f.db.exec("set role codevalanche_native_ledger_ingest_worker");
    const query = (uid = a, sid = sa, consent = 2, policy = 1, binding = 1) =>
      f.db.query(
        "select * from public.codevalanche_native_project_ownership($1,$2,$3,$4,$5,$6)",
        [uid, sid, own.projectId, consent, policy, binding],
      );
    assert.equal((await query()).rows[0].owned, true);
    assert.equal((await query(b, sb)).rows[0].owned, false);
    for (
      const args of [[a, sb, 2, 1, 1], [a, sa, 1, 1, 1], [a, sa, 2, 2, 1], [
        a,
        sa,
        2,
        1,
        2,
      ]]
    ) assert.equal((await query(...args)).rows[0].owned, false);
    assert.equal(
      (await f.db.query(
        "select * from public.codevalanche_native_project_ownership($1,$2,'cws_legacy',2,1,1)",
        [a, sa],
      )).rows[0].owned,
      false,
    );
    await f.db.exec("reset role");
    await f.db.query(
      "update public.codevalanche_account_state set analytics_consent=false,consent_generation=3 where user_id=$1",
      [a],
    );
    await f.db.exec("set role codevalanche_native_ledger_ingest_worker");
    assert.equal((await query()).rows[0].owned, false);
    await f.db.exec("reset role");
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_native_ledger_producers where qualified",
      )).rows[0].count,
      0,
    );
  } finally {
    await f.db.close();
  }
});
test("account-state erasure cascades binding metadata and does not expose any localfile payload", async () => {
  const f = await fixture();
  try {
    const row = await f.register();
    assert.equal(
      Object.keys(row).some((k) => /path|prompt|code|rootPath/.test(k)),
      false,
    );
    await f.db.query(
      "delete from public.codevalanche_account_state where user_id=$1",
      [a],
    );
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_project_bindings",
      )).rows[0].count,
      0,
    );
    assert.equal(
      (await f.db.query("select count(*) from auth.users")).rows[0].count,
      2,
    );
  } finally {
    await f.db.close();
  }
});
test("SQL actor guard independently refuses spoofed session/recovery/ban and unknown worker state without mutating original receipt provenance", async () => {
  const f = await fixture();
  try {
    const own = await f.register();
    await f.db.exec("set role service_role");
    await assert.rejects(
      () =>
        f.db.query(
          "select * from public.codevalanche_project_register($1,$2,1,'spoofed')",
          [a, sb],
        ),
      /session_revoked/,
    );
    await f.db.exec("reset role");
    await f.db.query("delete from auth.mfa_amr_claims where session_id=$1", [
      sa,
    ]);
    await f.db.exec("set role service_role");
    await assert.rejects(
      () =>
        f.db.query(
          "select * from public.codevalanche_project_lookup($1,$2,1,$3,null)",
          [a, sa, own.projectId],
        ),
      /recovery_restricted/,
    );
    await f.db.exec("reset role");
    await f.db.query(
      "insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,'password')",
      [sa],
    );
    await f.db.query(
      "update auth.users set banned_until=now()+interval '1 day' where id=$1",
      [a],
    );
    await f.db.exec("set role service_role");
    await assert.rejects(
      () =>
        f.db.query(
          "select * from public.codevalanche_project_lookup($1,$2,1,$3,null)",
          [a, sa, own.projectId],
        ),
      /account_suspended/,
    );
    await f.db.exec("reset role");
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_project_bindings",
      )).rows[0].count,
      1,
    );
  } finally {
    await f.db.close();
  }
});
