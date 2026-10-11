import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import { createSqlFixture } from "./sqlHarness.mjs";
const owner = "11111111-1111-4111-8111-111111111111",
  hostId = "22222222-2222-4222-8222-222222222222",
  controllerId = "33333333-3333-4333-8333-333333333333",
  other = "44444444-4444-4444-8444-444444444444",
  otherSid = "55555555-5555-4555-8555-555555555555";
const issuer = "https://example.supabase.co/auth/v1";
async function fixture() {
  const db = await createSqlFixture(), key = randomBytes(32);
  const now = Math.floor(Date.now() / 1000),
    mfa = new Date((now - 600) * 1000).toISOString();
  await db.query(
    "insert into auth.users(id,email_confirmed_at) values($1,now()),($2,now())",
    [owner, other],
  );
  await db.query(
    "insert into auth.sessions(id,user_id,created_at) values($1,$2,now()-interval '1 hour'),($3,$2,now()-interval '1 hour'),($4,$5,now()-interval '1 hour')",
    [hostId, owner, controllerId, otherSid, other],
  );
  await db.query(
    "insert into auth.mfa_amr_claims(session_id,authentication_method,created_at) values($1,'password',now()-interval '1 hour'),($2,'password',now()-interval '1 hour'),($3,'password',now()-interval '1 hour')",
    [hostId, controllerId, otherSid],
  );
  await db.query(
    "insert into auth.mfa_factors(id,user_id,status,factor_type) values(gen_random_uuid(),$1,'verified','totp'),(gen_random_uuid(),$2,'verified','totp')",
    [owner, other],
  );
  await db.query(
    "update public.codevalanche_account_state set credential_changed_at=now()-interval '1 day',remote_enabled=true,max_hosts=3,max_controllers=5,max_concurrent_runs=2",
  );
  const trace = [];
  let beforeSql, afterAuth;
  const service = {
    auth: {
      getUser: async (token) => {
        trace.push("getUser");
        try {
          const { payload } = await jwtVerify(token, key, {
            issuer,
            audience: "authenticated",
            algorithms: ["HS256"],
          });
          const user = (await db.query("select * from auth.users where id=$1", [
            payload.sub,
          ])).rows[0];
          await afterAuth?.(payload);
          return { data: { user }, error: null };
        } catch {
          return { data: { user: null }, error: { status: 401 } };
        }
      },
    },
    rpc: async (name, args = {}) => {
      trace.push(name);
      try {
        if (name === "codevalanche_remote_joint_policy") await beforeSql?.();
        return await db.transaction(async (tx) => {
          await tx.exec("set local role service_role");
          const keys = Object.keys(args);
          return {
            data: (await tx.query(
              `select * from public.${name}(${
                keys.map((k, i) => `${k}=>$${i + 1}`).join(",")
              })`,
              keys.map((k) => args[k]),
            )).rows,
            error: null,
          };
        });
      } catch (error) {
        return { data: null, error };
      }
    },
  };
  const token = async (sid = hostId, patch = {}, signingKey = key) =>
    new SignJWT({
      sub: owner,
      session_id: sid,
      aud: "authenticated",
      role: "authenticated",
      aal: "aal2",
      iat: now - 10,
      exp: now + 3600,
      client_id: "approved-private-client",
      amr: [{ method: "password", timestamp: now - 3600 }, {
        method: "totp",
        timestamp: now - 600,
      }],
      ...patch,
    }).setIssuer(patch.iss ?? issuer).setProtectedHeader({ alg: "HS256" }).sign(
      signingKey,
    );
  const body = async (extra = {}) => ({
    apiVersion: 2,
    action: "remote.policy.joint",
    requestId: crypto.randomUUID(),
    host: {
      userId: owner,
      sessionId: hostId,
      clientId: "approved-private-client",
    },
    controller: {
      userId: owner,
      sessionId: controllerId,
      clientId: "approved-private-client",
    },
    controllerAccessToken: await token(controllerId),
    ...extra,
  });
  const request = async (extra = {}, headers = {}, hostToken) =>
    new Request(
      "https://example.supabase.co/functions/v1/account-remote-joint",
      {
        method: "POST",
        headers: {
          Authorization: "Bearer " + (hostToken ?? await token()),
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify(await body(extra)),
      },
    );
  const handler = async (enabled = true) => {
    const module = await import("../functions/_shared/remoteJointPolicy.ts");
    return module.createRemoteJointPolicyHandler({
      service,
      issuer,
      clientIds: ["approved-private-client"],
      enabled,
    });
  };
  const sqlArgs = () => ({
    p_user_id: owner,
    p_snapshot_id: crypto.randomUUID(),
    p_host_session_id: hostId,
    p_host_client_id: "approved-private-client",
    p_host_aal: "aal2",
    p_host_mfa_verified_at: mfa,
    p_host_expires_at: new Date((now + 3600) * 1000).toISOString(),
    p_controller_session_id: controllerId,
    p_controller_client_id: "approved-private-client",
    p_controller_aal: "aal2",
    p_controller_mfa_verified_at: mfa,
    p_controller_expires_at: new Date((now + 3600) * 1000).toISOString(),
  });
  return {
    db,
    key,
    service,
    trace,
    token,
    body,
    request,
    handler,
    sqlArgs,
    setBeforeSql: (fn) => beforeSql = fn,
    setAfterAuth: (fn) => afterAuth = fn,
    close: () => db.close(),
  };
}
test("one real SQL statement returns both current original-session canonical states under a shared snapshot", async () => {
  const f = await fixture();
  try {
    const result = await f.service.rpc(
      "codevalanche_remote_joint_policy",
      f.sqlArgs(),
    );
    assert.equal(
      result.error,
      null,
      "joint SQL producer must exist and execute",
    );
    assert.equal(result.data.length, 1);
    assert.equal(result.data[0].qualified, true);
    const s = result.data[0].snapshot;
    assert.equal(s.source, "site_auth_sql_snapshot");
    assert.match(s.snapshotId, /^[0-9a-f-]{36}$/);
    assert.equal(s.host.principal.sessionId, hostId);
    assert.equal(s.controller.principal.sessionId, controllerId);
    assert.equal(s.host.mfaCurrent, true);
    assert.equal(s.controller.mfaCurrent, true);
    assert.equal(
      s.host.policy.policyVersion,
      s.controller.policy.policyVersion,
    );
    assert.equal(s.host.principal.clientId, "approved-private-client");
  } finally {
    await f.close();
  }
});
test("actual signed host and controller tokens yield correlated v2 joint evidence and SQL is the final authorization await", async () => {
  const f = await fixture();
  try {
    const h = await f.handler();
    const req = await f.request(), input = await req.clone().json();
    const r = await h(req);
    assert.equal(r.status, 200);
    const b = await r.json();
    assert.equal(b.requestId, input.requestId);
    assert.deepEqual(Object.keys(b.data).sort(), [
      "controller",
      "host",
      "snapshotId",
      "source",
    ]);
    assert.equal(b.data.host.principal.userId, owner);
    assert.equal(b.data.controller.principal.sessionId, controllerId);
    assert.equal(f.trace.at(-1), "codevalanche_remote_joint_policy");
    assert.equal(f.trace.filter((x) => x === "getUser").length, 2);
    assert.ok(!JSON.stringify(b).includes(input.controllerAccessToken));
    assert.equal(b.data.host.mfaCurrent, true);
  } finally {
    await f.close();
  }
});
test("joint producer stays unavailable by default without explicit real deployment qualification", async () => {
  const f = await fixture();
  try {
    const h = await f.handler(false);
    assert.equal((await h(await f.request())).status, 503);
    assert.equal(f.trace.length, 0);
  } finally {
    await f.close();
  }
});
test("signature invalidity mixed owners swapped original SIDs and mismatched clients cannot yield a joint point", async () => {
  const f = await fixture();
  try {
    const h = await f.handler();
    for (
      const token of [
        await f.token(controllerId, {}, randomBytes(32)),
        await f.token(otherSid, { sub: other }),
        await f.token(hostId),
        await f.token(controllerId, { client_id: "foreign-client" }),
      ]
    ) {
      assert.ok(
        (await h(await f.request({ controllerAccessToken: token }))).status >=
          400,
      );
    }
    assert.equal(
      (await h(
        await f.request({
          controller: {
            userId: owner,
            sessionId: controllerId,
            clientId: null,
          },
        }),
      )).status,
      403,
    );
  } finally {
    await f.close();
  }
});
test("strict fixed server endpoint rejects browser cookies queries oversized tokens caller assurance and invalid correlation nonce", async () => {
  const f = await fixture();
  try {
    const h = await f.handler();
    for (
      const extra of [
        { qualified: true },
        { sessionActive: true },
        { requestId: "bad nonce" },
        { requestId: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
        { nonce: crypto.randomUUID() },
        { controllerAccessToken: "x".repeat(12001) },
      ]
    ) assert.equal((await h(await f.request(extra))).status, 400);
    for (
      const header of [{ Origin: "https://browser.example.invalid" }, {
        Cookie: "session=private",
      }]
    ) assert.equal((await h(await f.request({}, header))).status, 403);
    const req = await f.request();
    assert.equal(
      (await h(new Request(req.url + "?token=ignored", req))).status,
      400,
    );
  } finally {
    await f.close();
  }
});
test("late withdrawal between earlier Auth awaits and final joint SQL denies either session and new recovery credential factor ban or policy loss", async () => {
  for (
    const kind of [
      "host-revoked",
      "controller-revoked",
      "host-expired",
      "controller-deleted",
      "new-recovery",
      "credential",
      "factor",
      "ban",
      "blocked",
      "deleted",
      "disabled-remote",
      "disabled-trigger",
    ]
  ) {
    const f = await fixture();
    try {
      f.setBeforeSql(async () => {
        f.setBeforeSql(null);
        if (kind.endsWith("revoked")) {
          await f.db.query(
            "insert into public.codevalanche_revoked_sessions(user_id,session_id) values($1,$2)",
            [owner, kind === "host-revoked" ? hostId : controllerId],
          );
        }
        if (kind === "host-expired") {
          await f.db.query(
            "update auth.sessions set not_after=now()-interval '1 second' where id=$1",
            [hostId],
          );
        }
        if (kind === "controller-deleted") {
          await f.db.query("delete from auth.sessions where id=$1", [
            controllerId,
          ]);
        }
        if (kind === "new-recovery") {
          await f.db.query(
            "insert into auth.mfa_amr_claims(session_id,authentication_method,created_at) values($1,'otp',now())",
            [controllerId],
          );
        }
        if (kind === "credential") {
          await f.db.query(
            "update public.codevalanche_account_state set credential_changed_at=now(),policy_version=policy_version+1 where user_id=$1",
            [owner],
          );
        }
        if (kind === "factor") {
          await f.db.query("delete from auth.mfa_factors where user_id=$1", [
            owner,
          ]);
        }
        if (kind === "ban") {
          await f.db.query(
            "update auth.users set banned_until=now()+interval '1 hour' where id=$1",
            [owner],
          );
        }
        if (kind === "blocked") {
          await f.db.query(
            "update public.codevalanche_account_state set blocked=true where user_id=$1",
            [owner],
          );
        }
        if (kind === "deleted") {
          await f.db.query(
            "delete from public.codevalanche_account_state where user_id=$1",
            [owner],
          );
        }
        if (kind === "disabled-remote") {
          await f.db.query(
            "update public.codevalanche_account_state set remote_enabled=false where user_id=$1",
            [owner],
          );
        }
        if (kind === "disabled-trigger") {
          await f.db.exec(
            "alter table auth.users disable trigger codevalanche_password_stamp",
          );
        }
      });
      const h = await f.handler();
      const r = await h(await f.request());
      assert.equal(r.status, kind === "disabled-trigger" ? 503 : 403, kind);
      assert.equal((await r.json()).ok, false);
    } finally {
      await f.close();
    }
  }
});
test("server-only SQL function cannot accept caller invented MFA arguments through public or worker roles", async () => {
  const f = await fixture();
  try {
    for (
      const role of [
        "anon",
        "authenticated",
        "codevalanche_native_ledger_ingest_worker",
        "codevalanche_operation_worker",
      ]
    ) {
      await f.db.exec("set role " + role);
      try {
        const args = f.sqlArgs(), keys = Object.keys(args);
        await assert.rejects(
          () =>
            f.db.query(
              `select * from public.codevalanche_remote_joint_policy(${
                keys.map((k, i) => `${k}=>$${i + 1}`).join(",")
              })`,
              keys.map((k) => args[k]),
            ),
          /permission denied/,
        );
      } finally {
        await f.db.exec("reset role");
      }
    }
  } finally {
    await f.close();
  }
});
import { createServer, request as httpsRequest } from "node:https";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { stripTypeScriptTypes } from "node:module";
import { createClient } from "@supabase/supabase-js";
async function loopbackTls() {
  const tempRoot = resolve(tmpdir()),
    dir = await mkdtemp(join(tempRoot, "cv-joint-test-"));
  const keyPath = join(dir, "key.pem"), certPath = join(dir, "cert.pem");
  try {
    const r = spawnSync("C:/Program Files/Git/usr/bin/openssl.exe", [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-nodes",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-subj",
      "/CN=127.0.0.1",
      "-addext",
      "subjectAltName=IP:127.0.0.1",
    ], { windowsHide: true });
    if (r.status) throw Error("synthetic_test_tls_generation_failed");
    return { key: await readFile(keyPath), cert: await readFile(certPath) };
  } finally {
    if (
      !resolve(dir).startsWith(tempRoot + sep) ||
      !dir.includes("cv-joint-test-")
    ) throw Error("unsafe_test_temp_path");
    await rm(dir, { recursive: true, force: true });
  }
}
function tlsFetch(cert) {
  return async (input, init) => {
    const req = new Request(input, init);
    const bytes = req.method === "GET" || req.method === "HEAD"
      ? null
      : Buffer.from(await req.arrayBuffer());
    return new Promise((resolve, reject) => {
      const call = httpsRequest(req.url, {
        method: req.method,
        headers: Object.fromEntries(req.headers),
        ca: cert,
      }, (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on(
          "end",
          () =>
            resolve(
              new Response(Buffer.concat(chunks), {
                status: res.statusCode,
                headers: res.headers,
              }),
            ),
        );
      });
      call.on("error", reject);
      if (bytes) call.write(bytes);
      call.end();
    });
  };
}
async function loadJointEntry(serviceFactory, env) {
  const file = new URL(
    "../functions/account-remote-joint/index.ts",
    import.meta.url,
  );
  let source = await readFile(file, "utf8");
  const imports = [
    ...source.matchAll(/^import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"];?/gm),
  ];
  const names = [], values = [];
  for (const match of imports) {
    const module = match[2].startsWith("npm:")
      ? { createClient: serviceFactory }
      : await import(new URL(match[2], file));
    for (
      const name of match[1].split(",").map((s) => s.trim()).filter(Boolean)
    ) {
      names.push(name);
      values.push(module[name]);
    }
    source = source.replace(match[0], "");
  }
  let handler;
  new Function(...names, "Deno", stripTypeScriptTypes(source))(...values, {
    env: { get: (k) => env[k] },
    serve: (h) => handler = h,
  });
  return handler;
}
test("actual Deno entry over local TLS uses maintained Supabase getUser twice with real signed tokens and one actual SQL RPC; live qualification remains external", async () => {
  const f = await fixture(), tls = await loopbackTls();
  let origin, handler;
  const calls = [];
  const server = createServer(tls, async (req, res) => {
    try {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const bytes = Buffer.concat(chunks);
      if (req.url === "/auth/v1/user") {
        calls.push("provider-auth");
        const token = req.headers.authorization?.slice(7);
        const { payload } = await jwtVerify(token, f.key, {
          issuer: origin + "/auth/v1",
          audience: "authenticated",
          algorithms: ["HS256"],
        });
        const user = (await f.db.query("select * from auth.users where id=$1", [
          payload.sub,
        ])).rows[0];
        if (!user) {
          res.writeHead(401, { "content-type": "application/json" }).end(
            JSON.stringify({ message: "invalid token" }),
          );
          return;
        }
        res.writeHead(200, { "content-type": "application/json" }).end(
          JSON.stringify({
            ...user,
            aud: "authenticated",
            role: "authenticated",
            user_metadata: {},
            app_metadata: {},
            identities: [],
          }),
        );
        return;
      }
      if (req.url?.startsWith("/rest/v1/rpc/")) {
        const name = req.url.split("/").at(-1);
        calls.push(name);
        const result = await f.service.rpc(name, JSON.parse(bytes.toString()));
        res.writeHead(result.error ? 503 : 200, {
          "content-type": "application/json",
        }).end(
          JSON.stringify(
            result.error ? { message: "local SQL refusal" } : result.data,
          ),
        );
        return;
      }
      const response = await handler(
        new Request(origin + req.url, {
          method: req.method,
          headers: req.headers,
          body: bytes,
        }),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers)).end(
        Buffer.from(await response.arrayBuffer()),
      );
    } catch {
      res.writeHead(401, { "content-type": "application/json" }).end(
        JSON.stringify({ message: "local verification refused" }),
      );
    }
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    origin = "https://127.0.0.1:" + server.address().port;
    const fetcher = tlsFetch(tls.cert);
    handler = await loadJointEntry(
      (url, key, options) =>
        createClient(url, key, { ...options, global: { fetch: fetcher } }),
      {
        SUPABASE_URL: origin,
        SUPABASE_SERVICE_ROLE_KEY: "synthetic-server-only-test-key",
        ACCOUNT_OAUTH_CLIENT_IDS: "approved-private-client",
        ACCOUNT_REMOTE_JOINT_QUALIFIED: "true",
      },
    );
    const host = await f.token(hostId, { iss: origin + "/auth/v1" }),
      controller = await f.token(controllerId, { iss: origin + "/auth/v1" });
    const body = await f.body({ controllerAccessToken: controller });
    let r = await fetcher(origin + "/functions/v1/account-remote-joint", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + host,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    assert.equal(r.status, 200);
    const result = await r.json();
    assert.equal(result.requestId, body.requestId);
    assert.equal(result.data.host.principal.sessionId, hostId);
    assert.equal(result.data.controller.principal.sessionId, controllerId);
    assert.equal(calls.filter((x) => x === "provider-auth").length, 2);
    assert.equal(calls.at(-1), "codevalanche_remote_joint_policy");
    assert.ok(!JSON.stringify(result).includes(controller));
    f.setBeforeSql(async () => {
      f.setBeforeSql(null);
      await f.db.query(
        "insert into public.codevalanche_revoked_sessions(user_id,session_id) values($1,$2)",
        [owner, hostId],
      );
    });
    r = await fetcher(origin + "/functions/v1/account-remote-joint", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + host,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...body, requestId: crypto.randomUUID() }),
    });
    assert.equal(r.status, 403);
    assert.equal((await r.json()).ok, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await f.close();
  }
});
test("same original session may occupy both expected roles while mismatched actor identities remain forbidden", async () => {
  const f = await fixture();
  try {
    const h = await f.handler();
    const r = await h(
      await f.request({
        controller: {
          userId: owner,
          sessionId: hostId,
          clientId: "approved-private-client",
        },
        controllerAccessToken: await f.token(hostId),
      }),
    );
    assert.equal(r.status, 200);
    const s = (await r.json()).data;
    assert.equal(s.host.principal.sessionId, hostId);
    assert.equal(s.controller.principal.sessionId, hostId);
  } finally {
    await f.close();
  }
});
test("tokens without current MFA or with a newer recovery AMR cannot manufacture current principal assurance", async () => {
  const f = await fixture();
  try {
    const h = await f.handler();
    for (
      const patch of [{ aal: "aal1" }, {
        amr: [{
          method: "password",
          timestamp: Math.floor(Date.now() / 1000) - 600,
        }],
      }, {
        amr: [
          {
            method: "password",
            timestamp: Math.floor(Date.now() / 1000) - 900,
          },
          { method: "totp", timestamp: Math.floor(Date.now() / 1000) - 600 },
          { method: "otp", timestamp: Math.floor(Date.now() / 1000) - 60 },
        ],
      }, { exp: 1 }]
    ) {
      assert.ok(
        (await h(
          await f.request({
            controllerAccessToken: await f.token(controllerId, patch),
          }),
        )).status >= 400,
      );
    }
  } finally {
    await f.close();
  }
});
test("final joint SQL rechecks original token expiry and disabled factor stamp qualification without returning an invented state", async () => {
  const f = await fixture();
  try {
    const args = f.sqlArgs();
    args.p_host_expires_at = new Date(Date.now() - 1000).toISOString();
    let r = await f.service.rpc("codevalanche_remote_joint_policy", args);
    assert.equal(r.error, null);
    assert.equal(r.data[0].snapshot, null);
    await f.db.exec(
      "alter table auth.mfa_factors disable trigger codevalanche_mfa_stamp",
    );
    const h = await f.handler();
    assert.equal((await h(await f.request())).status, 503);
  } finally {
    await f.close();
  }
});
test("valid correlation nonce is preserved on a refused exact-envelope request", async () => {
  const f = await fixture();
  try {
    const h = await f.handler(), requestId = crypto.randomUUID();
    const r = await h(await f.request({ requestId, qualified: true }));
    assert.equal(r.status, 400);
    assert.equal((await r.json()).requestId, requestId);
  } finally {
    await f.close();
  }
});
