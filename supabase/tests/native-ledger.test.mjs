import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  exportJWK,
  generateKeyPair,
  importJWK,
  jwtVerify,
  SignJWT,
} from "jose";
import { createSqlFixture } from "./sqlHarness.mjs";
import { createNativeLedgerHandler } from "../functions/_shared/nativeLedger.ts";
import { acceptAnalyticsEvent } from "../functions/_shared/analytics.ts";
const uid = "11111111-1111-4111-8111-111111111111",
  sid = "22222222-2222-4222-8222-222222222222";
async function fixture() {
  const db = await createSqlFixture(),
    pair = await generateKeyPair("EdDSA"),
    verificationKey = await exportJWK(pair.publicKey),
    fingerprint = createHash("sha256").update(
      Buffer.from(verificationKey.x, "base64url"),
    ).digest("hex");
  const configuration = {
    qualified: true,
    issuer: "https://native-worker.example.test",
    audience: "codevalanche-native-ledger",
    subject: "qualified-native-worker",
    verificationKey,
  };
  await db.query("insert into auth.users(id) values($1)", [uid]);
  await db.query(
    "insert into auth.sessions(id,user_id,created_at) values($1,$2,now()-interval '1 hour')",
    [sid, uid],
  );
  await db.query(
    "insert into public.codevalanche_account_state(user_id,analytics_consent,consent_generation) values($1,true,2)",
    [uid],
  );
  // Valid new ingest requires account metadata in addition to the manual source fixture.
  // This does not create a physical/native execution proof or auto-qualify the producer.
  await db.query(
    "insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,'password')",
    [sid],
  );
  const project = (await db.query(
    "select * from public.codevalanche_project_register($1,$2,1,'cws_synthetic')",
    [uid, sid],
  )).rows[0];
  await db.query(
    "insert into public.codevalanche_native_ledger_producers(issuer,subject,key_fingerprint,native_generation,qualified) values($1,$2,$3,4,true)",
    [configuration.issuer, configuration.subject, fingerprint],
  );
  const service = {
    rpc: async (name, args) => {
      try {
        await db.exec("set role codevalanche_native_ledger_ingest_worker");
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
      } finally {
        await db.exec("reset role");
      }
    },
  };
  const verifyJwt = async (token, c) =>
    jwtVerify(token, await importJWK(c.verificationKey, "EdDSA"), {
      issuer: c.issuer,
      audience: c.audience,
      algorithms: ["EdDSA"],
      requiredClaims: ["exp", "iat", "sub", "jti"],
    });
  const handler = createNativeLedgerHandler({
    configuration,
    service,
    verifyJwt,
  });
  const receipt = (patch = {}) => ({
    receiptId: crypto.randomUUID(),
    userId: uid,
    sessionId: sid,
    runId: "run_synthetic",
    projectId: project.project_id,
    outcome: "success",
    occurredAt: new Date(Date.now() - 1000).toISOString(),
    consentGeneration: 2,
    nativeGeneration: 4,
    policyVersion: 1,
    ...patch,
  });
  const token = async (r, patch = {}) =>
    new SignJWT({
      role: "native_ledger_worker",
      scope: "analytics:native:ingest",
      ...r,
      ...patch,
    }).setProtectedHeader({ alg: "EdDSA" }).setIssuer(configuration.issuer)
      .setAudience(configuration.audience).setSubject(configuration.subject)
      .setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime("60s").sign(
        pair.privateKey,
      );
  const request = (bearer, r, headers = {}) =>
    new Request(
      "https://site.example.test/functions/v1/account-native-ledger",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${bearer}`,
          "Content-Type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          apiVersion: 2,
          action: "analytics.native.ingest",
          requestId: "correlated",
          request: r,
        }),
      },
    );
  return {
    db,
    configuration,
    service,
    verifyJwt,
    handler,
    receipt,
    token,
    request,
    pair,
  };
}
test("actual signed machine receipt is accepted once; exact retry deduplicates and conflicting receipt/run cannot promote metrics twice", async () => {
  const f = await fixture();
  try {
    const r = f.receipt(), t = await f.token(r);
    for (let i = 0; i < 2; i++) {
      const response = await f.handler(f.request(t, r));
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.duplicate, i === 1);
    }
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_native_ledger_receipts",
      )).rows[0].count,
      1,
    );
    const other = { ...r, receiptId: crypto.randomUUID() };
    assert.equal(
      (await f.handler(f.request(await f.token(other), other))).status,
      409,
    );
    const changed = { ...r, outcome: "failed" };
    assert.equal(
      (await f.handler(f.request(await f.token(changed), changed))).status,
      409,
    );
  } finally {
    await f.db.close();
  }
});
test("client/native labels never qualify receipts and successful failed cancelled metrics use only signed final outcomes", async () => {
  const f = await fixture();
  try {
    const service = {
      rpc: async (name, args) => {
        const keys = Object.keys(args);
        return {
          data: (await f.db.query(
            `select * from public.${name}(${
              keys.map((k, i) => `${k}=>$${i + 1}`).join(",")
            })`,
            keys.map((k) => args[k]),
          )).rows,
          error: null,
        };
      },
    };
    await acceptAnalyticsEvent(
      { userId: uid },
      {
        eventId: crypto.randomUUID(),
        eventName: "run_finished",
        platform: "windows",
        appVersion: "1",
        installationId: crypto.randomUUID(),
        occurredAt: new Date().toISOString(),
        source: "native_ledger",
        outcome: "success",
      },
      2,
      service,
    );
    for (const outcome of ["success", "failed", "cancelled"]) {
      const r = f.receipt({ runId: "run_" + outcome, outcome });
      assert.equal(
        (await f.handler(f.request(await f.token(r), r))).status,
        200,
      );
    }
    const s = (await f.db.query(
      "select * from public.codevalanche_analytics_summary($1,now()-interval '1 day',now()+interval '1 day','UTC')",
      [uid],
    )).rows[0].summary;
    assert.equal(s.successfulRuns, 1);
    assert.equal(s.failedRuns, 1);
    assert.equal(s.cancelledRuns, 1);
    assert.equal(s.unconfirmedEvents, 1);
    assert.equal(s.sourceQuality.nativeLedger, "qualified");
    assert.equal(s.nativeReceiptCount, 3);
  } finally {
    await f.db.close();
  }
});
test("missing or unqualified producer refuses ingestion and preserves null unmeasured metrics", async () => {
  const f = await fixture();
  try {
    const r = f.receipt();
    const off = createNativeLedgerHandler({
      configuration: { ...f.configuration, qualified: false },
      service: f.service,
      verifyJwt: f.verifyJwt,
    });
    assert.equal((await off(f.request(await f.token(r), r))).status, 503);
    await f.db.exec(
      "update public.codevalanche_native_ledger_producers set qualified=false",
    );
    assert.equal((await f.handler(f.request(await f.token(r), r))).status, 403);
    const s = (await f.db.query(
      "select * from public.codevalanche_analytics_summary($1,now()-interval '1 day',now()+interval '1 day','UTC')",
      [uid],
    )).rows[0].summary;
    assert.equal(s.successfulRuns, null);
    assert.equal(s.failedRuns, null);
    assert.equal(s.cancelledRuns, null);
  } finally {
    await f.db.close();
  }
});
test("current consent native generation policy suspension deletion Auth ban and session withdrawal each fence the receipt", async () => {
  const f = await fixture();
  try {
    const r = f.receipt(), t = await f.token(r);
    for (
      const mutate of [
        "update public.codevalanche_account_state set analytics_consent=false",
        "update public.codevalanche_account_state set consent_generation=3",
        "update public.codevalanche_account_state set policy_version=2",
        "update public.codevalanche_account_state set status='suspended'",
        "update public.codevalanche_account_state set status='deletion_pending'",
        "update public.codevalanche_account_state set blocked=true",
        "update public.codevalanche_native_ledger_producers set native_generation=5",
        "update auth.users set banned_until=now()+interval '1 hour'",
        "update auth.sessions set not_after=now()-interval '1 second'",
      ]
    ) {
      await f.db.exec("begin");
      await f.db.exec(mutate);
      assert.equal((await f.handler(f.request(t, r))).status, 403, mutate);
      await f.db.exec("rollback");
    }
    await f.db.query(
      "insert into public.codevalanche_revoked_sessions(user_id,session_id) values($1,$2)",
      [uid, sid],
    );
    assert.equal((await f.handler(f.request(t, r))).status, 403);
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_native_ledger_receipts",
      )).rows[0].count,
      0,
    );
  } finally {
    await f.db.close();
  }
});
test("ordinary user JWT wrong binding cookie origin paths and extra private fields refuse before SQL", async () => {
  const f = await fixture();
  try {
    const r = f.receipt();
    assert.equal(
      (await f.handler(
        f.request(await f.token(r, { role: "authenticated" }), r),
      )).status,
      401,
    );
    assert.equal(
      (await f.handler(f.request(await f.token(r), { ...r, sessionId: uid })))
        .status,
      403,
    );
    for (
      const headers of [{ Origin: "https://site.example.test" }, {
        Cookie: "session=synthetic",
      }]
    ) {
      assert.equal(
        (await f.handler(f.request(await f.token(r), r, headers))).status,
        401,
      );
    }
    for (
      const invalid of [{ ...r, projectId: "C:/private/project" }, {
        ...r,
        prompt: "private",
      }, { ...r, outcome: "unknown" }]
    ) {
      assert.equal(
        (await f.handler(f.request(await f.token(invalid), invalid))).status,
        400,
      );
    }
  } finally {
    await f.db.close();
  }
});
test("dedicated non-superuser RPC capability cannot read receipts Auth keys or qualify producers; public/service/admin worker roles cannot ingest", async () => {
  const f = await fixture();
  try {
    await f.db.exec("set role codevalanche_native_ledger_ingest_worker");
    assert.equal(
      (await f.db.query("select public.codevalanche_worker_capability() role"))
        .rows[0].role,
      "codevalanche_native_ledger_ingest_worker",
    );
    for (
      const table of [
        "auth.users",
        "public.codevalanche_native_ledger_receipts",
        "public.codevalanche_native_ledger_producers",
      ]
    ) {
      await assert.rejects(
        () => f.db.query("select * from " + table),
        /permission denied/,
      );
    }
    await f.db.exec("reset role");
    for (
      const role of [
        "anon",
        "authenticated",
        "service_role",
        "codevalanche_notification_worker",
        "codevalanche_security_import_worker",
      ]
    ) {
      await f.db.exec("set role " + role);
      await assert.rejects(
        () =>
          f.db.query(
            "select * from public.codevalanche_ingest_native_ledger('{}'::jsonb,'issuer','subject','fingerprint',now())",
          ),
        /permission denied/,
      );
      await f.db.exec("reset role");
    }
  } finally {
    await f.db.close();
  }
});
test("receipt account cleanup cascades and retention removes old verified metadata", async () => {
  const f = await fixture();
  try {
    const r = f.receipt();
    assert.equal((await f.handler(f.request(await f.token(r), r))).status, 200);
    await f.db.exec(
      "update public.codevalanche_native_ledger_receipts set occurred_at=now()-interval '91 days'",
    );
    await f.db.query("select public.codevalanche_analytics_retention()");
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_native_ledger_receipts",
      )).rows[0].count,
      0,
    );
    const next = f.receipt({ runId: "run_next" });
    assert.equal(
      (await f.handler(f.request(await f.token(next), next))).status,
      200,
    );
    await f.db.exec("delete from public.codevalanche_account_state");
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_native_ledger_receipts",
      )).rows[0].count,
      0,
    );
  } finally {
    await f.db.close();
  }
});
test("actual signature verification rejects wrong issuer audience subject and signing key; public key configuration never accepts private material", async () => {
  const f = await fixture();
  try {
    const r = f.receipt();
    for (
      const patch of [{ iss: "https://other.example.test" }, { aud: "other" }, {
        sub: "other-worker",
      }]
    ) {
      const good = await f.token(r);
      const claims = (await f.verifyJwt(good, f.configuration)).payload;
      const bad = await new SignJWT({ ...claims, ...patch }).setProtectedHeader(
        { alg: "EdDSA" },
      ).sign(f.pair.privateKey);
      assert.equal((await f.handler(f.request(bad, r))).status, 401);
    }
    const wrongPair = await generateKeyPair("EdDSA");
    const claims =
      (await f.verifyJwt(await f.token(r), f.configuration)).payload;
    const wrongKey = await new SignJWT(claims).setProtectedHeader({
      alg: "EdDSA",
    }).sign(wrongPair.privateKey);
    assert.equal((await f.handler(f.request(wrongKey, r))).status, 401);
    const privateConfig = createNativeLedgerHandler({
      configuration: {
        ...f.configuration,
        verificationKey: { ...f.configuration.verificationKey, d: "" },
      },
      service: f.service,
      verifyJwt: f.verifyJwt,
    });
    assert.equal(
      (await privateConfig(f.request(await f.token(r), r))).status,
      503,
    );
  } finally {
    await f.db.close();
  }
});
test("expiry after verification or while waiting for SQL cannot store a qualified receipt", async () => {
  const f = await fixture();
  try {
    const r = f.receipt(), t = await f.token(r);
    let clock = Date.now(), calls = 0;
    const handler = createNativeLedgerHandler({
      configuration: f.configuration,
      service: {
        rpc: async () => {
          calls++;
          throw Error("unexpected SQL");
        },
      },
      verifyJwt: async (...args) => {
        const result = await f.verifyJwt(...args);
        clock = (result.payload.exp + 1) * 1000;
        return result;
      },
      now: () => clock,
    });
    assert.equal((await handler(f.request(t, r))).status, 401);
    assert.equal(calls, 0);
    await f.db.exec("set role codevalanche_native_ledger_ingest_worker");
    const rows = await f.db.query(
      "select * from public.codevalanche_ingest_native_ledger($1,$2,$3,$4,now()-interval '1 second')",
      [
        r,
        f.configuration.issuer,
        f.configuration.subject,
        createHash("sha256").update(
          Buffer.from(f.configuration.verificationKey.x, "base64url"),
        ).digest("hex"),
      ],
    );
    assert.equal(rows.rows[0].accepted, false);
    await f.db.exec("reset role");
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_native_ledger_receipts",
      )).rows[0].count,
      0,
    );
  } finally {
    await f.db.close();
  }
});
test("native receipt worker uses only public API and dedicated role token, without Auth admin or service-role fallback", async () => {
  const { createScopedWorkerService } = await import(
    "../functions/_shared/workerDatabase.ts"
  );
  const read = [], created = [];
  const service = createScopedWorkerService("nativeLedger", {
    env: (name) => {
      read.push(name);
      return {
        SUPABASE_URL: "https://synthetic.supabase.co",
        SUPABASE_PUBLISHABLE_KEY: "public",
        ACCOUNT_NATIVE_LEDGER_DATABASE_TOKEN: "synthetic-native-role-token",
      }[name];
    },
    createClient: (url, key, options) => {
      created.push({ key, options });
      return {
        rpc: async (name) => ({
          data: name === "codevalanche_worker_capability"
            ? "codevalanche_native_ledger_ingest_worker"
            : [],
          error: null,
        }),
      };
    },
  });
  await service.rpc("codevalanche_ingest_native_ledger", {});
  assert.equal(created[0].key, "public");
  assert.equal(
    created[0].options.global.headers.Authorization,
    "Bearer synthetic-native-role-token",
  );
  assert.equal(service.auth, undefined);
  assert.equal(
    read.some((k) =>
      k.includes("AUTH_ADMIN") || k === "SUPABASE_SERVICE_ROLE_KEY"
    ),
    false,
  );
});
test("verified summary aggregates the full filtered population beyond1000 receipts and includes native activity days", async () => {
  const f = await fixture();
  try {
    await f.db.query(
      "insert into public.codevalanche_native_ledger_receipts(receipt_id,user_id,session_id,run_id,project_id,outcome,occurred_at,consent_generation,native_generation,policy_version,issuer,subject,key_fingerprint,binding) select gen_random_uuid(),$1,$2,'run_'||n,'cws_synthetic',case n%3 when 0 then 'success' when 1 then 'failed' else 'cancelled' end,'2026-10-11T09:00:00Z',2,4,1,$3,$4,$5,'{}'::jsonb from generate_series(1,1100) n",
      [
        uid,
        sid,
        f.configuration.issuer,
        f.configuration.subject,
        createHash("sha256").update(
          Buffer.from(f.configuration.verificationKey.x, "base64url"),
        ).digest("hex"),
      ],
    );
    const s = (await f.db.query(
      "select * from public.codevalanche_analytics_summary($1,'2026-10-11T08:00:00Z','2026-10-11T10:00:00Z','Europe/Bucharest')",
      [uid],
    )).rows[0].summary;
    assert.equal(s.nativeReceiptCount, 1100);
    assert.equal(s.successfulRuns, 366);
    assert.equal(s.failedRuns, 367);
    assert.equal(s.cancelledRuns, 367);
    assert.equal(s.activeDays, 1);
    assert.ok(s.lastMeaningfulActivity);
    const otherWindow = (await f.db.query(
      "select * from public.codevalanche_analytics_summary($1,'2026-10-01T00:00:00Z','2026-10-02T00:00:00Z','UTC')",
      [uid],
    )).rows[0].summary;
    assert.equal(otherWindow.nativeReceiptCount, 0);
    assert.equal(otherWindow.activeDays, 0);
  } finally {
    await f.db.close();
  }
});
