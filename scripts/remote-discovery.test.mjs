import test from "node:test";
import assert from "node:assert/strict";
import { validateDiscovery } from "../src/remote/discovery.js";
const uid = "11111111-1111-4111-8111-111111111111",
  cid = "22222222-2222-4222-8222-222222222222",
  hid = "33333333-3333-4333-8333-333333333333",
  context = {
    principal: { userId: uid },
    controllerId: cid,
    fingerprint: "a".repeat(64),
  };
const dto = () => ({
  ownerUserId: uid,
  controllerId: cid,
  controllerKeyFingerprint: context.fingerprint,
  policyVersion: 1,
  coverage: { status: "complete" },
  hosts: [
    {
      hostId: hid,
      hostKeyFingerprint: "b".repeat(64),
      remoteEnabled: true,
      presence: { online: true },
      approvedGrants: [],
    },
  ],
});
test("discovery refuses missing owner and cross-account/controller/key correlation", () => {
  for (const change of [
    { ownerUserId: undefined },
    { ownerUserId: cid },
    { controllerId: hid },
    { controllerKeyFingerprint: "c".repeat(64) },
  ])
    assert.throws(
      () => validateDiscovery({ ...dto(), ...change }, context),
      /source_binding_unavailable/,
    );
});
test("online discovery without a server grant never becomes approval", () => {
  const result = validateDiscovery(dto(), context);
  assert.deepEqual(result.hosts[0].approvedGrants, []);
  assert.equal(result.hosts[0].presence.online, true);
  const mutable = dto();
  const snapshot = validateDiscovery(mutable, context);
  mutable.hosts[0].hostId = uid;
  assert.equal(snapshot.hosts[0].hostId, hid);
});
