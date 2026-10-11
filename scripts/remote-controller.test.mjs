import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserController } from "../src/remote/controllerClient.js";
const userId = "11111111-1111-4111-8111-111111111111",
  fp = "a".repeat(64),
  session = {
    principal: { userId, sessionId: "22222222-2222-4222-8222-222222222222" },
    controllerKeyFingerprint: fp,
  };
test("persisted controller identity is rebound by fresh possession proof without creating a grant", async () => {
  const cid = "33333333-3333-4333-8333-333333333333";
  let purpose,
    binds = 0;
  const bff = {
    session: async () => session,
    keyChallenge: async (value) => {
      purpose = value;
      return {};
    },
    bindController: async (id) => {
      binds++;
      return { controllerId: id, controllerKeyFingerprint: fp };
    },
  };
  const controller = createBrowserController({
    saveBinding: async () => {},
    bff,
    loadIdentity: async () => ({ fingerprint: fp, controllerId: cid }),
    solve: async () => ({}),
  });
  await controller.open();
  assert.equal(controller.state().controllerId, cid);
  assert.equal(binds, 1);
  assert.equal(purpose, `browser-bind:${cid}`);
  assert.equal(controller.state().grant, undefined);
});
test("browser enrollment uses actual session fingerprint and never interprets enrollment as a project grant", async () => {
  let purpose;
  const bff = {
    session: async () => session,
    keyChallenge: async (p) => {
      purpose = p;
      return {};
    },
    enrollController: async () => ({
      controllerId: "33333333-3333-4333-8333-333333333333",
      ownerUserId: userId,
      fingerprint: fp,
    }),
  };
  const controller = createBrowserController({
    saveBinding: async () => {},
    bff,
    loadIdentity: async () => ({ fingerprint: fp }),
    solve: async () => ({ challengeId: "synthetic", response: "b".repeat(64) }),
  });
  await controller.open();
  await controller.enroll();
  assert.equal(purpose, "enroll-controller");
  assert.equal(
    controller.state().controllerId,
    "33333333-3333-4333-8333-333333333333",
  );
  assert.equal(controller.state().grant, undefined);
});
test("logout while possession challenge is pending prevents controller enrollment", async () => {
  let release,
    started,
    enrolled = 0;
  const ready = new Promise((resolve) => {
    started = resolve;
  });
  const bff = {
    session: async () => session,
    keyChallenge: () =>
      new Promise((resolve) => {
        release = resolve;
        started();
      }),
    enrollController: async () => {
      enrolled++;
    },
  };
  const controller = createBrowserController({
    saveBinding: async () => {},
    bff,
    loadIdentity: async () => ({ fingerprint: fp }),
    solve: async () => ({}),
  });
  await controller.open();
  const pending = controller.enroll();
  await ready;
  controller.clear();
  release({});
  await assert.rejects(() => pending, /account_request_superseded/);
  assert.equal(enrolled, 0);
});
test("browser ticket possession purpose is exact server audience/kind/origin binding", async () => {
  let purpose;
  const bff = {
    origin: "https://remote.example.test",
    session: async () => ({
      ...session,
      controllerId: "33333333-3333-4333-8333-333333333333",
    }),
    keyChallenge: async (value) => {
      purpose = value;
      return {};
    },
    ticket: async () => ({ ticket: "synthetic", ttlMs: 60000 }),
  };
  const controller = createBrowserController({
    saveBinding: async () => {},
    bff,
    loadIdentity: async () => ({ fingerprint: fp }),
    solve: async () => ({}),
  });
  await controller.open();
  await controller.ticket();
  assert.equal(
    purpose,
    "ticket-issue:local-remote:browser:https://remote.example.test",
  );
});
test("web manual approval requests compare exact host/controller keys without requiring QR", async () => {
  let seen, purpose;
  const bff = {
    session: async () => ({
      ...session,
      controllerId: "33333333-3333-4333-8333-333333333333",
    }),
    keyChallenge: async (value) => {
      purpose = value;
      return {};
    },
    requestManualPairing: async (hostId, proof) => {
      seen = { hostId, proof };
      return {
        pairingRequestId: "44444444-4444-4444-8444-444444444444",
        method: "manual",
        comparisonCode: "123456-ABCDEF",
      };
    },
  };
  const controller = createBrowserController({
    saveBinding: async () => {},
    bff,
    loadIdentity: async () => ({ fingerprint: fp }),
    solve: async () => ({ challengeId: "synthetic", response: "b".repeat(64) }),
  });
  await controller.open();
  const result = await controller.manualPairing(
    "55555555-5555-4555-8555-555555555555",
  );
  assert.equal(result.method, "manual");
  assert.equal(
    purpose,
    "pairing-manual-request:55555555-5555-4555-8555-555555555555:33333333-3333-4333-8333-333333333333",
  );
  assert.equal(seen.hostId, "55555555-5555-4555-8555-555555555555");
});
