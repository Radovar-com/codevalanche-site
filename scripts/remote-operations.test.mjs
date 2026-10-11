import test from "node:test";
import assert from "node:assert/strict";
import { createRemoteOperations } from "../src/remote/remoteOperations.js";
const grant = {
  grantId: "11111111-1111-4111-8111-111111111111",
  projectIds: ["cws_one"],
  operations: ["project.list", "conversation.read", "run.stop"],
};
test("encrypted operations adapter never turns a project-scoped grant into another host or project", async () => {
  let calls = 0;
  const relay = {
    close() {},
    connect: async () => {},
    openGrant: async () => {},
    command: async () => {
      calls++;
      return { conversations: [] };
    },
  };
  const ops = createRemoteOperations({
    relay,
    resolveGrant: async () => ({ grant, hostPublicKey: "synthetic" }),
  });
  await ops.grant("host-one", "fingerprint");
  await assert.rejects(
    () =>
      ops.conversations({ hostId: "host-two", projectId: "cws_one", grant }),
    /grant_revoked/,
  );
  await assert.rejects(
    () =>
      ops.conversations({ hostId: "host-one", projectId: "cws_other", grant }),
    /grant_revoked/,
  );
  assert.equal(calls, 0);
});
test("a read started on a previous transport epoch never becomes a current conversation", async () => {
  let release, started;
  const ready = new Promise((r) => (started = r));
  const relay = {
    close() {},
    connect: async () => {},
    openGrant: async () => {},
    command: () =>
      new Promise((resolve) => {
        release = resolve;
        started();
      }),
  };
  const ops = createRemoteOperations({
    relay,
    resolveGrant: async () => ({ grant, hostPublicKey: "synthetic" }),
  });
  await ops.grant("host-one", "fingerprint");
  const pending = ops.readConversation({
    hostId: "host-one",
    projectId: "cws_one",
    grant,
    conversationId: "one",
  });
  await ready;
  ops.clear();
  release({ messages: [{ text: "old" }] });
  await assert.rejects(() => pending, /account_request_superseded/);
});
test("mutating grant after selection cannot broaden encrypted operation scope", async () => {
  const selected = structuredClone(grant);
  const relay = {
    close() {},
    connect: async () => {},
    openGrant: async () => {},
    command: async () => ({ conversations: [] }),
  };
  const ops = createRemoteOperations({
    relay,
    resolveGrant: async () => ({ grant: selected, hostPublicKey: "synthetic" }),
  });
  await ops.grant("host-one", "fingerprint");
  selected.projectIds.push("outside");
  await assert.rejects(
    () =>
      ops.conversations({
        hostId: "host-one",
        projectId: "outside",
        grant: selected,
      }),
    /grant_revoked/,
  );
});
