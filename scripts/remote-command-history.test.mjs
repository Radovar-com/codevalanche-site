import test from "node:test";
import assert from "node:assert/strict";
import { createBrowserRelay } from "../src/remote/browserRelay.js";
import { grantBindingBytes } from "../src/remote/vendor/channelSdk.js";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
  hex = (x) => Buffer.from(x).toString("hex"),
  digest = async (x) => hex(await crypto.subtle.digest("SHA-256", x));
async function fixture(maxCommandHistory = 1024) {
  async function key() {
    const keyPair = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        false,
        ["deriveBits"],
      ),
      bytes = await crypto.subtle.exportKey("raw", keyPair.publicKey);
    return { keyPair, publicKey: hex(bytes), fingerprint: await digest(bytes) };
  }
  const c = await key(),
    h = await key(),
    frames = [];
  const grant = {
    grantId: id(5),
    ownerUserId: id(1),
    hostId: id(4),
    controllerId: id(2),
    projectIds: ["project"],
    operations: ["conversation.read", "run.stop"],
    allowedNativeProfiles: [],
    projectBindingVersions: { project: 1 },
    nativeCatalogDigest: null,
    policyVersion: 1,
    grantVersion: 1,
    expiresAt: new Date(Date.now() + 120000).toISOString(),
    hostKeyFingerprint: h.fingerprint,
    controllerKeyFingerprint: c.fingerprint,
  };
  const session = {
    version: 1,
    channelSessionId: id(6),
    serverInstanceId: id(9),
    ownerUserId: id(1),
    hostId: id(4),
    controllerId: id(2),
    grantId: id(5),
    hostConnectionId: id(7),
    controllerConnectionId: id(3),
    grantVersion: 1,
    policyVersion: 1,
    generation: 1,
    grantDigest: await digest(grantBindingBytes(grant)),
    hostKeyFingerprint: h.fingerprint,
    controllerKeyFingerprint: c.fingerprint,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  };
  class Socket {
    readyState = 1;
    constructor() {
      queueMicrotask(() => this.onopen?.());
    }
    close() {
      this.readyState = 3;
    }
    send(raw) {
      const f = JSON.parse(raw);
      frames.push(f);
      if (f.type === "authenticate")
        queueMicrotask(() =>
          this.onmessage?.({
            data: JSON.stringify({
              type: "ready",
              deviceId: id(2),
              role: "controller",
              connectionId: id(3),
              serverInstanceId: id(9),
              channelProtocolVersion: 1,
            }),
          }),
        );
      if (f.type === "channel.open")
        queueMicrotask(() =>
          this.onmessage?.({
            data: JSON.stringify({
              type: "channel.session",
              requestId: f.requestId,
              session,
            }),
          }),
        );
    }
  }
  const controller = {
    context: () => ({
      principal: { userId: id(1), sessionId: id(10) },
      controllerId: id(2),
      fingerprint: c.fingerprint,
      keyPair: c.keyPair,
      csrfToken: "csrf",
    }),
    ticket: async () => ({ ticket: "a".repeat(64) }),
    proof: async () => ({ challengeId: id(8), response: "b".repeat(64) }),
  };
  const relay = createBrowserRelay({
    controller,
    origin: "https://127.0.0.1:443",
    qualification: true,
    WebSocketImpl: Socket,
    timeoutMs: 15,
    maxCommandHistory,
  });
  const reconnect = async () => {
    await relay.connect();
    await relay.openGrant(grant, h.publicKey);
  };
  await reconnect();
  return { relay, frames, reconnect };
}
const fields = (commandId) => ({
  projectId: "project",
  operation: "run.stop",
  payload: { request: "stop" },
  commandId,
});
test("uncertain command history survives reconnect and retains no result plaintext", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.relay.command(fields(id(30))), /result_unknown/);
    await f.reconnect();
    await assert.rejects(f.relay.command(fields(id(30))), /result_unknown/);
    assert.equal(f.frames.filter((x) => x.type === "command").length, 1);
    const status = f.relay.commandStatus(id(30));
    assert.equal(status.status, "uncertain");
    assert.equal("payload" in status, false);
    assert.equal("result" in status, false);
  } finally {
    f.relay.close();
  }
});
test("known command ID with another payload or operation conflicts without a packet", async () => {
  const f = await fixture();
  try {
    await assert.rejects(f.relay.command(fields(id(31))), /result_unknown/);
    for (const changed of [
      { payload: { request: "other" } },
      { operation: "conversation.read" },
    ])
      await assert.rejects(
        f.relay.command({ ...fields(id(31)), ...changed }),
        /command_identity_conflict/,
      );
    assert.equal(f.frames.filter((x) => x.type === "command").length, 1);
  } finally {
    f.relay.close();
  }
});
test("simultaneous same ID reservations seal once and preserve next packet sequence", async () => {
  const f = await fixture();
  try {
    const results = await Promise.allSettled([
      f.relay.command(fields(id(32))),
      f.relay.command(fields(id(32))),
    ]);
    assert.ok(
      results.every(
        (r) => r.status === "rejected" && r.reason.message === "result_unknown",
      ),
    );
    await assert.rejects(f.relay.command(fields(id(33))), /result_unknown/);
    assert.deepEqual(
      f.frames
        .filter((x) => x.type === "command")
        .map((x) => x.packet.sequence),
      [1, 2],
    );
  } finally {
    f.relay.close();
  }
});
test("history capacity fails closed and never evicts an uncertain command ID", async () => {
  const f = await fixture(2);
  try {
    for (const n of [34, 35])
      await assert.rejects(f.relay.command(fields(id(n))), /result_unknown/);
    await assert.rejects(
      f.relay.command(fields(id(36))),
      /command_history_capacity/,
    );
    await f.reconnect();
    await assert.rejects(f.relay.command(fields(id(34))), /result_unknown/);
    assert.equal(f.frames.filter((x) => x.type === "command").length, 2);
  } finally {
    f.relay.close();
  }
});
test("UUID case aliases cannot release a spent command identity", async () => {
  const f = await fixture();
  try {
    const commandId = "abcdefab-cdef-4abc-8abc-abcdefabcdef";
    await assert.rejects(f.relay.command(fields(commandId)), /result_unknown/);
    await assert.rejects(
      f.relay.command(fields(commandId.toUpperCase())),
      /result_unknown/,
    );
    assert.equal(f.frames.filter((x) => x.type === "command").length, 1);
    assert.equal(
      f.relay.commandStatus(commandId.toUpperCase()).commandId,
      commandId,
    );
  } finally {
    f.relay.close();
  }
});
