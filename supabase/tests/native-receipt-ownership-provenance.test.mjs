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

// Synthetic manually qualified source and test keys; this does not qualify a deployed producer.
async function summary(
  f,
  user = a,
  from = new Date(Date.now() - 30 * 86400000).toISOString(),
  to = new Date(Date.now() + 86400000).toISOString(),
) {
  return (await f.db.query(
    "select * from public.codevalanche_analytics_summary($1,$2,$3,'UTC')",
    [user, from, to],
  )).rows[0].summary;
}
async function markers(f) {
  return (await f.db.query(
    "select * from public.codevalanche_native_receipt_ownership order by receipt_id",
  )).rows;
}
async function raw(f, r) {
  await f.db.query(
    "insert into public.codevalanche_native_ledger_receipts(receipt_id,user_id,session_id,run_id,project_id,outcome,occurred_at,consent_generation,native_generation,policy_version,issuer,subject,key_fingerprint,binding) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
    [
      r.receiptId,
      r.userId,
      r.sessionId,
      r.runId,
      r.projectId,
      r.outcome,
      r.occurredAt,
      r.consentGeneration,
      r.nativeGeneration,
      r.policyVersion,
      f.configuration.issuer,
      f.configuration.subject,
      f.fp,
      r,
    ],
  );
}
test("actual signed handler acceptance writes exactly one immutable matching marker; concurrent exact retries never multiply counters", async () => {
  const f = await fixture();
  try {
    const r = f.receipt();
    assert.equal(Object.keys(r).length, 10);
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => f.call(r)),
    );
    assert.ok(responses.every((x) => x.status === 200));
    const m = await markers(f);
    assert.equal(m.length, 1);
    assert.deepEqual(m[0].receipt_binding, r);
    assert.equal(m[0].owner_user_id, a);
    assert.equal(m[0].project_id, f.own.project_id);
    assert.equal(m[0].binding_version, 1);
    await assert.rejects(
      () =>
        f.db.exec(
          "update public.codevalanche_native_receipt_ownership set binding_version=1",
        ),
      /native_receipt_ownership_immutable/,
    );
    const s = await summary(f);
    assert.equal(s.nativeReceiptCount, 1);
    assert.equal(s.successfulRuns, 1);
    assert.equal(s.unconfirmedNativeReceiptCount, 0);
    assert.equal(s.sourceQuality.nativeLedger, "qualified");
    assert.equal(s.populationCoverage.historicalNativeRelabeled, false);
  } finally {
    await f.close();
  }
});
test("historical raw receipt matching a currently owned project cannot mint acceptance proof on duplicate replay", async () => {
  const f = await fixture();
  try {
    const r = f.receipt();
    await raw(f, r);
    const before = (await f.db.query(
      "select * from public.codevalanche_native_ledger_receipts",
    )).rows;
    assert.equal((await f.call(r)).status, 403);
    assert.equal((await markers(f)).length, 0);
    assert.deepEqual(
      (await f.db.query(
        "select * from public.codevalanche_native_ledger_receipts",
      )).rows,
      before,
    );
    const s = await summary(f);
    assert.equal(s.successfulRuns, 0);
    assert.equal(s.nativeReceiptCount, 0);
    assert.equal(s.unconfirmedNativeReceiptCount, 1);
    assert.equal(
      s.sourceQuality.nativeLedger,
      "qualified_source_no_owned_receipts",
    );
    assert.equal(s.activeDays, 0);
    assert.equal(s.lastMeaningfulActivity, null);
    assert.equal(s.nativeReceiptWatermark, null);
  } finally {
    await f.close();
  }
});
test("acceptance proof survives project metadata removal but new receipts and replay remain fenced by current ownership", async () => {
  const f = await fixture();
  try {
    const r = f.receipt();
    assert.equal((await f.call(r)).status, 200);
    const before = await markers(f);
    await f.db.query(
      "delete from public.codevalanche_project_bindings where project_id=$1",
      [f.own.project_id],
    );
    assert.deepEqual(await markers(f), before);
    assert.equal((await summary(f)).successfulRuns, 1);
    assert.equal((await f.call(r)).status, 403);
    assert.equal((await f.call(f.receipt())).status, 403);
    assert.deepEqual(await markers(f), before);
  } finally {
    await f.close();
  }
});
test("missing or mismatched acceptance snapshot cannot contribute outcomes days or watermarks", async () => {
  const f = await fixture();
  try {
    const r = f.receipt();
    assert.equal((await f.call(r)).status, 200);
    await f.db.query(
      "update public.codevalanche_native_ledger_receipts set outcome='failed' where receipt_id=$1",
      [r.receiptId],
    );
    let s = await summary(f);
    assert.equal(s.nativeReceiptCount, 0);
    assert.equal(s.failedRuns, 0);
    assert.equal(s.activeDays, 0);
    assert.equal(s.watermark, null);
    await f.db.query(
      "update public.codevalanche_native_ledger_receipts set outcome='success' where receipt_id=$1",
      [r.receiptId],
    );
    await f.db.query(
      "delete from public.codevalanche_native_receipt_ownership where receipt_id=$1",
      [r.receiptId],
    );
    assert.equal((await f.call(r)).status, 403);
    assert.equal((await markers(f)).length, 0);
    s = await summary(f);
    assert.equal(s.successfulRuns, 0);
  } finally {
    await f.close();
  }
});
test("all outcome counters and activity fields share exactly the accepted owned account/window population; unqualified native counts stay NULL", async () => {
  const f = await fixture();
  try {
    for (const outcome of ["success", "failed", "cancelled"]) {
      assert.equal((await f.call(f.receipt({ outcome }))).status, 200);
    }
    await raw(
      f,
      f.receipt({
        projectId: "cws_historical",
        outcome: "success",
        occurredAt: "2026-10-01T00:00:00.000Z",
      }),
    );
    await raw(
      f,
      f.receipt({ userId: b, sessionId: sb, projectId: f.foreign.project_id }),
    );
    let s = await summary(f);
    assert.equal(s.nativeReceiptCount, 3);
    assert.equal(s.successfulRuns, 1);
    assert.equal(s.failedRuns, 1);
    assert.equal(s.cancelledRuns, 1);
    assert.equal(s.unconfirmedNativeReceiptCount, 1);
    assert.equal(s.activeDays, 1);
    assert.ok(s.nativeReceiptWatermark);
    assert.ok(s.lastMeaningfulActivity);
    s = await summary(f, a, "2026-10-01", "2026-10-02");
    assert.equal(s.nativeReceiptCount, 0);
    assert.equal(s.unconfirmedNativeReceiptCount, 1);
    assert.equal(s.activeDays, 0);
    assert.equal(s.watermark, null);
    s = await summary(f, b);
    assert.equal(s.nativeReceiptCount, 0);
    assert.equal(s.unconfirmedNativeReceiptCount, 1);
    await f.db.exec(
      "update public.codevalanche_native_ledger_producers set qualified=false",
    );
    s = await summary(f);
    for (
      const key of [
        "successfulRuns",
        "failedRuns",
        "cancelledRuns",
        "nativeReceiptCount",
      ]
    ) assert.equal(s[key], null, key);
    assert.equal(s.sourceQuality.nativeLedger, "unqualified");
  } finally {
    await f.close();
  }
});
test("consumer service and ingest roles cannot read seed mutate or delete acceptance proof directly", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call(f.receipt())).status, 200);
    for (
      const role of [
        "anon",
        "authenticated",
        "service_role",
        "codevalanche_operation_worker",
        "codevalanche_native_ledger_ingest_worker",
      ]
    ) {
      await f.db.exec("set role " + role);
      try {
        for (
          const sql of [
            "select * from public.codevalanche_native_receipt_ownership",
            "insert into public.codevalanche_native_receipt_ownership select * from public.codevalanche_native_receipt_ownership",
            "update public.codevalanche_native_receipt_ownership set owner_user_id=owner_user_id",
            "delete from public.codevalanche_native_receipt_ownership",
            "select * from public.codevalanche_acceptance_owned_native_receipts",
          ]
        ) {
          await assert.rejects(
            () => f.db.exec(sql),
            /permission denied/,
            role + " " + sql,
          );
        }
      } finally {
        await f.db.exec("reset role");
      }
    }
    assert.equal((await markers(f)).length, 1);
  } finally {
    await f.close();
  }
});
test("late session consent policy account erasure expiry and foreign ownership refusals leave no marker or raw acceptance", async () => {
  for (
    const kind of [
      "session",
      "consent",
      "policy",
      "erasure",
      "expiry",
      "foreign",
    ]
  ) {
    const f = await fixture();
    try {
      const r = f.receipt(
        kind === "foreign" ? { projectId: f.foreign.project_id } : {},
      );
      f.setBefore(async () => {
        f.setBefore(null);
        if (kind === "session") {
          await f.db.query(
            "insert into public.codevalanche_revoked_sessions(user_id,session_id) values($1,$2)",
            [a, sa],
          );
        }
        if (kind === "consent") {
          await f.db.query(
            "update public.codevalanche_account_state set analytics_consent=false,consent_generation=3 where user_id=$1",
            [a],
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
      });
      if (kind === "expiry") {
        const rows = await f.db.transaction(async (tx) => {
          await tx.exec(
            "set local role codevalanche_native_ledger_ingest_worker",
          );
          return tx.query(
            "select * from public.codevalanche_ingest_native_ledger($1,$2,$3,$4,now()-interval '1 second')",
            [r, f.configuration.issuer, f.configuration.subject, f.fp],
          );
        });
        assert.equal(rows.rows[0].accepted, false);
      } else assert.equal((await f.call(r)).status, 403, kind);
      assert.equal((await markers(f)).length, 0);
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
test("retention and account erasure cascade acceptance markers with their receipts", async () => {
  const f = await fixture();
  try {
    assert.equal((await f.call(f.receipt())).status, 200);
    await f.db.exec(
      "update public.codevalanche_native_ledger_receipts set occurred_at=now()-interval '91 days'",
    );
    await f.db.query("select public.codevalanche_analytics_retention()");
    assert.equal((await markers(f)).length, 0);
    assert.equal((await f.call(f.receipt())).status, 200);
    await f.db.query(
      "delete from public.codevalanche_account_state where user_id=$1",
      [a],
    );
    assert.equal((await markers(f)).length, 0);
  } finally {
    await f.close();
  }
});
test("failure to persist acceptance proof rolls back the raw receipt in the same transaction", async () => {
  const f = await fixture();
  try {
    const r = f.receipt();
    await f.db.exec(
      "create function public.test_reject_ownership_marker() returns trigger language plpgsql as $$ begin raise exception 'test_marker_persistence_failure'; end $$; create trigger test_reject_ownership_marker before insert on public.codevalanche_native_receipt_ownership for each row execute function public.test_reject_ownership_marker()",
    );
    assert.equal((await f.call(r)).status, 503);
    assert.equal((await markers(f)).length, 0);
    assert.equal(
      (await f.db.query(
        "select count(*) from public.codevalanche_native_ledger_receipts",
      )).rows[0].count,
      0,
    );
    await f.db.exec(
      "drop trigger test_reject_ownership_marker on public.codevalanche_native_receipt_ownership",
    );
    assert.equal((await f.call(r)).status, 200);
    assert.equal((await markers(f)).length, 1);
  } finally {
    await f.close();
  }
});
test("a foreign-owner maintenance-injected marker is excluded and cannot authorize a historical duplicate", async () => {
  const f = await fixture();
  try {
    const r = f.receipt();
    await raw(f, r);
    // Explicit hostile database-owner test seed; no runtime role can perform this write.
    await f.db.query(
      "insert into public.codevalanche_native_receipt_ownership(receipt_id,owner_user_id,project_id,binding_version,issuer,subject,key_fingerprint,receipt_binding) values($1,$2,$3,1,$4,$5,$6,$7)",
      [
        r.receiptId,
        b,
        f.foreign.project_id,
        f.configuration.issuer,
        f.configuration.subject,
        f.fp,
        r,
      ],
    );
    const s = await summary(f);
    assert.equal(s.nativeReceiptCount, 0);
    assert.equal(s.activeDays, 0);
    assert.equal(s.nativeReceiptWatermark, null);
    assert.equal((await f.call(r)).status, 403);
  } finally {
    await f.close();
  }
});
