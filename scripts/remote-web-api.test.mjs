import test from "node:test";
import assert from "node:assert/strict";
import { createWebRemoteApi } from "../src/remote/webRemoteApi.js";
test("published informational presence states map to online, offline or unknown without a grant", async () => {
  const d = {
    ownerUserId: "verified-owner",
    hosts: ["online", "offline", "unknown"].map((state, i) => ({
      hostId: String(i),
      presence: { state, authority: "relay_socket", permission: false },
      approvedGrants: [],
      remoteEnabled: true,
      hostKeyFingerprint: "a".repeat(64),
    })),
  };
  let connects = 0;
  const api = createWebRemoteApi({
    bff: {},
    controller: { discovery: async () => d },
    relay: { close() {}, connect: async () => connects++ },
  });
  const hosts = await api.hosts();
  assert.deepEqual(
    hosts.map((h) => h.online),
    [true, false, null],
  );
  assert.equal(await api.grant("0", "fingerprint"), null);
  assert.equal(connects, 0);
  assert.equal(hosts[0].ownerUserId, "verified-owner");
});
