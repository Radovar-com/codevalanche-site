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
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  sa = "33333333-3333-4333-8333-333333333333",
  sb = "44444444-4444-4444-8444-444444444444";
async function fixture() {
  const db = await createSqlFixture();
  await db.query("insert into auth.users(id) values($1),($2)", [a, b]);
  await db.query(
    "insert into auth.sessions(id,user_id,created_at) values($1,$2,now()-interval '1 hour'),($3,$4,now()-interval '1 hour')",
    [sa, a, sb, b],
  );
  await db.query(
    "insert into auth.mfa_amr_claims(session_id,authentication_method) values($1,'password'),($2,'password')",
    [sa, sb],
  );
  await db.query(
    "insert into public.codevalanche_account_state(user_id,analytics_consent,consent_generation) values($1,true,2),($2,true,2)",
    [a, b],
  );
  const own = (await db.query(
      "select * from public.codevalanche_project_register($1,$2,1,'cws_local')",
      [a, sa],
    )).rows[0],
    foreign = (await db.query(
      "select * from public.codevalanche_project_register($1,$2,1,'cws_local')",
      [b, sb],
    )).rows[0];
  const pair = await generateKeyPair("EdDSA"),
    verificationKey = await exportJWK(pair.publicKey),
    fp = createHash("sha256").update(
      Buffer.from(verificationKey.x, "base64url"),
    ).digest("hex"),
    configuration = {
      qualified: true,
      issuer: "https://qualified-test.example.invalid",
      audience: "codevalanche-native-ledger",
      subject: "manual-fixture-worker",
      verificationKey,
    };
  await db.query(
    "insert into public.codevalanche_native_ledger_producers(issuer,subject,key_fingerprint,native_generation,qualified) values($1,$2,$3,4,true)",
    [configuration.issuer, configuration.subject, fp],
  );
  let before;
  const service = {
    rpc: async (name, args) => {
      try {
        await before?.();
        return {
          data: await db.transaction(async (tx) => {
            await tx.exec(
              "set local role codevalanche_native_ledger_ingest_worker",
            );
            const keys = Object.keys(args);
            return (await tx.query(
              `select * from public.${name}(${
                keys.map((k, i) => `${k}=>$${i + 1}`).join(",")
              })`,
              keys.map((k) => args[k]),
            )).rows;
          }),
          error: null,
        };
      } catch (error) {
        return { data: null, error };
      }
    },
  };
  const handler = createNativeLedgerHandler({
    configuration,
    service,
    verifyJwt: async (token, c) =>
      jwtVerify(token, await importJWK(c.verificationKey, "EdDSA"), {
        issuer: c.issuer,
        audience: c.audience,
        algorithms: ["EdDSA"],
        requiredClaims: ["exp", "iat", "sub", "jti"],
      }),
  });
  const receipt = (patch = {}) => ({
    receiptId: crypto.randomUUID(),
    userId: a,
    sessionId: sa,
    runId: "run_" + crypto.randomUUID().replaceAll("-", ""),
    projectId: own.project_id,
    outcome: "success",
    occurredAt: new Date().toISOString(),
    consentGeneration: 2,
    nativeGeneration: 4,
    policyVersion: 1,
    ...patch,
  });
  const call = async (r, claimPatch = {}) => {
    const token = await new SignJWT({
      role: "native_ledger_worker",
      scope: "analytics:native:ingest",
      ...r,
      ...claimPatch,
    }).setProtectedHeader({ alg: "EdDSA" }).setIssuer(configuration.issuer)
      .setAudience(configuration.audience).setSubject(configuration.subject)
      .setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime("60s").sign(
        pair.privateKey,
      );
    return handler(
      new Request(
        "https://site.example.invalid/functions/v1/account-native-ledger",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            apiVersion: 2,
            action: "analytics.native.ingest",
            requestId: "owned-guard-test",
            request: r,
          }),
        },
      ),
    );
  };
  return {
    db,
    own,
    foreign,
    receipt,
    call,
    fp,
    configuration,
    setBefore(fn) {
      before = fn;
    },
    close: () => db.close(),
  };
}
test("qualified source still cannot ingest an unbound legacy project ID into verified native counters", async () => {
  const f = await fixture();
  try {
    const r = await f.call(f.receipt({ projectId: "cws_legacy_unowned" }));
    assert.equal(r.status, 403);
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_native_ledger_receipts",
      )).rows[0].count,
      0,
    );
  } finally {
    await f.close();
  }
});
test("registered own metadata plus explicit manuallyqualified producer fixture is accepted exactly once with unchanged10field/JWT binding", async () => {
  const f = await fixture();
  try {
    const r = f.receipt();
    assert.equal(Object.keys(r).length, 10);
    for (let i = 0; i < 2; i++) {
      const response = await f.call(r);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.duplicate, i === 1);
    }
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_native_ledger_receipts",
      )).rows[0].count,
      1,
    );
    assert.equal(
      (await f.call({ ...r, receiptId: crypto.randomUUID() })).status,
      409,
    );
    assert.equal(
      (await f.call(f.receipt(), { projectId: f.foreign.project_id })).status,
      403,
    );
    assert.equal(
      (await f.call({ ...f.receipt(), bindingVersion: 1 })).status,
      400,
    );
  } finally {
    await f.close();
  }
});
test("foreign missing alias-only or erased mapping never accepts a native receipt or owned success counter", async () => {
  const f = await fixture();
  try {
    for (
      const projectId of [
        f.foreign.project_id,
        "prj_" + "f".repeat(32),
        "cws_local",
      ]
    ) assert.equal((await f.call(f.receipt({ projectId }))).status, 403);
    await f.db.query(
      "delete from public.codevalanche_project_bindings where project_id=$1",
      [f.own.project_id],
    );
    assert.equal((await f.call(f.receipt())).status, 403);
    const s = (await f.db.query(
      "select * from public.codevalanche_analytics_summary($1,now()-interval '1 day',now()+interval '1 day','UTC')",
      [a],
    )).rows[0].summary;
    assert.equal(s.nativeReceiptCount, 0);
    assert.equal(s.successfulRuns, 0);
  } finally {
    await f.close();
  }
});
test("current original session consent policy owner erasure and malformed binding version changes after signature before SQL are refused", async () => {
  for (
    const kind of [
      "consent",
      "session",
      "recovery",
      "policy",
      "erasure",
      "version",
    ]
  ) {
    const f = await fixture();
    try {
      f.setBefore(async () => {
        f.setBefore(null);
        if (kind === "consent") {
          await f.db.query(
            "update public.codevalanche_account_state set analytics_consent=false,consent_generation=3 where user_id=$1",
            [a],
          );
        }
        if (kind === "session") {
          await f.db.query(
            "insert into public.codevalanche_revoked_sessions(user_id,session_id) values($1,$2)",
            [a, sa],
          );
        }
        if (kind === "recovery") {
          await f.db.query(
            "delete from auth.mfa_amr_claims where session_id=$1",
            [sa],
          );
        }
        if (kind === "policy") {
          await f.db.query(
            "update public.codevalanche_account_state set policy_version=2 where user_id=$1",
            [a],
          );
        }
        if (kind === "erasure") {
          await f.db.query(
            "delete from public.codevalanche_account_state where user_id=$1",
            [a],
          );
        }
        if (kind === "version") {
          await f.db.exec(
            "alter table public.codevalanche_project_bindings disable trigger codevalanche_project_binding_immutable",
          );
          const check = (await f.db.query(
            "select conname from pg_constraint where conrelid='public.codevalanche_project_bindings'::regclass and contype='c' and pg_get_constraintdef(oid) like '%binding_version%'",
          )).rows[0].conname;
          await f.db.exec(
            "alter table public.codevalanche_project_bindings drop constraint " +
              check,
          );
          await f.db.query(
            "update public.codevalanche_project_bindings set binding_version=2 where project_id=$1",
            [f.own.project_id],
          );
        }
      });
      assert.equal((await f.call(f.receipt())).status, 403, kind);
      assert.equal(
        (await f.db.query(
          "select count(*) from public.codevalanche_native_ledger_receipts",
        )).rows[0].count,
        0,
      );
    } finally {
      await f.close();
    }
  }
});
test("immutable binding cannot be rebound or aliaschanged by a normal maintenance update; actor-scoped alias registration remains stable", async () => {
  const f = await fixture();
  try {
    for (
      const sql of [
        "update public.codevalanche_project_bindings set local_alias='new_alias'",
        "update public.codevalanche_project_bindings set owner_user_id='22222222-2222-4222-8222-222222222222'",
      ]
    ) await assert.rejects(() => f.db.exec(sql), /project_binding_immutable/);
    assert.notEqual(f.own.project_id, f.foreign.project_id);
    assert.equal((await f.call(f.receipt())).status, 200);
  } finally {
    await f.close();
  }
});
test("concurrent duplicate native ingests serialize account/receipt and do not mint another run/source counter", async () => {
  const f = await fixture();
  try {
    const r = f.receipt();
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => f.call(r)),
    );
    assert.ok(responses.every((x) => x.status === 200));
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_native_ledger_receipts",
      )).rows[0].count,
      1,
    );
    const changed = { ...r, receiptId: crypto.randomUUID(), outcome: "failed" };
    assert.equal((await f.call(changed)).status, 409);
  } finally {
    await f.close();
  }
});
test("metadata registration never qualifies producer and the scoped native role remains the only ingest lane", async () => {
  const f = await fixture();
  try {
    await f.db.exec(
      "update public.codevalanche_native_ledger_producers set qualified=false",
    );
    assert.equal((await f.call(f.receipt())).status, 403);
    for (
      const role of [
        "anon",
        "authenticated",
        "service_role",
        "codevalanche_operation_worker",
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
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_native_ledger_receipts",
      )).rows[0].count,
      0,
    );
  } finally {
    await f.close();
  }
});
test("preexisting legacy opaque receipt provenance is untouched and its replay is not retroqualified as owned", async () => {
  const f = await fixture();
  try {
    const old = f.receipt({ projectId: "cws_historical" });
    await f.db.query(
      "insert into public.codevalanche_native_ledger_receipts(receipt_id,user_id,session_id,run_id,project_id,outcome,occurred_at,consent_generation,native_generation,policy_version,issuer,subject,key_fingerprint,binding) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
      [
        old.receiptId,
        old.userId,
        old.sessionId,
        old.runId,
        old.projectId,
        old.outcome,
        old.occurredAt,
        old.consentGeneration,
        old.nativeGeneration,
        old.policyVersion,
        f.configuration.issuer,
        f.configuration.subject,
        f.fp,
        old,
      ],
    );
    const before = (await f.db.query(
      "select * from public.codevalanche_native_ledger_receipts",
    )).rows;
    assert.equal((await f.call(old)).status, 403);
    assert.deepEqual(
      (await f.db.query(
        "select * from public.codevalanche_native_ledger_receipts",
      )).rows,
      before,
    );
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_project_bindings where project_id=$1",
        [old.projectId],
      )).rows[0].count,
      0,
    );
  } finally {
    await f.close();
  }
});
